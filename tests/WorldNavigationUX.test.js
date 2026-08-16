import { Position } from '../core/Position.js';
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
import { SpatialCameraController } from '../application/SpatialCameraController.js';

// 0.2.26 — World Navigation & Spatial Discovery UX.
//
// The domain machinery under test here (discovery, placement,
// streaming) already has thorough coverage elsewhere — this file tests
// only what 0.2.26 actually adds: searching over discovery, listing
// every document at an exact position, and that Focus is genuinely
// navigation (it streams a document in, switches which document is
// active) and genuinely NOT editing (a focused, published document
// stays published; nothing forks).

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

// Unlike every other test file's renderer stub, this one actually
// TRACKS camera state — focusDocument()'s whole point is to move the
// camera and have the next streaming pass react to that, which a
// fire-and-forget no-op setCameraState() can never demonstrate.
function statefulStubRenderer() {
    let cameraState = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        showPreview() {}, hidePreview() {}, showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; },
        gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return cameraState; },
        setCameraState(cs) { cameraState = cs; }
    };
}

async function runTests() {
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

    function buildSession(extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase,
            searchWorldUseCase,
            ...extra
        });
        session._session = statefulStubRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        return session;
    }

    // -------------------------------------------------------------
    // 1-4. SearchWorldUseCase — pure, over discoveryProvider.list().
    // -------------------------------------------------------------
    {
        const pubA = publisher.publish(makeDocument('Alice Castle', 'alice'), alice);
        placePublicationUseCase.execute(pubA.id, new Position(500, 0, -200));
        const pubB = publisher.publish(makeDocument('Bob Tower', 'bob'), alice);
        // Bob's Tower is deliberately left WITHOUT an explicit placement.

        assert(searchWorldUseCase.execute('castle').some((p) => p.title === 'Alice Castle'),
            '1. title substring match is case-normalized and finds the publication');
        assert(searchWorldUseCase.execute('BOB').some((p) => p.title === 'Bob Tower'),
            '2. author substring match works, and is case-insensitive');
        assert(searchWorldUseCase.execute('nonexistent-zzz').length === 0,
            '3. a query matching nothing returns an empty array, not null/undefined');
        assert(searchWorldUseCase.execute('').length === 0 && searchWorldUseCase.execute('   ').length === 0,
            '4. an empty (or whitespace-only) query returns no results rather than the entire catalog');

        // -------------------------------------------------------------
        // 5-8. WorldNavigationSession.searchWorld — enriched results.
        // -------------------------------------------------------------
        const session = buildSession();

        const castleResults = session.searchWorld('castle');
        assert(castleResults.length === 1, '5. searchWorld finds the matching publication');
        const castle = castleResults[0];
        assert(castle.hasPlacement === true && castle.position.x === 500 && castle.position.z === -200,
            '6. a publication with an explicit PlacementRecord reports hasPlacement=true and its real position');

        const towerResults = session.searchWorld('tower');
        assert(towerResults.length === 1, '7. searchWorld also finds the unplaced publication');
        const tower = towerResults[0];
        assert(tower.hasPlacement === false && tower.position !== null,
            '8. an unplaced publication reports hasPlacement=false but STILL resolves a position '
            + '(0.2.24\'s deterministic fallback), so Focus has somewhere to go');

        const bareSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
            // no searchWorldUseCase wired
        });
        assert(Array.isArray(bareSession.searchWorld('castle')) && bareSession.searchWorld('castle').length === 0,
            '8b. no SearchWorldUseCase wired -> searchWorld degrades to [], not a throw');
    }

    // -------------------------------------------------------------
    // 9-12. getDocumentsAtPosition — "who's actually here," no
    //       self-exclusion (unlike checkPlacementOverlap).
    // -------------------------------------------------------------
    const sharedPosition = new Position(700, 0, 700);
    const exhibitionA = publisher.publish(makeDocument('Shared Exhibition A', 'alice'), alice);
    placePublicationUseCase.execute(exhibitionA.id, sharedPosition);
    const exhibitionB = publisher.publish(makeDocument('Shared Exhibition B', 'bob'), alice);
    placePublicationUseCase.execute(exhibitionB.id, sharedPosition);

    {
        const session = buildSession();
        const here = session.getDocumentsAtPosition(sharedPosition);
        assert(here.length === 2, '9. both publications at the exact same position are returned');
        const titles = here.map((d) => d.title).sort();
        assert(titles[0] === 'Shared Exhibition A' && titles[1] === 'Shared Exhibition B',
            '10. each entry resolves to its publication\'s title');
        assert(here.every((d) => !!d.documentId), '10b. each entry carries a documentId a UI can Focus on');

        const elsewhere = session.getDocumentsAtPosition(new Position(-999, 0, -999));
        assert(Array.isArray(elsewhere) && elsewhere.length === 0,
            '11. an unoccupied position returns an empty array');

        const bareSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
            // no placementRegistry wired
        });
        assert(Array.isArray(bareSession.getDocumentsAtPosition(sharedPosition)) && bareSession.getDocumentsAtPosition(sharedPosition).length === 0,
            '12. no placementRegistry wired -> getDocumentsAtPosition degrades to [], not a throw');
    }

    // -------------------------------------------------------------
    // 13-16. Focus is navigation: it streams a distant document in
    //        and makes it the active document, WITHOUT editing or
    //        forking it. Placed deliberately far from (0,0,0), the
    //        stateful stub's starting camera position, so streaming
    //        it in is only possible if focusDocument's camera move
    //        actually took effect.
    // -------------------------------------------------------------
    const distantPosition = new Position(5000, 0, 5000);
    const distantPub = publisher.publish(makeDocument('Distant Lighthouse', 'alice'), alice);
    placePublicationUseCase.execute(distantPub.id, distantPosition);

    {
        const session = buildSession();
        session._loadWorld(exhibitionA.documentId); // arbitrary initial focus, far from distantPub
        session.updateSpatialView();
        assert(!session.getLoadedDocuments().some((d) => d.world.id === distantPub.documentId),
            '13. precondition: the distant document is not loaded before it is focused');

        session.focusDocument(distantPub.documentId);
        assert(session.getLoadedDocuments().some((d) => d.world.id === distantPub.documentId),
            '14. focusDocument streams the distant document in — search -> placement -> focus works end to end');
        assert(session.getActiveDocumentId() === distantPub.documentId,
            '15. the focused document becomes the active document');
        assert(session.isDocumentPublished(distantPub.documentId) && session.getLoadedDocuments().length >= 1,
            '16. the focused document is still published — Focus never forks anything, it only navigates');
    }

    // -------------------------------------------------------------
    // 17-18. Choosing among overlapping documents: getDocumentsAtPosition
    //        found two candidates at the same spot; focusing EACH one
    //        in turn correctly switches the active document.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const candidates = session.getDocumentsAtPosition(sharedPosition);
        assert(candidates.length === 2, '17. precondition: two candidates share this position');

        session.focusDocument(candidates[0].documentId);
        assert(session.getActiveDocumentId() === candidates[0].documentId,
            '18. focusing the first candidate makes it active');

        session.focusDocument(candidates[1].documentId);
        assert(session.getActiveDocumentId() === candidates[1].documentId,
            '18b. focusing the second candidate switches active document to IT, not a lingering first choice');
    }

    console.log('✅ All World Navigation & Spatial Discovery UX tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
