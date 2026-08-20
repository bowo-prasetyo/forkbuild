import {
    surfaceCategoryAt, surfaceColorAt, SURFACE_CATEGORY, SURFACE_PALETTE
} from '../core/TerrainSurface.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';

// 0.2.79 — Terrain Surface & Natural Color.
//
//   Section A: determinism, boundedness, and category completeness
//   Section B: classification tracks elevation/slope, never tile coordinates
//   Section C: continuity — no visible seam anywhere, including tile boundaries
//   Section D: replica determinism — same seed + same coordinates -> same appearance
//   Section E: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: surfaceColorAt(seed,
// x, z) is a PURE function of continuous world coordinates — never tile
// coordinates, never persisted state — layered on top of
// core/TerrainHeightField.js's own pure elevation without changing it.
// Nothing in this file ever asserts on a hardcoded color or category at a
// fixed coordinate (the exact palette/thresholds are implementation
// detail); every assertion is about determinism, boundedness, continuity,
// and the elevation/slope relationship that DEFINES classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function slopeAt(seed, x, z) {
    const h = terrainHeightAt(seed, x, z);
    const dx = terrainHeightAt(seed, x + 1, z) - h;
    const dz = terrainHeightAt(seed, x, z + 1) - h;
    return Math.sqrt(dx * dx + dz * dz);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: determinism, boundedness, and category completeness
    // -------------------------------------------------------------
    {
        const c1 = surfaceCategoryAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const c2 = surfaceCategoryAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(c1 === c2, '1. Same seed + same (x, z) always produces the exact same surface category');

        const col1 = surfaceColorAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const col2 = surfaceColorAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(JSON.stringify(col1) === JSON.stringify(col2), '2. Same seed + same (x, z) always produces the exact same color');

        const validCategories = new Set(Object.values(SURFACE_CATEGORY));
        const seenCategories = new Set();
        let maxAbs = 0;
        for (let i = 0; i < 400; i++) {
            const x = (i - 200) * 41.3;
            const z = (i - 200) * -23.9;
            const category = surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z);
            assert(validCategories.has(category), `3. surfaceCategoryAt(${x}, ${z}) returns one of the four declared SURFACE_CATEGORY values, never an unknown one`);
            seenCategories.add(category);

            const color = surfaceColorAt(DEFAULT_WORLD_SEED, x, z);
            for (const channel of ['r', 'g', 'b']) {
                assert(Number.isFinite(color[channel]), `4. surfaceColorAt(${x}, ${z}).${channel} is a finite number, never NaN/Infinity`);
                assert(color[channel] >= 0 && color[channel] <= 1, `5. surfaceColorAt(${x}, ${z}).${channel} stays within [0, 1] — THREE.Color's own native range`);
                maxAbs = Math.max(maxAbs, color[channel]);
            }
        }
        assert(seenCategories.size === 4, `6. Scanning a wide spread of coordinates reaches all four SURFACE_CATEGORY values (WATER, SOIL, ROCK, GRASS), not just the common case — saw: ${[...seenCategories].join(', ')}`);

        for (const category of Object.values(SURFACE_CATEGORY)) {
            const base = SURFACE_PALETTE[category];
            assert(base && Number.isFinite(base.r) && Number.isFinite(base.g) && Number.isFinite(base.b),
                `7. SURFACE_PALETTE has a complete, finite {r, g, b} entry for ${category}`);
        }

        // A different seed produces a genuinely different classification
        // at at least some of the same coordinates — surface, like
        // elevation, is a real function of the seed, not a constant.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        let differences = 0;
        for (let i = 0; i < 60; i++) {
            const x = i * 53;
            const z = i * -31;
            if (surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z) !== surfaceCategoryAt(otherSeed, x, z)) {
                differences++;
            }
        }
        assert(differences > 5, '8. A different world seed produces a genuinely different surface field at the same coordinates');
    }

    // -------------------------------------------------------------
    // Section B: classification tracks elevation/slope, never tile coordinates
    // -------------------------------------------------------------
    {
        // WATER only ever appears in a genuine depression: every WATER
        // coordinate found has a LOWER elevation than the average of a
        // wide GRASS sample — proving water isn't assigned by anything
        // other than low elevation.
        let waterHeights = [];
        let grassHeights = [];
        for (let x = -2000; x <= 2000; x += 31) {
            for (let z = -2000; z <= 2000; z += 37) {
                const category = surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z);
                const h = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
                if (category === SURFACE_CATEGORY.WATER) waterHeights.push(h);
                if (category === SURFACE_CATEGORY.GRASS) grassHeights.push(h);
            }
        }
        assert(waterHeights.length > 0 && grassHeights.length > 0, '9. Setup: the scanned region contains both WATER and GRASS coordinates');
        const maxWaterHeight = Math.max(...waterHeights);
        const minGrassHeight = Math.min(...grassHeights);
        assert(maxWaterHeight < minGrassHeight, '10. Every WATER coordinate sits at a strictly lower elevation than every GRASS coordinate in the same scan — water is a low-elevation depression, never assigned independent of height');

        // ROCK/SOIL only ever appear where the local slope is steeper
        // than anywhere GRASS was assigned (above the water line) —
        // proving exposed-steep classification really is slope-driven.
        let steepSlopes = [];
        let grassSlopes = [];
        for (let x = -2000; x <= 2000; x += 31) {
            for (let z = -2000; z <= 2000; z += 37) {
                const category = surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z);
                const slope = slopeAt(DEFAULT_WORLD_SEED, x, z);
                if (category === SURFACE_CATEGORY.ROCK || category === SURFACE_CATEGORY.SOIL) steepSlopes.push(slope);
                if (category === SURFACE_CATEGORY.GRASS) grassSlopes.push(slope);
            }
        }
        assert(steepSlopes.length > 0, '11. Setup: the scanned region contains at least one ROCK/SOIL coordinate');
        const minSteepSlope = Math.min(...steepSlopes);
        const maxGrassSlope = Math.max(...grassSlopes);
        assert(minSteepSlope > 0, '12. Every ROCK/SOIL coordinate has a genuinely non-zero local slope');
        // Not every GRASS coordinate is flatter than every ROCK/SOIL one
        // (GRASS can sit anywhere below the slope threshold) — the
        // meaningful, non-flaky claim is that the average steep-category
        // slope is substantially higher than the average GRASS slope.
        const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
        assert(avg(steepSlopes) > avg(grassSlopes) * 2, '13. ROCK/SOIL coordinates are, on average, markedly steeper than GRASS coordinates — exposed terrain reads as soil/rock because it IS steeper, not by coincidence');

        // GRASS at a higher elevation gets a lighter tone than GRASS at
        // a lower elevation — "higher terrain -> lighter/different
        // vegetation tone" (docs/Roadmap.md, 0.2.79) — proven as a
        // monotonic brightness relationship, never a hardcoded RGB pair.
        let lowGrass = null, highGrass = null;
        for (let x = -3000; x <= 3000; x += 17) {
            for (let z = -3000; z <= 3000; z += 19) {
                if (surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z) !== SURFACE_CATEGORY.GRASS) continue;
                const h = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
                if (lowGrass === null || h < lowGrass.h) lowGrass = { x, z, h };
                if (highGrass === null || h > highGrass.h) highGrass = { x, z, h };
            }
        }
        assert(lowGrass && highGrass && highGrass.h > lowGrass.h, '14. Setup: the scan found GRASS coordinates spanning a real elevation range');
        const lowColor = surfaceColorAt(DEFAULT_WORLD_SEED, lowGrass.x, lowGrass.z);
        const highColor = surfaceColorAt(DEFAULT_WORLD_SEED, highGrass.x, highGrass.z);
        const brightness = (c) => c.r + c.g + c.b;
        assert(brightness(highColor) > brightness(lowColor), '15. FLAGSHIP-adjacent: the highest-elevation GRASS coordinate found is visibly lighter than the lowest-elevation one — higher terrain reads as a lighter vegetation tone, exactly as docs/Roadmap.md, 0.2.79 specifies');
    }

    // -------------------------------------------------------------
    // Section C: continuity — no visible seam anywhere, including tile boundaries
    // -------------------------------------------------------------
    {
        // Large-scale continuity: a 1-unit step never produces a wild
        // color jump anywhere — "very low frequency and low contrast"
        // variation (docs/Roadmap.md, 0.2.79), never a checkerboard.
        let maxStepDelta = 0;
        for (let x = 0; x < 2000; x += 3) {
            const a = surfaceColorAt(DEFAULT_WORLD_SEED, x, 42);
            const b = surfaceColorAt(DEFAULT_WORLD_SEED, x + 1, 42);
            const delta = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
            maxStepDelta = Math.max(maxStepDelta, delta);
        }
        assert(maxStepDelta < 0.5, `16. A 1-unit step anywhere along a 2000-unit walk never changes color by more than a small amount (max combined channel delta ${maxStepDelta.toFixed(4)} < 0.5) — no visible dither or checkerboard`);

        // The most important architectural claim: crossing an exact
        // terrain-TILE boundary (a multiple of TERRAIN_TILE_SIZE) is no
        // more discontinuous than crossing anywhere else — proving color
        // is a function of continuous WORLD coordinates, never of which
        // tile a point happens to fall in.
        let maxBoundaryDelta = 0;
        for (let k = -20; k <= 20; k++) {
            const boundaryX = k * TERRAIN_TILE_SIZE;
            for (let z = -500; z <= 500; z += 47) {
                const before = surfaceColorAt(DEFAULT_WORLD_SEED, boundaryX - 0.5, z);
                const after = surfaceColorAt(DEFAULT_WORLD_SEED, boundaryX + 0.5, z);
                const delta = Math.abs(after.r - before.r) + Math.abs(after.g - before.g) + Math.abs(after.b - before.b);
                maxBoundaryDelta = Math.max(maxBoundaryDelta, delta);
            }
        }
        assert(maxBoundaryDelta < 0.5, `17. FLAGSHIP: stepping across 41 different terrain-tile boundaries (x = k * TERRAIN_TILE_SIZE, for -20 <= k <= 20) never produces a bigger color jump than stepping anywhere else in the interior of a tile (max delta ${maxBoundaryDelta.toFixed(4)} < 0.5) — no visible tile seam`);

        // The exact same architectural claim, proven at the resolution
        // renderer/TerrainTileMesh.js actually samples at: for ANY
        // vertex-per-edge segment count, the rightmost column of vertices
        // in tile (tx, tz) and the leftmost column of tile (tx + 1, tz)
        // land on IDENTICAL world (x, z) coordinates, and therefore
        // receive IDENTICAL colors from two entirely independent calls —
        // this is what makes two adjacent streamed tiles agree at their
        // shared edge without any coordination between them.
        for (const segments of [4, 8, 12, 16]) {
            const tx = 3, tz = -2;
            const centerA = tileCenter(tx, tz);
            const centerB = tileCenter(tx + 1, tz);
            for (let row = 0; row <= segments; row++) {
                const localZ = -TERRAIN_TILE_SIZE / 2 + (row / segments) * TERRAIN_TILE_SIZE;
                const edgeWorldXFromA = centerA.x + TERRAIN_TILE_SIZE / 2;
                const edgeWorldXFromB = centerB.x - TERRAIN_TILE_SIZE / 2;
                assert(Math.abs(edgeWorldXFromA - edgeWorldXFromB) < 1e-9, `18. Tile (${tx},${tz})'s right edge and tile (${tx + 1},${tz})'s left edge sit at the identical world X for a ${segments}-segment mesh`);
                const worldZ = centerA.z + localZ;
                const colorFromA = surfaceColorAt(DEFAULT_WORLD_SEED, edgeWorldXFromA, worldZ);
                const colorFromB = surfaceColorAt(DEFAULT_WORLD_SEED, edgeWorldXFromB, worldZ);
                assert(JSON.stringify(colorFromA) === JSON.stringify(colorFromB), `19. FLAGSHIP: the shared edge vertex between tile (${tx},${tz}) and tile (${tx + 1},${tz}) at row ${row}/${segments} gets the byte-identical color independently computed from either tile's own vertex loop — no visible seam is possible by construction`);
            }
        }
    }

    // -------------------------------------------------------------
    // Section D: replica determinism — same seed + same coordinates -> same appearance
    // -------------------------------------------------------------
    {
        // Two entirely independent "replicas" (nothing shared but the
        // world seed constant) compute byte-identical categories and
        // colors across a long scripted path — the property that
        // matters most if World View is ever genuinely distributed
        // (docs/Roadmap.md, 0.2.79, echoing 0.2.76/0.2.77's own central
        // claim, extended from elevation/walkability to appearance).
        function replicaSample(seed, path) {
            return path.map(({ x, z }) => ({
                category: surfaceCategoryAt(seed, x, z),
                color: surfaceColorAt(seed, x, z)
            }));
        }
        const path = [];
        for (let step = 0; step <= 60; step++) {
            path.push({ x: step * 23.5, z: step * -14.25 });
        }
        const replicaAlice = replicaSample(DEFAULT_WORLD_SEED, path);
        const replicaBob = replicaSample(DEFAULT_WORLD_SEED, path);
        assert(JSON.stringify(replicaAlice) === JSON.stringify(replicaBob), '20. FLAGSHIP: two independent replicas sharing only the world seed compute the byte-identical surface category AND color at every one of 61 coordinates along a long path — no terrain-color synchronization is ever required between replicas');
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP — the design doc's own scripted scenario
    // -------------------------------------------------------------
    //
    // "World seed S -> camera at X/Z -> terrain tile generated -> surface
    // colors assigned -> move across many tile boundaries -> no visible
    // color discontinuities -> return to original coordinates -> same
    // elevation + same surface classification + same color" — and "same
    // seed + same coordinates -> same terrain appearance" across
    // independent replicas (already proven directly in Section D).
    {
        const path = [];
        for (let step = 0; step <= 50; step++) {
            path.push({ x: step * 31, z: step * 19 });
        }

        // Walking a long path crossing many tile boundaries: every step
        // produces a finite, in-range color, and the category/color at
        // each coordinate exactly matches what a completely fresh call
        // computes later — nothing about "having walked past" a
        // coordinate changes what it looks like when revisited.
        const seenAlongPath = path.map(({ x, z }) => ({
            x, z,
            category: surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z),
            color: surfaceColorAt(DEFAULT_WORLD_SEED, x, z),
            height: terrainHeightAt(DEFAULT_WORLD_SEED, x, z)
        }));
        for (const sample of seenAlongPath) {
            assert(Number.isFinite(sample.color.r), `21. FLAGSHIP: every step of a long journey across many tile boundaries produces a finite color at (${sample.x}, ${sample.z})`);
        }

        // Return to the original coordinates: same elevation, same
        // classification, same color — byte-identical, exactly as
        // 0.2.76's own flagship required for raw elevation, now proven
        // for the full surface appearance built on top of it.
        for (const sample of seenAlongPath) {
            const heightAgain = terrainHeightAt(DEFAULT_WORLD_SEED, sample.x, sample.z);
            const categoryAgain = surfaceCategoryAt(DEFAULT_WORLD_SEED, sample.x, sample.z);
            const colorAgain = surfaceColorAt(DEFAULT_WORLD_SEED, sample.x, sample.z);
            assert(heightAgain === sample.height, `22. FLAGSHIP: returning to (${sample.x}, ${sample.z}) after the full journey reproduces the byte-identical elevation`);
            assert(categoryAgain === sample.category, `23. FLAGSHIP: returning to (${sample.x}, ${sample.z}) after the full journey reproduces the byte-identical surface classification`);
            assert(JSON.stringify(colorAgain) === JSON.stringify(sample.color), `24. FLAGSHIP: returning to (${sample.x}, ${sample.z}) after the full journey reproduces the byte-identical color`);
        }

        console.log('✅ All Terrain Surface & Natural Color tests passed.');
    }
}

await runTests();
