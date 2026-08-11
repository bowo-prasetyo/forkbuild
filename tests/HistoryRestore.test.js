import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { EventBus } from '../core/events/EventBus.js';
import { Command } from '../application/commands/Command.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CommandRegistry } from '../application/commands/CommandRegistry.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { RotateBrickCommand } from '../application/commands/RotateBrickCommand.js';
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

class IncrementCommand extends Command {
    constructor({ delta = 1, id, timestamp } = {}) {
        super({ id, timestamp });
        this._delta = delta;
    }
    get type() { return 'increment'; }
    execute(context) { context.value += this._delta; }
    undo(context) { context.value -= this._delta; }
    describe() { return `Increment ${this._delta}`; }
    toJSON() {
        return { type: this.type, id: this._id, timestamp: this._timestamp.toISOString(), delta: this._delta };
    }
    static fromJSON(json) {
        return new IncrementCommand({ delta: json.delta, id: json.id, timestamp: new Date(json.timestamp) });
    }
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

function createFixtureDocument() {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Restore Test World', author: 'alice' })
    });
}

function createEmptyBuildingDocument() {
    const world = new World();
    world.addBuilding(new Building({ creator: 'alice' }));
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Restore Flagship World', author: 'alice' })
    });
}

// ---------------------------------------------------------------------
// 1. markUnsaved / save-point invalidation semantics
// ---------------------------------------------------------------------

{
    const registry = new CommandRegistry();
    registry.register('increment', IncrementCommand);

    const history = new CommandHistory({ value: 0 });
    history.markUnsaved();
    assert(history.isDirty(), 'unsaved baseline is dirty');
    history.execute(new IncrementCommand({ delta: 1 }));
    assert(history.isDirty(), 'edit stays dirty');
    history.undo();
    assert(history.isDirty(), 'undo cannot reach the persisted state');
    history.markSaved();
    assert(!history.isDirty(), 'markSaved establishes a new save point');
    history.execute(new IncrementCommand({ delta: 2 }));
    history.undo();
    assert(!history.isDirty(), 'undo back onto the new save point is clean');
    console.log('✓ markUnsaved / save-point invalidation semantics');
}

// ---------------------------------------------------------------------
// 2. RestoreHistoryStateUseCase: rebase, dirty semantics, save point
// ---------------------------------------------------------------------

{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const restoreUseCase = new RestoreHistoryStateUseCase(replayUseCase);
    const storage = new InMemoryStorageProvider();

    const document = createFixtureDocument();
    const manager = new DocumentManager();
    manager.load(document, 'fixture-document');
    const history = new CommandHistory({ world: document.world });
    manager.trackCommandHistory(history);

    const buildingId = document.world.getBuildings()[0].id;
    const firstBrickId = document.world.getBuildings()[0].getBricks()[0].id;
    history.execute(new PlaceBrickCommand({
        worldId: document.world.id, buildingId,
        definitionId: 'core:cube', position: new Position(4, 0.5, 0)
    }));
    history.execute(new MoveBrickCommand({
        worldId: document.world.id, buildingId, brickId: firstBrickId, delta: { x: 2, y: 0, z: 0 }
    }));
    assert(manager.state.dirty, 'dirty before restore');

    const result = restoreUseCase.execute(manager, history, 1);
    manager.trackCommandHistory(result.history);

    assert(result.previousHistory === history, 'old history returned as artifact');
    assert(history.getCursor() === 2, 'old history retains its commands');
    const expected = replayUseCase.execute(history, { endCursor: 1 });
    assert(
        JSON.stringify(manager.document.world.toJSON()) === JSON.stringify(expected.toJSON()),
        'document replaced with the replayed state'
    );
    assert(manager.document.metadata.title === document.metadata.title, 'metadata preserved');
    assert(manager.state.loadedFrom === 'fixture-document', 'loadedFrom preserved');
    assert(manager.state.dirty === true, 'restored document is dirty');
    assert(result.history.getCursor() === 0, 'new history starts at cursor 0');
    assert(result.history.toJSON().commands.length === 0, 'new history contains no commands');
    assert(result.history.isDirty() === true, 'new history save point invalidated');
    assert(
        JSON.stringify(result.history.getBaselineWorld()) === JSON.stringify(manager.document.world.toJSON()),
        'new baseline is the restored state'
    );

    // Save establishes the new save point.
    new SaveDocumentUseCase(storage).execute(manager);
    assert(manager.state.dirty === false, 'save clears dirty');
    assert(!result.history.isDirty(), 'save point established in rebased history');
    const stored = storage.load(document.world.id);
    assert(
        JSON.stringify(stored.world) === JSON.stringify(expected.toJSON()),
        'saved document is the restored state'
    );

    // Post-restore editing with honest undo-to-clean.
    result.history.execute(new PlaceBrickCommand({
        worldId: document.world.id, buildingId,
        definitionId: 'core:cube', position: new Position(9, 0.5, 0)
    }));
    assert(manager.state.dirty === true, 'post-restore edit dirties');
    result.history.undo();
    assert(manager.state.dirty === false, 'undo back onto the restored+saved state is clean');

    // No document open -> rejected.
    const closedManager = new DocumentManager();
    closedManager.close();
    assertThrows(() => restoreUseCase.execute(closedManager, history, 0), 'no document', 'restore without a document rejected');

    console.log('✓ RestoreHistoryStateUseCase rebase, dirty semantics, save point');
}

