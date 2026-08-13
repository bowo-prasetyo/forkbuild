import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { SpatialEditingService } from '../application/SpatialEditingService.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { TransformAlignment } from '../application/TransformAlignment.js';

// 0.1.48 — Alignment & Distribution tests.
//
// The milestone's acceptance sentence, encoded as tests: alignment and
// distribution generate exact absolute transforms for any resolved
// selection, commit through exactly one existing TransformSelectionCommand,
// preserve rotation and group membership, produce zero history entries
// when they are no-ops, and behave byte-identically in Editor and World
// View — with no new domain entities, commands, or transform models.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function createWorldFixture(worldId = 'world-1') {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-1' });
    building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(2, 0, 0), rotation: 0 }));
    building.addBrick(new Brick({ id: 'b', definitionId: 'core:cube', position: new Position(5, 1, 3), rotation: 10 }));
    building.addBrick(new Brick({ id: 'c', definitionId: 'core:cube', position: new Position(9, 2, 6), rotation: 20 }));
    world.addBuilding(building);
    const document = new Document({ world });
    return { world, building, document };
}

function createWorldViewEnvironment(fixture) {
    const session = { getDocument: (id) => (id === 'doc-1' ? fixture.document : null) };
    const histories = new Map([[fixture.world.id, new CommandHistory({ world: fixture.world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    return { service, histories };
}

function createEditorEnvironment(fixture) {
    const session = { getDocument: () => fixture.document };
    const histories = new Map([[fixture.world.id, new CommandHistory({ world: fixture.world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    return { service, histories };
}

const worldViewSelection = (items = null) => SpatialSelectionState.bricks({
    documentId: 'doc-1',
    items: items || [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' },
        { type: 'brick', buildingId: 'building-1', brickId: 'c' }
    ]
});

const editorSelection = () => new SelectionState({
    items: [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' },
        { type: 'brick', buildingId: 'building-1', brickId: 'c' }
    ]
});

function brickPositions(world) {
    const result = {};
    for (const building of world.getBuildings()) {
        for (const brick of building.getBricks()) {
            result[brick.id] = {
                x: brick.position.x,
                y: brick.position.y,
                z: brick.position.z,
                rotation: brick.rotation
            };
        }
    }
    return result;
}

// Pure-math fixture builder: an entry with explicit size, no registry.
function entry(id, x, y, z, size = { x: 1, y: 1, z: 1 }, rotation = 0, buildingId = 'building-1') {
    const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
    return {
        buildingId,
        brickId: id,
        position: { x, y, z },
        rotation,
        bounds: {
            min: { x: x - half.x, y: y - half.y, z: z - half.z },
            center: { x, y, z },
            max: { x: x + half.x, y: y + half.y, z: z + half.z }
        }
    };
}

function selectionBoundsOf(entries) {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const e of entries) {
        for (const axis of ['x', 'y', 'z']) {
            min[axis] = Math.min(min[axis], e.bounds.min[axis]);
            max[axis] = Math.max(max[axis], e.bounds.max[axis]);
        }
    }
    return {
        min,
        max,
        center: {
            x: (min.x + max.x) / 2,
            y: (min.y + max.y) / 2,
            z: (min.z + max.z) / 2
        }
    };
}

// ---------------------------------------------------------------------
// 1. Pure alignment math — X
// ---------------------------------------------------------------------
{
    const entries = [entry('a', 2, 0, 0), entry('b', 5, 1, 3), entry('c', 9, 2, 6)];
    const bounds = selectionBoundsOf(entries);

    const left = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'x-min');
    close(left[0].position.x, 2, 'x-min: A already at min edge');
    close(left[1].position.x, 2, 'x-min: B left edge to selection min');
    close(left[2].position.x, 2, 'x-min: C left edge to selection min');

    const center = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'x-center');
    for (const transform of center) {
        close(transform.position.x, bounds.center.x, 'x-center: center on selection center');
    }

    const right = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'x-max');
    close(right[0].position.x, 9, 'x-max: A right edge to selection max');
    close(right[1].position.x, 9, 'x-max: B right edge to selection max');
    close(right[2].position.x, 9, 'x-max: C already at max edge');

    for (const transform of left) {
        close(transform.position.y, entries.find((e) => e.brickId === transform.brickId).position.y, 'x align leaves Y untouched');
        close(transform.position.z, entries.find((e) => e.brickId === transform.brickId).position.z, 'x align leaves Z untouched');
    }
    console.log('✓ pure alignment math — X');
}

// ---------------------------------------------------------------------
// 2. Pure alignment math — Y
// ---------------------------------------------------------------------
{
    const entries = [entry('a', 0, 0, 0), entry('b', 0, 1, 0), entry('c', 0, 2, 0)];
    const bounds = selectionBoundsOf(entries);
    const bottom = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'y-min');
    for (const transform of bottom) {
        close(transform.position.y, bounds.min.y + 0.5, 'y-min: bottom edges aligned');
    }
    const centerY = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'y-center');
    for (const transform of centerY) {
        close(transform.position.y, bounds.center.y, 'y-center aligned');
    }
    const top = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'y-max');
    for (const transform of top) {
        close(transform.position.y, bounds.max.y - 0.5, 'y-max: top edges aligned');
    }
    console.log('✓ pure alignment math — Y');
}

// ---------------------------------------------------------------------
// 3. Pure alignment math — Z
// ---------------------------------------------------------------------
{
    const entries = [entry('a', 0, 0, 0), entry('b', 0, 0, 3), entry('c', 0, 0, 6)];
    const bounds = selectionBoundsOf(entries);
    const front = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'z-min');
    for (const transform of front) {
        close(transform.position.z, bounds.min.z + 0.5, 'z-min: front edges aligned');
    }
    const centerZ = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'z-center');
    for (const transform of centerZ) {
        close(transform.position.z, bounds.center.z, 'z-center aligned');
    }
    const back = TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'z-max');
    for (const transform of back) {
        close(transform.position.z, bounds.max.z - 0.5, 'z-max: back edges aligned');
    }
    assert(TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'x-bogus') === null, 'unknown mode is null');
    assert(TransformAlignment.calculateAlignmentTransforms(entries, bounds, 'w-min') === null, 'unknown axis is null');
    console.log('✓ pure alignment math — Z (and unknown modes no-op)');
}

