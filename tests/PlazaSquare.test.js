import { plazaSquareBricks, plazaSquareWorld } from '../core/library/PlazaSquare.js';
import { PLAZA_OPEN_RADIUS, plazaFootprint } from '../core/ChallengePlaza.js';
import { orientedSize } from '../core/BrickOrientation.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { assert } from './support/Assert.js';

// The challenge plaza's own square (core/library/PlazaSquare.js): it stands in
// the open middle, entries or none, so it must never reach the exhibits' rings
// or block the spot a visitor arrives on.

const registry = new CreateBrickRegistryUseCase().execute();
const bricks = plazaSquareBricks();

// A brick's size on the ground, with a quarter turn swapping width and depth.
function groundSize(brick) {
    const size = orientedSize(registry.get(brick.definitionId), brick.tilt);
    const quarterTurn = Math.abs(Math.round(brick.rotation / 90)) % 2 === 1;
    return quarterTurn ? { ...size, width: size.depth, depth: size.width } : size;
}

// Built only from bricks every device knows.
{
    assert(bricks.length > 20, `the square has paving and furniture — got ${bricks.length} bricks`);
    for (const brick of bricks) {
        assert(registry.has(brick.definitionId), `${brick.definitionId} is a known brick`);
    }
    console.log('✓ the square is made of ordinary bricks');
}

// Every brick, whichever way it turns, stays inside the open middle, and none
// sinks below the ground.
{
    for (const brick of bricks) {
        const size = groundSize(brick);
        const reach = Math.hypot(Math.abs(brick.position.x) + size.width / 2, Math.abs(brick.position.z) + size.depth / 2);
        assert(reach <= PLAZA_OPEN_RADIUS, `${brick.definitionId} at (${brick.position.x}, ${brick.position.z}) reaches ${reach.toFixed(2)}, past the open middle`);
        assert(brick.position.y - size.height / 2 >= -1e-9, `${brick.definitionId} rests on or above the ground`);
    }
    console.log('✓ the square stays inside the open middle, clear of the exhibits');
}

// The middle, where a visitor arrives, is open paving: nothing taller than a
// step stands within two units of it.
{
    for (const brick of bricks) {
        const size = groundSize(brick);
        const near = Math.abs(brick.position.x) - size.width / 2 < 2 && Math.abs(brick.position.z) - size.depth / 2 < 2;
        if (near) {
            assert(brick.position.y + size.height / 2 <= 0.25 + 1e-9, `${brick.definitionId} stands in the middle`);
        }
    }
    console.log('✓ the middle stays open for arriving');
}

// As a World it is the same bricks, freshly made each time, with a footprint
// the plaza can measure.
{
    const world = plazaSquareWorld();
    const all = world.getBuildings().flatMap((building) => building.getBricks());
    assert(all.length === bricks.length, 'the World holds every brick of the square');
    assert(plazaSquareWorld() !== world, 'each visit gets its own World');
    const footprint = plazaFootprint(SpatialBounds.fromWorld(world, registry));
    assert(footprint.minX < 0 && footprint.maxX > 0 && footprint.minZ < 0 && footprint.maxZ > 0, 'its footprint surrounds the middle');
    console.log('✓ plazaSquareWorld() is the square as one building');
}
