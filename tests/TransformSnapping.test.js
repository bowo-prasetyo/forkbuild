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
import { TransformMath } from '../application/TransformMath.js';
import { TransformSnap } from '../application/TransformSnap.js';
import { TransformSettings } from '../application/TransformSettings.js';

// 0.1.47 — Transform Precision, Snapping & Editing Polish tests.
//
// Deliberately mathematical, not UI-oriented. Snapping lives in the
// gesture transaction (SpatialEditingService) as a pure function of
// (raw gesture delta, TransformSettings, modifier state), so everything
// that matters can be exercised headlessly: the snap tables, gesture-
// origin semantics, multi-selection preservation, preview stability,
// no-op discipline, one-command commits, undo/redo, replay, parity
// between Editor and World View — and the flagship keyboard/gizmo
// parity: a keyboard transform must be byte-identical to an
// equivalently-snapped gizmo gesture.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function createWorldFixture(worldId = 'world-1') {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-1' });
    building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(0, 0, 0), rotation: 0 }));
    building.addBrick(new Brick({ id: 'b', definitionId: 'core:plate_2x4', position: new Position(4, 0, 0), rotation: 10 }));
    world.addBuilding(building);
    const document = new Document({ world });
    return { world, building, document };
}

function createWorldViewEnvironment(fixture, transformSettings = null) {
    const session = { getDocument: (id) => (id === 'doc-1' ? fixture.document : null) };
    const histories = new Map([[fixture.world.id, new CommandHistory({ world: fixture.world })]]);
    const service = transformSettings
        ? new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute(), transformSettings)
        : new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    return { service, histories };
}

function createEditorEnvironment(fixture, transformSettings = null) {
    const session = { getDocument: () => fixture.document };
    const histories = new Map([[fixture.world.id, new CommandHistory({ world: fixture.world })]]);
    const service = transformSettings
        ? new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute(), transformSettings)
        : new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    return { service, histories };
}

const worldViewSelection = () => SpatialSelectionState.bricks({
    documentId: 'doc-1',
    items: [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ]
});

const editorSelection = () => new SelectionState({
    items: [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ]
});

// Simulates what TransformGizmoController does for an axis drag: begin,
// N preview frames built from projected pointer points, then one commit.
// Uses TransformMath.projectDeltaOntoAxis — the exact function the real
// controller calls between its raycasts.
function simulateAxisDrag(service, selection, axis, startPoint, endPoint, gestureOptions = {}, steps = 4) {
    service.beginTransformGesture(selection, { mode: 'translate', axis });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const point = {
            x: startPoint.x + (endPoint.x - startPoint.x) * t,
            y: startPoint.y + (endPoint.y - startPoint.y) * t,
            z: startPoint.z + (endPoint.z - startPoint.z) * t
        };
        const translation = TransformMath.projectDeltaOntoAxis(axis, startPoint, point);
        service.previewTransformGesture(selection, { translation }, gestureOptions);
    }
    const translation = TransformMath.projectDeltaOntoAxis(axis, startPoint, endPoint);
    return service.commitTransformGesture(selection, { translation }, gestureOptions);
}

function brickPositions(world) {
    const bricks = world.getBuildings()[0].getBricks();
    const result = {};
    for (const brick of bricks) {
        result[brick.id] = { x: brick.position.x, y: brick.position.y, z: brick.position.z, rotation: brick.rotation };
    }
    return result;
}

// ---------------------------------------------------------------------
// 1 + 2. Translation snap tables (positive and negative)
// ---------------------------------------------------------------------
{
    close(TransformSnap.snapValue(0.1, 1), 0, 'snap 0.1');
    close(TransformSnap.snapValue(0.49, 1), 0, 'snap 0.49');
    close(TransformSnap.snapValue(0.51, 1), 1, 'snap 0.51');
    close(TransformSnap.snapValue(1.49, 1), 1, 'snap 1.49');
    close(TransformSnap.snapValue(1.51, 1), 2, 'snap 1.51');
    close(TransformSnap.snapValue(-0.49, 1), 0, 'snap -0.49');
    close(TransformSnap.snapValue(-0.51, 1), -1, 'snap -0.51');
    close(TransformSnap.snapValue(-1.51, 1), -2, 'snap -1.51');
    // Invalid increments pass through — that is how "snapping off" works.
    close(TransformSnap.snapValue(0.73, 0), 0.73, 'zero increment passes through');
    close(TransformSnap.snapValue(0.73, -1), 0.73, 'negative increment passes through');
    // Float hygiene for fractional increments.
    close(TransformSnap.snapValue(0.7, 0.1), 0.7, 'fractional increment stays clean');
    console.log('✓ translation snap tables (positive and negative)');
}

