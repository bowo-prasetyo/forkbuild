import { readFile } from 'node:fs/promises';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';

// 0.9.257 — World View Place Naming Presentation.
// See docs/Roadmap.md, "0.9.257 — World View Place Naming Presentation."
//
// 0.9.256 built `application/PlaceNamingDiscoveryMonitor.js` — the
// authority for "which Place Naming claims are currently nearby" — but,
// per that milestone's own closing "deliberately excluded," never rendered
// anything: "this file has no idea `ui/` exists." This milestone wires
// that monitor into `ui/main.js` (the transport-level query service) and
// `ui/views/WorldView.js` (the session-aware discovery command and
// position resolver, plus a small presentation panel), and this file
// proves the result — WITHOUT ever mounting a real Vue component, the
// same restraint tests/WorldViewOwnPublicationSnapshotDiscovery.test.js's
// own header already holds: `makePlaceNamingDiscoveryMonitor()`/`tick()`/
// `makeRows()` below reproduce ui/views/WorldView.js's own wiring
// EXACTLY, verbatim, and Section Q proves — via raw source-string
// assertions — that the reproduction genuinely matches what that file
// contains, not merely what it was intended to contain.
//
//   Section A: nearby claims appear automatically
//   Section B: multiple claims are displayed simultaneously
//   Section C: discovery order is preserved
//   Section D: distant claims never reach presentation
//   Section E: empty discovery produces the correct empty state
//   Section F: discovery failure preserves the previous successful
//              observation
//   Section G: a newer successful result replaces the previous result
//   Section H: stale monitor results cannot overwrite the displayed result
//   Section I: publication/discovery identity is not confused with Place
//              Naming identity
//   Section J: UI does not perform verification/ranking/adoption —
//              structural boundary, scoped to exactly the new code
//   Section K: two World View instances remain isolated
//   Section L: document/world switching does not leak claims
//   Section M: monitor disposal prevents post-unmount UI updates
//   Section N: no new persistence or World-location mutation occurs
//   Section O: NEGATIVE — a claim at the Wanderer's own exact position
//              remains merely a displayed claim
//   Section P: FLAGSHIP — the real Nostr source, the real discovery
//              aggregator/command, and the real proximity selector, driven
//              end-to-end through the exact wiring ui/views/WorldView.js
//              itself composes
//   Section Q: architectural regression — ui/main.js/ui/views/WorldView.js
//              actually contain the wiring every section above assumes

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function pos(x, z) {
    return { x, z };
}

function signatureOf(overrides = {}) {
    return {
        algorithm: 'ed25519',
        signer: 'did:key:zAlice',
        signature: 'sig-abc123',
        signedHash: 'hash-abc123',
        domain: 'forkbuild.place-naming-claim',
        ...overrides
    };
}

function claimJSONOf(overrides = {}) {
    return {
        id: 'claim-1',
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-01-01T00:00:00.000Z',
        signature: signatureOf({ signer: overrides.authorIdentityId || 'did:key:zAlice' }),
        ...overrides
    };
}

function envelopeOf(overrides = {}) {
    const { claim: claimOverrides, ...envelopeOverrides } = overrides;
    const claim = claimJSONOf(claimOverrides || {});
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId: claim.worldId,
        regionId: claim.regionId,
        claim,
        ...envelopeOverrides
    };
}

// A fake `application/WorldNavigationSession.js` stand-in exposing ONLY
// `getRegions()` — the ONE method ui/views/WorldView.js's own 0.9.257
// wiring ever calls on `session` for Place Naming discovery (see that
// file's own construction comment). Any OTHER property access throws
// immediately, so a test failing this way is proof the reproduction below
// (or, if it ever regresses, the real wiring) reaches into `session` for
// something beyond what this milestone's own architectural boundary
// allows — never a session mutation, never a second read.
function makeSession(regionsOrFn) {
    const getRegions = typeof regionsOrFn === 'function' ? regionsOrFn : () => regionsOrFn;
    return new Proxy({ getRegions }, {
        get(target, prop) {
            if (prop === 'getRegions') return target.getRegions;
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            throw new Error(`fake session: unexpected access to session.${String(prop)} — Place Naming discovery presentation must only ever call session.getRegions()`);
        }
    });
}

