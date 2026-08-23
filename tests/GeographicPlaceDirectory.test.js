import {
    GeographicPlaceView, buildGeographicPlaceView, describeCandidacyReasons, CANDIDACY_CAVEAT
} from '../core/GeographicPlaceView.js';
import {
    buildGeographicPlaceDirectory, geographicPlaceByKey, geographicPlaceForRegionId
} from '../core/GeographicPlaceDirectory.js';
import { resolveGeographicPlaces } from '../core/GeographicPlaceResolution.js';
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

// 0.5.5 — Geographic Place Directory & Identity UX.
//
// 0.5.4 (Place Identity & Geographic Claim Resolution) proved a client
// can GROUP regions into geographic-place candidates and RANK their
// names together, but left the result reachable only through a naming
// panel already scoped to one region. This milestone's own design
// conversation named the gap directly:
//
//   A geographic place is a DERIVED VIEW over descriptions, not a new
//   object that owns them.
//
// This suite proves the new pipeline this milestone adds on top of
// 0.5.4's own resolution layer, entirely unchanged:
//
//   WorldRegion -> PlaceFingerprint -> PlaceIdentity ->
//   GeographicPlaceView -> UI
//
// Section A: core/GeographicPlaceView.js — buildGeographicPlaceView(),
//            displayName priority, deterministic representative pick,
//            worldCount/authorCount dedup, describeCandidacyReasons()
// Section B: core/GeographicPlaceDirectory.js — buildGeographicPlaceDirectory()
//            ordering, geographicPlaceByKey(), geographicPlaceForRegionId(),
//            graceful degradation on empty/unknown input
// Section C: application/WorldNavigationSession.js wiring —
//            getGeographicPlaceDirectory()/getGeographicPlace(), nothing
//            loaded/wired, once regions ARE loaded
// Section D: regression — nothing here ever mutates a WorldRegion or a
//            PlaceNamingClaim
// Section E: CAPSTONE — the flagship scenario: Alice, Bob, and Carol
//            each independently describe approximately the same ground
//            in THREE separate Worlds, publish and exchange names, and
//            converge on one directory entry — while a FOURTH,
//            similarly-NAMED but geographically unrelated region Alice
//            creates elsewhere stays its own separate entry. Same name
//            is never enough; same geography is only ever a candidate.

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

// Mirrors tests/PlaceIdentity.test.js#makeReplica() exactly — one fully
// independent replica's own naming-claim backend, plus a
// WorldNavigationSession built directly against whichever World
// documents this test hands it, bypassing the full persistence stack.
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
    return { session, claimStore, placeNamingClaimUseCase, placeNamingClaimExchange };
}

