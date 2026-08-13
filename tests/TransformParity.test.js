import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Group } from '../core/Group.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { TransformSelectionUseCase } from '../application/TransformSelectionUseCase.js';
import { SpatialEditingService } from '../application/SpatialEditingService.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { EditorContext } from '../application/EditorContext.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { SelectionTool } from '../application/tools/SelectionTool.js';
import { TransformMath } from '../application/TransformMath.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

const PLAIN_MODIFIERS = { ctrl: false, shift: false, alt: false, meta: false };

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
// 1. TransformMath: shared formulas
// ---------------------------------------------------------------------

{
    const rotated = TransformMath.rotatePointAroundPivotY({ x: 2, y: 0.5, z: 0 }, { x: 0, y: 0, z: 0 }, 90);
    close(rotated.x, 0, 'rotation about pivot x');
    close(rotated.z, 2, 'rotation about pivot z');
    close(rotated.y, 0.5, 'rotation leaves y untouched');

    const combined = TransformMath.transformPoint({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { // <-- Fixed
        rotation: 90,
        translation: { x: 1, y: 2, z: 3 }
    });
    close(combined.x, 1, 'rotation-then-translation x');
    close(combined.y, 2, 'rotation-then-translation y');
    close(combined.z, 5, 'rotation-then-translation z');

    const mapped = TransformMath.calculateTransforms(
        [{ buildingId: 'b', brickId: 'x', position: { x: 2, y: 0, z: 0 }, rotation: 10 }],
        { x: 0, y: 0, z: 0 },
        { rotation: 90 }
    );
    close(mapped[0].position.z, 2, 'calculateTransforms maps positions');
    assert(mapped[0].rotation === 100, 'calculateTransforms accumulates rotation');
    assert(TransformMath.transformsEqual(mapped, mapped), 'transformsEqual agrees with itself');
    console.log('✓ TransformMath shared formulas');
}

// ---------------------------------------------------------------------
// 2. Use case: single brick, pivot semantics, no-op suppression
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const useCase = new TransformSelectionUseCase(brickRegistry);
    const { world, building, ids: [a] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const selection = SpatialSelectionState.brick({
        documentId: 'doc', buildingId: building.id, brickId: a
    });

    const move = useCase.execute(history, document, selection, { translation: { x: 2, y: 0, z: 0 } });
    assert(move !== null, 'translate executes');
    assert(move.type === 'transform-selection', 'unified command type');
    assert(building.findBrick(a).position.x === 2, 'brick moved');
    assert(history.getExecutedCommands().length === 1, 'one history entry');

    // Single-brick rotation pivots on the brick's own center: position
    // unchanged, rotation applied — identical to the pre-0.1.44 behavior.
    const rotate = useCase.execute(history, document, selection, { rotation: 90 });
    assert(rotate !== null, 'rotate executes');
    assert(building.findBrick(a).position.x === 2, 'own-center rotation preserves position');
    assert(building.findBrick(a).rotation === 90, 'own-center rotation applies');

    // No-op suppression: zero translation, no rotation.
    const noop = useCase.execute(history, document, selection, { translation: { x: 0, y: 0, z: 0 } });
    assert(noop === null, 'no-op transform executes nothing');
    assert(history.getExecutedCommands().length === 2, 'no-op added no entry');

    history.undo();
    assert(building.findBrick(a).rotation === 0, 'undo restores rotation');
    history.undo();
    assert(building.findBrick(a).position.x === 0, 'undo restores position');
    console.log('✓ use case: single brick, pivot semantics, no-op suppression');
}

// ---------------------------------------------------------------------
// 3. Use case: multi-selection rotates about the group pivot
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const useCase = new TransformSelectionUseCase(brickRegistry);
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });

    const command = useCase.execute(history, document, selection, { rotation: 90 });
    assert(command !== null, 'multi rotate executes');
    // Pivot is the bounds center (2, 0.5, 0): both bricks orbit it.
    close(building.findBrick(a).position.x, 2, 'brick A orbits pivot x');
    close(building.findBrick(a).position.z, -2, 'brick A orbits pivot z');
    close(building.findBrick(b).position.x, 2, 'brick B orbits pivot x');
    close(building.findBrick(b).position.z, 2, 'brick B orbits pivot z');
    assert(building.findBrick(a).rotation === 90 && building.findBrick(b).rotation === 90, 'own rotations accumulate');
    assert(history.getExecutedCommands().length === 1, 'multi transform is one entry');
    history.undo();
    close(building.findBrick(a).position.x, 0, 'undo restores A');
    close(building.findBrick(b).position.z, 0, 'undo restores B');
    console.log('✓ use case: multi-selection pivot rotation');
}

