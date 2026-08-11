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
import { TransformGizmoUseCase } from '../application/TransformGizmoUseCase.js';
import { TransformSelectionCommand } from '../application/commands/TransformSelectionCommand.js';

// 0.1.46 — Interactive Transform Gizmo tests.
//
// The pointer-facing half of the gizmo (raycasting, handle picking) is
// renderer-layer Three.js code; everything this suite can exercise
// headlessly is exercised here: the presentation contract (visibility +
// pivot), the axis/rotation drag math the controller feeds gestures
// with, and — most importantly — the gesture TRANSACTION itself:
// preview without history, exactly one transform-selection command on
// commit, exact restore on cancel, zero history on no-op drags,
// membership invariance, undo/redo, serialized replay, and
// Editor/World View parity.
//
// The simulated gestures below use TransformMath.projectDeltaOntoAxis /
// rotationDeltaFromPoints — the exact functions the real
// TransformGizmoController calls between its raycasts — so the gesture
// shapes reaching the service are the ones a real pointer drag produces.

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

// World View style: selection carries a documentId; the session shim
// resolves it.
function createWorldViewEnvironment(fixture) {
    const session = { getDocument: (id) => (id === 'doc-1' ? fixture.document : null) };
    const histories = new Map([[fixture.world.id, new CommandHistory({ world: fixture.world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    return { service, histories };
}

// Editor style: EditorSession's getDocument shim ignores the id and
// returns the open document; selection is the editor's SelectionState.
function createEditorEnvironment(fixture) {
    const session = { getDocument: () => fixture.document };
    const histories = new Map([[fixture.world.id, new CommandHistory({ world: fixture.world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
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
// N preview steps built from projected pointer points, then one commit.
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

function brickPositions(world) {
    const bricks = world.getBuildings()[0].getBricks();
    const result = {};
    for (const brick of bricks) {
        result[brick.id] = { x: brick.position.x, y: brick.position.y, z: brick.position.z, rotation: brick.rotation };
    }
    return result;
}

// ---------------------------------------------------------------------
// 1 + 2. Gizmo visibility and pivot
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const useCase = new TransformGizmoUseCase(service);

    assert(useCase.resolvePresentation(SpatialSelectionState.empty()) === null,
        'empty selection hides the gizmo');
    assert(useCase.resolvePresentation(SpatialSelectionState.ground(new Position(1, 0, 1))) === null,
        'ground selection hides the gizmo');

    const single = SpatialSelectionState.brick({ documentId: 'doc-1', buildingId: 'building-1', brickId: 'a' });
    const singlePresentation = useCase.resolvePresentation(single);
    assert(singlePresentation !== null, 'brick selection shows the gizmo');
    close(singlePresentation.pivot.x, 0, 'single brick pivot x is the brick center');
    close(singlePresentation.pivot.y, 0, 'single brick pivot y is the brick center');
    close(singlePresentation.pivot.z, 0, 'single brick pivot z is the brick center');

    const multi = worldViewSelection();
    const multiPresentation = useCase.resolvePresentation(multi);
    close(multiPresentation.pivot.x, 2.25, 'multi pivot is the bounds center x');
    close(multiPresentation.pivot.y, 0, 'multi pivot is the bounds center y');
    close(multiPresentation.pivot.z, 0, 'multi pivot is the bounds center z');

    // A group selection arrives already flattened to its members — the
    // presentation carries bounds + pivot and nothing group-shaped.
    const keys = Object.keys(multiPresentation).sort().join(',');
    assert(keys === 'bounds,pivot', 'presentation exposes only bounds and pivot — no group concept');
    console.log('✓ gizmo visibility and pivot resolution');
}

// ---------------------------------------------------------------------
// 3. Axis constraints
// ---------------------------------------------------------------------
{
    const start = { x: 0, y: 0, z: 0 };
    const point = { x: 3, y: 5, z: 7 };
    const dx = TransformMath.projectDeltaOntoAxis('x', start, point);
    const dy = TransformMath.projectDeltaOntoAxis('y', start, point);
    const dz = TransformMath.projectDeltaOntoAxis('z', start, point);
    close(dx.x, 3, 'x handle takes x'); assert(dx.y === 0 && dx.z === 0, 'x handle constrains y and z');
    close(dy.y, 5, 'y handle takes y'); assert(dy.x === 0 && dy.z === 0, 'y handle constrains x and z');
    close(dz.z, 7, 'z handle takes z'); assert(dz.x === 0 && dz.y === 0, 'z handle constrains x and y');

    for (const axis of ['x', 'y', 'z']) {
        const fixture = createWorldFixture();
        const { service, histories } = createWorldViewEnvironment(fixture);
        const before = brickPositions(fixture.world);
        const end = { x: axis === 'x' ? 2.5 : 0, y: axis === 'y' ? 1.5 : 0, z: axis === 'z' ? -3.5 : 0 };
        const committed = simulateAxisDrag(service, worldViewSelection(), axis, { x: 0, y: 0, z: 0 }, end);
        assert(committed === true, `${axis} drag commits`);
        const after = brickPositions(fixture.world);
        for (const id of ['a', 'b']) {
            for (const coord of ['x', 'y', 'z']) {
                if (coord === axis) {
                    close(after[id][coord], before[id][coord] + end[axis], `${axis} drag moves ${id}.${coord}`);
                } else {
                    close(after[id][coord], before[id][coord], `${axis} drag leaves ${id}.${coord} untouched`);
                }
            }
        }
        assert(histories.get(fixture.world.id).getExecutedCommands().length === 1,
            `${axis} drag is one history entry`);
    }
    console.log('✓ axis handles constrain translation');
}

// ---------------------------------------------------------------------
// 4. Rotation uses the shared TransformMath
// ---------------------------------------------------------------------
{
    // Pure parity: rotating a point through rotatePointAroundPivotY must
    // equal the position calculateTransforms produces for the same input.
    const pivot = { x: 1, y: 0, z: -2 };
    const sample = { x: 4, y: 0.5, z: 3 };
    const viaPoint = TransformMath.rotatePointAroundPivotY(sample, pivot, 37);
    const viaTransforms = TransformMath.calculateTransforms(
        [{ buildingId: 'b', brickId: 'x', position: sample, rotation: 0 }],
        pivot,
        { rotation: 37 }
    )[0].position;
    close(viaPoint.x, viaTransforms.x, 'rotatePointAroundPivotY x matches calculateTransforms');
    close(viaPoint.z, viaTransforms.z, 'rotatePointAroundPivotY z matches calculateTransforms');

    // Pointer-angle delta: dragging from +X to +Z around the pivot is a
    // +90 degree delta in the convention calculateTransforms applies.
    const delta = TransformMath.rotationDeltaFromPoints(
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 0, z: 2 }
    );
    close(delta, 90, 'rotation delta from pointer angles');

    // Flagship: A=(-2,0,0), B=(2,0,0), pivot (0,0,0), rotate 90 around Y.
    // Sign convention follows the 0.1.38 formula (x' = cos dx - sin dz):
    // the gizmo uses the identical convention, so drag direction and
    // committed rotation always agree.
    const fixture = createWorldFixture('world-rot');
    fixture.building.removeBrick('a');
    fixture.building.removeBrick('b');
    fixture.building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(-2, 0, 0), rotation: 0 }));
    fixture.building.addBrick(new Brick({ id: 'b', definitionId: 'core:cube', position: new Position(2, 0, 0), rotation: 0 }));
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const committed = simulateRotationDrag(
        service, selection,
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 0, z: 2 }
    );
    assert(committed === true, 'rotation drag commits');
    const after = brickPositions(fixture.world);
    close(after.a.x, 0, 'A rotates to x 0');
    close(after.a.z, -2, 'A rotates to z -2 (TransformMath convention)');
    close(after.b.x, 0, 'B rotates to x 0');
    close(after.b.z, 2, 'B rotates to z 2 (TransformMath convention)');
    close(after.a.rotation, 90, 'A orientation advanced 90');
    close(after.b.rotation, 90, 'B orientation advanced 90');
    assert(histories.get('world-rot').getExecutedCommands().length === 1, 'rotation drag is one history entry');
    console.log('✓ rotation uses the shared TransformMath (group pivot respected)');
}

// ---------------------------------------------------------------------
// 5. Preview creates no history
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 2, y: 0, z: 0 } });
    service.previewTransformGesture(selection, { translation: { x: 4, y: 0, z: 0 } });
    close(fixture.building.findBrick('a').position.x, 4, 'preview moves the live world');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 0,
        'no history entry exists during preview');
    service.cancelTransformGesture(selection);
    console.log('✓ live preview without history');
}

