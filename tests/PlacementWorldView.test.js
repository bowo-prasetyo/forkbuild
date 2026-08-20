import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
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
import { DocumentManager } from '../application/DocumentManager.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.2.23 — World Placement & Spatial Positioning.
//
// The domain model itself (PlacementRecord, WorldPlacement,
// LocalPlacementRegistry: revisions, signing, causal history) already
// existed and is thoroughly covered by tests/PlacementRegistry.test.js
// and tests/WorldPlacement.test.js — this file does not repeat that
// coverage. What was missing, and what this file tests, is that the
// existing machinery is actually WIRED to World View and used
// correctly:
//   - LocalWorldLayoutProvider resolved (documentId, not publicationId)
//     against a store keyed by publicationId, so an explicit placement
//     could never be found — always silently falling through to the
//     grid fallback (fixed).
//   - Nothing ever called PlacePublicationUseCase — every publication
//     had NO explicit placement (fixed: PublishDocumentUseCase now
//     creates one).
//   - WorldNavigationSession had no way to read or move a placement at
//     all (fixed: getPlacementInfo/movePlacement).
// And, above all, the central architectural claim of the milestone:
// moving a placement is not editing a document, is not forking one,
// and does not require either.

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

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        // expected
    }
}

function stubRenderer(extra = {}) {
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
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {},
        ...extra
    };
}

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
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
    const initialPlacementStrategy = new GridPlacementStrategy();
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, initialPlacementStrategy);
    const documentCloneService = new DocumentCloneService();

    function buildSession(identityProvider = alice) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase
        });
        session._session = stubRenderer();
        return session;
    }

    // -------------------------------------------------------------
    // 1-4. Publishing creates an explicit initial placement, and
    //      WorldLayoutProvider actually finds it (the documentId/
    //      publicationId bug, fixed).
    // -------------------------------------------------------------
    let flagshipPublication;
    {
        const manager = new DocumentManager(makeDocument('Alice Castle'));
        const publication = publishDocumentUseCase.execute(manager);
        flagshipPublication = publication;

        const records = placementRegistry.findByPublicationId(publication.id);
        assert(records.length === 1, '1. publishing created exactly one placement');
        assert(records[0].revision === 1, '2. the initial placement is revision 1');
        assert(records[0].owner === 'alice', '2b. the initial placement is owned by the publisher');

        const resolved = worldLayoutProvider.getPosition(publication.documentId);
        assert(resolved.x === records[0].position.x && resolved.z === records[0].position.z,
            '3. WorldLayoutProvider.getPosition resolves the SAME position the placement record holds — '
            + 'previously this always fell through to the grid fallback because it queried the spatial '
            + 'index with a documentId against a field keyed by publicationId');

        const visible = worldLayoutProvider.findVisibleDocuments(
            { x: resolved.x, y: 0, z: resolved.z }, 5
        );
        assert(visible.includes(publication.documentId),
            '4. findVisibleDocuments finds the explicitly placed world (same id-mismatch bug, fixed)');
    }

    // -------------------------------------------------------------
    // 5-6. getPlacementInfo / movePlacement, end to end.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session._loadWorld(flagshipPublication.documentId);

        const before = session.getPlacementInfo(flagshipPublication.documentId);
        assert(before && before.revision === 1, '5. getPlacementInfo reflects the initial placement');
        assert(before.movable === true, '5b. the owner (alice) can move her own placement');

        // movePlacement returns the updated WorldPlacement (the spatial
        // index's own lightweight record — see core/WorldPlacement.js);
        // revision lives on the richer PlacementRecord, read back via
        // getPlacementInfo below.
        const moved = session.movePlacement(flagshipPublication.documentId, { x: 500, y: 0, z: 300 });
        assert(moved.position.x === 500, '6. movePlacement updates the position');

        const after = session.getPlacementInfo(flagshipPublication.documentId);
        assert(after.revision === 2, '6a. and the placement record advanced to revision 2');
        assert(after.revision === 2 && after.position.x === 500,
            '6b. getPlacementInfo reflects the move immediately');

        const history = placementRegistry.getHistory(after.placementId);
        assert(history.length === 2, '6c. both revisions remain in history — the first is never erased');
    }

    // -------------------------------------------------------------
    // 7-10. The central claim: MOVE PLACEMENT != EDIT DOCUMENT !=
    //       CREATE FORK. Moving a placement never touches the
    //       document/publication, never forks anything, and works on
    //       a still-published, un-forked world exactly as well as
    //       editing a brick does NOT.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session._loadWorld(flagshipPublication.documentId);

        session.movePlacement(flagshipPublication.documentId, { x: 10, y: 0, z: 10 });

        assert(session.isDocumentPublished(flagshipPublication.documentId),
            '7. after moving its placement, the document is STILL published/unforked');
        assert(session.getActiveDocumentId() === flagshipPublication.documentId,
            '7b. the active document is unchanged — moving a placement never switches documents');
        assert(session.getLoadedDocuments().length === 1, '7c. no fork was created');

        const reloadedDoc = loadPublicationDocumentUseCase.execute(flagshipPublication.documentId);
        assert(reloadedDoc.world.getBuildings()[0].getBricks().length === 1
            && reloadedDoc.metadata.title === 'Alice Castle',
            '8. the published document\'s own content is completely untouched by moving its placement');

        // Contrast: editing a BRICK on the same document DOES fork —
        // the two operations are not interchangeable.
        const building = session.getDocument(flagshipPublication.documentId).world.getBuildings()[0];
        const brickId = building.getBricks()[0].id;
        session._setSpatialSelection(SpatialSelectionState.brick({
            documentId: flagshipPublication.documentId, buildingId: building.id, brickId
        }));
        session.moveSelection({ x: 1, y: 0, z: 0 });
        assert(!session.isDocumentPublished(flagshipPublication.documentId),
            '9. editing a BRICK forks the document — placement moves and document edits are genuinely different operations');

        const forkId = session.getActiveDocumentId();
        assert(forkId !== flagshipPublication.documentId, '9b. the fork has a new identity');

        // And forking never touches the SOURCE's placement.
        const sourcePlacementStillThere = placementRegistry.findByPublicationId(flagshipPublication.id);
        assert(sourcePlacementStillThere.length === 1 && sourcePlacementStillThere[0].position.x === 10,
            '10. forking the document left the original placement exactly where the earlier move put it');
        console.log('✓ move placement, edit document, and fork are three genuinely distinct operations');
    }

    // -------------------------------------------------------------
    // 11-12. Ownership is a LOCAL UI signal, not a hard gate — Bob can
    //        technically call movePlacement (the decentralized "the
    //        writer doesn't gate itself" posture 0.2.16-0.2.19 already
    //        established), but the info the UI reads says he
    //        shouldn't, and the move he DOES make would carry his own
    //        signature, not Alice's.
    // -------------------------------------------------------------
    {
        const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
        bob.login('bob');
        const publication = publisher.publish(makeDocument('Bob Views This'), alice);
        placePublicationUseCase.execute(publication.id, new Position(1, 0, 1));

        const bobSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: bob,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase
        });
        bobSession._session = stubRenderer();
        bobSession._loadWorld(publication.documentId);

        const info = bobSession.getPlacementInfo(publication.documentId);
        assert(info.owner === 'alice', '11. the placement correctly reports its real owner');
        assert(info.movable === false, '11b. Bob is not the owner — getPlacementInfo says he should not move it');

        const aliceSession = buildSession(alice);
        aliceSession._loadWorld(publication.documentId);
        assert(aliceSession.getPlacementInfo(publication.documentId).movable === true,
            '12. Alice (the real owner) is reported as able to move it');
    }

    // -------------------------------------------------------------
    // 13-14. Graceful degradation: a session with no placement
    //        wiring (most existing tests) simply can't resolve/move a
    //        placement — same "enforce/offer only when the
    //        collaborator is actually wired" rule discoveryProvider
    //        already follows for fork policy.
    // -------------------------------------------------------------
    {
        const bareSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
            // no placementRegistry / moveWorldPlacementUseCase
        });
        bareSession._session = stubRenderer();
        bareSession._loadWorld(flagshipPublication.documentId);

        assert(bareSession.getPlacementInfo(flagshipPublication.documentId) === null,
            '13. no placementRegistry wired -> getPlacementInfo returns null, not a broken shape');
        assertThrows(() => bareSession.movePlacement(flagshipPublication.documentId, { x: 0, y: 0, z: 0 }),
            '14. movePlacement without a MoveWorldPlacementUseCase throws a clear error, not a silent no-op');
    }

    // -------------------------------------------------------------
    // 15. Publishing is unaffected by a placement failure — a
    //     spatial-index hiccup can never turn a successful publish
    //     into a failed one. Placement is best-effort.
    // -------------------------------------------------------------
    {
        const throwingPlacePublicationUseCase = { execute() { throw new Error('spatial index unavailable'); } };
        const resilientPublishUseCase = new PublishDocumentUseCase(
            publisher, alice, throwingPlacePublicationUseCase, initialPlacementStrategy
        );
        const manager = new DocumentManager(makeDocument('Resilient Publish'));
        const publication = resilientPublishUseCase.execute(manager);
        assert(publication && publication.title === 'Resilient Publish',
            '15. publish succeeds even when initial placement creation throws');
    }

    // -------------------------------------------------------------
    // 16. Backward compatibility: PublishDocumentUseCase built the
    //     old way (publisherProvider, identityProvider only, as every
    //     pre-0.2.23 test and both prior milestones' commits do)
    //     still works — no placement is created, but nothing breaks.
    // -------------------------------------------------------------
    {
        const legacyPublishUseCase = new PublishDocumentUseCase(publisher, alice);
        const manager = new DocumentManager(makeDocument('Legacy Construction'));
        const publication = legacyPublishUseCase.execute(manager);
        assert(publication && publication.title === 'Legacy Construction',
            '16. a 2-arg PublishDocumentUseCase still publishes successfully');
        assert(placementRegistry.findByPublicationId(publication.id).length === 0,
            '16b. and, correctly, creates no placement — it was never given the collaborators to do so');
    }

    // -------------------------------------------------------------
    // 17-24. 0.2.87 — World Building Interaction & Placement UX,
    //        WorldView half (the Editor half — PlacementTool,
    //        PreviewState, rotation, collision-tinting — is covered
    //        headlessly in tests/PlacementPreviewUX.test.js, which needs
    //        no 'three'-dependent import at all; WorldNavigationSession
    //        pulls in RenderWorldViewUseCase -> renderer/Renderer.js ->
    //        'three' at module-load time regardless of whether a real
    //        WebGL context is ever created, so this coverage can only
    //        run here, through the browser test runner, exactly like
    //        every other WorldNavigationSession-touching section above).
    //
    // Central claim: the placement preview now RENDERS lifted by the
    // SAME terrain offset renderer/WorldRenderer.js already applies to
    // this document's own committed bricks (sampled ONCE at the
    // document's own placement position, never per hover) — but the
    // committed Brick's own POSITION, read back from World after
    // commitPlacement(), stays exactly as terrain-blind as it always
    // was. Terrain is a rendering-time offset, never a placement fact —
    // see docs/Principles.md, "Terrain Elevation Is A Rendering-Time
    // Offset, Never A Presence Or Placement Fact," now proven to hold
    // for BRAND NEW bricks, not just pre-existing ones.
    // -------------------------------------------------------------
    {
        const terrainDoc = makeDocument('Terrain Placement Test');
        const terrainPublication = publisher.publish(terrainDoc, alice);
        // An arbitrary, deliberately non-trivial world position — the
        // exact (120, -80) tests/WorldGroundTerrain.test.js Section D2
        // already uses for renderer/WorldRenderer.js's own identical
        // "sampled once at the document's own placement" contract.
        placePublicationUseCase.execute(terrainPublication.id, new Position(120, 0, -80));
        const expectedGroundY = terrainHeightAt(DEFAULT_WORLD_SEED, 120, -80);

        const previewCalls = [];
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase
        });
        session._session = stubRenderer({
            showPreview: (definitionId, position, rotation, valid) => {
                previewCalls.push({ definitionId, position, rotation, valid });
            },
            pickGround: () => ({ type: 'ground', position: { x: 122, y: 0, z: -78 } })
        });
        session._loadWorld(terrainPublication.documentId);
        session.setActiveDefinitionId('core:cube');

        session.hover(0, 0); // screen coords are irrelevant — pickGround is stubbed
        assert(previewCalls.length === 1, '17. hovering ground in placement mode calls showPreview exactly once');
        const first = previewCalls[0];
        // (122, -78) world -> (2, 2) local once the document's own (120, -80)
        // placement offset is subtracted — collision-clear (makeDocument's
        // one seed brick sits at local (0, 0.5, 0), not here).
        assert(first.position.x === 122 && first.position.z === -78,
            '18. the ghost\'s world X/Z is the hovered ground position, unchanged');
        assert(Math.abs(first.position.y - (0.5 + expectedGroundY)) < 1e-9,
            '19. FLAGSHIP: the ghost\'s world Y is local-ground (0.5, a core:cube\'s half-height) PLUS the document\'s own terrain offset — sampled at (120, -80), the SAME value renderer/WorldRenderer.js would lift this document\'s real bricks by, never a second independently-computed offset');
        assert(first.rotation === 0 && first.valid === true,
            '20. rotation starts at 0 and the position is valid (collision-clear)');

        // Rotate the pending preview — position/terrain-offset unchanged,
        // only orientation changes, and it happens WITHOUT re-hovering.
        assert(session.rotatePlacementPreview() === true, '21. rotatePlacementPreview() succeeds while a valid position is hovered');
        const afterRotate = previewCalls[previewCalls.length - 1];
        assert(afterRotate.rotation === 90, '22. rotating +90° reaches showPreview immediately, no pointer movement needed');
        assert(afterRotate.position.x === 122 && Math.abs(afterRotate.position.y - (0.5 + expectedGroundY)) < 1e-9,
            '23. rotating never changes the ghost\'s position or its terrain offset');
        session.rotatePlacementPreview(-90);
        assert(previewCalls[previewCalls.length - 1].rotation === 0, '24. rotating -90° returns to the original orientation');

        // Commit: the terrain offset must NEVER reach the actual Brick —
        // it stays purely a rendering-time concern. (terrainDoc was
        // loaded as a published snapshot, so committing — a mutation —
        // forks it first, 0.2.20's own copy-on-write; the fork inherits
        // the SAME world position, per _forkForEdit's own comment, so
        // the terrain offset asserted above still applies identically.)
        session.commitPlacement();
        const editedDocumentId = session.getActiveDocumentId();
        assert(editedDocumentId !== terrainPublication.documentId,
            '24b. committing into a published snapshot forks it first (0.2.20) — the active document id changes');
        const buildingAfter = session.getDocument(editedDocumentId).world.getBuildings()[0];
        const placedBrick = buildingAfter.getBricks().find((b) => b.position.x === 2 && b.position.z === 2);
        assert(placedBrick, '25. the committed brick exists at its LOCAL position (2, _, 2)');
        assert(placedBrick.position.y === 0.5,
            '26. FLAGSHIP: the committed Brick.position.y is exactly 0.5 (local ground) — NOT lifted by the terrain offset the preview rendered with. Terrain is a rendering-time offset, never a placement fact, proven here for a brand-new brick.');
        assert(placedBrick.rotation === 0, '27. the committed rotation matches what the preview last showed after rotating there and back');

        // Hover the OCCUPIED seed brick's own position: blocked, not hidden.
        session._session = stubRenderer({
            showPreview: (definitionId, position, rotation, valid) => {
                previewCalls.push({ definitionId, position, rotation, valid });
            },
            pickGround: () => ({ type: 'ground', position: { x: 120, y: 0, z: -80 } }) // -> local (0, 0.5, 0), the seed brick
        });
        previewCalls.length = 0;
        session.hover(0, 0);
        assert(previewCalls.length === 1 && previewCalls[0].valid === false,
            '28. FLAGSHIP: hovering an OCCUPIED position still calls showPreview (the ghost stays visible, tinted invalid by the renderer) rather than hiding — the user sees WHY, instead of a click silently doing nothing');
        assert(session.getSpatialPlacement().blocked === true,
            '29. SpatialPlacementState.blocked reflects the same PlacementValidator collision rule commitPlacement() itself enforces — reused, never a second collision system');

        const countBefore = buildingAfter.getBricks().length;
        const committed = session.commitPlacement();
        assert(committed === false && buildingAfter.getBricks().length === countBefore,
            '30. clicking a blocked position is refused — commitPlacement() still re-validates independently of the cached preview flag');

        // Leaving placement mode resets the pending rotation for next time.
        session.rotatePlacementPreview();
        session.setActiveDefinitionId(null);
        session.setActiveDefinitionId('core:cube');
        session._session = stubRenderer({
            showPreview: (definitionId, position, rotation, valid) => {
                previewCalls.push({ definitionId, position, rotation, valid });
            },
            pickGround: () => ({ type: 'ground', position: { x: 123, y: 0, z: -77 } })
        });
        previewCalls.length = 0;
        session.hover(0, 0);
        assert(previewCalls[0].rotation === 0,
            '31. cancelling placement mode and re-entering it resets the pending rotation back to 0, exactly matching PlacementTool\'s own deactivate() behavior in the Editor');
    }

    console.log('✅ All World Placement & Spatial Positioning tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
