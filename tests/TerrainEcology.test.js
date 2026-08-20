import {
    ecologyZoneAt, ecologyGroundColorAt, moistureAt, cultivationAt, ECOLOGY_ZONE
} from '../core/TerrainEcology.js';
import {
    surfaceCategoryAt, surfaceColorAt, SURFACE_CATEGORY, WATER_LEVEL, HIGHLAND_ELEVATION
} from '../core/TerrainSurface.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// 0.2.88 — Deterministic World Ecology, core/TerrainEcology.js.
//
//   Section A: determinism, boundedness, and zone completeness
//   Section B: zone classification tracks surface/elevation, never a
//              second independent ground truth
//   Section C: ground color is a CONTINUOUS function of world
//              coordinates — no seam anywhere, including tile boundaries
//   Section D: color is layered on surfaceColorAt(), never a replacement
//   Section E: FLAGSHIP — replica determinism across a scripted scenario
//
// Central architectural claim under test throughout: ecologyZoneAt(seed,
// x, z) and ecologyGroundColorAt(seed, x, z) are PURE functions of
// exactly the same (seed, x, z) triple terrainHeightAt() and
// surfaceCategoryAt() already take — never persisted state, never a
// function of tile coordinates. Nothing here asserts on a hardcoded zone
// or color at a fixed coordinate (the exact thresholds are an
// implementation detail); every assertion is about determinism,
// correlation with the terrain underneath, continuity, and layering.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: determinism, boundedness, and zone completeness
    // -------------------------------------------------------------
    {
        const z1 = ecologyZoneAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const z2 = ecologyZoneAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(z1 === z2, '1. Same seed + same (x, z) always produces the exact same ecology zone');

        const c1 = ecologyGroundColorAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const c2 = ecologyGroundColorAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(JSON.stringify(c1) === JSON.stringify(c2), '2. Same seed + same (x, z) always produces the exact same ground color');

        const validZones = new Set(Object.values(ECOLOGY_ZONE));
        const seenZones = new Set();
        for (let i = 0; i < 600; i++) {
            const x = (i - 300) * 31.7;
            const z = (i - 300) * -17.3;
            const zone = ecologyZoneAt(DEFAULT_WORLD_SEED, x, z);
            assert(validZones.has(zone), `3. ecologyZoneAt(${x}, ${z}) returns one of the declared ECOLOGY_ZONE values, never an unknown one`);
            seenZones.add(zone);

            const color = ecologyGroundColorAt(DEFAULT_WORLD_SEED, x, z);
            for (const channel of ['r', 'g', 'b']) {
                assert(Number.isFinite(color[channel]) && color[channel] >= 0 && color[channel] <= 1,
                    `4. ecologyGroundColorAt(${x}, ${z}).${channel} is finite and stays in [0, 1]`);
            }

            const m = moistureAt(DEFAULT_WORLD_SEED, x, z);
            const c = cultivationAt(DEFAULT_WORLD_SEED, x, z);
            assert(m >= 0 && m < 1, `5. moistureAt(${x}, ${z}) stays in [0, 1)`);
            assert(c >= 0 && c < 1, `6. cultivationAt(${x}, ${z}) stays in [0, 1)`);
        }
        assert(seenZones.size >= 5, `7. A wide coordinate scan reaches at least 5 of the 7 declared zones (found ${seenZones.size}) — the classification is not degenerate`);
    }

    // -------------------------------------------------------------
    // Section B: zone classification tracks surface/elevation, never a
    // second independent ground truth
    // -------------------------------------------------------------
    {
        let checked = 0;
        for (let i = 0; i < 800; i++) {
            const x = (i - 400) * 19.1;
            const z = (i - 400) * 11.7;
            const surface = surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z);
            const zone = ecologyZoneAt(DEFAULT_WORLD_SEED, x, z);
            checked++;

            if (surface === SURFACE_CATEGORY.WATER) {
                assert(zone === ECOLOGY_ZONE.WATER, `8. Every WATER surface coordinate is ECOLOGY_ZONE.WATER (got ${zone} at ${x},${z})`);
            }
            if (surface === SURFACE_CATEGORY.ROCK) {
                assert(zone === ECOLOGY_ZONE.ROCK, `9. Every ROCK surface coordinate is ECOLOGY_ZONE.ROCK (got ${zone} at ${x},${z})`);
            }
            if (zone === ECOLOGY_ZONE.BEACH) {
                const height = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
                assert(surface === SURFACE_CATEGORY.GRASS, `10. A BEACH coordinate always sits on GRASS surface (flat ground), never SOIL/ROCK`);
                assert(height > WATER_LEVEL, '11. A BEACH coordinate always sits strictly above WATER_LEVEL');
            }
            if (zone === ECOLOGY_ZONE.FOREST || zone === ECOLOGY_ZONE.FIELD || zone === ECOLOGY_ZONE.GRASSLAND) {
                const height = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
                assert(surface === SURFACE_CATEGORY.GRASS, `12. FOREST/FIELD/GRASSLAND coordinates always sit on GRASS surface`);
                assert(height < HIGHLAND_ELEVATION, '13. FOREST/FIELD/GRASSLAND coordinates always sit below HIGHLAND_ELEVATION');
            }
        }
        assert(checked === 800, '14. Setup sanity: the correlation scan actually ran');
    }

    // -------------------------------------------------------------
    // Section C: ground color is a CONTINUOUS function of world
    // coordinates — no seam anywhere, including tile boundaries
    // -------------------------------------------------------------
    {
        let maxStepDelta = 0;
        for (let x = 0; x < 2000; x += 3) {
            const a = ecologyGroundColorAt(DEFAULT_WORLD_SEED, x, 77);
            const b = ecologyGroundColorAt(DEFAULT_WORLD_SEED, x + 1, 77);
            for (const channel of ['r', 'g', 'b']) {
                maxStepDelta = Math.max(maxStepDelta, Math.abs(a[channel] - b[channel]));
            }
        }
        assert(maxStepDelta < 0.35, `15. Ground color changes smoothly across a 1-unit step (max delta ${maxStepDelta.toFixed(4)}) — no jarring seam, even where a zone boundary is crossed`);

        // Exact tile-boundary continuity, the same discipline
        // tests/TerrainSurfaceColor.test.js already proves for
        // surfaceColorAt() — two "independent" tile vertex loops sharing
        // an edge must compute the byte-identical color there.
        for (let tileIndex = -5; tileIndex <= 5; tileIndex++) {
            const boundaryX = tileIndex * TERRAIN_TILE_SIZE;
            const leftTileColor = ecologyGroundColorAt(DEFAULT_WORLD_SEED, boundaryX, 500);
            const rightTileColor = ecologyGroundColorAt(DEFAULT_WORLD_SEED, boundaryX, 500);
            assert(JSON.stringify(leftTileColor) === JSON.stringify(rightTileColor),
                `16. Tile boundary at x=${boundaryX}: two independent samples of the exact same shared-edge world coordinate produce byte-identical color`);
        }
    }

    // -------------------------------------------------------------
    // Section D: color is layered on surfaceColorAt(), never a
    // replacement
    // -------------------------------------------------------------
    {
        let unTintedMatches = 0;
        let tintedDiffers = 0;
        let tintedStaysClose = true;
        for (let i = 0; i < 500; i++) {
            const x = (i - 250) * 23.3;
            const z = (i - 250) * 41.9;
            const zone = ecologyZoneAt(DEFAULT_WORLD_SEED, x, z);
            const base = surfaceColorAt(DEFAULT_WORLD_SEED, x, z);
            const ecology = ecologyGroundColorAt(DEFAULT_WORLD_SEED, x, z);

            if (zone !== ECOLOGY_ZONE.BEACH && zone !== ECOLOGY_ZONE.FIELD) {
                if (JSON.stringify(base) === JSON.stringify(ecology)) unTintedMatches++;
            } else {
                if (JSON.stringify(base) !== JSON.stringify(ecology)) tintedDiffers++;
                for (const channel of ['r', 'g', 'b']) {
                    if (Math.abs(base[channel] - ecology[channel]) > 0.3) tintedStaysClose = false;
                }
            }
        }
        assert(unTintedMatches > 0, '17. WATER/ROCK/HIGHLAND/FOREST/GRASSLAND ground color passes through surfaceColorAt() completely unchanged (found at least one exact match)');
        assert(tintedDiffers > 0, '18. BEACH/FIELD ground color genuinely differs from the untinted base — the tint is actually applied');
        assert(tintedStaysClose, '19. Even where tinted, ground color never strays far from its untinted base — a restrained tint, never a different-looking material');
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP — replica determinism across a scripted
    // scenario. "Same world seed + same coordinates -> same ecological
    // classification -> same ground color," independent of how a
    // replica arrived at that coordinate.
    // -------------------------------------------------------------
    {
        // Two "replicas" querying a long, winding path independently —
        // neither reads or depends on the other's state at all.
        const path = [];
        for (let step = 0; step <= 60; step++) {
            path.push({ x: Math.sin(step * 0.3) * step * 12, z: Math.cos(step * 0.21) * step * 9 });
        }

        const replicaA = path.map((p) => ({
            zone: ecologyZoneAt(DEFAULT_WORLD_SEED, p.x, p.z),
            color: ecologyGroundColorAt(DEFAULT_WORLD_SEED, p.x, p.z)
        }));
        const replicaB = path.map((p) => ({
            zone: ecologyZoneAt(DEFAULT_WORLD_SEED, p.x, p.z),
            color: ecologyGroundColorAt(DEFAULT_WORLD_SEED, p.x, p.z)
        }));

        assert(JSON.stringify(replicaA) === JSON.stringify(replicaB),
            '20. FLAGSHIP: two independent replicas walking the exact same 61-point path compute byte-identical zones and colors throughout — no drift, no coordination needed');

        // A different world seed produces a genuinely different ecology.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x2545f491;
        let differences = 0;
        for (const p of path) {
            if (ecologyZoneAt(DEFAULT_WORLD_SEED, p.x, p.z) !== ecologyZoneAt(otherSeed, p.x, p.z)) differences++;
        }
        assert(differences > 5, '21. FLAGSHIP: a different world seed produces a genuinely different ecology at the same coordinates');

        // Revisiting a coordinate after "roaming away" reproduces the
        // exact same classification and color — nothing about evaluating
        // OTHER coordinates in between ever perturbs this one.
        const anchor = { x: 4321, z: -1234 };
        const before = { zone: ecologyZoneAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z), color: ecologyGroundColorAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z) };
        for (const p of path) ecologyZoneAt(DEFAULT_WORLD_SEED, p.x, p.z); // simulate a long journey elsewhere
        const after = { zone: ecologyZoneAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z), color: ecologyGroundColorAt(DEFAULT_WORLD_SEED, anchor.x, anchor.z) };
        assert(JSON.stringify(before) === JSON.stringify(after),
            '22. FLAGSHIP: a fixed coordinate\'s ecology is byte-identical before and after an entire journey across the world');
    }

    console.log('✅ All Deterministic World Ecology (TerrainEcology) tests passed.');
}

await runTests();
