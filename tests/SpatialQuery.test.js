import { Position } from '../core/Position.js';
import { distanceBetween, isWithinRadius } from '../core/SpatialQuery.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { SearchWorldUseCase } from '../application/SearchWorldUseCase.js';

// 0.2.28 — Spatial Query & Location Discovery.
//
// Coordinate + radius search, composable with the 0.2.26 text search
// rather than a second, unrelated mechanism: WorldNavigationSession.
// searchWorld({ text, center, radius }) narrows the same discovery
// catalog by both criteria at once. This file tests only what 0.2.28
// adds — SearchWorldUseCase's "return everything when a spatial
// filter is coming" behavior, the actual distance/radius test and
// sort-by-nearest, the hasPlacement/fallback-position distinction
// carrying over to spatial results, and that every pre-0.2.28 caller
// (a plain string) is unaffected.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeDocument(title, author = 'alice') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

async function runTests() {
    // -------------------------------------------------------------
    // 1-4. core/SpatialQuery.js — pure geometry.
    // -------------------------------------------------------------
    {
        assert(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }) === 5,
            '1. distanceBetween is plain Euclidean distance (3-4-5 triangle)');
        assert(distanceBetween({ x: 10, y: 10, z: 10 }, { x: 10, y: 10, z: 10 }) === 0,
            '2. distance between identical points is zero');
        assert(isWithinRadius({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5) === true,
            '3. exactly AT the radius boundary counts as within it');
        assert(isWithinRadius({ x: 5.01, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5) === false,
            '4. just past the radius boundary does not');
    }

    // -------------------------------------------------------------
    // 5-8. SearchWorldUseCase — deciding whether "no text" means
    //      "nothing" or "everything, let the spatial filter narrow it."
    // -------------------------------------------------------------
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const registry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const saveDocumentUseCase = new SaveDocumentUseCase(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, registry, placementRegistry, alice
    );
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, alice);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();
    const searchWorldUseCase = new SearchWorldUseCase(discoveryProvider);

    // Three publications: two near a shared region, one far away, one
    // deliberately left unplaced (deterministic-fallback position).
    const near = publisher.publish(makeDocument('Near Castle', 'alice'), alice);
    placePublicationUseCase.execute(near.id, new Position(100, 0, 100));
    const alsoNear = publisher.publish(makeDocument('Nearby Tower', 'bob'), alice);
    placePublicationUseCase.execute(alsoNear.id, new Position(110, 0, 105));
    const far = publisher.publish(makeDocument('Far Lighthouse', 'carol'), alice);
    placePublicationUseCase.execute(far.id, new Position(9000, 0, 9000));
    const unplaced = publisher.publish(makeDocument('Unplaced Cabin', 'dave'), alice);
    // No placePublicationUseCase.execute for `unplaced` — resolves only
    // through LocalWorldLayoutProvider's 0.2.24 deterministic fallback.

    {
        assert(searchWorldUseCase.execute('castle').length === 1,
            '5. a plain string argument (0.2.26 behavior) still works unchanged');
        assert(searchWorldUseCase.execute({ text: 'castle' }).length === 1,
            '6. the same query via { text } produces the same result');
        assert(searchWorldUseCase.execute({}).length === 0,
            '7. no text and no spatial filter -> no results (unchanged "blank means nothing")');
        const spatialOnly = searchWorldUseCase.execute({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
        assert(spatialOnly.length === 4,
            '8. no text but a spatial filter present -> the WHOLE catalog, for the caller\'s radius test to narrow');
    }

    function buildSession() {
        return new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase,
            searchWorldUseCase
        });
    }

    // -------------------------------------------------------------
    // 9-14. WorldNavigationSession.searchWorld — the actual spatial
    //       query: filtering, distance, nearest-first sort.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const results = session.searchWorldByLocation({ center: { x: 100, y: 0, z: 100 }, radius: 20 });

        assert(results.length === 2, '9. only the two nearby publications match a radius of 20');
        assert(results.every((r) => r.documentId === near.documentId || r.documentId === alsoNear.documentId),
            '10. the far and unplaced-but-far-fallback publications are excluded');
        assert(results[0].documentId === near.documentId,
            '11. results are sorted nearest-first — Near Castle (distance 0) before Nearby Tower');
        assert(results[0].distance === 0, '12. the publication exactly at the query center has distance 0');
        assert(Math.abs(results[1].distance - distanceBetween({ x: 110, y: 0, z: 105 }, { x: 100, y: 0, z: 100 })) < 1e-9,
            '13. distance is the real Euclidean distance from the requested center');
        assert(results.every((r) => r.hasPlacement === true),
            '14. both matches have explicit, recorded placements');
    }

    // -------------------------------------------------------------
    // 15-16. A publication with NO explicit placement still
    //         participates in a spatial query through its 0.2.24
    //         deterministic fallback position — and is still flagged
    //         hasPlacement:false, so the UI never presents a fallback
    //         as an authored location.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const fallbackPos = worldLayoutProvider.getPosition(unplaced.documentId);
        const results = session.searchWorldByLocation({ center: fallbackPos, radius: 0.01 });
        assert(results.length === 1 && results[0].documentId === unplaced.documentId,
            '15. the unplaced publication is found via its deterministic fallback position');
        assert(results[0].hasPlacement === false,
            '16. and still correctly reports hasPlacement:false — a fallback position is not an authored one');
    }

    // -------------------------------------------------------------
    // 17-18. Combined text + spatial query: both criteria apply.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const combined = session.searchWorld({ text: 'tower', center: { x: 100, y: 0, z: 100 }, radius: 20 });
        assert(combined.length === 1 && combined[0].documentId === alsoNear.documentId,
            '17. "tower" + radius 20 of (100,0,100) finds only Nearby Tower, not Near Castle (text) or Far Lighthouse (radius)');

        const combinedNoMatch = session.searchWorld({ text: 'lighthouse', center: { x: 100, y: 0, z: 100 }, radius: 20 });
        assert(combinedNoMatch.length === 0,
            '18. "lighthouse" matches Far Lighthouse by text, but it\'s outside the radius — combined query finds nothing');
    }

    // -------------------------------------------------------------
    // 19-20. Text-only search never carries a distance (nothing to
    //        measure against), and backward compatibility: a plain
    //        string still works exactly as it did in 0.2.26.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const textOnly = session.searchWorld('castle');
        assert(textOnly.length === 1 && textOnly[0].distance === null,
            '19. a text-only search never computes a distance');

        const viaOptions = session.searchWorld({ text: 'castle' });
        assert(viaOptions.length === 1 && viaOptions[0].documentId === textOnly[0].documentId,
            '20. { text: "castle" } and "castle" produce the same result');
    }

    // -------------------------------------------------------------
    // 21. Graceful degradation: no searchWorldUseCase wired.
    // -------------------------------------------------------------
    {
        const bareSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
            // no searchWorldUseCase
        });
        assert(bareSession.searchWorldByLocation({ center: { x: 0, y: 0, z: 0 }, radius: 100 }).length === 0,
            '21. no SearchWorldUseCase wired -> searchWorldByLocation degrades to [], not a throw');
    }

    console.log('✅ All Spatial Query & Location Discovery tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