// ---------------------------------------------------------------------
// 6. Commit produces exactly one transform-selection command
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    const history = histories.get(fixture.world.id);
    assert(history.getExecutedCommands().length === 1, 'exactly one command after a full gesture');
    const command = history.getExecutedCommands()[0];
    assert(command instanceof TransformSelectionCommand, 'the command is a TransformSelectionCommand');
    assert(command.type === 'transform-selection', 'the command type is transform-selection');
    console.log('✓ commit emits exactly one transform-selection command');
}

// ---------------------------------------------------------------------
// 7. Escape/cancel restores exact state with no history
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const before = brickPositions(fixture.world);
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 5, y: 0, z: 0 } });
    close(fixture.building.findBrick('a').position.x, 5, 'drag preview reached x=5');
    const cancelled = service.cancelTransformGesture(selection);
    assert(cancelled === true, 'cancel reports an active gesture');
    const after = brickPositions(fixture.world);
    for (const id of ['a', 'b']) {
        close(after[id].x, before[id].x, `cancel restores ${id}.x exactly`);
        close(after[id].rotation, before[id].rotation, `cancel restores ${id}.rotation exactly`);
    }
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 0,
        'cancel creates no history entry');
    console.log('✓ Escape/cancel restores exact original state');
}

// ---------------------------------------------------------------------
// 8. No-op drag creates no command
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const startPoint = { x: 0, y: 0, z: 0 };
    // Down, zero-movement previews, up at the same point.
    const committed = simulateAxisDrag(service, selection, 'x', startPoint, startPoint, 2);
    assert(committed === false, 'zero-movement gesture reports nothing committed');
    assert(histories.get(fixture.world.id).getExecutedCommands().length === 0,
        'zero-movement gesture creates no command');
    console.log('✓ no-op drag preserves the 0.1.44 no-history discipline');
}

