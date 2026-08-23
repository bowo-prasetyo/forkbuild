import * as THREE from 'three';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SpatialInspectionService } from '../application/SpatialInspectionService.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PlacementMeshRegistry } from '../renderer/PlacementMeshRegistry.js';
import { SpatialSelectionRenderer } from '../renderer/SpatialSelectionRenderer.js';
import { TransformMath } from '../application/TransformMath.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.2.93 — World View Instance Inspection.
//
// The design conversation's central claim: World View exploring a
// placed structure is SELECTION for INSPECTION, never selection for
// EDITING. This file proves that boundary at every layer it touches:
//
//   Section A: application/spatial-state/SpatialSelectionState.js — the
//              new `placement` selection kind, and why its ALWAYS-EMPTY
//              `items` array is what keeps the transform gizmo and
//              every SpatialEditingService mutation a no-op for it with
//              no special-casing anywhere in that pipeline.
//   Section B: renderer/SpatialSelectionRenderer.js — a placement
//              highlights as ONE whole instance, mutually exclusive
//              with a brick highlight.
//   Section C: application/SpatialInspectionService.js#_inspectPlacement()
//              — resolves a placement selection into the exact plain
//              data the inspection panel needs, including the
//              CONTAINING-document-offset groundY convention
//              renderer/WorldRenderer.js's own render path uses.
//   Section D: application/WorldNavigationSession.js#pick() — routes a
//              placement hit through the read-only inspection path,
//              never the brick/ground editing one; 0.5.9 went further
//              still and retired moveSelection/rotateSelection/
//              deleteSelection from this class entirely — they are not
//              merely no-ops for a placement selection, they do not
//              exist on WorldNavigationSession at all.
//   Section E: FLAGSHIP — Editor creates House, places House inside a
//              World, saves both; World View loads the World, picks the
//              House; inspection reflects the exact placementId/
//              sourceDocumentId/position/rotation/groundY; editing the
//              House's source Document and re-saving it changes what
//              the SAME placement resolves/renders, proving it is a
//              live reference, never a frozen copy; and picking never
//              touches the World document, the placement, or command
//              history — selection in World View is purely local UI
//              state.

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

function buildOneBrickWorld(position = new Position(0, 0.5, 0)) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return world;
}

// Mirrors tests/PlacementWorldView.test.js's own stubRenderer(): the
// same "construct the session for real, then hand it a stub render
// facade instead of calling start()" technique every WorldNavigationSession
// test in this suite already uses, so nothing here needs a real DOM
// canvas or WebGL context.
function stubRenderer(extra = {}) {
    const calls = { selectPlacement: [], clearSelection: 0, clearHover: 0, selectBricks: [] };
    const facade = {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() { calls.clearSelection++; },
        clearHover() { calls.clearHover++; },
        selectBricks(brickIds, primaryBrickId) { calls.selectBricks.push({ brickIds, primaryBrickId }); },
        hoverBrick() {},
        selectPlacement(placementId) { calls.selectPlacement.push(placementId); },
        showPreview() {}, hidePreview() {}, showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; },
        gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {},
        ...extra
    };
    facade.calls = calls;
    return facade;
}

