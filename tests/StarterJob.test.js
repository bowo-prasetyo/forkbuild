import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { FIRST_EDIT_BRICK_ID, STARTER_JOBS, StarterCardStage, StarterJobId, StarterStepId, isStarterJobDone, starterCardStage, starterJobById, starterJobProgress, starterStepGuide, unfinishedStructure } from '../core/challenge/StarterJob.js';
import { FEATURED_STRUCTURE_IDS } from '../application/home/FeaturedBuilds.js';
import { restingHeight } from '../core/building/BrickResting.js';
import { addReadyMadeBricks, countPlacedBricks, worldBricks } from '../core/building/PlacedBricks.js';
import { STARTER_JOB_ID, STARTER_STRUCTURE_ID } from '../application/home/FeaturedBuilds.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../application/editor/CreateToolRegistryUseCase.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { ToolManager } from '../application/editor/ToolManager.js';
import { DEFAULT_BRICK_ID, PlacementTool } from '../application/tools/PlacementTool.js';
import { ToolId } from '../application/editor-state/ToolId.js';
import { assert } from './support/Assert.js';

// Make it yours, in the village (docs/reviews/CreativeDirection-2026-10-12b.md,
// findings 2 and 3): Home's main button opens the House with its roof left
// to do (core/challenge/StarterJob.js), a roof dropped on it rests on its walls
// (core/building/BrickResting.js), and Place with nothing chosen places a cube.

const registry = new CreateBrickRegistryUseCase().execute();
const structures = new CreateStructureRegistryUseCase().execute();
const house = structures.get('village:house');
const definitionOf = (id) => registry.get(id);

function placementTool(bricks = []) {
    const editorContext = new CreateEditorContextUseCase().execute();
    const world = new World({});
    const building = new Building({});
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    const context = { registry, editorContext, world, previewUseCase: new PreviewUseCase(editorContext), commandHistory: new CommandHistory({ world }) };
    return { context, world, building, editorContext };
}

// Home's button names the House and the roof job.
{
    assert(STARTER_STRUCTURE_ID === 'village:house' && STARTER_JOB_ID === StarterJobId.ROOF, 'Home starts with the House\'s roof job');
    const job = starterJobById(STARTER_JOB_ID);
    assert(job === STARTER_JOBS.roof && job.structureId === STARTER_STRUCTURE_ID, 'the job is the House\'s');
    assert(job.steps.map((step) => step.id).join() === 'roof,chimney,path,garden', 'a chain of four: roof, chimney, path, garden');
    assert(registry.get(job.steps[0].brickId)?.category === 'roof', 'its first button picks a roof brick');
    for (const step of job.steps) assert(registry.get(step.brickId), `${step.id}'s button picks a real brick (${step.brickId})`);
    assert(job.steps.reduce((sum, step) => sum + step.needed, 0) === 10, 'ending at ten bricks of the builder\'s own, the building target');
    for (const id of [undefined, null, '', 'toString', '__proto__', 'paint']) {
        assert(starterJobById(id) === null, `no job for ${String(id)}`);
    }
    console.log('✓ Home\'s main button names the House and its roof job');
}

// The unfinished House: walls, door, windows and furniture, no roof or chimney.
{
    const job = starterJobById('roof');
    const unfinished = unfinishedStructure(job, house);
    assert(unfinished.id === house.id && unfinished.name === house.name, 'still the House, so its copy says where it came from');
    const ids = unfinished.bricks.map((brick) => brick.definitionId);
    assert(!ids.includes('core:roof_hip_6x6') && !ids.includes('core:chimney'), 'no roof and no chimney');
    for (const kept of ['core:door', 'core:wall_1x3', 'core:plate_2x2', 'core:table', 'core:bed', 'core:hearth']) {
        assert(ids.includes(kept), `the ${kept} is still there`);
    }
    assert(unfinished.bricks.length === house.bricks.length - 2, `everything else is kept (${unfinished.bricks.length} of ${house.bricks.length})`);
    assert(house.bricks.some((brick) => brick.definitionId === 'core:roof_hip_6x6'), 'the library\'s House keeps its roof');
    assert(unfinishedStructure(job, structures.get('village:mill')) === null, 'the roof job is the House\'s only');
    assert(!isStarterJobDone(job, unfinished.bricks, definitionOf, unfinished.bricks), 'the job starts undone');
    console.log('✓ the House arrives with its walls up, its room furnished and no roof');
}

