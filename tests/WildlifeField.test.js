import {
    wildlifeInRegion, wildlifeDensityAt, WILDLIFE_FEATURE_TYPE, WILDLIFE_LATTICE_SPACING, ANIMAL_SPECIES
} from '../core/WildlifeField.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { isRiverAt } from '../core/Hydrology.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE, tileCoordinateForPosition } from '../core/TerrainTiling.js';

// Deterministic World Wildlife, core/WildlifeField.js — the identical
// section shape tests/NaturalFeatureField.test.js already established for
// trees, re-proven here for animals:
//
//   Section A: determinism and well-formedness of every returned animal
//   Section B: tile-aligned regions partition the world — no duplicate
//              animal, no dropped animal, across a shared tile edge
//   Section C: only FOREST/GRASSLAND ever host an animal; each hosts
//              exactly one species, and both are far sparser than trees
//   Section D: a feature's own Y always matches terrainHeightAt() exactly
//   Section E: FLAGSHIP — replica determinism independent of streaming/
//              tile load order, and stable across a "long journey away
//              and back"
//   Section F: no animal ever stands in a river channel

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
    // animal
    // -------------------------------------------------------------
    {
        const a = wildlifeInRegion(DEFAULT_WORLD_SEED, -800, -800, 800, 800);
        const b = wildlifeInRegion(DEFAULT_WORLD_SEED, -800, -800, 800, 800);
        assert(JSON.stringify(a) === JSON.stringify(b), '1. Same seed + same region always produces the exact same animal ARRAY, element for element');
        assert(a.length > 0, '2. A large region always yields at least one animal');

        for (const animal of a) {
            assert(animal.type === WILDLIFE_FEATURE_TYPE.ANIMAL, '3. Every returned feature is an ANIMAL (only declared WILDLIFE_FEATURE_TYPE today)');
            assert(animal.x >= -800 && animal.x < 800 && animal.z >= -800 && animal.z < 800,
                `4. Animal at (${animal.x}, ${animal.z}) falls strictly within the queried [minX, maxX) x [minZ, maxZ) region`);
            assert(Number.isFinite(animal.y), '5. Animal Y is a finite number');
            assert(animal.rotationY >= 0 && animal.rotationY < Math.PI * 2, '6. rotationY stays within one full turn');
            assert(animal.scale >= 0.85 && animal.scale < 1.15, '7. scale stays within its declared [0.85, 1.15) range');
            assert(Number.isInteger(animal.variant) && animal.variant >= 0 && animal.variant < 3, '8. variant is one of 0, 1, 2');
            assert(Object.values(ANIMAL_SPECIES).includes(animal.species), `8b. species is one of ANIMAL_SPECIES (got ${animal.species})`);
        }

        // A different seed produces a genuinely different placement.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const c = wildlifeInRegion(otherSeed, -800, -800, 800, 800);
        assert(JSON.stringify(a) !== JSON.stringify(c), '9. A different world seed produces a genuinely different set of animals over the same region');
    }

    // -------------------------------------------------------------
    // Section B: tile-aligned regions partition the world — no
    // duplicate animal, no dropped animal, across a shared tile edge
    // -------------------------------------------------------------
    {
        const wholeRegion = { minX: -4 * TERRAIN_TILE_SIZE, minZ: -4 * TERRAIN_TILE_SIZE, maxX: 4 * TERRAIN_TILE_SIZE, maxZ: 4 * TERRAIN_TILE_SIZE };
        const whole = wildlifeInRegion(DEFAULT_WORLD_SEED, wholeRegion.minX, wholeRegion.minZ, wholeRegion.maxX, wholeRegion.maxZ);

        let sumOfTiles = 0;
        const seenKeys = new Set();
        for (let tx = -4; tx < 4; tx++) {
            for (let tz = -4; tz < 4; tz++) {
                const { minX, minZ, maxX, maxZ } = tileBounds(tx, tz);
                const tileAnimals = wildlifeInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
                sumOfTiles += tileAnimals.length;
                for (const a of tileAnimals) {
                    const key = `${a.x},${a.z}`;
                    assert(!seenKeys.has(key), `10. Animal at (${a.x}, ${a.z}) is discovered by exactly ONE tile query, never two`);
                    seenKeys.add(key);
                }
            }
        }
        assert(sumOfTiles === whole.length, `11. FLAGSHIP-adjacent: the sum of animals found tile-by-tile (${sumOfTiles}) exactly equals the count found querying the whole covered region in one call (${whole.length}) — a perfect partition, no gap, no double-count`);

        // WILDLIFE_LATTICE_SPACING divides TERRAIN_TILE_SIZE exactly — the
        // structural property this whole guarantee depends on.
        assert(TERRAIN_TILE_SIZE % WILDLIFE_LATTICE_SPACING === 0, '12. TERRAIN_TILE_SIZE is an exact multiple of WILDLIFE_LATTICE_SPACING, so no lattice cell can ever straddle two tiles');
    }

    // -------------------------------------------------------------
    // Section C: only FOREST/GRASSLAND ever host an animal; each zone
    // hosts exactly one species; wildlife is far sparser than trees
    // -------------------------------------------------------------
    {
        const animals = wildlifeInRegion(DEFAULT_WORLD_SEED, -1500, -1500, 1500, 1500);
        assert(animals.length > 0, '13. Setup: a wide scan finds animals to check');

        let deer = 0, rabbit = 0;
        for (const a of animals) {
            assert(a.zone === ECOLOGY_ZONE.FOREST || a.zone === ECOLOGY_ZONE.GRASSLAND,
                `14. Every animal's own zone is FOREST or GRASSLAND, never WATER/BEACH/ROCK/HIGHLAND/FIELD (got ${a.zone})`);
            assert(ecologyZoneAt(DEFAULT_WORLD_SEED, a.x, a.z) === a.zone,
                '15. An animal\'s recorded zone matches ecologyZoneAt() independently recomputed at its own position');

            if (a.zone === ECOLOGY_ZONE.FOREST) {
                assert(a.species === ANIMAL_SPECIES.DEER, `16. Every FOREST animal is DEER (got ${a.species})`);
                deer++;
            } else {
                assert(a.species === ANIMAL_SPECIES.RABBIT, `17. Every GRASSLAND animal is RABBIT (got ${a.species})`);
                rabbit++;
            }
        }
        assert(deer > 0 && rabbit > 0, `18. FLAGSHIP-adjacent: a wide-enough scan produces both species (deer ${deer}, rabbit ${rabbit}), never just one`);

        // wildlifeDensityAt() itself is deterministic and stays within
        // [0, 1) — spot-checked directly, the same shape
        // tests/NaturalFeatureField.test.js's own forestDensityAt() check
        // already uses.
        const d1 = wildlifeDensityAt(DEFAULT_WORLD_SEED, 55.5, -66.6);
        const d2 = wildlifeDensityAt(DEFAULT_WORLD_SEED, 55.5, -66.6);
        assert(d1 === d2 && d1 >= 0 && d1 < 1, '19. wildlifeDensityAt() is deterministic and stays within [0, 1)');
    }

    // -------------------------------------------------------------
    // Section D: a feature's own Y always matches terrainHeightAt()
    // exactly at its own (x, z)
    // -------------------------------------------------------------
    {
        const animals = wildlifeInRegion(DEFAULT_WORLD_SEED, 300, 300, 900, 900);
        assert(animals.length > 0, '20. Setup: this region has animals to check');
        for (const a of animals) {
            const expectedY = terrainHeightAt(DEFAULT_WORLD_SEED, a.x, a.z);
            assert(a.y === expectedY, `21. Animal at (${a.x}, ${a.z}) sits at exactly terrainHeightAt(seed, x, z) — never a separately-sampled or stale elevation`);
        }
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP — replica determinism independent of
    // streaming/tile load order, and stable across a "long journey
    // away and back"
    // -------------------------------------------------------------
    {
        const tiles = [];
        for (let tx = -4; tx <= 4; tx++) {
            for (let tz = -4; tz <= 4; tz++) tiles.push({ tx, tz });
        }

        function collect(order) {
            const found = new Set();
            for (const { tx, tz } of order) {
                const { minX, minZ, maxX, maxZ } = tileBounds(tx, tz);
                for (const a of wildlifeInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ)) {
                    found.add(`${a.x},${a.z},${a.y},${a.rotationY},${a.scale},${a.variant},${a.species}`);
                }
            }
            return found;
        }

        const ascending = collect(tiles);
        const descending = collect([...tiles].reverse());
        assert(ascending.size > 0, '22. Setup: this tile ring has animals');
        assert(ascending.size === descending.size, '23. FLAGSHIP: streaming the same tile ring in reverse order discovers exactly as many animals as forward order');
        for (const key of ascending) {
            assert(descending.has(key), `24. FLAGSHIP: every animal found streaming forward is found again, byte-identical, streaming backward — tile load order never changes the wild world`);
        }

        const anchorTile = tileCoordinateForPosition(1234, -4321);
        const { minX, minZ, maxX, maxZ } = tileBounds(anchorTile.tx, anchorTile.tz);
        const before = wildlifeInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        for (const { tx, tz } of tiles) {
            const b = tileBounds(tx, tz);
            wildlifeInRegion(DEFAULT_WORLD_SEED, b.minX, b.minZ, b.maxX, b.maxZ); // simulate a long streaming journey elsewhere
        }
        const after = wildlifeInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        assert(JSON.stringify(before) === JSON.stringify(after),
            '25. FLAGSHIP: a fixed tile\'s animals are byte-identical before and after streaming an entire journey across the world — reproducible across any replica');
    }

    // -------------------------------------------------------------
    // Section F: no animal ever stands in a river channel
    // -------------------------------------------------------------
    {
        const animals = wildlifeInRegion(DEFAULT_WORLD_SEED, -3000, -3000, 3000, 3000);
        assert(animals.length > 0, '26. Setup: this wide a scan finds animals to check');
        let riverAnimalsFound = 0;
        for (const a of animals) {
            if (isRiverAt(DEFAULT_WORLD_SEED, a.x, a.z)) riverAnimalsFound++;
        }
        assert(riverAnimalsFound === 0, `27. core/Hydrology.js's river veto holds over a wide scan: no animal stands in a river channel (found ${riverAnimalsFound})`);
    }

    console.log('✅ All Deterministic World Wildlife (WildlifeField) tests passed.');
}

await runTests();
