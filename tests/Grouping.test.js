import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { Group } from '../core/Group.js';
import { DomainEvent } from '../core/events/Event.js';
import { EventBus } from '../core/events/EventBus.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateGroupCommand } from '../application/commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from '../application/commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from '../application/commands/RenameGroupCommand.js';
import { AddToGroupCommand } from '../application/commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from '../application/commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from '../application/commands/DuplicateGroupCommand.js';
import { PasteBricksCommand } from '../application/commands/PasteBricksCommand.js';
import { SpatialClipboardState } from '../application/spatial-state/SpatialClipboardState.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
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

function assertThrows(fn, expectedMessage, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        assert(e.message.includes(expectedMessage), `${message}: ${e.message}`);
    }
}

function createWorldWithBricks(specs) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = [];
    for (const spec of specs) {
        const brick = new Brick({
            id: spec.id,
            definitionId: spec.definitionId || 'core:cube',
            position: spec.position,
            rotation: spec.rotation || 0
        });
        building.addBrick(brick);
        ids.push(brick.id);
    }
    world.addBuilding(building);
    return { world, building, ids };
}

// ---------------------------------------------------------------------
// 1. Group domain model, World mediation, events, serialization
// ---------------------------------------------------------------------

{
    const events = [];
    const bus = new EventBus();
    bus.subscribe(DomainEvent.GROUP_ADDED, () => events.push('added'));
    bus.subscribe(DomainEvent.GROUP_UPDATED, () => events.push('updated'));
    bus.subscribe(DomainEvent.GROUP_REMOVED, () => events.push('removed'));

    const { world, building, ids: [a, b, c] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    // Reattach with an event bus.
    const liveWorld = new World({ id: world.id, eventBus: bus });
    liveWorld.addBuilding(building);

    const group = new Group({ name: 'Walls', brickIds: [a, b] });
    liveWorld.addGroup(group);
    assert(events.join(',') === 'added', 'GroupAdded fired'); // Was 'added,added'
    assert(liveWorld.getGroups().length === 1, 'group stored');
    assert(liveWorld.getGroupsContainingBrick(a).length === 1, 'brick resolves to its group');

    assert(liveWorld.addMemberToGroup(group.id, c) === true, 'member added');
    assert(liveWorld.addMemberToGroup(group.id, c) === false, 'duplicate membership rejected');
    assert(group.memberCount === 3, 'membership is a set');

    liveWorld.renameGroup(group.id, 'Outer Walls');
    assert(group.name === 'Outer Walls', 'rename applied');

    assert(liveWorld.removeMemberFromGroup(group.id, c) === true, 'member removed');
    assert(group.memberCount === 2, 'membership shrunk');

    // Referential membership: deleting a brick leaves the id referenced,
    // but resolution skips it.
    liveWorld.removeBrickFromBuilding(building.id, b);
    const resolved = liveWorld.getGroupBricks(group.id);
    assert(resolved.length === 1 && resolved[0].id === a, 'resolution skips deleted bricks');

    // Serialization roundtrip + backward compatibility.
    const json = liveWorld.toJSON();
    assert(json.groups.length === 1, 'groups serialize with the world');
    const restored = World.fromJSON(json);
    assert(restored.getGroups().length === 1, 'groups deserialize');
    assert(restored.getGroup(group.id).name === 'Outer Walls', 'group data preserved');
    const legacy = { ...json };
    delete legacy.groups;
    assert(World.fromJSON(legacy).getGroups().length === 0, 'pre-0.1.43 worlds load with zero groups');

    console.log('✓ Group domain model, World mediation, events, serialization');
}

// ---------------------------------------------------------------------
// 2. CreateGroupCommand: identity contract, atomicity, replay identity
// ---------------------------------------------------------------------

{
    const registry = new CreateCommandRegistryUseCase().execute();
    const { world, ids: [a, b, c] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    const command = new CreateGroupCommand({ worldId: world.id, brickIds: [a, b], name: 'Walls' });
    assert(!command.canUndo(), 'cannot undo before execute');

    command.execute({ world });
    const groupId = command.executedGroupId;
    assert(world.getGroups().length === 1, 'group created');
    assert(world.getGroup(groupId).name === 'Walls', 'group name applied');

    command.undo({ world });
    assert(world.getGroups().length === 0, 'undo removes the group');
    command.execute({ world });
    assert(command.executedGroupId === groupId, 'redo recreates the same group identity');

    // Serialized roundtrip preserves identity.
    const restored = registry.fromJSON(command.toJSON());
    restored.undo({ world });
    restored.execute({ world });
    assert(restored.executedGroupId === groupId, 'restored command keeps the group identity');

    // Atomic against missing bricks.
    const failing = new CreateGroupCommand({ worldId: world.id, brickIds: [a, 'missing-brick'] });
    assertThrows(() => failing.execute({ world }), 'not found', 'missing brick rejected');
    assert(world.getGroups().length === 1, 'failed create leaves the world untouched');

    console.log('✓ CreateGroupCommand identity contract and atomicity');
}

// ---------------------------------------------------------------------
// 3. Delete / Rename / Add / Remove group commands
// ---------------------------------------------------------------------

{
    const { world, ids: [a, b, c] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    let group = new Group({ name: 'Walls', brickIds: [a, b] });
    world.addGroup(group);

    // Delete restores the ORIGINAL identity and membership.
    const del = new DeleteGroupCommand({ worldId: world.id, groupId: group.id });
    del.execute({ world });
    assert(world.getGroups().length === 0, 'delete removes the group');
    del.undo({ world });
    group = world.getGroup(group.id);
    assert(world.getGroup(group.id) !== null, 'undo restores the original group id');
    assert(world.getGroup(group.id).brickIds.join(',') === [a, b].join(','), 'membership restored');

    // Rename snapshots the previous name.
    const rename = new RenameGroupCommand({ worldId: world.id, groupId: group.id, name: 'Facade' });
    rename.execute({ world });
    assert(group.name === 'Facade', 'rename applied');
    rename.undo({ world });
    assert(group.name === 'Walls', 'rename undone');

    // Add records the ACTUAL effect (b already a member).
    const add = new AddToGroupCommand({ worldId: world.id, groupId: group.id, brickIds: [b, c] });
    add.execute({ world });
    assert(JSON.stringify(add.addedBrickIds) === JSON.stringify([c]), 'only actually-added ids recorded');
    add.undo({ world });
    assert(group.hasMember(b) && !group.hasMember(c), 'undo removes exactly what was added');

    // Remove mirrors add.
    const remove = new RemoveFromGroupCommand({ worldId: world.id, groupId: group.id, brickIds: [a, c] });
    remove.execute({ world });
    assert(JSON.stringify(remove.removedBrickIds) === JSON.stringify([a]), 'only actually-removed ids recorded');
    remove.undo({ world });
    assert(group.hasMember(a), 'undo re-adds exactly what was removed');

    console.log('✓ Delete / Rename / Add / Remove group commands');
}

// ---------------------------------------------------------------------
// 4. DuplicateGroupCommand: fresh identities everywhere
// ---------------------------------------------------------------------

{
    const registry = new CreateCommandRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0), rotation: 90 },
        { position: new Position(2, 0.5, 0) }
    ]);
    const source = new Group({ name: 'Tower', brickIds: [a, b] });
    world.addGroup(source);

    const dup = new DuplicateGroupCommand({ worldId: world.id, groupId: source.id });
    dup.execute({ world });

    assert(world.getGroups().length === 2, 'duplicate creates a second group');
    const copy = world.getGroup(dup.executedGroupId);
    assert(copy.id !== source.id, 'new group identity');
    assert(copy.name === 'Copy of Tower', 'copy named from source');
    assert(building.getBricks().length === 4, 'bricks copied');
    const newBrickIds = dup.executedBrickIds;
    assert(newBrickIds.length === 2 && newBrickIds.every((id) => id !== a && id !== b), 'new brick identities');
    assert(JSON.stringify(copy.brickIds.sort()) === JSON.stringify([...newBrickIds].sort()), 'copy references the new bricks');
    const copiedBrick = building.findBrick(newBrickIds[0]);
    assert(copiedBrick.position.x === 2 && copiedBrick.rotation === 90, 'geometry copied with offset');
    assert(source.brickIds.join(',') === [a, b].join(','), 'source group never mutated');

    dup.undo({ world });
    assert(world.getGroups().length === 1 && building.getBricks().length === 2, 'undo removes exactly the duplicate');
    dup.execute({ world });
    assert(JSON.stringify(dup.executedBrickIds) === JSON.stringify(newBrickIds), 'redo recreates the same identities');

    const restored = registry.fromJSON(dup.toJSON());
    restored.undo({ world });
    restored.execute({ world });
    assert(restored.executedGroupId === dup.executedGroupId, 'serialized duplicate keeps identities');

    console.log('✓ DuplicateGroupCommand fresh-identity semantics');
}

