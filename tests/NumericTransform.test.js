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
import { TransformInput } from '../application/TransformInput.js';
import { TransformMath } from '../application/TransformMath.js';

// 0.1.49 — Numeric Transform Input tests.
//
// The acceptance sentence, encoded: exact numeric translation and
// Y-rotation can be applied to any resolved selection through the
// existing transform machinery, with absolute/relative semantics, no
// gesture snapping, exactly one existing TransformSelectionCommand per
// Apply, exact undo/redo/replay, and byte-identical parity with
// equivalent keyboard and gizmo transforms — without a new command,
// entity, transform model, or persistent editing mode.

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

// Selection bounds: min (1.5,-0.5,-0.5) max (9.5,2.5,6.5)
// → pivot (5.5, 1, 3). Primary item = last = brick c (rotation 20).
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

// Simulates what TransformGizmoController does for an axis drag, using
// the exact math the real controller uses (TransformMath).
function simulateAxisDrag(service, selection, axis, startPoint, endPoint, steps = 4) {
    service.beginTransformGesture(selection, { mode: 'translate', axis });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const point = {
            x: startPoint.x + (endPoint.x - startPoint.x) * t,
            y: startPoint.y + (endPoint.y - startPoint.y) * t,
            z: startPoint.z + (endPoint.z - startPoint.z) * t
        };
        const translation = TransformMath.projectDeltaOntoAxis(axis, startPoint, point);
        service.previewTransformGesture(selection, { translation });
    }
    const translation = TransformMath.projectDeltaOntoAxis(axis, startPoint, endPoint);
    return service.commitTransformGesture(selection, { translation });
}

function simulateRotationDrag(service, selection, pivot, startPoint, endPoint) {
    service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
    const rotation = TransformMath.rotationDeltaFromPoints(pivot, startPoint, endPoint);
    service.previewTransformGesture(selection, { rotation });
    return service.commitTransformGesture(selection, { rotation });
}

// ---------------------------------------------------------------------
// 1. Integer parsing
// ---------------------------------------------------------------------
{
    const parsed = TransformInput.parseNumericValue('10');
    assert(parsed.valid === true && parsed.value === 10, 'integer parses');
    assert(TransformInput.parseNumericValue('0').value === 0, 'zero parses');
    console.log('✓ integer parsing');
}

// ---------------------------------------------------------------------
// 2. Decimal parsing
// ---------------------------------------------------------------------
{
    close(TransformInput.parseNumericValue('10.5').value, 10.5, 'decimal parses');
    close(TransformInput.parseNumericValue('.5').value, 0.5, 'leading-dot decimal parses');
    close(TransformInput.parseNumericValue('0.5').value, 0.5, 'zero-prefixed decimal parses');
    console.log('✓ decimal parsing');
}

// ---------------------------------------------------------------------
// 3. Negative parsing
// ---------------------------------------------------------------------
{
    close(TransformInput.parseNumericValue('-3.75').value, -3.75, 'negative parses');
    close(TransformInput.parseNumericValue('+2').value, 2, 'explicit positive parses');
    console.log('✓ negative parsing');
}

// ---------------------------------------------------------------------
// 4. Whitespace
// ---------------------------------------------------------------------
{
    close(TransformInput.parseNumericValue('  10  ').value, 10, 'surrounding whitespace ignored');
    close(TransformInput.parseNumericValue('\t-2.5\n').value, -2.5, 'tabs and newlines ignored');
    console.log('✓ whitespace handling');
}

// ---------------------------------------------------------------------
// 5. Invalid input
// ---------------------------------------------------------------------
{
    for (const text of ['abc', '10foo', '1..5', '', ' ', '1.2.3', '--2', '++2']) {
        const parsed = TransformInput.parseNumericValue(text);
        assert(parsed.valid === false, `"${text}" rejected`);
        assert(parsed.reason === 'invalid-number' || parsed.reason === 'empty', `"${text}" has a structured reason`);
    }
    assert(TransformInput.parseNumericValue('').reason === 'empty', 'empty is distinct from invalid');
    console.log('✓ invalid input rejection');
}

// ---------------------------------------------------------------------
// 6. Infinity / NaN / exponent rejection
// ---------------------------------------------------------------------
{
    for (const text of ['Infinity', '-Infinity', 'NaN', '1e999', '1e2', 'infinity', 'nan']) {
        assert(TransformInput.parseNumericValue(text).valid === false, `"${text}" rejected`);
    }
    console.log('✓ Infinity/NaN/exponent rejection');
}

