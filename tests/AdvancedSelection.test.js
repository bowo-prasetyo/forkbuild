import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { EventBus } from '../core/events/EventBus.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { EditorContext } from '../application/EditorContext.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// ---------------------------------------------------------------------
// Helpers & stubs
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubLayoutProvider = {
    getPosition: () => new WorldPosition(0, 0, 0),
    findVisibleDocuments: () => []
};

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createDocumentWithBricks(count) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = [];
    for (let i = 0; i < count; i++) {
        const brick = new Brick({
            definitionId: 'core:cube',
            position: new Position(i * 2, 0.5, 0)
        });
        building.addBrick(brick);
        ids.push(brick.id);
    }
    world.addBuilding(building);
    return {
        document: new Document({
            world,
            metadata: new DocumentMetadata({ title: 'Selection Test', author: 'tester' })
        }),
        building,
        ids
    };
}

function createEditorSession(document) {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new EditorContext();
    const selectionUseCase = new SelectionUseCase(editorContext);
    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager: (() => {
            const { DocumentManager } = { DocumentManager: null }; // placeholder, replaced below
            return null;
        })(),
        selectionUseCase,
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null
    });
    return { session, editorContext, selectionUseCase };
}

// ---------------------------------------------------------------------
// 1. Selection state semantics: union add, toggle, dedupe
// ---------------------------------------------------------------------

{
    const single = SpatialSelectionState.brick({ documentId: 'doc', buildingId: 'b', brickId: 'x' });
    const added = single.addBrick({ documentId: 'doc', buildingId: 'b', brickId: 'y' });
    assert(added.brickIds.length === 2, 'addBrick unions');
    const addedAgain = added.addBrick({ documentId: 'doc', buildingId: 'b', brickId: 'y' });
    assert(addedAgain.brickIds.length === 2, 'addBrick is idempotent');
    const toggled = added.toggleBrick({ documentId: 'doc', buildingId: 'b', brickId: 'x' });
    assert(toggled.brickIds.length === 1 && toggled.brickIds[0] === 'y', 'toggleBrick removes');
    const crossed = added.addBrick({ documentId: 'other', buildingId: 'b2', brickId: 'z' });
    assert(crossed.documentId === 'other' && crossed.brickIds.length === 1, 'cross-document add restarts selection');

    const deduped = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [
            { type: 'brick', buildingId: 'b', brickId: 'x' },
            { type: 'brick', buildingId: 'b', brickId: 'x' },
            { type: 'brick', buildingId: 'b', brickId: 'y' }
        ]
    });
    assert(deduped.brickIds.length === 2, 'bricks() dedupes');

    const editorBase = new SelectionState({ brickId: 'x', buildingId: 'b' });
    const editorAdded = editorBase.add('y', 'b');
    assert(editorAdded.brickIds.length === 2, 'SelectionState.add unions');
    assert(editorAdded.add('y', 'b').brickIds.length === 2, 'SelectionState.add is idempotent');
    const editorItemsDeduped = new SelectionState({
        items: [
            { type: 'brick', buildingId: 'b', brickId: 'x' },
            { type: 'brick', buildingId: 'b', brickId: 'x' }
        ]
    });
    assert(editorItemsDeduped.brickIds.length === 1, 'SelectionState constructor dedupes');
    console.log('✓ selection state semantics: union add, toggle, dedupe');
}

// ---------------------------------------------------------------------
// 2. EditorSession group surface + zero-history selection contract
// ---------------------------------------------------------------------