// ---------------------------------------------------------------------
// 3. Rotation snap tables
// ---------------------------------------------------------------------
{
    close(TransformSnap.snapRotation(7, 15), 0, 'snap 7°');
    close(TransformSnap.snapRotation(8, 15), 15, 'snap 8°');
    close(TransformSnap.snapRotation(22, 15), 15, 'snap 22°');
    close(TransformSnap.snapRotation(23, 15), 30, 'snap 23°');
    close(TransformSnap.snapRotation(-7, 15), 0, 'snap -7°');
    close(TransformSnap.snapRotation(-8, 15), -15, 'snap -8°');
    console.log('✓ rotation snap tables');
}

// ---------------------------------------------------------------------
// 4. Precision increments
// ---------------------------------------------------------------------
{
    const settings = new TransformSettings();
    close(settings.translationIncrement(false), 1, 'normal translation increment');
    close(settings.translationIncrement(true), 0.1, 'precision translation increment');
    close(settings.rotationIncrement(false), 15, 'normal rotation increment');
    close(settings.rotationIncrement(true), 1.5, 'precision rotation increment');
    // A multiplier outside (0,1) must never coarsen the increment.
    close(TransformSnap.effectiveIncrement(1, true, 5), 1, 'multiplier >= 1 ignored');
    close(TransformSnap.effectiveIncrement(1, true, 0), 1, 'multiplier 0 ignored');
    console.log('✓ precision increments');
}

// ---------------------------------------------------------------------
// 5. Multi-selection preservation: one snapped delta for every member
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const before = brickPositions(fixture.world);
    // Raw 2.4 snaps to 2 — BOTH members must move exactly +2.
    simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 2.4, y: 0, z: 0 });
    const after = brickPositions(fixture.world);
    close(after.a.x, before.a.x + 2, 'member A moved by the snapped delta');
    close(after.b.x, before.b.x + 2, 'member B moved by the identical snapped delta');
    close(after.b.x - after.a.x, before.b.x - before.a.x, 'relative distance preserved');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 1, 'one command for the snapped multi-drag');
    console.log('✓ multi-selection preservation under snapping');
}

// ---------------------------------------------------------------------
// 6. Axis constraint + snapping order (constraint first, then snap)
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const before = brickPositions(fixture.world);
    // Raw end has fractional X only; snapped commit lands on +3 with
    // Y/Z exactly untouched.
    simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 3.3, y: 0, z: 0 });
    const after = brickPositions(fixture.world);
    close(after.a.x, before.a.x + 3, 'X drag snapped to +3');
    close(after.a.y, before.a.y, 'X drag leaves Y untouched');
    close(after.a.z, before.a.z, 'X drag leaves Z untouched');
    console.log('✓ axis constraint resolved before snapping');
}

// ---------------------------------------------------------------------
// 7. Rotation snapping through the gesture transaction
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture('world-rot');
    fixture.building.removeBrick('a');
    fixture.building.removeBrick('b');
    fixture.building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(-2, 0, 0), rotation: 0 }));
    fixture.building.addBrick(new Brick({ id: 'b', definitionId: 'core:cube', position: new Position(2, 0, 0), rotation: 0 }));
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
    // Raw 97° snaps to 90° (15° increment).
    service.previewTransformGesture(selection, { rotation: 97 });
    service.commitTransformGesture(selection, { rotation: 97 });
    const after = brickPositions(fixture.world);
    close(after.a.rotation, 90, 'rotation snapped to 90');
    close(after.b.rotation, 90, 'both members rotated identically');
    close(after.a.x, 0, 'A rotated around the pivot');
    close(after.a.z, -2, 'A rotated around the pivot (z, TransformMath convention)');
    assert(histories.get('world-rot').getExecutedCommands().length === 1, 'one command for the snapped rotation');
    console.log('✓ rotation snapping (gesture rotation, not per-brick orientation)');
}

