import { readFile } from 'node:fs/promises';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';

// 0.9.258 — Comprehensive Place Naming E2E & Lifecycle Audit.
//
// This milestone adds NO new capability. 0.9.253 through 0.9.257 built the
// complete pipeline —
//
//   Nostr relay
//        │
//        ▼
//   application/NostrPlaceNamingDiscoverySource.js        (0.9.254)
//        ▼
//   application/PlaceNamingDiscoveryQueryService.js        (0.9.253)
//        ▼
//   application/DiscoverPlaceNamingClaimsCommand.js        (0.9.253)
//        ▼
//   application/PlaceNamingDiscoveryMonitor.js              (0.9.256)
//        ├── resolveClaimPosition (session-supplied)
//        └── core/PlaceNamingProximitySelection.js          (0.9.255)
//        ▼
//   ui/views/WorldView.js "Nearby Place Names"               (0.9.257)
//
// — but every prior test file proved its OWN seam in isolation (or, in
// `tests/PlaceNamingWorldViewPresentation.test.js`'s own case, the
// PRESENTATION seam specifically, mostly against a fake, hand-built
// `queryService`). This file is the audit the product-direction
// conversation that opened this milestone asked for by name: enough
// surface area now exists across all six files for lifecycle bugs
// invisible when each layer was tested alone — a race, a stale response,
// an unmount, a world switch — and the milestone gives a clean decision
// point before choosing what (if anything) comes next.
//
// THE REAL PRODUCTION CHAIN, WITH ONLY THE RELAY CONTROLLED. Every
// section below drives a REAL `NostrPlaceNamingDiscoverySource`, a REAL
// `PlaceNamingDiscoveryQueryService` (via the REAL
// `composePlaceNamingDiscoveryRuntime()`), the REAL
// `executeDiscoverPlaceNamingClaimsCommand()`, and a REAL
// `PlaceNamingDiscoveryMonitor` — none of these five collaborators is
// ever replaced with a fake, hand-rolled stand-in anywhere in this file.
// The only thing under this file's own control is `queryImpl` — the one
// seam `NostrPlaceNamingDiscoverySource`'s own header already names as an
// injection point with no ambient default — played here by
// `makeRelay()`, an in-memory stand-in for an actual relay socket. The
// one exception is Section F ("failure and recovery"), which triggers a
// genuine rejection through `session.getRegions()` itself rather than
// through the relay — see that section's own comment for why: the real
// `PlaceNamingDiscoveryQueryService.search()` is documented to never
// reject (a failing SOURCE is isolated into an honest empty result, per
// its own `Promise.allSettled()` contract — see Section L below), so a
// relay-level failure alone can never reach `PlaceNamingDiscoveryMonitor`
// as `lastError` in the real chain; the one collaborator that CAN
// actually reject the monitor's own command is the session-supplied
// region lookup, exactly as real and exactly as un-mocked as everything
// else in this file.
//
// THE ONE ARCHITECTURAL BOUNDARY EVERY HARNESS BELOW ENFORCES:
// `makeSession()`'s Proxy throws on any access beyond `getRegions()` —
// the SAME dynamic guard `tests/PlaceNamingWorldViewPresentation.test.js`
// already established, reused here verbatim. A test in this file that
// somehow reaches `session.publishPlaceNamingClaim()`,
// `session.getPlaceNamingView()`, or any other session method fails
// immediately and loudly — proof by construction that nothing in this
// audit's own harness could ever adopt, persist, verify, or register a
// discovered claim even by accident.
//
//   Section A: initial encounter — nearby claims appear with no explicit
//              user action
//   Section B: movement threshold precision — below/exactly/beyond the
//              refresh radius, and the UI reflects the newest result
//   Section C: multiple claims — no closest-wins, no sorting, no
//              deduplication beyond claim.id, no primary-name selection
//   Section D: spatial transition — area A's claim to area B's claim
//   Section E: claims becoming distant (a successful, now-empty
//              discovery) vs. a failed discovery (the previous result
//              is preserved) — the two must never be confused
//   Section F: failure and recovery — the full success/failure/success
//              cycle, through a real rejection of the monitor's own
//              command
//   Section G: out-of-order discovery — two overlapping requests
//              resolved in reverse order; only the newest may win
//   Section H: malformed claims never suppress valid, nearby ones
//   Section I: World/session switching while a discovery is in flight —
//              the stale World's own late result must never contaminate
//              the new one
//   Section J: unmount — no post-disposal mutation from a still-settling
//              discovery
//   Section K: identity isolation — two independent monitors/sessions
//              never share claims, errors, or request-id race outcomes
//   Section L: discovery-source failure isolation — one failing source
//              never suppresses another, succeeding one
//   Section M: position-resolution isolation — an unresolvable claim
//              disappears without poisoning its neighbors
//   Section N: semantic negative tests — the complete automatic path
//              never verifies, adopts, ranks, persists, or renames
//   FLAGSHIP:  "Riverside" and "Old River" — two independently authored
//              claims for the same ground, both displayed, neither
//              preferred: proximity is never authority

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

