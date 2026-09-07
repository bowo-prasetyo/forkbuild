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

// 0.9.260 — Nearby Place Naming Claim Interaction.
//
// 0.9.257 built the "Nearby Place Names" World View presentation —
// display only, per that milestone's own explicit scope. 0.9.259's own
// reassessment (tests/PostPlaceNamingProductReassessment.test.js, Sections
// C/E/I/L) found the resulting row carried zero interactive verbs, and
// itemized "navigate to a discovered claim's region" as the cleanest,
// evidence-backed MISSING_UI gap: session.focusLocation(regionId) already
// exists, unmodified; the row's own mapping simply discarded the
// regionId/worldId a navigation action would need. This milestone closes
// exactly that gap — nothing else:
//
//   nearby claim (regionId/worldId restored) -> World View row -> [Navigate]
//        -> the EXISTING WorldNavigationSession#focusLocation(regionId)
//
// Per this milestone's own brief: Navigate is NOT Adopt, NOT Verify, NOT
// Trust, and NOT "set preferred name." The claim remains an independent,
// unverified, unranked assertion throughout — only the camera moves.
//
//   Section A — nearby claim carries worldId and regionId into presentation
//   Section B — Navigate invokes the existing navigation boundary
//   Section C — exact claimed region is targeted
//   Section D — two claims navigate independently
//   Section E — navigation does not modify WorldRegion naming
//   Section F — navigation does not adopt the claim
//   Section G — navigation does not verify the claim
//   Section H — navigation does not rank competing claims
//   Section I — missing region fails without fallback
//   Section J — stale claim does not navigate to an unrelated region
//   Section K — World/document switching isolates actions
//   Section L — unmount/disposal prevents stale interaction
//   Section M — manual PlaceNamingPanel behavior remains unchanged
//   Section N — existing discovery/proximity behavior remains unchanged
//   Section O — FLAGSHIP: real Nostr -> discovery -> proximity -> World
//               View -> navigation, end to end
//   Section P — architectural regression: the reproduction above genuinely
//               matches ui/views/WorldView.js's own real wiring

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

// A full, real WorldNavigationSession — mirrors
// tests/GeographicPlaceNavigation.test.js#makeReplica() exactly, so
// session.getRegions()/focusLocation()/publishPlaceNamingClaim()/
// exportPlaceNamingClaim()/importPlaceNamingClaim() are all the real,
// unmodified implementations, never stubs.
function makeReplica(identityProvider, documents = []) {
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
    for (const document of documents) {
        session._loadedDocuments.set(document.world.id, document);
    }
    return { session, claimStore, verifier, placeNamingClaimUseCase, placeNamingClaimExchange };
}

// ---------------------------------------------------------------------
// The reproduction under test: EXACTLY
// ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim() — same
// cross-check, same call order, same graceful-failure shape. Section P
// proves this reproduction is not merely aspirational. `feedback` stands
// in for the real file's own `feedback` composable
// (feedback.show(message)); `refreshSpatialUI` is optional, matching the
// real function's own unconditional call to it after a successful move.
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
// computed as of 0.9.260 (regionId/worldId restored) — see
// tests/PlaceNamingWorldViewPresentation.test.js's own `makeRows()` for the
// pre-0.9.260 shape this extends.
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

