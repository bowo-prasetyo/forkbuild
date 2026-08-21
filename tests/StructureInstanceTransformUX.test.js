import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { StructurePreviewUseCase } from '../application/StructurePreviewUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { StructurePlacementGestureService } from '../application/StructurePlacementGestureService.js';
import { GizmoGestureRouter } from '../application/GizmoGestureRouter.js';
import { TransformSettings } from '../application/TransformSettings.js';
import { TransformMath } from '../application/TransformMath.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.92 — World Instance Transform UX.
//
// 0.2.91 closed the instance LIFECYCLE (select/move/rotate/duplicate/
// delete) but named the interaction gap explicitly, by name, in its own
// closing notes: no interactive gizmo, no numeric inspector, keyboard/
// click-drag only. This file proves that gap is closed WITHOUT widening
// SpatialEditingService (the brick/group gesture kernel) and without a
// second mutation path — the gizmo and the numeric inspector both still
// terminate in exactly MoveStructurePlacementCommand/
// RotateStructurePlacementCommand, through CommandHistory, same as
// keyboard nudges and the 0.2.91 click-drag always did.
//
//   Section A: StructurePlacementGestureService — begin/preview/commit/
//              cancel, World untouched until commit, Y always discarded,
//              an invalid (colliding) drop commits nothing, a zero-delta
//              release commits nothing, rotation is never blocked by
//              collision
//   Section B: GizmoGestureRouter — dispatches to the right service by
//              selection kind, per call, and getGestureFeedback() reads
//              from whichever is actually mid-gesture
//   Section C: EditorSession — the placement gizmo anchors via
//              _resolveGizmoPresentation(), applyPlacementTransform()
//              (numeric absolute X/Z/rotation targets, blocked-by-
//              collision reporting), getSelectedPlacementInfo().groundY
//   Section D: FLAGSHIP — keyboard move/rotate and a SIMULATED gizmo
//              drag (the same TransformMath primitives
//              renderer/TransformGizmoController.js itself calls,
//              exactly like tests/InteractiveGizmo.test.js's own
//              convention) commit BYTE-IDENTICAL positions/rotations
//              through BYTE-IDENTICAL command types; collision blocks
//              both equally; terrain elevation is deterministic; the
//              source Document and documentId/placementId are untouched
//              by any of it; save/reload preserves everything.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

function saveDocument(storage, serializer, document) {
    storage.save(document.world.id, serializer.serialize(document));
}

// Builds a resolvable "Box" document (one brick) plus a containing World
// with a single placement referencing it — the same minimal fixture
// tests/StructureInstanceEditing.test.js's own Section G already uses.
function createFixture({ placementPosition = new Position(0, 0, 0), placementRotation = 0 } = {}) {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const resolver = new StructureDocumentResolver(storage, serializer);

    const boxWorld = new World({});
    const boxBuilding = new Building({});
    boxBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    boxWorld.addBuilding(boxBuilding);
    saveDocument(storage, serializer, new Document({ world: boxWorld, metadata: new DocumentMetadata({ title: 'Box' }) }));

    const world = new World({});
    const placement = new StructurePlacement({ documentId: boxWorld.id, position: placementPosition, rotation: placementRotation });
    world.addStructurePlacement(placement);

    const commandHistory = new CommandHistory({ world });
    const editorContext = new CreateEditorContextUseCase().execute();
    const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
    const transformSettings = new TransformSettings();

    const service = new StructurePlacementGestureService({
        getWorld: () => world,
        getCommandHistory: () => commandHistory,
        registry: brickRegistry,
        structureResolver: resolver,
        structurePreviewUseCase,
        transformSettings
    });

    return { brickRegistry, storage, serializer, resolver, boxWorld, world, placement, commandHistory, editorContext, structurePreviewUseCase, transformSettings, service };
}