// ---------------------------------------------------------------------
// 9. Membership invariance (the group guarantee)
// ---------------------------------------------------------------------
{
    // Whether A/B/C were selected manually or because they belong to a
    // Group, the gesture sees only items[] — so membership cannot
    // change. Asserted here on the selection and the building's brick
    // set; a Group entity would add nothing the gizmo could touch.
    const fixture = createWorldFixture();
    const { service } = createWorldViewEnvironment(fixture);
    const selection = worldViewSelection();
    const itemsBefore = JSON.stringify(selection.items);
    const bricksBefore = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    simulateAxisDrag(service, selection, 'x', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    assert(JSON.stringify(selection.items) === itemsBefore, 'selection items unchanged by the gesture');
    const bricksAfter = fixture.building.getBricks().map((brick) => brick.id).sort().join(',');
    assert(bricksAfter === bricksBefore, 'building membership unchanged by the gesture');
    assert(fixture.world.getBuildings().length === 1, 'world structure unchanged by the gesture');
    console.log('✓ membership invariance (gizmo never touches group structure)');
}

// ---------------------------------------------------------------------
// 10. One undo reverses the whole gesture; one redo reapplies it
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    const before = brickPositions(fixture.world);
    simulateAxisDrag(service, worldViewSelection(), 'x', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    const moved = brickPositions(fixture.world);
    assert(history.getCursor() === 1, 'cursor at 1 after the gesture');
    history.undo();
    const undone = brickPositions(fixture.world);
    for (const id of ['a', 'b']) {
        close(undone[id].x, before[id].x, `one undo restores ${id}.x`);
        close(undone[id].z, before[id].z, `one undo restores ${id}.z`);
    }
    assert(history.getCursor() === 0, 'cursor at 0 after one undo');
    history.redo();
    const redone = brickPositions(fixture.world);
    for (const id of ['a', 'b']) {
        close(redone[id].x, moved[id].x, `one redo reapplies ${id}.x`);
    }
    assert(history.getCursor() === 1, 'cursor back at 1 after one redo');
    assert(history.getExecutedCommands().length === 1, 'still exactly one history entry');
    console.log('✓ single undo/redo for the complete gesture');
}

// ---------------------------------------------------------------------
// 11. Serialized command reproduces the exact result (replay)
// ---------------------------------------------------------------------
{
    const fixture = createWorldFixture();
    const { service, histories } = createWorldViewEnvironment(fixture);
    const history = histories.get(fixture.world.id);
    const preJson = fixture.world.toJSON();
    simulateAxisDrag(service, worldViewSelection(), 'x', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    const postPositions = brickPositions(fixture.world);
    const sessionJson = history.toJSON();

    const registry = new CreateCommandRegistryUseCase().execute();
    const freshWorld = World.fromJSON(fixture.world.toJSON());
    const restored = CommandHistory.fromJSON(sessionJson, { world: freshWorld }, registry);

    restored.undo();
    const prePositions = brickPositions(freshWorld);
    for (const id of ['a', 'b']) {
        close(prePositions[id].x, brickPositions(World.fromJSON(preJson))[id].x, `replay undo restores ${id}.x`);
    }
    restored.redo();
    const replayed = brickPositions(freshWorld);
    for (const id of ['a', 'b']) {
        close(replayed[id].x, postPositions[id].x, `replayed command reproduces ${id}.x exactly`);
        close(replayed[id].rotation, postPositions[id].rotation, `replayed command reproduces ${id}.rotation exactly`);
    }
    console.log('✓ serialized gesture replays to the exact result');
}

// ---------------------------------------------------------------------
// 12. Editor / World View parity
// ---------------------------------------------------------------------
{
    const worldFixture = createWorldFixture('world-parity');
    const editorFixture = createWorldFixture('world-parity');
    const worldEnv = createWorldViewEnvironment(worldFixture);
    const editorEnv = createEditorEnvironment(editorFixture);

    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 3, y: 0, z: 0 };
    simulateAxisDrag(worldEnv.service, worldViewSelection(), 'x', start, end);
    simulateAxisDrag(editorEnv.service, editorSelection(), 'x', start, end);

    const worldPositions = brickPositions(worldFixture.world);
    const editorPositions = brickPositions(editorFixture.world);
    for (const id of ['a', 'b']) {
        close(editorPositions[id].x, worldPositions[id].x, `parity: ${id}.x matches across views`);
        close(editorPositions[id].z, worldPositions[id].z, `parity: ${id}.z matches across views`);
    }

    const worldCommand = worldEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    const editorCommand = editorEnv.histories.get('world-parity').getExecutedCommands()[0].toJSON();
    assert(worldCommand.type === 'transform-selection' && editorCommand.type === 'transform-selection',
        'parity: both views emit transform-selection');
    assert(JSON.stringify(worldCommand.transforms) === JSON.stringify(editorCommand.transforms),
        'parity: identical committed transforms');
    assert(worldCommand.description === editorCommand.description,
        'parity: identical command description');
    console.log('✓ Editor and World View gestures produce identical command semantics');
}

console.log('\nAll interactive gizmo tests passed.');