let nextEventId = 0;
function nostrEventFor(envelopeOrRawContent, { tag, pubkey = 'pk-relay-transport' } = {}) {
    nextEventId += 1;
    const content = typeof envelopeOrRawContent === 'string' ? envelopeOrRawContent : JSON.stringify(envelopeOrRawContent);
    return { id: `event-${nextEventId}`, pubkey, kind: 1, tags: [['t', tag]], content, sig: `sig-${nextEventId}` };
}

// A fake `application/WorldNavigationSession.js` stand-in exposing ONLY
// `getRegions()` — see this file's own header. Any other property access
// throws immediately.
function makeSession(regionsOrFn) {
    const getRegions = typeof regionsOrFn === 'function' ? regionsOrFn : () => regionsOrFn;
    return new Proxy({ getRegions }, {
        get(target, prop) {
            if (prop === 'getRegions') return target.getRegions;
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            throw new Error(`fake session: unexpected access to session.${String(prop)} — Place Naming discovery must only ever call session.getRegions()`);
        }
    });
}

// An in-memory stand-in for an actual relay socket — the ONE thing this
// file's own header says is fair to control. `setHandler(fn)` installs
// `(tag, relayUrl) -> events[] | DEFERRED | throws`. `DEFERRED` (see
// `deferred()` below) hangs the call until the test itself resolves it via
// `relay.deferrals[n].resolve(events)`/`.reject(error)` — the one
// mechanism every race/in-flight section below (G, I, J) needs, and which
// no synchronous fixture could ever produce.
const DEFERRED = Symbol('deferred');
function deferred() { return DEFERRED; }

function makeRelay(initialHandler = () => []) {
    let handler = initialHandler;
    const calls = [];
    const deferrals = [];
    async function queryImpl(relayUrl, filter) {
        const tag = filter['#t'][0];
        calls.push(tag);
        const outcome = handler(tag, relayUrl);
        if (outcome === DEFERRED) {
            const entry = {};
            entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
            deferrals.push(entry);
            return entry.promise;
        }
        return outcome;
    }
    return {
        queryImpl,
        calls,
        deferrals,
        setHandler(fn) { handler = fn; }
    };
}

// Builds the exact real chain a mounted `ui/views/WorldView.js` composes
// (see that file's own 0.9.257 construction comment) around one relay and
// one session — `NostrPlaceNamingDiscoverySource` -> real
// `composePlaceNamingDiscoveryRuntime()` -> real
// `executeDiscoverPlaceNamingClaimsCommand()` -> real
// `PlaceNamingDiscoveryMonitor`. `tick(position)` reproduces
// `refreshSpatialUI()`'s own copy-into-refs step, respecting the same
// `placeNamingDiscoveryPresentationActive`-shaped guard `unmount()` flips.
function createHarness({ session, relay, extraSources = [] }) {
    const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
    const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource, ...extraSources] });
    const monitor = new PlaceNamingDiscoveryMonitor({
        discoverPlaceNamingClaimsCommand: () => {
            const regions = session.getRegions();
            return Promise.all(regions.map((region) => executeDiscoverPlaceNamingClaimsCommand({
                discoveryTag: derivePlaceNamingDiscoveryTag(region.worldId, region.id),
                discoveryQueryService: queryService
            }))).then((perRegionResults) => perRegionResults.flat());
        },
        resolveClaimPosition: (envelope) => {
            const region = session.getRegions().find((r) => r.worldId === envelope.worldId && r.id === envelope.regionId);
            return region ? region.position : null;
        }
    });
    const refs = { nearbyPlaceNamingClaims: [], placeNamingDiscoveryError: null };
    let active = true;

    function tick(position) {
        return monitor.observe(position).then(() => {
            if (!active) return;
            refs.nearbyPlaceNamingClaims = monitor.lastResult || [];
            refs.placeNamingDiscoveryError = monitor.lastError;
        });
    }

    function unmount() {
        active = false;
        monitor.dispose();
    }

    return { monitor, refs, tick, unmount, queryService, setActive: (v) => { active = v; } };
}