// ---------------------------------------------------------------------
// 7. Absolute translation (pivot-target semantics)
// ---------------------------------------------------------------------
{
    // Pivot is (5.5, 1, 3). Absolute X = 10 → every member shifts by
    // +4.5; internal geometry preserved.
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    const committed = service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 10, y: null, z: null }, rotation: null },
        { absolute: true }
    );
    assert(committed === true, 'absolute translation commits');
    const after = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        close(after[id].x, before[id].x + 4.5, `absolute X: ${id} shifted by pivot delta`);
        close(after[id].y, before[id].y, `absolute X: ${id}.y untouched`);
        close(after[id].z, before[id].z, `absolute X: ${id}.z untouched`);
    }
    close(after.b.x - after.a.x, before.b.x - before.a.x, 'internal geometry preserved');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 1, 'one command');
    console.log('✓ absolute translation');
}

// ---------------------------------------------------------------------
// 8. Relative translation (offset semantics)
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    const committed = service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 5, y: -2.5, z: 0.75 }, rotation: null },
        { absolute: false }
    );
    assert(committed === true, 'relative translation commits');
    const after = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        close(after[id].x, before[id].x + 5, `relative: ${id}.x +5`);
        close(after[id].y, before[id].y - 2.5, `relative: ${id}.y -2.5`);
        close(after[id].z, before[id].z + 0.75, `relative: ${id}.z +0.75`);
    }
    console.log('✓ relative translation');
}

// ---------------------------------------------------------------------
// 9. Partial X/Y/Z input — empty means unchanged, not zero
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 1, y: null, z: null }, rotation: null },
        { absolute: false }
    );
    const after = brickPositions(fixture.world);
    close(after.a.x, before.a.x + 1, 'entered axis changes');
    close(after.a.y, before.a.y, 'empty Y stays unchanged');
    close(after.a.z, before.a.z, 'empty Z stays unchanged');

    // parsePanelInput: empty fields become null, partial intents keep
    // their shape.
    const parsed = TransformInput.parsePanelInput({ x: '10', y: '', z: '', rotation: '' });
    assert(parsed.valid === true, 'partial panel input valid');
    assert(parsed.translation.y === null && parsed.translation.z === null, 'empty fields are null');
    assert(parsed.rotation === null, 'empty rotation is null');
    const empty = TransformInput.parsePanelInput({});
    assert(empty.valid === true && empty.translation === null && empty.rotation === null,
        'all-empty panel input is a valid no-op intent');
    console.log('✓ partial X/Y/Z input');
}

// ---------------------------------------------------------------------
// 10. Absolute rotation (primary-brick target)
// ---------------------------------------------------------------------
{
    // Primary brick is c with rotation 20. Absolute 90 → delta 70 for
    // every member; relative orientations preserved.
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    const committed = service.applyNumericTransform(
        worldViewSelection(),
        { translation: null, rotation: 90 },
        { absolute: true }
    );
    assert(committed === true, 'absolute rotation commits');
    const after = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        close(after[id].x, before[id].x, `absolute rotation leaves ${id}.x untouched`);
    }
    console.log('✓ absolute rotation');
}

// ---------------------------------------------------------------------
// 11. Relative rotation
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(
        worldViewSelection(),
        { translation: null, rotation: -45 },
        { absolute: false }
    );
    const after = brickPositions(fixture.world);
    close(after.a.rotation, before.a.rotation - 45, 'relative rotation a');
    close(after.b.rotation, before.b.rotation - 45, 'relative rotation b');
    close(after.c.rotation, before.c.rotation - 45, 'relative rotation c');
    console.log('✓ relative rotation');
}

// ---------------------------------------------------------------------
// 12. Single-brick pivot
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const single = worldViewSelection([{ type: 'brick', buildingId: 'building-1', brickId: 'b' }]);
    // Brick b sits at (5, 1, 3). Absolute X = 10 moves the brick itself
    // to X = 10 (pivot == own center for a single brick).
    service.applyNumericTransform(single, { translation: { x: 10, y: null, z: null }, rotation: null }, { absolute: true });
    close(fixture.building.findBrick('b').position.x, 10, 'single-brick absolute lands exactly');
    close(fixture.building.findBrick('b').position.y, 1, 'single-brick Y untouched');
    console.log('✓ single-brick pivot');
}

// ---------------------------------------------------------------------
// 13. Multi-selection pivot
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 0, y: 10, z: null }, rotation: null },
        { absolute: true }
    );
    const after = brickPositions(fixture.world);
    // Pivot y = 1 → target 10 → delta +9 for all members.
    for (const id of ['a', 'b', 'c']) {
        close(after[id].y, before[id].y + 9, `multi pivot: ${id} shifted identically`);
    }
    close(after.c.y - after.a.y, before.c.y - before.a.y, 'multi-selection spacing preserved');
    console.log('✓ multi-selection pivot');
}

