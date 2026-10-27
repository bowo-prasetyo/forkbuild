import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { boxOfBricks, restingLift } from '../core/building/BrickResting.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/editor/CopyStructureIntoDocumentUseCase.js';
import { CompositionPreviewUseCase } from '../application/editor/CompositionPreviewUseCase.js';
import { StructurePlacementValidator } from '../application/editor/StructurePlacementValidator.js';
import { SpatialBounds } from '../core/world/SpatialBounds.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { StructureCompositionTool } from '../application/tools/StructureCompositionTool.js';
import { assert } from './support/Assert.js';

// A structure put on top of a build rests on the tallest brick under its
// footprint, as a wide brick does, and its footprint (for resting and for
// the collision check alike) is its turned footprint
// (docs/reviews/EditorPlacementUX-2026-10-27.md, findings P1-3 and P2-12).

const registry = new CreateBrickRegistryUseCase().execute();
const definitionOf = (id) => registry.get(id);

const brick = (definitionId, x, y, z, rotation = 0) => new Brick({ definitionId, position: new Position(x, y, z), rotation });
// Two cubes stacked: 1 wide, 2 tall.
const post = {
    id: 'test:post', name: 'Post', category: 'test', tags: [], description: '',
    bricks: [
        { definitionId: 'core:cube', position: { x: 0, y: 0.5, z: 0 }, rotation: 0, tilt: 0 },
        { definitionId: 'core:cube', position: { x: 0, y: 1.5, z: 0 }, rotation: 0, tilt: 0 }
    ]
};
// One 4x1 brick: 4 along x, or along z when turned a quarter.
const bench = {
    id: 'test:bench', name: 'Bench', category: 'test', tags: [], description: '',
    bricks: [{ definitionId: 'core:brick_1x4', position: { x: 0, y: 0.5, z: 0 }, rotation: 0, tilt: 0 }]
};

// A 6x6 deck of 2x2 blocks, its top at y = 2.
function makeTool(extraBricks = []) {
    const world = new World();
    const building = new Building({ creator: 'local' });
    for (const x of [-2, 0, 2]) for (const z of [-2, 0, 2]) building.addBrick(brick('core:block_2x2', x, 1, z));
    for (const extra of extraBricks) building.addBrick(extra);
    world.addBuilding(building);
    const editorContext = new CreateEditorContextUseCase().execute();
    const commandHistory = new CommandHistory({ world });
    const tool = new StructureCompositionTool({
        world, registry, editorContext, commandHistory, structureResolver: null,
        compositionPreviewUseCase: new CompositionPreviewUseCase(editorContext),
        copyStructureIntoDocumentUseCase: new CopyStructureIntoDocumentUseCase()
    });
    return { world, building, editorContext, tool, commandHistory };
}

const onTop = (x, y, z) => ({ worldPosition: { x: 20, y: 0, z: 20 }, pickedBrick: { brickId: 'deck', buildingId: 'b', normal: { x: 0, y: 1, z: 0 }, point: { x, y, z } } });
const onGround = (x, z) => ({ worldPosition: { x, y: 0, z }, pickedBrick: null });
const preview = (editorContext) => {
    const p = editorContext.compositionPreview;
    return { visible: p.visible, valid: p.valid, x: p.position.x, y: p.position.y, z: p.position.z, rotation: p.rotation };
};

// 1. The helpers: a box by turned footprints, and the lift onto what's under it.
{
    const flat = boxOfBricks([brick('core:brick_1x4', 0, 0.5, 0)], definitionOf);
    const turned = boxOfBricks([brick('core:brick_1x4', 0, 0.5, 0, 90)], definitionOf);
    assert(flat.maxX - flat.minX === 4 && flat.maxZ - flat.minZ === 1, '1. a 4x1 brick spans 4 along x');
    assert(turned.maxX - turned.minX === 1 && turned.maxZ - turned.minZ === 4, '2. turned a quarter, it spans 4 along z');
    assert(boxOfBricks([], definitionOf) === null, '3. no bricks, no box');
    const deck = [brick('core:block_2x2', 0, 1, 0)];
    assert(restingLift({ minX: -0.5, maxX: 0.5, minY: 0, maxY: 2, minZ: -0.5, maxZ: 0.5 }, deck, definitionOf) === 2,
        '4. a box over a 2-tall block rises 2, onto its top');
    assert(restingLift({ minX: 5, maxX: 6, minY: 0, maxY: 2, minZ: 5, maxZ: 6 }, deck, definitionOf) === 0,
        '5. a box with nothing under it stays put');
    assert(restingLift({ minX: 1, maxX: 2, minY: 0, maxY: 2, minZ: -0.5, maxZ: 0.5 }, deck, definitionOf) === 0,
        '6. a box only touching the block\'s side doesn\'t count it');
    console.log('✓ box by turned footprints, and the lift onto what is under it');
}