// Doing the job: a roof on the walls, which is the builder's own brick.
{
    const job = starterJobById('roof');
    const unfinished = unfinishedStructure(job, house);
    const { world, building } = placementTool(unfinished.bricks.map((brick) => new Brick({
        definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color, tilt: brick.tilt
    })));
    const readyMade = addReadyMadeBricks(null, worldBricks(world));
    assert(countPlacedBricks(worldBricks(world), readyMade) === 0, 'nothing of the builder\'s yet');

    // Dropped on the middle of the floor, the 6x6 roof rests on the walls,
    // just where the library House has it.
    const floorTop = 0.25;
    const y = restingHeight({ definition: registry.get(job.steps[0].brickId), position: { x: 0, y: floorTop + 1.25, z: 0 } }, building.getBricks(), definitionOf);
    const libraryRoof = house.bricks.find((brick) => brick.definitionId === job.steps[0].brickId);
    assert(y === libraryRoof.position.y, `the roof rests on the walls at ${libraryRoof.position.y} (got ${y})`);
    building.addBrick(new Brick({ definitionId: job.steps[0].brickId, position: new Position(0, y, 0) }));
    const progress = starterJobProgress(job, worldBricks(world), definitionOf, unfinished.bricks);
    assert(progress.steps[0].done && !progress.done && progress.current.id === StarterStepId.CHIMNEY, 'a roof does the first step, and the chimney is next');
    assert(countPlacedBricks(worldBricks(world), readyMade) === 1, 'and is the builder\'s own brick');

    // A small brick on the floor stays on the floor; one where something
    // stands rests on top of it.
    const cube = registry.get('core:cube');
    assert(restingHeight({ definition: cube, position: { x: 0, y: 0.75, z: -2 } }, building.getBricks(), definitionOf) === 0.75, 'a cube on open floor stays on the floor');
    const onTable = restingHeight({ definition: cube, position: { x: 0, y: 0.75, z: 0.25 } }, building.getBricks(), definitionOf);
    const table = house.bricks.find((brick) => brick.definitionId === 'core:table');
    assert(onTable === table.position.y + 0.4 + 0.5, `a cube where the table stands rests on it (${onTable})`);
    // Turning a long brick turns its footprint.
    const beam = registry.get('core:beam');
    const posts = [new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 1.5) })];
    assert(restingHeight({ definition: beam, position: { x: 0, y: 0.25, z: 0 } }, posts, definitionOf) === 0.25, 'a beam along x misses a cube beside it');
    assert(restingHeight({ definition: beam, position: { x: 0, y: 0.25, z: 0 }, rotation: 90 }, posts, definitionOf) === 1.25, 'turned along z, it rests on it');
    console.log('✓ a roof dropped on the floor rests on the walls, and does the first step as the builder\'s own brick');
}

// The tool: clicking the floor in the middle of the house with the roof
// chosen places it on the walls.
{
    const job = starterJobById('roof');
    const unfinished = unfinishedStructure(job, house);
    const { context, building, editorContext } = placementTool(unfinished.bricks.map((brick) => new Brick({
        definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, tilt: brick.tilt
    })));
    const middle = building.getBricks().find((brick) => brick.definitionId === 'core:plate_2x2' && brick.position.x === 0 && brick.position.z === 0);
    editorContext.setActiveBrick(job.steps[0].brickId);
    const tool = new PlacementTool(context);
    tool.activate();
    const pointer = { worldPosition: { x: 0, y: 0.25, z: 0 }, pickedBrick: { buildingId: building.id, brickId: middle.id, normal: { x: 0, y: 1, z: 0 } } };
    tool.onPointerMove(pointer);
    assert(editorContext.preview.visible && editorContext.preview.position.y === 4.5, `the roof's ghost rests on the walls (${editorContext.preview.position.y})`);
    tool.onPointerDown(pointer);
    const roof = building.getBricks().find((brick) => brick.definitionId === job.steps[0].brickId);
    assert(roof && roof.position.x === 0 && roof.position.y === 4.5 && roof.position.z === 0, 'and the roof is placed there');
    console.log('✓ with the roof chosen, clicking the middle of the floor puts it on the walls');
}

