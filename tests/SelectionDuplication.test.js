import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { Group } from '../core/Group.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { EventBus } from '../core/events/EventBus.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
import { CreateStructureFromSelectionUseCase } from '../application/CreateStructureFromSelectionUseCase.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// 0.4.7 — Advanced Building & Structural Editing. This milestone's own
// concrete deliverable: "Duplicate a composed selection" (Ctrl/Cmd+D)
// for an ORDINARY loose brick selection, not just a structure placement.
// Multi-brick selection, group move/rotate as one TransformSelectionCommand,
// and batch delete-as-one-CompositeCommand already existed before this
// milestone (0.1.42-0.1.50) — see docs/Roadmap.md's own 0.4.7 section for
// why this is the one gesture that genuinely diverged between "the data
// model supports N bricks" and "the user can actually do it."
//
// Deliberately reuses CopySelectionUseCase + PasteClipboardUseCase rather
// than a new command class — geometrically, a duplicate IS a copy
// immediately pasted at an offset, so EditorSession#_duplicateBrickSelection()/
// WorldNavigationSession#_duplicateBrickSelection() just call the two
// existing use cases directly (never through copySelection()/
// pasteClipboard(), which would clobber the user's real clipboard).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const stubLayoutProvider = {
    getPosition: () => new WorldPosition(0, 0, 0),
    findVisibleDocuments: () => []
};

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createWorldWithBricks(count) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = [];
    for (let i = 0; i < count; i++) {
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(i * 2, 0.5, 0) });
        building.addBrick(brick);
        ids.push(brick.id);
    }
    world.addBuilding(building);
    return { world, building, ids };
}

// ---------------------------------------------------------------------
// 1. EditorSession: duplicate a loose multi-brick selection
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids } = createWorldWithBricks(3);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Dup Test', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });

    editorContext.setSelection(new SelectionState({
        items: ids.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));

    const newFirstId = session.duplicateSelection();
    assert(newFirstId, 'duplicateSelection returns a truthy id');
    assert(building.getBricks().length === 6, 'duplicate created 3 new bricks');
    assert(session.commandHistory.getCursor() === 1, 'duplicate is exactly ONE history entry');
    assert(session.commandHistory.getExecutedCommands()[0].type === 'paste-bricks', 'duplicate reuses PasteBricksCommand');

    const newIds = editorContext.selection.brickIds;
    assert(newIds.length === 3, 'the duplicate becomes the active selection');
    assert(newIds.every((id) => !ids.includes(id)), 'duplicate bricks have fresh identities');

    // Offset: every duplicate sits away from its source, none coincide.
    for (const brickId of newIds) {
        const brick = building.findBrick(brickId);
        assert(!ids.some((sourceId) => building.findBrick(sourceId).position.equals(brick.position)),
            'duplicated brick does not sit exactly on top of its source');
    }

    session.commandHistory.undo();
    assert(building.getBricks().length === 3, 'undo removes exactly the duplicate');
    assert(ids.every((id) => building.findBrick(id) !== null), 'undo leaves every original brick intact');
    session.commandHistory.redo();
    assert(building.getBricks().length === 6, 'redo recreates the duplicate');
    assert(newIds.every((id) => building.findBrick(id) !== null), 'redo restores the SAME duplicate identities');

    console.log('✓ EditorSession: duplicate a loose multi-brick selection — one command, fresh ids, undo/redo exact');
}

// ---------------------------------------------------------------------
// 2. EditorSession: duplicate is group-aware
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids } = createWorldWithBricks(2);
    world.addGroup(new Group({ name: 'Pair', brickIds: ids }));
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Dup Group Test' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });
    editorContext.setSelection(new SelectionState({
        items: ids.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));

    session.duplicateSelection();
    assert(world.getGroups().length === 2, 'a fully-covered group travels with the duplicate');
    const duplicateGroup = world.getGroups().find((g) => g.name === 'Pair' && g.id !== world.getGroups()[0].id) || world.getGroups()[1];
    assert(duplicateGroup.memberCount === 2, 'duplicated group has both members');
    assert(duplicateGroup.brickIds.every((id) => !ids.includes(id)), 'duplicated group uses fresh brick identities');

    console.log('✓ EditorSession: duplicate carries a fully-selected persistent Group with fresh membership');
}