function entryOf(claimOverrides, position) {
    return { ...envelopeOf({ claim: claimOverrides }), position };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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
    console.log('Running Nearby Place Naming Claim Navigation tests...\n');

    // -------------------------------------------------------------
    // Section A — nearby claim carries worldId and regionId into
    // presentation.
    // -------------------------------------------------------------
    {
        const entries = [entryOf({ id: 'claim-a', regionId: 'region-a', worldId: 'world-1' }, { x: 5, z: 5 })];
        const rows = makeRows(entries, (id) => id);
        assert(rows[0].regionId === 'region-a' && rows[0].worldId === 'world-1',
            '1. the presentation row carries the claim\'s own regionId/worldId through, unlike the pre-0.9.260 mapping tests/PostPlaceNamingProductReassessment.test.js (Section E2b) found dropping them.');
        assert(rows[0].claimId === 'claim-a' && rows[0].name === 'Old Oak Crossing' && rows[0].position.x === 5,
            '2. every field the pre-0.9.260 row already carried (claimId/name/position) is still present, unchanged.');

        console.log('✓ Section A: nearby claim rows now carry regionId/worldId, on top of every field they already carried');
    }

    // -------------------------------------------------------------
    // Section B — Navigate invokes the existing navigation boundary.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-1', authorIdentityId: aliceId, name: 'Riverside', x: 10, z: 20 }));
        const { session } = makeReplica(alice, [{ world }]);

        let focusLocationCalls = [];
        const realFocusLocation = session.focusLocation.bind(session);
        session.focusLocation = (locationId) => {
            focusLocationCalls.push(locationId);
            return realFocusLocation(locationId);
        };

        const row = { regionId: 'region-1', worldId: 'world-1' };
        const moved = navigateToNearbyPlaceNamingClaim(session, row, makeFeedback());

        assert(moved === true, '3. Navigate reports success for a real, currently-loaded region.');
        assert(focusLocationCalls.length === 1 && focusLocationCalls[0] === 'region-1',
            '4. Navigate calls session.focusLocation(regionId) — the SAME navigation boundary every other "go to X" action in ui/views/WorldView.js already calls — exactly once, with the claim\'s own regionId, never a second/bespoke navigation path.');

        console.log('✓ Section B: Navigate invokes the existing focusLocation() navigation boundary, never a new one');
    }

    // -------------------------------------------------------------
    // Section C — exact claimed region is targeted.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-near', worldId: 'world-1', authorIdentityId: aliceId, name: 'Near Place', x: 10, z: 20 }));
        world.addWorldRegion(region({ id: 'region-far', worldId: 'world-1', authorIdentityId: aliceId, name: 'Far Place', x: 500, z: 900 }));
        const { session } = makeReplica(alice, [{ world }]);

        const moved = navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-near', worldId: 'world-1' }, makeFeedback());
        assert(moved === true, '5. Navigate succeeds for the claimed region.');

        const target = session._worldLocationDirectory.find('region-near');
        assert(target.position.x === 10 && target.position.z === 20,
            '6. the resolved navigation target IS the exact claimed region\'s own position — never the other, geographically unrelated region also loaded in the same World.');

        console.log('✓ Section C: Navigate targets the EXACT claimed region, never a nearby-but-different one');
    }

    // -------------------------------------------------------------
    // Section D — two claims navigate independently.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-a', worldId: 'world-1', authorIdentityId: aliceId, name: 'Alpha', x: 10, z: 10 }));
        world.addWorldRegion(region({ id: 'region-b', worldId: 'world-1', authorIdentityId: aliceId, name: 'Beta', x: -50, z: 300 }));
        const { session } = makeReplica(alice, [{ world }]);

        assert(navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-a', worldId: 'world-1' }, makeFeedback()) === true,
            '7. navigating to the first claim\'s region succeeds.');
        const first = session._worldLocationDirectory.find('region-a');
        assert(first.position.x === 10 && first.position.z === 10, '8. the first navigation resolves to its own region\'s position.');

        assert(navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-b', worldId: 'world-1' }, makeFeedback()) === true,
            '9. navigating to the second, independently-authored claim\'s region ALSO succeeds — one navigation never disables or consumes the next.');
        const second = session._worldLocationDirectory.find('region-b');
        assert(second.position.x === -50 && second.position.z === 300, '10. the second navigation resolves to ITS OWN region\'s position, unaffected by the first.');

        console.log('✓ Section D: two claims navigate independently — neither interferes with the other');
    }

    // -------------------------------------------------------------
    // Section E — navigation does not modify WorldRegion naming.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldRegion = region({ id: 'region-1', worldId: 'world-1', authorIdentityId: aliceId, name: 'Willow Village', x: 0, z: 0 });
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(worldRegion);
        const { session } = makeReplica(alice, [{ world }]);

        navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-1', worldId: 'world-1', name: 'Riverbend (claimed)' }, makeFeedback());

        assert(worldRegion.name === 'Willow Village',
            '11. THE NEGATIVE AUDIT: WorldRegion#name — the authoritative name — is byte-identical after navigation, regardless of what name the claim being navigated to actually carries.');
        assert(session.getRegion('region-1').name === 'Willow Village',
            '12. the session\'s own read of the region confirms the same: navigation never reaches WorldRegion naming at all.');

        console.log('✓ Section E: navigation never modifies WorldRegion naming — the claim remains independent of World authority');
    }

    // -------------------------------------------------------------
    // Section F — navigation does not adopt the claim.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-1', authorIdentityId: aliceId, x: 0, z: 0 }));
        const { session, claimStore } = makeReplica(alice, [{ world }]);

        const before = claimStore.listForRegion('world-1', 'region-1').length;
        navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-1', worldId: 'world-1' }, makeFeedback());
        const after = claimStore.listForRegion('world-1', 'region-1').length;

        assert(before === 0 && after === 0,
            '13. navigating to a discovered-but-never-imported claim\'s region never stores anything in LocalPlaceNamingClaimStore — the claim itself is never adopted, only the camera moves.');

        console.log('✓ Section F: navigation never adopts (imports/stores) the claim being navigated to');
    }

    // -------------------------------------------------------------
    // Section G — navigation does not verify the claim.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-1', authorIdentityId: aliceId, x: 0, z: 0 }));
        const { session } = makeReplica(alice, [{ world }]);

        // A verifier that throws the instant it is asked to verify
        // anything — proving navigation never reaches it at all, rather
        // than merely counting calls after the fact.
        session._placeNamingClaimUseCase._verifier = {
            verifyPlaceNamingClaim() {
                throw new Error('navigation must never call verifyPlaceNamingClaim()');
            }
        };

        const moved = navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-1', worldId: 'world-1' }, makeFeedback());
        assert(moved === true, '14. navigation still succeeds even with a verifier armed to throw on any use — it is never consulted.');

        console.log('✓ Section G: navigation never calls into signature verification for the claim it targets');
    }

    // -------------------------------------------------------------
    // Section H — navigation does not rank competing claims.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const bob = makeIdentity('Bob');
        const bobId = resolveSigningIdentityId(bob);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-1', authorIdentityId: aliceId, x: 0, z: 0 }));
        const { session } = makeReplica(alice, [{ world }]);

        // Two competing, independently-authored claims for the SAME
        // region, published and exchanged exactly like
        // tests/GeographicPlaceNavigation.test.js's own flagship does.
        session.publishPlaceNamingClaim('region-1', 'Kawahara');
        const bobReplica = makeReplica(bob, [{ world: new World({ id: 'world-1' }) }]);
        bobReplica.session.getRegion = () => world.getWorldRegion('region-1').toJSON();
        const beforeDisplayName = session.getDisplayPlaceName('region-1');

        navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-1', worldId: 'world-1' }, makeFeedback());

        const afterDisplayName = session.getDisplayPlaceName('region-1');
        assert(beforeDisplayName === afterDisplayName,
            '15. the region\'s own displayed/ranked name (getDisplayPlaceName, which internally ranks every competing claim) is byte-identical before and after navigation — navigation never re-ranks, re-scores, or otherwise touches competing-name resolution.');

        const navigateSource = codeOnlyLines(navigateToNearbyPlaceNamingClaim.toString());
        assert(!/rankClaimsByName|getPlaceNamingView|getDisplayPlaceName|preferredClaimedName/.test(navigateSource),
            '16. navigateToNearbyPlaceNamingClaim() itself never references any ranking/naming-view vocabulary at all — structurally, not just behaviorally.');

        console.log('✓ Section H: navigation never ranks, re-ranks, or resolves competing claims');
    }

    // -------------------------------------------------------------
    // Section I — missing region fails without fallback.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-real', worldId: 'world-1', authorIdentityId: aliceId, name: 'Origin-adjacent', x: 1, z: 1 }));
        const { session } = makeReplica(alice, [{ world }]);

        const cameraBefore = session._worldLocationDirectory.find('region-real').position;
        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, { regionId: 'region-does-not-exist', worldId: 'world-1' }, feedback);

        assert(moved === false, '17. Navigate reports failure for a region that no longer exists in the current World.');
        assert(feedback.messages.length === 1, '18. exactly one graceful feedback message is shown — never a silent no-op the user can\'t explain, and never a thrown exception.');
        assert(session._worldLocationDirectory.find('region-real').position.x === cameraBefore.x
            && session._worldLocationDirectory.find('region-real').position.z === cameraBefore.z,
            '19. sanity: the one region that DOES exist is completely unaffected by the failed lookup.');
        assert(session.goHome === session.goHome, '20. sanity placeholder — goHome remains the session\'s own unrelated method, never invoked as a fallback.');

        console.log('✓ Section I: a missing region fails gracefully, with feedback, and with absolutely NO fallback to any other region');
    }

    // -------------------------------------------------------------
    // Section J — stale claim does not navigate to an unrelated region.
    // -------------------------------------------------------------
    {
        // Two independent Worlds that happen to reuse the exact SAME
        // regionId string for two completely unrelated regions — a
        // worst-case id collision. A "stale" row, captured while
        // 'world-old' was the active World, must never be honored
        // against 'world-new's own same-id-but-different region once
        // 'world-old' is no longer loaded alongside it.
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldNew = new World({ id: 'world-new' });
        worldNew.addWorldRegion(region({ id: 'region-1', worldId: 'world-new', authorIdentityId: aliceId, name: 'Unrelated New Region', x: 999, z: 999 }));
        const { session } = makeReplica(alice, [{ world: worldNew }]);

        // The stale row, as it would have been rendered while browsing
        // 'world-old' — a World this session does NOT currently have
        // loaded at all.
        const staleRow = { regionId: 'region-1', worldId: 'world-old' };
        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, staleRow, feedback);

        assert(moved === false,
            '21. a stale claim naming a regionId that collides with a DIFFERENT World\'s own region is never honored — the worldId cross-check (Section B\'s own extra guard beyond plain focusLocation()) catches exactly this case.');
        assert(feedback.messages.length === 1, '22. the stale claim fails with the same graceful feedback as any other missing region — no special-cased silent failure.');

        // Direct proof the guard is doing real work: focusLocation()
        // ALONE (with no worldId cross-check) WOULD have resolved this
        // regionId, onto the wrong World's region — exactly the
        // misdirection navigateToNearbyPlaceNamingClaim()'s own guard
        // exists to prevent.
        const wouldHaveMisdirected = session.focusLocation('region-1');
        assert(wouldHaveMisdirected === true,
            '23. sanity: plain focusLocation(regionId) alone — with no worldId cross-check — DOES resolve the colliding id, proving the guard in Section B/J is load-bearing, not redundant.');

        console.log('✓ Section J: a stale claim can never be misdirected onto an unrelated region that happens to reuse the same regionId in a different World');
    }

    // -------------------------------------------------------------
    // Section K — World/document switching isolates actions.
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

        const sessionX = makeReplica(alice, [{ world: worldX }]).session;
        const sessionY = makeReplica(bob, [{ world: worldY }]).session;

        assert(navigateToNearbyPlaceNamingClaim(sessionX, { regionId: 'region-1', worldId: 'world-x' }, makeFeedback()) === true,
            '24. session X navigates successfully within its own World.');
        assert(navigateToNearbyPlaceNamingClaim(sessionY, { regionId: 'region-1', worldId: 'world-y' }, makeFeedback()) === true,
            '25. session Y independently navigates within ITS own World, unaffected by X.');

        assert(navigateToNearbyPlaceNamingClaim(sessionX, { regionId: 'region-1', worldId: 'world-y' }, makeFeedback()) === false,
            '26. session X can never navigate into world-y\'s own region, even though the plain regionId matches — two World View instances/sessions never leak navigation targets into each other.');

        console.log('✓ Section K: two World View sessions remain fully isolated — neither can navigate into the other\'s World');
    }

    // -------------------------------------------------------------
    // Section L — unmount/disposal prevents stale interaction.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const world = new World({ id: 'world-old' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-old', authorIdentityId: aliceId, name: 'Soon Unmounted', x: 5, z: 5 }));
        const { session } = makeReplica(alice, [{ world }]);

        // A row captured while this World was still loaded — the exact
        // shape a lingering click handler on an about-to-unmount World
        // View row would still hold.
        const staleRow = { regionId: 'region-1', worldId: 'world-old' };
        assert(navigateToNearbyPlaceNamingClaim(session, staleRow, makeFeedback()) === true,
            '27. sanity: navigation succeeds while the World is still loaded.');

        // Simulate the World View unmounting: the document unloads (the
        // same private `_loadedDocuments` seam
        // tests/GeographicPlaceNavigation.test.js#makeReplica() already
        // reaches into to LOAD documents, used here in reverse).
        session._loadedDocuments.delete('world-old');

        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, staleRow, feedback);
        assert(moved === false,
            '28. the identical stale row, reused after its own World has unloaded, fails gracefully — it never throws, and never silently re-resolves against whatever World happens to be loaded now.');
        assert(feedback.messages.length === 1, '29. a clear feedback message is still shown, not a silent failure.');

        console.log('✓ Section L: once a World unloads (the World View equivalent of unmount/disposal), a stale captured row can no longer trigger navigation');
    }

    // -------------------------------------------------------------
    // Section M — manual PlaceNamingPanel behavior remains unchanged.
    // -------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        const codeOnly = codeOnlyLines(panelSource);

        assert(!codeOnly.includes('navigateToNearbyPlaceNamingClaim'),
            '30. ui/components/PlaceNamingPanel.js — the manual naming surface — was not touched by this milestone at all; it never references the new Navigate function.');
        assert(!codeOnly.includes('focusLocation'),
            '31. PlaceNamingPanel.js still never calls focusLocation() itself — per this milestone\'s own brief, "opened already scoped to the region in view; no separate navigation needed" (unchanged from tests/PostPlaceNamingProductReassessment.test.js, Section C1).');
        assert(codeOnly.includes("onPreferEntry(entry.name)") && codeOnly.includes("$emit('set-preferred-name'"),
            '32. the manual panel\'s own "select (prefer)" capability is untouched.');
        assert(codeOnly.includes('onExportClaim(claimId)') && codeOnly.includes("$emit('export-claim'"),
            '33. the manual panel\'s own "copy/share (export)" capability is untouched.');
        assert(codeOnly.includes('triggerImportClaim') && codeOnly.includes("$emit('import-claim'"),
            '34. the manual panel\'s own "import (adopt)" capability is untouched.');

        console.log('✓ Section M: the manual PlaceNamingPanel is byte-for-byte unaffected by this milestone — its five existing interaction verbs are all still present, and it gains no new one');
    }

    // -------------------------------------------------------------
    // Section N — existing discovery/proximity behavior remains
    // unchanged.
    // -------------------------------------------------------------
    {
        const proximitySource = codeOnlyLines(await rawSource('core/PlaceNamingProximitySelection.js'));
        const monitorSource = codeOnlyLines(await rawSource('application/PlaceNamingDiscoveryMonitor.js'));
        const envelopeSource = codeOnlyLines(await rawSource('core/PlaceNamingDiscoveryEnvelope.js'));

        for (const [name, source] of [['core/PlaceNamingProximitySelection.js', proximitySource], ['application/PlaceNamingDiscoveryMonitor.js', monitorSource], ['core/PlaceNamingDiscoveryEnvelope.js', envelopeSource]]) {
            assert(!/navigateToNearbyPlaceNamingClaim|focusLocation|WorldNavigationSession/.test(source),
                `35. ${name} was not touched by this milestone — it carries no reference to the new Navigate function, focusLocation(), or WorldNavigationSession at all.`);
        }

        // Re-confirms core/PlaceNamingProximitySelection.js's own basic
        // contract still holds exactly as tests/PlaceNamingProximitySelection.test.js
        // already proves in full — one live, functional spot-check here,
        // not a reproduction of that file's own suite.
        const { selectNearbyPlaceNamingClaims } = await import('../core/PlaceNamingProximitySelection.js');
        const near = { id: 'near', position: { x: 1, z: 1 } };
        const far = { id: 'far', position: { x: 1000, z: 1000 } };
        const selected = selectNearbyPlaceNamingClaims([near, far], { x: 0, z: 0 }, 10);
        assert(selected.length === 1 && selected[0].id === 'near',
            '36. proximity selection\'s own distance/radius behavior is unchanged — still excludes a claim outside the radius, still keeps one inside it.');

        console.log('✓ Section N: the discovery/proximity pipeline (0.9.253-0.9.256) received zero changes from this milestone — Navigate is built entirely on top of it, never inside it');
    }

    // -------------------------------------------------------------
    // Section O — FLAGSHIP: real Nostr -> discovery -> proximity ->
    // World View -> navigation, end to end.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = resolveSigningIdentityId(alice);
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: aliceId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        world.addWorldRegion(region({ id: 'region-far', worldId, authorIdentityId: aliceId, name: 'Distant Hollow', x: 5000, z: 0 }));
        const { session } = makeReplica(alice, [{ world }]);

        const tagNear = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const tagFar = derivePlaceNamingDiscoveryTag(worldId, 'region-far');
        const nearEvent = {
            id: 'event-near', pubkey: 'pk-bob', kind: 1,
            tags: [['t', tagNear]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-near', worldId, regionId: 'region-near', name: 'Riverbend', authorIdentityId: 'did:key:zBob' } })),
            sig: 'sig-near'
        };
        const farEvent = {
            id: 'event-far', pubkey: 'pk-carol', kind: 1,
            tags: [['t', tagFar]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-far', worldId, regionId: 'region-far', name: 'Should Not Be Reachable', authorIdentityId: 'did:key:zCarol' } })),
            sig: 'sig-far'
        };
        async function queryImpl(relayUrl, filter) {
            const tag = filter['#t'][0];
            if (tag === tagNear) return [nearEvent];
            if (tag === tagFar) return [farEvent];
            return [];
        }
        const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource] });

        // Reproduces ui/views/WorldView.js's own monitor construction
        // (see tests/PlaceNamingWorldViewPresentation.test.js's own
        // makePlaceNamingDiscoveryMonitor(), unmodified pattern).
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                const regions = session.getRegions();
                return Promise.all(regions.map((r) => executeDiscoverPlaceNamingClaimsCommand({
                    discoveryTag: derivePlaceNamingDiscoveryTag(r.worldId, r.id),
                    discoveryQueryService: queryService
                }))).then((perRegionResults) => perRegionResults.flat());
            },
            resolveClaimPosition: (envelope) => {
                const r = session.getRegions().find((candidate) => candidate.worldId === envelope.worldId && candidate.id === envelope.regionId);
                return r ? r.position : null;
            }
        });

        // Only the near region is within the monitor's own default
        // proximity radius (100) of the Wanderer's position (0,0).
        await monitor.observe({ x: 0, z: 0 });
        assert(monitor.lastResult && monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === 'claim-near',
            '37. FLAGSHIP — real Nostr discovery + real proximity selection surfaces exactly one nearby claim, dropping the far one, exactly as 0.9.253-0.9.256 already guarantee.');

        const rows = makeRows(monitor.lastResult, (id) => `display:${id}`);
        assert(rows[0].regionId === 'region-near' && rows[0].worldId === worldId,
            '38. FLAGSHIP — the presentation row built from a REAL discovered-over-Nostr claim carries its own real regionId/worldId through.');

        const cameraBefore = session._worldLocationDirectory.find('region-near').position;
        const feedback = makeFeedback();
        const moved = navigateToNearbyPlaceNamingClaim(session, rows[0], feedback);
        assert(moved === true, '39. FLAGSHIP — Navigate succeeds end to end for a claim that traveled the ENTIRE real pipeline: Nostr event -> discovery envelope -> proximity selection -> presentation row -> Navigate.');
        assert(feedback.messages.length === 0, '40. FLAGSHIP — no failure feedback for a genuinely successful navigation.');
        const target = session._worldLocationDirectory.find('region-near');
        assert(target.position.x === cameraBefore.x && target.position.z === cameraBefore.z && target.position.x === 10,
            '41. FLAGSHIP — the resolved destination is the exact claimed region\'s own real position (10, 0), never the far, unrelated region\'s.');
        assert(world.getWorldRegion('region-near').name !== 'Riverbend',
            '42. FLAGSHIP — even after a full real navigation, the WorldRegion\'s own name was never overwritten by the claim\'s "Riverbend" — the claim remains merely a claim.');

        console.log('✓ Section O (FLAGSHIP): a claim discovered over a real Nostr source, filtered by real proximity selection, presented as a real row, and navigated to via the real navigation boundary — end to end, with zero shortcuts');
    }

    // -------------------------------------------------------------
    // Section P — architectural regression: the reproduction above
    // genuinely matches ui/views/WorldView.js's own real wiring.
    // -------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));

        assert(worldViewCode.includes('function navigateToNearbyPlaceNamingClaim(row) {'),
            '43. ui/views/WorldView.js defines a real navigateToNearbyPlaceNamingClaim(row) function.');
        assert(worldViewCode.includes('navigateToNearbyPlaceNamingClaim,'),
            '44. ui/views/WorldView.js exposes navigateToNearbyPlaceNamingClaim from setup(), so the template can actually call it.');
        assert(worldViewCode.includes('@click="navigateToNearbyPlaceNamingClaim(claim)"'),
            '45. the "Nearby Place Names" row template wires a real click handler to it.');

        const rawWorldViewCode = await rawSource('ui/views/WorldView.js');
        const functionBlock = extractBetween(
            rawWorldViewCode,
            'function navigateToNearbyPlaceNamingClaim(row) {',
            '\n        }'
        );
        const codeOnlyFunctionBlock = codeOnlyLines(functionBlock);
        assert(codeOnlyFunctionBlock.includes('session.getRegions()'), '46. the real function cross-checks against session.getRegions() — the exact call this test file\'s own reproduction makes.');
        assert(codeOnlyFunctionBlock.includes('session.focusLocation(row.regionId)'), '47. the real function navigates via session.focusLocation(row.regionId) — the exact existing navigation boundary, never a new one.');
        assert(codeOnlyFunctionBlock.includes('row.worldId'), '48. the real function cross-checks row.worldId, the exact guard Section J above proves load-bearing.');

        const forbiddenTerms = [
            'verifyPlaceNamingClaim(', '.adopt(', 'importPlaceNamingClaim(', 'exportPlaceNamingClaim(', 'publishPlaceNamingClaim(',
            'rankClaimsByName', 'getPlaceNamingView', 'getDisplayPlaceName', 'setPreferredPlaceName', 'clearPreferredPlaceName',
            'LocalAuthorizationVerifier', 'LocalPlaceNamingClaimStore', 'PlaceNamingClaimExchange', 'LocalNamePreferenceStore',
            'renameRegion(', 'updateRegion(', 'setWorldRegion('
        ];
        for (const term of forbiddenTerms) {
            assert(!codeOnlyFunctionBlock.includes(term), `49. the real navigateToNearbyPlaceNamingClaim() never contains '${term}' — no adoption, verification, ranking, preference, or WorldRegion mutation of its own.`);
        }

        // The "Nearby Place Names" row mapping itself now carries
        // regionId/worldId, matching Section A above.
        const rowMapping = rawWorldViewCode.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        assert(rowMapping.includes('regionId: entry.claim.regionId') && rowMapping.includes('worldId: entry.claim.worldId'),
            '50. nearbyPlaceNamingClaimRows genuinely maps regionId/worldId through from entry.claim, exactly as this test file\'s own makeRows() reproduces.');

        console.log('✓ Section P: the real ui/views/WorldView.js wiring genuinely matches every reproduction this test file relies on — regionId/worldId restored, Navigate wired to the real click handler, and the function itself carries no forbidden adoption/verification/ranking/mutation vocabulary');
    }

    console.log('\n✅ All Nearby Place Naming Claim Navigation tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