{
    const { document, building, ids } = createDocumentWithBricks(4);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new EditorContext();
    const selectionUseCase = new SelectionUseCase(editorContext);
    const { DocumentManager } = await import('../application/DocumentManager.js');
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase,
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null
    });
    // Simulate the post-start state EditorView would have.
    session._commandHistory = new CommandHistory({ world: document.world });
    const history = session._commandHistory;

    // selectAll: session state only.
    assert(session.selectAll() === true, 'selectAll succeeds');
    assert(editorContext.selection.brickIds.length === 4, 'selectAll selects every brick');
    assert(history.getCursor() === 0, 'selectAll creates no history entry');

    // Create a group from the full selection.
    const groupId = session.createGroupFromSelection('Everything');
    assert(groupId, 'group created');
    assert(session.getGroups().length === 1, 'group listed');
    assert(history.getCursor() === 1, 'create group is one history entry');
    assert(history.getExecutedCommands()[0].type === 'create-group', 'create-group command used');

    // Select group: resolved members, ZERO new history entries.
    selectionUseCase.clear();
    assert(session.selectGroup(groupId) === true, 'selectGroup succeeds');
    assert(editorContext.selection.brickIds.length === 4, 'selectGroup resolves members');
    assert(history.getCursor() === 1, 'selectGroup creates no history entry');

    // Add/remove membership through commands.
    selectionUseCase.clear();
    selectionUseCase.select(ids[0], building.id);
    selectionUseCase.add(ids[1], building.id);
    const smallGroupId = session.createGroupFromSelection('Pair');
    assert(session.getGroups().length === 2, 'second group created');
    selectionUseCase.select(ids[2], building.id);
    assert(session.addToGroupWithSelection(smallGroupId) === true, 'add to group succeeds');
    assert(document.world.getGroup(smallGroupId).memberCount === 3, 'membership grew');
    history.undo();
    assert(document.world.getGroup(smallGroupId).memberCount === 2, 'undo removes the added member');
    history.redo();
    assert(document.world.getGroup(smallGroupId).memberCount === 3, 'redo re-adds it');

    selectionUseCase.select(ids[2], building.id);
    assert(session.removeFromGroupWithSelection(smallGroupId) === true, 'remove from group succeeds');
    assert(document.world.getGroup(smallGroupId).memberCount === 2, 'membership shrunk');
    history.undo();
    assert(document.world.getGroup(smallGroupId).memberCount === 3, 'undo restores removed member');

    // Rename / duplicate / delete through commands.
    session.renameGroup(smallGroupId, 'Renamed Pair');
    assert(document.world.getGroup(smallGroupId).name === 'Renamed Pair', 'rename applied');
    history.undo();
    assert(document.world.getGroup(smallGroupId).name === 'Pair', 'rename undone');
    history.redo();

    const dupId = session.duplicateGroup(smallGroupId);
    assert(dupId && dupId !== smallGroupId, 'duplicate creates a new group');
    assert(document.world.getGroup(dupId).name === 'Copy of Renamed Pair', 'duplicate named from source');
    const dupBrickIds = document.world.getGroup(dupId).brickIds;
    assert(dupBrickIds.every((id) => !document.world.getGroup(smallGroupId).hasMember(id)), 'duplicate uses fresh brick identities');
    history.undo();
    assert(document.world.getGroup(dupId) === null, 'duplicate undone');
    history.redo();

    session.deleteGroup(dupId);
    assert(document.world.getGroup(dupId) === null, 'delete removes the group');
    history.undo();
    assert(document.world.getGroup(dupId) !== null, 'delete undone restores original id');

    // Marquee guard without a renderer.
    assert(session.marqueeSelect({ x0: 0, y0: 0, x1: 1, y1: 1 }) === false, 'marquee guarded without renderer');

    console.log('✓ EditorSession group surface + zero-history selection contract');
}

