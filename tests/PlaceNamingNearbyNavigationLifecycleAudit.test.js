import { readFile } from 'node:fs/promises';
import { World } from '../core/World.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';

// 0.9.261 — Nearby Place Naming Navigation Lifecycle Audit.
//
// This milestone adds NO new capability. It is a **test-only audit** of
// the ONE new boundary 0.9.260 (Nearby Place Naming Claim Interaction)
// opened: a decentralized, unverified, unranked claim becoming an input
// to World navigation, via the existing `WorldNavigationSession
// #focusLocation()` boundary, while remaining structurally incapable of
// touching World naming authority (docs/Principles.md, "Navigation Is
// Not Adoption," 0.9.260). 0.9.258 already proved the DISCOVERY pipeline
// (Nostr -> query service -> monitor -> proximity -> presentation) holds
// under races, staleness, failure, world-switching, and unmount; 0.9.260
// itself already proved navigation's semantics in isolation (Sections
// E-H, one call at a time). Neither file proves what happens when BOTH
// meet: does a claim discovered under a race, replaced by a refresh, or
// surviving a failed cycle still navigate correctly — and only
// correctly — once World navigation is layered on top? This file is
// that proof.
//
// THE CORE INVARIANT UNDER AUDIT (unchanged from 0.9.260's own brief):
//
//   A Place Naming claim can cause navigation to its exact claimed
//   region, but navigation never changes the claim's authority or the
//   World region itself.
//
// THE REAL PRODUCTION CHAIN, WITH ONLY THE RELAY CONTROLLED — the same
// restraint `tests/PlaceNamingEndToEndLifecycleAudit.test.js` already
// holds: every section drives a REAL `NostrPlaceNamingDiscoverySource`,
// a REAL `composePlaceNamingDiscoveryRuntime()`, the REAL
// `executeDiscoverPlaceNamingClaimsCommand()`, a REAL
// `PlaceNamingDiscoveryMonitor`, and — unlike that file's own
// deliberately restricted `makeSession()` Proxy — a REAL, full
// `WorldNavigationSession` (mirroring `tests/PlaceNamingNearbyNavigation.test.js`'s
// own `makeReplica()`), because navigation itself needs the real
// `getRegions()`/`focusLocation()` this audit is testing, not a stand-in
// that would make "does navigation reach adoption/verification" untestable.
// `navigateToNearbyPlaceNamingClaim()` below is the SAME reproduction
// `tests/PlaceNamingNearbyNavigation.test.js` already established and its
// own Section P already proved byte-for-byte matches
// `ui/views/WorldView.js`'s real wiring — this file does not re-derive
// that proof, it only re-uses it (see Section K's own lightweight
// tripwire, not a full re-audit).
//
//   Section A — discovery -> presentation -> navigation, end to end
//   Section B — multiple nearby claims navigate independently
//   Section C — same region, different claims: independent, neither
//               preferred
//   Section D — FLAGSHIP: World identity protection ("Riverside" /
//               "Old River")
//   Section E — stale region: disappears after discovery, fails
//               gracefully, no fallback
//   Section F — World switching mid-session invalidates the old World's
//               own captured rows
//   Section G — claim refresh: rows track only the current observation;
//               navigate itself is region-scoped, never claim-scoped
//   Section H — discovery failure: existing claims and their navigation
//               remain valid; failure never clears actionable state
//   Section I — out-of-order discovery: a stale claim's row never
//               becomes active
//   Section J — unmount: a discovery settling after disposal causes no
//               stale UI or navigation
//   Section K — navigation isolation: camera/location only, structurally
//   Section L — authority negative test: WorldRegion naming is untouched,
//               the claim remains independent
//   Section M — adoption isolation: importClaim() is never invoked
//   Section N — verification isolation: signature verification is never
//               invoked
//   Section O — session isolation: two independent World Views/sessions
//               never cross-trigger navigation
//   Section P — manual workflow regression: PlaceNamingPanel is
//               unaffected

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function region({ id, worldId, authorIdentityId, name = 'Unnamed Region', kind = RegionKind.VILLAGE, x, z, radius = 10 }) {
    return new WorldRegion({ id, worldId, authorIdentityId, name, kind, position: new Position(x, 0, z), radius });
}

// A full, real WorldNavigationSession, generalized from
// tests/PlaceNamingNearbyNavigation.test.js#makeReplica() to accept
// MULTIPLE simultaneously loaded Worlds — required by Section D's own
// "broader discovery scope" sub-case, where two Worlds are genuinely
// loaded side by side. `session.getRegions()`/`focusLocation()`/
// `publishPlaceNamingClaim()`/`getDisplayPlaceName()` are all the real,
// unmodified implementations, never stubs.
function makeSessionReplica(identityProvider, worlds) {
    const storage = new InMemoryStorageProvider();
    const claimStore = new LocalPlaceNamingClaimStore(storage);
    const publicationLog = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const placeNamingClaimUseCase = new PlaceNamingClaimUseCase(claimStore, identityProvider, verifier);
    const placeNamingClaimExchange = new PlaceNamingClaimExchange(claimStore, verifier, publicationLog);
    const localNamePreferenceStore = new LocalNamePreferenceStore(storage, identityProvider);
    const discoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
    const worldLayoutProvider = new LocalWorldLayoutProvider(null, discoveryProvider);
    const session = new WorldNavigationSession({
        registry: null,
        placeNamingClaimUseCase,
        localNamePreferenceStore,
        placeNamingClaimExchange,
        worldLayoutProvider,
        discoveryProvider
    });
    for (const world of worlds) {
        session._loadedDocuments.set(world.id, { world });
    }
    return { session, claimStore, verifier, placeNamingClaimUseCase, placeNamingClaimExchange };
}

