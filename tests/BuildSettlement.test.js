import {
    REMIX_RING_RADII, SETTLEMENT_TAKEN_RADIUS, VILLAGE_FIRST_RING_RADIUS, isSettleableGround, ringSpots, settleBeside, settleInVillage
} from '../core/BuildSettlement.js';
import { PLAZA_CENTER, PLAZA_CLEARING_RADIUS } from '../core/ChallengePlaza.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { SettledPlacementStrategy } from '../application/placement/SettledPlacementStrategy.js';
import { GridPlacementStrategy } from '../application/placement/InitialPlacementStrategy.js';
import { assert } from './support/Assert.js';

// Builds settle next to each other (docs/reviews/CreativeDirection-2026-10-12.md,
// finding 2): a remix beside the build it remixes, everything else in the
// village that grows round the challenge plaza, and a republished build where
// it already stood.

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A spatial index of placements held in memory.
function spatialIndex(placements = []) {
    return {
        placements,
        findByPublicationId: (id) => placements.filter((p) => p.publicationId === id),
        discover: (center, radius) => placements.filter((p) => distance(p.position, center) <= radius),
        add(publicationId, position) {
            placements.push({ publicationId, position });
        }
    };
}

// The village: round the plaza, on good ground, never the same spot twice.
{
    const taken = [];
    const isTaken = (x, z) => taken.some((spot) => distance(spot, { x, z }) < SETTLEMENT_TAKEN_RADIUS);
    for (let i = 0; i < 60; i++) {
        const spot = settleInVillage({ publicationId: `pub-${i}`, isTaken });
        assert(spot, `build ${i} settles`);
        assert(isSettleableGround(spot.x, spot.z), `build ${i} stands on dry, open ground`);
        assert(distance(spot, PLAZA_CENTER) >= PLAZA_CLEARING_RADIUS, `build ${i} leaves the plaza's clearing open`);
        taken.push(spot);
    }
    const nearest = taken.slice(0, 20).map((spot) => distance(spot, PLAZA_CENTER));
    assert(Math.max(...nearest) <= VILLAGE_FIRST_RING_RADIUS + 0.01, 'the first twenty all stand on the first ring');
    for (let i = 0; i < taken.length; i++) {
        for (let j = i + 1; j < taken.length; j++) {
            assert(distance(taken[i], taken[j]) >= SETTLEMENT_TAKEN_RADIUS, `builds ${i} and ${j} don't share a spot`);
        }
    }
    const again = settleInVillage({ publicationId: 'pub-0' });
    assert(again.x === taken[0].x && again.z === taken[0].z, 'the same id, the same spot, on every device');
    assert(settleInVillage({ publicationId: 'pub-a' }).x !== settleInVillage({ publicationId: 'pub-b' }).x
        || settleInVillage({ publicationId: 'pub-a' }).z !== settleInVillage({ publicationId: 'pub-b' }).z, 'different ids start at different spots');
    assert(settleInVillage({ publicationId: 'full', isTaken: () => true }) === null, 'a full village settles nobody');
    console.log('✓ builds settle in a village round the plaza, each on a spot of its own');
}

// A remix beside its source.
{
    const source = { x: -400, y: 0, z: 500 };
    const spot = settleBeside({ source, publicationId: 'remix-1' });
    assert(spot && distance(spot, source) <= REMIX_RING_RADII[REMIX_RING_RADII.length - 1] + 0.01, 'within a street of its source');
    assert(settleBeside({ source: null, publicationId: 'r' }) === null && settleBeside({ source: { x: NaN, z: 0 }, publicationId: 'r' }) === null, 'needs somewhere to stand beside');
    const ring = ringSpots({ x: 0, z: 0 }, 18, 20);
    assert(ring.length === 5 && Math.abs(distance(ring[0], { x: 0, z: 0 }) - 18) < 0.01, 'a ring\'s spots are evenly round it');
    console.log('✓ a remix stands beside the build it comes from');
}

// At publish: where an earlier publish stood it, beside its source, in the
// village, and the grid only when nothing else can.
{
    const index = spatialIndex();
    const publications = new Map();
    const publish = (documentId, publicationId, publishedAt, parentDocumentId = null) => {
        const list = publications.get(documentId) || [];
        list.push({ id: publicationId, documentId, publishedAt });
        publications.set(documentId, list);
        const position = strategy.computePosition({ publicationId, documentId, parentDocumentId });
        index.add(publicationId, position);
        return position;
    };
    const strategy = new SettledPlacementStrategy({
        spatialIndexProvider: index,
        findPublicationsByDocumentId: (documentId) => publications.get(documentId) || [],
        fallback: new GridPlacementStrategy()
    });

    const first = publish('house', 'house-v1', '2026-10-12T10:00:00Z');
    assert(distance(first, PLAZA_CENTER) <= VILLAGE_FIRST_RING_RADIUS + 0.01, 'a first build joins the village');
    const second = publish('house', 'house-v2', '2026-10-12T11:00:00Z');
    assert(second.x === first.x && second.z === first.z, 'publishing again never moves it');

    const remix = publish('house-remix', 'remix-v1', '2026-10-12T12:00:00Z', 'house');
    assert(distance(remix, first) <= REMIX_RING_RADII[REMIX_RING_RADII.length - 1] + 0.01 && distance(remix, first) >= SETTLEMENT_TAKEN_RADIUS, 'a remix stands beside the build it remixes');

    // A source this device knows only as a Publication, with no placement, stands on the grid.
    publications.set('found', [{ id: 'found-pub', documentId: 'found', publishedAt: '2026-10-01T00:00:00Z' }]);
    const besideFound = publish('found-remix', 'found-remix-v1', '2026-10-12T13:00:00Z', 'found');
    assert(distance(besideFound, computeDeterministicGridPosition('found-pub')) <= REMIX_RING_RADII[1] + 0.01, 'beside a found build, where the grid stands it');

    const unknownParent = publish('orphan', 'orphan-v1', '2026-10-12T14:00:00Z', 'never-seen');
    assert(distance(unknownParent, PLAZA_CENTER) <= VILLAGE_FIRST_RING_RADIUS + 0.01, 'a remix of a build this device doesn\'t know joins the village');

    const crowded = new SettledPlacementStrategy({
        spatialIndexProvider: { findByPublicationId: () => [], discover: () => [{}] },
        findPublicationsByDocumentId: () => [],
        fallback: new GridPlacementStrategy()
    });
    const fallback = crowded.computePosition({ publicationId: 'late', documentId: 'late' });
    const grid = computeDeterministicGridPosition('late');
    assert(fallback.x === grid.x && fallback.z === grid.z, 'with every spot taken, the grid as before');

    const broken = new SettledPlacementStrategy({
        spatialIndexProvider: { findByPublicationId: () => { throw new Error('broken'); }, discover: () => [] },
        findPublicationsByDocumentId: () => [{ id: 'x' }],
        fallback: new GridPlacementStrategy()
    });
    assert(broken.computePosition({ publicationId: 'b', documentId: 'b' }).x === computeDeterministicGridPosition('b').x, 'a broken index never stops a publish');
    console.log('✓ at publish a build keeps its spot, stands beside its source, or joins the village');
}