// ---------------------------------------------------------------------
// 14. Group-resolved selection semantics
// ---------------------------------------------------------------------
{
    // A group selection arrives as plain items[] — numeric input sees
    // exactly what every other input sees, and behaves identically.
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const resolved = worldViewSelection(); // flattened member bricks
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(resolved, { translation: { x: 3, y: null, z: null }, rotation: null }, { absolute: false });
    const after = brickPositions(fixture.world);
    close(after.a.x, before.a.x + 3, 'resolved group member moved');
    close(after.c.x, before.c.x + 3, 'resolved group member moved');
    console.log('✓ group-resolved selection');
}

// ---------------------------------------------------------------------
// 15. Exact floating-point preservation
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const single = worldViewSelection([{ type: 'brick', buildingId: 'building-1', brickId: 'a' }]);
    service.applyNumericTransform(single, { translation: { x: 2.37, y: null, z: null }, rotation: null }, { absolute: true });
    assert(fixture.building.findBrick('a').position.x === 2.37, '2.37 preserved exactly');
    console.log('✓ exact floating-point preservation');
}

// ---------------------------------------------------------------------
// 16. FLAGSHIP — numeric input bypasses snapping
// ---------------------------------------------------------------------
{
    // Default TransformSettings: snapping ENABLED, translationSnap = 1.
    // Pivot X = 4.37 (single brick). Numeric X = 10 must land at EXACTLY
    // 10 — a snapped pipeline would have produced delta 6 → 10.37.
    const world = new World({ id: 'world-flagship' });
    const building = new Building({ id: 'building-1' });
    building.addBrick(new Brick({ id: 'p', definitionId: 'core:cube', position: new Position(4.37, 0, 0), rotation: 0 }));
    world.addBuilding(building);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc-1' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    const selection = SpatialSelectionState.brick({ documentId: 'doc-1', buildingId: 'building-1', brickId: 'p' });

    assert(service.transformSettings.snappingEnabled === true, 'snapping is enabled for this test');
    close(service.transformSettings.translationSnap, 1, 'translation snap is 1');

    const committed = service.applyNumericTransform(
        selection,
        { translation: { x: 10, y: null, z: null }, rotation: null },
        { absolute: true }
    );
    assert(committed === true, 'flagship commits');
    assert(building.findBrick('p').position.x === 10, 'flagship: pivot lands EXACTLY on 10 despite snap=1');

    histories.get(world.id).undo();
    assert(building.findBrick('p').position.x === 4.37, 'flagship: undo restores 4.37 EXACTLY');
    console.log('✓ FLAGSHIP: numeric bypasses gesture snapping, undo exact');
}

// ---------------------------------------------------------------------
// 17. Already-at-target no-op
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    // Pivot is (5.5, 1, 3): absolute X = 5.5 changes nothing.
    const committed = service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 5.5, y: 1, z: 3 }, rotation: null },
        { absolute: true }
    );
    assert(committed === false, 'already-at-target reports no-op');
    // Absolute rotation equal to the primary's current rotation (20).
    const committedRot = service.applyNumericTransform(
        worldViewSelection(),
        { translation: null, rotation: 20 },
        { absolute: true }
    );
    assert(committedRot === false, 'already-at-rotation reports no-op');
    // Relative zero.
    const committedZero = service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 0, y: 0, z: 0 }, rotation: 0 },
        { absolute: false }
    );
    assert(committedZero === false, 'zero offset reports no-op');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 0,
        'no-op numeric input creates zero history entries');
    console.log('✓ already-at-target no-op');
}

// ---------------------------------------------------------------------
// 18. One Apply → one command (translation + rotation combined)
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    const committed = service.applyNumericTransform(
        worldViewSelection(),
        { translation: { x: 1, y: null, z: null }, rotation: 15 },
        { absolute: false }
    );
    assert(committed === true, 'combined apply commits');
    assert(history.getCursor() === 1, 'combined apply is exactly one history entry');
    assert(history.getExecutedCommands()[0].type === 'transform-selection',
        'combined apply emits transform-selection');
    console.log('✓ one Apply → one command');
}

// ---------------------------------------------------------------------
// 19. Undo restores exactly
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(worldViewSelection(), { translation: { x: 7, y: -1, z: 2 }, rotation: 30 }, { absolute: false });
    history.undo();
    const undone = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        assert(undone[id].x === before[id].x, `undo restores ${id}.x exactly`);
        assert(undone[id].y === before[id].y, `undo restores ${id}.y exactly`);
        assert(undone[id].z === before[id].z, `undo restores ${id}.z exactly`);
        assert(undone[id].rotation === before[id].rotation, `undo restores ${id}.rotation exactly`);
    }
    console.log('✓ undo exactness');
}