function region({ id, worldId, authorIdentityId, name = 'Unnamed Region', kind = RegionKind.VILLAGE, x, z, radius }) {
    return new WorldRegion({ id, worldId, authorIdentityId, name, kind, position: new Position(x, 0, z), radius });
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/GeographicPlaceView.js
    // -------------------------------------------------------------
    {
        const regionA = region({ id: 'a', worldId: 'w1', authorIdentityId: 'alice', x: 100, z: 200, radius: 50 });
        const regionB = region({ id: 'b', worldId: 'w2', authorIdentityId: 'bob', x: 100.3, z: 199.7, radius: 50 });
        const claims = [
            { regionId: 'a', name: 'Kawahara', authorIdentityId: 'alice', createdAt: '2026-01-01T00:00:00.000Z' },
            { regionId: 'b', name: 'Kawahara Village', authorIdentityId: 'bob', createdAt: '2026-01-02T00:00:00.000Z' },
            { regionId: 'b', name: 'Kawahara Village', authorIdentityId: 'carol', createdAt: '2026-01-03T00:00:00.000Z' }
        ];

        const groups = resolveGeographicPlaces([regionA, regionB], claims);
        assert(groups.length === 1, '1. two independently-authored, near-identical regions resolve to one group');
        const view = buildGeographicPlaceView(groups[0]);
        assert(view instanceof GeographicPlaceView, '2. buildGeographicPlaceView() returns a GeographicPlaceView');
        assert(view.regions.length === 2, '3. the view carries both regions');
        assert(view.worldCount === 2, '4. worldCount counts DISTINCT worldIds, not regions');
        assert(view.authorCount === 3, '5. authorCount is the union of region authors (alice, bob) AND claim authors (alice, bob, carol) = 3, never double-counted');
        assert(view.displayName === 'Kawahara Village', '6. displayName is the top-ranked COMBINED name (score 2) over a lone single-author name (score 1)');
        assert(view.descriptionCount === 2, '7. descriptionCount mirrors regions.length exactly');
        // Deterministic representative: regions arrive pre-sorted by
        // `${worldId}:${id}` (core/GeographicPlaceResolution.js#buildPlaceGroup())
        // — 'w1:a' sorts before 'w2:b'.
        assert(view.representativeRegion.id === 'a', '8. representativeRegion is the deterministic worldId:id-sorted first region, never an "authoritative" pick');

        // A region with NO claims at all falls back to its own name.
        const soloRegion = region({ id: 'solo', worldId: 'w3', authorIdentityId: 'dave', name: 'Solitary Hamlet', x: 9000, z: 9000, radius: 10 });
        const soloGroups = resolveGeographicPlaces([soloRegion], []);
        const soloView = buildGeographicPlaceView(soloGroups[0]);
        assert(soloView.displayName === 'Solitary Hamlet', '9. with no claims at all, displayName falls back to the representative region\'s own WorldRegion.name');
        assert(soloView.authorCount === 1, '10. a solo region with no claims still counts its own author');

        // describeCandidacyReasons() / CANDIDACY_CAVEAT
        const reasons = describeCandidacyReasons(view);
        assert(reasons.length === 4, '11. a multi-region group has a full 4-item candidacy checklist');
        assert(describeCandidacyReasons(soloView).length === 0, '12. a single-region group has NOTHING to explain — no candidacy checklist');
        assert(describeCandidacyReasons(null).length === 0, '13. describeCandidacyReasons(null) is [], never a throw');
        assert(typeof CANDIDACY_CAVEAT === 'string' && CANDIDACY_CAVEAT.length > 0, '14. CANDIDACY_CAVEAT is a real, non-empty sentence');
        assert(CANDIDACY_CAVEAT.toLowerCase().includes('candidate') && CANDIDACY_CAVEAT.toLowerCase().includes('not a verified identity'),
            '15. the caveat itself frames this as candidacy, explicitly NOT a verified identity');

        // Graceful absence.
        assert(buildGeographicPlaceView(null) === null, '16. buildGeographicPlaceView(null) is null, never a throw');
        assert(buildGeographicPlaceView({ regions: [] }) === null, '17. buildGeographicPlaceView({ regions: [] }) is null');

        // toJSON() — exactly the shape ui/components/GeographicPlacePanel.js
        // actually consumes.
        const json = view.toJSON();
        assert(json.displayName === 'Kawahara Village' && json.descriptionCount === 2 && Array.isArray(json.reasons) && json.reasons.length === 4 && json.caveat === CANDIDACY_CAVEAT,
            '18. toJSON() carries displayName/descriptionCount/reasons/caveat alongside the raw fields');

        // The load-bearing restraint: nothing above ever touched a
        // WorldRegion's own name.
        assert(regionA.name === 'Unnamed Region' && regionB.name === 'Unnamed Region',
            '19. building a GeographicPlaceView NEVER writes back to either WorldRegion\'s own name');
    }
    console.log('✓ Section A: core/GeographicPlaceView.js — derived rows, deterministic representative, never mutates a WorldRegion');

    // -------------------------------------------------------------
    // Section B: core/GeographicPlaceDirectory.js
    // -------------------------------------------------------------
    {
        const kawaharaA = region({ id: 'kw-a', worldId: 'w1', authorIdentityId: 'alice', x: 100, z: 200, radius: 50 });
        const kawaharaB = region({ id: 'kw-b', worldId: 'w2', authorIdentityId: 'bob', x: 100.2, z: 199.8, radius: 50 });
        const oldMarket = region({ id: 'market', worldId: 'w3', authorIdentityId: 'erin', name: 'Old Market', kind: RegionKind.PLACE, x: 8000, z: 8000, radius: 10 });
        // ADVERSARIAL: a similarly-NAMED but geographically unrelated
        // region — same name family as the Kawahara group below, but
        // must never merge into it purely by string similarity.
        const kawaharaTown = region({ id: 'kw-town', worldId: 'w1', authorIdentityId: 'alice', name: 'Kawahara Town', kind: RegionKind.TOWN, x: -5000, z: -5000, radius: 80 });

        const claims = [
            { regionId: 'kw-a', name: 'Kawahara', authorIdentityId: 'alice', createdAt: '2026-01-01T00:00:00.000Z' },
            { regionId: 'kw-b', name: 'Kawahara Village', authorIdentityId: 'bob', createdAt: '2026-01-02T00:00:00.000Z' },
            { regionId: 'kw-b', name: 'Kawahara Village', authorIdentityId: 'carol', createdAt: '2026-01-03T00:00:00.000Z' }
        ];
        const regions = [kawaharaA, kawaharaB, oldMarket, kawaharaTown];

        const directory = buildGeographicPlaceDirectory(regions, claims);
        assert(directory.length === 3, '20. the directory lists all THREE candidate groups, including two singletons — never merges by name alone');
        assert(directory.every((place) => place instanceof GeographicPlaceView), '21. every directory row is a real GeographicPlaceView');

        // Alphabetical-by-displayName ordering, case-insensitive: "Kawahara
        // Town" < "Kawahara Village" < "Old Market".
        const names = directory.map((p) => p.displayName);
        assert(JSON.stringify(names) === JSON.stringify(['Kawahara Town', 'Kawahara Village', 'Old Market']),
            `22. directory is sorted alphabetically by displayName, got ${JSON.stringify(names)}`);

        const kawaharaGroup = directory.find((p) => p.displayName === 'Kawahara Village');
        assert(kawaharaGroup.regions.length === 2, '23. the real Kawahara group has exactly two regions — kw-town never joined it');
        const kawaharaTownGroup = directory.find((p) => p.displayName === 'Kawahara Town');
        assert(kawaharaTownGroup.regions.length === 1, '24. "Kawahara Town" is its own separate, single-region place — same name, different ground');

        // geographicPlaceByKey()
        const byKey = geographicPlaceByKey(kawaharaGroup.fingerprintKey, regions, claims);
        assert(byKey && byKey.fingerprintKey === kawaharaGroup.fingerprintKey, '25. geographicPlaceByKey() re-fetches the exact same place by its own key');
        assert(geographicPlaceByKey('nonexistent-key', regions, claims) === null, '26. geographicPlaceByKey() is null for an unknown key, never a throw');
        assert(geographicPlaceByKey(null, regions, claims) === null, '27. geographicPlaceByKey(null) is null');
        assert(geographicPlaceByKey(kawaharaGroup.fingerprintKey, [], []) === null, '28. geographicPlaceByKey() with no regions at all is null');

        // geographicPlaceForRegionId()
        const forRegion = geographicPlaceForRegionId('kw-a', regions, claims);
        assert(forRegion && forRegion.fingerprintKey === kawaharaGroup.fingerprintKey, '29. geographicPlaceForRegionId(kw-a) resolves to the same combined group as kw-b');
        assert(geographicPlaceForRegionId('does-not-exist', regions, claims) === null, '30. geographicPlaceForRegionId() is null for an unknown regionId');

        // Empty input.
        assert(buildGeographicPlaceDirectory([], []).length === 0, '31. an empty directory for no regions, never a throw');
        assert(buildGeographicPlaceDirectory().length === 0, '32. buildGeographicPlaceDirectory() with no arguments at all is still []');
    }
    console.log('✓ Section B: core/GeographicPlaceDirectory.js — deterministic alphabetical ordering, byKey/forRegionId lookups, same name never merges different ground');

    // -------------------------------------------------------------
    // Section C: application/WorldNavigationSession.js wiring
    // -------------------------------------------------------------
    {
        // Nothing loaded, nothing wired -> graceful empties, never a throw.
        const bareSession = new WorldNavigationSession({ registry: null });
        assert(Array.isArray(bareSession.getGeographicPlaceDirectory()) && bareSession.getGeographicPlaceDirectory().length === 0,
            '33. getGeographicPlaceDirectory() is [] with nothing loaded');
        assert(bareSession.getGeographicPlace('anything') === null, '34. getGeographicPlace() is null with nothing loaded');

        // Two documents loaded, no placeNamingClaimUseCase wired -> still
        // groups by geometry; names stay [] rather than throwing.
        const regionX = region({ id: 'x', worldId: 'world-x', authorIdentityId: 'alice', x: 10, z: 10, radius: 5 });
        const regionY = region({ id: 'y', worldId: 'world-y', authorIdentityId: 'bob', x: 10.1, z: 9.9, radius: 5 });
        const worldX = new World({ id: 'world-x' });
        worldX.addWorldRegion(regionX);
        const worldY = new World({ id: 'world-y' });
        worldY.addWorldRegion(regionY);

        const noClaimsSession = new WorldNavigationSession({ registry: null });
        noClaimsSession._loadedDocuments.set('world-x', { world: worldX });
        noClaimsSession._loadedDocuments.set('world-y', { world: worldY });

        const directory = noClaimsSession.getGeographicPlaceDirectory();
        assert(directory.length === 1 && directory[0].regions.length === 2, '35. regions across two loaded Worlds still group into one directory entry with no claims backend wired');
        assert(directory[0].names.length === 0, '36. names stays [] with no claims backend wired, never a throw');
        assert(directory[0].displayName === regionX.name, '37. with no claims at all, displayName falls back to the representative region\'s own name');

        const place = noClaimsSession.getGeographicPlace(directory[0].fingerprintKey);
        assert(place && place.fingerprintKey === directory[0].fingerprintKey, '38. getGeographicPlace() finds the same entry the directory itself listed');
        assert(noClaimsSession.getGeographicPlace('not-a-real-key') === null, '39. getGeographicPlace() is null for an unknown key, never a partial or thrown result');
    }
    console.log('✓ Section C: application/WorldNavigationSession.js — graceful degradation, correct delegation once regions are loaded');

    // -------------------------------------------------------------
    // Section D: regression — nothing here mutates World content
    // -------------------------------------------------------------
    {
        const solo = region({ id: 'solo-d', worldId: 'solo-world', authorIdentityId: 'alice', name: 'Quiet Hamlet', x: 0, z: 0, radius: 20 });
        const before = solo.toJSON();
        buildGeographicPlaceDirectory([solo], []);
        buildGeographicPlaceView(resolveGeographicPlaces([solo], [])[0]);
        const after = solo.toJSON();
        assert(JSON.stringify(before) === JSON.stringify(after), '40. a WorldRegion is byte-identical before and after every directory/view operation this milestone adds');
    }
    console.log('✓ Section D: regression — no directory or view operation ever mutates a WorldRegion');

    // -------------------------------------------------------------
    // Section E: CAPSTONE — the flagship scenario
    // -------------------------------------------------------------
    console.log('\n--- Geographic Place Directory & Identity UX: flagship scenario ---');

    // Phase A — Alice, Bob, and Carol each independently create a
    // region describing approximately the same ground, in THREE
    // completely separate Worlds.
    const alice = makeIdentity('Alice');
    const aliceId = resolveSigningIdentityId(alice);
    const bob = makeIdentity('Bob');
    const bobId = resolveSigningIdentityId(bob);
    const carol = makeIdentity('Carol');
    const carolId = resolveSigningIdentityId(carol);

    const regionA = region({ id: 'region-a', worldId: 'alice-world', authorIdentityId: aliceId, x: 100, z: 200, radius: 50 });
    const aliceWorld = new World({ id: 'alice-world' });
    aliceWorld.addWorldRegion(regionA);

    const regionB = region({ id: 'region-b', worldId: 'bob-world', authorIdentityId: bobId, x: 100.3, z: 199.7, radius: 50 });
    const bobWorld = new World({ id: 'bob-world' });
    bobWorld.addWorldRegion(regionB);

    const regionC = region({ id: 'region-c', worldId: 'carol-world', authorIdentityId: carolId, x: 99.8, z: 200.2, radius: 50 });
    const carolWorld = new World({ id: 'carol-world' });
    carolWorld.addWorldRegion(regionC);

    console.log('✓ Phase A: Alice, Bob, and Carol each independently described approximately the same ground, in three separate Worlds');

    // Phase B — Alice ALSO names a completely unrelated area "Kawahara
    // Town" — same name family, deliberately, to prove name similarity
    // alone never merges places.
    const regionTown = region({
        id: 'region-town', worldId: 'alice-world', authorIdentityId: aliceId,
        name: 'Kawahara Town', kind: RegionKind.TOWN, x: -8000, z: -8000, radius: 80
    });
    aliceWorld.addWorldRegion(regionTown);
    console.log('✓ Phase B: Alice separately named an unrelated area "Kawahara Town" — same name family, different ground');

    // All three replicas already have every World document loaded — see
    // tests/PlaceIdentity.test.js's own Section G header on why this
    // milestone, like 0.5.4 before it, is scoped to "regions ALREADY
    // AVAILABLE to one client."
    const worlds = [{ world: aliceWorld }, { world: bobWorld }, { world: carolWorld }];
    const aliceReplica = makeReplica(alice, worlds);
    const bobReplica = makeReplica(bob, worlds);
    const carolReplica = makeReplica(carol, worlds);

    // Phase C — Alice publishes "Kawahara" for her own region; Bob and
    // Carol both independently publish "Kawahara Village" for theirs —
    // a real majority, not a tie, so the combined ranking has one
    // unambiguous top name.
    aliceReplica.session.publishPlaceNamingClaim('region-a', 'Kawahara');
    bobReplica.session.publishPlaceNamingClaim('region-b', 'Kawahara Village');
    carolReplica.session.publishPlaceNamingClaim('region-c', 'Kawahara Village');
    console.log('✓ Phase C: Alice published "Kawahara"; Bob and Carol both independently published "Kawahara Village"');

    // Phase D — every claim is exchanged to every other replica, the
    // exact transport tests/PlaceNamingExchange.test.js already proves
    // end to end; this suite only needs the RESULT of exchange having
    // happened, not to re-prove the transport itself.
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
    console.log('✓ Phase D: every claim exchanged so all three replicas now know about all three regions and all three names');

    // Phase E — every replica's own directory converges on the SAME
    // result: one combined place for the Kawahara group, "Kawahara
    // Town" staying its own separate entry.
    for (const [label, replica] of [['Alice', aliceReplica], ['Bob', bobReplica], ['Carol', carolReplica]]) {
        const directory = replica.session.getGeographicPlaceDirectory();
        assert(directory.length === 2, `41. [${label}] the directory shows exactly two places: the combined Kawahara group, and "Kawahara Town" — never fewer, never more`);

        const kawahara = directory.find((p) => p.displayName === 'Kawahara Village');
        assert(kawahara, `42. [${label}] the combined group's top name is "Kawahara Village" (2 authors) over "Kawahara" (1 author)`);
        assert(kawahara.regions.length === 3, `43. [${label}] all three independently-authored regions (Alice, Bob, Carol) landed in the SAME group`);
        assert(kawahara.worldCount === 3, `44. [${label}] the group spans all three separate Worlds`);
        assert(kawahara.authorCount === 3, `45. [${label}] authorCount is exactly 3 — alice, bob, and carol, deduplicated across region authorship AND naming claims`);
        assert(kawahara.names.length === 2 && kawahara.names[0].name === 'Kawahara Village' && kawahara.names[0].score === 2,
            `46. [${label}] the combined ranking has "Kawahara Village" first at score 2`);

        const town = directory.find((p) => p.displayName === 'Kawahara Town');
        assert(town && town.regions.length === 1, `47. [${label}] "Kawahara Town" stays its own separate, single-region place — same name family, never merged`);

        // getGeographicPlace() by key round-trips the exact same entry.
        const byKey = replica.session.getGeographicPlace(kawahara.fingerprintKey);
        assert(byKey && byKey.regions.length === 3, `48. [${label}] getGeographicPlace() re-fetches the same combined group by its own fingerprint key`);
    }
    console.log('✓ Phase E: all three replicas independently converge on the identical directory — one combined Kawahara place, one separate Kawahara Town');

    // Phase F — the load-bearing restraint, proven at the very end:
    // none of the four regions were ever renamed, merged, or mutated by
    // any of this.
    assert(regionA.name === 'Unnamed Region' && regionB.name === 'Unnamed Region' && regionC.name === 'Unnamed Region' && regionTown.name === 'Kawahara Town',
        '49. every WorldRegion\'s own name is EXACTLY what it was created with — no directory, view, or ranking operation ever rewrote one');
    console.log('✓ Phase F: all four WorldRegions stayed exactly as their own authors created them');

    console.log('\nAll Geographic Place Directory & Identity UX tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