// ---------------------------------------------------------------------
// 4. Pure distribution math — X / Y / Z, endpoints pinned
// ---------------------------------------------------------------------
{
    const xEntries = [entry('a', 2, 0, 0), entry('b', 5, 0, 0), entry('c', 9, 0, 0)];
    const xResult = TransformAlignment.calculateDistributionTransforms(xEntries, 'x');
    close(xResult.find((t) => t.brickId === 'a').position.x, 2, 'distribute X: first endpoint pinned');
    close(xResult.find((t) => t.brickId === 'b').position.x, 5.5, 'distribute X: interior evenly spaced');
    close(xResult.find((t) => t.brickId === 'c').position.x, 9, 'distribute X: last endpoint pinned');

    const yEntries = [entry('a', 0, 0, 0), entry('b', 0, 0.5, 0), entry('c', 0, 2, 0)];
    const yResult = TransformAlignment.calculateDistributionTransforms(yEntries, 'y');
    close(yResult.find((t) => t.brickId === 'b').position.y, 1, 'distribute Y: interior evenly spaced');
    close(yResult.find((t) => t.brickId === 'a').position.y, 0, 'distribute Y: first pinned');
    close(yResult.find((t) => t.brickId === 'c').position.y, 2, 'distribute Y: last pinned');

    const zEntries = [entry('a', 0, 0, 0), entry('b', 0, 0, 1), entry('c', 0, 0, 6)];
    const zResult = TransformAlignment.calculateDistributionTransforms(zEntries, 'z');
    close(zResult.find((t) => t.brickId === 'b').position.z, 3, 'distribute Z: interior evenly spaced');
    console.log('✓ pure distribution math — X / Y / Z');
}

// ---------------------------------------------------------------------
// 5. Selection-order independence
// ---------------------------------------------------------------------
{
    const fixtureOne = createWorldFixture('world-order-1');
    const fixtureTwo = createWorldFixture('world-order-2');
    const envOne = createWorldViewEnvironment(fixtureOne);
    const envTwo = createWorldViewEnvironment(fixtureTwo);

    envOne.service.alignSelection(worldViewSelection(), 'x-center');
    envTwo.service.alignSelection(worldViewSelection([
        { type: 'brick', buildingId: 'building-1', brickId: 'c' },
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ]), 'x-center');

    assert(JSON.stringify(brickPositions(fixtureOne.world)) === JSON.stringify(brickPositions(fixtureTwo.world)),
        'same bricks in different selection orders align to identical world state');
    console.log('✓ selection-order independence');
}

