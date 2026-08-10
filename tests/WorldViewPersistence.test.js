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
import { DocumentManager } from '../application/DocumentManager.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialCameraState } from '../application/spatial-state/SpatialCameraState.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// ---------------------------------------------------------------------
// Test helpers & stubs
// ---------------------------------------------------------------------

class IncrementCommand extends Command {
    constructor({ delta = 1 } = {}) {
        super();
        this._delta = delta;
    }
    get type() { return 'increment'; }
    execute(context) { context.value += this._delta; }
    undo(context) { context.value -= this._delta; }
    describe() { return `Increment ${this._delta}`; }
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
    building.addBrick(new Brick({
        definitionId: 'core:cube',
        position: new Position(0, 0.5, 0)
    }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Test World', author: 'alice' })
    });
}

// ---------------------------------------------------------------------
// 1. CommandHistory save point semantics
// ---------------------------------------------------------------------

{
    const context = { value: 0 };
    const history = new CommandHistory(context);
    assert(!history.isDirty(), 'fresh history is clean');
    history.execute(new IncrementCommand({ delta: 1 }));
    assert(history.isDirty(), 'execute dirties');
    history.undo();
    assert(!history.isDirty(), 'undo back to start is clean');
    history.redo();
    assert(history.isDirty(), 'redo dirties again');
    history.markSaved();
    assert(!history.isDirty(), 'markSaved clears dirty');
    history.execute(new IncrementCommand({ delta: 2 }));
    assert(history.isDirty(), 'execute after save dirties');
    history.undo();
    assert(!history.isDirty(), 'undo back onto save point is clean');
    console.log('✓ save point basics');
}

{
    // Branching BEFORE the save point wipes the redo branch that
    // contained it — the save point becomes permanently unreachable.
    const context = { value: 0 };
    const history = new CommandHistory(context);
    history.execute(new IncrementCommand({ delta: 1 }));
    history.execute(new IncrementCommand({ delta: 2 }));
    history.markSaved();                                   // save point at cursor 2
    history.undo();
    history.undo();                                        // cursor 0, save point in redo branch
    history.execute(new IncrementCommand({ delta: 5 }));   // wipes redo -> save point gone
    assert(history.isDirty(), 'branching before save point dirties');
    history.undo();
    assert(history.isDirty(), 'save point unreachable after branch');
    history.markSaved();
    assert(!history.isDirty(), 'fresh markSaved re-establishes baseline');
    console.log('✓ save point invalidation on branch');
}

{
    // Executing exactly AT the save point (normal forward work) keeps it.
    const context = { value: 0 };
    const history = new CommandHistory(context);
    history.execute(new IncrementCommand({ delta: 1 }));
    history.markSaved();
    history.execute(new IncrementCommand({ delta: 2 }));
    history.undo();
    assert(!history.isDirty(), 'undo to save point after forward branch is clean');
    console.log('✓ save point survives forward branching');
}

// ---------------------------------------------------------------------
// 2. DocumentManager computes dirty from the tracked history
// ---------------------------------------------------------------------

{
    const doc = createFixtureDocument();
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const history = new CommandHistory({ world: doc.world });
    const untrack = manager.trackCommandHistory(history);
    const buildingId = doc.world.getBuildings()[0].id;

    assert(!manager.state.dirty, 'clean after load');
    history.execute(new PlaceBrickCommand({
        worldId: doc.world.id,
        buildingId,
        definitionId: 'core:cube',
        position: new Position(2, 0.5, 0)
    }));
    assert(manager.state.dirty, 'dirty after execute');
    history.undo();
    assert(!manager.state.dirty, 'undo back to save point is clean');
    history.redo();
    assert(manager.state.dirty, 'redo dirties again');
    manager.markSaved();
    assert(!manager.state.dirty && !history.isDirty(), 'markSaved clears manager and history');
    history.undo();
    assert(manager.state.dirty, 'undo after save is dirty');
    history.redo();
    assert(!manager.state.dirty, 'redo back onto save point is clean');
    untrack();
    console.log('✓ DocumentManager dirty tracking with undo/redo');
}