async function run() {
    // -------------------------------------------------------------
    // Section A: StructurePlacementGestureService
    // -------------------------------------------------------------
    {
        const { world, placement, service, editorContext } = createFixture({ placementPosition: new Position(10, 0, 10) });
        const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] });

        assert(service.transformGizmoState.active === false, '1. idle before any gesture begins');

        const state = service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
        assert(state && state.active === true, '2. beginTransformGesture() returns an active gizmo state');
        close(state.pivot.x, 10, '3. pivot sits at the placement bounds center (x)');

        // Preview an X-axis drag of +5, WITH a nonzero Y component the
        // gizmo's own Y handle could in principle produce — Y must be
        // silently discarded (docs/Principles.md, "A Placement's
        // Elevation Is Never A Gizmo Or Numeric Target").
        service.previewTransformGesture(selection, { translation: { x: 5, y: 3, z: 0 } }, {});
        assert(placement.position.x === 10, '4. mid-gesture the REAL placement is completely untouched');
        assert(editorContext.structurePreview.visible === true, '5. preview shows a live ghost during the drag');
        close(editorContext.structurePreview.position.x, 15, '6. the ghost sits at the candidate X');
        close(editorContext.structurePreview.position.y, 0, '7. the ghost Y is never affected by the Y component of the drag');
        assert(editorContext.structurePreview.valid === true, '8. an unobstructed candidate previews as valid');

        const committed = service.commitTransformGesture(selection, { translation: { x: 5, y: 3, z: 0 } }, {});
        assert(committed === true, '9. commitTransformGesture() reports a real commit');
        close(placement.position.x, 15, '10. the commit applies the snapped X delta');
        close(placement.position.y, 0, '11. Y is exactly unchanged after commit — never 3');
        assert(editorContext.structurePreview.visible === false, '12. the preview hides once the gesture ends');
        assert(service.transformGizmoState.active === false, '13. the gizmo state returns to idle after commit');

        assert(world.getStructurePlacements().length === 1, '14. sanity: still exactly one placement');
    }

    // Rotation: never blocked by collision (V1 AABB is translate-only —
    // core/SpatialBounds.js's own header).
    {
        const { placement, service } = createFixture({ placementPosition: new Position(0, 0, 0), placementRotation: 0 });
        const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] });

        service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
        service.previewTransformGesture(selection, { rotation: 47 }, {});
        // TransformSettings' default 15-degree rotation snap rounds 47 to 45.
        const committed = service.commitTransformGesture(selection, { rotation: 47 }, {});
        assert(committed === true, '15. a real rotation commits');
        close(placement.rotation, 45, '16. the committed rotation is snapped to the 15-degree increment');
        close(placement.position.x, 0, '17. rotating never touches position');
    }

    // An invalid (colliding) drop commits nothing at all — position AND
    // rotation, mirroring SelectionTool's own click-drag posture exactly.
    {
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const boxWorld = new World({});
        const boxBuilding = new Building({});
        boxBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        boxWorld.addBuilding(boxBuilding);
        saveDocument(storage, serializer, new Document({ world: boxWorld, metadata: new DocumentMetadata({ title: 'Box' }) }));

        const world = new World({});
        const placementA = new StructurePlacement({ documentId: boxWorld.id, position: new Position(0, 0, 0), rotation: 0 });
        const placementB = new StructurePlacement({ documentId: boxWorld.id, position: new Position(50, 0, 50), rotation: 0 });
        world.addStructurePlacement(placementA);
        world.addStructurePlacement(placementB);
        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const service = new StructurePlacementGestureService({
            getWorld: () => world,
            getCommandHistory: () => commandHistory,
            registry: brickRegistry,
            structureResolver: resolver,
            structurePreviewUseCase: new StructurePreviewUseCase(editorContext),
            transformSettings: new TransformSettings()
        });
        const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: placementA.id }] });

        service.beginTransformGesture(selection, { mode: 'translate', axis: null });
        service.previewTransformGesture(selection, { translation: { x: 50, y: 0, z: 50 } }, {});
        assert(editorContext.structurePreview.valid === false, '18. dragging onto an occupied position previews as invalid');
        const committed = service.commitTransformGesture(selection, { translation: { x: 50, y: 0, z: 50 } }, {});
        assert(committed === false, '19. releasing over an invalid position commits nothing');
        assert(placementA.position.x === 0 && placementA.position.z === 0, '20. A stays exactly where it started');
        assert(commandHistory.canUndo() === false, '21. no command was ever pushed to history');
    }

    // A zero-delta release (click without moving) commits nothing —
    // the exact "click-release without moving -> nothing" rule the
    // pre-existing brick gizmo's own docs/user/InteractiveTransformGizmo.md
    // already establishes.
    {
        const { placement, service } = createFixture({ placementPosition: new Position(3, 0, 3) });
        const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] });
        service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
        const committed = service.commitTransformGesture(selection, { translation: { x: 0, y: 0, z: 0 } }, {});
        assert(committed === false, '22. a zero-delta commit reports no commit');
        assert(placement.position.x === 3, '23. nothing moved');
    }

    // cancelTransformGesture() — Escape mid-drag.
    {
        const { placement, service, editorContext } = createFixture({ placementPosition: new Position(1, 0, 1) });
        const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] });
        service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
        service.previewTransformGesture(selection, { translation: { x: 9, y: 0, z: 0 } }, {});
        assert(editorContext.structurePreview.visible === true, '24. sanity: preview is showing mid-drag');
        const cancelled = service.cancelTransformGesture(selection);
        assert(cancelled === true, '25. cancelTransformGesture() reports it actually cancelled something');
        assert(placement.position.x === 1, '26. the placement was never touched, so cancel needs nothing to restore');
        assert(editorContext.structurePreview.visible === false, '27. the preview hides on cancel');
        assert(service.transformGizmoState.active === false, '28. the gizmo state returns to idle after cancel');
    }

    console.log('✓ Section A: StructurePlacementGestureService — begin/preview/commit/cancel, Y discarded, '
        + 'collision blocks translate but never rotate, zero-delta and cancel commit nothing');

    // -------------------------------------------------------------
    // Section B: GizmoGestureRouter
    // -------------------------------------------------------------
    {
        const calls = [];
        const makeStub = (name) => ({
            transformGizmoState: { active: false },
            beginTransformGesture(selection, options) { calls.push([`${name}.begin`, selection, options]); return { active: true }; },
            previewTransformGesture(selection, transform, opts) { calls.push([`${name}.preview`, selection, transform, opts]); return true; },
            commitTransformGesture(selection, transform, opts) { calls.push([`${name}.commit`, selection, transform, opts]); return true; },
            cancelTransformGesture(selection) { calls.push([`${name}.cancel`, selection]); return true; },
            getGestureFeedback() { return `${name}-feedback`; }
        });
        const brick = makeStub('brick');
        const placementSvc = makeStub('placement');
        const router = new GizmoGestureRouter(brick, placementSvc);

        const brickSelection = new SelectionState({ brickId: 'b1', buildingId: 'bld1' });
        const placementSelection = new SelectionState({ items: [{ type: 'structure-placement', placementId: 'p1' }] });

        router.beginTransformGesture(brickSelection, { mode: 'translate' });
        router.beginTransformGesture(placementSelection, { mode: 'translate' });
        assert(calls[0][0] === 'brick.begin', '29. a brick selection routes beginTransformGesture() to the brick service');
        assert(calls[1][0] === 'placement.begin', '30. a placement selection routes beginTransformGesture() to the placement service');

        router.previewTransformGesture(placementSelection, { translation: { x: 1, y: 0, z: 0 } }, {});
        router.commitTransformGesture(brickSelection, { translation: { x: 1, y: 0, z: 0 } }, {});
        router.cancelTransformGesture(placementSelection);
        assert(calls[2][0] === 'placement.preview', '31. preview routes correctly');
        assert(calls[3][0] === 'brick.commit', '32. commit routes correctly');
        assert(calls[4][0] === 'placement.cancel', '33. cancel routes correctly');

        // getGestureFeedback() reads from whichever service is ACTUALLY
        // mid-gesture, regardless of which selection is passed in (it
        // takes no selection argument — see TransformGizmoController's
        // own _readGestureFeedback()).
        brick.transformGizmoState.active = false;
        placementSvc.transformGizmoState.active = true;
        assert(router.getGestureFeedback() === 'placement-feedback', '34. feedback comes from the active placement service');
        placementSvc.transformGizmoState.active = false;
        brick.transformGizmoState.active = true;
        assert(router.getGestureFeedback() === 'brick-feedback', '35. feedback comes from the active brick service when IT is active instead');
    }

    console.log('✓ Section B: GizmoGestureRouter — per-call dispatch by selection kind, feedback from whichever is active');

    // -------------------------------------------------------------
    // Section C: EditorSession
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage);
        const brickRegistry = new CreateBrickRegistryUseCase().execute();

        const boxWorld = new World({});
        const boxBuilding = new Building({});
        boxBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        boxWorld.addBuilding(boxBuilding);
        const boxDocumentManager = new DocumentManager(
            new Document({ world: boxWorld, metadata: new DocumentMetadata({ title: 'Box' }) })
        );
        new SaveDocumentUseCase(storage, serializer).execute(boxDocumentManager);

        const world = new World({});
        const placementA = new StructurePlacement({ documentId: boxWorld.id, position: new Position(20, 0, 20), rotation: 0 });
        const placementB = new StructurePlacement({ documentId: boxWorld.id, position: new Position(50, 0, 50), rotation: 0 });
        world.addStructurePlacement(placementA);
        world.addStructurePlacement(placementB);
        const villageDocument = new Document({ world, metadata: new DocumentMetadata({ title: 'Village' }) });

        const editorContext = new CreateEditorContextUseCase().execute();
        const documentManager = new DocumentManager();
        documentManager.newDocument(villageDocument);
        const selectionUseCase = new SelectionUseCase(editorContext);

        const session = new EditorSession({
            registry: brickRegistry,
            editorContext,
            toolRegistry: null,
            documentManager,
            selectionUseCase,
            previewUseCase: new PreviewUseCase(editorContext),
            loadDocumentUseCase,
            structureResolver: resolver,
            structurePreviewUseCase: new StructurePreviewUseCase(editorContext)
        });
        // Headless harness, same posture as
        // tests/StructureInstanceEditing.test.js's own Section H: supply
        // the one piece _rebuild() would otherwise wire up via a real
        // render container.
        session._commandHistory = new CommandHistory({ world });

        selectionUseCase.selectPlacement(placementA.id);

        // getSelectedPlacementInfo().groundY — a pure function of the
        // CURRENT position, recomputed fresh, never stored.
        const info = session.getSelectedPlacementInfo();
        close(info.groundY, terrainHeightAt(DEFAULT_WORLD_SEED, 20, 20), '36. groundY matches terrainHeightAt() at the placement\'s own (x, z)');

        // _resolveGizmoPresentation() — the gizmo anchors to the whole
        // resolved structure's bounds, not just the placement's bare
        // position.
        const presentation = session._resolveGizmoPresentation(editorContext.selection);
        assert(presentation !== null, '37. a placement selection resolves a gizmo presentation');
        close(presentation.pivot.x, 20, '38. the pivot sits over the placement position (x)');
        close(presentation.bounds.size.x, 1, '39. bounds reflect the resolved structure\'s own footprint (a 1x1x1 cube)');

        // applyPlacementTransform() — absolute numeric targets, routed
        // through the SAME Move/RotateStructurePlacementCommand pair.
        const result = session.applyPlacementTransform({ x: 24, z: 26, rotation: 90 });
        assert(result.moved === true && result.rotated === true, '40. applyPlacementTransform() reports both halves committed');
        close(placementA.position.x, 24, '41. X moved to the requested absolute target');
        close(placementA.position.z, 26, '42. Z moved to the requested absolute target');
        close(placementA.rotation, 90, '43. rotation moved to the requested absolute target');
        assert(session.commandHistory.canUndo() === true, '44. applyPlacementTransform() produced real, undoable commands');

        // A blocked target (occupied) reports blocked, leaves X/Z alone,
        // but a simultaneously-requested rotation still goes through
        // (position and rotation are independent commands, exactly as
        // 0.2.91 already established for the keyboard/Rotate-button
        // pair).
        const blockedResult = session.applyPlacementTransform({ x: 50, z: 50, rotation: 180 });
        assert(blockedResult.moved === false && blockedResult.blocked === true,
            '45. applyPlacementTransform() reports a collision as blocked, not moved');
        assert(placementA.position.x === 24 && placementA.position.z === 26,
            '46. a blocked move leaves the placement exactly where it was');
        assert(blockedResult.rotated === true, '47. rotation still commits independently of a blocked move');
        close(placementA.rotation, 180, '48. rotation reflects the independently-committed change');

        // A no-op target (already there) commits nothing.
        const noopResult = session.applyPlacementTransform({ x: 24, z: 26, rotation: 180 });
        assert(noopResult.moved === false && noopResult.rotated === false && noopResult.blocked === false,
            '49. requesting the CURRENT position/rotation commits nothing');
    }

    console.log('✓ Section C: EditorSession — gizmo presentation for a placement selection, applyPlacementTransform(), groundY');

    // -------------------------------------------------------------
    // Section D: FLAGSHIP — keyboard vs. simulated gizmo drag parity
    // -------------------------------------------------------------
    {
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseStructure = structureRegistry.get('village:house');
        const house = new ForkStructureUseCase().execute(houseStructure, stubIdentityProvider);
        saveDocument(storage, serializer, house);
        const houseBrickCountBeforeEdit = house.world.getBuildings()[0].getBricks().length;

        // Two independent villages, so the keyboard path and the gizmo
        // path start from an IDENTICAL fixture and never interfere.
        function makeVillage() {
            const village = new World({});
            const placement = new StructurePlacement({
                documentId: house.world.id, position: new Position(100, 0, 200), rotation: 0
            });
            village.addStructurePlacement(placement);
            const commandHistory = new CommandHistory({ world: village });
            return { village, placement, commandHistory };
        }

        // --- Path 1: keyboard (EditorSession#moveSelection/rotateSelection)
        const kb = makeVillage();
        {
            const editorContext = new CreateEditorContextUseCase().execute();
            const documentManager = new DocumentManager();
            documentManager.newDocument(new Document({ world: kb.village, metadata: new DocumentMetadata({ title: 'Village' }) }));
            const selectionUseCase = new SelectionUseCase(editorContext);
            const session = new EditorSession({
                registry: brickRegistry, editorContext, toolRegistry: null, documentManager,
                selectionUseCase, previewUseCase: new PreviewUseCase(editorContext),
                loadDocumentUseCase: new LoadDocumentUseCase(storage),
                structureResolver: resolver, structurePreviewUseCase: new StructurePreviewUseCase(editorContext)
            });
            session._commandHistory = kb.commandHistory;
            selectionUseCase.selectPlacement(kb.placement.id);
            session.moveSelection({ x: 12, y: 0, z: -8 });
            session.rotateSelection(90);
        }

        // --- Path 2: a SIMULATED gizmo drag, using the exact TransformMath
        // primitives the real TransformGizmoController computes between
        // raycasts (tests/InteractiveGizmo.test.js's own convention),
        // fed straight into StructurePlacementGestureService.
        const gz = makeVillage();
        {
            const editorContext = new CreateEditorContextUseCase().execute();
            const service = new StructurePlacementGestureService({
                getWorld: () => gz.village,
                getCommandHistory: () => gz.commandHistory,
                registry: brickRegistry,
                structureResolver: resolver,
                structurePreviewUseCase: new StructurePreviewUseCase(editorContext),
                transformSettings: new TransformSettings({ snappingEnabled: false })
            });
            const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: gz.placement.id }] });

            // Free-move pad handle: drag from the pivot to pivot+(12,-8)
            // on the ground plane — exactly TransformGizmoController's
            // own handleId === 'free' branch.
            const pivot = { x: 100, y: 0, z: 200 };
            const startPoint = { x: pivot.x, y: 0, z: pivot.z };
            const endPoint = { x: pivot.x + 12, y: 0, z: pivot.z - 8 };
            service.beginTransformGesture(selection, { mode: 'translate', axis: null });
            const translateTransform = { x: endPoint.x - startPoint.x, y: 0, z: endPoint.z - startPoint.z };
            service.previewTransformGesture(selection, { translation: translateTransform }, {});
            service.commitTransformGesture(selection, { translation: translateTransform }, {});

            // Rotation ring handle: TransformMath.rotationDeltaFromPoints
            // is the exact function TransformGizmoController calls.
            service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
            const rotationPivot = { x: 112, y: 0, z: 192 };
            const rotStart = { x: rotationPivot.x + 1, y: 0, z: rotationPivot.z };
            const rotEnd = TransformMath.transformPoint(rotStart, rotationPivot, { rotation: 90 });
            const rotationDelta = TransformMath.rotationDeltaFromPoints(rotationPivot, rotStart, rotEnd);
            service.previewTransformGesture(selection, { rotation: rotationDelta }, {});
            service.commitTransformGesture(selection, { rotation: rotationDelta }, {});
        }

        // --- Parity assertions ---
        close(kb.placement.position.x, gz.placement.position.x, '50. flagship: keyboard and gizmo X end up byte-identical');
        close(kb.placement.position.z, gz.placement.position.z, '51. flagship: keyboard and gizmo Z end up byte-identical');
        close(kb.placement.rotation, gz.placement.rotation, '52. flagship: keyboard and gizmo rotation end up byte-identical');
        assert(kb.placement.position.x === 112 && kb.placement.position.z === 192,
            '53. flagship: the keyboard path landed where expected');
        assert(kb.placement.rotation === 90, '54. flagship: the keyboard path rotated where expected');

        const kbTypes = kb.commandHistory.getExecutedCommands().map((c) => c.type);
        const gzTypes = gz.commandHistory.getExecutedCommands().map((c) => c.type);
        assert(JSON.stringify(kbTypes) === JSON.stringify(['move-structure-placement', 'rotate-structure-placement']),
            '55. flagship: the keyboard path produced exactly one Move then one Rotate command');
        assert(JSON.stringify(kbTypes) === JSON.stringify(gzTypes),
            '56. flagship: the gizmo path produced the IDENTICAL command type sequence — no second mutation path exists');

        // Both undo cleanly back to the original placement position.
        gz.commandHistory.undo();
        gz.commandHistory.undo();
        assert(gz.placement.position.x === 100 && gz.placement.position.z === 200 && gz.placement.rotation === 0,
            '57. flagship: undoing the gizmo-driven commands restores the exact original transform');

        // Collision rules are identical: dragging the gizmo onto an
        // occupied cell is refused exactly like a keyboard move already
        // is (application/EditorSession.js#_structurePlacementFits()).
        {
            const village = new World({});
            const placementA = new StructurePlacement({ documentId: house.world.id, position: new Position(300, 0, 300), rotation: 0 });
            const placementB = new StructurePlacement({ documentId: house.world.id, position: new Position(400, 0, 400), rotation: 0 });
            village.addStructurePlacement(placementA);
            village.addStructurePlacement(placementB);
            const commandHistory = new CommandHistory({ world: village });
            const editorContext = new CreateEditorContextUseCase().execute();
            const service = new StructurePlacementGestureService({
                getWorld: () => village, getCommandHistory: () => commandHistory,
                registry: brickRegistry, structureResolver: resolver,
                structurePreviewUseCase: new StructurePreviewUseCase(editorContext),
                transformSettings: new TransformSettings({ snappingEnabled: false })
            });
            const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: placementA.id }] });
            service.beginTransformGesture(selection, { mode: 'translate', axis: null });
            service.previewTransformGesture(selection, { translation: { x: 100, y: 0, z: 100 } }, {});
            const committed = service.commitTransformGesture(selection, { translation: { x: 100, y: 0, z: 100 } }, {});
            assert(committed === false, '58. flagship: the gizmo refuses to commit a collision, same as the keyboard/drag paths');
            assert(placementA.position.x === 300, '59. flagship: A stays put after a blocked gizmo drag');
        }

        // Terrain elevation is deterministic — a pure function of (seed,
        // x, z), recomputed identically every time, never stored on the
        // placement itself.
        const groundY1 = terrainHeightAt(DEFAULT_WORLD_SEED, kb.placement.position.x, kb.placement.position.z);
        const groundY2 = terrainHeightAt(DEFAULT_WORLD_SEED, kb.placement.position.x, kb.placement.position.z);
        close(groundY1, groundY2, '60. flagship: terrainHeightAt() is deterministic for the same (seed, x, z)');

        // The source Document is untouched by ANY of this — the whole
        // point of the content/instance boundary 0.2.90/0.2.91 drew.
        const houseAfter = resolver.resolve(house.world.id);
        assert(houseAfter.getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit,
            '61. flagship: none of the keyboard/gizmo transform activity touched the House Document\'s own brick count');

        // documentId/placementId identity survives a save/reload round
        // trip untouched, exactly like 0.2.91's own flagship proved for
        // move/rotate/duplicate.
        const villageDoc = new Document({ world: gz.village, metadata: new DocumentMetadata({ title: 'GizmoVillage' }) });
        saveDocument(storage, serializer, villageDoc);
        const reloaded = resolver.resolve(gz.village.id);
        const reloadedPlacement = reloaded.getStructurePlacement(gz.placement.id);
        assert(reloadedPlacement !== null, '62. flagship: the placement survives save/reload');
        assert(reloadedPlacement.documentId === house.world.id, '63. flagship: documentId is unchanged after save/reload');
        assert(reloadedPlacement.id === gz.placement.id, '64. flagship: placementId is unchanged after save/reload');
        close(reloadedPlacement.position.x, 100, '65. flagship: the undone gizmo position round-trips correctly');

        console.log('✓ Section D: FLAGSHIP — keyboard and a simulated gizmo drag commit byte-identical transforms through '
            + 'the IDENTICAL command sequence; collision, terrain determinism, source-Document isolation, and '
            + 'save/reload identity all hold for both');
    }

    console.log('\nAll structure instance transform UX tests passed.');
}

await run();