// 2. Pointed at the top of the deck, a structure rests on it, where the pointer is.
{
    const { editorContext, tool, building, commandHistory } = makeTool();
    editorContext.setActiveComposition(post);
    tool.onPointerMove(onTop(0.2, 2, -0.3));
    let p = preview(editorContext);
    assert(p.visible && p.valid, '7. the ghost on the deck is valid');
    assert(p.x === 0 && p.z === 0 && p.y === 2, `8. it sits on the deck's top under the pointer, not on the ground behind it (${JSON.stringify(p)})`);
    const before = building.getBricks().length;
    tool.onPointerDown();
    const placed = building.getBricks().slice(before);
    assert(placed.length === 2 && placed.map((b) => b.position.y).sort().join() === '2.5,3.5', '9. placing it puts its bricks on the deck');
    assert(commandHistory.getCursor() === 1, '10. as one undo step');

    tool.onPointerMove(onTop(2.6, 2, 0));
    p = preview(editorContext);
    assert(p.x === 3 && p.y === 2 && p.valid, '11. half over the deck\'s edge, it still rests on the deck');

    tool.onPointerMove(onGround(10, 10));
    p = preview(editorContext);
    assert(p.x === 10 && p.y === 0 && p.valid, '12. pointed at the ground, it stands on the ground');

    tool.onPointerMove({ worldPosition: { x: 8, y: 0, z: 0 }, pickedBrick: { brickId: 'deck', buildingId: 'b', normal: { x: 1, y: 0, z: 0 }, point: { x: 3, y: 1, z: 0 } } });
    p = preview(editorContext);
    assert(p.x === 8 && p.y === 0, '13. pointed at a brick\'s side, it stands on the ground where the pointer meets it');
    console.log('✓ a structure rests on the top it is pointed at');
}

// 3. It rests on the tallest brick under it, and a turn works that out again.
{
    const { editorContext, tool } = makeTool([brick('core:cube', 2, 2.5, 0)]); // a cube on the deck, its top at 3
    editorContext.setActiveComposition(bench);
    tool.onPointerMove(onTop(0, 2, 0));
    let p = preview(editorContext);
    assert(p.y === 3 && p.valid, `14. a bench along x over the cube rests on the cube, not in it (${JSON.stringify(p)})`);
    tool.onKeyDown({ key: 'r', modifiers: {} });
    p = preview(editorContext);
    assert(p.rotation === 90 && p.y === 2 && p.valid, `15. turned along z, the cube isn't under it, so it rests on the deck (${JSON.stringify(p)})`);
    console.log('✓ resting on the tallest brick under it, worked out again after a turn');
}

// 4. The collision check uses the turned footprint (finding P2-12).
{
    const world = new World();
    const building = new Building({ creator: 'local' });
    building.addBrick(brick('core:cube', 2, 0.5, 0));
    world.addBuilding(building);
    const editorContext = new CreateEditorContextUseCase().execute();
    const tool = new StructureCompositionTool({
        world, registry, editorContext, commandHistory: new CommandHistory({ world }), structureResolver: null,
        compositionPreviewUseCase: new CompositionPreviewUseCase(editorContext),
        copyStructureIntoDocumentUseCase: new CopyStructureIntoDocumentUseCase()
    });
    editorContext.setActiveComposition(bench);
    tool.onPointerMove(onGround(0, 0));
    assert(editorContext.compositionPreview.valid === false, '16. a bench along x over the cube is blocked');
    tool.onKeyDown({ key: 'r', modifiers: {} });
    assert(editorContext.compositionPreview.valid === true, '17. turned along z it clears the cube, so it is valid (the check no longer ignores the turn)');

    // An existing turned brick is checked by its turned footprint too.
    const validator = new StructurePlacementValidator();
    const turnedWorld = new World();
    const turnedBuilding = new Building({ creator: 'local' });
    turnedBuilding.addBrick(brick('core:brick_1x4', 0, 0.5, 0, 90)); // runs along z
    turnedWorld.addBuilding(turnedBuilding);
    const cube = new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });
    assert(validator.canPlace(turnedWorld, registry, null, { localBounds: cube, position: new Position(1.5, 0, 0) }) === true,
        '18. beside a turned brick\'s side is clear');
    assert(validator.canPlace(turnedWorld, registry, null, { localBounds: cube, position: new Position(0, 0, 1.5) }) === false,
        '19. along a turned brick\'s length is blocked');
    console.log('✓ the collision check uses turned footprints');
}

console.log('✅ All structure resting tests passed.');