// ---------------------------------------------------------------------
// 8. Gesture-origin semantics: snap the delta, never the position
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture('world-origin');
    fixture.building.removeBrick('a');
    fixture.building.removeBrick('b');
    fixture.building.addBrick(new Brick({ id: 'c', definitionId: 'core:cube', position: new Position(2.37, 0, 0), rotation: 0 }));
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = SpatialSelectionState.brick({ documentId: 'doc-1', buildingId: 'building-1', brickId: 'c' });

    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 0.2, y: 0, z: 0 } });
    close(fixture.building.findBrick('c').position.x, 2.37, 'sub-half-unit drag does NOT re-grid the brick');

    service.previewTransformGesture(selection, { translation: { x: 0.7, y: 0, z: 0 } });
    close(fixture.building.findBrick('c').position.x, 3.37, 'crossing the boundary moves by exactly one increment');

    const committed = service.commitTransformGesture(selection, { translation: { x: 0.7, y: 0, z: 0 } });
    assert(committed === true, 'gesture commits');
    close(fixture.building.findBrick('c').position.x, 3.37, 'commit matches the last preview');
    assert(histories.get('world-origin').getExecutedCommands().length === 1, 'one command');
    console.log('✓ snapping is gesture-relative, not grid-absolute');
}

// ---------------------------------------------------------------------
// 9. Preview stability + no cumulative rounding (start -> A -> B -> A)
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });

    const pointA = { x: 2.3, y: 0, z: 0 };
    const pointB = { x: 5.7, y: 0, z: 0 };
    const origin = { x: 0, y: 0, z: 0 };

    service.previewTransformGesture(selection, { translation: TransformMath.projectDeltaOntoAxis('x', origin, pointA) });
    const snapshotA = JSON.stringify(brickPositions(fixture.world));
    service.previewTransformGesture(selection, { translation: TransformMath.projectDeltaOntoAxis('x', origin, pointB) });
    service.previewTransformGesture(selection, { translation: TransformMath.projectDeltaOntoAxis('x', origin, pointA) });
    assert(JSON.stringify(brickPositions(fixture.world)) === snapshotA,
        'returning to the same pointer position reproduces the exact same transform');

    // And previewing the same frame twice never drifts.
    service.previewTransformGesture(selection, { translation: TransformMath.projectDeltaOntoAxis('x', origin, pointA) });
    assert(JSON.stringify(brickPositions(fixture.world)) === snapshotA,
        'repeated identical previews are stable');
    service.cancelTransformGesture(selection);
    console.log('✓ repeated preview stability, no cumulative rounding');
}

// ---------------------------------------------------------------------
// 10. Precision mode mid-gesture + feedback contents
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });

    service.previewTransformGesture(selection, { translation: { x: 0.23, y: 0, z: 0 } });
    close(fixture.building.findBrick('a').position.x, 0, 'normal mode snaps 0.23 to 0');
    let feedback = service.getGestureFeedback();
    assert(feedback !== null, 'feedback exists during preview');
    assert(feedback.mode === 'translate' && feedback.axis === 'x', 'feedback mode/axis');
    close(feedback.translationSnap, 1, 'feedback reports the normal increment');
    assert(feedback.precise === false, 'feedback reports normal mode');

    service.previewTransformGesture(
        selection,
        { translation: { x: 0.23, y: 0, z: 0 } },
        { modifiers: { shift: true } }
    );
    close(fixture.building.findBrick('a').position.x, 0.2, 'precision mode snaps 0.23 to 0.2');
    feedback = service.getGestureFeedback();
    close(feedback.translationSnap, 0.1, 'feedback reports the precision increment');
    assert(feedback.precise === true, 'feedback reports precision mode');

    service.cancelTransformGesture(selection);
    assert(service.getGestureFeedback() === null, 'feedback cleared after cancel');
    console.log('✓ precision mode and gesture feedback');
}

// ---------------------------------------------------------------------
// 11. Precision rotation
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture('world-prot');
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
    service.previewTransformGesture(
        selection,
        { rotation: 14.2 },
        { modifiers: { shift: true } }
    );
    const feedback = service.getGestureFeedback();
    close(feedback.rotation, 13.5, 'precision rotation snaps 14.2 to 13.5 (1.5° increment)');
    close(feedback.rotationSnap, 1.5, 'feedback reports precision rotation increment');
    service.cancelTransformGesture(selection);
    console.log('✓ precision rotation snapping');
}