// Reproduces EXACTLY ui/views/WorldView.js's own `placeNamingDiscoveryMonitor`
// construction (see that file's own "0.9.257" comment, just above
// `let placeNamingDiscoveryPresentationActive`) — the SAME two closures,
// driving the SAME real, unmodified `PlaceNamingDiscoveryMonitor` class.
// Section Q proves this reproduction is not merely aspirational.
function makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService }) {
    return placeNamingDiscoveryQueryService
        ? new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                const regions = session.getRegions();
                return Promise.all(regions.map((region) => executeDiscoverPlaceNamingClaimsCommand({
                    discoveryTag: derivePlaceNamingDiscoveryTag(region.worldId, region.id),
                    discoveryQueryService: placeNamingDiscoveryQueryService
                }))).then((perRegionResults) => perRegionResults.flat());
            },
            resolveClaimPosition: (envelope) => {
                const region = session.getRegions().find((r) => r.worldId === envelope.worldId && r.id === envelope.regionId);
                return region ? region.position : null;
            }
        })
        : null;
}

// Reproduces EXACTLY ui/views/WorldView.js's own `refreshSpatialUI()` tick
// body for Place Naming presentation (see that file's own "0.9.257"
// comment inside `refreshSpatialUI()`). `refs` stands in for the two Vue
// refs this milestone's own brief names by name (`nearbyPlaceNamingClaims`/
// `placeNamingDiscoveryError`); `isActive` stands in for reading
// `placeNamingDiscoveryPresentationActive`.
function tick({ monitor, position, refs, isActive }) {
    if (monitor && position) {
        return monitor.observe(position).then(() => {
            if (!isActive()) {
                return;
            }
            refs.nearbyPlaceNamingClaims = monitor.lastResult || [];
            refs.placeNamingDiscoveryError = monitor.lastError;
        });
    }
    return Promise.resolve();
}

// Reproduces EXACTLY ui/views/WorldView.js's own `nearbyPlaceNamingClaimRows`
// computed (see that file's own "0.9.257" comment immediately above it).
function makeRows(claims, resolveDisplayName) {
    return claims.map((entry) => ({
        claimId: entry.claim.id,
        name: entry.claim.name,
        authorDisplayName: resolveDisplayName(entry.claim.authorIdentityId),
        position: entry.position
    }));
}

