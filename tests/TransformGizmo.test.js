import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { SpatialEditingService } from '../application/SpatialEditingService.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}
function createFixture() {
    const world = new World({ id: 'world-1' });
    const building = new Building({ id: 'building-1' });
    building.addBrick(new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(0, 0, 0), rotation: 0 }));
    building.addBrick(new Brick({ id: 'b', definitionId: 'core:plate_2x4', position: new Position(4, 0, 0), rotation: 10 }));
    world.addBuilding(building);
    const document = new Document({ world });
    const session = { getDocument: (id) => id === 'doc-1' ? document : null };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, new CreateBrickRegistryUseCase().execute());
    return { world, building, document, histories, service };
}

{
    const { service } = createFixture();
    const single = SpatialSelectionState.brick({ documentId: 'doc-1', buildingId: 'building-1', brickId: 'a' });
    const bounds = service.getSelectionBounds(single);
    close(bounds.min.x, -0.5, 'single min x');
    close(bounds.max.x, 0.5, 'single max x');
    close(service.getGroupPivot(single).x, 0, 'single pivot x');
    console.log('✓ single-brick selection bounds and pivot');
}

{
    const { service } = createFixture();
    const multi = SpatialSelectionState.bricks({ documentId: 'doc-1', items: [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ] });
    const bounds = service.getSelectionBounds(multi);
    close(bounds.min.x, -0.5, 'multi min x');
    close(bounds.max.x, 5, 'multi max x includes plate width');
    close(bounds.min.z, -2, 'multi min z includes plate depth');
    close(bounds.max.z, 2, 'multi max z includes plate depth');
    close(service.getGroupPivot(multi).x, 2.25, 'multi pivot x');
    console.log('✓ multi-brick selection bounds and group pivot');
}

{
    const { building, histories, service } = createFixture();
    const selection = SpatialSelectionState.bricks({ documentId: 'doc-1', items: [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ] });
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 2, y: 0, z: 0 } });
    close(building.findBrick('a').position.x, 2, 'preview moves a');
    assert(histories.get('world-1').getExecutedCommands().length === 0, 'preview does not create history');
    service.commitTransformGesture(selection, { translation: { x: 2, y: 0, z: 0 } });
    assert(histories.get('world-1').getExecutedCommands().length === 1, 'commit creates one command');
    histories.get('world-1').undo();
    close(building.findBrick('a').position.x, 0, 'undo restores a');
    histories.get('world-1').redo();
    close(building.findBrick('b').position.x, 6, 'redo restores b');
    console.log('✓ translation gizmo preview, commit, undo, redo');
}

{
    const { building, histories, service } = createFixture();
    const selection = SpatialSelectionState.bricks({ documentId: 'doc-1', items: [
        { type: 'brick', buildingId: 'building-1', brickId: 'a' },
        { type: 'brick', buildingId: 'building-1', brickId: 'b' }
    ] });
    service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
    service.previewTransformGesture(selection, { rotation: 90 });
    close(building.findBrick('a').position.x, 2.25, 'group rotation x around pivot');
    close(building.findBrick('a').position.z, -2.25, 'group rotation z around pivot');
    close(building.findBrick('b').rotation, 100, 'preview rotates own orientation');
    service.cancelTransformGesture(selection);
    close(building.findBrick('a').position.x, 0, 'cancel restores position');
    close(building.findBrick('b').rotation, 10, 'cancel restores rotation');
    assert(histories.get('world-1').getExecutedCommands().length === 0, 'cancel creates no command');
    service.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' });
    service.commitTransformGesture(selection, { rotation: 90 });
    assert(histories.get('world-1').getExecutedCommands().length === 1, 'rotation commit creates one command');
    histories.get('world-1').undo();
    close(building.findBrick('a').position.x, 0, 'rotation undo restores a position');
    histories.get('world-1').redo();
    close(building.findBrick('b').position.z, 1.75, 'rotation redo restores b around pivot');
    console.log('✓ rotation gizmo group pivot, cancel, undo, redo');
}

console.log('\nAll transform gizmo tests passed.');
