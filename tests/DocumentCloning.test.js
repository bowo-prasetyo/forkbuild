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
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { PasteBricksCommand } from '../application/commands/PasteBricksCommand.js';
import { SpatialClipboardState } from '../application/spatial-state/SpatialClipboardState.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// ---------------------------------------------------------------------
// Test helpers & stubs
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) {
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        if (!this._data.has(name)) {
            return null;
        }
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
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

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

function createDocumentWithBricks(brickSpecs, title = 'Clone Test World') {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const spec of brickSpecs) {
        building.addBrick(new Brick({
            definitionId: spec.definitionId || 'core:cube',
            position: spec.position,
            rotation: spec.rotation || 0
        }));
    }
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice' })
    });
}

function createEmptyBuildingDocument() {
    const world = new World();
    world.addBuilding(new Building({ creator: 'alice' }));
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Flagship World', author: 'alice' })
    });
}

function createSession(storage, { replay = true } = {}) {
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const rendererCalls = [];
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase: new PublishDocumentUseCase(new LocalPublisherProvider(storage), stubIdentityProvider),
        replayDocumentUseCase: replay ? replayUseCase : null,
        restoreHistoryStateUseCase: replay ? new RestoreHistoryStateUseCase(replayUseCase) : null,
        identityProvider: stubIdentityProvider,
        documentCloneService: new DocumentCloneService(),
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
    return { nav, rendererCalls, replayUseCase };
}

// ---------------------------------------------------------------------
// 1. DocumentCloneService: fresh identities, preserved structure
// ---------------------------------------------------------------------

{
    const cloneService = new DocumentCloneService();
    const source = createDocumentWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0), rotation: 90 }
    ]);
    const sourceWorldId = source.world.id;
    const sourceBrickIds = source.world.getBuildings()[0].getBricks().map((b) => b.id);

    const clone = cloneService.execute(source);

    assert(clone.world.id !== sourceWorldId, 'clone has a new document identity');
    assert(clone.world.getBuildings()[0].id !== source.world.getBuildings()[0].id, 'clone has new building identity');
    const cloneBricks = clone.world.getBuildings()[0].getBricks();
    assert(cloneBricks.length === 2, 'structure preserved');
    for (const brick of cloneBricks) {
        assert(!sourceBrickIds.includes(brick.id), 'clone brick identities are fresh');
    }
    assert(cloneBricks[0].position.equals(new Position(0, 0.5, 0)), 'geometry preserved');
    assert(cloneBricks[1].rotation === 90, 'rotation preserved');
    assert(clone.metadata.title === 'Copy of Clone Test World', 'clone title');
    assert(clone.metadata.author === 'alice', 'clone keeps source author by default');
    assert(clone.metadata.parentDocumentId === sourceWorldId, 'lineage recorded by default');
    assert(source.world.id === sourceWorldId, 'source document untouched');
    assert(source.world.getBuildings()[0].getBricks().length === 2, 'source content untouched');

    // Explicit options.
    const unlinked = cloneService.execute(source, { title: 'Fresh Start', author: 'bob', parentDocumentId: null });
    assert(unlinked.metadata.title === 'Fresh Start', 'explicit title honored');
    assert(unlinked.metadata.author === 'bob', 'explicit author honored');
    assert(unlinked.metadata.parentDocumentId === null, 'lineage can be omitted');

    console.log('✓ DocumentCloneService: fresh identities, preserved structure, source untouched');
}

// ---------------------------------------------------------------------
// 2. ForkDocumentUseCase (storage path) regression
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const source = createDocumentWithBricks([{ position: new Position(0, 0.5, 0) }], 'Published Original');
    storage.save(source.world.id, serializer.serialize(source));

    const fork = new ForkDocumentUseCase(storage).execute(source.world.id, stubIdentityProvider);
    assert(fork.world.id !== source.world.id, 'fork has a new document identity');
    assert(fork.world.getBuildings()[0].getBricks()[0].id !== source.world.getBuildings()[0].getBricks()[0].id, 'fork brick identities are fresh');
    assert(fork.metadata.title === 'Fork of Published Original', 'fork title');
    assert(fork.metadata.author === 'alice', 'fork attributed to the current user');
    assert(fork.metadata.parentDocumentId === source.world.id, 'fork lineage');

    assertThrows(
        () => new ForkDocumentUseCase(storage).execute('missing-id'),
        'no document found',
        'fork of unknown document rejected'
    );
    console.log('✓ ForkDocumentUseCase storage path unchanged');
}

