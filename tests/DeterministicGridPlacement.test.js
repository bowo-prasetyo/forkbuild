import { computeDeterministicGridPosition, isDrySpot, DRY_SPOT_REACH } from '../core/world/DeterministicGridPlacement.js';
import { computeFnv1a32 } from '../serializer/contentHash.js';
import { AvatarWaterConstraint } from '../application/avatar/AvatarWaterConstraint.js';
import { assert } from './support/Assert.js';

// Where a freshly published build lands on the id-keyed grid
// (core/world/DeterministicGridPlacement.js): a function of its id alone, and
// never under water, where nobody could walk in at its door.

// The id's own cell, as the grid has always worked it out.
function ownCell(id) {
    const hash = parseInt(computeFnv1a32(String(id)), 16);
    return { x: (hash % 64) * 40, z: (Math.floor(hash / 64) % 64) * 40 };
}

const ids = Array.from({ length: 600 }, (_, i) => `publication-${i}`);
const water = new AvatarWaterConstraint();

{
    assert(computeDeterministicGridPosition('pub-a').x === computeDeterministicGridPosition('pub-a').x
        && computeDeterministicGridPosition('pub-a').z === computeDeterministicGridPosition('pub-a').z, 'the same id lands on the same spot');
    const origin = computeDeterministicGridPosition(null);
    assert(origin.x === 0 && origin.y === 0 && origin.z === 0, 'no id: the origin');
    console.log('✓ a spot is a function of the id');
}

{
    // Where the bundled-site test's House was published into a lake, 3 m deep.
    assert(!isDrySpot(2440, 1440), 'a spot in a lake is not dry');
    assert(water.depthAt(2439.5, 1437) > 1, 'sanity: its door stands in deep water');
    let kept = 0;
    let moved = 0;
    for (const id of ids) {
        const spot = computeDeterministicGridPosition(id);
        const own = ownCell(id);
        assert(isDrySpot(spot.x, spot.z), `${id} lands on a dry spot`);
        for (let dx = -DRY_SPOT_REACH; dx <= DRY_SPOT_REACH; dx += 4) {
            for (let dz = -DRY_SPOT_REACH; dz <= DRY_SPOT_REACH; dz += 4) {
                assert(water.depthAt(spot.x + dx, spot.z + dz) === 0, `${id}: no water round its spot, where a house and its door stand`);
            }
        }
        if (isDrySpot(own.x, own.z)) {
            assert(spot.x === own.x && spot.z === own.z, `${id}: a dry cell of its own is kept, as it always was`);
            kept++;
        } else {
            assert(spot.x % 40 === 0 && spot.z % 40 === 0 && spot.x >= 0 && spot.x < 2560 && spot.z >= 0 && spot.z < 2560,
                `${id}: a wet one is passed over for another cell of the grid`);
            moved++;
        }
    }
    assert(kept > ids.length / 2 && moved > 0, `most ids keep their own cell (${kept}); those under water move (${moved})`);
    console.log(`✓ a build is never placed under water: ${moved} of ${ids.length} ids passed over a wet cell, the rest keep their own`);
}