// ---------------------------------------------------------------------
// 5. Group-aware clipboard: intent only, never ids
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const copyUseCase = new CopySelectionUseCase(brickRegistry);
    const pasteUseCase = new PasteClipboardUseCase();

    const { world, building, ids: [a, b, c] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    world.addGroup(new Group({ name: 'Walls', brickIds: [a, b] }));
    const document = new Document({ world, metadata: new DocumentMetadata() });

    // Full coverage -> group travels as intent.
    const fullSelection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    const clipboard = copyUseCase.execute(fullSelection, document);
    assert(clipboard.count === 2, 'clipboard carries the bricks');
    assert(clipboard.groups.length === 1, 'fully-covered group travels with the clipboard');
    assert(clipboard.groups[0].name === 'Walls', 'group name preserved');
    assert(JSON.stringify(clipboard.groups[0].memberIndices) === JSON.stringify([0, 1]), 'members referenced by index');
    const serialized = JSON.stringify(clipboard);
    for (const id of [a, b, c, ...world.getGroups().map((g) => g.id)]) {
        assert(!serialized.includes(id), 'clipboard never carries any id');
    }

    // Partial coverage -> plain bricks only.
    const partialSelection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [{ type: 'brick', buildingId: building.id, brickId: a }]
    });
    assert(copyUseCase.execute(partialSelection, document).groups.length === 0, 'partial group not copied');

    // Paste recreates bricks AND the carried group with fresh identities.
    const command = pasteUseCase.execute(clipboard, {
        worldId: world.id,
        buildingId: building.id,
        position: { x: 10, y: 0, z: 10 }
    });
    command.execute({ world });
    assert(building.getBricks().length === 5, 'pasted bricks added');
    assert(world.getGroups().length === 2, 'pasted group created');
    const pastedGroup = world.getGroup(command.executedGroupIds[0]);
    assert(pastedGroup.name === 'Walls', 'pasted group keeps the name');
    assert(pastedGroup.brickIds.every((id) => id !== a && id !== b), 'pasted group references only new bricks');

    command.undo({ world });
    assert(building.getBricks().length === 3 && world.getGroups().length === 1, 'undo removes pasted bricks and group');
    command.execute({ world });
    assert(world.getGroup(command.executedGroupIds[0]) !== null, 'redo recreates the pasted group identity');

    console.log('✓ group-aware clipboard: intent only, never ids');
}