// ---------------------------------------------------------------------
// 3. EditorSession: duplicate never touches the real clipboard
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids } = createWorldWithBricks(4);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Dup Clipboard Test' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });

    // The user explicitly copies bricks A/B.
    editorContext.setSelection(new SelectionState({
        items: [ids[0], ids[1]].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
    const explicitCopy = session.copySelection();
    assert(explicitCopy.count === 2, 'explicit copy captured 2 bricks');

    // Then selects and Ctrl+D's a DIFFERENT selection (C/D).
    editorContext.setSelection(new SelectionState({
        items: [ids[2], ids[3]].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
    assert(session.duplicateSelection(), 'duplicate of C/D succeeds');
    assert(building.getBricks().length === 6, 'duplicate added exactly 2 bricks');

    // A subsequent explicit Paste must still paste the ORIGINAL A/B copy,
    // not anything duplicateSelection() touched.
    editorContext.setSelection(SelectionState.empty());
    assert(session.paste() === true, 'explicit paste still works after an intervening duplicate');
    assert(building.getBricks().length === 8, 'paste added the originally-copied 2 bricks');

    console.log('✓ EditorSession: duplicateSelection() never clobbers this._clipboardState/_pasteCount');
}

// ---------------------------------------------------------------------
// 4. EditorSession: structure-placement duplicate still works (regression)
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const world = new World();
    const placement = new StructurePlacement({ documentId: 'source-doc', position: new Position(0, 0, 0), rotation: 0 });
    world.addStructurePlacement(placement);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Placement Dup Test' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });

    editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] }));
    const newPlacementId = session.duplicateSelection();
    assert(newPlacementId && newPlacementId !== placement.id, 'a structure-placement selection still duplicates the placement');
    assert(world.getStructurePlacement(newPlacementId).documentId === 'source-doc', 'duplicate references the SAME source document');
    assert(editorContext.selection.isStructurePlacementSelection
        && editorContext.selection.selectedPlacementId === newPlacementId, 'the new placement becomes selected');

    console.log('✓ EditorSession: duplicateSelection() still branches correctly for a structure-placement selection');
}

// ---------------------------------------------------------------------
// 5. WorldNavigationSession: duplicate a multi-brick selection
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const { world, building, ids } = createWorldWithBricks(3);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'World Dup Test', author: 'tester' }) });
    storage.save(document.world.id, serializer.serialize(document));

    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        replayDocumentUseCase: replayUseCase,
        restoreHistoryStateUseCase: new RestoreHistoryStateUseCase(replayUseCase),
        documentCloneService: null,
        copySelectionUseCase: new CopySelectionUseCase(new CreateBrickRegistryUseCase().execute()),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    nav._eventBus = new EventBus();
    nav._session = {
        addWorld: () => {},
        removeWorld: () => {},
        selectBricks: () => {},
        clearSelection: () => {},
        clearHover: () => {},
        hidePreview: () => {}
    };
    nav._loadWorld(document.world.id);
    nav._focusedDocumentId = document.world.id;

    const docId = document.world.id;
    const liveWorld = nav.getDocument(docId).world;
    const liveBuilding = liveWorld.getBuildings()[0];
    nav._setSpatialSelection(SpatialSelectionState.bricks({
        documentId: docId,
        items: ids.map((brickId) => ({ type: 'brick', buildingId: liveBuilding.id, brickId }))
    }));

    const history = nav._commandHistories.get(docId);
    const newId = nav.duplicateSelection();
    assert(newId, 'World View duplicateSelection returns a truthy id');
    assert(liveBuilding.getBricks().length === 6, 'World View duplicate added 3 fresh bricks');
    assert(history.getCursor() === 1, 'World View duplicate is exactly ONE history entry');

    const newSelection = nav.getSpatialSelection();
    assert(newSelection.brickIds.length === 3, 'the duplicate becomes World View\'s active selection');
    assert(newSelection.brickIds.every((id) => !ids.includes(id)), 'World View duplicate uses fresh brick identities');

    nav.undo();
    assert(liveBuilding.getBricks().length === 3, 'undo removes exactly the World View duplicate');
    nav.redo();
    assert(liveBuilding.getBricks().length === 6, 'redo recreates it');

    // Replay identity: a client that only ever sees the command stream
    // reconstructs byte-identical state.
    const replayed = replayUseCase.execute(history);
    assert(JSON.stringify(replayed.toJSON()) === JSON.stringify(liveWorld.toJSON()), 'replay reproduces the duplicate byte-for-byte');

    console.log('✓ WorldNavigationSession: duplicate a multi-brick selection — one command, fresh ids, replay-identical');
}

