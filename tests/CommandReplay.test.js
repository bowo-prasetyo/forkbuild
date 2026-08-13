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
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { RotateBrickCommand } from '../application/commands/RotateBrickCommand.js';
import { TransformSelectionCommand } from '../application/commands/TransformSelectionCommand.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
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
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            delta: this._delta
        };
    }
    static fromJSON(json) {
        if (!Number.isFinite(json.delta)) {
            throw new Error('IncrementCommand.fromJSON(): delta must be a number');
        }
        return new IncrementCommand({ delta: json.delta, id: json.id, timestamp: new Date(json.timestamp) });
    }
}

class FailingCommand extends Command {
    get type() { return 'failing'; }
    execute() { throw new Error('intentional failure'); }
    undo() {}
    describe() { return 'Failing Command'; }
    toJSON() {
        return { type: this.type, id: this._id, timestamp: this._timestamp.toISOString() };
    }
    static fromJSON(json) {
        return new FailingCommand({ id: json.id, timestamp: new Date(json.timestamp) });
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

function createBrickWorld(positions) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const position of positions) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position }));
    }
    world.addBuilding(building);
    return world;
}

function createFixtureDocument() {
    return new Document({
        world: createBrickWorld([new Position(0, 0.5, 0)]),
        metadata: new DocumentMetadata({ title: 'Replay Test World', author: 'alice' })
    });
}

// ---------------------------------------------------------------------
// 1. Baseline snapshot semantics
// ---------------------------------------------------------------------

{
    const world = createBrickWorld([new Position(0, 0.5, 0)]);
    const history = new CommandHistory({ world });
    const baseline = history.getBaselineWorld();
    assert(baseline !== null, 'baseline captured at construction');
    assert(baseline.buildings[0].bricks.length === 1, 'baseline matches world at construction');

    history.execute(new PlaceBrickCommand({
        worldId: world.id,
        buildingId: world.getBuildings()[0].id,
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    }));
    assert(history.getBaselineWorld().buildings[0].bricks.length === 1, 'baseline unaffected by later edits');
    assert(world.getBuildings()[0].getBricks().length === 2, 'live world did change');
    console.log('✓ baseline snapshot captured at construction, immune to later edits');
}

// ---------------------------------------------------------------------
// 2. Replay kernel: serialized-form reconstruction, no pollution
// ---------------------------------------------------------------------

{
    const registry = new CommandRegistry();
    registry.register('increment', IncrementCommand);

    const context = { value: 0 };
    const history = new CommandHistory(context);
    history.execute(new IncrementCommand({ delta: 1 }));
    history.execute(new IncrementCommand({ delta: 2 }));
    history.execute(new IncrementCommand({ delta: 4 }));
    history.markSaved();
    const envelopeBefore = JSON.stringify(history.toJSON());

    // Spy: count how often commands are reconstructed from JSON.
    let fromJSONCalls = 0;
    const originalFromJSON = registry.fromJSON.bind(registry);
    registry.fromJSON = (json) => {
        fromJSONCalls++;
        return originalFromJSON(json);
    };

    // Partial range against a fresh context.
    const target = { value: 0 };
    const count = history.replay(target, { registry, endCursor: 2 });
    assert(count === 2, 'replayed the requested range');
    assert(target.value === 3, 'replay reconstructed the intermediate state');
    assert(context.value === 7, 'original context untouched by replay');
    assert(fromJSONCalls === 2, 'replay reconstructed commands from serialized form');
    assert(JSON.stringify(history.toJSON()) === envelopeBefore, 'replay did not modify the history envelope');
    assert(!history.isDirty(), 'replay did not touch the save point');

    // Default range = whole linear sequence.
    const full = { value: 0 };
    history.replay(full, { registry });
    assert(full.value === 7, 'default replay covers the full sequence');

    // Advanced startCursor against a pre-prepared target.
    const partial = { value: 3 };
    history.replay(partial, { registry, startCursor: 2, endCursor: 3 });
    assert(partial.value === 7, 'startCursor replays only the requested slice');

    assertThrows(
        () => history.replay({ value: 0 }, { registry, endCursor: 99 }),
        'invalid range',
        'out-of-bounds replay range rejected'
    );
    assertThrows(
        () => history.replay({ value: 0 }, {}),
        'CommandRegistry is required',
        'replay without registry rejected'
    );
    console.log('✓ replay kernel: serialized reconstruction, range support, zero pollution');
}