// ---------------------------------------------------------------------
// 3. CopySelectionUseCase: pivot-relative intent, never ids
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const copyUseCase = new CopySelectionUseCase(brickRegistry);
    const document = createDocumentWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(4, 0.5, 0), rotation: 90 }
    ]);
    const buildingId = document.world.getBuildings()[0].id;
    const brickIds = document.world.getBuildings()[0].getBricks().map((b) => b.id);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc-1',
        items: brickIds.map((brickId) => ({ type: 'brick', buildingId, brickId }))
    });

    const clipboard = copyUseCase.execute(selection, document);
    assert(clipboard.count === 3, 'clipboard carries the whole selection');
    assert(clipboard.origin.x === 2 && clipboard.origin.y === 0.5 && clipboard.origin.z === 0, 'origin is the selection pivot');
    const positions = clipboard.items.map((item) => `${item.position.x},${item.position.y},${item.position.z}`);
    assert(JSON.stringify(positions) === JSON.stringify(['-2,0,0', '0,0,0', '2,0,0']), 'pivot-relative geometry preserved');
    assert(clipboard.items[2].rotation === 90, 'rotation preserved');
    assert(clipboard.sourceDocumentId === 'doc-1', 'source metadata preserved');
    const serialized = JSON.stringify(clipboard);
    for (const id of brickIds) {
        assert(!serialized.includes(id), 'clipboard never carries brick identity');
    }

    assert(copyUseCase.execute(SpatialSelectionState.empty(), document).isEmpty, 'empty selection -> empty clipboard');
    assert(copyUseCase.execute(SpatialSelectionState.ground(new Position(0, 0, 0)), document).isEmpty, 'ground selection -> empty clipboard');
    console.log('✓ CopySelectionUseCase: pivot-relative intent, no identities');
}

// ---------------------------------------------------------------------
// 4. PasteBricksCommand: atomic, transactional, identity-preserving
// ---------------------------------------------------------------------

{
    const registry = new CreateCommandRegistryUseCase().execute();
    const world = new World();
    const building = new Building({ creator: 'tester' });
    world.addBuilding(building);
    const items = [
        { definitionId: 'core:cube', position: { x: 0, y: 0.5, z: 0 }, rotation: 0 },
        { definitionId: 'core:cube', position: { x: 2, y: 0.5, z: 0 }, rotation: 90 }
    ];
    const command = new PasteBricksCommand({
        worldId: world.id,
        buildingId: building.id,
        items,
        description: 'Paste 2 Bricks'
    });

    assert(!command.canUndo(), 'cannot undo before execute');
    command.execute({ world });
    assert(building.getBricks().length === 2, 'paste adds every brick');
    const ids = command.executedBrickIds;
    assert(ids.length === 2 && ids[0] !== ids[1], 'pasted identities are unique');
    assert(command.canUndo(), 'undoable after execute');

    command.undo({ world });
    assert(building.getBricks().length === 0, 'undo removes the whole paste');
    command.execute({ world });
    assert(JSON.stringify(command.executedBrickIds) === JSON.stringify(ids), 'redo recreates the same identities');

    // Serialized roundtrip through the registry preserves identities.
    const restored = registry.fromJSON(command.toJSON());
    assert(restored.type === 'paste-bricks', 'registered command type');
    assert(restored.describe() === 'Paste 2 Bricks', 'description survives serialization');
    command.undo({ world });
    restored.execute({ world });
    assert(JSON.stringify(restored.executedBrickIds) === JSON.stringify(ids), 'restored command recreates the same identities');
    restored.undo({ world });
    assert(building.getBricks().length === 0, 'restored command undo works');

    // A fresh paste (no recorded ids) creates fresh identities — replay
    // elsewhere is a different paste, not a resurrection.
    const fresh = new PasteBricksCommand({ worldId: world.id, buildingId: building.id, items });
    fresh.execute({ world });
    for (const id of fresh.executedBrickIds) {
        assert(!ids.includes(id), 'fresh paste creates fresh identities');
    }

    // Transactional: nothing survives a mid-paste failure.
    const failing = new PasteBricksCommand({ worldId: world.id, buildingId: 'missing-building', items });
    const countBefore = building.getBricks().length;
    assertThrows(() => failing.execute({ world }), 'unknown building', 'paste into a missing building rejected');
    assert(building.getBricks().length === countBefore, 'failed paste leaves the world untouched');

    console.log('✓ PasteBricksCommand: atomic, transactional, identity-preserving');
}