// ---------------------------------------------------------------------
// 3. WorldNavigationSession: pick modes, selectAll, marquee, −Sel
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const source = createDocumentWithBricks(4);
    storage.save(source.document.world.id, serializer.serialize(source.document));

    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const rendererCalls = [];
    const pickResults = [];
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        replayDocumentUseCase: replayUseCase,
        restoreHistoryStateUseCase: new RestoreHistoryStateUseCase(replayUseCase)
    });
    nav._eventBus = new EventBus();
    nav._session = {
        addWorld: (world, id) => rendererCalls.push(['add', id]),
        removeWorld: (world, id) => rendererCalls.push(['remove', id]),
        selectBricks: () => {},
        clearSelection: () => {},
        clearHover: () => {},
        hidePreview: () => {},
        pick: () => pickResults.shift() || null,
        pickRectangle: (x0, y0, x1, y1) => nav._stubRectangleHits || [],
        setControlsEnabled: (enabled) => rendererCalls.push(['controls', enabled])
    };
    nav._loadWorld(source.document.world.id);
    nav._focusedDocumentId = source.document.world.id;

    const docId = source.document.world.id;
    const buildingId = source.building.id;
    const [idA, idB, idC, idD] = source.ids;
    const history = nav._commandHistories.get(source.document.world.id);

    // Pick modes: replace / toggle / additive.
    pickResults.push({ documentId: docId, buildingId, brickId: idA });
    nav.pick(0, 0, {});
    assert(nav.getSpatialSelection().brickIds.join(',') === idA, 'click replaces selection');

    pickResults.push({ documentId: docId, buildingId, brickId: idB });
    nav.pick(0, 0, { additive: true });
    assert(nav.getSpatialSelection().brickIds.join(',') === `${idA},${idB}`, 'shift adds to selection');

    pickResults.push({ documentId: docId, buildingId, brickId: idA });
    nav.pick(0, 0, { toggle: true });
    assert(nav.getSpatialSelection().brickIds.join(',') === idB, 'ctrl toggles out of selection');
    assert(history.getCursor() === 0, 'click selection modes create no history entries');

    // Select all.
    assert(nav.selectAll() === true, 'selectAll succeeds');
    assert(nav.getSpatialSelection().brickIds.length === 4, 'selectAll selects every brick');
    assert(history.getCursor() === 0, 'selectAll creates no history entry');

    // Marquee: replace and additive, via the stubbed renderer.
    nav._stubRectangleHits = [
        { documentId: docId, buildingId, brickId: idA },
        { documentId: docId, buildingId, brickId: idB }
    ];
    assert(nav.marqueeSelect({ x0: 0, y0: 0, x1: 10, y1: 10 }) === true, 'marquee succeeds');
    assert(nav.getSpatialSelection().brickIds.join(',') === `${idA},${idB}`, 'marquee replaces selection');
    nav._stubRectangleHits = [{ documentId: docId, buildingId, brickId: idC }];
    assert(nav.marqueeSelect({ x0: 0, y0: 0, x1: 10, y1: 10 }, { additive: true }) === true, 'additive marquee succeeds');
    assert(nav.getSpatialSelection().brickIds.join(',') === `${idA},${idB},${idC}`, 'additive marquee unions');
    assert(history.getCursor() === 0, 'marquee creates no history entries');

    // Empty marquee clears (replace mode).
    nav._stubRectangleHits = [];
    nav.marqueeSelect({ x0: 0, y0: 0, x1: 1, y1: 1 });
    assert(nav.getSpatialSelection().isEmpty, 'empty marquee clears selection');

    // Camera gating delegation.
    nav.setControlsEnabled(false);
    nav.setControlsEnabled(true);
    assert(rendererCalls.some(([op, v]) => op === 'controls' && v === false), 'controls disabled delegated');
    assert(rendererCalls.some(([op, v]) => op === 'controls' && v === true), 'controls enabled delegated');

    // −Sel: remove selection from group through the existing command.
    nav._stubRectangleHits = [
        { documentId: docId, buildingId, brickId: idA },
        { documentId: docId, buildingId, brickId: idB },
        { documentId: docId, buildingId, brickId: idC }
    ];
    nav.marqueeSelect({ x0: 0, y0: 0, x1: 10, y1: 10 });
    const groupId = nav.createGroupFromSelection('Trio');
    assert(groupId, 'group created from marquee selection');
    nav._stubRectangleHits = [{ documentId: docId, buildingId, brickId: idC }];
    nav.marqueeSelect({ x0: 0, y0: 0, x1: 10, y1: 10 });
    assert(nav.removeFromGroupWithSelection(groupId) === true, 'removeFromGroupWithSelection succeeds');
    const group = nav.getDocument(docId).world.getGroup(groupId);
    assert(group.memberCount === 2 && !group.hasMember(idC), 'member removed');
    nav.undo();
    assert(nav.getDocument(docId).world.getGroup(groupId).memberCount === 3, 'undo restores membership');

    console.log('✓ WorldNavigationSession pick modes, selectAll, marquee, remove-from-group');
}

console.log('\nAll advanced selection tests passed.');