// ---------------------------------------------------------------------
// 6. WorldNavigationSession: a structure-placement selection cannot be
//    duplicated from World View (no placement-mutation authority there)
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const world = new World();
    const placement = new StructurePlacement({ documentId: 'some-doc', position: new Position(0, 0, 0), rotation: 0 });
    world.addStructurePlacement(placement);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'World Placement No-Dup Test' }) });
    storage.save(document.world.id, serializer.serialize(document));

    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        replayDocumentUseCase: replayUseCase,
        restoreHistoryStateUseCase: new RestoreHistoryStateUseCase(replayUseCase),
        documentCloneService: null,
        copySelectionUseCase: new CopySelectionUseCase(new CreateBrickRegistryUseCase().execute()),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    nav._eventBus = new EventBus();
    nav._session = {
        addWorld: () => {},
        removeWorld: () => {},
        selectBricks: () => {},
        clearSelection: () => {},
        clearHover: () => {},
        hidePreview: () => {}
    };
    nav._loadWorld(document.world.id);
    nav._focusedDocumentId = document.world.id;

    const liveWorld = nav.getDocument(document.world.id).world;
    nav._setSpatialSelection(SpatialSelectionState.placement({ documentId: document.world.id, placementId: placement.id }));
    const history = nav._commandHistories.get(document.world.id);

    assert(nav.duplicateSelection() === null, 'World View refuses to duplicate a structure-placement selection');
    assert(history.getCursor() === 0, 'the refusal creates no history entry');
    assert(liveWorld.getStructurePlacement(placement.id) !== null, 'the original placement is untouched');

    console.log('✓ WorldNavigationSession: a structure-placement selection stays a no-op for duplicateSelection() (selection there is inspection, not editing authority)');
}

// ---------------------------------------------------------------------
// 7. Capstone: duplicate participates in the ordinary 0.4.x creation
//    loop exactly like original content — select, duplicate, extract.
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids } = createWorldWithBricks(3);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Capstone', author: 'alice' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });

    // Select the original House-like shape, duplicate it in place.
    editorContext.setSelection(new SelectionState({
        items: ids.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
    session.duplicateSelection();
    const duplicateIds = editorContext.selection.brickIds;
    assert(duplicateIds.length === 3, 'duplicate selected');

    // Extract the DUPLICATE (not the original) into a reusable Structure —
    // proves a duplicate is ordinary, independent World content with no
    // special provenance the extraction pipeline needs to know about.
    const structure = new CreateStructureFromSelectionUseCase().execute(editorContext.selection, document, {
        registry: brickRegistry,
        name: 'Duplicated Cottage'
    });
    assert(structure && structure.bricks.length === 3, 'the duplicate extracts into a 3-brick Structure');
    assert(document.world.getBuildings()[0].getBricks().length === 6, 'extraction never mutates the source Document');

    console.log('✓ Capstone: a duplicated selection is ordinary World content — select, duplicate, extract, unaffected');
}

console.log('\nAll selection duplication tests passed.');