// ---------------------------------------------------------------------
// 5. PasteClipboardUseCase: re-anchored intent -> one command
// ---------------------------------------------------------------------

{
    const clipboard = new SpatialClipboardState({
        items: [{ definitionId: 'core:cube', position: { x: -1, y: 0, z: 0 }, rotation: 45 }],
        origin: { x: 5, y: 0.5, z: 5 },
        sourceDocumentId: 'source-doc',
        copiedAt: new Date()
    });
    const command = new PasteClipboardUseCase().execute(clipboard, {
        worldId: 'world-1',
        buildingId: 'building-1',
        position: { x: 10, y: 0.5, z: 10 }
    });
    assert(command !== null, 'command produced');
    assert(command.type === 'paste-bricks', 'paste command type');
    assert(command.describe() === 'Paste 1 Brick', 'singular description');
    const item = command.items[0];
    assert(item.position.x === 9 && item.position.z === 10, 'relative geometry re-anchored at the paste position');
    assert(item.rotation === 45, 'rotation carried through');

    assert(new PasteClipboardUseCase().execute(SpatialClipboardState.empty(), {
        worldId: 'w', buildingId: 'b', position: { x: 0, y: 0, z: 0 }
    }) === null, 'empty clipboard produces no command');
    console.log('✓ PasteClipboardUseCase: one command from clipboard intent');
}

// ---------------------------------------------------------------------
// 6. Session clipboard flow: copy, paste, cascade, preview gating
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createDocumentWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(3, 0.5, 0) }
    ]);
    storage.save(doc.world.id, serializer.serialize(doc));

    const { nav } = createSession(storage);
    nav._loadWorld(doc.world.id);
    nav._focusedDocumentId = doc.world.id;
    nav._activeDocumentId = doc.world.id;

    assert(nav.copySelection().isEmpty, 'copy without selection is empty');

    const world = nav.getDocument(doc.world.id).world;
    const buildingId = world.getBuildings()[0].id;
    const originalIds = world.getBuildings()[0].getBricks().map((b) => b.id);
    nav._setSpatialSelection(SpatialSelectionState.bricks({
        documentId: doc.world.id,
        items: originalIds.map((brickId) => ({ type: 'brick', buildingId, brickId }))
    }));

    const clipboard = nav.copySelection();
    assert(clipboard.count === 2, 'selection copied');
    assert(clipboard.sourceDocumentId === doc.world.id, 'clipboard knows its source');
    const history = nav._commandHistories.get(world.id);
    assert(history.getCursor() === 0, 'copy created no history entry');

    assert(nav.pasteClipboard() === true, 'first paste succeeds');
    assert(history.getCursor() === 1, 'paste is one history entry');
    assert(world.getBuildings()[0].getBricks().length === 4, 'two bricks pasted');

    nav.pasteClipboard();
    const bricks = world.getBuildings()[0].getBricks();
    assert(bricks.length === 6, 'second paste adds again');
    const firstPasteShifted = bricks.slice(2, 4).map((b) => `${b.position.x + 2},${b.position.z + 2}`);
    const secondPaste = bricks.slice(4).map((b) => `${b.position.x},${b.position.z}`);
    assert(JSON.stringify(secondPaste) === JSON.stringify(firstPasteShifted), 'paste offset cascades');

    // Editing gates during preview apply to the clipboard too.
    nav.beginHistoryPreview();
    assert(nav.pasteClipboard() === false, 'paste gated during preview');
    assert(nav.copySelection().isEmpty, 'copy gated during preview');
    nav.cancelHistoryPreview();

    console.log('✓ session clipboard flow: copy, paste, cascade, preview gating');
}