// ---------------------------------------------------------------------
// 12. Snapping disabled passes raw deltas through
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(
        fixture,
        new TransformSettings({ snappingEnabled: false })
    );
    const selection = worldViewSelection();
    simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 2.4, y: 0, z: 0 });
    close(fixture.building.findBrick('a').position.x, 2.4, 'disabled snapping commits the raw delta');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 1, 'one command');
    console.log('✓ snapping can be disabled (raw gesture passes through)');
}

// ---------------------------------------------------------------------
// 13. No-op: a gesture that never crosses a snap boundary
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const committed = simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 0.4, y: 0, z: 0 });
    assert(committed === false, 'sub-boundary gesture reports nothing committed');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 0,
        'sub-boundary gesture creates zero history entries');
    close(fixture.building.findBrick('a').position.x, 0, 'brick untouched');
    console.log('✓ no-op discipline survives snapping');
}

// ---------------------------------------------------------------------
// 14. One command, exact undo/redo
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    const before = brickPositions(fixture.world);
    simulateAxisDrag(service, worldViewSelection(), 'x', { x: 0, y: 0, z: 0 }, { x: 2.6, y: 0, z: 0 });
    const moved = brickPositions(fixture.world);
    close(moved.a.x, before.a.x + 3, 'raw 2.6 committed as snapped +3');
    assert(history.getExecutedCommands().length === 1, 'exactly one command');
    assert(history.getExecutedCommands()[0].type === 'transform-selection', 'command type');
    history.undo();
    const undone = brickPositions(fixture.world);
    close(undone.a.x, before.a.x, 'undo restores exactly');
    history.redo();
    const redone = brickPositions(fixture.world);
    close(redone.a.x, moved.a.x, 'redo reapplies exactly');
    console.log('✓ one snapped command, exact undo/redo');
}

// ---------------------------------------------------------------------
// 15. Serialized replay reproduces the exact result
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    simulateAxisDrag(service, worldViewSelection(), 'x', { x: 0, y: 0, z: 0 }, { x: 2.6, y: 0, z: 0 });
    const postPositions = brickPositions(fixture.world);
    const originalTransformsJson = JSON.stringify(history.getExecutedCommands()[0].toJSON().transforms);

    const registry = new CreateCommandRegistryUseCase().execute();
    const freshWorld = World.fromJSON(fixture.world.toJSON());
    const restored = CommandHistory.fromJSON(history.toJSON(), { world: freshWorld }, registry);
    restored.undo();
    restored.redo();
    const replayed = brickPositions(freshWorld);
    for (const id of ['a', 'b']) {
        close(replayed[id].x, postPositions[id].x, `replayed snapped command reproduces ${id}.x`);
        close(replayed[id].rotation, postPositions[id].rotation, `replayed snapped command reproduces ${id}.rotation`);
    }
    assert(JSON.stringify(restored.getExecutedCommands()[0].toJSON().transforms) === originalTransformsJson,
        'replayed command transforms are byte-equivalent');
    console.log('✓ serialized snapped command replays exactly');
}

// ---------------------------------------------------------------------
// 16. Group/membership invariance under snapping
// ---------------------------------------------------------------------
{
    // Snapping sees items[] — never a Group. Membership and identities
    // cannot change because nothing in the snap path can touch them.
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const itemsBefore = JSON.stringify(selection.items);
    const bricksBefore = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 2.6, y: 0, z: 0 });
    assert(JSON.stringify(selection.items) === itemsBefore, 'selection items unchanged');
    const bricksAfter = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    assert(bricksAfter === bricksBefore, 'membership unchanged by a snapped gesture');
    console.log('✓ membership invariance under snapping');
}

// ---------------------------------------------------------------------
// 17. Editor / World View parity with snapping
// ---------------------------------------------------------------------
{
    const worldFixture = createWorldFixture('world-parity');
    const editorFixture = createWorldFixture('world-parity');
    const worldEnv = createWorldViewEnvironment(worldFixture);
    const editorEnv = createEditorEnvironment(editorFixture);

    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 2.6, y: 0, z: 0 }; // snaps to +3 on both surfaces
    simulateAxisDrag(worldEnv.service, worldViewSelection(), 'x', start, end);
    simulateAxisDrag(editorEnv.service, editorSelection(), 'x', start, end);

    const worldCommand = worldEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    const editorCommand = editorEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    assert(worldCommand.type === 'transform-selection' && editorCommand.type === 'transform-selection',
        'both surfaces emit transform-selection');
    assert(JSON.stringify(worldCommand.transforms) === JSON.stringify(editorCommand.transforms),
        'identical snapped transforms across surfaces');
    assert(worldCommand.description === editorCommand.description, 'identical descriptions');
    console.log('✓ Editor/World View parity under snapping');
}