// ---------------------------------------------------------------------
// 20. Redo reapplies exactly
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    service.applyNumericTransform(worldViewSelection(), { translation: { x: 7, y: null, z: null }, rotation: null }, { absolute: false });
    const applied = brickPositions(fixture.world);
    history.undo();
    history.redo();
    const redone = brickPositions(fixture.world);
    assert(JSON.stringify(redone) === JSON.stringify(applied), 'redo reapplies exactly');
    console.log('✓ redo exactness');
}

// ---------------------------------------------------------------------
// 21. Serialization roundtrip
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    service.applyNumericTransform(worldViewSelection(), { translation: { x: 2.5, y: null, z: null }, rotation: 45 }, { absolute: false });
    const postPositions = brickPositions(fixture.world);
    const originalTransformsJson = JSON.stringify(history.getExecutedCommands()[0].toJSON().transforms);

    const registry = new CreateCommandRegistryUseCase().execute();
    const freshWorld = World.fromJSON(fixture.world.toJSON());
    const restored = CommandHistory.fromJSON(history.toJSON(), { world: freshWorld }, registry);
    assert(JSON.stringify(restored.getExecutedCommands()[0].toJSON().transforms) === originalTransformsJson,
        'serialized numeric command transforms are byte-equivalent');
    restored.undo();
    restored.redo();
    const replayed = brickPositions(freshWorld);
    for (const id of ['a', 'b', 'c']) {
        close(replayed[id].x, postPositions[id].x, `replay reproduces ${id}.x`);
        close(replayed[id].rotation, postPositions[id].rotation, `replay reproduces ${id}.rotation`);
    }
    console.log('✓ serialization roundtrip');
}

// ---------------------------------------------------------------------
// 22. Editor / World View parity
// ---------------------------------------------------------------------
{
    const worldFixture = createWorldFixture('world-parity');
    const editorFixture = createWorldFixture('world-parity');
    const worldEnv = createWorldViewEnvironment(worldFixture);
    const editorEnv = createEditorEnvironment(editorFixture);

    worldEnv.service.applyNumericTransform(worldViewSelection(), { translation: { x: 10, y: null, z: null }, rotation: 30 }, { absolute: true });
    editorEnv.service.applyNumericTransform(editorSelection(), { translation: { x: 10, y: null, z: null }, rotation: 30 }, { absolute: true });

    const worldCommand = worldEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    const editorCommand = editorEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    assert(worldCommand.type === 'transform-selection' && editorCommand.type === 'transform-selection',
        'both surfaces emit transform-selection');
    assert(JSON.stringify(worldCommand.transforms) === JSON.stringify(editorCommand.transforms),
        'identical absolute transform arrays across surfaces');
    assert(worldCommand.description === editorCommand.description, 'identical descriptions');
    console.log('✓ Editor/World View parity');
}

// ---------------------------------------------------------------------
// 23. Numeric vs keyboard parity
// ---------------------------------------------------------------------
{
    const numericFixture = createWorldFixture('world-kbpar');
    const keyboardFixture = createWorldFixture('world-kbpar');
    const numericEnv = createWorldViewEnvironment(numericFixture);
    const keyboardEnv = createWorldViewEnvironment(keyboardFixture);

    numericEnv.service.applyNumericTransform(worldViewSelection(), { translation: { x: 3, y: 0, z: 0 }, rotation: null }, { absolute: false });
    keyboardEnv.service.moveSelection(worldViewSelection(), { x: 3, y: 0, z: 0 });

    const numericCommand = numericEnv.histories.get('world-kbpar').getExecutedCommands()[0].toJSON();
    const keyboardCommand = keyboardEnv.histories.get('world-kbpar').getExecutedCommands()[0].toJSON();
    assert(JSON.stringify(numericCommand.transforms) === JSON.stringify(keyboardCommand.transforms),
        'numeric +3 === keyboard +3 (byte-identical transforms)');
    console.log('✓ numeric vs keyboard parity');
}