// ---------------------------------------------------------------------
// 6. WorldNavigationSession: groups through the full lifecycle
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = new Document({
        world: (() => {
            const w = new World();
            const b = new Building({ creator: 'alice' });
            for (const x of [0, 2, 4]) {
                b.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, 0.5, 0) }));
            }
            w.addBuilding(b);
            return w;
        })(),
        metadata: new DocumentMetadata({ title: 'Group Session World', author: 'alice' })
    });
    storage.save(doc.world.id, serializer.serialize(doc));

    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const rendererCalls = [];
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
        addWorld: (world, id) => rendererCalls.push(['add', id]),
        removeWorld: (world, id) => rendererCalls.push(['remove', id]),
        selectBricks: () => {},
        clearSelection: () => {},
        clearHover: () => {},
        hidePreview: () => {}
    };
    nav._loadWorld(doc.world.id);
    nav._focusedDocumentId = doc.world.id;

    const world = nav.getDocument(doc.world.id).world;
    const buildingId = world.getBuildings()[0].id;
    const brickIds = world.getBuildings()[0].getBricks().map((b) => b.id);

    // Select two bricks and group them.
    nav._setSpatialSelection(SpatialSelectionState.bricks({
        documentId: doc.world.id,
        items: brickIds.slice(0, 2).map((brickId) => ({ type: 'brick', buildingId, brickId }))
    }));
    const groupId = nav.createGroupFromSelection('Walls');
    assert(groupId, 'group created from selection');
    assert(nav.getGroups().length === 1, 'session lists the group');
    assert(nav.getTimeline().some((op) => op.description === 'Group 2 Bricks'), 'timeline shows the group command');

    // Copy carries the group; paste recreates it.
    const clipboard = nav.copySelection();
    assert(clipboard.groups.length === 1, 'session copy is group-aware');
    assert(nav.pasteClipboard() === true, 'paste succeeds');
    assert(world.getGroups().length === 2, 'pasted group exists');
    assert(world.getBuildings()[0].getBricks().length === 5, 'pasted bricks exist');

    // Select/duplicate/rename/delete via session, all through history.
    assert(nav.selectGroup(groupId) === true, 'group selection resolves');
    assert(nav.getSpatialSelection().brickIds.length === 2, 'resolved members selected');
    const dupId = nav.duplicateGroup(groupId);
    assert(dupId && dupId !== groupId, 'duplicate returns a new group id');
    assert(nav.renameGroup(groupId, 'Outer Walls') === true, 'rename applied');
    assert(nav.getGroups().find((g) => g.id === groupId).name === 'Outer Walls', 'rename visible');
    assert(nav.deleteGroup(dupId) === true, 'delete applied');
    assert(nav.getGroups().length === 2, 'duplicated group deleted');

    // Undo walks back through every group operation.
    nav.undo(); // delete
    assert(nav.getGroups().length === 3, 'undo restores the deleted group');
    nav.undo(); // rename
    nav.undo(); // duplicate
    nav.undo(); // paste
    assert(world.getGroups().length === 1, 'undo removes pasted group');
    nav.undo(); // create
    assert(world.getGroups().length === 0, 'undo removes the created group');
    for (let i = 0; i < 5; i++) nav.redo();
    assert(world.getGroups().length === 2, 'redo rebuilds the group state');

    // Replay identity with groups in the history.
    const history = nav._commandHistories.get(world.id);
    const replayed = replayUseCase.execute(history);
    assert(JSON.stringify(replayed.toJSON()) === JSON.stringify(world.toJSON()), 'replay reproduces groups byte-for-byte');

    // Restore to the state right after the original create.
    nav.restoreHistoryAt(1);
    const restoredWorld = nav.getDocument(doc.world.id).world;
    assert(restoredWorld.getGroups().length === 1, 'restore reproduces the historical group state');
    assert(restoredWorld.getGroups()[0].name === 'Walls', 'restored group pre-rename');
    assert(nav.isDocumentDirty(doc.world.id), 'restored state dirty until saved');

    console.log('✓ session groups: create/copy/paste/duplicate/rename/delete/undo/replay/restore');
}

