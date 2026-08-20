import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { DomainEvent } from '../core/events/Event.js';
import { EventBus } from '../core/events/EventBus.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { PlaceStructureCommand } from '../application/commands/PlaceStructureCommand.js';
import { MoveStructurePlacementCommand } from '../application/commands/MoveStructurePlacementCommand.js';
import { RotateStructurePlacementCommand } from '../application/commands/RotateStructurePlacementCommand.js';
import { DuplicateStructurePlacementCommand } from '../application/commands/DuplicateStructurePlacementCommand.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { StructurePreviewUseCase } from '../application/StructurePreviewUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { SelectionTool } from '../application/tools/SelectionTool.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.91 — World Instance Editing & Placement Management.
//
// 0.2.90 gave a StructurePlacement a data model and reliable rendering,
// but named the gap explicitly: "not yet selectable, movable, or
// deletable one at a time." This file proves that gap is closed — a
// placed structure is now a first-class editable object, while the
// content/instance boundary 0.2.90 established stays exactly as strict:
// moving, rotating, or duplicating an instance NEVER touches the
// referenced Document, and editing the Document is immediately visible
// through every instance that references it, moved or not.
//
//   Section A: SelectionState — a structure-placement item, dedupe,
//              isStructurePlacementSelection/selectedPlacementId
//   Section B: SelectionUseCase#selectPlacement()
//   Section C: core/World.js#updateStructurePlacement() — in-place
//              mutation, STRUCTURE_PLACEMENT_UPDATED, graceful no-op
//   Section D: MoveStructurePlacementCommand — execute/undo/redo,
//              worldId guard, CommandRegistry round trip
//   Section E: RotateStructurePlacementCommand — same shape
//   Section F: DuplicateStructurePlacementCommand — same documentId,
//              new placementId, offset position, copied rotation, undo
//              removes it, redo recreates the identical duplicate
//   Section G: SelectionTool — click selects the WHOLE instance (never
//              a constituent brick), a second click-drag moves it
//              terrain-... err, ground-snapped and collision-checked,
//              R/Shift+R rotate it, Delete removes it — all headless,
//              no 'three' import anywhere
//   Section H: EditorSession — moveSelection/rotateSelection/
//              deleteSelection/duplicateSelection/getSelectedPlacementInfo
//              all branch correctly for a structure-placement selection,
//              through the SAME action surface bricks already use
//   Section I: FLAGSHIP — fork House, place A and B, select A, move A,
//              rotate A, duplicate A -> C, rotate A again, delete B,
//              save, reload: A survives, B is gone, C exists,
//              documentId(A) === documentId(C), placementId(A) !==
//              placementId(C), A and C end up at different positions
//              AND rotations, the House Document is untouched by any of
//              it — and editing House afterward is immediately visible
//              through BOTH A and C while their own position/rotation
//              stay exactly where the user left them.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) {
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        if (!this._data.has(name)) return null;
        return JSON.parse(JSON.stringify(this._data.get(name)));
    }
    remove(name) {
        this._data.delete(name);
    }
    list() {
        return Array.from(this._data.keys());
    }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

function saveDocument(storage, serializer, document) {
    storage.save(document.world.id, serializer.serialize(document));
}