// ---------------------------------------------------------------------
// 24. Numeric vs gizmo parity — and the three-way rotation trio
// ---------------------------------------------------------------------
{
    // Translation: numeric offset +10 vs a gizmo drag whose raw delta
    // snaps to +10.
    const numericFixture = createWorldFixture('world-gizpar');
    const gizmoFixture = createWorldFixture('world-gizpar');
    const numericEnv = createWorldViewEnvironment(numericFixture);
    const gizmoEnv = createWorldViewEnvironment(gizmoFixture);

    numericEnv.service.applyNumericTransform(worldViewSelection(), { translation: { x: 10, y: 0, z: 0 }, rotation: null }, { absolute: false });
    simulateAxisDrag(gizmoEnv.service, worldViewSelection(), 'x', { x: 0, y: 0, z: 0 }, { x: 10.4, y: 0, z: 0 });

    const numericCommand = numericEnv.histories.get('world-gizpar').getExecutedCommands()[0].toJSON();
    const gizmoCommand = gizmoEnv.histories.get('world-gizpar').getExecutedCommands()[0].toJSON();
    assert(JSON.stringify(numericCommand.transforms) === JSON.stringify(gizmoCommand.transforms),
        'numeric +10 === gizmo drag snapped to +10');

    // Rotation trio: keyboard R (90) vs numeric 90 vs gizmo drag 90 —
    // bricks at rotation 0 make absolute numeric === relative.
    const trioFixture = (id) => {
        const world = new World({ id });
        const building = new Building({ id: 'building-1' });
        building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(-2, 0, 0), rotation: 0 }));
        building.addBrick(new Brick({ id: 'b', definitionId: 'core:cube', position: new Position(2, 0, 0), rotation: 0 }));
        world.addBuilding(building);
        return { world, building, document: new Document({ world }) };
    };
    const keyboardTrio = createWorldViewEnvironment(trioFixture('world-trio-kb'));
    const numericTrio = createWorldViewEnvironment(trioFixture('world-trio-num'));
    const gizmoTrio = createWorldViewEnvironment(trioFixture('world-trio-giz'));
    const trioSelection = worldViewSelection([
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ]);

    keyboardTrio.service.rotateSelection(trioSelection, 90); // keyboard R, snaps 90→90
    numericTrio.service.applyNumericTransform(trioSelection, { translation: null, rotation: 90 }, { absolute: true });
    simulateRotationDrag(gizmoTrio.service, trioSelection, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 2 });

    const keyboardJson = JSON.stringify(keyboardTrio.histories.get('world-trio-kb').getExecutedCommands()[0].toJSON().transforms);
    const numericJson = JSON.stringify(numericTrio.histories.get('world-trio-num').getExecutedCommands()[0].toJSON().transforms);
    const gizmoJson = JSON.stringify(gizmoTrio.histories.get('world-trio-giz').getExecutedCommands()[0].toJSON().transforms);
    assert(keyboardJson === numericJson && numericJson === gizmoJson,
        'keyboard R === numeric 90 === gizmo 90 (identical serialized transforms)');
    console.log('✓ numeric vs gizmo parity (including the three-way rotation trio)');
}

// ---------------------------------------------------------------------
// 25. Rotation preservation during translation
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(worldViewSelection(), { translation: { x: 4, y: 2, z: -1 }, rotation: null }, { absolute: false });
    const after = brickPositions(fixture.world);
    for (const id of ['a', 'b', 'c']) {
        assert(after[id].rotation === before[id].rotation, `translation preserves ${id}.rotation`);
    }
    console.log('✓ rotation preservation during translation');
}

// ---------------------------------------------------------------------
// 26. Translation preservation during rotation
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const single = worldViewSelection([{ type: 'brick', buildingId: 'building-1', brickId: 'b' }]);
    const before = brickPositions(fixture.world);
    service.applyNumericTransform(single, { translation: null, rotation: 90 }, { absolute: false });
    const after = brickPositions(fixture.world);
    // A single brick rotates around its own center — its position must
    // not move.
    close(after.b.x, before.b.x, 'rotation leaves single-brick position x');
    close(after.b.y, before.b.y, 'rotation leaves single-brick position y');
    close(after.b.z, before.b.z, 'rotation leaves single-brick position z');
    close(after.b.rotation, before.b.rotation + 90, 'rotation applied');
    console.log('✓ translation preservation during rotation');
}

// ---------------------------------------------------------------------
// 27. Group membership invariance
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const itemsBefore = JSON.stringify(selection.items);
    const bricksBefore = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    service.applyNumericTransform(selection, { translation: { x: 6, y: null, z: null }, rotation: 90 }, { absolute: false });
    assert(JSON.stringify(selection.items) === itemsBefore, 'selection items unchanged');
    const bricksAfter = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    assert(bricksAfter === bricksBefore, 'membership unchanged by numeric transform');
    assert(fixture.world.getBuildings().length === 1, 'world structure unchanged');
    console.log('✓ group membership invariance');
}

console.log('\nAll numeric transform tests passed.');