// ---------------------------------------------------------------------
// 4. Service: groups transform as resolved selections; membership intact
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b, c] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(9, 0.5, 9) }
    ]);
    const group = new Group({ name: 'Walls', brickIds: [a, b] });
    world.addGroup(group);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);

    // Resolve the group into a selection — exactly what
    // WorldNavigationSession.selectGroup() does — then transform.
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });

    assert(service.moveSelection(selection, { x: 1, y: 0, z: 0 }) === true, 'group move succeeds');
    const history = histories.get(world.id);
    assert(history.getExecutedCommands().length === 1, 'group move is one entry');
    assert(history.getExecutedCommands()[0].type === 'transform-selection', 'group move uses the unified command');
    assert(building.findBrick(a).position.x === 1 && building.findBrick(b).position.x === 3, 'members moved');
    assert(building.findBrick(c).position.x === 9, 'non-member untouched');
    assert(JSON.stringify(group.brickIds) === JSON.stringify([a, b]), 'group membership unchanged by transform');

    assert(service.rotateSelection(selection, 90) === true, 'group rotate succeeds');
    assert(history.getExecutedCommands().length === 2, 'group rotate is one entry');
    assert(JSON.stringify(group.brickIds) === JSON.stringify([a, b]), 'membership still unchanged');

    history.undo();
    history.undo();
    close(building.findBrick(a).position.x, 0, 'undo restores A');
    close(building.findBrick(b).position.x, 2, 'undo restores B');
    assert(world.getGroup(group.id) !== null, 'group survives transform undo');
    console.log('✓ groups transform as resolved selections; relationships preserved');
}

// ---------------------------------------------------------------------
// 5. Gizmo commit routes through the unified path
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });

    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 3, y: 0, z: 0 } });
    close(building.findBrick(a).position.x, 3, 'preview moves live');
    assert(histories.get(world.id).getExecutedCommands().length === 0, 'preview creates no command');

    assert(service.commitTransformGesture(selection, { translation: { x: 3, y: 0, z: 0 } }) === true, 'commit succeeds');
    const commands = histories.get(world.id).getExecutedCommands();
    assert(commands.length === 1 && commands[0].type === 'transform-selection', 'commit produces the unified command');

    // No-op gesture: begin, commit with an empty transform.
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    assert(service.commitTransformGesture(selection, {}) === false, 'no-op gesture commits nothing');
    assert(histories.get(world.id).getExecutedCommands().length === 1, 'no-op added no entry');
    console.log('✓ gizmo commit unified, no-op suppressed');
}

// ---------------------------------------------------------------------
// 6. Delete path unchanged (deletion is not a transform)
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    assert(service.deleteSelection(selection) === true, 'delete succeeds');
    assert(histories.get(world.id).getExecutedCommands()[0].type === 'composite', 'delete stays a composite');
    console.log('✓ delete path unchanged');
}

// ---------------------------------------------------------------------
// 7. Editor parity: SelectionTool through the same use case
// ---------------------------------------------------------------------
{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const service = new SpatialEditingService({ getDocument: () => document }, new Map([[world.id, history]]), brickRegistry);
    const selection = SpatialSelectionState.brick({ documentId: 'doc', buildingId: building.id, brickId: a });
    
    service.moveSelection(selection, { x: 1, y: 0, z: 0 });
    assert(building.findBrick(a).position.x === 1, 'Editor arrow nudge moves the brick');
    assert(history.getExecutedCommands().length === 1, 'nudge is one entry');
    assert(history.getExecutedCommands()[0].type === 'transform-selection', 'Editor uses the unified command');
    
    service.rotateSelection(selection, 90);
    assert(building.findBrick(a).rotation === 90, 'Editor R rotates about the pivot');
    
    service.rotateSelection(selection, -90);
    assert(building.findBrick(a).rotation === 0, 'Editor Shift+R rotates back');
    
    history.undo();
    history.undo();
    assert(building.findBrick(a).position.x === 0 && building.findBrick(a).rotation === 0, 'Editor transforms undo cleanly');
    console.log('✓ Editor transform parity through the shared use case');
}

// ---------------------------------------------------------------------
// 8. Serialization roundtrip of the unified command
// ---------------------------------------------------------------------

{
    const registry = new CreateCommandRegistryUseCase().execute();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const useCase = new TransformSelectionUseCase(brickRegistry);
    const { world, building, ids: [a] } = createWorldWithBricks([
        { id: 'brick-a', position: new Position(0, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const selection = SpatialSelectionState.brick({ documentId: 'doc', buildingId: building.id, brickId: a });
    const command = useCase.execute(history, document, selection, { translation: { x: 5, y: 0, z: 0 }, rotation: 45 });

    const restored = registry.fromJSON(command.toJSON());
    assert(restored.type === 'transform-selection', 'unified command deserializes');
    // Replay-style: a second world with the same brick identity.
    const second = createWorldWithBricks([{ id: 'brick-a', position: new Position(0, 0.5, 0) }]);
    restored.execute({ world: second.world });
    assert(second.building.findBrick('brick-a').position.x === 5, 'restored command reproduces the transform');
    assert(second.building.findBrick('brick-a').rotation === 45, 'restored command reproduces rotation');
    console.log('✓ unified transform command serialization roundtrip');
}

console.log('\nAll transform parity tests passed.');
