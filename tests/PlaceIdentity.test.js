import {
    deriveFingerprint, fingerprintKey, fingerprintsEqual, describeFingerprint,
    DEFAULT_POSITION_QUANTUM, DEFAULT_RADIUS_QUANTUM
} from '../core/PlaceFingerprint.js';
import { PlaceIdentity, derivePlaceIdentity, groupRegionsByPlaceIdentity } from '../core/PlaceIdentity.js';
import {
    resolveGeographicPlaces, geographicPlaceForRegion, describeGeographicPlace
} from '../core/GeographicPlaceResolution.js';
import { namingView, rankClaimsByName } from '../core/PlaceNamingView.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
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

// 0.5.4 — Place Identity & Geographic Claim Resolution.
//
// 0.5.2/0.5.3 each independently named the exact same open question in
// their own "Deliberately excluded" list: a PlaceNamingClaim#regionId is
// an exact reference to ONE WorldRegion, and two authors' regions
// covering the same real ground but created independently are, for
// naming purposes, still two separate places. This suite proves the two
// halves of the answer the design conversation asked for:
//
//   Level 1 — core/PlaceFingerprint.js / core/PlaceIdentity.js: given
//             regions a client already has, are any of them geographic
//             CANDIDATES for the same place? Pure geometry, no claims.
//   Level 2 — core/GeographicPlaceResolution.js: given those candidate
//             groups and the claims a client knows about, what does the
//             combined community naming view look like?
//
// And, running through every section: geographic similarity SUGGESTS
// identity; it never MUTATES identity. No region is ever merged, no
// WorldRegion is ever written to, and no claim is ever treated as more
// than a candidate grouping hint. See docs/Principles.md, "Geographic
// Similarity Suggests Identity; It Never Mutates Identity (0.5.4)."
//
// Section A: core/PlaceFingerprint.js — quantization, key, equality
// Section B: core/PlaceIdentity.js — derivePlaceIdentity(), grouping,
//            the full adversarial matrix the design conversation named
// Section C: core/PlaceNamingView.js — rankClaimsByName() regression:
//            namingView() is byte-identical to its pre-0.5.4 behavior
// Section D: core/GeographicPlaceResolution.js — cross-region combined
//            ranking, never touching a WorldRegion or a single-region
//            naming view
// Section E: application/WorldNavigationSession.js wiring — graceful
//            degradation with nothing loaded/wired
// Section F: regression — WorldRegion/PlaceNamingClaim/single-region
//            PlaceNamingView completely unchanged by this milestone
// Section G: CAPSTONE — the flagship scenario: Alice and Bob, two
//            independent replicas, each independently creating a
//            region at approximately the same place in TWO SEPARATE
//            Worlds, publishing different names, exchanging claims, and
//            deterministically converging on one combined ranking —
//            without either World, or either region, ever being touched

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

// One fully independent replica's own naming-claim backend, mirroring
// application/CreateWorldPlaceNamingUseCase.js's own wiring exactly, plus
// a WorldNavigationSession built with nothing else but that backend and
// whichever World documents this test hands it directly into
// `_loadedDocuments` — bypassing the full persistence stack entirely,
// the same "just enough scaffolding for what this suite actually
// exercises" restraint tests/WorldRegions.test.js Section K already
// takes with a real LoadDocumentUseCase, applied here to a lighter
// setup this suite doesn't need.
function makeReplica(identityProvider, documents = []) {
    const storage = new InMemoryStorageProvider();
    const claimStore = new LocalPlaceNamingClaimStore(storage);
    const publicationLog = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const placeNamingClaimUseCase = new PlaceNamingClaimUseCase(claimStore, identityProvider, verifier);
    const placeNamingClaimExchange = new PlaceNamingClaimExchange(claimStore, verifier, publicationLog);
    const localNamePreferenceStore = new LocalNamePreferenceStore(storage, identityProvider);
    const session = new WorldNavigationSession({
        registry: null,
        placeNamingClaimUseCase,
        localNamePreferenceStore,
        placeNamingClaimExchange
    });
    for (const document of documents) {
        session._loadedDocuments.set(document.world.id, document);
    }
    return { session, claimStore, placeNamingClaimUseCase, placeNamingClaimExchange, localNamePreferenceStore };
}

