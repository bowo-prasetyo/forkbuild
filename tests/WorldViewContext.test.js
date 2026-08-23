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
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';

// 0.2.27 — World View Context & Selection Model.
//
// Prior to this milestone, `_focusedDocumentId` served two genuinely
// different jobs at once: "where the camera is looking" and "which
// document receives mutations." This file proves the two are now
// independently tracked (WorldNavigationSession.getFocusedDocumentId()
// vs. getActiveDocumentId()), that navigation never implies editing
// and editing never depends on camera position, and that the exact
// bug class this split closes — a mutation resolving against the
// wrong document because focus and the real editing target had
// silently diverged — cannot happen through the public API.

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

// Same stateful stub used in tests/WorldNavigationUX.test.js — a
// no-op setCameraState() can never prove "the camera did not move."
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

    function buildSession(avatarPosition = null) {
        const avatarPresenceSession = avatarPosition
            ? new AvatarPresenceSession({ avatarId: 'alice-avatar', ownerIdentity: 'alice' }, { position: avatarPosition })
            : null;
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase,
            avatarPresenceSession
        });
        session._session = statefulStubRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        return session;
    }

    // Two publications, explicitly placed at the EXACT SAME position —
    // the scenario the design doc opens with.
    const sharedPosition = new Position(10, 0, 20);
    const publicationAlice = publisher.publish(makeDocument("Alice's Castle", 'alice'), alice);
    placePublicationUseCase.execute(publicationAlice.id, sharedPosition);
    const publicationBob = publisher.publish(makeDocument("Bob's Castle", 'bob'), alice);
    placePublicationUseCase.execute(publicationBob.id, sharedPosition);

    // -------------------------------------------------------------
    // 1-2. focusDocument's default behavior: camera AND active move
    //      together — this is the backward-compatible common case
    //      every pre-0.2.27 caller (search Focus, Nearby Worlds,
    //      Documents Here) already relies on.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.focusDocument(publicationAlice.documentId);
        assert(session.getFocusedDocumentId() === publicationAlice.documentId,
            '1. focusDocument moves the camera focus to the given document');
        assert(session.getActiveDocumentId() === publicationAlice.documentId,
            '2. focusDocument ALSO makes it the active document by default');
    }

    // -------------------------------------------------------------
    // 3-6. THE flagship scenario: two documents sharing a coordinate.
    //      Focusing Bob right after Alice switches the active document
    //      without the camera moving at all, because Bob's placement
    //      is at the exact same position Alice's is.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.focusDocument(publicationAlice.documentId);
        const cameraAfterAlice = session._session.getCameraState();

        session.focusDocument(publicationBob.documentId);
        const cameraAfterBob = session._session.getCameraState();

        assert(session.getActiveDocumentId() === publicationBob.documentId,
            '3. focusing Bob switches the active document to Bob');
        assert(session.getFocusedDocumentId() === publicationBob.documentId,
            '4. and the camera focus too — both track Bob now');
        assert(cameraAfterAlice.position.x === cameraAfterBob.position.x
            && cameraAfterAlice.position.y === cameraAfterBob.position.y
            && cameraAfterAlice.position.z === cameraAfterBob.position.z,
            '5. the camera itself never actually moved — Alice and Bob share a coordinate');
        assert(session.isDocumentPublished(publicationAlice.documentId)
            && session.isDocumentPublished(publicationBob.documentId),
            '6. both remain published snapshots — focusing neither one edited or forked anything');
    }

    // -------------------------------------------------------------
    // 7-9. setActiveDocument: the missing half — active document
    //      changes WITHOUT moving the camera.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.focusDocument(publicationAlice.documentId);
        const cameraBefore = session._session.getCameraState();

        session.setActiveDocument(publicationBob.documentId);
        const cameraAfter = session._session.getCameraState();

        assert(session.getActiveDocumentId() === publicationBob.documentId,
            '7. setActiveDocument changes the active document');
        assert(session.getFocusedDocumentId() === publicationAlice.documentId,
            '8. camera focus is completely untouched — still Alice');
        assert(cameraBefore.position.x === cameraAfter.position.x
            && cameraBefore.position.z === cameraAfter.position.z,
            '9. and the camera itself never moved (setActiveDocument is not navigation)');
    }

    // -------------------------------------------------------------
    // 10-11. focusDocument({ setActive: false }): pure camera move,
    //        active document explicitly preserved.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.setActiveDocument(publicationAlice.documentId);
        session.focusDocument(publicationBob.documentId, { setActive: false });

        assert(session.getFocusedDocumentId() === publicationBob.documentId,
            '10. the camera moved to Bob');
        assert(session.getActiveDocumentId() === publicationAlice.documentId,
            '11. but the active document is still Alice — navigation never implied editing');
    }

    // -------------------------------------------------------------
    // 12-15. Selecting a brick in a DIFFERENT loaded document makes
    //        THAT document active — camera stays put — and the very
    //        next mutation correctly lands there, leaving the
    //        previously-active document completely untouched. This is
    //        the regression test for the cross-document corruption bug
    //        0.2.27 fixed: mutations used to independently fork
    //        whatever _focusedDocumentId happened to be, regardless of
    //        which document the selection actually belonged to. 0.5.9
    //        retired WorldNavigationSession's own group capability
    //        (createGroupFromSelection) — createLandmarkHere() proves
    //        the exact same point: it targets _activeDocumentId, never
    //        the selection directly, so the fork still follows Bob
    //        (the document the brick SELECTION made active), never
    //        Alice.
    // -------------------------------------------------------------
    {
        const session = buildSession(new Position(0, 0, 0));
        session._loadWorld(publicationAlice.documentId);
        session._loadWorld(publicationBob.documentId);
        session.setActiveDocument(publicationAlice.documentId);

        const bobDoc = session.getDocument(publicationBob.documentId);
        const bobBuilding = bobDoc.world.getBuildings()[0];
        const bobBrickId = bobBuilding.getBricks()[0].id;
        session._setSpatialSelection(SpatialSelectionState.bricks({
            documentId: publicationBob.documentId,
            items: [{ type: 'brick', buildingId: bobBuilding.id, brickId: bobBrickId }]
        }));

        assert(session.getActiveDocumentId() === publicationBob.documentId,
            '12. selecting a brick in Bob\'s document makes Bob the active document automatically');
        assert(session.getFocusedDocumentId() === publicationAlice.documentId,
            '13. camera focus is untouched by the selection — still Alice, from setActiveDocument above, which never moves the camera');

        const landmarkId = session.createLandmarkHere('Bob Landmark', '');
        assert(typeof landmarkId === 'string' && landmarkId.length > 0, '14. the landmark was created');

        // The mutation must have forked BOB (the selection's document,
        // now also the ACTIVE document per assertion 12 —
        // createLandmarkHere() targets _activeDocumentId, never the
        // selection directly, so this still proves the exact
        // regression 0.2.27 fixed), and Alice must be completely
        // untouched: still published, no landmark ever added to her
        // world.
        const forkedBobId = session.getActiveDocumentId();
        assert(forkedBobId !== publicationBob.documentId,
            '15a. Bob was forked (he was still a published snapshot) — the mutation correctly landed on the active document');
        assert(session.isDocumentPublished(publicationAlice.documentId),
            '15b. Alice was never forked — she was never the mutation target, despite having been "active" moments earlier');
        const aliceDoc = session.getDocument(publicationAlice.documentId);
        assert(aliceDoc.world.getWorldLandmarks().length === 0,
            '15c. the landmark landed on Bob\'s fork, never on Alice\'s document');
    }

    // -------------------------------------------------------------
    // 16-17. setActiveDocument clears a selection that belongs to a
    //        DIFFERENT document — carrying it forward would silently
    //        let the next mutation target the WRONG document again.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session._loadWorld(publicationAlice.documentId);
        session._loadWorld(publicationBob.documentId);

        const aliceDoc = session.getDocument(publicationAlice.documentId);
        const aliceBuilding = aliceDoc.world.getBuildings()[0];
        session._setSpatialSelection(SpatialSelectionState.bricks({
            documentId: publicationAlice.documentId,
            items: [{ type: 'brick', buildingId: aliceBuilding.id, brickId: aliceBuilding.getBricks()[0].id }]
        }));
        assert(!session.getSpatialSelection().isEmpty, '16. precondition: a brick in Alice is selected');

        session.setActiveDocument(publicationBob.documentId);
        assert(session.getSpatialSelection().isEmpty,
            '17. switching active to Bob clears the stale selection into Alice\'s document');
    }

    // -------------------------------------------------------------
    // 18. Before anything is ever loaded, both getters report null,
    //     not a stale or guessed value.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        assert(session.getFocusedDocumentId() === null && session.getActiveDocumentId() === null,
            '18. a fresh session has no camera focus and no active document');
    }

    console.log('✅ All World View Context & Selection Model tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
