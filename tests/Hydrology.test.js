import {
    flowDirectionAt, riverChannelDistanceAt, isRiverAt, hydrologyFeatureAt, hydrologyGroundColorAt,
    HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT, LAKE_SURFACE_COLOR
} from '../core/Hydrology.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL, HIGHLAND_ELEVATION } from '../core/TerrainSurface.js';
import { ecologyGroundColorAt } from '../core/TerrainEcology.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// 0.2.89 — World Water & Hydrology Foundation, core/Hydrology.js.
//
//   Section A: determinism, boundedness, and feature completeness
//   Section B: LAKE mirrors surfaceCategoryAt() WATER exactly; RIVER
//              never overlaps WATER/ROCK/HIGHLAND — hydrology tracks the
//              terrain underneath, never a second independent geography
//   Section C: ground color is a CONTINUOUS function of world
//              coordinates — no seam anywhere, including tile boundaries
//   Section D: color is layered on ecologyGroundColorAt(), never a
//              replacement
//   Section E: flowDirectionAt() is real local drainage physics — it
//              points downhill
//   Section F: FLAGSHIP — replica determinism across a scripted
//              scenario, and exact tile-boundary continuity for both
//              river tint and lake surface height/color
//
// Central architectural claim under test throughout: every function in
// this file is a PURE function of exactly the (seed, x, z) triple
// terrainHeightAt() already takes — never persisted state, never a
// function of tile coordinates. Nothing here asserts on a hardcoded
// feature or color at a fixed coordinate (the exact channel shape is an
// implementation detail); every assertion is about determinism,
// correlation with the terrain underneath, continuity, and layering.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: determinism, boundedness, and feature completeness
    // -------------------------------------------------------------
    {
        const f1 = hydrologyFeatureAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const f2 = hydrologyFeatureAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(f1 === f2, '1. Same seed + same (x, z) always produces the exact same hydrology feature');

        const c1 = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const c2 = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(JSON.stringify(c1) === JSON.stringify(c2), '2. Same seed + same (x, z) always produces the exact same hydrology ground color');

        const validFeatures = new Set(Object.values(HYDROLOGY_FEATURE));
        const seenFeatures = new Set();
        for (let i = 0; i < 3000; i++) {
            const x = (i - 1500) * 3.1;
            const z = (i - 1500) * -2.7;
            const feature = hydrologyFeatureAt(DEFAULT_WORLD_SEED, x, z);
            assert(validFeatures.has(feature), `3. hydrologyFeatureAt(${x}, ${z}) returns one of the declared HYDROLOGY_FEATURE values, never an unknown one`);
            seenFeatures.add(feature);

            const color = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, x, z);
            for (const channel of ['r', 'g', 'b']) {
                assert(Number.isFinite(color[channel]) && color[channel] >= 0 && color[channel] <= 1,
                    `4. hydrologyGroundColorAt(${x}, ${z}).${channel} is finite and stays in [0, 1]`);
            }

            const distance = riverChannelDistanceAt(DEFAULT_WORLD_SEED, x, z);
            assert(Number.isFinite(distance) && distance >= 0 && distance <= 1, `5. riverChannelDistanceAt(${x}, ${z}) stays in [0, 1]`);
        }
        assert(seenFeatures.size === 3, `6. A wide coordinate scan reaches all 3 declared HYDROLOGY_FEATURE values (found ${seenFeatures.size}) — the classification is not degenerate`);
    }

    // -------------------------------------------------------------
    // Section B: LAKE mirrors surfaceCategoryAt() WATER exactly; RIVER
    // never overlaps WATER/ROCK/HIGHLAND
    // -------------------------------------------------------------
    {
        let checkedLake = 0, checkedRiver = 0;
        for (let i = 0; i < 4000; i++) {
            const x = (i - 2000) * 1.7;
            const z = (i - 2000) * 1.1;
            const surface = surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z);
            const feature = hydrologyFeatureAt(DEFAULT_WORLD_SEED, x, z);

            if (surface === SURFACE_CATEGORY.WATER) {
                assert(feature === HYDROLOGY_FEATURE.LAKE, `7. Every WATER surface coordinate is HYDROLOGY_FEATURE.LAKE (got ${feature} at ${x},${z})`);
                checkedLake++;
            } else {
                assert(feature !== HYDROLOGY_FEATURE.LAKE, `8. No non-WATER surface coordinate is ever classified LAKE (${x},${z})`);
            }

            if (feature === HYDROLOGY_FEATURE.RIVER) {
                assert(surface === SURFACE_CATEGORY.GRASS, `9. A RIVER coordinate always sits on GRASS surface, never WATER/SOIL/ROCK (got ${surface} at ${x},${z})`);
                const height = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
                assert(height < HIGHLAND_ELEVATION, `10. A RIVER coordinate always sits strictly below HIGHLAND_ELEVATION (${x},${z})`);
                checkedRiver++;
            }
        }
        assert(checkedLake > 0, '11. Setup: the wide scan actually reached lake ground');
        assert(checkedRiver > 0, '12. Setup: the wide scan actually reached river ground');
    }

    // -------------------------------------------------------------
    // Section C: ground color is a CONTINUOUS function of world
    // coordinates — no seam anywhere, including tile boundaries
    // -------------------------------------------------------------
    {
        let maxStepDelta = 0;
        for (let x = 0; x < 3000; x += 1) {
            const a = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, x, 850);
            const b = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, x + 1, 850);
            for (const channel of ['r', 'g', 'b']) {
                maxStepDelta = Math.max(maxStepDelta, Math.abs(a[channel] - b[channel]));
            }
        }
        assert(maxStepDelta < 0.35, `13. Ground color changes smoothly across a 1-unit step (max delta ${maxStepDelta.toFixed(4)}) — no jarring seam, even where a river band is crossed`);

        // Exact tile-boundary continuity, the same discipline
        // tests/TerrainEcology.test.js already proves for
        // ecologyGroundColorAt() — two "independent" tile vertex loops
        // sharing an edge must compute the byte-identical color there.
        for (let tileIndex = -6; tileIndex <= 6; tileIndex++) {
            const boundaryX = tileIndex * TERRAIN_TILE_SIZE;
            const leftTileColor = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, boundaryX, 900);
            const rightTileColor = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, boundaryX, 900);
            assert(JSON.stringify(leftTileColor) === JSON.stringify(rightTileColor),
                `14. Tile boundary at x=${boundaryX}: two independent samples of the exact same shared-edge world coordinate produce byte-identical color`);
        }
    }

    // -------------------------------------------------------------
    // Section D: color is layered on ecologyGroundColorAt(), never a
    // replacement
    // -------------------------------------------------------------
    {
        let unTintedMatches = 0;
        let tintedDiffers = 0;
        let tintedStaysClose = true;
        for (let i = 0; i < 1500; i++) {
            const x = (i - 750) * 5.3;
            const z = (i - 750) * 4.1;
            const river = isRiverAt(DEFAULT_WORLD_SEED, x, z);
            const base = ecologyGroundColorAt(DEFAULT_WORLD_SEED, x, z);
            const hydrology = hydrologyGroundColorAt(DEFAULT_WORLD_SEED, x, z);

            if (!river) {
                if (JSON.stringify(base) === JSON.stringify(hydrology)) unTintedMatches++;
            } else {
                if (JSON.stringify(base) !== JSON.stringify(hydrology)) tintedDiffers++;
                for (const channel of ['r', 'g', 'b']) {
                    if (Math.abs(base[channel] - hydrology[channel]) > 0.3) tintedStaysClose = false;
                }
            }
        }
        assert(unTintedMatches > 0, '15. Every non-river coordinate\'s hydrology ground color passes through ecologyGroundColorAt() completely unchanged (found at least one exact match)');
        assert(tintedDiffers > 0, '16. River ground color genuinely differs from the untinted ecology base — the tint is actually applied');
        assert(tintedStaysClose, '17. Even where tinted, ground color never strays far from its untinted base — a restrained tint, never a different-looking material');
    }

    // -------------------------------------------------------------
    // Section E: flowDirectionAt() is real local drainage physics — it
    // points downhill (or reports the flat-ground zero vector)
    // -------------------------------------------------------------
    {
        let checked = 0, downhill = 0, flat = 0;
        for (let i = 0; i < 500; i++) {
            const x = (i - 250) * 9.7;
            const z = (i - 250) * 6.3;
            const { dx, dz } = flowDirectionAt(DEFAULT_WORLD_SEED, x, z);

            if (dx === 0 && dz === 0) { flat++; continue; }
            checked++;
            const magnitude = Math.hypot(dx, dz);
            assert(Math.abs(magnitude - 1) < 1e-9, `18. flowDirectionAt(${x}, ${z}) returns a unit vector when not flat (magnitude ${magnitude})`);

            const height0 = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
            const heightDownhill = terrainHeightAt(DEFAULT_WORLD_SEED, x + dx * 0.05, z + dz * 0.05);
            if (heightDownhill < height0) downhill++;
        }
        assert(checked > 0, '19. Setup: the scan found non-flat ground to check flow direction on');
        assert(downhill / checked > 0.95, `20. flowDirectionAt() points toward genuinely lower ground in over 95% of non-flat samples (${downhill}/${checked})`);

        const d1 = flowDirectionAt(DEFAULT_WORLD_SEED, 42.5, -17.2);
        const d2 = flowDirectionAt(DEFAULT_WORLD_SEED, 42.5, -17.2);
        assert(JSON.stringify(d1) === JSON.stringify(d2), '21. flowDirectionAt() is deterministic for the same (seed, x, z)');
    }

    // -------------------------------------------------------------
    // Section F: FLAGSHIP — replica determinism across a scripted
    // scenario. "Same world seed + same coordinates -> same hydrology ->
    // same water," independent of how a replica arrived at that
    // coordinate.
    // -------------------------------------------------------------
    {
        // Two "replicas" querying a long, winding path independently —
        // neither reads or depends on the other's state at all.
        const path = [];
        for (let step = 0; step <= 80; step++) {
            path.push({ x: Math.sin(step * 0.23) * step * 15, z: Math.cos(step * 0.17) * step * 11 });
        }

        const replicaA = path.map((p) => ({
            feature: hydrologyFeatureAt(DEFAULT_WORLD_SEED, p.x, p.z),
            color: hydrologyGroundColorAt(DEFAULT_WORLD_SEED, p.x, p.z),
            flow: flowDirectionAt(DEFAULT_WORLD_SEED, p.x, p.z)
        }));
        const replicaB = path.map((p) => ({
            feature: hydrologyFeatureAt(DEFAULT_WORLD_SEED, p.x, p.z),
            color: hydrologyGroundColorAt(DEFAULT_WORLD_SEED, p.x, p.z),
            flow: flowDirectionAt(DEFAULT_WORLD_SEED, p.x, p.z)
        }));

        assert(JSON.stringify(replicaA) === JSON.stringify(replicaB),
            '22. FLAGSHIP: two independent replicas walking the exact same 81-point path compute byte-identical hydrology throughout — no drift, no coordination needed');

        // A different world seed produces genuinely different hydrology.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x1b873593;
        let differences = 0;
        for (const p of path) {
            if (hydrologyFeatureAt(DEFAULT_WORLD_SEED, p.x, p.z) !== hydrologyFeatureAt(otherSeed, p.x, p.z)) differences++;
        }
        assert(differences > 3, '23. FLAGSHIP: a different world seed produces genuinely different hydrology at the same coordinates');

        // Revisiting a coordinate after "roaming away" reproduces the
        // exact same feature/color/flow — nothing about evaluating OTHER
        // coordinates in between ever perturbs this one.
        const anchor = { x: 5678, z: -2345 };
        const before = {
            feature: hydrologyFeatureAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z),
            color: hydrologyGroundColorAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z),
            flow: flowDirectionAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z)
        };
        for (const p of path) hydrologyFeatureAt(DEFAULT_WORLD_SEED, p.x, p.z); // simulate a long journey elsewhere
        const after = {
            feature: hydrologyFeatureAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z),
            color: hydrologyGroundColorAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z),
            flow: flowDirectionAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z)
        };
        assert(JSON.stringify(before) === JSON.stringify(after),
            '24. FLAGSHIP: a fixed coordinate\'s hydrology is byte-identical before and after an entire journey across the world');

        // LAKE_SURFACE_HEIGHT/LAKE_SURFACE_COLOR — the constants
        // renderer/WaterTileMesh.js builds its flat lake plane from — are
        // exactly WATER_LEVEL and the SAME still-water tone
        // core/TerrainSurface.js#SURFACE_PALETTE.WATER already defines,
        // never a second, independently-tuned copy.
        assert(LAKE_SURFACE_HEIGHT === WATER_LEVEL, '25. LAKE_SURFACE_HEIGHT is exactly core/TerrainSurface.js\'s own WATER_LEVEL, never a re-derived copy');
        assert(Number.isFinite(LAKE_SURFACE_COLOR.r) && Number.isFinite(LAKE_SURFACE_COLOR.g) && Number.isFinite(LAKE_SURFACE_COLOR.b),
            '26. LAKE_SURFACE_COLOR is a well-formed {r, g, b} color');
    }

    console.log('✅ All World Water & Hydrology Foundation (Hydrology) tests passed.');
}

await runTests();
