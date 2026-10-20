import { PLAZA_CENTER, PLAZA_CLEARING_RADIUS, PLAZA_OPEN_RADIUS, PLAZA_VILLAGE_RADIUS } from '../core/challenge/ChallengePlaza.js';
import { starterVillageLayout, starterVillageReach } from '../core/challenge/StarterVillage.js';
import { VILLAGE_FIRST_RING_RADIUS, settleInVillage } from '../core/challenge/BuildSettlement.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/nature/TerrainHeightField.js';
import { SURFACE_CATEGORY, surfaceCategoryAt } from '../core/nature/TerrainSurface.js';
import { naturalFeaturesInRegion } from '../core/nature/NaturalFeatureField.js';
import { FEATURED_STRUCTURE_IDS, featuredStructures } from '../application/home/FeaturedBuilds.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { assert } from './support/Assert.js';

// The village at the plaza (core/challenge/StarterVillage.js;
// docs/reviews/CreativeDirection-2026-10-12b.md, finding 1): the six
// ready-made builds stand round the square for everyone, and builds published
// since settle just outside them, close enough to be one village.

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const structures = featuredStructures(new CreateStructureRegistryUseCase().execute(), FEATURED_STRUCTURE_IDS);
const layout = starterVillageLayout(structures, brickRegistry);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Every ready-made build has a spot, the same on every device.
{
    assert(layout.length === 6 && layout.map((spot) => spot.structureId).join() === FEATURED_STRUCTURE_IDS.join(), 'all six stand, in their cards\' order');
    assert(JSON.stringify(starterVillageLayout(structures, brickRegistry)) === JSON.stringify(layout), 'the same layout every time');
    console.log('✓ the six ready-made builds stand round the square, the same on every device');
}

// Round the square, never on it or on each other, and inside the village.
{
    for (const spot of layout) {
        const radius = Math.hypot(spot.footprint.maxX - spot.footprint.minX, spot.footprint.maxZ - spot.footprint.minZ) / 2;
        assert(distance(spot.middle, PLAZA_CENTER) - radius >= PLAZA_OPEN_RADIUS - 0.01, `${spot.structureId} leaves the square open`);
        for (const other of layout) {
            if (other === spot) continue;
            const otherRadius = Math.hypot(other.footprint.maxX - other.footprint.minX, other.footprint.maxZ - other.footprint.minZ) / 2;
            assert(distance(spot.middle, other.middle) >= radius + otherRadius, `${spot.structureId} and ${other.structureId} don't overlap`);
        }
    }
    const reach = starterVillageReach(layout);
    assert(reach <= PLAZA_VILLAGE_RADIUS && PLAZA_VILLAGE_RADIUS <= PLAZA_CLEARING_RADIUS, `they reach ${reach.toFixed(1)} from the middle, inside the village (${PLAZA_VILLAGE_RADIUS}) and the clearing (${PLAZA_CLEARING_RADIUS})`);
    console.log(`✓ they stand round the square, apart, within ${reach.toFixed(1)} of its middle`);
}

// On dry, open, nearly level ground.
{
    for (const spot of layout) {
        const { minX, maxX, minZ, maxZ } = spot.footprint;
        const heights = [];
        for (const x of [minX, maxX]) {
            for (const z of [minZ, maxZ]) {
                const wx = spot.position.x + x;
                const wz = spot.position.z + z;
                assert(surfaceCategoryAt(DEFAULT_WORLD_SEED, wx, wz) !== SURFACE_CATEGORY.WATER, `${spot.structureId} stands on dry ground`);
                heights.push(terrainHeightAt(DEFAULT_WORLD_SEED, wx, wz));
            }
        }
        assert(Math.max(...heights) - Math.min(...heights) < 1.5, `${spot.structureId}'s ground is nearly level`);
        const trees = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, spot.position.x + minX - 2, spot.position.z + minZ - 2, spot.position.x + maxX + 2, spot.position.z + maxZ + 2);
        assert(trees.length === 0, `no tree grows through ${spot.structureId}`);
    }
    console.log('✓ on dry, open, nearly level ground');
}

// The first builds published settle just outside them, in sight of the square.
{
    const taken = [];
    for (let i = 0; i < 8; i++) {
        const spot = settleInVillage({ publicationId: `first-${i}`, isTaken: (x, z) => taken.some((s) => Math.hypot(s.x - x, s.z - z) < 15) });
        taken.push(spot);
        assert(distance(spot, PLAZA_CENTER) <= VILLAGE_FIRST_RING_RADIUS + 0.01, `build ${i} is on the first ring`);
        assert(distance(spot, PLAZA_CENTER) < 100, 'within World View\'s streaming radius of the square');
        const nearest = Math.min(...layout.map((ready) => distance(spot, ready.middle)));
        assert(nearest < 40, `build ${i} has a ready-made neighbour ${nearest.toFixed(1)} away`);
        for (const ready of layout) {
            const radius = Math.hypot(ready.footprint.maxX - ready.footprint.minX, ready.footprint.maxZ - ready.footprint.minZ) / 2;
            assert(distance(spot, ready.middle) > radius + 4, `build ${i} doesn't stand on ${ready.structureId}`);
        }
    }
    console.log(`✓ the first builds settle ${VILLAGE_FIRST_RING_RADIUS} from the middle, beside the ready-made builds and in sight of the square`);
}