// ---------------------------------------------------------------------
// 6. Deterministic ties in distribution ordering
// ---------------------------------------------------------------------
{
    const tied = [entry('b', 2, 0, 0), entry('a', 2, 0, 0), entry('c', 9, 0, 0)];
    const forward = TransformAlignment.calculateDistributionTransforms(tied, 'x');
    const reversed = TransformAlignment.calculateDistributionTransforms([...tied].reverse(), 'x');
    const sortById = (arr) => [...arr].sort((a, b) => a.brickId.localeCompare(b.brickId));
    assert(JSON.stringify(sortById(forward)) === JSON.stringify(sortById(reversed)),
        'equal coordinates produce identical transform targets regardless of input order');
    const byId = forward.map((t) => t.brickId).join(',');
    assert(byId === 'b,a,c' || byId === 'a,b,c', 'input order preserved in output shape');
    close(forward.find((t) => t.brickId === 'c').position.x, 9, 'tied distribution keeps endpoint pinned');
    console.log('✓ deterministic tie-breaking');
}

// ---------------------------------------------------------------------
// 7. Two-brick distribution is a no-op
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const two = worldViewSelection([
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ]);
    assert(service.distributeSelection(two, 'x') === false, 'two-brick distribution reports no-op');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 0,
        'two-brick distribution creates zero history entries');
    assert(TransformAlignment.calculateDistributionTransforms([entry('a', 0, 0, 0), entry('b', 5, 0, 0)], 'x') === null,
        'pure distribution rejects fewer than three entries');
    console.log('✓ two-brick distribution no-op');
}

// ---------------------------------------------------------------------
// 8. Already-aligned selection is a no-op
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    // All three cubes already share the same Y center? No — y 0,1,2.
    // Use X distribution on an already-even arrangement instead:
    const before = brickPositions(fixture.world);
    assert(service.alignSelection(worldViewSelection(), 'y-center') === true, 'sanity: y-center does work here');
    histories.get(fixture.world.id).undo();
    assert(JSON.stringify(brickPositions(fixture.world)) === JSON.stringify(before), 'sanity undo');

    // Align twice: the second call must be a no-op.
    assert(service.alignSelection(worldViewSelection(), 'x-center') === true, 'first align commits');
    const cursorAfterFirst = histories.get(fixture.world.id).getCursor();
    assert(service.alignSelection(worldViewSelection(), 'x-center') === false, 'already-aligned selection no-ops');
    assert(histories.get(fixture.world.id).getCursor() === cursorAfterFirst,
        'already-aligned selection creates zero history entries');

    // All centers identical -> distribution no-op.
    assert(TransformAlignment.calculateDistributionTransforms(
        [entry('a', 4, 0, 0), entry('b', 4, 1, 0), entry('c', 4, 2, 0)], 'x'
    ) === null, 'zero-span distribution is null');
    console.log('✓ already-aligned selections no-op');
}

// ---------------------------------------------------------------------
// 9. Exact floating-point behavior — no unnecessary rounding
// ---------------------------------------------------------------------
{
    const entries = [entry('a', 0, 0, 0), entry('b', 1, 0, 0), entry('c', 3, 0, 0)];
    const result = TransformAlignment.calculateDistributionTransforms(entries, 'x');
    const middle = result.find((t) => t.brickId === 'b');
    assert(middle.position.x === 1.5, 'distribution targets are exact doubles, not rounded');
    assert(result.find((t) => t.brickId === 'a').position.x === 0, 'pinned endpoint is bit-exact');
    assert(result.find((t) => t.brickId === 'c').position.x === 3, 'pinned endpoint is bit-exact');

    const uneven = [entry('a', 0, 0, 0), entry('b', 0.3, 0, 0), entry('c', 1, 0, 0)];
    const unevenResult = TransformAlignment.calculateDistributionTransforms(uneven, 'x');
    assert(unevenResult.find((t) => t.brickId === 'b').position.x === 0.5,
        'fractional spans distribute exactly');
    console.log('✓ exact floating-point behavior');
}

// ---------------------------------------------------------------------
// 10. Multi-building selection
// ---------------------------------------------------------------------
{
    const world = new World({ id: 'world-multi' });
    const buildingOne = new Building({ id: 'building-1' });
    buildingOne.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(2, 0, 0), rotation: 0 }));
    buildingOne.addBrick(new Brick({ id: 'b', definitionId: 'core:cube', position: new Position(5, 4, 0), rotation: 0 }));
    const buildingTwo = new Building({ id: 'building-2' });
    buildingTwo.addBrick(new Brick({ id: 'd', definitionId: 'core:cube', position: new Position(7, 8, 0), rotation: 45 }));
    world.addBuilding(buildingOne);
    world.addBuilding(buildingTwo);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc-1' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());

    const selection = worldViewSelection([
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' },
        { type: 'brick', buildingId: 'building-2', brickId: 'd' }
    ]);
    assert(service.alignSelection(selection, 'y-center') === true, 'multi-building alignment commits');
    const positions = brickPositions(world);
    const targetY = 4; // bounds center y between -0.5 and 8.5
    close(positions.a.y, targetY, 'building-1 brick A aligned');
    close(positions.b.y, targetY, 'building-1 brick B aligned');
    close(positions.d.y, targetY, 'building-2 brick D aligned');
    close(positions.d.rotation, 45, 'second-building rotation preserved');
    console.log('✓ multi-building selection');
}