async function run() {
    // -------------------------------------------------------------
    // Section A: SpatialSelectionState.placement()
    // -------------------------------------------------------------
    {
        const empty = SpatialSelectionState.empty();
        assert(empty.isStructurePlacementSelection === false, '1. an empty selection is never a placement selection');

        const sel = SpatialSelectionState.placement({ documentId: 'world-doc', placementId: 'placement-1' });
        assert(sel.isEmpty === false, '2. a placement selection is not empty');
        assert(sel.type === 'placement', '3. its type reads "placement"');
        assert(sel.isStructurePlacementSelection === true, '4. isStructurePlacementSelection is true');
        assert(sel.placementId === 'placement-1', '5. placementId is exposed');
        assert(sel.documentId === 'world-doc', '6. documentId is the HOST document, not the placement\'s own referenced one');

        // The load-bearing property: an ALWAYS-EMPTY items array, which
        // is what makes the existing brick-shaped editing/gizmo
        // pipeline a no-op for this selection kind with zero
        // special-casing (see Section D below).
        assert(Array.isArray(sel.items) && sel.items.length === 0,
            '7. a placement selection carries no brick items — the empty-items trick that keeps it un-editable by construction');
        assert(sel.brickIds.length === 0, '8. brickIds is empty too');

        const brickSel = SpatialSelectionState.brick({ documentId: 'd', buildingId: 'b', brickId: 'k' });
        assert(brickSel.isStructurePlacementSelection === false, '9. an ordinary brick selection is never mistaken for a placement one');
    }

    // -------------------------------------------------------------
    // Section B: renderer/SpatialSelectionRenderer.js — placement highlight
    // -------------------------------------------------------------
    {
        const placementMeshRegistry = new PlacementMeshRegistry();

        const instanceMesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf7d }));
        const instanceMesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf7d }));
        placementMeshRegistry.set('placement-a', [instanceMesh1, instanceMesh2]);

        const brickMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf7d }));
        const meshRegistry = { getMesh: (id) => (id === 'brick-1' ? brickMesh : null) };

        // No placementMeshRegistry at all: selectPlacement() is a safe no-op.
        const bareRenderer = new SpatialSelectionRenderer(meshRegistry);
        bareRenderer.selectPlacement('placement-a');
        assert(instanceMesh1.material.emissive.getHex() === 0, '10. selectPlacement() without a placementMeshRegistry never throws and never highlights');

        const renderer = new SpatialSelectionRenderer(meshRegistry, placementMeshRegistry);
        renderer.selectPlacement('placement-a');
        assert(instanceMesh1.material.emissive.getHex() !== 0, '11. selectPlacement() highlights every mesh of the instance');
        assert(instanceMesh2.material.emissive.getHex() !== 0, '12. ...both meshes, not just the first');
        assert(brickMesh.material.emissive.getHex() === 0, '13. an ordinary brick is untouched by a placement highlight');

        renderer.select('brick-1');
        assert(brickMesh.material.emissive.getHex() !== 0, '14. selecting a brick afterward highlights it');
        assert(instanceMesh1.material.emissive.getHex() === 0, '15. ...and un-highlights the placement\'s meshes — the two tracks are mutually exclusive');

        renderer.selectPlacement('placement-a');
        assert(instanceMesh1.material.emissive.getHex() !== 0, '16. selecting the placement again re-highlights it');
        assert(brickMesh.material.emissive.getHex() === 0, '17. ...and un-highlights the brick');

        renderer.clearSelection();
        assert(instanceMesh1.material.emissive.getHex() === 0, '18. clearSelection() un-highlights the placement too, not just bricks');

        renderer.selectPlacement('placement-a');
        renderer.clear();
        assert(instanceMesh1.material.emissive.getHex() === 0, '19. clear() (dispose path) un-highlights the placement too');
    }

    // -------------------------------------------------------------
    // Section C: SpatialInspectionService#_inspectPlacement()
    // -------------------------------------------------------------
    {
        const houseWorld = buildOneBrickWorld();
        const worldDoc = new World({});
        const placement = new StructurePlacement({
            documentId: houseWorld.id,
            position: new Position(12, 0, -8),
            rotation: 45
        });
        worldDoc.addStructurePlacement(placement);
        const document = new Document({ world: worldDoc, metadata: new DocumentMetadata({ title: 'Bob World', author: 'bob' }) });

        const layoutPos = { x: 100, y: 0, z: 200 };
        const fakeSession = {
            getDocument: (id) => (id === worldDoc.id ? document : null),
            getDocumentPosition: () => layoutPos,
            getSavedDocumentTitle: (id) => (id === houseWorld.id ? 'My House' : id)
        };
        const inspectionService = new SpatialInspectionService(fakeSession);

        const selection = SpatialSelectionState.placement({ documentId: worldDoc.id, placementId: placement.id });
        const inspection = inspectionService.inspect(selection);

        assert(inspection.isEmpty === false, '20. inspecting a valid placement selection is not empty');
        assert(inspection.type === 'placement', '21. type is placement');
        assert(inspection.documentId === worldDoc.id, '22. documentId is the HOST world');
        assert(inspection.placementId === placement.id, '23. placementId matches');
        assert(inspection.data.sourceDocumentId === houseWorld.id, '24. sourceDocumentId is the REFERENCED document, distinct from the host');
        assert(inspection.data.sourceTitle === 'My House', '25. sourceTitle resolves via getSavedDocumentTitle()');
        assert(inspection.data.localPosition.x === 12 && inspection.data.localPosition.z === -8,
            '26. localPosition is the placement\'s own local position, unmodified');
        assert(inspection.data.worldPosition.x === 12 + layoutPos.x && inspection.data.worldPosition.z === -8 + layoutPos.z,
            '27. worldPosition adds the containing document\'s own layout offset');
        assert(inspection.data.rotation === 45, '28. rotation is exact');
        const expectedGroundY = terrainHeightAt(DEFAULT_WORLD_SEED, layoutPos.x, layoutPos.z);
        assert(inspection.data.groundY === expectedGroundY,
            '29. groundY is sampled at the CONTAINING document\'s own offset — the same value renderer/WorldRenderer.js actually renders with, never the placement\'s own local x/z');

        // An unknown placementId (e.g. it was removed between pick and
        // inspect) degrades to empty, never throws.
        const missing = inspectionService.inspect(SpatialSelectionState.placement({ documentId: worldDoc.id, placementId: 'nope' }));
        assert(missing.isEmpty === true, '30. an unresolvable placementId inspects as empty, not an error');

        // getSavedDocumentTitle() itself, absent a loadDocumentUseCase,
        // falls back to the raw id rather than throwing.
        const barehandedSession = {
            getDocument: () => document,
            getDocumentPosition: () => layoutPos,
            getSavedDocumentTitle: (id) => id
        };
        const fallbackInspection = new SpatialInspectionService(barehandedSession).inspect(selection);
        assert(fallbackInspection.data.sourceTitle === houseWorld.id,
            '31. sourceTitle falls back to the raw documentId when no title can be resolved');
    }

    // -------------------------------------------------------------
    // Section D: WorldNavigationSession#pick() — routing, read-only
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const structureResolver = new StructureDocumentResolver(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        const houseWorld = buildOneBrickWorld();
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const worldDoc = new World({});
        const placement = new StructurePlacement({ documentId: houseWorld.id, position: new Position(5, 0, 5), rotation: 0 });
        worldDoc.addStructurePlacement(placement);
        storage.save(worldDoc.id, serializer.serialize(new Document({ world: worldDoc, metadata: new DocumentMetadata({ title: 'World' }) })));

        function buildSession() {
            const session = new WorldNavigationSession({
                registry, loadPublicationDocumentUseCase, worldLayoutProvider,
                discoveryProvider, structureResolver
            });
            session._session = stubRenderer();
            session._loadWorld(worldDoc.id);
            return session;
        }

        // D1 — a placement hit resolves to a `placement` selection, the
        // host document becomes active, the renderer's own
        // selectPlacement() is called (never selectBricks), and the
        // inspection panel is populated.
        {
            const session = buildSession();
            session._session.pickPlacement = () => ({ placementId: placement.id, point: new Position(5, 0, 5), distance: 8 });

            const result = session.pick(400, 300);
            assert(result.isStructurePlacementSelection === true, '32. pick() resolving a placement hit returns a placement selection');
            assert(result.placementId === placement.id, '33. ...with the correct placementId');
            assert(session.getSpatialSelection().documentId === worldDoc.id, '34. the HOST document becomes the active selection\'s documentId');
            assert(session.getActiveDocumentId() === worldDoc.id, '35. ...and the session\'s active document, exactly like a brick selection would');
            assert(session._session.calls.selectPlacement.length === 1 && session._session.calls.selectPlacement[0] === placement.id,
                '36. the render facade\'s selectPlacement() was called with the correct id');
            assert(session._session.calls.selectBricks.length === 0, '37. selectBricks() is never called for a placement pick');

            const inspection = session.getSpatialInspection();
            assert(inspection.type === 'placement' && inspection.placementId === placement.id,
                '38. getSpatialInspection() reflects the placement selection');
        }

        // D2 — a brick hit nearer than a placement hit wins (mirrors the
        // existing avatar-vs-brick nearest-wins rule).
        {
            const session = buildSession();
            session._session.pick = () => ({ documentId: worldDoc.id, buildingId: 'b1', brickId: 'k1', distance: 2 });
            session._session.pickPlacement = () => ({ placementId: placement.id, point: new Position(5, 0, 5), distance: 8 });

            const result = session.pick(400, 300);
            assert(result.isStructurePlacementSelection === false, '39. a NEARER brick hit wins over a farther placement hit');
        }

        // D3 — a placement hit nearer than a brick hit wins.
        {
            const session = buildSession();
            session._session.pick = () => ({ documentId: worldDoc.id, buildingId: 'b1', brickId: 'k1', distance: 8 });
            session._session.pickPlacement = () => ({ placementId: placement.id, point: new Position(5, 0, 5), distance: 2 });

            const result = session.pick(400, 300);
            assert(result.isStructurePlacementSelection === true, '40. a NEARER placement hit wins over a farther brick hit');
        }

        // D4 — a render facade without pickPlacement() at all degrades
        // gracefully, exactly like the pre-existing pickAvatar() posture.
        {
            const session = buildSession();
            delete session._session.pickPlacement;
            assert(session.pick(400, 300) === null, '41. a facade without pickPlacement() never throws — treated as no placement hit');
        }

        // D5 — clicking empty ground afterward clears the placement
        // selection AND its highlight (clearSelection() is called).
        {
            const session = buildSession();
            session._session.pickPlacement = () => ({ placementId: placement.id, point: new Position(5, 0, 5), distance: 8 });
            session.pick(400, 300);
            assert(session.getSpatialSelection().isStructurePlacementSelection === true, '42. precondition: a placement is selected');

            session._session.pickPlacement = () => null;
            session._session.pickGround = () => ({ position: new Position(0, 0, 0) });
            session.pick(10, 10);
            assert(session.getSpatialSelection().isStructurePlacementSelection === false,
                '43. picking ground afterward replaces the placement selection with a ground one');
            assert(session._session.calls.clearSelection > 0,
                '44. the render facade\'s clearSelection() was invoked, un-highlighting the placement');
        }

        // D6 — the read-only guarantee, now stronger than a no-op: 0.5.9
        // retired moveSelection()/rotateSelection()/deleteSelection()
        // from WorldNavigationSession entirely (EditorSession alone
        // owns them) — a placement selection was already inert against
        // them before that; now there is nothing on this class to even
        // ATTEMPT the mutation with. World View is architecturally
        // incapable of editing, not merely refusing to.
        {
            const session = buildSession();
            session._session.pickPlacement = () => ({ placementId: placement.id, point: new Position(5, 0, 5), distance: 8 });
            session.pick(400, 300);

            // core/Position.js stores x/y/z behind getters on the
            // prototype, not as own enumerable properties — a `{ ...position }`
            // spread silently captures nothing useful, so read the axes
            // explicitly instead.
            const beforePosition = { x: placement.position.x, y: placement.position.y, z: placement.position.z };
            const beforeRotation = placement.rotation;

            assert(typeof session.moveSelection !== 'function', '45. moveSelection() does not exist on WorldNavigationSession at all');
            assert(typeof session.rotateSelection !== 'function', '46. ...nor does rotateSelection()');
            assert(typeof session.deleteSelection !== 'function', '47. ...nor deleteSelection()');

            // Read back through the SESSION'S OWN loaded copy (_loadWorld
            // deserializes a fresh World from storage — a different
            // object than the `worldDoc` this test built) so this proves
            // the copy actually living in the session was never mutated,
            // not just that an unrelated in-test object was left alone.
            const liveWorld = session.getDocument(worldDoc.id).world;
            const stillThere = liveWorld.getStructurePlacement(placement.id);
            assert(stillThere !== null, '48. the placement was never removed');
            assert(stillThere.position.x === beforePosition.x && stillThere.position.z === beforePosition.z,
                '49. the placement\'s position is byte-identical — a selection alone never touches it');
            assert(stillThere.rotation === beforeRotation, '50. ...and its rotation too');
            assert(liveWorld.getStructurePlacements().length === 1, '51. still exactly one placement — nothing was duplicated or removed');

            const history = session._commandHistories.get(worldDoc.id);
            assert(history.canUndo() === false, '52. no command was ever executed against this world\'s history — selection is purely local UI state');
        }
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP
    // -------------------------------------------------------------
    //   Editor creates House -> places House -> saves World -> World
    //   View loads the World -> picks the House -> inspection is exact
    //   -> "Open Source" points at the real House document -> editing
    //   the House's source and re-saving it changes what THIS SAME
    //   placement resolves to, proving WorldPlacement -> Document ->
    //   CURRENT content, never a frozen copy.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);
        const structureResolver = new StructureDocumentResolver(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        // "Editor creates House ... save World" — a real DocumentManager
        // + SaveDocumentUseCase round trip, exactly what the Editor's
        // own Save button drives, so the manifest entry
        // getSavedDocumentTitle() reads is the real thing, not a
        // hand-rolled shortcut.
        const houseWorld = buildOneBrickWorld();
        const houseManager = new DocumentManager(new Document({
            world: houseWorld,
            metadata: new DocumentMetadata({ title: 'My House' })
        }));
        saveDocumentUseCase.execute(houseManager);

        // "... place House ... save World"
        const bobWorld = new World({});
        const placement = new StructurePlacement({
            documentId: houseWorld.id,
            position: new Position(124, 0, 83.5),
            rotation: 90
        });
        bobWorld.addStructurePlacement(placement);
        const bobManager = new DocumentManager(new Document({
            world: bobWorld,
            metadata: new DocumentMetadata({ title: "Bob's World", author: 'bob' })
        }));
        saveDocumentUseCase.execute(bobManager);

        // "... enter World View ... pick House"
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            discoveryProvider, structureResolver, loadDocumentUseCase
        });
        session._session = stubRenderer();
        session._loadWorld(bobWorld.id);
        session._session.pickPlacement = () => ({ placementId: placement.id, point: placement.position, distance: 10 });

        const selection = session.pick(400, 300);
        assert(selection.placementId === placement.id, '53. flagship: picking the House resolves the correct placementId');
        assert(selection.documentId === bobWorld.id, '54. flagship: the selection\'s host document is Bob\'s World');

        const inspection = session.getSpatialInspection();
        assert(inspection.data.sourceDocumentId === houseWorld.id, '55. flagship: source document = the real House documentId');
        assert(inspection.data.sourceTitle === 'My House', '56. flagship: source title resolves to the real saved title');
        assert(inspection.data.localPosition.x === 124 && inspection.data.localPosition.z === 83.5,
            '57. flagship: position is exact');
        assert(inspection.data.rotation === 90, '58. flagship: rotation is exact');
        const layoutPos = session.getDocumentPosition(bobWorld.id);
        const expectedGroundY = terrainHeightAt(DEFAULT_WORLD_SEED, layoutPos.x, layoutPos.z);
        assert(inspection.data.groundY === expectedGroundY, '59. flagship: groundY is deterministic — the same terrain function, same inputs, every time');

        // "click Edit Source -> Editor opens source Document": the ONE
        // piece of data ui/views/WorldView.js#openStructureSource()
        // reads to call router.push({ path: '/editor', query: { load } }) —
        // proving it targets the real House document, not the World.
        assert(inspection.data.sourceDocumentId === houseWorld.id && inspection.data.sourceDocumentId !== bobWorld.id,
            '60. flagship: "Open Source" would load the HOUSE document, never the World it\'s placed inside');

        // Read-only, purely local UI state: picking never touched the
        // World document, the placement, or any command history — and
        // this session was built with no identityProvider, no
        // avatarPresenceSession, no presenceBroadcastProvider, and
        // start() was never called, so there is structurally no
        // transport this pick could have sent a message through even if
        // it tried.
        // Read back through the SESSION'S OWN loaded copy — _loadWorld
        // deserializes a fresh World from storage, a different object
        // than the `bobWorld` this test built — so this proves the copy
        // actually living in World View was never mutated, not just
        // that an unrelated in-test object was left alone.
        const liveBobWorld = session.getDocument(bobWorld.id).world;
        assert(liveBobWorld.getStructurePlacements().length === 1, '61. flagship: still exactly one placement, untouched');
        assert(liveBobWorld.getStructurePlacement(placement.id).position.x === 124,
            '62. flagship: the placement\'s own position is unchanged by being inspected');
        const history = session._commandHistories.get(bobWorld.id);
        assert(!history || history.canUndo() === false, '63. flagship: no command was ever executed — inspection performed zero mutations');

        // "add brick, save -> return to World View -> verify the
        // existing instance reflects the changed source Document" —
        // WorldPlacement -> Document -> CURRENT content, never a frozen
        // copy. Rendered directly through WorldRenderer + the SAME
        // structureResolver World View itself uses (never a second,
        // hand-rolled resolution path).
        const fakeMeshes = new Set();
        const fakeRenderer = { add: (m) => fakeMeshes.add(m), remove: (m) => fakeMeshes.delete(m) };
        const worldRenderer = new WorldRenderer(fakeRenderer, registry, undefined, undefined, structureResolver, TransformMath);
        worldRenderer.addWorld(bobWorld, bobWorld.id, { x: 0, y: 0, z: 0 });
        assert(worldRenderer.placementMeshRegistry.getMeshes(placement.id).length === 1,
            '64. flagship: before the edit, the instance renders the House\'s ORIGINAL one brick');
        worldRenderer.removeWorld(bobWorld, bobWorld.id);

        houseWorld.getBuildings()[0].addBrick(new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        saveDocumentUseCase.execute(houseManager);

        const worldRenderer2 = new WorldRenderer(fakeRenderer, registry, undefined, undefined, structureResolver, TransformMath);
        worldRenderer2.addWorld(bobWorld, bobWorld.id, { x: 0, y: 0, z: 0 });
        assert(worldRenderer2.placementMeshRegistry.getMeshes(placement.id).length === 2,
            '65. flagship: after editing the House and saving it, the SAME placement now renders BOTH bricks — '
            + 'a live reference to the Document\'s current content, never a snapshot frozen at placement time');

        // And the inspection panel's own title keeps up too — the
        // manifest entry advanced with the save, and getSavedDocumentTitle()
        // always reads it fresh, never a cached copy from the earlier pick.
        assert(session.getSavedDocumentTitle(houseWorld.id) === 'My House',
            '66. flagship: the source title still resolves correctly after the Document was re-saved');
    }

    console.log('✓ Section A: SpatialSelectionState.placement() — the new selection kind, and its always-empty items array');
    console.log('✓ Section B: renderer/SpatialSelectionRenderer.js — whole-instance highlight, mutually exclusive with brick highlight');
    console.log('✓ Section C: SpatialInspectionService#_inspectPlacement() — plain data, exact position/rotation, render-matching groundY');
    console.log('✓ Section D: WorldNavigationSession#pick() — routes to read-only inspection, never editing; nearest-hit precedence');
    console.log('✓ Section E: FLAGSHIP — create, place, save, pick, inspect exactly, edit source, re-render reflects it, zero mutation');

    console.log('\nAll World View instance inspection tests passed.');
}

await run();