// ---------------------------------------------------------------------
// 7. Session clone & fork adoption
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createDocumentWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) }
    ]);
    storage.save(doc.world.id, serializer.serialize(doc));

    const { nav, rendererCalls } = createSession(storage);
    nav._loadWorld(doc.world.id);
    nav._focusedDocumentId = doc.world.id;
    nav._activeDocumentId = doc.world.id;

    const cloneId = nav.cloneDocument();
    assert(cloneId !== doc.world.id, 'clone has a new document identity');
    const cloneDoc = nav.getDocument(cloneId);
    const sourceIds = doc.world.getBuildings()[0].getBricks().map((b) => b.id);
    for (const brick of cloneDoc.world.getBuildings()[0].getBricks()) {
        assert(!sourceIds.includes(brick.id), 'clone brick identities are fresh');
    }
    assert(cloneDoc.metadata.title === `Copy of ${doc.metadata.title}`, 'clone title');
    assert(cloneDoc.metadata.author === 'alice', 'clone attributed to the current user');
    assert(cloneDoc.metadata.parentDocumentId === doc.world.id, 'clone lineage');
    assert(nav.isDocumentDirty(cloneId), 'clone is dirty until saved');
    assert(nav.getTimeline(cloneId).length === 0, 'clone history starts empty');
    assert(rendererCalls.some(([op, id]) => op === 'add' && id === cloneId), 'clone rendered on adoption');

    const forkId = nav.forkDocument(doc.world.id);
    const forkDoc = nav.getDocument(forkId);
    assert(forkDoc.metadata.title === `Fork of ${doc.metadata.title}`, 'fork title');
    assert(forkDoc.metadata.author === 'alice', 'fork author');
    assert(forkDoc.metadata.parentDocumentId === doc.world.id, 'fork lineage');
    assert(nav.isDocumentDirty(forkId), 'fork is dirty until saved');

    // The adopted session behaves like any other: save, edit, undo.
    nav.saveDocument(cloneId);
    assert(!nav.isDocumentDirty(cloneId), 'save clears dirty');
    // Simulates the user navigating back to (and continuing to edit)
    // the clone after forking a DIFFERENT document — forkDocument()
    // above just moved both focused AND active onto the fork, so both
    // need to move back onto the clone here (0.2.27: undo/redo below
    // resolves against _activeDocumentId, not _focusedDocumentId).
    nav._focusedDocumentId = cloneId;
    nav._activeDocumentId = cloneId;
    const cloneHistory = nav._commandHistories.get(cloneDoc.world.id);
    cloneHistory.execute(new PlaceBrickCommand({
        worldId: cloneDoc.world.id,
        buildingId: cloneDoc.world.getBuildings()[0].id,
        definitionId: 'core:cube',
        position: new Position(9, 0.5, 0)
    }));
    assert(nav.isDocumentDirty(cloneId), 'post-clone edit dirties');
    nav.undo();
    assert(!nav.isDocumentDirty(cloneId), 'undo back onto the saved clone is clean');

    assertThrows(() => nav.cloneDocument('missing-id'), 'no loaded document', 'clone of unknown document rejected');
    console.log('✓ session clone & fork adoption');
}