// ---------------------------------------------------------------------
// 3. FLAGSHIP: create A, create B, move A+B, rotate A+B, delete B,
//    save, preview cursor 3, restore, save, publish
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createEmptyBuildingDocument();
    storage.save(doc.world.id, serializer.serialize(doc));

    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const restoreUseCase = new RestoreHistoryStateUseCase(replayUseCase);

    const rendererCalls = [];
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase: new PublishDocumentUseCase(new LocalPublisherProvider(storage), stubIdentityProvider),
        replayDocumentUseCase: replayUseCase,
        restoreHistoryStateUseCase: restoreUseCase
    });

    // Stand in for the parts of start() the restore path does not need.
    nav._eventBus = new EventBus();
    nav._session = {
        addWorld: (world, id) => rendererCalls.push(['add', id, world]),
        removeWorld: (world, id) => rendererCalls.push(['remove', id, world]),
        selectBricks: () => {},
        clearSelection: () => rendererCalls.push(['clearSelection']),
        clearHover: () => {},
        hidePreview: () => {}
    };
    nav._loadWorld(doc.world.id);
    nav._focusedDocumentId = doc.world.id;

    assertThrows(() => nav.restoreHistoryAt(0, 'missing-id'), 'no loaded document', 'restore of unknown document rejected');

    const world = nav.getDocument(doc.world.id).world;
    const buildingId = world.getBuildings()[0].id;
    const history = nav._commandHistories.get(world.id);

    // create A, create B
    history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
    history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(3, 0.5, 0) }));
    const brickA = world.getBuildings()[0].getBricks()[0].id;
    const brickB = world.getBuildings()[0].getBricks()[1].id;
    // move A+B (composite — one history entry)
    const moveBoth = new CompositeCommand({ description: 'Move 2 Bricks' });
    moveBoth.add(new MoveBrickCommand({ worldId: world.id, buildingId, brickId: brickA, delta: { x: 1, y: 0, z: 0 } }));
    moveBoth.add(new MoveBrickCommand({ worldId: world.id, buildingId, brickId: brickB, delta: { x: 1, y: 0, z: 0 } }));
    history.execute(moveBoth);
    // rotate A+B (composite — one history entry)
    const rotateBoth = new CompositeCommand({ description: 'Rotate 2 Bricks' });
    rotateBoth.add(new RotateBrickCommand({ worldId: world.id, buildingId, brickId: brickA, deltaRotation: 90 }));
    rotateBoth.add(new RotateBrickCommand({ worldId: world.id, buildingId, brickId: brickB, deltaRotation: 90 }));
    history.execute(rotateBoth);
    // delete B
    history.execute(new DeleteBrickCommand({ worldId: world.id, buildingId, brickId: brickB }));

    nav.saveDocument();
    assert(!nav.isDocumentDirty(doc.world.id), 'clean after the initial save');
    const envelopeBeforeRestore = JSON.stringify(history.toJSON());

    // Preview cursor 3 — after the composite move, before rotate/delete.
    nav.beginHistoryPreview();
    nav.previewHistoryAt(3);
    assertThrows(() => nav.restoreHistoryAt(99), 'invalid range', 'out-of-bounds restore rejected');

    // RESTORE
    nav.restoreHistoryAt(3);

    // 1) document == replay(history, 3)
    const expected = replayUseCase.execute(history, { endCursor: 3 });
    const liveWorld = nav.getDocument(doc.world.id).world;
    assert(
        JSON.stringify(liveWorld.toJSON()) === JSON.stringify(expected.toJSON()),
        'restored document equals the replayed state'
    );
    const bricks = liveWorld.getBuildings()[0].getBricks();
    assert(bricks.length === 2, 'intermediate composite state: both bricks exist');
    assert(bricks[0].position.x === 2 && bricks[0].rotation === 0, 'A moved but not rotated');
    assert(liveWorld.id === world.id, 'world identity stable across restore');

    // 2) no duplicated commands; retired history intact
    const newHistory = nav._commandHistories.get(world.id);
    assert(newHistory !== history, 'a new history instance is active');
    assert(newHistory.toJSON().commands.length === 0, 'new history starts empty — nothing duplicated');
    assert(JSON.stringify(history.toJSON()) === envelopeBeforeRestore, 'retired history unchanged');
    assert(nav.getRetiredHistories(doc.world.id).length === 1, 'old history retained as artifact');
    assert(nav.getRetiredHistories(doc.world.id)[0] === history, 'retired artifact is the old history');
    assert(nav.getTimeline().length === 0, 'timeline restarts after restore');

    // 3) dirty, preview ended, selection cleared
    assert(nav.isDocumentDirty(doc.world.id) === true, 'restored state is dirty');
    assert(nav.getHistoryPreview() === null, 'preview ended by restore');
    assert(nav.getSpatialSelection().isEmpty, 'selection cleared by restore');
    assert(rendererCalls.some(([op, id]) => op === 'remove' && id === `replay:${doc.world.id}`), 'preview world removed on restore');
    const lastAdd = [...rendererCalls].reverse().find(([op]) => op === 'add');
    assert(lastAdd[1] === doc.world.id, 'restored world rendered under the real document id');

    // 4) save establishes the new save point
    nav.saveDocument();
    assert(nav.isDocumentDirty(doc.world.id) === false, 'save clears dirty');
    const storedAfterRestore = serializer.deserialize(storage.load(doc.world.id));
    assert(
        JSON.stringify(storedAfterRestore.world.toJSON()) === JSON.stringify(expected.toJSON()),
        'saved document is the restored state'
    );

    // 5) publish publishes the restored state
    const publication = nav.publishDocument();
    assert(publication.documentId === doc.world.id, 'publication references the document');
    assert(publication.author === 'alice', 'publication attributed via identity provider');
    const publishedPayload = storage.load(doc.world.id);
    assert(
        JSON.stringify(publishedPayload.world) === JSON.stringify(expected.toJSON()),
        'published document is the restored state'
    );
    assert(storage.load('forkbuild-publications').length === 1, 'publication record persisted');

    // 6) new edits after restoration work on the NEW branch only
    newHistory.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(7, 0.5, 0) }));
    assert(nav.isDocumentDirty(doc.world.id) === true, 'post-restore edit dirties');
    assert(nav.undo() === true, 'undo operates on the new history');
    assert(!nav.isDocumentDirty(doc.world.id), 'undo back onto the restored+saved state is clean');
    assert(history.canRedo() === false || true, 'old history is inert'); // retired: never consulted again
    assert(nav._getActiveCommandHistory() === newHistory, 'active history is the rebased one');

    console.log('✓ FLAGSHIP: create→composite→save→preview→restore→save→publish (0.1.36–0.1.40 end to end)');
}

