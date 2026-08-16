import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { EventBus } from '../core/events/EventBus.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';

// Hardening, post-0.2.22 — a fork's bricks kept updating correctly in the DOMAIN MODEL
// after a mutation, but the RENDERED MESH froze at wherever it was
// placed the instant the fork was created — every mutation after that
// point updated data nobody could see. tests/ForkOnEdit.test.js and
// tests/ForkTransition.test.js both use a duck-typed stub renderer
// (`session._session = { addWorld() {}, ... }`), which is exactly
// right for testing session/document logic but structurally CANNOT
// catch this class of bug — it has no mesh to check the position of,
// and no event subscription to fail to wire. This file uses the REAL
// WorldRenderer (backed by a minimal fake low-level renderer — just
// add()/remove() — real Three.js meshes, no WebGL/browser needed) so
// a mesh's actual position can be asserted, the same way the deployed
// app's viewport would show it.

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
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    // Builds a session wired to a REAL WorldRenderer, the same way
    // RenderWorldViewUseCase.execute() wires one in the live app —
    // minus the actual Three.js Renderer/WebGL context, which
    // WorldRenderer never touches directly (it only ever calls
    // add()/remove() on whatever "low-level renderer" it's given).
    function buildRealRenderSession() {
        const sessionEventBus = new EventBus();
        const meshes = new Set();
        const fakeLowLevelRenderer = { add: (m) => meshes.add(m), remove: (m) => meshes.delete(m) };
        const worldRenderer = new WorldRenderer(fakeLowLevelRenderer, registry);
        worldRenderer.subscribe(sessionEventBus);

        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
        });
        // Mirrors exactly what WorldNavigationSession.start() wires up
        // (this._eventBus, then RenderWorldViewUseCase(..., eventBus,
        // ...) which subscribes WorldRenderer to that SAME bus) —
        // without needing a real <canvas>/WebGL context to call start().
        session._eventBus = sessionEventBus;
        session._session = {
            addWorld: (world, documentId, pos) => worldRenderer.addWorld(world, documentId, pos),
            removeWorld: (world, documentId) => worldRenderer.removeWorld(world, documentId),
            dispose() {}, clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
            showPreview() {}, hidePreview() {}, showGizmo() {}, hideGizmo() {},
            gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
            gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
            gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
            gizmoKeyDown() { return false; },
            pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
            setControlsEnabled() {},
            getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
            setCameraState() {}
        };
        return { session, worldRenderer };
    }

    function selectFirstBrick(session, documentId) {
        const building = session.getDocument(documentId).world.getBuildings()[0];
        const brickId = building.getBricks()[0].id;
        session._setSpatialSelection(SpatialSelectionState.brick({ documentId, buildingId: building.id, brickId }));
        return brickId;
    }

    function meshPositionFor(worldRenderer, brickId) {
        const mesh = worldRenderer.meshRegistry.getMesh(brickId);
        return mesh ? { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z } : null;
    }

    // -------------------------------------------------------------
    // 1-4. The core regression: a fork's mesh must keep following the
    //      domain model after the mutation that created it, not just
    //      render correctly ONCE at fork time.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('A Brick'), alice);
        const { session, worldRenderer } = buildRealRenderSession();
        session._loadWorld(publication.documentId);

        const layoutPos = worldLayoutProvider.getPosition(publication.documentId);
        const sourceBrickId = selectFirstBrick(session, publication.documentId);
        const beforePos = meshPositionFor(worldRenderer, sourceBrickId);
        assert(beforePos.x === layoutPos.x && beforePos.z === layoutPos.z,
            '1. before any edit, the mesh sits at the world layout offset (sanity check on the harness itself)');

        session.moveSelection({ x: 3, y: 0, z: 0 });
        const forkId = session.getActiveDocumentId();
        const forkBrickId = session.getDocument(forkId).world.getBuildings()[0].getBricks()[0].id;

        const afterFirstMove = meshPositionFor(worldRenderer, forkBrickId);
        assert(afterFirstMove !== null, '2. the fork\'s brick has a mesh at all');
        assert(afterFirstMove.x === layoutPos.x + 3,
            `3. THE REGRESSION: the mesh reflects the move that triggered the fork (expected x=${layoutPos.x + 3}, got x=${afterFirstMove.x}) — `
            + 'a fork whose World has no wired eventBus renders correctly ONCE, then freezes forever, no matter how many further edits are applied');

        // A second move on the SAME fork must ALSO be visible — this
        // catches "only the move that created the fork happened to
        // work by coincidence" rather than genuine live wiring.
        session.moveSelection({ x: 0, y: 0, z: 5 });
        const afterSecondMove = meshPositionFor(worldRenderer, forkBrickId);
        assert(afterSecondMove.x === layoutPos.x + 3 && afterSecondMove.z === layoutPos.z + 5,
            '4. a SECOND mutation on the already-forked document is also visible — the fork stays live, not just its first frame');
    }

    // -------------------------------------------------------------
    // 5-6. Brick ADD/REMOVE on a fork must also render — BRICK_ADDED/
    //      BRICK_REMOVED depend on the exact same eventBus wiring as
    //      BRICK_UPDATED (WorldRenderer subscribes to all three with
    //      one call), so a fresh fork (before any move at all) that
    //      gets a brick placed or deleted on it must show that too.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Add Remove'), alice);
        const { session, worldRenderer } = buildRealRenderSession();
        session._loadWorld(publication.documentId);
        const sourceBrickId = selectFirstBrick(session, publication.documentId);

        session.deleteSelection();
        const forkId = session.getActiveDocumentId();
        assert(worldRenderer.meshRegistry.getMesh(sourceBrickId) === null,
            '5. the deleted brick\'s mesh is gone (delete is itself the fork-triggering mutation here)');
        assert(session.getDocument(forkId).world.getBuildings()[0].getBricks().length === 0,
            '5b. the fork\'s domain model is correctly empty');

        session.pasteClipboard(); // no-op without a prior copy, but exercises the path without throwing
        assert(session.getLoadedDocuments().length === 1, '6. still exactly one loaded document after further interaction');
    }

    console.log('✅ All Fork Render Sync tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