function region({ id, worldId, authorIdentityId, name = 'Unnamed Region', kind = RegionKind.VILLAGE, x, z, radius }) {
    return new WorldRegion({ id, worldId, authorIdentityId, name, kind, position: new Position(x, 0, z), radius });
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/PlaceFingerprint.js
    // -------------------------------------------------------------
    {
        assert(DEFAULT_POSITION_QUANTUM > 0 && DEFAULT_RADIUS_QUANTUM > 0, '1. default quanta are positive');

        const villageA = region({ id: 'a', worldId: 'w1', authorIdentityId: 'alice', x: 100, z: 200, radius: 50 });
        const fpA = deriveFingerprint(villageA);
        assert(fpA && fpA.x === 100 && fpA.z === 200 && fpA.radius === 50 && fpA.kind === RegionKind.VILLAGE,
            '2. deriveFingerprint() quantizes exact geometry to itself');

        // Floating-point noise (1e-5 order) rounds away entirely at the
        // default quantum.
        const villageNoisy = region({ id: 'b', worldId: 'w2', authorIdentityId: 'bob', x: 100.00002, z: 199.99998, radius: 50.00001 });
        const fpNoisy = deriveFingerprint(villageNoisy);
        assert(fingerprintsEqual(fpA, fpNoisy), '3. sub-quantum floating-point noise fingerprints identically');
        assert(fingerprintKey(fpA) === fingerprintKey(fpNoisy), '4. fingerprintKey() is stable across that same noise');

        // A genuinely different location does not.
        const elsewhere = region({ id: 'c', worldId: 'w3', authorIdentityId: 'carol', x: 180, z: 300, radius: 50 });
        assert(!fingerprintsEqual(fpA, deriveFingerprint(elsewhere)), '5. a genuinely different center never fingerprint-matches');

        assert(deriveFingerprint(null) === null, '6. deriveFingerprint() returns null for missing geometry, never throws');
        assert(fingerprintKey(null) === null, '7. fingerprintKey(null) is null');
        assert(fingerprintsEqual(null, null) === false, '8. two null fingerprints are never treated as equal');

        assert(describeFingerprint(fpA) === 'village @ (100, 200), radius 50', '9. describeFingerprint() is a plain, presentation-only string');
        assert(describeFingerprint(null) === '', '10. describeFingerprint(null) is empty, never a placeholder');
    }
    console.log('✓ Section A: core/PlaceFingerprint.js — quantization absorbs noise, never collapses genuinely different geometry');

    // -------------------------------------------------------------
    // Section B: core/PlaceIdentity.js — the full adversarial matrix
    // -------------------------------------------------------------
    {
        const base = region({ id: 'base', worldId: 'w1', authorIdentityId: 'alice', kind: RegionKind.VILLAGE, x: 100, z: 200, radius: 50 });

        // Near-identical geometry, independently authored -> candidate.
        const sameGround = region({ id: 'same-ground', worldId: 'w2', authorIdentityId: 'bob', kind: RegionKind.VILLAGE, x: 100.3, z: 199.6, radius: 50 });
        let result = derivePlaceIdentity(base, sameGround);
        assert(result instanceof PlaceIdentity, '11. derivePlaceIdentity() returns a PlaceIdentity');
        assert(result.candidate === true, '12. near-identical, independently-authored geometry IS a candidate match');

        // Adversarial: same center, different radius (nested village/district).
        const nestedDistrict = region({ id: 'nested', worldId: 'w3', authorIdentityId: 'carol', kind: RegionKind.DISTRICT, x: 100, z: 200, radius: 500 });
        result = derivePlaceIdentity(base, nestedDistrict);
        assert(result.candidate === false, '13. ADVERSARIAL same center, different radius (village vs. district) is NOT a candidate match');

        // Adversarial: same radius, different center.
        const sameRadiusElsewhere = region({ id: 'far', worldId: 'w4', authorIdentityId: 'dave', kind: RegionKind.VILLAGE, x: 100000, z: 200000, radius: 50 });
        result = derivePlaceIdentity(base, sameRadiusElsewhere);
        assert(result.candidate === false, '14. ADVERSARIAL same radius, wildly different center is NOT a candidate match');

        // Adversarial: two circles that geometrically OVERLAP despite
        // having clearly different centers — core/WorldRegionGeography.js's
        // own "contains"/overlap question is a completely different
        // question from "is this a candidate for the same place"; see
        // this module's own header on why only near-identical geometry
        // counts, never mere overlap.
        const overlapping = region({ id: 'overlap', worldId: 'w5', authorIdentityId: 'erin', kind: RegionKind.VILLAGE, x: 149, z: 200, radius: 50 });
        result = derivePlaceIdentity(base, overlapping);
        assert(result.candidate === false, '15. ADVERSARIAL two regions whose circles overlap, but whose centers clearly differ, are NOT a candidate match');

        // Adversarial: completely unrelated regions.
        const unrelated = region({ id: 'unrelated', worldId: 'w6', authorIdentityId: 'frank', kind: RegionKind.CONTINENT, x: -9999, z: 5000, radius: 20000 });
        result = derivePlaceIdentity(base, unrelated);
        assert(result.candidate === false, '16. ADVERSARIAL completely unrelated regions are NOT a candidate match');

        // Adversarial: different region kinds, otherwise identical
        // geometry — a deliberate, documented, conservative limitation
        // (see core/PlaceFingerprint.js's own header): `kind` is a HARD
        // gate, never a soft signal, in this milestone.
        const differentKind = region({ id: 'diff-kind', worldId: 'w7', authorIdentityId: 'grace', kind: RegionKind.TOWN, x: 100, z: 200, radius: 50 });
        result = derivePlaceIdentity(base, differentKind);
        assert(result.candidate === false, '17. ADVERSARIAL identical geometry but a different `kind` is NOT a candidate match (documented limitation)');

        // Symmetry: derivePlaceIdentity(A, B) === derivePlaceIdentity(B, A).
        assert(derivePlaceIdentity(sameGround, base).candidate === true, '18. candidacy is symmetric');

        // -----------------------------------------------------------
        // groupRegionsByPlaceIdentity() — equivalence-class partition
        // -----------------------------------------------------------
        const regions = [base, sameGround, nestedDistrict, sameRadiusElsewhere, overlapping, unrelated, differentKind];
        const groups = groupRegionsByPlaceIdentity(regions);
        assert(groups.length === 6, '19. seven regions, one genuine pair -> six distinct groups');
        const baseGroup = groups.find((g) => g.regions.some((r) => r.id === 'base'));
        assert(baseGroup.regions.length === 2, '20. base + sameGround land in the same group');
        assert(baseGroup.regions.map((r) => r.id).sort().join(',') === 'base,same-ground', '21. exactly base+sameGround, nothing else');

        // Deterministic ordering — re-grouping a shuffled copy of the
        // same regions produces the identical group order (proves
        // ordering depends only on fingerprint key, never discovery
        // order — the cross-replica determinism this whole milestone
        // depends on).
        const shuffled = [...regions].reverse();
        const groupsFromShuffled = groupRegionsByPlaceIdentity(shuffled);
        assert(JSON.stringify(groups.map((g) => fingerprintKey(g.fingerprint))) ===
            JSON.stringify(groupsFromShuffled.map((g) => fingerprintKey(g.fingerprint))),
            '22. group order is independent of the order regions were discovered in');

        // Transitivity, proven directly rather than assumed: exact-key
        // partitioning is automatically an honest equivalence relation.
        const c = region({ id: 'transitive-c', worldId: 'w8', authorIdentityId: 'heidi', kind: RegionKind.VILLAGE, x: 100, z: 200, radius: 50 });
        assert(derivePlaceIdentity(base, sameGround).candidate && derivePlaceIdentity(sameGround, c).candidate && derivePlaceIdentity(base, c).candidate,
            '23. fingerprint-match is transitive by construction: A~B and B~C implies A~C');

        // Regions with unusable geometry are omitted, never thrown for.
        const brokenRegion = { id: 'broken', worldId: 'w9', kind: RegionKind.VILLAGE, radius: 10, position: null };
        const groupsWithBroken = groupRegionsByPlaceIdentity([base, brokenRegion]);
        assert(groupsWithBroken.every((g) => g.regions.every((r) => r.id !== 'broken')), '24. a region with no usable geometry is silently omitted');
    }
    console.log('✓ Section B: core/PlaceIdentity.js — full adversarial matrix, symmetry, transitive equivalence classes, deterministic ordering');

    // -------------------------------------------------------------
    // Section C: core/PlaceNamingView.js — rankClaimsByName() regression
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const verifier = new LocalAuthorizationVerifier();
        const store = new LocalPlaceNamingClaimStore(new InMemoryStorageProvider());
        const worldId = 'regression-world';
        const regionId = 'regression-region';

        const aliceUseCase = new PlaceNamingClaimUseCase(store, alice, verifier);
        const bobUseCase = new PlaceNamingClaimUseCase(store, bob, verifier);
        const carolUseCase = new PlaceNamingClaimUseCase(store, carol, verifier);
        aliceUseCase.publish(worldId, regionId, 'Riverbend');
        bobUseCase.publish(worldId, regionId, 'Riverbend');
        carolUseCase.publish(worldId, regionId, 'Havenmoor');

        const claims = store.list(worldId);
        const view = namingView(regionId, claims);
        const direct = rankClaimsByName(claims.filter((c) => c.regionId === regionId));
        assert(JSON.stringify(view.map((v) => [v.name, v.score])) === JSON.stringify(direct.map((v) => [v.name, v.score])),
            '25. namingView() is byte-identical to claimsForRegion() + rankClaimsByName() composed by hand');
        assert(view[0].name === 'Riverbend' && view[0].score === 2, '26. distinct-author scoring is completely unchanged: 2 distinct authors for "Riverbend"');

        // rankClaimsByName() applied directly to an UNFILTERED claim
        // list spanning two regions — the exact capability namingView()
        // itself deliberately never offers, and the whole reason this
        // milestone needed a standalone function in the first place.
        const otherRegionClaim = carolUseCase.publish(worldId, 'a-different-region', 'Riverbend');
        const combined = rankClaimsByName([...claims, otherRegionClaim]);
        const riverbendEntry = combined.find((e) => e.name === 'Riverbend');
        assert(riverbendEntry.score === 3, '27. rankClaimsByName() counts DISTINCT AUTHORS across ANY region — Alice+Bob (original region) plus Carol (a different region entirely) all claimed "Riverbend" -> 3 distinct authors, the exact cross-region behavior namingView() itself never offers');
        assert(riverbendEntry.claims.length === 3, '28. all 3 claims actually named "Riverbend" contribute, regardless of which region each one names; "Havenmoor" never leaks in');
    }
    console.log('✓ Section C: core/PlaceNamingView.js — namingView() unchanged; rankClaimsByName() is a pure, additive extraction');

    // -------------------------------------------------------------
    // Section D: core/GeographicPlaceResolution.js
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const verifier = new LocalAuthorizationVerifier();
        const store = new LocalPlaceNamingClaimStore(new InMemoryStorageProvider());

        const regionA = region({ id: 'geo-a', worldId: 'world-a', authorIdentityId: 'alice', kind: RegionKind.VILLAGE, x: 500, z: 500, radius: 40 });
        const regionB = region({ id: 'geo-b', worldId: 'world-b', authorIdentityId: 'bob', kind: RegionKind.VILLAGE, x: 500.4, z: 499.7, radius: 40 });
        const regionC = region({ id: 'geo-c', worldId: 'world-c', authorIdentityId: 'carol', kind: RegionKind.CONTINENT, x: -1000, z: -1000, radius: 5000 });
        const regions = [regionA, regionB, regionC];

        const claimA = new PlaceNamingClaimUseCase(store, alice, verifier).publish('world-a', 'geo-a', 'Green Valley');
        const claimB = new PlaceNamingClaimUseCase(store, bob, verifier).publish('world-b', 'geo-b', 'Emerald Valley');
        const claimC = new PlaceNamingClaimUseCase(store, carol, verifier).publish('world-c', 'geo-c', 'Faraway Land');
        const claims = [claimA, claimB, claimC];

        const groups = resolveGeographicPlaces(regions, claims);
        assert(groups.length === 2, '29. two geometric groups: {regionA, regionB} candidate-matched, {regionC} alone');

        const abGroup = groups.find((g) => g.regions.length === 2);
        assert(abGroup, '30. the regionA/regionB group exists');
        assert(abGroup.regions.map((r) => r.id).sort().join(',') === 'geo-a,geo-b', '31. the group contains exactly regionA and regionB');
        assert(abGroup.claims.length === 2, '32. the group\'s claims are exactly Green Valley + Emerald Valley');
        assert(abGroup.namingView.length === 2 && abGroup.namingView[0].score === 1 && abGroup.namingView[1].score === 1,
            '33. combined naming view: two names, tied at 1 distinct author each');
        assert(abGroup.namingView[0].name === 'Emerald Valley', '34. deterministic alphabetical tie-break: "Emerald Valley" before "Green Valley"');

        const cGroup = groups.find((g) => g.regions.length === 1);
        assert(cGroup.regions[0].id === 'geo-c', '35. regionC stands alone, unaffected by the A/B group\'s claims');
        assert(cGroup.namingView.length === 1 && cGroup.namingView[0].name === 'Faraway Land', '36. regionC\'s own claim never leaks into the A/B group, or vice versa');

        // geographicPlaceForRegion() — single-group convenience.
        const forA = geographicPlaceForRegion('geo-a', regions, claims);
        assert(forA.regions.length === 2, '37. geographicPlaceForRegion(geo-a) finds the same 2-region group');
        assert(geographicPlaceForRegion('unknown-region', regions, claims) === null, '38. geographicPlaceForRegion() for an unknown region is null, never a throw');

        // describeGeographicPlace()
        assert(describeGeographicPlace(abGroup) === '2 geographic descriptions of this place', '39. describeGeographicPlace() summarizes a multi-region group');
        assert(describeGeographicPlace(cGroup) === '', '40. describeGeographicPlace() is empty for a single-region group — nothing "other" to say');
        assert(describeGeographicPlace(null) === '', '41. describeGeographicPlace(null) is empty, never a throw');

        // The load-bearing restraint: NOTHING here ever touched a
        // WorldRegion. Both regions' own `.name` stay exactly what they
        // were constructed with.
        assert(regionA.name === 'Unnamed Region' && regionB.name === 'Unnamed Region',
            '42. resolving a geographic place NEVER writes back to either WorldRegion\'s own name');
    }
    console.log('✓ Section D: core/GeographicPlaceResolution.js — cross-region combined ranking, regions never merged or mutated');

    // -------------------------------------------------------------
    // Section E: application/WorldNavigationSession.js wiring
    // -------------------------------------------------------------
    {
        // Nothing loaded, nothing wired at all -> graceful empties, never a throw.
        const bareSession = new WorldNavigationSession({ registry: null });
        assert(Array.isArray(bareSession.getGeographicPlaceGroups()) && bareSession.getGeographicPlaceGroups().length === 0,
            '43. getGeographicPlaceGroups() is [] with nothing loaded');
        const bareView = bareSession.getGeographicNamingView('anything');
        assert(Array.isArray(bareView.regions) && bareView.regions.length === 0 && Array.isArray(bareView.namingView) && bareView.namingView.length === 0,
            '44. getGeographicNamingView() gracefully degrades to { regions: [], namingView: [] } with nothing loaded/wired');

        // Two documents loaded, but no placeNamingClaimUseCase wired ->
        // regions still group by geometry; naming view stays empty
        // rather than throwing.
        const regionX = region({ id: 'x', worldId: 'world-x', authorIdentityId: 'alice', x: 10, z: 10, radius: 5 });
        const regionY = region({ id: 'y', worldId: 'world-y', authorIdentityId: 'bob', x: 10.1, z: 9.9, radius: 5 });
        const worldX = new World({ id: 'world-x' });
        worldX.addWorldRegion(regionX);
        const worldY = new World({ id: 'world-y' });
        worldY.addWorldRegion(regionY);

        const noClaimsSession = new WorldNavigationSession({ registry: null });
        noClaimsSession._loadedDocuments.set('world-x', { world: worldX });
        noClaimsSession._loadedDocuments.set('world-y', { world: worldY });

        const groups = noClaimsSession.getGeographicPlaceGroups();
        assert(groups.length === 1 && groups[0].regions.length === 2, '45. regions across two different loaded Worlds still group by geometry with no claims backend wired');
        const viewX = noClaimsSession.getGeographicNamingView('x');
        assert(viewX.regions.length === 2 && viewX.namingView.length === 0, '46. getGeographicNamingView() finds the candidate group but an empty ranking with nothing to claim from');

        // An unknown regionId, with documents loaded, is still [].
        const unknownView = noClaimsSession.getGeographicNamingView('does-not-exist');
        assert(unknownView.regions.length === 0 && unknownView.namingView.length === 0, '47. an unknown regionId is [], never a partial or thrown result');
    }
    console.log('✓ Section E: application/WorldNavigationSession.js — graceful degradation with nothing loaded/wired, correct delegation once regions ARE loaded');

    // -------------------------------------------------------------
    // Section F: regression — 0.5.0/0.5.2 behavior completely unchanged
    // -------------------------------------------------------------
    {
        const solo = region({ id: 'solo', worldId: 'solo-world', authorIdentityId: 'alice', name: 'Solitary Hamlet', x: 0, z: 0, radius: 20 });
        assert(solo.name === 'Solitary Hamlet', '48. a WorldRegion\'s own name is exactly what it was constructed with');

        const alice = makeIdentity('Alice');
        const verifier = new LocalAuthorizationVerifier();
        const store = new LocalPlaceNamingClaimStore(new InMemoryStorageProvider());
        const useCase = new PlaceNamingClaimUseCase(store, alice, verifier);
        useCase.publish('solo-world', 'solo', 'Quiet Corner');
        const soloView = namingView('solo', store.list('solo-world'));
        assert(soloView.length === 1 && soloView[0].name === 'Quiet Corner', '49. a region with no geographic candidates sees an unchanged single-region naming view');
        assert(solo.name === 'Solitary Hamlet', '50. WorldRegion.name is STILL untouched after publishing a claim');
    }
    console.log('✓ Section F: regression — WorldRegion/PlaceNamingClaim/single-region PlaceNamingView completely unchanged by 0.5.4');

    // -------------------------------------------------------------
    // Section G: CAPSTONE — the flagship scenario
    // -------------------------------------------------------------
    console.log('\n--- Place Identity & Geographic Claim Resolution: flagship scenario ---');

    // Phase A — Alice creates a region in HER OWN World.
    const alice = makeIdentity('Alice');
    const aliceIdentityId = resolveSigningIdentityId(alice);
    const regionA = region({
        id: 'region-a', worldId: 'alice-world', authorIdentityId: aliceIdentityId,
        name: 'Unnamed Region', kind: RegionKind.VILLAGE, x: 100, z: 200, radius: 50
    });
    const aliceWorld = new World({ id: 'alice-world' });
    aliceWorld.addWorldRegion(regionA);
    console.log('✓ Phase A: Alice created Region A at (100, 200) in her own World');

    // Phase B — Bob, completely independently, creates a region in HIS
    // OWN, SEPARATE World, at approximately the same geographic location
    // (small enough offset to be ordinary independent-authoring noise,
    // not a copy of Alice's own numbers).
    const bob = makeIdentity('Bob');
    const bobIdentityId = resolveSigningIdentityId(bob);
    const regionB = region({
        id: 'region-b', worldId: 'bob-world', authorIdentityId: bobIdentityId,
        name: 'Unnamed Region', kind: RegionKind.VILLAGE, x: 100.4, z: 199.6, radius: 50
    });
    const bobWorld = new World({ id: 'bob-world' });
    bobWorld.addWorldRegion(regionB);
    console.log('✓ Phase B: Bob independently created Region B at approximately the same location, in a completely separate World');

    // Both replicas already have BOTH World documents loaded — this
    // milestone's own design conversation scoped Level 1 to "regions
    // already available to one client" (core/PlaceIdentity.js's own
    // header); how a region's geometry actually reaches a second
    // replica (World discovery/replication) is existing, unrelated
    // machinery this milestone does not touch.
    const aliceReplica = makeReplica(alice, [{ world: aliceWorld }, { world: bobWorld }]);
    const bobReplica = makeReplica(bob, [{ world: aliceWorld }, { world: bobWorld }]);

    // Phase C — Alice publishes "Green Valley" for HER OWN region.
    aliceReplica.session.publishPlaceNamingClaim('region-a', 'Green Valley');
    console.log('✓ Phase C: Alice published "Green Valley" for Region A');

    // Phase D — Bob publishes "Emerald Valley" for HIS OWN region.
    bobReplica.session.publishPlaceNamingClaim('region-b', 'Emerald Valley');
    console.log('✓ Phase D: Bob published "Emerald Valley" for Region B');

    // Phase E — Alice imports Bob's claim.
    const bobsPackage = bobReplica.session.exportPlaceNamingClaim('region-b',
        bobReplica.claimStore.listForRegion('bob-world', 'region-b')[0].id);
    aliceReplica.session.importPlaceNamingClaim(JSON.parse(JSON.stringify(bobsPackage)));
    console.log('✓ Phase E: Alice imported Bob\'s claim');

    // Phase F — Bob imports Alice's claim.
    const alicesPackage = aliceReplica.session.exportPlaceNamingClaim('region-a',
        aliceReplica.claimStore.listForRegion('alice-world', 'region-a')[0].id);
    bobReplica.session.importPlaceNamingClaim(JSON.parse(JSON.stringify(alicesPackage)));
    console.log('✓ Phase F: Bob imported Alice\'s claim');

    // Phase G — both replicas derive the SAME geographic-place grouping.
    const aliceGeo = aliceReplica.session.getGeographicNamingView('region-a');
    const bobGeo = bobReplica.session.getGeographicNamingView('region-b');
    assert(aliceGeo.regions.length === 2 && bobGeo.regions.length === 2,
        '51. PHASE G: both replicas group Region A and Region B together, purely from geometry');
    assert(aliceGeo.regions.map((r) => r.id).sort().join(',') === bobGeo.regions.map((r) => r.id).sort().join(','),
        '52. PHASE G: both replicas name the exact same two regions as candidates');
    console.log('✓ Phase G: both replicas derive the identical geographic-place grouping');

    // Phase H — both replicas derive the SAME deterministic community
    // ranking — neither replica ever read the other's storage directly.
    assert(JSON.stringify(aliceGeo.namingView.map((v) => [v.name, v.score])) ===
        JSON.stringify(bobGeo.namingView.map((v) => [v.name, v.score])),
        '53. PHASE H: both replicas converge on the IDENTICAL combined ranking');
    assert(aliceGeo.namingView.length === 2 && aliceGeo.namingView[0].score === 1 && aliceGeo.namingView[1].score === 1,
        '54. PHASE H: two names, tied at 1 distinct author each');
    assert(aliceGeo.namingView[0].name === 'Emerald Valley',
        '55. PHASE H: deterministic alphabetical tie-break — "Emerald Valley" ranks first on BOTH replicas');
    console.log('✓ Phase H: both replicas deterministically derive the identical community ranking');

    // Phase I — Alice locally chooses "Green Valley" for HER OWN region,
    // even though the combined ranking ranks it second.
    aliceReplica.session.setPreferredPlaceName('region-a', 'Green Valley');
    assert(aliceReplica.session.getPreferredPlaceName('region-a') === 'Green Valley',
        '56. PHASE I: Alice\'s local preference sticks, independent of the combined community ranking');
    console.log('✓ Phase I: Alice locally chose "Green Valley"');

    // Phase J — Bob locally chooses "Emerald Valley" for HIS OWN region.
    bobReplica.session.setPreferredPlaceName('region-b', 'Emerald Valley');
    assert(bobReplica.session.getPreferredPlaceName('region-b') === 'Emerald Valley',
        '57. PHASE J: Bob\'s local preference sticks, independent of Alice\'s');
    assert(aliceReplica.session.getPreferredPlaceName('region-b') === null,
        '58. PHASE J: Bob\'s preference for HIS region never leaks onto Alice\'s replica, which has no preference set for it at all');
    console.log('✓ Phase J: Bob locally chose "Emerald Valley", isolated from Alice\'s own choice');

    // Phase K — the two Worlds remain completely independent throughout.
    assert(aliceWorld.getWorldRegions().length === 1 && aliceWorld.getWorldRegion('region-b') === null,
        '59. PHASE K: Alice\'s World still contains only her own region — Bob\'s region was never added to it');
    assert(bobWorld.getWorldRegions().length === 1 && bobWorld.getWorldRegion('region-a') === null,
        '60. PHASE K: Bob\'s World still contains only his own region — Alice\'s region was never added to it');
    console.log('✓ Phase K: both Worlds remained completely independent');

    // Phase L — no naming claim, preference, or resolution ever
    // modified either WorldRegion.
    assert(regionA.name === 'Unnamed Region' && regionB.name === 'Unnamed Region',
        '61. PHASE L: neither WorldRegion\'s own name was ever rewritten by any claim, preference, or geographic grouping');
    const verifier = new LocalAuthorizationVerifier();
    for (const claim of [...aliceReplica.claimStore.list('alice-world'), ...aliceReplica.claimStore.list('bob-world')]) {
        assert(verifier.verifyPlaceNamingClaim(claim.toJSON()).valid, '62. PHASE L: every claim on Alice\'s replica still independently verifies at the end');
    }
    for (const claim of [...bobReplica.claimStore.list('alice-world'), ...bobReplica.claimStore.list('bob-world')]) {
        assert(verifier.verifyPlaceNamingClaim(claim.toJSON()).valid, '63. PHASE L: every claim on Bob\'s replica still independently verifies at the end');
    }
    console.log('✓ Phase L: neither WorldRegion was ever mutated; every claim on both replicas still verifies');

    console.log('\nAll Place Identity & Geographic Claim Resolution tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