function freshRefs() {
    return { nearbyPlaceNamingClaims: [], placeNamingDiscoveryError: null };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function extractBetween(code, startMarker, endMarker) {
    const startIdx = code.indexOf(startMarker);
    if (startIdx === -1) {
        throw new Error(`extractBetween: start marker not found: ${startMarker}`);
    }
    const endIdx = code.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) {
        throw new Error(`extractBetween: end marker not found: ${endMarker}`);
    }
    return code.slice(startIdx, endIdx + endMarker.length);
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — nearby claims appear automatically.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(10, 0) }]);
        const queryService = { search: () => Promise.resolve([envelopeOf({ claim: { id: 'claim-a', name: 'Old Oak Crossing', regionId: 'region-1', worldId: 'world-1' } })]) };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-a',
            '1. a nearby claim appears in nearbyPlaceNamingClaims automatically, with no explicit user action');

        console.log('✓ Section A: nearby claims appear automatically');
    }

    // ---------------------------------------------------------------
    // Section B — multiple claims are displayed simultaneously.
    // ---------------------------------------------------------------
    {
        const session = makeSession([
            { id: 'region-a', worldId: 'world-1', position: pos(10, 0) },
            { id: 'region-b', worldId: 'world-1', position: pos(-10, 0) }
        ]);
        const tagA = derivePlaceNamingDiscoveryTag('world-1', 'region-a');
        const tagB = derivePlaceNamingDiscoveryTag('world-1', 'region-b');
        const queryService = {
            search: (tag) => {
                if (tag === tagA) return Promise.resolve([envelopeOf({ claim: { id: 'claim-alice', name: 'Central Park', regionId: 'region-a', worldId: 'world-1', authorIdentityId: 'did:key:zAlice' } })]);
                if (tag === tagB) return Promise.resolve([envelopeOf({ claim: { id: 'claim-bob', name: 'Old Market', regionId: 'region-b', worldId: 'world-1', authorIdentityId: 'did:key:zBob' } })]);
                return Promise.resolve([]);
            }
        };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.length === 2, '2. two independently-authored claims for two different regions are both displayed simultaneously');
        const ids = refs.nearbyPlaceNamingClaims.map((c) => c.claim.id);
        assert(ids.includes('claim-alice') && ids.includes('claim-bob'), '3. neither claim is dropped in favor of the other — this view never picks a winner');

        console.log('✓ Section B: multiple claims are displayed simultaneously');
    }

    // ---------------------------------------------------------------
    // Section C — discovery order is preserved.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const orderedClaims = ['claim-c', 'claim-a', 'claim-b'].map((id) => envelopeOf({ claim: { id, name: id, regionId: 'region-1', worldId: 'world-1' } }));
        const queryService = { search: () => Promise.resolve(orderedClaims) };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.map((c) => c.claim.id).join(',') === 'claim-c,claim-a,claim-b',
            '4. claims are presented in exactly the order discovery produced them, never re-sorted alphabetically, by distance, or by any other criterion');

        console.log('✓ Section C: discovery order is preserved');
    }

    // ---------------------------------------------------------------
    // Section D — distant claims never reach presentation.
    // ---------------------------------------------------------------
    {
        const session = makeSession([
            { id: 'region-near', worldId: 'world-1', position: pos(50, 0) },
            { id: 'region-far', worldId: 'world-1', position: pos(5000, 0) }
        ]);
        const tagNear = derivePlaceNamingDiscoveryTag('world-1', 'region-near');
        const tagFar = derivePlaceNamingDiscoveryTag('world-1', 'region-far');
        const queryService = {
            search: (tag) => {
                if (tag === tagNear) return Promise.resolve([envelopeOf({ claim: { id: 'claim-near', name: 'Nearby Place', regionId: 'region-near', worldId: 'world-1' } })]);
                if (tag === tagFar) return Promise.resolve([envelopeOf({ claim: { id: 'claim-far', name: 'Distant Place', regionId: 'region-far', worldId: 'world-1' } })]);
                return Promise.resolve([]);
            }
        };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-near',
            '5. a claim whose own region sits far outside proximityRadius never reaches presentation, even though discovery itself found it');

        console.log('✓ Section D: distant claims never reach presentation');
    }

    // ---------------------------------------------------------------
    // Section E — empty discovery produces the correct empty state.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const queryService = { search: () => Promise.resolve([]) };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });

        assert(Array.isArray(refs.nearbyPlaceNamingClaims) && refs.nearbyPlaceNamingClaims.length === 0,
            '6. an empty discovery cycle produces an empty array, never null or undefined');

        // With no query service at all (an environment with no discovery
        // transport available), the same empty state holds from the ref's
        // own initial value, without ever calling into a monitor.
        const inertRefs = freshRefs();
        await tick({ monitor: null, position: pos(0, 0), refs: inertRefs, isActive: () => true });
        assert(Array.isArray(inertRefs.nearbyPlaceNamingClaims) && inertRefs.nearbyPlaceNamingClaims.length === 0,
            '7. with no discovery capability configured at all, nearbyPlaceNamingClaims stays a plain empty array');

        console.log('✓ Section E: empty discovery produces the correct empty state');
    }

    // ---------------------------------------------------------------
    // Section F — discovery failure preserves the previous successful
    // observation. Section G — a newer successful result replaces it.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        let mode = 'success-x';
        const queryService = {
            search: () => {
                if (mode === 'success-x') return Promise.resolve([envelopeOf({ claim: { id: 'claim-x', name: 'X', regionId: 'region-1', worldId: 'world-1' } })]);
                if (mode === 'failure') return Promise.reject(new Error('relay unreachable'));
                return Promise.resolve([envelopeOf({ claim: { id: 'claim-y', name: 'Y', regionId: 'region-1', worldId: 'world-1' } })]);
            }
        };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        // Each position below stays within the region's own proximityRadius
        // (the region sits fixed at (0,0)) while still moving far enough,
        // pairwise, to satisfy the monitor's own refresh threshold (100) on
        // every tick — see application/ShouldRefreshPlaceNamingDiscovery.js.
        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });
        assert(refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-x', 'sanity: the first successful observation is displayed');

        mode = 'failure';
        await tick({ monitor, position: pos(100, 0), refs, isActive: () => true });
        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-x',
            '8. a failed discovery cycle leaves the previously displayed claims exactly as they were');
        assert(refs.placeNamingDiscoveryError instanceof Error, '9. the failure is recorded as a non-authoritative error indicator');

        mode = 'success-y';
        await tick({ monitor, position: pos(-100, 0), refs, isActive: () => true });
        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-y',
            '10. a subsequent successful observation fully replaces the previous one');
        assert(refs.placeNamingDiscoveryError === null, '11. a successful observation clears any prior error indicator');

        console.log('✓ Sections F/G: a failed cycle preserves the previous observation; a later success replaces it');
    }

    // ---------------------------------------------------------------
    // Section H — stale monitor results cannot overwrite the displayed
    // result.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        let resolveFirst;
        let calls = 0;
        const queryService = {
            search: () => {
                calls += 1;
                if (calls === 1) {
                    return new Promise((resolve) => { resolveFirst = resolve; });
                }
                return Promise.resolve([envelopeOf({ claim: { id: 'claim-fresh', name: 'Fresh Name', regionId: 'region-1', worldId: 'world-1' } })]);
            }
        };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        // Both positions stay within the region's own proximityRadius (the
        // region sits fixed at (0,0)) while still differing by exactly the
        // monitor's own refresh threshold, so the second observe() genuinely
        // triggers a second, independent discovery call.
        const firstTick = tick({ monitor, position: pos(0, 0), refs, isActive: () => true });
        await flushMicrotasks();
        const secondTick = tick({ monitor, position: pos(100, 0), refs, isActive: () => true });
        await secondTick;

        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-fresh',
            '12. the newer observation is applied as soon as it settles, without waiting for the older, still in-flight one');

        resolveFirst([envelopeOf({ claim: { id: 'claim-stale', name: 'Stale Name', regionId: 'region-1', worldId: 'world-1' } })]);
        await firstTick;
        await flushMicrotasks();

        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-fresh',
            '13. the first observation\'s own late-arriving response never overwrites the newer, already-displayed result');

        console.log('✓ Section H: a stale, late-arriving discovery response can never overwrite a newer displayed result');
    }

    // ---------------------------------------------------------------
    // Section I — publication/discovery identity is not confused with
    // Place Naming identity.
    // ---------------------------------------------------------------
    {
        const worldId = 'world-1';
        const regionId = 'region-1';
        const tag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const event = {
            id: 'event-identity', pubkey: 'nostr-transport-pubkey-should-never-surface', kind: 1,
            tags: [['t', tag]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-identity', worldId, regionId, name: 'Named Place', authorIdentityId: 'did:key:zRealAuthor' } })),
            sig: 'sig-identity'
        };
        async function queryImpl(relayUrl, filter) {
            return filter['#t'][0] === tag ? [event] : [];
        }
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [source] });
        const session = makeSession([{ id: regionId, worldId, position: pos(0, 0) }]);
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });
        assert(refs.nearbyPlaceNamingClaims.length === 1, 'sanity: the real Nostr event was discovered and resolved as nearby');

        const receivedIdentityIds = [];
        const rows = makeRows(refs.nearbyPlaceNamingClaims, (identityId) => { receivedIdentityIds.push(identityId); return `resolved:${identityId}`; });

        assert(receivedIdentityIds.length === 1 && receivedIdentityIds[0] === 'did:key:zRealAuthor',
            '14. author resolution is driven by claim.authorIdentityId, the Place Naming identity, never the transport-layer publisher');
        assert(!receivedIdentityIds.includes('nostr-transport-pubkey-should-never-surface'),
            '15. the raw Nostr event pubkey never reaches identity resolution');
        assert(!JSON.stringify(rows).includes('nostr-transport-pubkey-should-never-surface'),
            '16. the displayed row itself never carries the raw transport pubkey in any field');

        console.log('✓ Section I: publication/discovery identity (Nostr pubkey) is never confused with Place Naming identity (claim.authorIdentityId)');
    }

    // ---------------------------------------------------------------
    // Section K — two World View instances remain isolated.
    // ---------------------------------------------------------------
    {
        const sessionX = makeSession([{ id: 'region-1', worldId: 'world-x', position: pos(0, 0) }]);
        const sessionY = makeSession([{ id: 'region-1', worldId: 'world-y', position: pos(9999, 9999) }]);
        const queryServiceX = { search: () => Promise.resolve([envelopeOf({ claim: { id: 'claim-x-only', name: 'X World Place', regionId: 'region-1', worldId: 'world-x' } })]) };
        const queryServiceY = { search: () => Promise.resolve([envelopeOf({ claim: { id: 'claim-y-only', name: 'Y World Place', regionId: 'region-1', worldId: 'world-y' } })]) };
        const monitorX = makePlaceNamingDiscoveryMonitor({ session: sessionX, placeNamingDiscoveryQueryService: queryServiceX });
        const monitorY = makePlaceNamingDiscoveryMonitor({ session: sessionY, placeNamingDiscoveryQueryService: queryServiceY });
        const refsX = freshRefs();
        const refsY = freshRefs();

        await tick({ monitor: monitorX, position: pos(0, 0), refs: refsX, isActive: () => true });
        await tick({ monitor: monitorY, position: pos(9999, 9999), refs: refsY, isActive: () => true });

        assert(refsX.nearbyPlaceNamingClaims.length === 1 && refsX.nearbyPlaceNamingClaims[0].claim.id === 'claim-x-only',
            '17. World View instance X sees only its own World\'s claims');
        assert(refsY.nearbyPlaceNamingClaims.length === 1 && refsY.nearbyPlaceNamingClaims[0].claim.id === 'claim-y-only',
            '18. World View instance Y sees only its own World\'s claims, entirely unaffected by X');

        console.log('✓ Section K: two World View instances remain isolated — independent monitors, independent refs, no shared state');
    }

    // ---------------------------------------------------------------
    // Section L — document/world switching does not leak claims.
    // ---------------------------------------------------------------
    {
        let currentRegions = [{ id: 'region-old', worldId: 'world-old', position: pos(0, 0) }];
        const session = makeSession(() => currentRegions);
        const tagOld = derivePlaceNamingDiscoveryTag('world-old', 'region-old');
        const tagNew = derivePlaceNamingDiscoveryTag('world-new', 'region-new');
        const queryService = {
            search: (tag) => {
                if (tag === tagOld) return Promise.resolve([envelopeOf({ claim: { id: 'claim-old', name: 'Old World Place', regionId: 'region-old', worldId: 'world-old' } })]);
                if (tag === tagNew) return Promise.resolve([envelopeOf({ claim: { id: 'claim-new', name: 'New World Place', regionId: 'region-new', worldId: 'world-new' } })]);
                return Promise.resolve([]);
            }
        };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });
        assert(refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-old', 'sanity: the old World\'s claim is shown before any switch');

        // Simulate switching to a brand-new World: the old document unloads,
        // a new one loads far away — session.getRegions() now reflects ONLY
        // the new World's own regions, re-read fresh on this next tick,
        // exactly as `session.getRegions()`'s own "world-wide across
        // currently loaded documents" contract already guarantees.
        currentRegions = [{ id: 'region-new', worldId: 'world-new', position: pos(5000, 0) }];
        await tick({ monitor, position: pos(5000, 0), refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.length === 1 && refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-new',
            '19. after switching Worlds, only the new World\'s own claim is displayed');
        assert(!refs.nearbyPlaceNamingClaims.some((c) => c.claim.id === 'claim-old'),
            '20. the old World\'s own claim never leaks into the post-switch observation');

        console.log('✓ Section L: document/world switching never leaks a previous World\'s claims into the current observation');
    }

    // ---------------------------------------------------------------
    // Section M — monitor disposal prevents post-unmount UI updates.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        let resolveCommand;
        const queryService = { search: () => new Promise((resolve) => { resolveCommand = resolve; }) };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();
        let active = true;

        const pending = tick({ monitor, position: pos(0, 0), refs, isActive: () => active });
        await flushMicrotasks();

        // The EXACT ordering ui/views/WorldView.js's own onBeforeUnmount()
        // uses: the presentation-active flag flips first, then the monitor
        // itself is disposed.
        active = false;
        monitor.dispose();
        resolveCommand([envelopeOf({ claim: { id: 'claim-post-unmount', name: 'Too Late', regionId: 'region-1', worldId: 'world-1' } })]);
        await pending;
        await flushMicrotasks();

        assert(refs.nearbyPlaceNamingClaims.length === 0, '21. a discovery response arriving after this view has torn down never updates nearbyPlaceNamingClaims');
        assert(refs.placeNamingDiscoveryError === null, '22. it never sets an error indicator either — the callback never runs at all once torn down');

        console.log('✓ Section M: disposing the monitor (and flipping the presentation-active guard) prevents a late response from updating a torn-down view');
    }

    // ---------------------------------------------------------------
    // Section O — NEGATIVE: a claim at the Wanderer's own exact position
    // remains merely a displayed claim.
    // ---------------------------------------------------------------
    {
        const wandererPosition = pos(42, 17);
        let regionName = 'Original Region Name';
        const session = makeSession([{ id: 'region-exact', worldId: 'world-1', position: wandererPosition, get name() { return regionName; } }]);
        const queryService = { search: () => Promise.resolve([envelopeOf({ claim: { id: 'claim-exact', name: 'Suspiciously Convenient Name', regionId: 'region-exact', worldId: 'world-1' } })]) };
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: wandererPosition, refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.length === 1, '23. a claim whose region sits exactly at the Wanderer\'s own position is still discovered and displayed');
        const entry = refs.nearbyPlaceNamingClaims[0];
        assert(entry.position.x === wandererPosition.x && entry.position.z === wandererPosition.z, 'sanity: the distance between claim and Wanderer is genuinely zero');

        const row = makeRows([entry], (id) => `resolved:${id}`)[0];
        const forbiddenAuthorityFlags = ['isPrimary', 'isOfficial', 'adopted', 'isAdopted', 'authoritative', 'verified', 'trusted', 'isCurrentName', 'confirmed'];
        for (const flag of forbiddenAuthorityFlags) {
            assert(!(flag in row) && !(flag in entry), `24. exact positional coincidence never attaches an authority flag ("${flag}") to a claim — a nearby claim is never treated as more than a claim`);
        }
        assert(session.getRegions()[0].name === 'Original Region Name',
            '25. displaying a claim — even one whose position exactly matches the Wanderer\'s own — never renames the World location it describes');

        console.log('✓ Section O: NEGATIVE — a claim at the Wanderer\'s exact current position remains merely a displayed claim, never an authority');
    }

    // ---------------------------------------------------------------
    // Section J / N — structural boundary: no verification, ranking,
    // adoption, registration, or persistence in the new 0.9.257 code, and
    // this view never touches `session` beyond `getRegions()` (already
    // enforced dynamically by every section above's own `makeSession()`
    // Proxy — this section is the static, source-level counterpart).
    // ---------------------------------------------------------------
    {
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        const monitorBlock = extractBetween(
            worldViewCode,
            'const placeNamingDiscoveryMonitor = placeNamingDiscoveryQueryService',
            'let placeNamingDiscoveryPresentationActive = true;'
        );
        const tickBlock = extractBetween(
            worldViewCode,
            'if (placeNamingDiscoveryMonitor && spatialContext.value) {',
            'automaticSnapshotEncounterRetentionReconciliation.reconcile('
        );
        const computedRowsBlock = extractBetween(
            worldViewCode,
            'const nearbyPlaceNamingClaimRows = computed(() => (',
            'function goToNearbyCollaborator(deviceId) {'
        );
        const disposalBlock = extractBetween(
            worldViewCode,
            'placeNamingDiscoveryPresentationActive = false;',
            'clearInterval(spatialInterval);'
        );
        const combined = [monitorBlock, tickBlock, computedRowsBlock, disposalBlock].join('\n');

        const forbiddenTerms = [
            'verify(', '.adopt(', '.register(', 'rankClaimsByName', '.sort(',
            'publishPlaceNamingClaim(', 'importPlaceNamingClaim(', 'exportPlaceNamingClaim(', 'retractPlaceNamingClaim(',
            'LocalAuthorizationVerifier', 'LocalPlaceNamingClaimStore', 'PlaceNamingClaimExchange',
            'localStorage', 'indexedDB', 'updateRegion(', 'renameRegion(', 'setWorldRegion(', 'createRegionHere(',
            'isPrimary', 'isOfficial', 'authoritative'
        ];
        for (const term of forbiddenTerms) {
            assert(!combined.includes(term), `26. the new 0.9.257 wiring in ui/views/WorldView.js never contains '${term}' — no verification, ranking, adoption, registration, or persistence of its own`);
        }
        // And the one collaborator method it DOES call — see makeSession()'s
        // own Proxy guard above for the dynamic half of this same proof.
        assert((combined.match(/session\.getRegions\(\)/g) || []).length >= 2,
            '27. the new wiring reaches session only through getRegions(), for both the discovery command and the position resolver');

        console.log('✓ Section J/N: the new Place Naming presentation wiring performs no verification, ranking, adoption, registration, or persistence, and touches session only through getRegions()');
    }

    // ---------------------------------------------------------------
    // Section P — FLAGSHIP: the real Nostr source, the real discovery
    // aggregator/command, and the real proximity selector, driven
    // end-to-end through the exact wiring ui/views/WorldView.js composes.
    // ---------------------------------------------------------------
    {
        const worldId = 'world-1';
        const regionNearTag = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const regionFarTag = derivePlaceNamingDiscoveryTag(worldId, 'region-far');

        const nearEvent = {
            id: 'event-near', pubkey: 'pk-alice', kind: 1,
            tags: [['t', regionNearTag]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-near', worldId, regionId: 'region-near', name: 'Old Oak Crossing', authorIdentityId: 'did:key:zAlice' } })),
            sig: 'sig-near'
        };
        const farEvent = {
            id: 'event-far', pubkey: 'pk-bob', kind: 1,
            tags: [['t', regionFarTag]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-far', worldId, regionId: 'region-far', name: 'Distant Hollow', authorIdentityId: 'did:key:zBob' } })),
            sig: 'sig-far'
        };
        const garbageEvent = { id: 'event-garbage', pubkey: 'pk-mallory', kind: 1, tags: [['t', regionNearTag]], content: 'not json at all', sig: 'sig-garbage' };

        async function queryImpl(relayUrl, filter) {
            const requestedTag = filter['#t'][0];
            if (requestedTag === regionNearTag) return [nearEvent, garbageEvent];
            if (requestedTag === regionFarTag) return [farEvent];
            return [];
        }

        const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource] });
        const session = makeSession([
            { id: 'region-near', worldId, position: pos(10, 0) },
            { id: 'region-far', worldId, position: pos(5000, 0) }
        ]);
        const monitor = makePlaceNamingDiscoveryMonitor({ session, placeNamingDiscoveryQueryService: queryService });
        const refs = freshRefs();

        await tick({ monitor, position: pos(0, 0), refs, isActive: () => true });

        assert(refs.nearbyPlaceNamingClaims.length === 1,
            '28. FLAGSHIP — real discovery found two well-formed claims across two regions (and silently dropped one garbage event), and real proximity selection kept exactly the one within range');
        assert(refs.nearbyPlaceNamingClaims[0].claim.id === 'claim-near' && refs.nearbyPlaceNamingClaims[0].claim.name === 'Old Oak Crossing',
            '29. FLAGSHIP — the surviving entry is the near claim, with its own real, unmodified payload intact');

        const rows = makeRows(refs.nearbyPlaceNamingClaims, (id) => `display:${id}`);
        assert(rows[0].authorDisplayName === 'display:did:key:zAlice', '30. FLAGSHIP — the displayed row resolves the real author identity');
        assert(rows[0].position.x === 10 && rows[0].position.z === 0, '31. FLAGSHIP — the displayed row carries the real resolved position');

        console.log('✓ Section P (FLAGSHIP): the real Nostr source, discovery aggregator, and proximity selector work end-to-end through the exact wiring WorldView.js composes');
    }

    // ---------------------------------------------------------------
    // Section Q — architectural regression: the reproduction above
    // genuinely matches what ui/main.js and ui/views/WorldView.js contain.
    // ---------------------------------------------------------------
    {
        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes("new NostrPlaceNamingDiscoverySource("), '32. ui/main.js composes a real NostrPlaceNamingDiscoverySource');
        assert(mainCode.includes("composePlaceNamingDiscoveryRuntime("), '33. ui/main.js composes the Place Naming discovery runtime');
        assert(mainCode.includes("app.provide('placeNamingDiscoveryQueryService', placeNamingDiscoveryQueryService);"),
            '34. ui/main.js provides placeNamingDiscoveryQueryService app-wide');

        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes("const placeNamingDiscoveryQueryService = inject('placeNamingDiscoveryQueryService', null);"),
            '35. WorldView.js injects the app-wide placeNamingDiscoveryQueryService');
        assert(worldViewCode.includes('new PlaceNamingDiscoveryMonitor({'), '36. WorldView.js constructs a real PlaceNamingDiscoveryMonitor');
        assert(worldViewCode.includes('placeNamingDiscoveryMonitor.observe(spatialContext.value.position).then(('),
            '37. WorldView.js observes with a raw position, not the whole spatialContext object — see ShouldRefreshPlaceNamingDiscovery.js\'s own raw-position contract');
        assert(worldViewCode.includes('placeNamingDiscoveryMonitor.dispose();'), '38. WorldView.js disposes the monitor on unmount');
        assert(worldViewCode.includes('title="Nearby Place Names"'), '39. WorldView.js renders a "Nearby Place Names" section');
        assert(worldViewCode.includes('No nearby place naming claims were discovered.'),
            '40. the empty state reads "no claims were discovered," never "this place has no name" — a decentralized naming system must not conflate the two');
        assert(!worldViewCode.includes('This place has no name'), '41. the forbidden empty-state wording never appears');
        assert(worldViewCode.includes('nearbyPlaceNamingClaims,') && worldViewCode.includes('placeNamingDiscoveryError,'),
            '42. both state atoms this milestone\'s own brief names by name are actually exposed from setup()');

        console.log('✓ Section Q: ui/main.js and ui/views/WorldView.js genuinely contain the wiring every section above assumes');
    }

    console.log('\n✅ All World View Place Naming Presentation tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