// The job's guide: from the Editor's camera a click on the house lands on a
// wall, so while the roof is chosen, anywhere on the house puts it on top.
{
    const job = starterJobById('roof');
    const guide = starterStepGuide(job, job.steps[0], house);
    assert(guide.definitionId === job.steps[0].brickId && guide.position.y === 4.5 && guide.position.x === 0 && guide.position.z === 0, 'the guide is where the finished House has its roof');
    assert(guide.around.x === 0 && guide.around.z === 0 && guide.radius === 8, 'and works anywhere within 8 of the House\'s middle');
    assert(starterStepGuide(job, job.steps[0], structures.get('village:mill')) === null, 'and only for the House');
    const unfinished = unfinishedStructure(job, house);
    const setup = () => placementTool(unfinished.bricks.map((brick) => new Brick({
        definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, tilt: brick.tilt
    })));
    const frontWall = (building) => building.getBricks().find((brick) => brick.definitionId === 'core:wall_1x3' && brick.position.z === -3 && brick.position.x === 1.5);
    const hitWall = (building) => ({ worldPosition: { x: 1.5, y: 0, z: -4 }, pickedBrick: { buildingId: building.id, brickId: frontWall(building).id, normal: { x: 0, y: 0, z: -1 } } });

    const unguided = setup();
    unguided.editorContext.setActiveBrick(job.steps[0].brickId);
    const plain = new PlacementTool(unguided.context);
    plain.onPointerMove(hitWall(unguided.building));
    assert(unguided.editorContext.preview.position.z < -3, 'with no guide, a roof clicked onto the front wall stands against it');

    const guided = setup();
    guided.editorContext.setActiveBrick(job.steps[0].brickId);
    guided.editorContext.setPlacementGuide(guide);
    const tool = new PlacementTool(guided.context);
    tool.onPointerMove(hitWall(guided.building));
    const p = guided.editorContext.preview.position;
    assert(p.x === 0 && p.y === 4.5 && p.z === 0, `with the guide, a click on the front wall puts the roof on the house (${p.x}, ${p.y}, ${p.z})`);
    tool.onPointerMove({ worldPosition: { x: 20, y: 0, z: 20 }, pickedBrick: null });
    assert(guided.editorContext.preview.position.x === 20, 'far from the house, the roof goes where it is put');
    guided.editorContext.setActiveBrick('core:cube');
    tool.onPointerMove(hitWall(guided.building));
    assert(guided.editorContext.preview.position.y < 4, 'and the guide is for the roof only');
    console.log('✓ while the job\'s roof is chosen, a click anywhere on the house puts it on top');
}