// ---------------------------------------------------------------------
// FLAGSHIP: create A → save → publish → fork B → select → copy → paste
// → move → undo/redo paste → save → publish → replay → restore
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);

    // World A: empty building, loaded into World View.
    const docA = createEmptyBuildingDocument();
    storage.save(docA.world.id, serializer.serialize(docA));

    const { nav } = createSession(storage);
    nav._loadWorld(docA.world.id);
    nav._focusedDocumentId = docA.world.id;
    nav._activeDocumentId = docA.world.id;

    // Create A: place 3 bricks, save, publish.
    const worldA = nav.getDocument(docA.world.id).world;
    const buildingA = worldA.getBuildings()[0].id;
    const historyA = nav._commandHistories.get(worldA.id);
    for (const x of [0, 2, 4]) {
        historyA.execute(new PlaceBrickCommand({
            worldId: worldA.id,
            buildingId: buildingA,
            definitionId: 'core:cube',
            position: new Position(x, 0.5, 0)
        }));
    }
    nav.saveDocument();
    const publicationA = nav.publishDocument();
    const snapshotA = JSON.stringify(storage.load(docA.world.id));
    assert(publicationA.documentId === docA.world.id, 'publication A references document A');

    // Fork → World B.
    const forkId = nav.forkDocument();
    assert(forkId !== docA.world.id, 'World A ≠ World B (document identity)');
    const docB = nav.getDocument(forkId);
    const worldB = docB.world;
    assert(worldB.getBuildings()[0].getBricks().length === 3, 'fork carries the content');
    const idsA = worldA.getBuildings()[0].getBricks().map((b) => b.id);
    const idsB0 = worldB.getBuildings()[0].getBricks().map((b) => b.id);
    for (const id of idsB0) {
        assert(!idsA.includes(id), 'copied brick IDs are unique across documents');
    }
    assert(docB.metadata.title === `Fork of ${docA.metadata.title}`, 'fork title');
    assert(docB.metadata.author === 'alice', 'fork attributed to the current user');
    assert(docB.metadata.parentDocumentId === docA.world.id, 'fork lineage recorded');
    assert(nav.isDocumentDirty(forkId), 'fork starts dirty');
    assert(nav.getTimeline(forkId).length === 0, 'fork history starts empty');

    // Select B's 3 bricks and copy.
    const buildingB = worldB.getBuildings()[0].id;
    nav._setSpatialSelection(SpatialSelectionState.bricks({
        documentId: forkId,
        items: idsB0.map((brickId) => ({ type: 'brick', buildingId: buildingB, brickId }))
    }));
    const clipboard = nav.copySelection();
    assert(clipboard.count === 3, 'clipboard carries the selection');
    const historyB = nav._commandHistories.get(worldB.id);
    assert(historyB.getCursor() === 0, 'copy created no history entry');

    // Paste → one atomic command.
    assert(nav.pasteClipboard() === true, 'paste succeeds');
    assert(historyB.getCursor() === 1, 'undo removes the entire paste (one entry)');
    assert(historyB.getTimeline()[0].description === 'Paste 3 Bricks', 'timeline shows one paste operation');
    const bricksAfterPaste = worldB.getBuildings()[0].getBricks();
    assert(bricksAfterPaste.length === 6, 'World B contains original + copied bricks');
    const pastedIds = bricksAfterPaste.map((b) => b.id).filter((id) => !idsB0.includes(id));
    assert(pastedIds.length === 3 && new Set(pastedIds).size === 3, 'pasted brick identities are unique');
    assert(nav.getSpatialSelection().brickIds.length === 3, 'pasted bricks are selected');

    // Move the pasted group.
    assert(nav.moveSelection({ x: 5, y: 0, z: 0 }) === true, 'pasted group moves');
    assert(historyB.getCursor() === 2, 'move is the second entry');

    // Undo removes the whole paste; redo recreates it — same identities.
    nav.undo(); // move
    nav.undo(); // paste
    assert(worldB.getBuildings()[0].getBricks().length === 3, 'undo removes the entire paste');
    nav.redo(); // paste
    const repastedIds = worldB.getBuildings()[0].getBricks().map((b) => b.id).filter((id) => !idsB0.includes(id));
    assert(
        JSON.stringify([...repastedIds].sort()) === JSON.stringify([...pastedIds].sort()),
        'redo recreates the same pasted identities'
    );
    nav.redo(); // move

    // Save and publish B.
    nav.saveDocument();
    assert(!nav.isDocumentDirty(forkId), 'save clears dirty');
    const publicationB = nav.publishDocument();
    assert(publicationB.documentId === forkId, 'publication B references document B');
    const records = storage.load('forkbuild-publications');
    const recordsA = records.filter((r) => r.documentId === docA.world.id);
    assert(recordsA.length === 1 && recordsA[0].id === publicationA.id, 'publication A remains untouched');
    assert(JSON.stringify(storage.load(docA.world.id)) === snapshotA, 'document A storage unchanged');
    assert(JSON.stringify(worldA.toJSON()) !== JSON.stringify(worldB.toJSON()), 'World A ≠ World B');

    // Replay reproduces B exactly.
    const replayedB = replayUseCase.execute(historyB);
    assert(
        JSON.stringify(replayedB.toJSON()) === JSON.stringify(worldB.toJSON()),
        'replay reproduces the forked, pasted, moved world'
    );

    // Restore the intermediate state (after paste, before move).
    nav.restoreHistoryAt(1);
    const restoredWorld = nav.getDocument(forkId).world;
    const retired = nav.getRetiredHistories(forkId)[0];
    const expected = replayUseCase.execute(retired, { endCursor: 1 });
    assert(
        JSON.stringify(restoredWorld.toJSON()) === JSON.stringify(expected.toJSON()),
        'restore reproduces the selected historical state'
    );
    assert(nav.isDocumentDirty(forkId), 'restored state is dirty until saved');
    assert(nav.getTimeline(forkId).length === 0, 'timeline restarts after restore');

    console.log('✓ FLAGSHIP: create → save → publish → fork → copy → paste → move → save → publish → replay → restore');
}

console.log('\nAll document cloning tests passed.');