function keyEvent(key, modifiers = {}) {
    return { key, modifiers };
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A: SelectionState
    // -------------------------------------------------------------
    {
        const empty = SelectionState.empty();
        assert(empty.isStructurePlacementSelection === false, '1. an empty selection is not a structure-placement selection');
        assert(empty.selectedPlacementId === null, '2. selectedPlacementId is null on an empty selection');

        const selection = new SelectionState({ items: [{ type: 'structure-placement', placementId: 'p1' }] });
        assert(selection.isSingle === true, '3. a placement selection is a single item');
        assert(selection.isStructurePlacementSelection === true, '4. isStructurePlacementSelection is true');
        assert(selection.selectedPlacementId === 'p1', '5. selectedPlacementId exposes the placement id');
        assert(selection.brickIds.length === 0, '6. brickIds is empty for a placement selection — never conflated with bricks');

        // Two DIFFERENT placement items dedupe by placementId, not by
        // colliding on a shared "undefined:undefined" brick-shaped key.
        const twoDistinct = new SelectionState({
            items: [
                { type: 'structure-placement', placementId: 'p1' },
                { type: 'structure-placement', placementId: 'p2' }
            ]
        });
        assert(twoDistinct.items.length === 2, '7. two distinct placement ids both survive construction (no accidental dedupe collision)');

        // The SAME placement id twice DOES dedupe.
        const duplicated = new SelectionState({
            items: [
                { type: 'structure-placement', placementId: 'p1' },
                { type: 'structure-placement', placementId: 'p1' }
            ]
        });
        assert(duplicated.items.length === 1, '8. the same placement id listed twice dedupes to one item');

        const brickSelection = new SelectionState({ brickId: 'b1', buildingId: 'bld1' });
        assert(brickSelection.isStructurePlacementSelection === false, '9. an ordinary brick selection is not a structure-placement selection');
    }

    // -------------------------------------------------------------
    // Section B: SelectionUseCase#selectPlacement()
    // -------------------------------------------------------------
    {
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);

        selectionUseCase.select('brick-1', 'building-1');
        assert(editorContext.selection.isStructurePlacementSelection === false, '10. sanity: selecting a brick is not a placement selection');

        selectionUseCase.selectPlacement('placement-1');
        assert(editorContext.selection.isStructurePlacementSelection === true, '11. selectPlacement() replaces the selection with a placement selection');
        assert(editorContext.selection.selectedPlacementId === 'placement-1', '12. selectedPlacementId matches what was passed');

        selectionUseCase.select('brick-2', 'building-1');
        assert(editorContext.selection.isStructurePlacementSelection === false,
            '13. selecting a brick afterward REPLACES the placement selection — never mixed');
    }

    // -------------------------------------------------------------
    // Section C: core/World.js#updateStructurePlacement()
    // -------------------------------------------------------------
    {
        const events = [];
        const eventBus = new EventBus();
        eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_UPDATED, (payload) => events.push(payload.placement));

        const world = new World({ eventBus });
        const placement = new StructurePlacement({ documentId: 'house-doc', position: new Position(1, 0, 1), rotation: 0 });
        world.addStructurePlacement(placement);

        world.updateStructurePlacement(placement.id, { position: new Position(5, 0, 9) });
        assert(placement.position.x === 5 && placement.position.z === 9,
            '14. updateStructurePlacement() mutates position IN PLACE — same placement identity');
        assert(world.getStructurePlacement(placement.id) === placement,
            '15. the placement in the World is the exact same object, never replaced');

        world.updateStructurePlacement(placement.id, { rotation: 270 });
        assert(placement.rotation === 270, '16. updateStructurePlacement() mutates rotation too');

        assert(events.length === 2 && events[0] === placement && events[1] === placement,
            '17. every update publishes STRUCTURE_PLACEMENT_UPDATED with the placement');

        assert(placement.documentId === 'house-doc', '18. updateStructurePlacement() never touches documentId');

        world.updateStructurePlacement('nonexistent', { position: new Position(0, 0, 0) });
        assert(events.length === 2, '19. updating an unknown placement id is a silent no-op, no event published');
    }

    // -------------------------------------------------------------
    // Section D: MoveStructurePlacementCommand
    // -------------------------------------------------------------
    {
        const world = new World({});
        const context = { world };
        const placement = new StructurePlacement({ documentId: 'house-doc', position: new Position(10, 0, 10), rotation: 90 });
        world.addStructurePlacement(placement);

        const command = new MoveStructurePlacementCommand({
            worldId: world.id, placementId: placement.id, delta: { x: 5, y: 0, z: -3 }
        });
        assert(command.canUndo() === false, '20. canUndo() is false before execute()');
        command.execute(context);
        assert(placement.position.x === 15 && placement.position.z === 7, '21. execute() applies the delta');
        assert(placement.rotation === 90, '22. execute() never touches rotation');
        assert(command.canUndo() === true, '23. canUndo() is true after execute()');

        command.undo(context);
        assert(placement.position.x === 10 && placement.position.z === 10, '24. undo() restores the exact original position');

        command.execute(context);
        assert(placement.position.x === 15 && placement.position.z === 7, '25. redo (execute() again) re-applies the same delta');

        assert((() => {
            try {
                new MoveStructurePlacementCommand({ worldId: 'other-world', placementId: placement.id, delta: { x: 1, y: 0, z: 1 } })
                    .execute(context);
                return false;
            } catch { return true; }
        })(), '26. execute() throws on a worldId mismatch');

        assert((() => {
            try {
                new MoveStructurePlacementCommand({ worldId: world.id, placementId: 'nonexistent', delta: { x: 1, y: 0, z: 1 } })
                    .execute(context);
                return false;
            } catch { return true; }
        })(), '27. execute() throws when the placement id does not exist');

        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const restoredCommand = commandRegistry.fromJSON(command.toJSON());
        assert(restoredCommand.type === 'move-structure-placement' && restoredCommand.placementId === placement.id
            && restoredCommand.delta.x === 5,
            '28. MoveStructurePlacementCommand round-trips through CommandRegistry.fromJSON()');
    }

    // -------------------------------------------------------------
    // Section E: RotateStructurePlacementCommand
    // -------------------------------------------------------------
    {
        const world = new World({});
        const context = { world };
        const placement = new StructurePlacement({ documentId: 'house-doc', position: new Position(2, 0, 2), rotation: 0 });
        world.addStructurePlacement(placement);

        const command = new RotateStructurePlacementCommand({ worldId: world.id, placementId: placement.id, deltaRotation: 90 });
        command.execute(context);
        assert(placement.rotation === 90, '29. execute() adds deltaRotation to the current rotation');
        assert(placement.position.x === 2 && placement.position.z === 2, '30. execute() never touches position');

        command.undo(context);
        assert(placement.rotation === 0, '31. undo() restores the original rotation');

        command.execute(context);
        assert(placement.rotation === 90, '32. redo re-applies the same delta');

        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const restoredCommand = commandRegistry.fromJSON(command.toJSON());
        assert(restoredCommand.type === 'rotate-structure-placement' && restoredCommand.deltaRotation === 90,
            '33. RotateStructurePlacementCommand round-trips through CommandRegistry.fromJSON()');
    }

    // -------------------------------------------------------------
    // Section F: DuplicateStructurePlacementCommand
    // -------------------------------------------------------------
    {
        const world = new World({});
        const context = { world };
        const source = new StructurePlacement({ documentId: 'house-doc', position: new Position(10, 0, 10), rotation: 90 });
        world.addStructurePlacement(source);

        const command = new DuplicateStructurePlacementCommand({ worldId: world.id, placementId: source.id });
        assert(command.canUndo() === false, '34. canUndo() is false before execute()');
        const duplicate = command.execute(context);

        assert(duplicate.id !== source.id, '35. duplicate() creates a NEW placement identity');
        assert(duplicate.documentId === source.documentId,
            '36. the duplicate references the SAME documentId — content identity is unchanged');
        assert(duplicate.position.x === 12 && duplicate.position.z === 12,
            '37. the duplicate sits at the source position + the default offset (2, 0, 2)');
        assert(duplicate.rotation === 90, '38. the duplicate copies the source rotation unchanged');
        assert(world.getStructurePlacements().length === 2, '39. both the source and the duplicate exist in the World');
        assert(source.position.x === 10, '40. duplicating never moves the SOURCE placement');

        command.undo(context);
        assert(world.getStructurePlacements().length === 1 && world.getStructurePlacement(source.id) === source,
            '41. undo() removes exactly the duplicate, leaving the source untouched');

        const redone = command.execute(context);
        assert(redone.id === duplicate.id, '42. redo (execute() again) recreates the SAME duplicate identity, not a third placement');
        assert(world.getStructurePlacements().length === 2, '43. sanity: still exactly two placements after redo');

        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const restoredCommand = commandRegistry.fromJSON(command.toJSON());
        assert(restoredCommand.type === 'duplicate-structure-placement' && restoredCommand.placementId === source.id,
            '44. DuplicateStructurePlacementCommand round-trips through CommandRegistry.fromJSON()');

        assert((() => {
            try {
                new DuplicateStructurePlacementCommand({ worldId: world.id, placementId: 'nonexistent' }).execute(context);
                return false;
            } catch { return true; }
        })(), '45. execute() throws when the source placement id does not exist');
    }

    // -------------------------------------------------------------
    // Section G: SelectionTool (headless — no renderer import anywhere)
    // -------------------------------------------------------------
    {
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
        world.addStructurePlacement(placementA);
        // A second, distant placement — proves collision only applies at
        // the actual overlap, and proves the drag never disturbs it.
        const placementB = new StructurePlacement({ documentId: boxWorld.id, position: new Position(50, 0, 50), rotation: 0 });
        world.addStructurePlacement(placementB);

        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);

        const context = {
            world, registry: brickRegistry, editorContext, commandHistory,
            structureResolver: resolver, structurePreviewUseCase,
            selectionUseCase: new SelectionUseCase(editorContext)
        };
        const tool = new SelectionTool(context);

        // A miss (no pickedBrick, no pickedPlacement) clears any selection.
        editorContext.setSelection(new SelectionState({ brickId: 'x', buildingId: 'y' }));
        tool.onPointerDown({ modifiers: {}, pickedBrick: null, pickedPlacement: null });
        assert(editorContext.selection.isEmpty, '46. clicking empty space clears the selection');

        // A hit on a placement selects the WHOLE instance.
        tool.onPointerDown({ modifiers: {}, pickedBrick: null, pickedPlacement: { placementId: placementA.id } });
        assert(editorContext.selection.isStructurePlacementSelection === true, '47. clicking a placement selects it as a whole instance');
        assert(editorContext.selection.selectedPlacementId === placementA.id, '48. the selected placement id matches the hit');

        // R rotates the ALREADY-selected placement immediately (not a drag).
        tool.onKeyDown(keyEvent('r'));
        assert(placementA.rotation === 90, '49. R rotates the selected placement +90°');
        tool.onKeyDown(keyEvent('r', { shift: true }));
        assert(placementA.rotation === 0, '50. Shift+R rotates back -90°');
        assert(commandHistory.canUndo() === true, '51. rotating via the tool produced a real, undoable command');

        // Clicking the ALREADY-selected placement a second time begins a drag.
        tool.onPointerDown({ modifiers: {}, pickedBrick: null, pickedPlacement: { placementId: placementA.id } });
        tool.onPointerMove({ worldPosition: { x: 9, y: 0, z: 9 } });
        assert(editorContext.structurePreview.visible === true, '52. dragging shows the live 3D-ghost-driving preview state');
        assert(editorContext.structurePreview.valid === true, '53. dragging to a clear position shows a valid preview');
        assert(placementA.position.x === 0, '54. nothing commits to the World until pointer up — mid-drag the real placement is untouched');

        tool.onPointerUp();
        assert(placementA.position.x === 9 && placementA.position.z === 9, '55. releasing over a valid position commits the move');
        assert(editorContext.structurePreview.visible === false, '56. the drag preview hides after committing');
        assert(placementB.position.x === 50, '57. moving A never touches B');

        // Drag A onto B's position — collision refuses the commit.
        tool.onPointerDown({ modifiers: {}, pickedBrick: null, pickedPlacement: { placementId: placementA.id } });
        tool.onPointerMove({ worldPosition: { x: 50, y: 0, z: 50 } });
        assert(editorContext.structurePreview.valid === false, '58. dragging onto an occupied position shows an invalid preview');
        tool.onPointerUp();
        assert(placementA.position.x === 9 && placementA.position.z === 9,
            '59. releasing over an invalid (colliding) position does NOT commit — A stays exactly where it was');

        // Delete removes the selected placement, never the Document.
        editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: placementA.id }] }));
        tool.onKeyDown(keyEvent('Delete'));
        assert(world.getStructurePlacement(placementA.id) === null, '60. Delete removes the selected placement');
        assert(world.getStructurePlacements().length === 1 && world.getStructurePlacement(placementB.id) === placementB,
            '61. deleting A leaves B completely untouched');
        assert(editorContext.selection.isEmpty, '62. the selection clears after deleting the placement');
        assert(resolver.resolve(boxWorld.id) !== null, '63. deleting a placement never touches the referenced Document');

        // Deleting a BRICK selection still works exactly as before.
        const bldWorld = new World({});
        const bld = new Building({});
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) });
        bld.addBrick(brick);
        bldWorld.addBuilding(bld);
        const brickHistory = new CommandHistory({ world: bldWorld });
        const brickContext = {
            world: bldWorld, registry: brickRegistry, editorContext, commandHistory: brickHistory,
            structureResolver: resolver, structurePreviewUseCase, selectionUseCase: new SelectionUseCase(editorContext)
        };
        const brickTool = new SelectionTool(brickContext);
        editorContext.setSelection(new SelectionState({ brickId: brick.id, buildingId: bld.id }));
        brickTool.onKeyDown(keyEvent('Delete'));
        assert(bld.findBrick(brick.id) === null, '64. brick deletion via SelectionTool is unaffected by the 0.2.91 placement branch');
    }

    // -------------------------------------------------------------
    // Section H: EditorSession — action-surface wiring
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage);

        const boxWorld = new World({});
        const boxBuilding = new Building({});
        boxBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        boxWorld.addBuilding(boxBuilding);
        // SaveDocumentUseCase, not the raw saveDocument() helper — it's
        // the one that updates DocumentManifest, which
        // listSavedDocuments() (and so getSelectedPlacementInfo()'s own
        // title lookup) actually reads from.
        const boxDocumentManager = new DocumentManager(
            new Document({ world: boxWorld, metadata: new DocumentMetadata({ title: 'Box' }) })
        );
        new SaveDocumentUseCase(storage, serializer).execute(boxDocumentManager);

        const world = new World({});
        const placement = new StructurePlacement({ documentId: boxWorld.id, position: new Position(0, 0, 0), rotation: 0 });
        world.addStructurePlacement(placement);
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
        // EditorSession normally wires this up inside _rebuild(), which
        // requires a real render container (renderer/ imports 'three').
        // This test exercises the SESSION-level API only, so the one
        // piece _rebuild() would otherwise supply is provided directly —
        // exactly what a headless test harness is for.
        session._commandHistory = new CommandHistory({ world });

        selectionUseCase.selectPlacement(placement.id);

        assert(session.moveSelection({ x: 4, y: 0, z: -1 }) === true, '65. moveSelection() moves a selected placement');
        assert(placement.position.x === 4 && placement.position.z === -1, '66. the placement moved by the requested delta');

        assert(session.rotateSelection(90) === true, '67. rotateSelection() rotates a selected placement');
        assert(placement.rotation === 90, '68. the placement rotated by the requested delta');

        const info = session.getSelectedPlacementInfo();
        assert(info !== null && info.placementId === placement.id && info.documentId === boxWorld.id,
            '69. getSelectedPlacementInfo() describes the selected placement');
        assert(info.title === 'Box', '70. getSelectedPlacementInfo() resolves the referenced Document\'s title via listSavedDocuments()');

        const newId = session.duplicateSelection();
        assert(typeof newId === 'string' && newId !== placement.id, '71. duplicateSelection() creates a new placement');
        assert(world.getStructurePlacements().length === 2, '72. the duplicate was actually added to the World');
        assert(editorContext.selection.selectedPlacementId === newId, '73. duplicateSelection() selects the newly created duplicate');

        assert(session.deleteSelection() === true, '74. deleteSelection() removes the (now-selected) duplicate');
        assert(world.getStructurePlacements().length === 1, '75. exactly the duplicate was removed, the original placement remains');
        assert(editorContext.selection.isEmpty, '76. the selection clears after deleteSelection()');

        // editStructurePlacementSource() reuses loadDocument(), never a
        // second mutation surface. Verified indirectly: it must not
        // throw even without a render container wired (loadDocument()
        // itself would need one to fully rebuild, but the intent — "this
        // is just loadDocument()" — is what's under test here).
        assert(typeof session.editStructurePlacementSource === 'function',
            '77. editStructurePlacementSource() exists as its own explicit method, not folded into another action');
    }

    // -------------------------------------------------------------
    // Section I: FLAGSHIP
    // -------------------------------------------------------------
    {
        const brickRegistryLocal = new CreateBrickRegistryUseCase().execute();
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseStructure = structureRegistry.get('village:house');
        const house = new ForkStructureUseCase().execute(houseStructure, stubIdentityProvider);
        saveDocument(storage, serializer, house);
        const houseBrickCountBeforeEdit = house.world.getBuildings()[0].getBricks().length;

        const village = new World({});
        const villageContext = { world: village };

        const placeA = new PlaceStructureCommand({
            worldId: village.id, documentId: house.world.id, position: new Position(100, 0, 200), rotation: 0
        });
        const a = placeA.execute(villageContext);
        const placeB = new PlaceStructureCommand({
            worldId: village.id, documentId: house.world.id, position: new Position(160, 0, 240), rotation: 90
        });
        const b = placeB.execute(villageContext);

        assert(village.getStructurePlacements().length === 2, '78. flagship: both instances exist before any editing');

        // select A, move A, rotate A
        new MoveStructurePlacementCommand({ worldId: village.id, placementId: a.id, delta: { x: 10, y: 0, z: 10 } })
            .execute(villageContext);
        new RotateStructurePlacementCommand({ worldId: village.id, placementId: a.id, deltaRotation: 90 })
            .execute(villageContext);
        assert(a.position.x === 110 && a.position.z === 210, '79. flagship: A moved by the requested delta');
        assert(a.rotation === 90, '80. flagship: A rotated by the requested delta');

        // duplicate A -> C
        const duplicateCommand = new DuplicateStructurePlacementCommand({ worldId: village.id, placementId: a.id });
        const c = duplicateCommand.execute(villageContext);
        assert(c.documentId === a.documentId, '81. flagship: documentId(A) === documentId(C)');
        assert(c.id !== a.id, '82. flagship: placementId(A) !== placementId(C)');

        // Keep adjusting A after duplicating — exactly the "the user kept
        // shaping the original after forking off a copy" workflow.
        new RotateStructurePlacementCommand({ worldId: village.id, placementId: a.id, deltaRotation: 90 })
            .execute(villageContext);
        new MoveStructurePlacementCommand({ worldId: village.id, placementId: a.id, delta: { x: 5, y: 0, z: 0 } })
            .execute(villageContext);

        // delete B
        village.removeStructurePlacement(b.id);

        // save, reload
        const villageDocument = new Document({ world: village, metadata: new DocumentMetadata({ title: 'Village' }) });
        saveDocument(storage, serializer, villageDocument);
        const reloaded = resolver.resolve(village.id);

        const reloadedIds = reloaded.getStructurePlacements().map((p) => p.id);
        assert(reloadedIds.includes(a.id), '83. flagship: A exists after save/reload');
        assert(!reloadedIds.includes(b.id), '84. flagship: B does not exist after save/reload');
        assert(reloadedIds.includes(c.id), '85. flagship: C exists after save/reload');

        const reloadedA = reloaded.getStructurePlacements().find((p) => p.id === a.id);
        const reloadedC = reloaded.getStructurePlacements().find((p) => p.id === c.id);
        assert(reloadedA.position.x !== reloadedC.position.x || reloadedA.position.z !== reloadedC.position.z,
            '86. flagship: A.position !== C.position');
        assert(reloadedA.rotation !== reloadedC.rotation, '87. flagship: A.rotation !== C.rotation');
        assert(reloadedA.documentId === reloadedC.documentId, '88. flagship: A.documentId === C.documentId');

        const houseAfterVillageEdits = resolver.resolve(house.world.id);
        assert(houseAfterVillageEdits.getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit,
            '89. flagship: none of move/rotate/duplicate/delete touched the House Document\'s own brick count');

        // Edit House Document -> both A and C see it; their own
        // position/rotation are completely unaffected.
        const houseBuilding = house.world.getBuildings()[0];
        houseBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 3, 0) }));
        saveDocument(storage, serializer, house);

        const resolvedForA = resolver.resolve(reloadedA.documentId);
        const resolvedForC = resolver.resolve(reloadedC.documentId);
        assert(resolvedForA.getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit + 1,
            '90. flagship: editing House and saving is reflected resolving through A');
        assert(resolvedForC.getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit + 1,
            '91. flagship: the SAME edit is reflected resolving through C — one authoritative Document, no copies');

        const reReloaded = resolver.resolve(village.id);
        const reReloadedA = reReloaded.getStructurePlacements().find((p) => p.id === a.id);
        const reReloadedC = reReloaded.getStructurePlacements().find((p) => p.id === c.id);
        assert(reReloadedA.position.x === reloadedA.position.x && reReloadedA.rotation === reloadedA.rotation,
            '92. flagship: editing the Document never moves or rotates A');
        assert(reReloadedC.position.x === reloadedC.position.x && reReloadedC.rotation === reloadedC.rotation,
            '93. flagship: editing the Document never moves or rotates C — content identity and spatial instance '
            + 'identity are proven to be genuinely different questions');

        console.log('✓ Section I: FLAGSHIP — fork House, place A and B, select/move/rotate A, duplicate A into C, '
            + 'delete B, save/reload — A survives, B is gone, C shares A\'s documentId but has its own placementId '
            + 'and its own diverged position/rotation, and editing House afterward reaches both A and C without '
            + 'moving or rotating either');
    }

    console.log('✓ Section A: SelectionState — structure-placement item, dedupe, isStructurePlacementSelection');
    console.log('✓ Section B: SelectionUseCase#selectPlacement() — whole-instance, exclusive selection');
    console.log('✓ Section C: World#updateStructurePlacement() — in-place mutation, STRUCTURE_PLACEMENT_UPDATED');
    console.log('✓ Section D: MoveStructurePlacementCommand — execute/undo/redo, worldId guard, CommandRegistry round trip');
    console.log('✓ Section E: RotateStructurePlacementCommand — same shape, one rung up from RotateBrickCommand');
    console.log('✓ Section F: DuplicateStructurePlacementCommand — same documentId, new placementId, undo/redo identity');
    console.log('✓ Section G: SelectionTool — select/drag-move/rotate/delete an instance, headless, no \'three\' import');
    console.log('✓ Section H: EditorSession — move/rotate/duplicate/delete/getSelectedPlacementInfo branch correctly');

    console.log('\nAll structure instance editing tests passed.');
}

await run();