function claimIds(refs) {
    return refs.nearbyPlaceNamingClaims.map((c) => c.claim.id);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — initial encounter.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(10, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-a', name: 'Old Oak Crossing', regionId: 'region-1', worldId: 'world-1' } }), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));

        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-a',
            '1. a Wanderer entering a World receives a nearby naming claim automatically, with no explicit user action, through the real Nostr/discovery/proximity chain');

        console.log('✓ Section A: initial encounter — nearby claims appear automatically');
    }

    // ---------------------------------------------------------------
    // Section B — movement threshold precision.
    // ---------------------------------------------------------------
    {
        // The region sits fixed at the origin, within the DEFAULT
        // proximityRadius (100) of every Wanderer position used below —
        // this section is about the REFRESH threshold (does a fresh
        // discovery call happen at all), never about proximity selection,
        // so every position here is deliberately chosen to stay within
        // 100 of (0,0) as well (the boundary case, pos(-100,0), lands
        // exactly on that radius too — still inclusive, still nearby).
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const contents = [
            [nostrEventFor(envelopeOf({ claim: { id: 'claim-v1', name: 'V1', regionId: 'region-1', worldId: 'world-1' } }), { tag })],
            [nostrEventFor(envelopeOf({ claim: { id: 'claim-v2', name: 'V2', regionId: 'region-1', worldId: 'world-1' } }), { tag })],
            [nostrEventFor(envelopeOf({ claim: { id: 'claim-v3', name: 'V3', regionId: 'region-1', worldId: 'world-1' } }), { tag })]
        ];
        let callIndex = 0;
        const relay = makeRelay(() => contents[callIndex++] || []);
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));
        assert(relay.calls.length === 1 && claimIds(harness.refs)[0] === 'claim-v1', 'sanity: the first-ever observation always refreshes');

        // Below the threshold (50, then 99 — both measured from the last
        // position that actually triggered a refresh, (0,0)): no refresh.
        await harness.tick(pos(50, 0));
        assert(relay.calls.length === 1 && claimIds(harness.refs)[0] === 'claim-v1',
            '2. a movement of 50 (below the 100 refresh radius) never triggers a fresh discovery call — the relay is not even contacted');

        await harness.tick(pos(99, 0));
        assert(relay.calls.length === 1 && claimIds(harness.refs)[0] === 'claim-v1',
            '3. a movement of 99 (still below the 100 refresh radius) never triggers a fresh discovery call either');

        // Exactly the threshold: refreshes (inclusive boundary).
        await harness.tick(pos(100, 0));
        assert(relay.calls.length === 2 && claimIds(harness.refs)[0] === 'claim-v2',
            '4. a movement of EXACTLY 100 refreshes, and the UI reflects the newest successful result');

        // Beyond the threshold (measured from (100,0), the new
        // last-refreshed position: pos(-100,0) is 200 away from it, well
        // beyond 100, while still landing exactly on the region's own
        // 100-radius proximity boundary): refreshes.
        await harness.tick(pos(-100, 0));
        assert(relay.calls.length === 3 && claimIds(harness.refs)[0] === 'claim-v3',
            '5. a movement beyond the refresh radius (200 from the last refresh point) also refreshes, and the UI again reflects the newest result');

        console.log('✓ Section B: movement threshold precision — below/exactly/beyond 100, and the UI always reflects the newest result');
    }

    // ---------------------------------------------------------------
    // Section C — multiple claims: no closest-wins, no sorting, no
    // deduplication beyond claim.id, no primary-name selection.
    // ---------------------------------------------------------------
    {
        // Regions listed in an order that does NOT correlate with distance
        // from the Wanderer at (0,0): region-far (80), region-near (30),
        // region-mid (60) — three claims that would sort as
        // near/mid/far by distance, but must come back in DISCOVERY order.
        const session = makeSession([
            { id: 'region-far', worldId: 'world-1', position: pos(80, 0) },
            { id: 'region-near', worldId: 'world-1', position: pos(30, 0) },
            { id: 'region-mid', worldId: 'world-1', position: pos(60, 0) }
        ]);
        const tagFar = derivePlaceNamingDiscoveryTag('world-1', 'region-far');
        const tagNear = derivePlaceNamingDiscoveryTag('world-1', 'region-near');
        const tagMid = derivePlaceNamingDiscoveryTag('world-1', 'region-mid');
        // region-mid additionally carries TWO independently-authored claims
        // for the exact same ground, with similar (but not identical) names
        // — proving no fuzzy "same place" deduplication happens either.
        const relay = makeRelay((tag) => {
            if (tag === tagFar) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-far', name: 'Far Place', regionId: 'region-far', worldId: 'world-1', authorIdentityId: 'did:key:zAlice' } }), { tag })];
            if (tag === tagNear) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-near', name: 'Near Place', regionId: 'region-near', worldId: 'world-1', authorIdentityId: 'did:key:zBob' } }), { tag })];
            if (tag === tagMid) return [
                nostrEventFor(envelopeOf({ claim: { id: 'claim-mid-1', name: 'Sunset Ridge', regionId: 'region-mid', worldId: 'world-1', authorIdentityId: 'did:key:zCarol' } }), { tag }),
                nostrEventFor(envelopeOf({ claim: { id: 'claim-mid-2', name: 'Ridge of Sunset', regionId: 'region-mid', worldId: 'world-1', authorIdentityId: 'did:key:zDave' } }), { tag })
            ];
            return [];
        });
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));

        assert(claimIds(harness.refs).length === 4, '6. all four claims across three regions survive — none dropped as "duplicate," "worse," or "farther"');
        assert(claimIds(harness.refs).join(',') === 'claim-far,claim-near,claim-mid-1,claim-mid-2',
            '7. claims are returned in exactly discovery order (region order, then per-region event order) — NEVER sorted by distance (which would read near/mid/far, not far/near/mid)');

        for (const entry of harness.refs.nearbyPlaceNamingClaims) {
            for (const flag of ['isPrimary', 'primary', 'isOfficial', 'winner', 'best']) {
                assert(!(flag in entry) && !(flag in entry.claim), `8. no claim entry ever carries a "${flag}" field — this pipeline never selects a primary name among competing claims`);
            }
        }

        console.log('✓ Section C: multiple claims survive simultaneously — no closest-wins, no sorting, no accidental deduplication, no primary-name selection');
    }

    // ---------------------------------------------------------------
    // Section D — spatial transition: area A's claim to area B's claim.
    // ---------------------------------------------------------------
    {
        const session = makeSession([
            { id: 'region-a', worldId: 'world-1', position: pos(0, 0) },
            { id: 'region-b', worldId: 'world-1', position: pos(1000, 0) }
        ]);
        const tagA = derivePlaceNamingDiscoveryTag('world-1', 'region-a');
        const tagB = derivePlaceNamingDiscoveryTag('world-1', 'region-b');
        const relay = makeRelay((tag) => {
            if (tag === tagA) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-area-a', name: 'Area A Landing', regionId: 'region-a', worldId: 'world-1' } }), { tag })];
            if (tag === tagB) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-area-b', name: 'Area B Landing', regionId: 'region-b', worldId: 'world-1' } }), { tag })];
            return [];
        });
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-area-a', 'sanity: standing near area A shows only area A\'s claim');

        await harness.tick(pos(1000, 0));
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-area-b',
            '9. moving from area A to area B changes the presentation to exactly area B\'s own claim');
        assert(!claimIds(harness.refs).includes('claim-area-a'), '10. area A\'s claim is no longer presented once the Wanderer has moved away from it');

        console.log('✓ Section D: spatial transition — moving from area A to area B changes presentation to match the new proximity result');
    }

    // ---------------------------------------------------------------
    // Section E — claims becoming distant (a successful, now-empty
    // discovery) vs. a failed discovery (the previous result is
    // preserved). The two must never be confused.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-here', name: 'Here', regionId: 'region-1', worldId: 'world-1' } }), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));
        assert(claimIds(harness.refs).length === 1, 'sanity: the claim starts out visible');

        // Move far enough away that region-1 (still fixed at (0,0), still
        // discovered, since discovery queries ALL known regions regardless
        // of distance) now falls OUTSIDE the proximity radius. This is a
        // SUCCESSFUL discovery — the relay answers fine — that simply
        // yields an empty proximity result.
        await harness.tick(pos(500, 0));
        assert(claimIds(harness.refs).length === 0,
            '11. a previously visible claim disappears once a SUCCESSFUL discovery places it outside the proximity radius');
        assert(harness.refs.placeNamingDiscoveryError === null,
            '12. this is an honest empty result, not a failure — no error indicator is ever set for a claim that has simply become distant');

        console.log('✓ Section E: claims becoming distant (via a successful, now-empty discovery) is honestly distinguished from a failed discovery — see Section F for the failure case itself');
    }

    // ---------------------------------------------------------------
    // Section F — failure and recovery: success -> failure -> success,
    // exercising the actual monitor's own catch path through the real
    // chain. See this file's own header for why this section — uniquely
    // among all sections here — triggers the failure via `session`
    // rather than via the relay: the real `PlaceNamingDiscoveryQueryService`
    // is documented to never reject (Section L proves this directly), so
    // the only collaborator in the real chain that can actually reject
    // `discoverPlaceNamingClaimsCommand()` itself is the session-supplied
    // region lookup.
    // ---------------------------------------------------------------
    {
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        let regionLookupShouldFail = false;
        const session = makeSession(() => {
            if (regionLookupShouldFail) {
                throw new Error('session: World layout temporarily unavailable');
            }
            return [{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }];
        });
        let claimName = 'X';
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: `claim-${claimName.toLowerCase()}`, name: claimName, regionId: 'region-1', worldId: 'world-1' } }), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));
        assert(claimIds(harness.refs)[0] === 'claim-x', 'sanity: the first successful observation is displayed');

        regionLookupShouldFail = true;
        await harness.tick(pos(100, 0));
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-x',
            '13. a failed discovery cycle leaves the previously displayed claims exactly as they were');
        assert(harness.refs.placeNamingDiscoveryError instanceof Error,
            '14. the failure is recorded as a non-authoritative error indicator');

        regionLookupShouldFail = false;
        claimName = 'Y';
        await harness.tick(pos(-100, 0));
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-y',
            '15. a subsequent successful observation fully replaces the previous one');
        assert(harness.refs.placeNamingDiscoveryError === null,
            '16. a successful observation clears any prior error indicator');

        console.log('✓ Section F: failure and recovery — success -> claims remain + error -> claims replaced + error cleared, through the real monitor');
    }

    // ---------------------------------------------------------------
    // Section G — out-of-order discovery: two overlapping requests
    // resolved in reverse order. Only the newest may update World View.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const relay = makeRelay(() => deferred());
        const harness = createHarness({ session, relay });

        const firstTick = harness.tick(pos(0, 0));
        await flushMicrotasks();
        assert(relay.deferrals.length === 1, 'sanity: the first request is in flight');

        const secondTick = harness.tick(pos(100, 0));
        await flushMicrotasks();
        assert(relay.deferrals.length === 2, 'sanity: a second, overlapping request is now also in flight');

        // Resolve the SECOND (newer) request first.
        relay.deferrals[1].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-newer', name: 'Newer', regionId: 'region-1', worldId: 'world-1' } }), { tag })]);
        await secondTick;
        assert(claimIds(harness.refs)[0] === 'claim-newer', '17. the newer request\'s result is applied as soon as it settles');

        // Now resolve the FIRST (older, now-stale) request.
        relay.deferrals[0].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-older', name: 'Older', regionId: 'region-1', worldId: 'world-1' } }), { tag })]);
        await firstTick;
        await flushMicrotasks();

        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-newer',
            '18. the older request\'s late-arriving response — even though it settled AFTER the newer one — never overwrites the already-displayed newer result');

        console.log('✓ Section G: out-of-order discovery — resolving two overlapping requests in reverse order still leaves only the newest visible');
    }

    // ---------------------------------------------------------------
    // Section H — malformed claims never suppress valid, nearby ones.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const validEnvelope1 = envelopeOf({ claim: { id: 'claim-valid-1', name: 'Valid One', regionId: 'region-1', worldId: 'world-1' } });
        const validEnvelope2 = envelopeOf({ claim: { id: 'claim-valid-2', name: 'Valid Two', regionId: 'region-1', worldId: 'world-1', authorIdentityId: 'did:key:zBob' } });
        // Three distinct flavors of malformed: unparseable JSON, valid
        // JSON but missing a required claim field, and valid JSON with a
        // malformed signature object.
        const notJsonEvent = nostrEventFor('this is not JSON at all {{{', { tag });
        const missingFieldEnvelope = { ...envelopeOf({ claim: { id: 'claim-missing-field', regionId: 'region-1', worldId: 'world-1' } }) };
        delete missingFieldEnvelope.claim.name;
        const missingFieldEvent = nostrEventFor(missingFieldEnvelope, { tag });
        const badSignatureEnvelope = envelopeOf({ claim: { id: 'claim-bad-signature', name: 'Bad Sig', regionId: 'region-1', worldId: 'world-1', signature: { algorithm: 'ed25519' } } });
        const badSignatureEvent = nostrEventFor(badSignatureEnvelope, { tag });

        const relay = makeRelay((t) => (t === tag ? [
            nostrEventFor(validEnvelope1, { tag }),
            notJsonEvent,
            missingFieldEvent,
            badSignatureEvent,
            nostrEventFor(validEnvelope2, { tag })
        ] : []));
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));

        assert(claimIds(harness.refs).length === 2, '19. exactly the two well-formed claims survive discovery — one malformed event never taints another, well-formed one');
        assert(claimIds(harness.refs).includes('claim-valid-1') && claimIds(harness.refs).includes('claim-valid-2'),
            '20. both valid claims specifically survive, regardless of which malformed events surrounded them');
        assert(!claimIds(harness.refs).some((id) => id.includes('missing') || id.includes('bad-signature')),
            '21. none of the malformed variants (unparseable JSON, missing field, malformed signature) leak through as a displayed claim');

        console.log('✓ Section H: malformed claims (unparseable, missing fields, malformed signature) never prevent valid, nearby claims from appearing');
    }

    // ---------------------------------------------------------------
    // Section I — World/session switching while a discovery is in
    // flight. The stale World's own late result must never contaminate
    // the new one.
    // ---------------------------------------------------------------
    {
        let currentRegions = [{ id: 'region-old', worldId: 'world-old', position: pos(0, 0) }];
        const session = makeSession(() => currentRegions);
        const tagOld = derivePlaceNamingDiscoveryTag('world-old', 'region-old');
        const tagNew = derivePlaceNamingDiscoveryTag('world-new', 'region-new');
        const relay = makeRelay(() => deferred());
        const harness = createHarness({ session, relay });

        // Kick off discovery for the OLD World and let it actually reach
        // the (deferred) relay call before anything else happens.
        const oldWorldTick = harness.tick(pos(0, 0));
        await flushMicrotasks();
        assert(relay.calls.length === 1 && relay.calls[0] === tagOld, 'sanity: the old World\'s own discovery call is genuinely in flight');

        // The World/document switch itself: session now reflects an
        // entirely new World, far away.
        currentRegions = [{ id: 'region-new', worldId: 'world-new', position: pos(5000, 0) }];
        const newWorldTick = harness.tick(pos(5000, 0));
        await flushMicrotasks();
        assert(relay.calls.length === 2 && relay.calls[1] === tagNew, 'sanity: the new World\'s own discovery call has also been made');

        relay.deferrals[1].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-new-world', name: 'New World Place', regionId: 'region-new', worldId: 'world-new' } }), { tag: tagNew })]);
        await newWorldTick;
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-new-world',
            '22. the new World\'s own claim is displayed as soon as its discovery settles');

        // The OLD World's own request finally settles, LATE.
        relay.deferrals[0].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-old-world', name: 'Old World Place', regionId: 'region-old', worldId: 'world-old' } }), { tag: tagOld })]);
        await oldWorldTick;
        await flushMicrotasks();

        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-new-world',
            '23. the old World\'s own late-arriving result never contaminates the already-displayed new World\'s own presentation');

        console.log('✓ Section I: switching World/session mid-flight — a late result from the abandoned World never contaminates the new one');
    }

    // ---------------------------------------------------------------
    // Section J — unmount: destroying World View while discovery is
    // pending must cause no post-unmount mutation.
    // ---------------------------------------------------------------
    {
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const relay = makeRelay(() => deferred());
        const harness = createHarness({ session, relay });

        const pending = harness.tick(pos(0, 0));
        await flushMicrotasks();
        assert(relay.deferrals.length === 1, 'sanity: the discovery is genuinely still pending');

        // The EXACT ordering ui/views/WorldView.js's own onBeforeUnmount()
        // uses: the presentation-active flag flips first, then the
        // monitor itself is disposed.
        harness.unmount();
        relay.deferrals[0].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-post-unmount', name: 'Too Late', regionId: 'region-1', worldId: 'world-1' } }), { tag })]);
        await pending;
        await flushMicrotasks();

        assert(claimIds(harness.refs).length === 0, '24. a discovery response arriving after unmount never updates nearbyPlaceNamingClaims');
        assert(harness.refs.placeNamingDiscoveryError === null, '25. it never sets an error indicator either — the post-unmount callback never runs at all');

        console.log('✓ Section J: unmounting World View while discovery is pending causes no post-unmount mutation');
    }

    // ---------------------------------------------------------------
    // Section K — identity isolation: two independent monitors/sessions
    // never share nearby claims, errors, or request-id race outcomes.
    // ---------------------------------------------------------------
    {
        const sessionX = makeSession([{ id: 'region-1', worldId: 'world-x', position: pos(0, 0) }]);
        const sessionY = makeSession([{ id: 'region-1', worldId: 'world-y', position: pos(0, 0) }]);
        const tagX = derivePlaceNamingDiscoveryTag('world-x', 'region-1');
        const tagY = derivePlaceNamingDiscoveryTag('world-y', 'region-1');
        const relayX = makeRelay(() => deferred());
        const relayY = makeRelay((t) => (t === tagY ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-y-only', name: 'Y World Place', regionId: 'region-1', worldId: 'world-y' } }), { tag: tagY })] : []));
        const harnessX = createHarness({ session: sessionX, relay: relayX });
        const harnessY = createHarness({ session: sessionY, relay: relayY });

        // X's own request hangs; Y's own request, on a completely
        // separate monitor/session/relay, resolves immediately and is
        // entirely unaffected.
        const pendingX = harnessX.tick(pos(0, 0));
        await flushMicrotasks();
        await harnessY.tick(pos(0, 0));
        assert(claimIds(harnessY.refs).length === 1 && claimIds(harnessY.refs)[0] === 'claim-y-only',
            '26. instance Y observes its own claim independently, entirely unaffected by instance X\'s own still-pending request');
        assert(claimIds(harnessX.refs).length === 0, 'sanity: X has not yet resolved anything of its own');

        relayX.deferrals[0].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-x-only', name: 'X World Place', regionId: 'region-1', worldId: 'world-x' } }), { tag: tagX })]);
        await pendingX;

        assert(claimIds(harnessX.refs).length === 1 && claimIds(harnessX.refs)[0] === 'claim-x-only',
            '27. instance X, once its own request finally settles, shows only its own World\'s claim');
        assert(claimIds(harnessY.refs).length === 1 && claimIds(harnessY.refs)[0] === 'claim-y-only',
            '28. instance Y\'s own already-displayed result is untouched by X\'s later resolution — no shared nearbyPlaceNamingClaims, no shared error, no shared request-id counter');
        assert(harnessX.refs.placeNamingDiscoveryError === null && harnessY.refs.placeNamingDiscoveryError === null,
            '29. neither instance\'s own error state ever leaks into the other\'s');

        console.log('✓ Section K: two independent World View instances never share claims, errors, or request-id race outcomes');
    }

    // ---------------------------------------------------------------
    // Section L — discovery-source failure isolation: one failing
    // source never suppresses another, succeeding one. Proves the real
    // `PlaceNamingDiscoveryQueryService.search()`'s own
    // `Promise.allSettled()` contract holds when driven through the full
    // monitor pipeline, not merely tested against the aggregator alone.
    // ---------------------------------------------------------------
    {
        const worldId = 'world-1';
        const regionId = 'region-1';
        const tag = derivePlaceNamingDiscoveryTag(worldId, regionId);

        // A directly-constructed aggregator with two sources: one whose
        // relay query rejects outright, one that succeeds.
        const failingSource = new NostrPlaceNamingDiscoverySource({
            relayUrl: 'wss://down.example',
            queryImpl: async () => { throw new Error('relay unreachable'); }
        });
        const succeedingSource = new NostrPlaceNamingDiscoverySource({
            relayUrl: 'wss://up.example',
            queryImpl: async (relayUrl, filter) => [nostrEventFor(envelopeOf({ claim: { id: 'claim-from-good-source', worldId, regionId, name: 'Reached Anyway' } }), { tag: filter['#t'][0] })]
        });
        const directQueryService = new PlaceNamingDiscoveryQueryService([failingSource, succeedingSource]);

        const directResult = await directQueryService.search(tag);
        assert(directResult.length === 1 && directResult[0].claim.id === 'claim-from-good-source',
            '30. PlaceNamingDiscoveryQueryService.search() never rejects when one of its sources fails — the succeeding source\'s own result is still returned');

        // Now drive the SAME two sources through the full monitor
        // pipeline, proving the isolation holds end to end, not merely at
        // the aggregator's own boundary.
        const session = makeSession([{ id: regionId, worldId, position: pos(0, 0) }]);
        const nostrSourceStub = { search: () => Promise.reject(new Error('unreachable')) };
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-through-monitor', worldId, regionId, name: 'Through Monitor' } }), { tag })] : []));
        const harness = createHarness({ session, relay, extraSources: [nostrSourceStub] });

        await harness.tick(pos(0, 0));
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-through-monitor',
            '31. end to end, through the real monitor, a failing sibling source never prevents a succeeding source\'s own claim from being discovered and presented');
        assert(harness.refs.placeNamingDiscoveryError === null,
            '32. a source-level failure absorbed by the aggregator\'s own isolation never surfaces as a monitor-level error — see Section F for what genuinely DOES reach the monitor as an error');

        console.log('✓ Section L: discovery-source failure isolation — one failing source never suppresses a succeeding sibling, at the aggregator and end to end');
    }

    // ---------------------------------------------------------------
    // Section M — position-resolution isolation: an unresolvable claim
    // disappears without poisoning its neighbors.
    // ---------------------------------------------------------------
    {
        const worldId = 'world-1';
        // `region-known` is a real region this replica knows about.
        // `region-unknown` never appears in session.getRegions() at all —
        // a claim naming it can never be spatially resolved.
        // `region-corrupt` IS known, but its own `.position` getter
        // throws — simulating a broken/partial layout entry.
        const session = makeSession([
            { id: 'region-known', worldId, position: pos(0, 0) },
            { id: 'region-corrupt', worldId, get position() { throw new Error('layout entry corrupted'); } }
        ]);
        const tagKnown = derivePlaceNamingDiscoveryTag(worldId, 'region-known');
        const tagUnknown = derivePlaceNamingDiscoveryTag(worldId, 'region-unknown');
        const tagCorrupt = derivePlaceNamingDiscoveryTag(worldId, 'region-corrupt');
        const relay = makeRelay((t) => {
            if (t === tagKnown) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-resolvable', worldId, regionId: 'region-known', name: 'Resolvable' } }), { tag: t })];
            if (t === tagUnknown) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-unknown-region', worldId, regionId: 'region-unknown', name: 'Unknown Region' } }), { tag: t })];
            if (t === tagCorrupt) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-corrupt-region', worldId, regionId: 'region-corrupt', name: 'Corrupt Region' } }), { tag: t })];
            return [];
        });
        // A discovery command that ALSO queries the unresolvable region's
        // own tag — mirroring a real scenario where a discovered claim's
        // `regionId` no longer matches anything in the current layout
        // (session.getRegions() only lists region-known/region-corrupt,
        // but the relay is still asked about region-unknown too, exactly
        // as it would be if this replica used to know about it).
        const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource] });
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.all([
                executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: tagKnown, discoveryQueryService: queryService }),
                executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: tagUnknown, discoveryQueryService: queryService }),
                executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: tagCorrupt, discoveryQueryService: queryService })
            ]).then((perTagResults) => perTagResults.flat()),
            resolveClaimPosition: (envelope) => {
                const region = session.getRegions().find((r) => r.worldId === envelope.worldId && r.id === envelope.regionId);
                return region ? region.position : null;
            }
        });

        await monitor.observe(pos(0, 0));

        const ids = (monitor.lastResult || []).map((c) => c.claim.id);
        assert(ids.length === 1 && ids[0] === 'claim-resolvable',
            '33. only the claim whose region genuinely resolves survives proximity selection');
        assert(!ids.includes('claim-unknown-region'),
            '34. a claim naming a region this replica does not know about disappears from presentation without throwing');
        assert(!ids.includes('claim-corrupt-region'),
            '35. a claim whose region lookup itself throws (a resolver-side exception) disappears too, without poisoning the OTHER, genuinely resolvable claim');
        assert(monitor.lastError === null,
            '36. neither an unknown region nor a throwing position resolver ever surfaces as a discovery-level error — both degrade silently to "not nearby," per PlaceNamingDiscoveryMonitor\'s own documented one-bad-entry-never-poisons-its-neighbors contract');

        console.log('✓ Section M: position-resolution isolation — an unresolvable or resolver-throwing claim disappears without poisoning valid neighbors');
    }

    // ---------------------------------------------------------------
    // Section N — semantic negative tests: the complete automatic path
    // never verifies, adopts, ranks, persists, or renames.
    // ---------------------------------------------------------------
    {
        // (1) A claim with an obviously fake signature is still
        // discovered and presented — proving no cryptographic
        // verification happens anywhere in this automatic path. Envelope
        // parsing checks SHAPE only (see core/PlaceNamingDiscoveryEnvelope.js's
        // own header); it never calls
        // identity/LocalAuthorizationVerifier.js.
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', get name() { return 'Original Region Name'; } , position: pos(0, 0) }]);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const forgedSignature = signatureOf({ signature: 'totally-fabricated-not-a-real-signature', signer: 'did:key:zForger' });
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-forged', name: 'Forged Name', regionId: 'region-1', worldId: 'world-1', authorIdentityId: 'did:key:zForger', signature: forgedSignature } }), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));
        assert(claimIds(harness.refs).length === 1 && claimIds(harness.refs)[0] === 'claim-forged',
            '37. a claim carrying an obviously fabricated signature is still discovered and presented — this pipeline never verifies signature authenticity');

        // (2) That same automatic cycle never touched the World
        // location's own name — the Proxy guard already forbids any
        // session method beyond getRegions(), and the region's own
        // `.name` getter (read here directly, outside the guarded
        // session) confirms it was never mutated.
        assert(session.getRegions()[0].name === 'Original Region Name',
            '38. discovering and presenting a claim never renames the World location it describes');

        // (3) A structural scan of the entire pipeline (every file this
        // milestone's own header diagrams) proves none of them import a
        // verification, adoption, persistence, or registration
        // collaborator, and none contain a ranking/sorting/authority
        // vocabulary of their own.
        const pipelineFiles = [
            'application/PlaceNamingDiscoveryMonitor.js',
            'application/PlaceNamingDiscoveryQueryService.js',
            'application/DiscoverPlaceNamingClaimsCommand.js',
            'application/NostrPlaceNamingDiscoverySource.js',
            'application/PlaceNamingDiscoveryRuntimeComposition.js',
            'core/PlaceNamingProximitySelection.js',
            'core/PlaceNamingDiscoveryEnvelope.js'
        ];
        const forbiddenTerms = [
            'LocalAuthorizationVerifier', 'LocalPlaceNamingClaimStore', 'PlaceNamingClaimExchange',
            'verify(', '.adopt(', '.register(', 'rankClaimsByName', '.sort(', 'isPrimary', 'isOfficial',
            'authoritative', 'localStorage', 'indexedDB', 'updateRegion(', 'renameRegion(', 'setWorldRegion('
        ];
        for (const file of pipelineFiles) {
            const code = await codeOnlySource(file);
            for (const term of forbiddenTerms) {
                assert(!code.includes(term), `39. ${file} never contains '${term}' — no verification, ranking, adoption, registration, or persistence anywhere in the discovery/proximity pipeline`);
            }
        }

        console.log('✓ Section N: semantic negative tests — the complete automatic path never verifies, adopts, ranks, persists, or renames (dynamic proof + static pipeline scan)');
    }

    // ---------------------------------------------------------------
    // FLAGSHIP — "Riverside" and "Old River": two independently authored
    // claims for the same ground, both displayed, neither preferred.
    // Protects the architecture against the single most tempting future
    // regression: silently turning proximity into authority.
    // ---------------------------------------------------------------
    {
        const worldId = 'world-1';
        const regionId = 'region-riverbank';
        const tag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const riversideEvent = nostrEventFor(envelopeOf({ claim: { id: 'claim-riverside', worldId, regionId, name: 'Riverside', authorIdentityId: 'did:key:zAlice', createdAt: '2026-01-01T00:00:00.000Z' } }), { tag, pubkey: 'pk-alice' });
        const oldRiverEvent = nostrEventFor(envelopeOf({ claim: { id: 'claim-old-river', worldId, regionId, name: 'Old River', authorIdentityId: 'did:key:zBob', createdAt: '2026-01-02T00:00:00.000Z' } }), { tag, pubkey: 'pk-bob' });

        const session = makeSession([{ id: regionId, worldId, position: pos(0, 0) }]);
        const relay = makeRelay((t) => (t === tag ? [riversideEvent, oldRiverEvent] : []));
        const harness = createHarness({ session, relay });

        await harness.tick(pos(0, 0));

        assert(claimIds(harness.refs).length === 2, '40. FLAGSHIP — both independently authored claims for the exact same ground are displayed simultaneously');
        assert(claimIds(harness.refs).join(',') === 'claim-riverside,claim-old-river',
            '41. FLAGSHIP — both appear in discovery order, neither reordered ahead of the other by recency, author, or any other criterion');

        const names = harness.refs.nearbyPlaceNamingClaims.map((c) => c.claim.name);
        assert(names.includes('Riverside') && names.includes('Old River'),
            '42. FLAGSHIP — both names survive verbatim; neither is chosen as "the" name for this place');

        for (const entry of harness.refs.nearbyPlaceNamingClaims) {
            for (const flag of ['isPrimary', 'isOfficial', 'authoritative', 'winner', 'confirmed', 'isCurrentName']) {
                assert(!(flag in entry) && !(flag in entry.claim),
                    `43. FLAGSHIP — neither claim ever carries an authority flag ("${flag}") — proximity selection never becomes name authority, even when two claims genuinely compete for the same ground`);
            }
        }
        assert(entriesShareExactPosition(harness.refs.nearbyPlaceNamingClaims),
            'sanity: both claims genuinely resolve to the exact same position, the scenario this test is meant to stress');

        console.log('✓ FLAGSHIP: "Riverside" and "Old River" — two competing claims for the same ground, both displayed, neither preferred: proximity is never authority');
    }

    console.log('\n✅ All Place Naming End-to-End & Lifecycle Audit tests passed.');
}

function entriesShareExactPosition(entries) {
    if (entries.length < 2) return false;
    const [first, ...rest] = entries;
    return rest.every((e) => e.position.x === first.position.x && e.position.z === first.position.z);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