// ---------------------------------------------------------------------
// 3. End-to-end: load -> edit -> save -> publish through real use cases
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createFixtureDocument();
    storage.save(doc.world.id, serializer.serialize(doc)); // simulate a published document

    // Load the way World View does
    const loaded = serializer.deserialize(storage.load(doc.world.id));
    const manager = new DocumentManager();
    manager.load(loaded, doc.world.id);
    const history = new CommandHistory({ world: loaded.world });
    manager.trackCommandHistory(history);
    const buildingId = loaded.world.getBuildings()[0].id;

    history.execute(new PlaceBrickCommand({
        worldId: loaded.world.id,
        buildingId,
        definitionId: 'core:cube',
        position: new Position(3, 0.5, 0)
    }));
    assert(manager.state.dirty, 'dirty before save');

    // Save
    const saveUseCase = new SaveDocumentUseCase(storage);
    const savedId = saveUseCase.execute(manager);
    assert(savedId === doc.world.id, 'save uses the world id');
    const stored = storage.load(doc.world.id);
    assert(stored.world.buildings[0].bricks.length === 2, 'saved document contains the placed brick');
    const manifest = storage.load('forkbuild-index');
    assert(manifest.length === 1 && manifest[0].id === doc.world.id, 'manifest upserted');
    assert(!manager.state.dirty && !history.isDirty(), 'clean after save');

    // Publish
    const publishUseCase = new PublishDocumentUseCase(
        new LocalPublisherProvider(storage),
        stubIdentityProvider
    );
    const publication = publishUseCase.execute(manager);
    assert(publication.documentId === doc.world.id, 'publication references the document');
    assert(publication.author === 'alice', 'publication attributed via identity provider');
    const records = storage.load('forkbuild-publications');
    assert(records.length === 1 && records[0].documentId === doc.world.id, 'publication record persisted');
    console.log('✓ end-to-end save and publish pipeline');
}

// ---------------------------------------------------------------------
// 4. WorldNavigationSession: active document, save, publish, pinning
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createFixtureDocument();
    storage.save(doc.world.id, serializer.serialize(doc));

    const registry = new CreateBrickRegistryUseCase().execute();
    const nav = new WorldNavigationSession({
        registry,
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase: new PublishDocumentUseCase(
            new LocalPublisherProvider(storage),
            stubIdentityProvider
        )
    });

    assert(nav.getActiveDocumentId() === null, 'no active document before load');
    assertThrows(() => nav.saveDocument(), 'no loaded document', 'save without a document throws');
    assertThrows(() => nav.publishDocument(), 'no loaded document', 'publish without a document throws');

    // Stand in for the parts of start() the persistence path does not need.
    nav._eventBus = new EventBus();
    nav._session = { addWorld() {}, removeWorld() {} };
    nav._loadWorld(doc.world.id);

    assert(nav.isDocumentDirty(doc.world.id) === false, 'freshly loaded document is clean');
    assert(nav.getActiveDocumentId() === doc.world.id, 'sole loaded document is the active one');

    const world = nav.getDocument(doc.world.id).world;
    const buildingId = world.getBuildings()[0].id;
    const brickId = world.getBuildings()[0].getBricks()[0].id;
    const history = nav._commandHistories.get(world.id);

    history.execute(new MoveBrickCommand({
        worldId: world.id, buildingId, brickId, delta: { x: 1, y: 0, z: 0 }
    }));
    assert(nav.isDocumentDirty(doc.world.id) === true, 'edit marks the document dirty');
    history.undo();
    assert(nav.isDocumentDirty(doc.world.id) === false, 'undo back to load state is clean');
    history.redo();

    // Save
    nav.saveDocument();
    assert(nav.isDocumentDirty(doc.world.id) === false, 'save clears dirty');
    const stored = storage.load(doc.world.id);
    assert(stored.world.buildings[0].bricks[0].position.x === 1, 'saved world contains the moved brick');

    // Publish auto-saves when dirty
    history.execute(new MoveBrickCommand({
        worldId: world.id, buildingId, brickId, delta: { x: 0, y: 1, z: 0 }
    }));
    assert(nav.isDocumentDirty(doc.world.id) === true, 'dirty before publish');
    const publication = nav.publishDocument();
    assert(publication.documentId === doc.world.id, 'publish references the active document');
    assert(publication.author === 'alice', 'publish attributed via identity provider');
    assert(nav.isDocumentDirty(doc.world.id) === false, 'publish auto-saved first');
    const storedAfterPublish = storage.load(doc.world.id);
    assert(storedAfterPublish.world.buildings[0].bricks[0].position.y === 1.5, 'published content matches live document');

    // Streaming unload pinning: dirty documents survive leaving the radius
    nav._spatialCameraController = {
        getSpatialCameraState: () => new SpatialCameraState({
            position: new WorldPosition(9999, 0, 0),
            target: new WorldPosition(0, 0, 0),
            mode: 'orbit'
        })
    };
    history.execute(new MoveBrickCommand({
        worldId: world.id, buildingId, brickId, delta: { x: 0, y: 0, z: 1 }
    }));
    nav.updateSpatialView();
    assert(nav.getDocument(doc.world.id) !== null, 'dirty document is pinned against streaming unload');
    nav.saveDocument();
    nav.updateSpatialView();
    assert(nav.getDocument(doc.world.id) === null, 'saved document unloads normally');
    assert(nav.getDocumentManager(doc.world.id) === null, 'unloaded document manager is cleaned up');

    console.log('✓ WorldNavigationSession save, publish, and dirty pinning');
}

console.log('\nAll World View persistence tests passed.');
