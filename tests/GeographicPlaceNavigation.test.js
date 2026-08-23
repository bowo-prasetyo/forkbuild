import {
    GEOGRAPHIC_PLACE_LOCATION_PREFIX,
    geographicPlaceLocationId, isGeographicPlaceLocationId, geographicPlaceFingerprintKeyFromLocationId,
    deriveGeographicPlaceNavigationTarget,
    directionLabelBetween,
    deriveNearbyGeographicPlaces, DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS,
    searchGeographicPlaces
} from '../core/GeographicPlaceNavigation.js';
import { buildGeographicPlaceView } from '../core/GeographicPlaceView.js';
import { resolveGeographicPlaces } from '../core/GeographicPlaceResolution.js';
import { WorldLocationDirectory, ORIGIN_LOCATION_ID } from '../application/WorldLocationDirectory.js';
import { WorldLocationKind } from '../core/WorldLocationKind.js';
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
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';

// 0.5.6 — Geographic Place Navigation & Arrival.
//
// 0.5.5 proved a geographic place candidate could be BROWSED — a
// world-wide directory, a place-level view of community names and "why
// grouped together?" This milestone's own design conversation asked a
// different question:
//
//   "I found a place. Now take me there."
//
// This suite proves the navigation layer that answers it, entirely
// WITHOUT a geographic place ever becoming a fourth stored object or a
// new kind of World content:
//
// Section A: core/GeographicPlaceNavigation.js — the derived id space
//            (`place:<fingerprintKey>`), deriveGeographicPlaceNavigationTarget()'s
//            deterministic representative pick, deriveNearbyGeographicPlaces()'s
//            distance/direction math, searchGeographicPlaces()
// Section B: application/WorldLocationDirectory.js (isolated) —
//            find('place:<key>') resolves a real GEOGRAPHIC_PLACE
//            WorldLocation reusing the representative region's own
//            already-offset position; graceful null for every
//            unresolvable case
// Section C: application/WorldNavigationSession.js wiring —
//            getNearbyGeographicPlaces()/searchGeographicPlaces(),
//            focusLocation('place:<key>') resolving through the exact
//            same pipeline as focusLocation(regionId)
// Section D: CAPSTONE — a cross-World flagship: three replicas
//            describing approximately the same ground in three
//            separate Worlds converge on one navigable destination,
//            reachable identically from a directory lookup, a region
//            focus (the "map" path), and a distance query (the
//            "compass"/"nearby" path) — while a geographically
//            unrelated nearby region stays its own separate
//            destination throughout, and nothing is ever mutated.

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

function region({ id, worldId, authorIdentityId, name = 'Unnamed Region', kind = RegionKind.VILLAGE, x, z, radius }) {
    return new WorldRegion({ id, worldId, authorIdentityId, name, kind, position: new Position(x, 0, z), radius });
}

// A replica capable of NAVIGATION, not just candidate resolution —
// mirrors tests/GeographicPlaceDirectory.test.js#makeReplica() exactly,
// plus a real (if publication-free) worldLayoutProvider: focusLocation()/
// getNearbyGeographicPlaces() both resolve region positions through
// _getWorldPosition() -> _worldLayoutProvider.getPosition(), which
// throws on an undefined provider — see application/
// WorldLocationDirectory.js's own header on why a region's position is
// always layout-dependent. With no publications on record, every
// document resolves to the same deterministic (0,0,0) layout offset
// (see world-layout/LocalWorldLayoutProvider.js#getPosition()'s own
// fallback) — consistent across every replica built this way, which is
// all cross-replica determinism actually requires here.
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
    return { session, claimStore, placeNamingClaimUseCase, placeNamingClaimExchange };
}