// ---------------------------------------------------------------------
// 3. Replay is transactional
// ---------------------------------------------------------------------

{
    const registry = new CommandRegistry();
    registry.register('increment', IncrementCommand);
    registry.register('failing', FailingCommand);

    const envelope = {
        schemaVersion: 1,
        cursor: 3,
        commands: [
            new IncrementCommand({ delta: 1 }).toJSON(),
            new FailingCommand().toJSON(),
            new IncrementCommand({ delta: 2 }).toJSON()
        ]
    };
    const history = CommandHistory.fromJSON(envelope, { value: 0 }, registry);
    const target = { value: 0 };
    assertThrows(
        () => history.replay(target, { registry }),
        'intentional failure',
        'replay rethrows a failing command'
    );
    assert(target.value === 0, 'failed replay rolled back already-executed commands');
    console.log('✓ replay rollback on command failure');
}

// ---------------------------------------------------------------------
// 4. FLAGSHIP: serialize -> deserialize -> replay -> IDENTICAL
// ---------------------------------------------------------------------

{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);

    const world = createBrickWorld([new Position(0, 0.5, 0)]);
    const buildingId = world.getBuildings()[0].id;
    const firstBrickId = world.getBuildings()[0].getBricks()[0].id;
    const history = new CommandHistory({ world });

    history.execute(new PlaceBrickCommand({
        worldId: world.id, buildingId,
        definitionId: 'core:cube', position: new Position(2, 0.5, 0)
    }));
    history.execute(new PlaceBrickCommand({
        worldId: world.id, buildingId,
        definitionId: 'core:plate_2x4', position: new Position(4, 0.125, 0)
    }));
    history.execute(new MoveBrickCommand({
        worldId: world.id, buildingId, brickId: firstBrickId, delta: { x: 0, y: 1, z: 0 }
    }));
    history.execute(new RotateBrickCommand({
        worldId: world.id, buildingId, brickId: firstBrickId, deltaRotation: 90
    }));
    history.execute(new DeleteBrickCommand({
        worldId: world.id, buildingId, brickId: firstBrickId
    }));

    // Full replay == live document, byte for byte.
    const replayWorld = replayUseCase.execute(history);
    assert(
        JSON.stringify(replayWorld.toJSON()) === JSON.stringify(world.toJSON()),
        'replayed document is identical to the live document'
    );

    // Intermediate state: after move, before rotate/delete.
    const mid = replayUseCase.execute(history, { endCursor: 3 });
    const midBricks = mid.getBuildings()[0].getBricks();
    assert(midBricks.length === 3, 'intermediate replay contains placed bricks');
    const midFirst = midBricks.find((brick) => brick.id === firstBrickId);
    assert(midFirst.position.y === 1.5, 'intermediate state reflects the move');
    assert(midFirst.rotation === 0, 'intermediate state predates the rotation');

    // Persist -> restore -> replay, with NO access to the original world.
    const restored = CommandHistory.fromJSON(
        history.toJSON(),
        { world: World.fromJSON(history.getBaselineWorld()) },
        commandRegistry
    );
    assert(restored.getBaselineWorld() !== null, 'baseline survives persistence');
    const replayWorld2 = replayUseCase.execute(restored);
    assert(
        JSON.stringify(replayWorld2.toJSON()) === JSON.stringify(world.toJSON()),
        'restored history replays to an identical document'
    );

    // Pre-0.1.40 envelopes have no baseline and must be rejected cleanly.
    const legacy = CommandHistory.fromJSON({ schemaVersion: 1, cursor: 0, commands: [] }, { value: 0 }, commandRegistry);
    assert(legacy.getBaselineWorld() === null, 'legacy envelope has no baseline');
    assertThrows(() => replayUseCase.execute(legacy), 'no baseline', 'replay without baseline rejected');

    console.log('✓ serialize -> deserialize -> replay -> IDENTICAL (incl. restored history)');
}

