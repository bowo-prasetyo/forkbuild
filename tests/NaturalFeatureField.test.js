import {
    naturalFeaturesInRegion, forestDensityAt, FEATURE_TYPE, TREE_LATTICE_SPACING
} from '../core/NaturalFeatureField.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE, tileCoordinateForPosition } from '../core/TerrainTiling.js';

// 0.2.88 — Deterministic World Ecology, core/NaturalFeatureField.js.
//
//   Section A: determinism and well-formedness of every returned feature
//   Section B: tile-aligned regions partition the world — no duplicate
//              tree, no dropped tree, across a shared tile edge
//   Section C: only FOREST/GRASSLAND ever host a tree; FOREST is denser
//   Section D: a feature's own Y always matches terrainHeightAt() exactly
//   Section E: FLAGSHIP — replica determinism independent of streaming/
//              tile load order, and stable across a "long journey away
//              and back"
//
// Central architectural claim under test throughout: naturalFeaturesInRegion(
// seed, minX, minZ, maxX, maxZ) is a PURE function of exactly its own
// arguments — no Math.random, no persisted TreeRecord, nothing that
// depends on WHICH tiles happened to load first or in what order. Two
// replicas querying the same region always get back the identical array.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function tileBounds(tx, tz, tileSize = TERRAIN_TILE_SIZE) {
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    return { minX, minZ, maxX: minX + tileSize, maxZ: minZ + tileSize };
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: determinism and well-formedness of every returned
    // feature
    // -------------------------------------------------------------
    {
        const a = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const b = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        assert(JSON.stringify(a) === JSON.stringify(b), '1. Same seed + same region always produces the exact same feature ARRAY, element for element');
        assert(a.length > 0, '2. A large region always yields at least one natural feature');

        for (const feature of a) {
            assert(feature.type === FEATURE_TYPE.TREE, `3. Every returned feature is a TREE (only declared FEATURE_TYPE today)`);
            assert(feature.x >= -200 && feature.x < 200 && feature.z >= -200 && feature.z < 200,
                `4. Feature at (${feature.x}, ${feature.z}) falls strictly within the queried [minX, maxX) x [minZ, maxZ) region`);
            assert(Number.isFinite(feature.y), '5. Feature Y is a finite number');
            assert(feature.rotationY >= 0 && feature.rotationY < Math.PI * 2, '6. rotationY stays within one full turn');
            assert(feature.scale >= 0.7 && feature.scale < 1.3, '7. scale stays within its declared [0.7, 1.3) range');
            assert(Number.isInteger(feature.variant) && feature.variant >= 0 && feature.variant < 3, '8. variant is one of 0, 1, 2');
        }

        // A different seed produces a genuinely different placement.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const c = naturalFeaturesInRegion(otherSeed, -200, -200, 200, 200);
        assert(JSON.stringify(a) !== JSON.stringify(c), '9. A different world seed produces a genuinely different set of natural features over the same region');
    }

    // -------------------------------------------------------------
    // Section B: tile-aligned regions partition the world — no
    // duplicate tree, no dropped tree, across a shared tile edge
    // -------------------------------------------------------------
    {
        const wholeRegion = { minX: -2 * TERRAIN_TILE_SIZE, minZ: -2 * TERRAIN_TILE_SIZE, maxX: 2 * TERRAIN_TILE_SIZE, maxZ: 2 * TERRAIN_TILE_SIZE };
        const whole = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, wholeRegion.minX, wholeRegion.minZ, wholeRegion.maxX, wholeRegion.maxZ);

        let sumOfTiles = 0;
        const seenKeys = new Set();
        for (let tx = -2; tx < 2; tx++) {
            for (let tz = -2; tz < 2; tz++) {
                const { minX, minZ, maxX, maxZ } = tileBounds(tx, tz);
                const tileFeatures = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
                sumOfTiles += tileFeatures.length;
                for (const f of tileFeatures) {
                    const key = `${f.x},${f.z}`;
                    assert(!seenKeys.has(key), `10. Tree at (${f.x}, ${f.z}) is discovered by exactly ONE tile query, never two`);
                    seenKeys.add(key);
                }
            }
        }
        assert(sumOfTiles === whole.length, `11. FLAGSHIP-adjacent: the sum of trees found tile-by-tile (${sumOfTiles}) exactly equals the count found querying the whole covered region in one call (${whole.length}) — a perfect partition, no gap, no double-count`);

        // TREE_LATTICE_SPACING divides TERRAIN_TILE_SIZE exactly — the
        // structural property this whole guarantee depends on.
        assert(TERRAIN_TILE_SIZE % TREE_LATTICE_SPACING === 0, '12. TERRAIN_TILE_SIZE is an exact multiple of TREE_LATTICE_SPACING, so no lattice cell can ever straddle two tiles');
    }

    // -------------------------------------------------------------
    // Section C: only FOREST/GRASSLAND ever host a tree; FOREST is
    // denser than GRASSLAND over a comparable area
    // -------------------------------------------------------------
    {
        const features = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600);
        assert(features.length > 0, '13. Setup: a wide scan finds trees to check');
        for (const f of features) {
            assert(f.zone === ECOLOGY_ZONE.FOREST || f.zone === ECOLOGY_ZONE.GRASSLAND,
                `14. Every tree's own zone is FOREST or GRASSLAND, never WATER/BEACH/ROCK/HIGHLAND/FIELD (got ${f.zone})`);
            assert(ecologyZoneAt(DEFAULT_WORLD_SEED, f.x, f.z) === f.zone,
                '15. A feature\'s recorded zone matches ecologyZoneAt() independently recomputed at its own position');
        }

        // Density comparison: count qualifying lattice cells vs. actual
        // trees placed, separately for a region known to be
        // FOREST-heavy-ish vs one that is not, using the SAME wide scan
        // (no cherry-picked coordinates) — forest cells are far more
        // likely to host a tree than grassland cells.
        let forestCells = 0, forestTrees = 0, grasslandCells = 0, grasslandTrees = 0;
        for (let cx = -150; cx < 150; cx++) {
            for (let cz = -150; cz < 150; cz++) {
                const x = (cx + 0.5) * TREE_LATTICE_SPACING;
                const z = (cz + 0.5) * TREE_LATTICE_SPACING;
                const zone = ecologyZoneAt(DEFAULT_WORLD_SEED, x, z);
                if (zone === ECOLOGY_ZONE.FOREST) forestCells++;
                if (zone === ECOLOGY_ZONE.GRASSLAND) grasslandCells++;
            }
        }
        for (const f of features) {
            if (f.zone === ECOLOGY_ZONE.FOREST) forestTrees++;
            if (f.zone === ECOLOGY_ZONE.GRASSLAND) grasslandTrees++;
        }
        const forestRate = forestTrees / Math.max(forestCells, 1);
        const grasslandRate = grasslandTrees / Math.max(grasslandCells, 1);
        assert(forestRate > grasslandRate * 2,
            `16. FLAGSHIP-adjacent: a FOREST-zone cell is far more likely to host a tree (rate ${forestRate.toFixed(3)}) than a GRASSLAND-zone cell (rate ${grasslandRate.toFixed(3)}) — dense cover vs. sparse scattered fringe trees, exactly the fade-to-grassland design`);
        assert(grasslandRate > 0, '17. GRASSLAND still occasionally hosts a tree — never a hard "zero trees outside forest" cutoff');
    }

    // -------------------------------------------------------------
    // Section D: a feature's own Y always matches terrainHeightAt()
    // exactly at its own (x, z)
    // -------------------------------------------------------------
    {
        const features = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, 300, 300, 700, 700);
        assert(features.length > 0, '18. Setup: this region has trees to check');
        for (const f of features) {
            const expectedY = terrainHeightAt(DEFAULT_WORLD_SEED, f.x, f.z);
            assert(f.y === expectedY, `19. Tree at (${f.x}, ${f.z}) sits at exactly terrainHeightAt(seed, x, z) — never a separately-sampled or stale elevation`);
        }
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP — replica determinism independent of
    // streaming/tile load order, and stable across a "long journey away
    // and back"
    // -------------------------------------------------------------
    {
        // A ring of tiles around a point, exactly the shape
        // renderer/TerrainStreamingController.js would load — queried
        // once in ascending order and once in descending order,
        // simulating two replicas whose camera approached from opposite
        // directions and so streamed tiles in in the opposite order.
        const tiles = [];
        for (let tx = -3; tx <= 3; tx++) {
            for (let tz = -3; tz <= 3; tz++) tiles.push({ tx, tz });
        }

        function collect(order) {
            const found = new Set();
            for (const { tx, tz } of order) {
                const { minX, minZ, maxX, maxZ } = tileBounds(tx, tz);
                for (const f of naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ)) {
                    found.add(`${f.x},${f.z},${f.y},${f.rotationY},${f.scale},${f.variant}`);
                }
            }
            return found;
        }

        const ascending = collect(tiles);
        const descending = collect([...tiles].reverse());
        assert(ascending.size > 0, '20. Setup: this tile ring has trees');
        assert(ascending.size === descending.size, '21. FLAGSHIP: streaming the same tile ring in reverse order discovers exactly as many trees as forward order');
        for (const key of ascending) {
            assert(descending.has(key), `22. FLAGSHIP: every tree found streaming forward is found again, byte-identical, streaming backward — tile load order never changes the natural world`);
        }

        // Revisiting a specific tile after querying many others in
        // between ("roaming away and back") reproduces the exact same
        // trees for that tile.
        const anchorTile = tileCoordinateForPosition(1234, -4321);
        const { minX, minZ, maxX, maxZ } = tileBounds(anchorTile.tx, anchorTile.tz);
        const before = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        for (const { tx, tz } of tiles) {
            const b = tileBounds(tx, tz);
            naturalFeaturesInRegion(DEFAULT_WORLD_SEED, b.minX, b.minZ, b.maxX, b.maxZ); // simulate a long streaming journey elsewhere
        }
        const after = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        assert(JSON.stringify(before) === JSON.stringify(after),
            '23. FLAGSHIP: a fixed tile\'s trees are byte-identical before and after streaming an entire journey across the world — reproducible across any replica');

        // forestDensityAt() itself is deterministic and decorrelated from
        // core/TerrainEcology.js#moistureAt() — spot-check it directly
        // rather than only through naturalFeaturesInRegion()'s own
        // thresholding.
        const d1 = forestDensityAt(DEFAULT_WORLD_SEED, 55.5, -66.6);
        const d2 = forestDensityAt(DEFAULT_WORLD_SEED, 55.5, -66.6);
        assert(d1 === d2 && d1 >= 0 && d1 < 1, '24. forestDensityAt() is deterministic and stays within [0, 1)');
    }

    console.log('✅ All Deterministic World Ecology (NaturalFeatureField) tests passed.');
}

await runTests();