// The whole chain, with the real tool: each step's button picks its brick,
// a click on the house puts it where it belongs, and ten clicks make ten
// bricks of the builder's own; an undo takes a step back.
{
    const job = starterJobById('roof');
    const unfinished = unfinishedStructure(job, house);
    const { context, world, building, editorContext } = placementTool(unfinished.bricks.map((brick) => new Brick({
        definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color, tilt: brick.tilt
    })));
    const readyMade = addReadyMadeBricks(null, worldBricks(world));
    const tool = new PlacementTool(context);
    tool.activate();
    const progress = () => starterJobProgress(job, worldBricks(world), definitionOf, unfinished.bricks);
    // From the Editor's camera a click on the house lands on its roof or a front wall.
    const onTheHouse = () => {
        const roof = building.getBricks().find((brick) => brick.definitionId === 'core:roof_hip_6x6');
        const wall = building.getBricks().find((brick) => brick.definitionId === 'core:wall_1x3' && brick.position.z === -3 && brick.position.x === 1.5);
        const target = roof || wall;
        return { worldPosition: { x: target.position.x, y: 3, z: target.position.z }, pickedBrick: { buildingId: building.id, brickId: target.id, normal: roof ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: -1 } } };
    };
    const click = (pointer) => {
        const step = progress().current;
        editorContext.setActiveBrick(step.brickId);
        if (step.color !== undefined) editorContext.setActiveBrickColor(step.color);
        editorContext.setPlacementGuide(starterStepGuide(job, step, house, worldBricks(world)));
        tool.onPointerMove(pointer);
        tool.onPointerDown(pointer);
        return building.getBricks().at(-1);
    };

    assert(progress().current.id === StarterStepId.ROOF && progress().steps.every((step) => step.placed === 0), 'it starts at the roof, with nothing placed');
    const roof = click(onTheHouse());
    assert(roof.definitionId === 'core:roof_hip_6x6' && roof.position.y === 4.5, 'the roof goes on the walls');
    const chimney = click(onTheHouse());
    const libraryChimney = house.bricks.find((brick) => brick.definitionId === 'core:chimney');
    assert(chimney.definitionId === 'core:chimney' && chimney.position.x === libraryChimney.position.x && chimney.position.y === libraryChimney.position.y && chimney.position.z === libraryChimney.position.z,
        `the chimney goes where the finished House has it (${chimney.position.x}, ${chimney.position.y}, ${chimney.position.z})`);
    assert(progress().current.id === StarterStepId.PATH && progress().steps[2].placed === 0, 'the doorstep, already there, is not a stone of the path');
    // Once the chimney stands, a tap in the middle of the view lands on it,
    // the far side of the house from the path's last stones: still laid.
    const onTheChimney = () => ({ worldPosition: { x: chimney.position.x, y: 5, z: chimney.position.z }, pickedBrick: { buildingId: building.id, brickId: chimney.id, normal: { x: 0, y: 1, z: 0 } } });
    const stones = [];
    for (let i = 0; i < 4; i += 1) stones.push(click(i % 2 ? onTheChimney() : onTheHouse()));
    assert(stones.every((stone, i) => stone.definitionId === 'core:plate_1x1' && stone.position.x === -0.5 && stone.position.y === 0.125 && stone.position.z === -4.5 - i),
        `four stones line up from the doorstep (${stones.map((stone) => stone.position.z).join(', ')})`);
    assert(stones.every((stone) => stone.color === 0x9a9a9a), 'in the doorstep\'s grey');
    assert(progress().current.id === StarterStepId.GARDEN, 'then the garden');
    assert(starterStepGuide(job, progress().current, house, worldBricks(world)) === null, 'which goes wherever it is put');
    const garden = [];
    for (let i = 0; i < 4; i += 1) garden.push(click({ worldPosition: { x: 5 + i * 2, y: 0, z: -6 }, pickedBrick: null }));
    assert(garden.every((bush, i) => bush.definitionId === 'core:bush' && bush.position.x === 5 + i * 2), 'four bushes, just where they were put');
    assert(progress().done && progress().current === null, 'the job is done');
    assert(countPlacedBricks(worldBricks(world), readyMade) === 10, `ten bricks of the builder's own (${countPlacedBricks(worldBricks(world), readyMade)})`);

    building.removeBrick(garden[3].id);
    assert(!progress().done && progress().current.id === StarterStepId.GARDEN && progress().steps[3].placed === 3, 'an undo takes the garden back to three of four');
    building.removeBrick(chimney.id);
    assert(progress().current.id === StarterStepId.CHIMNEY && progress().steps[2].done, 'and the first step not done is the one shown, the path still laid');
    console.log('✓ the chain: roof, chimney and four stones to their places, four garden pieces anywhere, ten bricks of the builder\'s own');
}

// What counts towards a step: any of its bricks beyond those it started
// with, so other bricks do nothing and the garden takes any of its pieces.
{
    const job = starterJobById('roof');
    const unfinished = unfinishedStructure(job, house);
    const at = (definitionId, x, z) => new Brick({ definitionId, position: new Position(x, 0.5, z) });
    const garden = [at('core:fence', 6, 0), at('core:lawn_2x2', 8, 0), at('core:rock', 10, 0), at('core:lantern', 12, 0)];
    const others = [at('core:cube', 6, 4), at('core:cube', 8, 4)];
    const progress = starterJobProgress(job, [...unfinished.bricks, ...garden, ...others], definitionOf, unfinished.bricks);
    assert(progress.steps[3].done && progress.steps[3].placed === 4, 'a fence, a lawn, a rock and a lantern make the garden');
    assert(!progress.steps[0].done && progress.current.id === StarterStepId.ROOF, 'and the roof is still to do: cubes count for nothing');
    const extra = starterJobProgress(job, [...unfinished.bricks, ...garden, ...garden], definitionOf, unfinished.bricks);
    assert(extra.steps[3].placed === 4, 'a step never counts past what it needs');
    assert(starterJobProgress(null, [], definitionOf) === null && !isStarterJobDone(null, [], definitionOf), 'no job, no progress');
    console.log('✓ a step counts its own bricks beyond the start, any of the garden\'s, never past what it needs');
}

