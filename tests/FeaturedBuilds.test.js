// Home's ready-made builds (application/home/FeaturedBuilds.js): which
// built-in structures it offers, how a `start` query finds one, and the
// village its 3D showcase turns, laid out so no two structures overlap.
import {
    FEATURED_STRUCTURE_IDS, SHOWCASE_STRUCTURE_IDS, STARTER_STRUCTURE_ID,
    composeShowcase, featuredStructures, findStarterStructure
} from '../application/home/FeaturedBuilds.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/editor/ForkStructureUseCase.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { assert } from './support/Assert.js';

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const structureRegistry = new CreateStructureRegistryUseCase().execute();

// Every structure Home names is a built-in one, so no card or showcase
// entry silently disappears.
{
    for (const id of [...FEATURED_STRUCTURE_IDS, ...SHOWCASE_STRUCTURE_IDS, STARTER_STRUCTURE_ID]) {
        assert(structureRegistry.has(id), `${id} is a built-in structure`);
    }
    assert(new Set(FEATURED_STRUCTURE_IDS).size === FEATURED_STRUCTURE_IDS.length, 'no card is offered twice');
    assert(FEATURED_STRUCTURE_IDS.includes(STARTER_STRUCTURE_ID), 'the starter build is also one of the cards');
    const featured = featuredStructures(structureRegistry);
    assert(featured.map((structure) => structure.id).join() === FEATURED_STRUCTURE_IDS.join(), 'the cards come in the listed order');
    console.log('✓ Home offers built-in structures only, in order');
}

// A start query names one built-in structure; anything else finds nothing.
{
    assert(findStarterStructure(structureRegistry, 'village:mill').id === 'village:mill', 'a built-in id is found');
    for (const query of [undefined, null, '', 'village:nowhere', ['village:house', 'village:mill'], 42, {}]) {
        assert(findStarterStructure(structureRegistry, query) === null, `${JSON.stringify(query)} finds nothing`);
    }
    assert(findStarterStructure(null, 'village:house') === null, 'nothing is found without a registry');
    assert(featuredStructures(structureRegistry, ['village:house', 'village:nowhere']).length === 1, 'an unknown id is left out');
    console.log('✓ a start query finds exactly one built-in structure, or nothing');
}

// The showcase: every brick of every structure, as new bricks, with the
// library's own untouched; each structure in its own cell, none overlapping,
// the whole village centered on the origin.
{
    const structures = featuredStructures(structureRegistry, SHOWCASE_STRUCTURE_IDS);
    const before = structures.map((structure) => JSON.stringify(structure.bricks.map((brick) => brick.toJSON())));
    const bricks = composeShowcase(structures, brickRegistry);

    const expected = structures.reduce((sum, structure) => sum + structure.bricks.length, 0);
    assert(bricks.length === expected, `every brick is drawn (${bricks.length} of ${expected})`);
    const libraryIds = new Set(structures.flatMap((structure) => structure.bricks.map((brick) => brick.id)));
    assert(bricks.every((brick) => !libraryIds.has(brick.id)), 'the showcase draws new bricks, not the library\'s');
    assert(structures.every((structure, index) => JSON.stringify(structure.bricks.map((brick) => brick.toJSON())) === before[index]),
        'the library\'s structures are unchanged');

    let offset = 0;
    const footprints = structures.map((structure) => {
        const own = bricks.slice(offset, offset + structure.bricks.length);
        offset += structure.bricks.length;
        own.forEach((brick, index) => {
            const original = structure.bricks[index];
            assert(brick.definitionId === original.definitionId && brick.rotation === original.rotation && brick.color === original.color,
                `${structure.id}: each brick keeps its kind, turn and color`);
            assert(brick.position.y === original.position.y, `${structure.id}: bricks stay at their height`);
        });
        return SpatialBounds.fromBricks(own, brickRegistry);
    });
    for (let a = 0; a < footprints.length; a++) {
        for (let b = a + 1; b < footprints.length; b++) {
            const [p, q] = [footprints[a], footprints[b]];
            const apart = p.max.x <= q.min.x || q.max.x <= p.min.x || p.max.z <= q.min.z || q.max.z <= p.min.z;
            assert(apart, `${structures[a].id} and ${structures[b].id} don't overlap`);
        }
    }
    const whole = SpatialBounds.fromBricks(bricks, brickRegistry);
    assert(Math.abs(whole.center.x) < 2 && Math.abs(whole.center.z) < 2, `the village is centered on the origin (${whole.center.x}, ${whole.center.z})`);
    const stable = composeShowcase([structureRegistry.get('village:stable')], brickRegistry);
    assert(stable.map((brick) => brick.color).join() === structureRegistry.get('village:stable').bricks.map((brick) => brick.color).join(),
        'colored bricks keep their color');

    assert(composeShowcase([], brickRegistry).length === 0, 'no structures, no bricks');
    console.log('✓ the showcase lays out new bricks, keeping each structure apart');
}

// A fork keeps the colors a structure's bricks have (the Tool Shed's and the
// Stable's roof-colored cubes), so a copy looks like its thumbnail.
{
    const colored = structureRegistry.getAll().filter((structure) => structure.bricks.some((brick) => brick.color !== null));
    assert(colored.length > 0, 'some built-in structures have colored bricks');
    for (const structure of colored) {
        const copy = new ForkStructureUseCase().execute(structure).world.getBuildings().flatMap((building) => building.getBricks());
        assert(copy.length === structure.bricks.length, `${structure.id}: the fork has every brick`);
        assert(copy.map((brick) => brick.color).join() === structure.bricks.map((brick) => brick.color).join(), `${structure.id}: colors survive a fork`);
    }
    console.log(`✓ forking a structure keeps its bricks' colors (${colored.map((structure) => structure.id).join(', ')})`);
}

console.log('\n✅ All FeaturedBuilds tests passed.');