// ---------------------------------------------------------------------
// 5. Composites, nested composites, transforms + timeline projection
// ---------------------------------------------------------------------

{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);

    const world = createBrickWorld([
        new Position(0, 0.5, 0),
        new Position(3, 0.5, 0),
        new Position(6, 0.5, 0)
    ]);
    const buildingId = world.getBuildings()[0].id;
    const brickIds = world.getBuildings()[0].getBricks().map((brick) => brick.id);
    const history = new CommandHistory({ world });

    // Atomic group move — one history entry.
    const moveAll = new CompositeCommand({ description: 'Move 3 Bricks' });
    for (const brickId of brickIds) {
        moveAll.add(new MoveBrickCommand({
            worldId: world.id, buildingId, brickId, delta: { x: 1, y: 0, z: 0 }
        }));
    }
    history.execute(moveAll);
    const afterComposite = replayUseCase.execute(history);
    assert(
        JSON.stringify(afterComposite.toJSON()) === JSON.stringify(world.toJSON()),
        'composite replays atomically to identical state'
    );

    // Nested composite: rotate + (inner pair move).
    const inner = new CompositeCommand({ description: 'Inner Pair' });
    inner.add(new MoveBrickCommand({ worldId: world.id, buildingId, brickId: brickIds[1], delta: { x: 0, y: 1, z: 0 } }));
    inner.add(new MoveBrickCommand({ worldId: world.id, buildingId, brickId: brickIds[2], delta: { x: 0, y: 0, z: 1 } }));
    const outer = new CompositeCommand({ description: 'Nested Edit' });
    outer.add(new RotateBrickCommand({ worldId: world.id, buildingId, brickId: brickIds[0], deltaRotation: 45 }));
    outer.add(inner);
    history.execute(outer);
    const afterNested = replayUseCase.execute(history);
    assert(
        JSON.stringify(afterNested.toJSON()) === JSON.stringify(world.toJSON()),
        'nested composite replays to identical state'
    );

    // Absolute transform command.
    const transforms = brickIds.map((brickId, i) => ({
        buildingId,
        brickId,
        position: { x: i * 3, y: 0.5, z: -2 },
        rotation: i * 90
    }));
    history.execute(new TransformSelectionCommand({
        worldId: world.id,
        transforms,
        description: 'Snap Layout'
    }));
    const afterTransform = replayUseCase.execute(history);
    assert(
        JSON.stringify(afterTransform.toJSON()) === JSON.stringify(world.toJSON()),
        'transform-selection replays to identical state'
    );

    // Timeline projection.
    const timeline = history.getTimeline();
    assert(timeline.length === 3, 'timeline shows one entry per top-level operation');
    assert(timeline.every((op, i) => op.index === i), 'timeline preserves chronological order');
    assert(timeline[0].description === 'Move 3 Bricks', 'composite description exposed');
    assert(timeline[0].childCount === 3, 'composite child count exposed');
    assert(timeline[1].childCount === 2, 'nested composite counts direct children');
    assert(timeline[2].description === 'Snap Layout', 'transform description exposed');
    assert(timeline.every((op) => op.applied === true), 'all applied operations marked applied');
    assert(timeline.every((op) => op.timestamp instanceof Date), 'timestamps exposed');

    history.undo();
    const undoneTimeline = history.getTimeline();
    assert(undoneTimeline[2].applied === false, 'undone operation marked unapplied');
    assert(undoneTimeline[0].applied === true, 'earlier operations stay applied');
    // Undone-but-remembered states are still replayable.
    const undoneState = replayUseCase.execute(history, { endCursor: 3 });
    assert(JSON.stringify(undoneState.toJSON()) === JSON.stringify(afterTransform.toJSON()),
    'entries beyond the cursor still reconstruct their state'); // Was afterNested
    history.redo();

    console.log('✓ composites, nested composites, transforms, and timeline projection');
}

