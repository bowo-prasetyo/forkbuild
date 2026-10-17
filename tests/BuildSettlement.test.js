import {
    SETTLEMENT_TAKEN_RADIUS, SETTLEMENT_TREE_CLEARANCE, VILLAGE_FIRST_RING_RADIUS, VILLAGE_SLOT_SPACING,
    isSettleableGround, ringSpots, settleInVillage
} from '../core/BuildSettlement.js';
import { naturalFeaturesInRegion } from '../core/NaturalFeatureField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { PLAZA_CENTER, PLAZA_VILLAGE_RADIUS } from '../core/ChallengePlaza.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { StandingPlacementStrategy } from '../application/placement/StandingPlacementStrategy.js';
import { GridPlacementStrategy } from '../application/placement/InitialPlacementStrategy.js';
import { assert } from './support/Assert.js';

// The rings round the challenge plaza, where a week's entries are shown as
// exhibits (core/PlazaEntrySpots.js); and where a build stands when it is
// published: where an earlier publish stood it, else on the id-keyed grid,
// never round the plaza (docs/reviews/CreativeDirection-2026-10-12.md,
// finding 2, "Decided afterwards").

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

// The rings: round the plaza, on good ground, never the same spot twice.
{
    const taken = [];
    const isTaken = (x, z) => taken.some((spot) => distance(spot, { x, z }) < SETTLEMENT_TAKEN_RADIUS);
    for (let i = 0; i < 60; i++) {
        const spot = settleInVillage({ publicationId: `pub-${i}`, isTaken });
        assert(spot, `build ${i} settles`);
        assert(isSettleableGround(spot.x, spot.z), `build ${i} stands on dry, open ground`);
        assert(distance(spot, PLAZA_CENTER) >= PLAZA_VILLAGE_RADIUS, `build ${i} leaves the village's ready-made builds room`);
        taken.push(spot);
    }
    const firstRing = ringSpots(PLAZA_CENTER, VILLAGE_FIRST_RING_RADIUS, VILLAGE_SLOT_SPACING).filter((spot) => isSettleableGround(spot.x, spot.z)).length;
    assert(firstRing >= 10, `the first ring has room (${firstRing} spots clear of water and trees)`);
    const nearest = taken.slice(0, firstRing).map((spot) => distance(spot, PLAZA_CENTER));
    assert(Math.max(...nearest) <= VILLAGE_FIRST_RING_RADIUS + 0.01, 'the first builds fill the first ring before the next');
    for (const spot of taken) {
        const trees = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, spot.x - 8, spot.z - 8, spot.x + 8, spot.z + 8);
        assert(trees.every((tree) => Math.hypot(tree.x - spot.x, tree.z - spot.z) >= SETTLEMENT_TREE_CLEARANCE), 'no tree grows where a build settles');
    }
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
    console.log('✓ the rings round the plaza give each entry a spot of its own, on good ground');
}

// A ring's spots are evenly round it.
{
    const ring = ringSpots({ x: 0, z: 0 }, 18, 20);
    assert(ring.length === 5 && Math.abs(distance(ring[0], { x: 0, z: 0 }) - 18) < 0.01, 'a ring\'s spots are evenly round it');
    console.log('✓ a ring\'s spots are evenly round it');
}

// At publish: where an earlier publish stood it, else the grid, remix or not.
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
    const strategy = new StandingPlacementStrategy({
        spatialIndexProvider: index,
        findPublicationsByDocumentId: (documentId) => publications.get(documentId) || [],
        fallback: new GridPlacementStrategy()
    });
    const same = (a, b) => a.x === b.x && a.z === b.z;

    const first = publish('house', 'house-v1', '2026-10-17T10:00:00Z');
    assert(same(first, computeDeterministicGridPosition('house-v1')), 'a first build takes its spot on the grid');
    assert(distance(first, PLAZA_CENTER) > PLAZA_VILLAGE_RADIUS + VILLAGE_FIRST_RING_RADIUS, 'not round the plaza');
    const second = publish('house', 'house-v2', '2026-10-17T11:00:00Z');
    assert(same(second, first), 'publishing again never moves it');

    const remix = publish('house-remix', 'remix-v1', '2026-10-17T12:00:00Z', 'house');
    assert(same(remix, computeDeterministicGridPosition('remix-v1')), 'a remix takes its own spot on the grid, like any build');

    // Placed round the plaza while builds settled there: republishing keeps it there.
    const settled = settleInVillage({ publicationId: 'old-v1' });
    publications.set('old', [{ id: 'old-v1', documentId: 'old', publishedAt: '2026-10-13T00:00:00Z' }]);
    index.add('old-v1', settled);
    assert(same(publish('old', 'old-v2', '2026-10-17T13:00:00Z'), settled), 'a build placed round the plaza before stays where it stands');

    const broken = new StandingPlacementStrategy({
        spatialIndexProvider: { findByPublicationId: () => { throw new Error('broken'); }, discover: () => [] },
        findPublicationsByDocumentId: () => [{ id: 'x' }],
        fallback: new GridPlacementStrategy()
    });
    assert(same(broken.computePosition({ publicationId: 'b', documentId: 'b' }), computeDeterministicGridPosition('b')), 'a broken index never stops a publish');
    console.log('✓ at publish a build keeps its spot, or takes its own on the grid; nothing new is placed round the plaza');
}
