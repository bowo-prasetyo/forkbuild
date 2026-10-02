import {
    terrainHeightAt, seaBasinAt, DEFAULT_WORLD_SEED, TERRAIN_HEIGHT_BOUND, TERRAIN_DEPTH_BOUND
} from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import {
    hydrologyFeatureAt, waterSurfaceColorAt, HYDROLOGY_FEATURE, SEA_BASIN_MIN,
    LAKE_SURFACE_COLOR, SEA_SURFACE_COLOR
} from '../core/Hydrology.js';
import { deriveSpatialContext } from '../core/WorldSpatialContext.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';

// Sea terrain — core/TerrainHeightField.js#seaBasinAt() and the SEA
// hydrology feature built on it.
//
//   Section A: the basin field is pure, bounded, and keeps the origin dry
//   Section B: the default world really has sea, and SEA is exactly the
//              WATER that lies deep enough in a basin
//   Section C: the sea is open water — deep, and its coast is continuous
//   Section D: water color and spatial description
//
// Like tests/Hydrology.test.js, nothing here asserts on a hardcoded
// coordinate being sea: the default world is scanned to find one.

const seed = DEFAULT_WORLD_SEED;

function findSea() {
    for (let r = 1000; r <= 8000; r += 100) {
        for (let a = 0; a < 64; a++) {
            const angle = (a / 64) * Math.PI * 2;
            const x = Math.round(Math.cos(angle) * r);
            const z = Math.round(Math.sin(angle) * r);
            if (seaBasinAt(seed, x, z) === 1) return { x, z };
        }
    }
    return null;
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: purity, bounds, origin stays dry land
    // -------------------------------------------------------------
    {
        assert(seaBasinAt(seed, 4321.5, -987.25) === seaBasinAt(seed, 4321.5, -987.25),
            '1. seaBasinAt() is deterministic');

        let inRange = true;
        for (let i = 0; i < 2000; i++) {
            const b = seaBasinAt(seed, (i - 1000) * 13.7, (i - 1000) * -9.1);
            if (!(b >= 0 && b <= 1)) inRange = false;
        }
        assert(inRange, '2. seaBasinAt() always stays within [0, 1]');

        let originDry = true;
        for (let r = 0; r < 900; r += 25) {
            for (let a = 0; a < 32; a++) {
                const angle = (a / 32) * Math.PI * 2;
                if (seaBasinAt(seed, Math.cos(angle) * r, Math.sin(angle) * r) !== 0) originDry = false;
            }
        }
        assert(originDry, '3. No sea basin anywhere within 900 units of the origin, where existing structures stand');

        assert(TERRAIN_DEPTH_BOUND > TERRAIN_HEIGHT_BOUND, '4. The sea floor reaches deeper than land terrain alone');
    }

    // -------------------------------------------------------------
    // Section B: sea exists, and SEA is exactly basin water
    // -------------------------------------------------------------
    const sea = findSea();
    assert(sea !== null, 'setup: the default world has open sea within 8000 units of the origin');
    {
        assert(hydrologyFeatureAt(seed, sea.x, sea.z) === HYDROLOGY_FEATURE.SEA,
            '5. A full-depth basin coordinate is classified SEA');

        let seaSamples = 0;
        for (let i = 0; i < 4000; i++) {
            const x = sea.x + (i - 2000) * 1.9;
            const z = sea.z + (i - 2000) * 0.7;
            const feature = hydrologyFeatureAt(seed, x, z);
            const isWater = surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER;
            const deepEnough = seaBasinAt(seed, x, z) >= SEA_BASIN_MIN;
            assert((feature === HYDROLOGY_FEATURE.SEA) === (isWater && deepEnough),
                `6. SEA exactly when WATER lies at least SEA_BASIN_MIN into a basin (${x},${z})`);
            if (feature === HYDROLOGY_FEATURE.SEA) seaSamples++;
        }
        assert(seaSamples > 100, '7. A transect through the sea crosses plenty of SEA, not a single puddle');
    }

    // -------------------------------------------------------------
    // Section C: open sea is deep, and the coastline is continuous
    // -------------------------------------------------------------
    {
        let alwaysUnder = true, inBounds = true, depthSum = 0, count = 0;
        for (let i = 0; i < 400; i++) {
            const x = sea.x + (i % 20) * 7;
            const z = sea.z + Math.floor(i / 20) * 7;
            if (seaBasinAt(seed, x, z) !== 1) continue;
            const floor = terrainHeightAt(seed, x, z);
            if (!(floor < WATER_LEVEL)) alwaysUnder = false;
            if (floor < -TERRAIN_DEPTH_BOUND) inBounds = false;
            depthSum += WATER_LEVEL - floor;
            count++;
        }
        assert(count > 0 && alwaysUnder, '8. Full-depth sea never breaks the surface: no island stands in open sea');
        assert(inBounds, '9. The sea floor never sinks past TERRAIN_DEPTH_BOUND');
        assert(depthSum / count > 4, `10. Open sea is deep on average, never a wading pool (got ${depthSum / count})`);

        let maxStep = 0;
        for (let x = sea.x - 2000; x < sea.x + 2000; x += 3) {
            maxStep = Math.max(maxStep, Math.abs(terrainHeightAt(seed, x + 1, sea.z) - terrainHeightAt(seed, x, sea.z)));
        }
        assert(maxStep < 0.5, `11. Descending onto the sea floor never jumps more than half a unit per step (got ${maxStep})`);
    }

    // -------------------------------------------------------------
    // Section D: color and description
    // -------------------------------------------------------------
    {
        const seaColor = waterSurfaceColorAt(seed, sea.x, sea.z);
        assert(JSON.stringify(seaColor) === JSON.stringify({ ...SEA_SURFACE_COLOR }),
            '12. Open sea water takes SEA_SURFACE_COLOR');
        const inlandColor = waterSurfaceColorAt(seed, 0, 0);
        assert(JSON.stringify(inlandColor) === JSON.stringify({ ...LAKE_SURFACE_COLOR }),
            '13. Water away from any basin keeps the lake tone');

        const context = deriveSpatialContext({ position: new Position(sea.x, 0, sea.z), seed });
        assert(context.hydrologyFeature === HYDROLOGY_FEATURE.SEA, '14. Spatial context at sea reports SEA');
        assert(context.description.includes('sea'), `15. The location description names the sea (got "${context.description}")`);
    }

    console.log('✅ All Sea Terrain tests passed.');
}

await runTests();