// ---------------------------------------------------------------------
// 11. Group membership invariance
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const itemsBefore = JSON.stringify(selection.items);
    const bricksBefore = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    const buildingsBefore = fixture.world.getBuildings().length;

    service.alignSelection(selection, 'x-center');
    service.distributeSelection(selection, 'z');

    assert(JSON.stringify(selection.items) === itemsBefore, 'selection items unchanged');
    const bricksAfter = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    assert(bricksAfter === bricksBefore, 'membership unchanged by align/distribute');
    assert(fixture.world.getBuildings().length === buildingsBefore, 'world structure unchanged');
    console.log('✓ group/membership invariance');
}

// ---------------------------------------------------------------------
// 12. Exactly one command per operation
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    service.alignSelection(worldViewSelection(), 'x-center');
    assert(history.getCursor() === 1, 'alignment cursor +1');
    const alignCommand = history.getExecutedCommands()[0];
    assert(alignCommand.type === 'transform-selection', 'alignment emits transform-selection');
    assert(alignCommand.describe() === 'Align 3 Bricks', 'alignment description');
    service.distributeSelection(worldViewSelection(), 'z');
    assert(history.getCursor() === 2, 'distribution cursor +1');
    assert(history.getExecutedCommands()[1].type === 'transform-selection', 'distribution emits transform-selection');
    console.log('✓ exactly one transform-selection command per operation');
}

// ---------------------------------------------------------------------
// 13 + 14. Undo restores exactly; redo reapplies exactly
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    const before = brickPositions(fixture.world);
    service.alignSelection(worldViewSelection(), 'x-center');
    const aligned = brickPositions(fixture.world);
    assert(JSON.stringify(aligned) !== JSON.stringify(before), 'alignment changed the world');

    history.undo();
    const undone = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        assert(undone[id].x === before[id].x, `undo restores ${id}.x exactly`);
        assert(undone[id].y === before[id].y, `undo restores ${id}.y exactly`);
        assert(undone[id].z === before[id].z, `undo restores ${id}.z exactly`);
        assert(undone[id].rotation === before[id].rotation, `undo restores ${id}.rotation exactly`);
    }

    history.redo();
    const redone = brickPositions(fixture.world);
    assert(JSON.stringify(redone) === JSON.stringify(aligned), 'redo reapplies the aligned transforms exactly');
    console.log('✓ undo/redo exactness');
}

// ---------------------------------------------------------------------
// 15. Serialized command replays to identical results
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    service.distributeSelection(worldViewSelection(), 'x');
    const postPositions = brickPositions(fixture.world);
    const originalTransformsJson = JSON.stringify(history.getExecutedCommands()[0].toJSON().transforms);

    const registry = new CreateCommandRegistryUseCase().execute();
    const freshWorld = World.fromJSON(fixture.world.toJSON());
    const restored = CommandHistory.fromJSON(history.toJSON(), { world: freshWorld }, registry);
    restored.undo();
    restored.redo();
    const replayed = brickPositions(freshWorld);
    for (const id of ['a', 'b', 'c']) {
        close(replayed[id].x, postPositions[id].x, `replayed distribution reproduces ${id}.x`);
        close(replayed[id].rotation, postPositions[id].rotation, `replayed distribution reproduces ${id}.rotation`);
    }
    assert(JSON.stringify(restored.getExecutedCommands()[0].toJSON().transforms) === originalTransformsJson,
        'replayed command transforms are byte-equivalent');
    console.log('✓ serialized replay');
}