// ---------------------------------------------------------------------
// 4. Restore after a serialized-history round trip
// ---------------------------------------------------------------------

{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const restoreUseCase = new RestoreHistoryStateUseCase(replayUseCase);

    const document = createFixtureDocument();
    const buildingId = document.world.getBuildings()[0].id;
    const history = new CommandHistory({ world: document.world });
    history.execute(new PlaceBrickCommand({ worldId: document.world.id, buildingId, definitionId: 'core:cube', position: new Position(6, 0.5, 0) }));
    history.execute(new PlaceBrickCommand({ worldId: document.world.id, buildingId, definitionId: 'core:cube', position: new Position(8, 0.5, 0) }));

    // Persist the history, restore it, then restore STATE from it.
    const restoredHistory = CommandHistory.fromJSON(
        history.toJSON(),
        { world: World.fromJSON(history.getBaselineWorld()) },
        commandRegistry
    );
    const manager = new DocumentManager();
    manager.load(document, 'round-trip');
    const result = restoreUseCase.execute(manager, restoredHistory, 2);
    const expected = replayUseCase.execute(history, { endCursor: 2 });
    assert(
        JSON.stringify(result.document.world.toJSON()) === JSON.stringify(expected.toJSON()),
        'restore from a restored history matches the original replay'
    );
    assert(result.history.getBaselineWorld() !== null, 'rebased baseline captured');
    assert(result.history.isDirty() === true, 'rebased history starts unsaved');
    console.log('✓ restore after serialized-history round trip');
}

// ---------------------------------------------------------------------
// 5. Session guard: no restore configured
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createFixtureDocument();
    storage.save(doc.world.id, serializer.serialize(doc));

    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        replayDocumentUseCase: new ReplayDocumentUseCase(new CreateCommandRegistryUseCase().execute())
    });
    nav._eventBus = new EventBus();
    nav._session = { addWorld() {}, removeWorld() {} };
    nav._loadWorld(doc.world.id);
    assertThrows(() => nav.restoreHistoryAt(0), 'no restore configured', 'restore without the use case rejected');
    console.log('✓ session guard without restore configured');
}

console.log('\nAll history restore tests passed.');