// ---------------------------------------------------------------------
// 6. WorldNavigationSession: preview lifecycle, gating, no mutation
// ---------------------------------------------------------------------

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const doc = createFixtureDocument();
    storage.save(doc.world.id, serializer.serialize(doc));

    const rendererCalls = [];
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        replayDocumentUseCase: new ReplayDocumentUseCase(new CreateCommandRegistryUseCase().execute())
    });

    // Stand in for the parts of start() the preview path does not need.
    nav._eventBus = new EventBus();
    nav._session = {
        addWorld: (world, id) => rendererCalls.push(['add', id, world]),
        removeWorld: (world, id) => rendererCalls.push(['remove', id, world]),
        selectBricks: () => rendererCalls.push(['select']),
        clearSelection: () => {},
        clearHover: () => {},
        hidePreview: () => {}
    };
    nav._loadWorld(doc.world.id);
    nav._focusedDocumentId = doc.world.id;

    const world = nav.getDocument(doc.world.id).world;
    const buildingId = world.getBuildings()[0].id;
    const firstBrickId = world.getBuildings()[0].getBricks()[0].id;
    const history = nav._commandHistories.get(world.id);

    history.execute(new PlaceBrickCommand({
        worldId: world.id, buildingId,
        definitionId: 'core:cube', position: new Position(3, 0.5, 0)
    }));
    history.execute(new MoveBrickCommand({
        worldId: world.id, buildingId, brickId: firstBrickId, delta: { x: 1, y: 0, z: 0 }
    }));
    const liveBrickCount = world.getBuildings()[0].getBricks().length;
    assert(liveBrickCount === 2, 'fixture has two bricks after edits');

    const timeline = nav.getTimeline();
    assert(timeline.length === 2, 'session timeline exposes the history');

    assertThrows(() => nav.previewHistoryAt(1), 'no active history preview', 'preview without begin rejected');

    nav.beginHistoryPreview();
    nav.previewHistoryAt(1);
    assert(rendererCalls.some(([op, id]) => op === 'remove' && id === doc.world.id), 'live world hidden during preview');
    const replayAdd = rendererCalls.find(([op, id]) => op === 'add' && id === `replay:${doc.world.id}`);
    assert(replayAdd, 'replay world rendered under the synthetic replay id');
    const replayWorld = replayAdd[2];
    assert(replayWorld.getBuildings()[0].getBricks().length === 2, 'replay at cursor 1 includes the placement');
    assert(replayWorld.getBuildings()[0].getBricks()[0].position.x === 0, 'replay at cursor 1 predates the move');
    assert(world.getBuildings()[0].getBricks().length === liveBrickCount, 'preview did not mutate the live document');
    assert(world.getBuildings()[0].getBricks()[0].position.x === 1, 'live brick positions untouched');
    assert(nav.getHistoryPreview().cursor === 1, 'preview state tracks the cursor');

    // Editing is suspended during preview.
    assert(nav.undo() === false, 'undo suppressed during preview');
    assert(nav.moveSelection({ x: 1, y: 0, z: 0 }) === false, 'editing suppressed during preview');

    // Scrub back to the initial state.
    nav.previewHistoryAt(0);
    assert(nav.getHistoryPreview().cursor === 0, 'scrub to initial state');
    const initialAdd = rendererCalls.filter(([op, id]) => op === 'add' && id === `replay:${doc.world.id}`).pop();
    assert(initialAdd[2].getBuildings()[0].getBricks().length === 1, 'initial state replay has only the original brick');

    // Cancel restores the live world.
    nav.cancelHistoryPreview();
    assert(rendererCalls.some(([op, id]) => op === 'remove' && id === `replay:${doc.world.id}`), 'replay world removed on cancel');
    const lastAdd = [...rendererCalls].reverse().find(([op]) => op === 'add');
    assert(lastAdd[1] === doc.world.id, 'live world restored on cancel');
    assert(nav.getHistoryPreview() === null, 'preview state cleared after cancel');
    assert(world.getBuildings()[0].getBricks().length === liveBrickCount, 'cancel left the live document untouched');
    assert(nav.undo() === true, 'editing restored after cancel');

    // 0.1.39 behavior still intact alongside replay.
    nav.saveDocument();
    assert(nav.isDocumentDirty(doc.world.id) === false, 'save still works after replay milestone');

    console.log('✓ WorldNavigationSession history preview lifecycle');
}

console.log('\nAll command replay tests passed.');