// ---------------------------------------------------------------------
// 16. Editor / World View parity
// ---------------------------------------------------------------------
{
    const worldFixture = createWorldFixture('world-parity');
    const editorFixture = createWorldFixture('world-parity');
    const worldEnv = createWorldViewEnvironment(worldFixture);
    const editorEnv = createEditorEnvironment(editorFixture);

    worldEnv.service.alignSelection(worldViewSelection(), 'x-center');
    editorEnv.service.alignSelection(editorSelection(), 'x-center');

    const worldCommand = worldEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    const editorCommand = editorEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    assert(worldCommand.type === 'transform-selection' && editorCommand.type === 'transform-selection',
        'both surfaces emit transform-selection');
    assert(JSON.stringify(worldCommand.transforms) === JSON.stringify(editorCommand.transforms),
        'identical absolute transform arrays across surfaces');
    assert(worldCommand.description === editorCommand.description, 'identical descriptions');
    assert(JSON.stringify(brickPositions(worldFixture.world)) === JSON.stringify(brickPositions(editorFixture.world)),
        'identical world state across surfaces');

    // Distribution parity as well.
    const worldDistFixture = createWorldFixture('world-parity-dist');
    const editorDistFixture = createWorldFixture('world-parity-dist');
    const worldDistEnv = createWorldViewEnvironment(worldDistFixture);
    const editorDistEnv = createEditorEnvironment(editorDistFixture);
    worldDistEnv.service.distributeSelection(worldViewSelection(), 'z');
    editorDistEnv.service.distributeSelection(editorSelection(), 'z');
    const worldDistCommand = worldDistEnv.histories.get('world-parity-dist').getExecutedCommands()[0].toJSON();
    const editorDistCommand = editorDistEnv.histories.get('world-parity-dist').getExecutedCommands()[0].toJSON();
    assert(JSON.stringify(worldDistCommand.transforms) === JSON.stringify(editorDistCommand.transforms),
        'identical distribution transforms across surfaces');
    console.log('✓ Editor/World View parity');
}

// ---------------------------------------------------------------------
// 17. Flagship: exact targets with snapping ENABLED — and exact undo
// ---------------------------------------------------------------------
{
    // Centers 1.37 / 4.91 / 9.26. The service here runs with DEFAULT
    // TransformSettings (translation snap 1, rotation snap 15) — the
    // alignment target must land EXACTLY on the selection bounds center,
    // never re-snapped. Then undo must restore the originals exactly.
    const world = new World({ id: 'world-flagship' });
    const building = new Building({ id: 'building-1' });
    building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(1.37, 0, 0), rotation: 0 }));
    building.addBrick(new Brick({ id: 'b', definitionId: 'core:cube', position: new Position(4.91, 7, 3), rotation: 90 }));
    building.addBrick(new Brick({ id: 'c', definitionId: 'core:cube', position: new Position(9.26, 1, 6), rotation: 45 }));
    world.addBuilding(building);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc-1' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    const history = histories.get(world.id);
    const selection = worldViewSelection();

    const selectionCenterX = ((1.37 - 0.5) + (9.26 + 0.5)) / 2; // bounds center
    const committed = service.alignSelection(selection, 'x-center');
    assert(committed === true, 'flagship alignment commits');
    assert(history.getExecutedCommands().length === 1, 'flagship is exactly one command');

    const after = brickPositions(world);
    for (const id of ['a', 'b', 'c']) {
        close(after[id].x, selectionCenterX, `flagship: ${id} center on selection center`);
        assert(Math.abs(after[id].x - Math.round(after[id].x)) > 1e-6,
            `flagship: ${id} target NOT snapped to the grid`);
    }
    close(after.a.y, 0, 'flagship: Y unchanged');
    close(after.b.y, 7, 'flagship: Y unchanged');
    close(after.b.z, 3, 'flagship: Z unchanged');
    close(after.a.rotation, 0, 'flagship: rotation unchanged');
    close(after.b.rotation, 90, 'flagship: rotation unchanged');
    close(after.c.rotation, 45, 'flagship: rotation unchanged');

    history.undo();
    const undone = brickPositions(world);
    assert(undone.a.x === 1.37, 'flagship undo restores 1.37 exactly');
    assert(undone.b.x === 4.91, 'flagship undo restores 4.91 exactly');
    assert(undone.c.x === 9.26, 'flagship undo restores 9.26 exactly');
    console.log('✓ flagship: exact geometric targets, snap-independent, exact undo');
}

// ---------------------------------------------------------------------
// 18. No accidental scale / rotations preserved everywhere
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    service.alignSelection(worldViewSelection(), 'z-max');
    service.distributeSelection(worldViewSelection(), 'x');
    const after = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        assert(after[id].rotation === before[id].rotation, `rotation of ${id} preserved through both operations`);
    }
    console.log('✓ rotations preserved (no accidental scale/orientation changes)');
}

console.log('\nAll transform alignment tests passed.');
