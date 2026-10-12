import { PLAZA_CENTER } from '../core/ChallengePlaza.js';
import { SETTLEMENT_TAKEN_RADIUS, VILLAGE_FIRST_RING_RADIUS, settleInVillage } from '../core/BuildSettlement.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { PLAZA_IN_VIEW_RADIUS, plazaEntrySpots, standsInVillage } from '../core/PlazaEntrySpots.js';
import { STREAMING_RADIUS } from '../application/worldNavigation/constants.js';
import { assert } from './support/Assert.js';

// Every week's entry stands in the village while someone visits the plaza
// (core/PlazaEntrySpots.js). The Islet Lighthouse, published on 2026-10-12
// before builds settled in the village, has its spot on the old grid,
// hundreds of units from the square: the plaza counted it ("1 entry stands
// here") and showed it nowhere near.

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// In the village, or not.
{
    const nearby = settleInVillage({ publicationId: 'pub-near' });
    const grid = computeDeterministicGridPosition('pub-islet-lighthouse');
    assert(standsInVillage(nearby), 'a build settled in the village stands in it');
    assert(distance(grid, PLAZA_CENTER) > STREAMING_RADIUS, `a grid spot is out of World View's reach of the square (${distance(grid, PLAZA_CENTER).toFixed(0)} away)`);
    assert(!standsInVillage(grid), 'and so not in the village');
    assert(!standsInVillage(null) && !standsInVillage({ x: NaN, z: 0 }), 'nothing known, not in it');
    assert(PLAZA_IN_VIEW_RADIUS + 20 <= STREAMING_RADIUS && PLAZA_IN_VIEW_RADIUS >= VILLAGE_FIRST_RING_RADIUS, 'the village is within reach of a camera near the square');
    console.log('✓ a spot in the village is within World View\'s reach of the square; a grid spot is not');
}

// The Islet Lighthouse case: placed far away, it is still shown in the village.
{
    const grid = computeDeterministicGridPosition('pub-islet-lighthouse');
    const placedAt = new Map([['pub-islet-lighthouse', { x: grid.x, y: grid.y, z: grid.z }]]);
    const [spot] = plazaEntrySpots([{ key: 'doc-islet-lighthouse', publicationId: 'pub-islet-lighthouse' }], { placedAt });
    assert(spot && spot.key === 'doc-islet-lighthouse' && spot.placed === false, 'an entry placed far away is shown as an exhibit');
    assert(standsInVillage(spot.position) && distance(spot.position, PLAZA_CENTER) <= VILLAGE_FIRST_RING_RADIUS + 0.01, 'on the village\'s first ring');
    assert(placedAt.get('pub-islet-lighthouse').x === grid.x, 'its own spot is left where it is');
    console.log('✓ an entry placed far from the square is shown in the village while the plaza is visited, its own spot untouched');
}

// Placed in the village, it stands there and nothing more is shown; unknown,
// it is shown where it would settle; no two share a spot.
{
    const near = settleInVillage({ publicationId: 'pub-near' });
    const placedAt = new Map([
        ['pub-near', near],
        ['pub-far', computeDeterministicGridPosition('pub-far')]
    ]);
    const spots = plazaEntrySpots([
        { key: 'near', publicationId: 'pub-near' },
        { key: 'far', publicationId: 'pub-far' },
        { key: 'unknown-1', publicationId: 'pub-unknown-1' },
        { key: 'unknown-2', publicationId: 'pub-unknown-2' }
    ], { placedAt });
    const byKey = Object.fromEntries(spots.map((spot) => [spot.key, spot]));
    assert(byKey.near.placed && byKey.near.position === near, 'one placed in the village stands where it settled');
    assert(!byKey.far.placed && !byKey['unknown-1'].placed && !byKey['unknown-2'].placed, 'the others are exhibits');
    for (let i = 0; i < spots.length; i++) {
        assert(standsInVillage(spots[i].position), `${spots[i].key} stands in the village`);
        for (let j = i + 1; j < spots.length; j++) {
            assert(distance(spots[i].position, spots[j].position) >= SETTLEMENT_TAKEN_RADIUS, `${spots[i].key} and ${spots[j].key} don't share a spot`);
        }
    }
    const again = plazaEntrySpots([{ key: 'far', publicationId: 'pub-far' }], { placedAt });
    assert(again[0].position.x === settleInVillage({ publicationId: 'pub-far', isTaken: (x, z) => distance({ x, z }, near) < SETTLEMENT_TAKEN_RADIUS }).x, 'the same entry, the same spot, on every device that knows the same placements');
    assert(plazaEntrySpots([]).length === 0 && plazaEntrySpots(null).length === 0, 'no entries, no spots');
    console.log('✓ an entry placed in the village stands there; one placed far away or unknown is shown on its village spot; none share a spot');
}