// ---------------------------------------------------------------------
// 18. Flagship: keyboard/gizmo parity
// ---------------------------------------------------------------------
{
    // Keyboard +3 vs a gizmo drag whose raw delta snaps to +3 — the
    // committed TransformSelectionCommand payloads must be identical.
    const keyboardFixture = createWorldFixture('world-kbpar');
    const gizmoFixture = createWorldFixture('world-kbpar');
    const keyboardEnv = createWorldViewEnvironment(keyboardFixture);
    const gizmoEnv = createWorldViewEnvironment(gizmoFixture);
    const selectionK = worldViewSelection();
    const selectionG = worldViewSelection();

    const keyboardCommitted = keyboardEnv.service.moveSelection(selectionK, { x: 3, y: 0, z: 0 });
    assert(keyboardCommitted === true, 'keyboard move commits');
    simulateAxisDrag(gizmoEnv.service, selectionG, 'x', { x: 0, y: 0, z: 0 }, { x: 3.2, y: 0, z: 0 });

    const keyboardCommand = keyboardEnv.histories.get('world-kbpar').getExecutedCommands()[0].toJSON();
    const gizmoCommand = gizmoEnv.histories.get('world-kbpar').getExecutedCommands()[0].toJSON();
    assert(keyboardCommand.type === 'transform-selection', 'keyboard emits transform-selection');
    assert(gizmoCommand.type === 'transform-selection', 'gizmo emits transform-selection');
    assert(JSON.stringify(keyboardCommand.transforms) === JSON.stringify(gizmoCommand.transforms),
        'keyboard +3 === gizmo drag snapped to +3');
    assert(keyboardCommand.description === gizmoCommand.description, 'identical command descriptions');

    // Rotation parity: keyboard 90° vs a gizmo drag of raw 92° (snapped
    // to 90° by the 15° increment).
    const keyboardRotFixture = createWorldFixture('world-kbrot');
    const gizmoRotFixture = createWorldFixture('world-kbrot');
    const keyboardRotEnv = createWorldViewEnvironment(keyboardRotFixture);
    const gizmoRotEnv = createWorldViewEnvironment(gizmoRotFixture);

    const rotated = keyboardRotEnv.service.rotateSelection(worldViewSelection(), 90);
    assert(rotated === true, 'keyboard rotate commits');
    const gizmoRotSelection = worldViewSelection();
    gizmoRotEnv.service.beginTransformGesture(gizmoRotSelection, { mode: 'rotate', axis: 'y' });
    gizmoRotEnv.service.previewTransformGesture(gizmoRotSelection, { rotation: 92 });
    gizmoRotEnv.service.commitTransformGesture(gizmoRotSelection, { rotation: 92 });

    const keyboardRotCommand = keyboardRotEnv.histories.get('world-kbrot').getExecutedCommands()[0].toJSON();
    const gizmoRotCommand = gizmoRotEnv.histories.get('world-kbrot').getExecutedCommands()[0].toJSON();
    assert(JSON.stringify(keyboardRotCommand.transforms) === JSON.stringify(gizmoRotCommand.transforms),
        'keyboard 90° === gizmo rotation snapped to 90°');

    // Precision keyboard nudge: Shift applies the same 0.1 increment the
    // gizmo uses, so a +1 nudge stays exactly +1 under precision too.
    const precisionFixture = createWorldFixture('world-kbprec');
    const precisionEnv = createWorldViewEnvironment(precisionFixture);
    const precisionCommitted = precisionEnv.service.moveSelection(
        worldViewSelection(),
        { x: 1, y: 0, z: 0 },
        { modifiers: { shift: true } }
    );
    assert(precisionCommitted === true, 'precision keyboard move commits');
    close(precisionFixture.building.findBrick('a').position.x, 1, 'precision keyboard nudge is exact');
    console.log('✓ keyboard/gizmo parity (flagship)');
}

console.log('\nAll transform snapping tests passed.');