// Gives a lightweight replica (no avatar presence / camera controller
// wired at all) a "current position" for getNearbyGeographicPlaces()/
// getWelcomeContext() to read — the same private-field test seam
// tests/GeographicPlaceDirectory.test.js#makeReplica() already reaches
// into for `_loadedDocuments`, applied here to the one other piece of
// state this suite's Section C/D need that a full session would
// normally only acquire through start() + real avatar movement.
function setAvatarPosition(session, x, z) {
    session._avatarPresenceSession = { current: { position: { x, y: 0, z } } };
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/GeographicPlaceNavigation.js
    // -------------------------------------------------------------
    {
        // Id space round-trip.
        assert(geographicPlaceLocationId('abc123') === 'place:abc123', '1. geographicPlaceLocationId() prefixes with the fixed constant');
        assert(geographicPlaceLocationId('abc123').startsWith(GEOGRAPHIC_PLACE_LOCATION_PREFIX), '2. the exported prefix constant matches what the builder actually produces');
        assert(geographicPlaceLocationId(null) === null && geographicPlaceLocationId('') === null, '3. geographicPlaceLocationId() is null for no fingerprintKey, never a throw');
        assert(isGeographicPlaceLocationId('place:abc123') === true, '4. isGeographicPlaceLocationId() recognizes its own id shape');
        assert(isGeographicPlaceLocationId('origin') === false && isGeographicPlaceLocationId('some-region-id') === false,
            '5. isGeographicPlaceLocationId() is false for every other location id shape (origin, a plain region/structure/landmark id)');
        assert(isGeographicPlaceLocationId(null) === false && isGeographicPlaceLocationId(undefined) === false, '6. isGeographicPlaceLocationId() never throws on a non-string');
        assert(geographicPlaceFingerprintKeyFromLocationId('place:abc123') === 'abc123', '7. the inverse recovers the exact fingerprintKey');
        assert(geographicPlaceFingerprintKeyFromLocationId('place:') === null, '8. an empty fingerprintKey half is null, never an empty string mistaken for "found"');
        assert(geographicPlaceFingerprintKeyFromLocationId('origin') === null, '9. a non-place id has no fingerprintKey to recover');
        assert(geographicPlaceLocationId(geographicPlaceFingerprintKeyFromLocationId('place:round-trip')) === 'place:round-trip',
            '10. the id -> key -> id round trip is lossless');

        // deriveGeographicPlaceNavigationTarget() — built off a REAL
        // GeographicPlaceView, exactly what a directory row/place panel
        // actually hands this function.
        const regionA = region({ id: 'a', worldId: 'w1', authorIdentityId: 'alice', x: 100, z: 200, radius: 50 });
        const regionB = region({ id: 'b', worldId: 'w2', authorIdentityId: 'bob', name: 'Kawahara Village', x: 100.3, z: 199.7, radius: 50 });
        const groups = resolveGeographicPlaces([regionA, regionB], []);
        const place = buildGeographicPlaceView(groups[0]);

        const target = deriveGeographicPlaceNavigationTarget(place);
        assert(target && target.regionId === place.representativeRegion.id && target.worldId === place.representativeRegion.worldId,
            '11. the navigation target IS the place\'s own deterministic representativeRegion — never re-derived or re-picked');
        assert(target.regionId === 'a', '12. representativeRegion is the worldId:id-sorted first region ("w1:a" < "w2:b") — matches core/GeographicPlaceView.js exactly');
        assert(target.title === place.displayName, '13. the target\'s title is the place\'s own displayName, never the representative region\'s raw WorldRegion.name when a better one exists');
        assert(target.fingerprintKey === place.fingerprintKey, '14. the target carries the place\'s own fingerprintKey through');

        assert(deriveGeographicPlaceNavigationTarget(null) === null, '15. deriveGeographicPlaceNavigationTarget(null) is null, never a throw');
        assert(deriveGeographicPlaceNavigationTarget({ representativeRegion: null }) === null, '16. a placeless representativeRegion is null');
        assert(deriveGeographicPlaceNavigationTarget({ representativeRegion: {} }) === null, '17. a representativeRegion with no id at all is null');

        // Purely a presentation pick, never authority — the SAME
        // restraint core/GeographicPlaceView.js's own representativeRegion
        // already holds to; this function adds no new opinion.
        assert(regionA.name === 'Unnamed Region' && regionB.name === 'Kawahara Village',
            '18. deriving a navigation target never writes back into either WorldRegion');

        // directionLabelBetween()
        assert(directionLabelBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }) === 'N', '19. due +Z is North, matching core/CompassHeading.js\'s own convention');
        assert(directionLabelBetween({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }) === 'E', '20. due +X is East');
        assert(directionLabelBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 }) === 'S', '21. due -Z is South');
        assert(directionLabelBetween({ x: 0, y: 0, z: 0 }, { x: -10, y: 0, z: 0 }) === 'W', '22. due -X is West');
        assert(directionLabelBetween({ x: 5, y: 0, z: 5 }, { x: 5, y: 0, z: 5 }) === null, '23. the exact same position has no meaningful direction — null, never a fabricated one');
        assert(directionLabelBetween(null, { x: 1, y: 0, z: 1 }) === null && directionLabelBetween({ x: 0, y: 0, z: 0 }, null) === null,
            '24. a missing endpoint is null, never a throw');

        // deriveNearbyGeographicPlaces()
        const viewer = { x: 0, y: 0, z: 0 };
        const entries = [
            { fingerprintKey: 'near', displayName: 'Near Place', position: { x: 0, y: 0, z: 10 } },
            { fingerprintKey: 'far', displayName: 'Far Place', position: { x: 0, y: 0, z: 1000 } },
            { fingerprintKey: 'mid', displayName: 'Mid Place', position: { x: 30, y: 0, z: 40 } }
        ];
        const nearby = deriveNearbyGeographicPlaces(entries, viewer, 100);
        assert(nearby.length === 2, '25. only entries within the radius survive — "far" (1000m) is excluded from a 100m search');
        assert(nearby[0].fingerprintKey === 'near' && nearby[0].distance === 10, '26. nearest first, exact XZ distance');
        assert(nearby[1].fingerprintKey === 'mid' && nearby[1].distance === 50, '27. the 3-4-5 triangle (30,40) resolves to exactly 50m');
        assert(nearby[0].direction === 'N', '28. each surviving row carries its own compass direction from the viewer');
        assert(deriveNearbyGeographicPlaces(entries, null, 100).length === 0, '29. no viewer position at all is [], never a throw');
        assert(deriveNearbyGeographicPlaces([], viewer, 100).length === 0, '30. no entries at all is []');
        assert(typeof DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS === 'number' && DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS > 0,
            '31. a real, positive default radius is exported for callers that don\'t pick their own');

        // Deterministic tie-break: two entries at the EXACT same distance
        // sort by fingerprintKey, not by array order.
        const tied = [
            { fingerprintKey: 'zzz', position: { x: 0, y: 0, z: 10 } },
            { fingerprintKey: 'aaa', position: { x: 10, y: 0, z: 0 } }
        ];
        const tiedResult = deriveNearbyGeographicPlaces(tied, viewer, 100);
        assert(tiedResult[0].fingerprintKey === 'aaa', '32. equal-distance entries break the tie by fingerprintKey, deterministic regardless of input order');

        // searchGeographicPlaces()
        const searchable = [
            { fingerprintKey: 'k1', displayName: 'Kawahara Village', names: [{ name: 'Kawahara Village' }, { name: 'Kawahara Settlement' }], regions: [{ name: 'Unnamed Region' }] },
            { fingerprintKey: 'k2', displayName: 'Old Market', names: [], regions: [{ name: 'Old Market' }] }
        ];
        assert(searchGeographicPlaces(searchable, 'kawa').length === 1, '33. matches against displayName, case-insensitively');
        assert(searchGeographicPlaces(searchable, 'Settlement')[0].fingerprintKey === 'k1', '34. matches against a NON-top-ranked community name, not just displayName');
        assert(searchGeographicPlaces(searchable, 'old market').length === 1, '35. matches against a plain WorldRegion.name when no claim exists at all');
        assert(searchGeographicPlaces(searchable, '').length === 2, '36. an empty query returns every place, unfiltered');
        assert(searchGeographicPlaces(searchable, '   ').length === 2, '37. a whitespace-only query is treated as empty too');
        assert(searchGeographicPlaces(searchable, 'nonexistent').length === 0, '38. no match is [], never a throw');
        assert(searchGeographicPlaces([], 'anything').length === 0, '39. searching an empty directory is []');
        assert(searchGeographicPlaces(undefined, 'x').length === 0, '40. searchGeographicPlaces(undefined, ...) is [], never a throw');
    }
    console.log('✓ Section A: core/GeographicPlaceNavigation.js — id space, deterministic navigation target, distance/direction math, search');

    // -------------------------------------------------------------
    // Section B: application/WorldLocationDirectory.js (isolated)
    // -------------------------------------------------------------
    {
        const worldX = new World({ id: 'world-x' });
        const regionX = region({ id: 'region-x', worldId: 'world-x', authorIdentityId: 'alice', name: 'Riverside', x: 10, z: 20, radius: 5 });
        worldX.addWorldRegion(regionX);
        const docX = { world: worldX };

        const groups = resolveGeographicPlaces([{ id: 'region-x', worldId: 'world-x', name: 'Riverside', kind: RegionKind.PLACE, radius: 5, authorIdentityId: 'alice', position: { x: 10, y: 0, z: 20 } }], []);
        const place = buildGeographicPlaceView(groups[0]);
        const placeLocationId = geographicPlaceLocationId(place.fingerprintKey);

        const fakeSession = {
            getLoadedDocuments: () => [docX],
            getDocumentPosition: (id) => (id === 'world-x' ? new Position(1000, 0, 2000) : new Position(0, 0, 0)),
            getSavedDocumentTitle: () => 'Untitled',
            getGeographicPlace: (fingerprintKey) => (fingerprintKey === place.fingerprintKey ? place : null)
        };
        const directory = new WorldLocationDirectory(fakeSession);

        const location = directory.find(placeLocationId);
        assert(location && location.kind === WorldLocationKind.GEOGRAPHIC_PLACE, '41. find(\'place:<key>\') resolves a WorldLocation of kind GEOGRAPHIC_PLACE');
        assert(location.id === placeLocationId, '42. the resolved location keeps the place\'s own derived id, not the region\'s raw id');
        assert(location.title === place.displayName, '43. the title is the place\'s own displayName');
        // world-space = region-local (10, 0, 20) + the containing
        // document's own layout offset (1000, 0, 2000) — the EXACT same
        // offset application/WorldLocationDirectory.js#_regionLocationsFor()
        // already applies for a plain REGION location.
        assert(location.position.x === 1010 && location.position.z === 2020,
            '44. the resolved position is the representative region\'s own layout-offset position, reusing _regionLocationsFor()\'s math rather than recomputing it');
        assert(location.isGeographicPlace === true, '45. WorldLocation#isGeographicPlace reflects the new kind');

        // list() itself stays untouched by this milestone: a geographic
        // place candidate is reachable through find(), but never a row a
        // plain Locations browse sees (it would otherwise duplicate the
        // single region already listed once under its own REGION kind).
        const listed = directory.list();
        assert(listed.every((l) => l.kind !== WorldLocationKind.GEOGRAPHIC_PLACE), '46. list() never includes a GEOGRAPHIC_PLACE row');
        assert(listed.some((l) => l.id === 'region-x' && l.kind === WorldLocationKind.REGION), '47. the underlying region is still listed once, under its own plain REGION id');
        assert(listed[0].kind === WorldLocationKind.ORIGIN && listed[0].id === ORIGIN_LOCATION_ID, '48. Origin is still listed first, exactly as before this milestone');

        // Graceful nulls.
        assert(directory.find(geographicPlaceLocationId('unknown-key')) === null, '49. an unknown fingerprintKey resolves to null, never a throw');
        const sessionWithoutMethod = { getLoadedDocuments: () => [], getDocumentPosition: () => new Position(0, 0, 0), getSavedDocumentTitle: () => '' };
        assert(new WorldLocationDirectory(sessionWithoutMethod).find(placeLocationId) === null,
            '50. a session with no getGeographicPlace() wired at all degrades gracefully to null, never a throw');
        const sessionWithoutWorld = { getLoadedDocuments: () => [], getDocumentPosition: () => new Position(0, 0, 0), getSavedDocumentTitle: () => '', getGeographicPlace: () => place };
        assert(new WorldLocationDirectory(sessionWithoutWorld).find(placeLocationId) === null,
            '51. a place whose representative region\'s own World isn\'t currently loaded resolves to null rather than a stale/guessed position');
        assert(directory.find('not-a-place-id') === null, '52. an ordinary unknown id still falls through to the pre-existing list()-based lookup and returns null');
    }
    console.log('✓ Section B: application/WorldLocationDirectory.js — GEOGRAPHIC_PLACE resolution reuses region geometry, never listed, graceful nulls throughout');

    // -------------------------------------------------------------
    // Section C: application/WorldNavigationSession.js wiring
    // -------------------------------------------------------------
    {
        // Nothing loaded, nothing wired -> graceful empties, never a throw.
        const bareSession = new WorldNavigationSession({ registry: null });
        assert(Array.isArray(bareSession.getNearbyGeographicPlaces()) && bareSession.getNearbyGeographicPlaces().length === 0,
            '53. getNearbyGeographicPlaces() is [] with no position available at all');
        assert(Array.isArray(bareSession.searchGeographicPlaces('anything')) && bareSession.searchGeographicPlaces('anything').length === 0,
            '54. searchGeographicPlaces() is [] with nothing loaded');
        assert(bareSession.focusLocation('place:anything') === false, '55. focusLocation() with an unresolvable geographic-place id is false, never a throw');

        // A single replica, one region, a real position nearby.
        const solo = region({ id: 'solo', worldId: 'w1', authorIdentityId: 'alice', name: 'Solitary Hamlet', x: 100, z: 200, radius: 10 });
        const world = new World({ id: 'w1' });
        world.addWorldRegion(solo);
        const { session } = makeReplica(makeIdentity('Solo'), [{ world }]);

        assert(session.getNearbyGeographicPlaces().length === 0, '56. getNearbyGeographicPlaces() is [] before any position is known, even with a place loaded');
        setAvatarPosition(session, 105, 205);
        const nearby = session.getNearbyGeographicPlaces();
        assert(nearby.length === 1 && nearby[0].displayName === 'Solitary Hamlet', '57. once a position is known, the loaded place is found nearby');
        assert(nearby[0].distance > 0 && nearby[0].distance < 10, '58. the reported distance is the real XZ distance to the SAME position focusLocation() itself resolves to (see phase below)');
        assert(session.getNearbyGeographicPlaces(1).length === 0, '59. a radius tighter than the actual distance excludes it, same as core/GeographicPlaceNavigation.js\'s own filter');

        const directory = session.getGeographicPlaceDirectory();
        assert(directory.length === 1, 'sanity: exactly one candidate place');
        const fingerprintKey = directory[0].fingerprintKey;

        // focusLocation() via the place id resolves to the EXACT same
        // position focusLocation() via the plain region id already does
        // — "Go to Place" and the region-level "Show on Map" path can
        // never disagree about where they're taking the viewer.
        assert(session.focusLocation(geographicPlaceLocationId(fingerprintKey)) === true, '60. focusLocation(\'place:<key>\') returns true for a real place');
        const viaPlace = session._worldLocationDirectory.find(geographicPlaceLocationId(fingerprintKey));
        const viaRegion = session._worldLocationDirectory.find('solo');
        assert(viaPlace.position.x === viaRegion.position.x && viaPlace.position.z === viaRegion.position.z,
            '61. the geographic-place path and the plain-region path converge on the identical world-space position');
        assert(viaPlace.title === 'Solitary Hamlet' && viaRegion.title === 'Solitary Hamlet', '62. both paths agree on the same displayed title too, with no naming claims published');

        assert(session.focusLocation(geographicPlaceLocationId('unknown-key')) === false, '63. an unknown fingerprintKey still returns false on a wired session, never a throw');

        // searchGeographicPlaces() delegates to the pure function over
        // the session\'s own live directory.
        assert(session.searchGeographicPlaces('Solitary').length === 1, '64. searchGeographicPlaces() finds a real place by name');
        assert(session.searchGeographicPlaces('does-not-exist').length === 0, '65. searchGeographicPlaces() with no match is []');
    }
    console.log('✓ Section C: application/WorldNavigationSession.js — getNearbyGeographicPlaces()/searchGeographicPlaces() wiring, focusLocation() converges with region-level navigation');

    // -------------------------------------------------------------
    // Section D: CAPSTONE — the flagship scenario
    // -------------------------------------------------------------
    console.log('\n--- Geographic Place Navigation & Arrival: flagship scenario ---');

    // Phase A — Alice, Bob, and Carol each independently describe
    // approximately the same ground, in THREE separate Worlds — the
    // exact scenario tests/GeographicPlaceDirectory.test.js's own
    // flagship establishes, reused here as the substrate this
    // milestone's NAVIGATION layer is proven against.
    const alice = makeIdentity('Alice');
    const aliceId = resolveSigningIdentityId(alice);
    const bob = makeIdentity('Bob');
    const bobId = resolveSigningIdentityId(bob);
    const carol = makeIdentity('Carol');
    const carolId = resolveSigningIdentityId(carol);

    const regionA = region({ id: 'region-a', worldId: 'alice-world', authorIdentityId: aliceId, x: 100, z: 200, radius: 50 });
    const aliceWorld = new World({ id: 'alice-world' });
    aliceWorld.addWorldRegion(regionA);

    const regionB = region({ id: 'region-b', worldId: 'bob-world', authorIdentityId: bobId, x: 100.4, z: 199.7, radius: 50 });
    const bobWorld = new World({ id: 'bob-world' });
    bobWorld.addWorldRegion(regionB);

    const regionC = region({ id: 'region-c', worldId: 'carol-world', authorIdentityId: carolId, x: 100.2, z: 200.1, radius: 50 });
    const carolWorld = new World({ id: 'carol-world' });
    carolWorld.addWorldRegion(regionC);

    // A geographically UNRELATED region, close enough in world-space to
    // land inside "nearby," that must never merge with the Kawahara
    // group and must stay independently navigable throughout.
    const regionCamp = region({ id: 'region-camp', worldId: 'alice-world', authorIdentityId: aliceId, name: 'Riverside Camp', kind: RegionKind.PLACE, x: 150, z: 200, radius: 8 });
    aliceWorld.addWorldRegion(regionCamp);

    console.log('✓ Phase A: Alice, Bob, and Carol each independently described approximately the same ground in three separate Worlds, plus one unrelated nearby region');

    const worlds = [{ world: aliceWorld }, { world: bobWorld }, { world: carolWorld }];
    const aliceReplica = makeReplica(alice, worlds);
    const bobReplica = makeReplica(bob, worlds);
    const carolReplica = makeReplica(carol, worlds);

    // Phase B — Alice publishes "Kawahara"; Bob and Carol both publish
    // "Kawahara Village" (a real majority); every claim is exchanged to
    // every replica.
    aliceReplica.session.publishPlaceNamingClaim('region-a', 'Kawahara');
    bobReplica.session.publishPlaceNamingClaim('region-b', 'Kawahara Village');
    carolReplica.session.publishPlaceNamingClaim('region-c', 'Kawahara Village');
    function exportAll(replica, worldId, regionId) {
        return replica.claimStore.listForRegion(worldId, regionId)
            .map((claim) => replica.session.exportPlaceNamingClaim(regionId, claim.id));
    }
    const packages = [
        ...exportAll(aliceReplica, 'alice-world', 'region-a'),
        ...exportAll(bobReplica, 'bob-world', 'region-b'),
        ...exportAll(carolReplica, 'carol-world', 'region-c')
    ];
    for (const replica of [aliceReplica, bobReplica, carolReplica]) {
        for (const pkg of packages) {
            replica.session.importPlaceNamingClaim(JSON.parse(JSON.stringify(pkg)));
        }
    }
    console.log('✓ Phase B: names published and exchanged — all three replicas now know every claim');

    // Phase C — every replica gives its OWN viewer a position near the
    // Kawahara group (world-space is unoffset here — every document
    // resolves to the same (0,0,0) layout position with no publications
    // on record — so a position near (100, 200) sits near every one of
    // Alice/Bob/Carol's own regions at once).
    for (const replica of [aliceReplica, bobReplica, carolReplica]) {
        setAvatarPosition(replica.session, 100, 200);
    }
    console.log('✓ Phase C: every replica\'s own viewer is positioned near the described ground');

    // Phase D — every replica's directory converges on ONE combined
    // Kawahara place (never fewer, never more) — the exact 0.5.5
    // guarantee this milestone builds navigation on top of, unchanged.
    let fingerprintKey = null;
    for (const [label, replica] of [['Alice', aliceReplica], ['Bob', bobReplica], ['Carol', carolReplica]]) {
        const directory = replica.session.getGeographicPlaceDirectory();
        assert(directory.length === 2, `66. [${label}] exactly two candidate places: the combined Kawahara group, and the unrelated Riverside Camp`);
        const kawahara = directory.find((p) => p.displayName === 'Kawahara Village');
        assert(kawahara && kawahara.regions.length === 3, `67. [${label}] all three independently-authored regions landed in the same group`);
        if (fingerprintKey === null) {
            fingerprintKey = kawahara.fingerprintKey;
        } else {
            assert(kawahara.fingerprintKey === fingerprintKey, `68. [${label}] every replica computes the exact SAME fingerprintKey for the group — no replica-specific identity`);
        }
    }
    console.log('✓ Phase D: all three replicas independently converge on one combined Kawahara place, identically keyed');

    // Phase E — the navigation destination itself: every replica's
    // focusLocation('place:<key>') resolves to the IDENTICAL position —
    // the representative region is region-a (alice-world:region-a sorts
    // first among alice-world/bob-world/carol-world), so the target is
    // (100, 0, 200) on every replica, regardless of which replica is
    // asking or which name currently ranks first.
    const placeId = geographicPlaceLocationId(fingerprintKey);
    const resolvedPositions = [];
    for (const [label, replica] of [['Alice', aliceReplica], ['Bob', bobReplica], ['Carol', carolReplica]]) {
        assert(replica.session.focusLocation(placeId) === true, `69. [${label}] focusLocation('place:<key>') succeeds`);
        const location = replica.session._worldLocationDirectory.find(placeId);
        assert(location.title === 'Kawahara Village', `70. [${label}] the resolved destination is titled with the community's own top-ranked name`);
        resolvedPositions.push(`${location.position.x},${location.position.y},${location.position.z}`);
    }
    assert(resolvedPositions[0] === resolvedPositions[1] && resolvedPositions[1] === resolvedPositions[2],
        '71. all three replicas resolve focusLocation(\'place:<key>\') to the byte-identical destination — a deterministic representative, not a per-replica guess');
    console.log('✓ Phase E: all three replicas resolve the SAME deterministic destination through focusLocation()');

    // Phase F — the same destination is reachable from every OTHER
    // entry point this milestone wires it to, and they all agree:
    //   - the directory/place-panel path: focusLocation('place:<key>')
    //     (already proven in Phase E)
    //   - the map/region path: focusLocation() on the representative
    //     region's own plain id directly
    //   - the compass/"nearby" path: getNearbyGeographicPlaces()'s own
    //     resolved position
    {
        const viaPlace = aliceReplica.session._worldLocationDirectory.find(placeId);
        const viaRegion = aliceReplica.session._worldLocationDirectory.find('region-a');
        assert(viaPlace.position.x === viaRegion.position.x && viaPlace.position.z === viaRegion.position.z,
            '72. the directory/place-panel path and the map/region path converge on the identical position');

        const nearby = aliceReplica.session.getNearbyGeographicPlaces();
        assert(nearby.length === 2, '73. getNearbyGeographicPlaces() finds BOTH candidates near the viewer: the Kawahara group and the unrelated Riverside Camp');
        const kawaharaNearby = nearby.find((p) => p.fingerprintKey === fingerprintKey);
        assert(kawaharaNearby, '74. the Kawahara group itself is among the nearby results');
        assert(kawaharaNearby.position.x === viaPlace.position.x && kawaharaNearby.position.z === viaPlace.position.z,
            '75. the compass/"nearby" path resolves to the exact same position focusLocation() itself would move the camera to');
        const camp = nearby.find((p) => p.displayName === 'Riverside Camp');
        assert(camp && camp.fingerprintKey !== fingerprintKey, '76. the geographically unrelated Riverside Camp stays its own separate, independently-navigable destination — never merged into the Kawahara group by mere proximity');
    }
    console.log('✓ Phase F: the directory, map, and compass/nearby paths all converge on the same destination; an unrelated nearby region stays separate');

    // Phase G — geographic IDENTITY (which regions group, which region
    // is representative) is a pure function of GEOMETRY alone, entirely
    // independent of naming claims: changing which name currently ranks
    // first changes the DISPLAYED title, never the destination or the
    // grouping. Proven directly against core/GeographicPlaceResolution.js,
    // no replica plumbing required.
    {
        const rawRegions = [
            { id: 'region-a', worldId: 'alice-world', name: 'Unnamed Region', kind: RegionKind.VILLAGE, radius: 50, authorIdentityId: aliceId, position: { x: 100, y: 0, z: 200 } },
            { id: 'region-b', worldId: 'bob-world', name: 'Unnamed Region', kind: RegionKind.VILLAGE, radius: 50, authorIdentityId: bobId, position: { x: 100.4, y: 0, z: 199.7 } },
            { id: 'region-c', worldId: 'carol-world', name: 'Unnamed Region', kind: RegionKind.VILLAGE, radius: 50, authorIdentityId: carolId, position: { x: 100.2, y: 0, z: 200.1 } }
        ];
        const claimsFavoringKawahara = [
            { regionId: 'region-a', name: 'Kawahara', authorIdentityId: aliceId, createdAt: '2026-01-01T00:00:00.000Z' },
            { regionId: 'region-b', name: 'Kawahara Village', authorIdentityId: bobId, createdAt: '2026-01-02T00:00:00.000Z' },
            { regionId: 'region-c', name: 'Kawahara Village', authorIdentityId: carolId, createdAt: '2026-01-03T00:00:00.000Z' }
        ];
        const claimsFavoringSettlement = [
            { regionId: 'region-a', name: 'Kawahara Settlement', authorIdentityId: aliceId, createdAt: '2026-01-01T00:00:00.000Z' },
            { regionId: 'region-b', name: 'Kawahara Settlement', authorIdentityId: bobId, createdAt: '2026-01-02T00:00:00.000Z' },
            { regionId: 'region-c', name: 'Kawahara', authorIdentityId: carolId, createdAt: '2026-01-03T00:00:00.000Z' }
        ];
        const placeA = buildGeographicPlaceView(resolveGeographicPlaces(rawRegions, claimsFavoringKawahara)[0]);
        const placeB = buildGeographicPlaceView(resolveGeographicPlaces(rawRegions, claimsFavoringSettlement)[0]);
        assert(placeA.fingerprintKey === placeB.fingerprintKey, '77. the fingerprintKey (geographic identity) is unaffected by which claims exist at all');
        assert(placeA.displayName === 'Kawahara Village' && placeB.displayName === 'Kawahara Settlement', '78. only the DISPLAYED name changes with claim rankings — the two scenarios really do disagree about the top name');
        const targetA = deriveGeographicPlaceNavigationTarget(placeA);
        const targetB = deriveGeographicPlaceNavigationTarget(placeB);
        assert(targetA.regionId === targetB.regionId && targetA.worldId === targetB.worldId,
            '79. the NAVIGATION TARGET (which region is representative) is byte-identical regardless of which name currently ranks first');
    }
    console.log('✓ Phase G: changing which name ranks top changes only the displayed title, never the geographic identity or the navigation target');

    // Phase H — nothing here was ever mutated, and nothing new was ever
    // persisted: every WorldRegion is byte-identical to how it was
    // authored, and two independent reads of the same directory never
    // return the same cached object instance (proving each is rebuilt
    // fresh, never a stored singleton this milestone silently
    // introduced).
    assert(regionA.name === 'Unnamed Region' && regionB.name === 'Unnamed Region' && regionC.name === 'Unnamed Region' && regionCamp.name === 'Riverside Camp',
        '80. every WorldRegion\'s own name is exactly what it was created with — no navigation lookup, focusLocation() call, or nearby-places query ever rewrote one');
    const firstRead = aliceReplica.session.getGeographicPlaceDirectory();
    const secondRead = aliceReplica.session.getGeographicPlaceDirectory();
    assert(firstRead !== secondRead && firstRead.find((p) => p.fingerprintKey === fingerprintKey) !== secondRead.find((p) => p.fingerprintKey === fingerprintKey),
        '81. every read rebuilds fresh GeographicPlaceView instances — nothing is cached or stored as a persistent object this milestone introduced');
    assert(JSON.stringify(firstRead.map((p) => p.toJSON())) === JSON.stringify(secondRead.map((p) => p.toJSON())),
        '82. despite being freshly rebuilt every time, the CONTENT of two consecutive reads is byte-identical — purely derived, deterministic, never drifting on its own');
    console.log('✓ Phase H: no WorldRegion is ever mutated; nothing is cached as a new persistent object');

    console.log('\nAll Geographic Place Navigation & Arrival tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