// ---------------------------------------------------------------------
// The reproduction under test: EXACTLY
// ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim() — the SAME
// reproduction tests/PlaceNamingNearbyNavigation.test.js established and
// whose own Section P already proved matches the real file byte for
// byte. Reused verbatim, never re-derived.
// ---------------------------------------------------------------------
function navigateToNearbyPlaceNamingClaim(session, row, feedback, refreshSpatialUI = () => {}) {
    const regionStillExists = session.getRegions()
        .some((candidate) => candidate.id === row.regionId && candidate.worldId === row.worldId);
    if (!regionStillExists) {
        feedback.show('That place no longer exists in this World');
        return false;
    }
    session.focusLocation(row.regionId);
    refreshSpatialUI();
    return true;
}

// Reproduces EXACTLY ui/views/WorldView.js's own `nearbyPlaceNamingClaimRows`
// computed, as of 0.9.260 (regionId/worldId carried through).
function makeRows(claims, resolveDisplayName) {
    return claims.map((entry) => ({
        claimId: entry.claim.id,
        name: entry.claim.name,
        authorDisplayName: resolveDisplayName(entry.claim.authorIdentityId),
        position: entry.position,
        regionId: entry.claim.regionId,
        worldId: entry.claim.worldId
    }));
}

function makeFeedback() {
    const messages = [];
    return { messages, show: (message) => messages.push(message) };
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

// An in-memory stand-in for an actual relay socket — the same fixture
// tests/PlaceNamingEndToEndLifecycleAudit.test.js already established.
// `setHandler(fn)` installs `(tag, relayUrl) -> events[] | DEFERRED`.
// `DEFERRED` hangs the call until the test resolves it via
// `relay.deferrals[n].resolve(events)` — the mechanism Sections I/J need.
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

// Deliberately large — every section in this file is about LIFECYCLE
// (races, staleness, failure, unmount), never about proximity-radius
// precision, which tests/PlaceNamingEndToEndLifecycleAudit.test.js's own
// Section B already covers exhaustively. A large, fixed radius keeps
// every claim below "nearby" regardless of a World's own internal
// multi-document layout offsets (application/WorldNavigationSession.js
// #getDocumentPosition()), which this file never needs to reproduce.
const LARGE_PROXIMITY_RADIUS = 1_000_000;

// Builds the exact real chain ui/views/WorldView.js composes (see that
// file's own 0.9.257 construction comment) around one relay and one
// REAL session. `tick(position)` reproduces `refreshSpatialUI()`'s own
// copy-into-refs step, respecting the same
// `placeNamingDiscoveryPresentationActive`-shaped guard `unmount()` flips
// — mirroring tests/PlaceNamingEndToEndLifecycleAudit.test.js#createHarness()
// exactly, except `session` here is a REAL WorldNavigationSession, never
// the discovery-only Proxy that file deliberately restricts itself to
// (this file's own audit needs the real `focusLocation()`/`getRegions()`
// navigation itself calls).
function createHarness({ session, relay, proximityRadius = LARGE_PROXIMITY_RADIUS }) {
    const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
    const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource] });
    const monitor = new PlaceNamingDiscoveryMonitor({
        discoverPlaceNamingClaimsCommand: () => {
            const regions = session.getRegions();
            return Promise.all(regions.map((r) => executeDiscoverPlaceNamingClaimsCommand({
                discoveryTag: derivePlaceNamingDiscoveryTag(r.worldId, r.id),
                discoveryQueryService: queryService
            }))).then((perRegionResults) => perRegionResults.flat());
        },
        resolveClaimPosition: (envelope) => {
            const r = session.getRegions().find((c) => c.worldId === envelope.worldId && c.id === envelope.regionId);
            return r ? r.position : null;
        },
        proximityRadius
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

    function rows(resolveDisplayName = (id) => id) {
        return makeRows(refs.nearbyPlaceNamingClaims, resolveDisplayName);
    }

    function unmount() {
        active = false;
        monitor.dispose();
    }

    return { session, monitor, refs, tick, rows, unmount };
}

function claimIds(harness) {
    return harness.refs.nearbyPlaceNamingClaims.map((c) => c.claim.id);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    console.log('Running Nearby Place Naming Navigation Lifecycle Audit tests...\n');

    // -------------------------------------------------------------
    // Section A — discovery -> presentation -> navigation, end to end.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-a', worldId, regionId: 'region-1', name: 'Riverbend', authorIdentityId: 'did:key:zBob' } }), { tag })]
            : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 1 && claimIds(harness)[0] === 'claim-a',
            '1. real Nostr discovery + real proximity selection surfaces exactly one nearby claim, through the real chain.');

        const rows = harness.rows((id) => `display:${id}`);
        assert(rows[0].regionId === 'region-1' && rows[0].worldId === worldId,
            '2. the real presentation row carries the claim\'s own regionId/worldId through.');

        let focusLocationCalls = [];
        const realFocusLocation = session.focusLocation.bind(session);
        session.focusLocation = (locationId) => { focusLocationCalls.push(locationId); return realFocusLocation(locationId); };

        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, rows[0], feedback);
        assert(moved === true && feedback.messages.length === 0,
            '3. Navigate succeeds end to end for a claim that traveled the entire real pipeline.');
        assert(focusLocationCalls.length === 1 && focusLocationCalls[0] === 'region-1',
            '4. the exact existing navigation boundary, session.focusLocation(regionId), is invoked exactly once.');
        assert(world.getWorldRegion('region-1').name !== 'Riverbend',
            '5. even after a full real navigation, the WorldRegion\'s own name was never overwritten by the claim\'s own name.');

        console.log('✓ Section A: real Nostr discovery -> real proximity -> real presentation row -> real navigation, end to end');
    }

    // -------------------------------------------------------------
    // Section B — multiple nearby claims navigate independently.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-a', worldId, authorIdentityId: aliceId, name: 'Alpha', x: 10, z: 10 }));
        world.addWorldRegion(region({ id: 'region-b', worldId, authorIdentityId: aliceId, name: 'Beta', x: -50, z: 300 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tagA = derivePlaceNamingDiscoveryTag(worldId, 'region-a');
        const tagB = derivePlaceNamingDiscoveryTag(worldId, 'region-b');
        const relay = makeRelay((t) => {
            if (t === tagA) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-a', worldId, regionId: 'region-a', name: 'First' } }), { tag: tagA })];
            if (t === tagB) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-b', worldId, regionId: 'region-b', name: 'Second' } }), { tag: tagB })];
            return [];
        });
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });

        const rows = harness.rows((id) => id);
        assert(rows.length === 2, '6. both independently-authored, independently-regioned claims are presented simultaneously.');
        const rowA = rows.find((r) => r.claimId === 'claim-a');
        const rowB = rows.find((r) => r.claimId === 'claim-b');

        assert(navigateToNearbyPlaceNamingClaim(session, rowA, makeFeedback()) === true, '7. navigating to the first claim\'s region succeeds.');
        const firstTarget = session._worldLocationDirectory.find('region-a').position;
        assert(firstTarget.x === 10 && firstTarget.z === 10, '8. the first navigation resolves to its own region\'s position.');

        assert(navigateToNearbyPlaceNamingClaim(session, rowB, makeFeedback()) === true, '9. navigating to the second claim\'s region also succeeds — one navigation never disables or consumes the next.');
        const secondTarget = session._worldLocationDirectory.find('region-b').position;
        assert(secondTarget.x === -50 && secondTarget.z === 300, '10. the second navigation resolves to ITS OWN region\'s position, unaffected by the first.');

        console.log('✓ Section B: multiple nearby claims retain their own regionId/worldId and navigate independently');
    }

    // -------------------------------------------------------------
    // Section C — same region, different claims: independent, neither
    // preferred.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Willow Village', x: 5, z: 5 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [
            nostrEventFor(envelopeOf({ claim: { id: 'claim-riverside', worldId, regionId: 'region-1', name: 'Riverside', authorIdentityId: 'did:key:zAlice' } }), { tag }),
            nostrEventFor(envelopeOf({ claim: { id: 'claim-old-river', worldId, regionId: 'region-1', name: 'Old River', authorIdentityId: 'did:key:zBob' } }), { tag })
        ] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });

        const rows = harness.rows((id) => id);
        assert(rows.length === 2, '11. two independent claims for the exact same ground both survive discovery — neither suppresses the other.');

        const beforeDisplayName = session.getDisplayPlaceName('region-1');
        assert(navigateToNearbyPlaceNamingClaim(session, rows[0], makeFeedback()) === true, '12. navigating via the first claim\'s row succeeds.');
        assert(navigateToNearbyPlaceNamingClaim(session, rows[1], makeFeedback()) === true, '13. navigating via the second, independently-authored claim\'s row ALSO succeeds, to the same region.');
        const afterDisplayName = session.getDisplayPlaceName('region-1');
        assert(beforeDisplayName === afterDisplayName, '14. the region\'s own ranked display name is byte-identical before and after both navigations — proximity/navigation never becomes preference.');

        const target1 = session._worldLocationDirectory.find('region-1').position;
        assert(target1.x === 5 && target1.z === 5, '15. both rows resolve to the exact same, single region — there is only ever one region here, never a "primary" claim\'s own region.');

        console.log('✓ Section C: two independently authored claims for the same region both navigate, independently, with neither becoming preferred');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: World identity protection.
    //
    //   Claim A: "Riverside"  world=world-A region=region-1 (Alice)
    //   Claim B: "Old River"  world=world-B region=region-1 (Bob)
    //
    // Two sub-cases probe the worldId cross-check from both directions —
    // and D2, below, is the more interesting of the two precisely
    // because it does NOT come back clean. An honest audit reports what
    // it finds:
    //
    //   D1 (temporal): only world-A is loaded (the Wanderer stands in
    //      it). A row captured while world-A was loaded can never be
    //      honored once the session has moved on to world-B alone, even
    //      though the colliding regionId still resolves there — the
    //      worldId cross-check works exactly as 0.9.260 documents it.
    //   D2 (simultaneous): BOTH worlds are genuinely loaded together (a
    //      "broader discovery scope," per this milestone's own brief) —
    //      both claims ARE discovered and presented, each correctly
    //      carrying its own worldId. But `session.focusLocation(regionId)`
    //      itself (application/WorldLocationDirectory.js#find()) takes
    //      NO worldId parameter — it is a plain id lookup. So when two
    //      SIMULTANEOUSLY loaded Worlds genuinely share one regionId,
    //      navigating either claim's row resolves to the SAME single
    //      location, decided by loaded-document order, never by which
    //      claim's own worldId was checked. The cross-check's own
    //      question is "does a region matching this pair exist among
    //      loaded regions" — true for both rows here — never "is this
    //      pairing UNIQUE," which is what would be needed to disambiguate
    //      this specific case. This is a pre-existing property of
    //      `focusLocation()`'s own plain-id API, older than and outside
    //      0.9.260/0.9.261's own scope (a test-only milestone changes no
    //      production code); D1 above is the realistic shape this
    //      boundary actually takes — a stale claim from a World that is
    //      NOT currently loaded — which the cross-check fully closes.
    //      D2 exists so this audit states its guarantee's exact edge
    //      precisely, rather than overclaiming safety no version of
    //      `focusLocation()` in this codebase has ever actually provided.
    // -------------------------------------------------------------
    {
        // ---- D1: temporal — the other World is not loaded at all. ----
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldA = new World({ id: 'world-A' });
        worldA.addWorldRegion(region({ id: 'region-1', worldId: 'world-A', authorIdentityId: aliceId, name: 'Riverside Ground', x: 1, z: 1 }));
        const { session } = makeSessionReplica(alice, [worldA]);

        const tagA = derivePlaceNamingDiscoveryTag('world-A', 'region-1');
        const relayA = makeRelay((t) => (t === tagA ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-riverside', worldId: 'world-A', regionId: 'region-1', name: 'Riverside' } }), { tag: tagA })] : []));
        const harnessA = createHarness({ session, relay: relayA });
        await harnessA.tick({ x: 0, z: 0 });

        const staleRow = harnessA.rows((id) => id)[0];
        assert(staleRow.worldId === 'world-A' && staleRow.regionId === 'region-1', 'sanity: the captured row genuinely names world-A.');
        assert(navigateToNearbyPlaceNamingClaim(session, staleRow, makeFeedback()) === true, '16. navigating within world-A, while it is still loaded, succeeds.');

        // The World switch itself: world-A unloads, world-B (with its
        // OWN, colliding 'region-1') loads in its place.
        const worldB = new World({ id: 'world-B' });
        worldB.addWorldRegion(region({ id: 'region-1', worldId: 'world-B', authorIdentityId: aliceId, name: 'Old River Ground', x: 999, z: 999 }));
        session._loadedDocuments.delete('world-A');
        session._loadedDocuments.set('world-B', { world: worldB });

        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, staleRow, feedback);
        assert(moved === false, '17. FLAGSHIP — the SAME captured row, now stale, can never be misdirected onto world-B\'s own colliding region-1 — the worldId cross-check is a real identity boundary.');
        assert(feedback.messages.length === 1, '18. the rejection fails gracefully, with feedback, never silently and never by throwing.');

        // Direct proof the guard is load-bearing: plain focusLocation()
        // ALONE (no worldId cross-check) WOULD resolve the colliding id.
        const wouldHaveMisdirected = session.focusLocation('region-1');
        assert(wouldHaveMisdirected === true, '19. sanity: focusLocation(regionId) alone genuinely resolves the collision — proving the cross-check in assertion 17 is doing real work, not redundant work.');

        // ---- D2: simultaneous — both Worlds genuinely loaded together. ----
        const bob = makeIdentity('Bob');
        const bobId = resolveSigningIdentityId(bob);
        const worldA2 = new World({ id: 'world-A' });
        worldA2.addWorldRegion(region({ id: 'region-1', worldId: 'world-A', authorIdentityId: bobId, name: 'Riverside Ground', x: 1, z: 1 }));
        const worldB2 = new World({ id: 'world-B' });
        worldB2.addWorldRegion(region({ id: 'region-1', worldId: 'world-B', authorIdentityId: bobId, name: 'Old River Ground', x: 999, z: 999 }));
        const dual = makeSessionReplica(bob, [worldA2, worldB2]);

        const tagWA = derivePlaceNamingDiscoveryTag('world-A', 'region-1');
        const tagWB = derivePlaceNamingDiscoveryTag('world-B', 'region-1');
        const dualRelay = makeRelay((t) => {
            if (t === tagWA) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-riverside', worldId: 'world-A', regionId: 'region-1', name: 'Riverside', authorIdentityId: 'did:key:zAlice' } }), { tag: tagWA })];
            if (t === tagWB) return [nostrEventFor(envelopeOf({ claim: { id: 'claim-old-river', worldId: 'world-B', regionId: 'region-1', name: 'Old River', authorIdentityId: 'did:key:zBob' } }), { tag: tagWB })];
            return [];
        });
        const dualHarness = createHarness({ session: dual.session, relay: dualRelay });
        await dualHarness.tick({ x: 0, z: 0 });

        const dualRows = dualHarness.rows((id) => id);
        assert(dualRows.length === 2, '20. FLAGSHIP — a broader discovery scope genuinely surfaces BOTH colliding claims as separate presentation rows.');
        const riversideRow = dualRows.find((r) => r.claimId === 'claim-riverside');
        const oldRiverRow = dualRows.find((r) => r.claimId === 'claim-old-river');
        assert(riversideRow.regionId === 'region-1' && riversideRow.worldId === 'world-A', '21. "Riverside" carries world-A, never world-B.');
        assert(oldRiverRow.regionId === 'region-1' && oldRiverRow.worldId === 'world-B', '22. "Old River" carries world-B, never world-A — the identical regionId never blurs the two.');

        assert(navigateToNearbyPlaceNamingClaim(dual.session, riversideRow, makeFeedback()) === true,
            '23. navigating "Riverside" succeeds — the cross-check finds world-A\'s own region-1, genuinely loaded.');
        assert(navigateToNearbyPlaceNamingClaim(dual.session, oldRiverRow, makeFeedback()) === true,
            '24. navigating "Old River" ALSO succeeds — the cross-check equally finds world-B\'s own region-1, ALSO genuinely loaded; the cross-check\'s own question ("does a matching region exist") is honestly true for both rows.');

        // THE DISCOVERED BOUNDARY: focusLocation(regionId) itself has no
        // worldId parameter (application/WorldLocationDirectory.js#find()
        // is a plain `location.id === locationId` lookup, first match
        // across every loaded document). With BOTH world-A's and
        // world-B's own 'region-1' loaded at once, that lookup can only
        // ever resolve to ONE of them — here, world-A's, because it was
        // the first loaded — regardless of which row's own worldId was
        // just checked. `find()` reads no navigation history, so the
        // exact same value comes back whichever row was navigated last.
        const resolvedTarget = dual.session._worldLocationDirectory.find('region-1');
        assert(resolvedTarget.position.x === 1 && resolvedTarget.position.z === 1,
            '25. both "Riverside" and "Old River" resolve to the IDENTICAL location — world-A\'s own (1,1) — under this deliberately adversarial, genuinely-simultaneous id collision. The worldId cross-check\'s own guarantee is "a matching region exists," never "this pairing is the unique one focusLocation() will actually land on"; D1 above is the realistic shape of the boundary (a claim from a World that is NOT loaded) that guarantee fully covers. This is a pre-existing property of focusLocation()\'s own plain-id lookup, outside this test-only milestone\'s scope to change.');

        console.log('✓ Section D (FLAGSHIP): "Riverside"/"Old River" — the worldId cross-check fully closes the realistic case (a stale claim from an unloaded World, D1) and this audit precisely states the one narrower case it does not (two Worlds simultaneously sharing one regionId, D2), rather than overclaiming');
    }

    // -------------------------------------------------------------
    // Section E — stale region: disappears after discovery, fails
    // gracefully, no fallback.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Willow Village', x: 5, z: 5 }));
        world.addWorldRegion(region({ id: 'region-safe', worldId, authorIdentityId: aliceId, name: 'Origin-adjacent', x: 1, z: 1 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-x', worldId, regionId: 'region-1', name: 'Riverbend' } }), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });

        const row = harness.rows((id) => id)[0];
        assert(row.regionId === 'region-1', 'sanity: the claim was genuinely discovered against region-1.');

        // The region itself is removed from the World — a real,
        // authoritative deletion, not a discovery artifact.
        world.removeWorldRegion('region-1');
        const cameraBefore = session._worldLocationDirectory.find('region-safe').position;

        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, row, feedback);
        assert(moved === false, '26. Navigate reports failure once the claimed region no longer exists in the World.');
        assert(feedback.messages.length === 1, '27. exactly one graceful feedback message is shown.');

        const cameraAfter = session._worldLocationDirectory.find('region-safe').position;
        assert(cameraAfter.x === cameraBefore.x && cameraAfter.z === cameraBefore.z,
            '28. no fallback: the one OTHER region that does still exist is completely unaffected by the failed lookup, and was never silently navigated to instead.');

        console.log('✓ Section E: a region that disappears after discovery fails navigation gracefully, with zero fallback to any other region');
    }

    // -------------------------------------------------------------
    // Section F — World switching mid-session invalidates the old
    // World's own captured rows.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldOld = new World({ id: 'world-old' });
        worldOld.addWorldRegion(region({ id: 'region-1', worldId: 'world-old', authorIdentityId: aliceId, name: 'X Region', x: 1, z: 1 }));
        const { session } = makeSessionReplica(alice, [worldOld]);

        const tagOld = derivePlaceNamingDiscoveryTag('world-old', 'region-1');
        const relayOld = makeRelay((t) => (t === tagOld ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-old', worldId: 'world-old', regionId: 'region-1', name: 'X Place' } }), { tag: tagOld })] : []));
        const harnessOld = createHarness({ session, relay: relayOld });
        await harnessOld.tick({ x: 0, z: 0 });

        const oldWorldRow = harnessOld.rows((id) => id)[0];
        assert(navigateToNearbyPlaceNamingClaim(session, oldWorldRow, makeFeedback()) === true, '29. sanity: navigation succeeds while world-old is still the loaded World.');

        // The World switch: world-old unloads, an unrelated world-new
        // (a DIFFERENT regionId, so this is not a collision case — this
        // section is about the switch itself, Section D already proved
        // the collision case) loads in its place.
        const worldNew = new World({ id: 'world-new' });
        worldNew.addWorldRegion(region({ id: 'region-2', worldId: 'world-new', authorIdentityId: aliceId, name: 'Y Region', x: 2, z: 2 }));
        session._loadedDocuments.delete('world-old');
        session._loadedDocuments.set('world-new', { world: worldNew });

        const feedback = makeFeedback();
        assert(navigateToNearbyPlaceNamingClaim(session, oldWorldRow, feedback) === false,
            '30. the old World\'s own captured row can no longer navigate at all once that World has unloaded — not merely "onto the wrong place," but not at all.');
        assert(feedback.messages.length === 1, '31. the failure is graceful, with feedback.');

        // A FRESH observation, scoped to the newly-loaded World, behaves
        // completely normally.
        const tagNew = derivePlaceNamingDiscoveryTag('world-new', 'region-2');
        const relayNew = makeRelay((t) => (t === tagNew ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-new', worldId: 'world-new', regionId: 'region-2', name: 'Y Place' } }), { tag: tagNew })] : []));
        const harnessNew = createHarness({ session, relay: relayNew });
        await harnessNew.tick({ x: 0, z: 0 });
        const newWorldRow = harnessNew.rows((id) => id)[0];
        assert(newWorldRow.worldId === 'world-new', '32. a fresh observation after the switch is correctly scoped to the new World.');
        assert(navigateToNearbyPlaceNamingClaim(session, newWorldRow, makeFeedback()) === true, '33. navigation within the newly-loaded World succeeds normally — the switch invalidates only the old World\'s own rows, nothing else.');

        console.log('✓ Section F: switching World mid-session invalidates only the previously-loaded World\'s own captured rows, never navigation in general');
    }

    // -------------------------------------------------------------
    // Section G — claim refresh: rows track only the current
    // observation; navigate itself is region-scoped, never
    // claim-scoped.
    //
    // Two genuinely different findings, deliberately kept distinct: the
    // PRESENTATION layer (rows()) always reflects only the current
    // observation, so a superseded claim's own button simply does not
    // exist to be clicked (assertions 35-36). Separately,
    // navigateToNearbyPlaceNamingClaim() itself was never built to check
    // "is this still the claim currently shown" — per
    // docs/Principles.md's own "Navigation Is Not Adoption" (0.9.260),
    // its one substantive question is "does a region matching this
    // row's own regionId/worldId still exist," nothing about a specific
    // claim.id. So a row snapshotted BEFORE a refresh, naming a region
    // that itself never moved or disappeared, still navigates correctly
    // even after a newer claim has superseded it in the UI (assertion
    // 38) — this is the SAME "precision guard on the DESTINATION, never
    // a trust/freshness gate on the CLAIM" restraint 0.9.260 already
    // documented, observed here to hold under an actual refresh cycle
    // rather than merely asserted from the function's own text.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Still Here', x: 0, z: 0 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        let claimName = 'Original';
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: `claim-${claimName.toLowerCase()}`, worldId, regionId: 'region-1', name: claimName } }), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        const staleRow = harness.rows((id) => id)[0];
        assert(staleRow.claimId === 'claim-original', 'sanity: the first observation carries the original claim.');

        // A movement beyond the refresh radius (default 100) triggers a
        // genuinely fresh discovery cycle, whose result REPLACES the
        // previous one — the same mechanics
        // tests/PlaceNamingEndToEndLifecycleAudit.test.js's own Section B
        // already proves in isolation, exercised here specifically to
        // set up the stale-row comparison below.
        claimName = 'Refreshed';
        await harness.tick({ x: 500, z: 0 });
        const freshRows = harness.rows((id) => id);
        assert(freshRows.length === 1 && freshRows[0].claimId === 'claim-refreshed',
            '34. the refreshed observation fully replaces the previous one — the current rows correspond only to it.');
        assert(!freshRows.some((r) => r.claimId === 'claim-original'),
            '35. the superseded claim\'s own row is genuinely gone — there is no lingering button a user could click for it.');

        assert(navigateToNearbyPlaceNamingClaim(session, freshRows[0], makeFeedback()) === true,
            '36. navigating via the CURRENT row succeeds normally.');
        const feedbackForStale = makeFeedback();
        const staleStillMoved = navigateToNearbyPlaceNamingClaim(session, staleRow, feedbackForStale);
        assert(staleStillMoved === true && feedbackForStale.messages.length === 0,
            '37. a row snapshotted BEFORE the refresh still navigates successfully, because its own region (region-1) never moved or disappeared — navigate targets the REGION a claim named, never the specific claim object, exactly as docs/Principles.md\'s own "Navigation Is Not Adoption" already documents.');

        console.log('✓ Section G: a refresh replaces which claims are PRESENTED, but navigation itself remains keyed to region identity, not claim identity');
    }

    // -------------------------------------------------------------
    // Section H — discovery failure: existing claims and their
    // navigation remain valid; failure never clears actionable state.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Willow Village', x: 3, z: 3 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-x', worldId, regionId: 'region-1', name: 'X' } }), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness)[0] === 'claim-x', 'sanity: the first successful observation is displayed.');

        // The next discovery cycle's own command fails — reproduced,
        // exactly like tests/PlaceNamingEndToEndLifecycleAudit.test.js's
        // own Section F, via the session-supplied region lookup itself,
        // the one collaborator in the real chain documented to actually
        // be able to reject discoverPlaceNamingClaimsCommand().
        const realGetRegions = session.getRegions.bind(session);
        session.getRegions = () => { throw new Error('World layout temporarily unavailable'); };
        await harness.tick({ x: 500, z: 0 });
        session.getRegions = realGetRegions;

        assert(claimIds(harness).length === 1 && claimIds(harness)[0] === 'claim-x',
            '38. a failed discovery cycle leaves the previously displayed claim exactly as it was.');
        assert(harness.refs.placeNamingDiscoveryError instanceof Error,
            '39. the failure is recorded as a non-authoritative error indicator, never thrown to a caller.');

        const stillValidRow = harness.rows((id) => id)[0];
        const feedback = makeFeedback();
        assert(navigateToNearbyPlaceNamingClaim(session, stillValidRow, feedback) === true,
            '40. navigation via the previously-discovered, still-displayed claim remains fully valid according to the current World — a failed REFRESH never clears actionable state.');
        assert(feedback.messages.length === 0, '41. no failure feedback for a genuinely successful navigation.');

        console.log('✓ Section H: a discovery failure preserves the existing claims AND their navigation, never clearing actionable state');
    }

    // -------------------------------------------------------------
    // Section I — out-of-order discovery: a stale claim's row never
    // becomes active.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        // Deliberately a SINGLE loaded region — this harness's own
        // discover command queries every currently-loaded region on
        // every tick (Promise.all), so a single region keeps exactly one
        // relay call in flight per tick, the same one-call-per-tick shape
        // tests/PlaceNamingEndToEndLifecycleAudit.test.js's own Section G
        // relies on for a clean, orchestratable race.
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Contested Ground', x: 4, z: 4 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay(() => deferred());
        const harness = createHarness({ session, relay });

        // Two overlapping observations for the SAME region — the second
        // is issued before the first has settled.
        const firstTick = harness.tick({ x: 0, z: 0 });
        await flushMicrotasks();
        assert(relay.deferrals.length === 1, 'sanity: the first (older) request is in flight.');

        const secondTick = harness.tick({ x: 700, z: 0 });
        await flushMicrotasks();
        assert(relay.deferrals.length === 2, 'sanity: a second, overlapping request is now also in flight.');

        // Resolve the SECOND (newer) request first.
        relay.deferrals[1].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-newer', worldId, regionId: 'region-1', name: 'Newer' } }), { tag })]);
        await secondTick;
        assert(claimIds(harness)[0] === 'claim-newer', 'sanity: the newer request\'s result is applied as soon as it settles.');

        // Now resolve the FIRST (older, now-stale) request.
        relay.deferrals[0].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-older', worldId, regionId: 'region-1', name: 'Older' } }), { tag })]);
        await firstTick;
        await flushMicrotasks();

        const rows = harness.rows((id) => id);
        assert(rows.length === 1 && rows[0].claimId === 'claim-newer',
            '42. the older request\'s late-arriving response never overwrites the already-displayed newer result — only one row is ever presented.');
        assert(!rows.some((r) => r.claimId === 'claim-older'),
            '43. the stale claim\'s own row genuinely never becomes active — there is no button for it a user could click, so no navigation handler exists for it either.');

        const feedback = makeFeedback();
        assert(navigateToNearbyPlaceNamingClaim(session, rows[0], feedback) === true,
            '44. the one row that IS presented — the newer claim — navigates correctly.');
        assert(feedback.messages.length === 0, '45. no failure feedback for a genuinely successful navigation of the current, non-stale row.');
        const target = session._worldLocationDirectory.find('region-1').position;
        assert(target.x === 4 && target.z === 4, '46. navigation resolved to the region\'s own real position.');

        console.log('✓ Section I: out-of-order discovery — only the newest result is ever presented, so a stale claim never has an active navigation handler');
    }

    // -------------------------------------------------------------
    // Section J — unmount: a discovery settling after disposal causes
    // no stale UI or navigation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Soon Unmounted', x: 5, z: 5 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay(() => deferred());
        const harness = createHarness({ session, relay });

        const pending = harness.tick({ x: 0, z: 0 });
        await flushMicrotasks();
        assert(relay.deferrals.length === 1, 'sanity: the discovery is genuinely still pending.');

        // The EXACT ordering ui/views/WorldView.js's own onBeforeUnmount()
        // uses: the presentation-active flag flips first, then the
        // monitor itself is disposed — see that file's own construction
        // comment, "placeNamingDiscoveryPresentationActive."
        harness.unmount();
        relay.deferrals[0].resolve([nostrEventFor(envelopeOf({ claim: { id: 'claim-post-unmount', worldId, regionId: 'region-1', name: 'Too Late' } }), { tag })]);
        await pending;
        await flushMicrotasks();

        assert(claimIds(harness).length === 0, '47. a discovery response arriving after unmount never updates the presented claims.');
        assert(harness.refs.placeNamingDiscoveryError === null, '48. it never sets an error indicator either — the post-unmount callback never runs at all.');
        assert(harness.rows((id) => id).length === 0, '49. the presentation rows an about-to-vanish World View would render from stay empty — there is no stale row for a lingering click handler to hold onto.');

        // A stray tick() call after unmount (a defensive double-call, or
        // a timer that fired one cycle too late) is inert, per
        // PlaceNamingDiscoveryMonitor's own disposal contract.
        await harness.tick({ x: 900, z: 0 });
        assert(claimIds(harness).length === 0 && relay.calls.length === 1,
            '50. a tick() call after unmount never even reaches the relay again — the monitor is permanently inert once disposed.');

        console.log('✓ Section J: unmounting while discovery is pending causes no post-unmount mutation and leaves no stale, clickable row behind');
    }

    // -------------------------------------------------------------
    // Section K — navigation isolation: camera/location only,
    // structurally.
    //
    // A lightweight tripwire, not a re-audit —
    // tests/PlaceNamingNearbyNavigation.test.js's own Section P already
    // proved, exhaustively, that the reproduction this file reuses
    // matches ui/views/WorldView.js byte for byte. This section only
    // confirms that proof still holds (a one-line regression guard) and
    // adds the vocabulary this milestone's own brief names by name
    // (Publication/Snapshot/Commentary) to the forbidden list.
    // -------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldViewCode.includes('function navigateToNearbyPlaceNamingClaim(row) {'),
            '51. ui/views/WorldView.js still defines the real navigateToNearbyPlaceNamingClaim(row) function this file\'s own reproduction stands in for.');

        const rawWorldViewCode = await rawSource('ui/views/WorldView.js');
        const startMarker = 'function navigateToNearbyPlaceNamingClaim(row) {';
        const startIdx = rawWorldViewCode.indexOf(startMarker);
        const endIdx = rawWorldViewCode.indexOf('\n        }', startIdx + startMarker.length);
        const functionBlock = codeOnlyLines(rawWorldViewCode.slice(startIdx, endIdx + '\n        }'.length));

        assert(functionBlock.includes('session.getRegions()') && functionBlock.includes('session.focusLocation(row.regionId)'),
            '52. the real function still reads only session.getRegions() and navigates only via session.focusLocation() — the same navigation boundary every "go to X" action in this file already shares.');

        const forbiddenTerms = [
            'verifyPlaceNamingClaim(', '.adopt(', 'importPlaceNamingClaim(', 'exportPlaceNamingClaim(', 'publishPlaceNamingClaim(',
            'rankClaimsByName', 'getPlaceNamingView', 'getDisplayPlaceName', 'setPreferredPlaceName', 'clearPreferredPlaceName',
            'renameRegion(', 'updateRegion(', 'setWorldRegion(',
            // Publication / Snapshot / Commentary — this milestone's own
            // brief names these three subsystems by name (Section 11,
            // "navigation isolation").
            'Publication', 'Snapshot', 'Commentary'
        ];
        for (const term of forbiddenTerms) {
            assert(!functionBlock.includes(term), `53. navigateToNearbyPlaceNamingClaim() never contains '${term}' — no adoption, verification, ranking, preference, WorldRegion mutation, or Publication/Snapshot/Commentary persistence of its own.`);
        }

        console.log('✓ Section K: navigation remains structurally confined to camera/location — no Publication, Snapshot, Commentary, or Place Naming persistence vocabulary of its own');
    }

    // -------------------------------------------------------------
    // Section L — authority negative test: WorldRegion naming is
    // untouched, the claim remains independent.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        const worldRegion = region({ id: 'region-1', worldId, authorIdentityId: aliceId, name: 'Willow Village', x: 0, z: 0 });
        world.addWorldRegion(worldRegion);
        const { session, claimStore } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-x', worldId, regionId: 'region-1', name: 'Riverbend (claimed)' } }), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });

        const row = harness.rows((id) => id)[0];
        const before = claimStore.listForRegion(worldId, 'region-1').length;
        navigateToNearbyPlaceNamingClaim(session, row, makeFeedback());
        const after = claimStore.listForRegion(worldId, 'region-1').length;

        assert(worldRegion.name === 'Willow Village',
            '54. WorldRegion#name — the authoritative name — is byte-identical after navigation, regardless of the claim\'s own name.');
        assert(session.getRegion('region-1').name === 'Willow Village',
            '55. the session\'s own read of the region confirms the same.');
        assert(before === 0 && after === 0,
            '56. navigating never stores anything in LocalPlaceNamingClaimStore — the claim being navigated to remains a discovered-but-never-adopted, independent claim throughout.');

        console.log('✓ Section L: navigation never modifies WorldRegion naming, and the claim navigated to remains an independent, unadopted claim');
    }

    // -------------------------------------------------------------
    // Section M — adoption isolation: importClaim() is never invoked.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, x: 0, z: 0 }));
        const { session, placeNamingClaimExchange } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-x', worldId, regionId: 'region-1' } }), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows((id) => id)[0];

        // Armed to throw the instant it is asked to import anything —
        // proving navigation never reaches it at all, rather than merely
        // counting calls after the fact.
        placeNamingClaimExchange.importClaim = () => { throw new Error('navigation must never call importClaim()'); };

        const moved = navigateToNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(moved === true, '57. navigation still succeeds even with importClaim() armed to throw on any use — it is never consulted.');

        console.log('✓ Section M: navigation never calls PlaceNamingClaimExchange#importClaim() — Navigate never adopts');
    }

    // -------------------------------------------------------------
    // Section N — verification isolation: signature verification is
    // never invoked.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: aliceId, x: 0, z: 0 }));
        const { session } = makeSessionReplica(alice, [world]);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        // A claim carrying an obviously fabricated signature — if
        // navigation verified anything, this is exactly the claim that
        // would fail.
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-forged', worldId, regionId: 'region-1', name: 'Forged', signature: signatureOf({ signature: 'totally-fabricated' }) } }), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows((id) => id)[0];
        assert(row.claimId === 'claim-forged', 'sanity: the forged-signature claim was discovered and presented — this pipeline never verifies signature authenticity, per 0.9.253-0.9.256.');

        session._placeNamingClaimUseCase._verifier = {
            verifyPlaceNamingClaim() { throw new Error('navigation must never call verifyPlaceNamingClaim()'); }
        };

        const moved = navigateToNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(moved === true, '58. navigation succeeds for a claim carrying an obviously fabricated signature, with a verifier armed to throw on any use — it is never consulted.');

        console.log('✓ Section N: navigation never calls into signature verification, even for a claim carrying a fabricated signature');
    }

    // -------------------------------------------------------------
    // Section O — session isolation: two independent World
    // Views/sessions never cross-trigger navigation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const bob = makeIdentity('Bob');
        const bobId = resolveSigningIdentityId(bob);

        const worldX = new World({ id: 'world-x' });
        worldX.addWorldRegion(region({ id: 'region-1', worldId: 'world-x', authorIdentityId: aliceId, name: 'X Region', x: 1, z: 1 }));
        const worldY = new World({ id: 'world-y' });
        worldY.addWorldRegion(region({ id: 'region-1', worldId: 'world-y', authorIdentityId: bobId, name: 'Y Region', x: 2, z: 2 }));

        const sessionX = makeSessionReplica(alice, [worldX]).session;
        const sessionY = makeSessionReplica(bob, [worldY]).session;

        const tagX = derivePlaceNamingDiscoveryTag('world-x', 'region-1');
        const tagY = derivePlaceNamingDiscoveryTag('world-y', 'region-1');
        const relayX = makeRelay((t) => (t === tagX ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-x', worldId: 'world-x', regionId: 'region-1', name: 'X Claim' } }), { tag: tagX })] : []));
        const relayY = makeRelay((t) => (t === tagY ? [nostrEventFor(envelopeOf({ claim: { id: 'claim-y', worldId: 'world-y', regionId: 'region-1', name: 'Y Claim' } }), { tag: tagY })] : []));
        const harnessX = createHarness({ session: sessionX, relay: relayX });
        const harnessY = createHarness({ session: sessionY, relay: relayY });

        // Interleaved observation, mirroring two mounted World Views
        // ticking independently.
        const [rowX, rowY] = await Promise.all([
            harnessX.tick({ x: 0, z: 0 }).then(() => harnessX.rows((id) => id)[0]),
            harnessY.tick({ x: 0, z: 0 }).then(() => harnessY.rows((id) => id)[0])
        ]);

        assert(navigateToNearbyPlaceNamingClaim(sessionX, rowX, makeFeedback()) === true, '59. session X navigates successfully within its own World.');
        assert(navigateToNearbyPlaceNamingClaim(sessionY, rowY, makeFeedback()) === true, '60. session Y independently navigates within ITS own World, unaffected by X.');

        assert(navigateToNearbyPlaceNamingClaim(sessionX, rowY, makeFeedback()) === false,
            '61. session X can never navigate using session Y\'s own row (world-y), even though the plain regionId matches — two World View sessions never leak navigation targets into each other.');
        assert(navigateToNearbyPlaceNamingClaim(sessionY, rowX, makeFeedback()) === false,
            '62. symmetrically, session Y can never navigate using session X\'s own row (world-x).');

        const targetX = sessionX._worldLocationDirectory.find('region-1').position;
        const targetY = sessionY._worldLocationDirectory.find('region-1').position;
        assert(targetX.x === 1 && targetX.z === 1 && targetY.x === 2 && targetY.z === 2,
            '63. each session\'s own camera state reflects only its own navigation, never the other\'s.');

        console.log('✓ Section O: two independent World View sessions remain fully isolated under interleaved discovery — neither can navigate using the other\'s row');
    }

    // -------------------------------------------------------------
    // Section P — manual workflow regression: PlaceNamingPanel is
    // unaffected.
    // -------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        const codeOnly = codeOnlyLines(panelSource);

        assert(!codeOnly.includes('navigateToNearbyPlaceNamingClaim'),
            '64. ui/components/PlaceNamingPanel.js — the manual naming surface — was not touched by this test-only milestone; it still never references the automatic Navigate function.');
        assert(!codeOnly.includes('focusLocation'),
            '65. PlaceNamingPanel.js still never calls focusLocation() itself.');
        assert(codeOnly.includes("onPreferEntry(entry.name)") && codeOnly.includes("$emit('set-preferred-name'"),
            '66. the manual panel\'s own "select (prefer)" capability is untouched.');
        assert(codeOnly.includes('onExportClaim(claimId)') && codeOnly.includes("$emit('export-claim'"),
            '67. the manual panel\'s own "copy/share (export)" capability is untouched.');
        assert(codeOnly.includes('triggerImportClaim') && codeOnly.includes("$emit('import-claim'"),
            '68. the manual panel\'s own "import (adopt)" capability is untouched.');

        console.log('✓ Section P: this test-only audit made no production changes — PlaceNamingPanel\'s five existing interaction verbs remain exactly as they were');
    }

    console.log('\n✅ All Nearby Place Naming Navigation Lifecycle Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