// ---------------------------------------------------------------------
// 7. Editor parity: same machinery, Editor selection shape
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) }
    ]);
    world.addGroup(new Group({ name: 'Base', brickIds: [a, b] }));
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Editor Parity' }) });

    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');
    const editorSession = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null
    });
    // Simulate the post-start state EditorView would have.
    editorSession._commandHistory = new CommandHistory({ world });

    editorContext.setSelection(new SelectionState({
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));

    const clipboard = editorSession.copySelection();
    assert(clipboard.count === 2, 'Editor copy through the shared use case');
    assert(clipboard.groups.length === 1 && clipboard.groups[0].name === 'Base', 'Editor copy is group-aware');
    assert(editorSession.commandHistory.getCursor() === 0, 'copy created no history entry');

    assert(editorSession.pasteClipboard() === true, 'Editor paste succeeds');
    assert(building.getBricks().length === 4, 'Editor paste added bricks');
    assert(world.getGroups().length === 2, 'Editor paste recreated the group');
    assert(editorSession.commandHistory.getCursor() === 1, 'paste is one history entry');
    assert(editorContext.selection.brickIds.length === 2, 'pasted bricks selected in the Editor');

    editorSession.commandHistory.undo();
    assert(building.getBricks().length === 2 && world.getGroups().length === 1, 'Editor paste fully undoable');

    console.log('✓ Editor copy/paste parity through the shared machinery');
}

console.log('\nAll grouping tests passed.');