// Place with nothing chosen: the Cube, and the first click places it.
{
    const { context, building, editorContext } = placementTool();
    const manager = new ToolManager(new CreateToolRegistryUseCase().execute(), context, editorContext);
    manager.start();
    assert(editorContext.activeBrick.definitionId === null, 'a new build starts with no brick chosen');
    editorContext.setActiveTool(ToolId.PLACE);
    assert(editorContext.activeBrick.definitionId === DEFAULT_BRICK_ID, `Place loads the Cube (${editorContext.activeBrick.definitionId})`);
    const ground = { worldPosition: { x: 2, y: 0, z: 3 }, pickedBrick: null };
    manager.onPointerMove(ground);
    manager.onPointerDown(ground);
    assert(building.getBricks().length === 1 && building.getBricks()[0].definitionId === 'core:cube', 'and the first click places it');
    // A brick already chosen is kept.
    editorContext.setActiveTool(ToolId.SELECT);
    editorContext.setActiveBrick('core:wall_1x3');
    editorContext.setActiveTool(ToolId.PLACE);
    assert(editorContext.activeBrick.definitionId === 'core:wall_1x3', 'a brick already chosen stays chosen');
    manager.stop();
    console.log('✓ Place with no brick chosen loads the Cube, and the first click places it');
}

// The card a ready-made build carries: the job, or with none a first brick
// of the builder's own, then Publish; gone once published or hidden.
{
    const job = starterJobById('roof');
    assert(starterCardStage({ job }) === StarterCardStage.JOB, 'the House asks for its roof first');
    assert(starterCardStage({ job, placedCount: 3 }) === StarterCardStage.JOB, 'other bricks don\'t do the job');
    assert(starterCardStage({ job, jobDone: true, placedCount: 1 }) === StarterCardStage.PUBLISH, 'a roof on, it asks to publish');
    assert(starterCardStage({}) === StarterCardStage.FIRST_EDIT, 'a ready-made build with no job asks for a first brick of the builder\'s own');
    assert(starterCardStage({ placedCount: 1 }) === StarterCardStage.PUBLISH, 'one brick of their own, and it asks to publish');
    assert(starterCardStage({ placedCount: 4, published: true }) === null, 'published, the card goes');
    assert(starterCardStage({ job, jobDone: true, hidden: true }) === null, 'hidden, it stays hidden');
    assert(starterCardStage({ hidden: true }) === null, 'at any stage');
    assert(starterCardStage() === StarterCardStage.FIRST_EDIT, 'nothing said: a first brick');
    console.log('✓ the starter card asks for the job or a first brick, then to publish, until published or hidden');
}

// The first-edit card's tree: a real brick, and placing it beside a
// ready-made build makes the build the builder's own.
{
    assert(registry.get(FIRST_EDIT_BRICK_ID)?.category === 'nature', `the first-edit card picks a tree (${FIRST_EDIT_BRICK_ID})`);
    for (const id of FEATURED_STRUCTURE_IDS) {
        const structure = structures.get(id);
        const readyMade = addReadyMadeBricks(null, structure.bricks);
        assert(countPlacedBricks(structure.bricks, readyMade) === 0 && starterCardStage({ placedCount: 0 }) === StarterCardStage.FIRST_EDIT, `${id} opens untouched`);
        const tree = new Brick({ definitionId: FIRST_EDIT_BRICK_ID, position: new Position(40, 1.25, 40) });
        const placed = countPlacedBricks([...structure.bricks, tree], readyMade);
        assert(placed === 1 && starterCardStage({ placedCount: placed }) === StarterCardStage.PUBLISH, `a tree beside ${id} is the builder's own`);
    }
    console.log('✓ a tree beside any ready-made build is the builder\'s own brick, and the card moves on to Publish');
}
