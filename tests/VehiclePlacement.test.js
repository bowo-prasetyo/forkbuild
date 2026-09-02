import { readFile } from 'node:fs/promises';
import {
    vehiclePresenceInRegion, bicycleDensityAt, BICYCLE_LATTICE_SPACING
} from '../core/VehiclePlacement.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { isRiverAt } from '../core/Hydrology.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// 0.9.72 — Deterministic Vehicle Placement, core/VehiclePlacement.js.
//
//   Section A: determinism
//   Section B: region behavior — inside/outside/boundary/adjacent regions
//   Section C: every generated presence is VehicleType.BICYCLE
//   Section D: every returned item is a valid, immutable VehiclePresence
//   Section E: rendering/avatar/controller independence (source sweep)
//   Section F: no movement/mounting semantics (source sweep + object shape)
//   Section G: ground gate — never in water or a river channel
//
// Central architectural claim under test throughout: vehiclePresenceInRegion(
// seed, minX, minZ, maxX, maxZ) is a PURE function of exactly its own
// arguments — no Math.random, no persisted state, nothing that depends on
// which region happened to be queried first or in what order. Two
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
    // Section A — determinism
    // -------------------------------------------------------------
    {
        const a = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600);
        const b = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600);
        assert(JSON.stringify(a) === JSON.stringify(b), '1. Same seed + same region always produces the exact same VehiclePresence ARRAY, element for element');
        assert(a.length > 0, '2. A wide enough region always yields at least one bicycle');

        // A different seed produces a genuinely different placement.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const c = vehiclePresenceInRegion(otherSeed, -600, -600, 600, 600);
        assert(JSON.stringify(a) !== JSON.stringify(c), '3. A different world seed produces a genuinely different set of bicycles over the same region');

        // bicycleDensityAt() itself is deterministic and stays in [0, 1).
        const d1 = bicycleDensityAt(DEFAULT_WORLD_SEED, 55.5, -66.6);
        const d2 = bicycleDensityAt(DEFAULT_WORLD_SEED, 55.5, -66.6);
        assert(d1 === d2 && d1 >= 0 && d1 < 1, '4. bicycleDensityAt() is deterministic and stays within [0, 1)');

        // Revisiting a region after querying many others in between
        // ("roaming away and back") reproduces the exact same bicycles.
        const anchor = tileBounds(3, -7);
        const before = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, anchor.minX, anchor.minZ, anchor.maxX, anchor.maxZ);
        for (let tx = -5; tx <= 5; tx++) {
            for (let tz = -5; tz <= 5; tz++) {
                const b2 = tileBounds(tx, tz);
                vehiclePresenceInRegion(DEFAULT_WORLD_SEED, b2.minX, b2.minZ, b2.maxX, b2.maxZ); // simulate a long journey elsewhere
            }
        }
        const after = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, anchor.minX, anchor.minZ, anchor.maxX, anchor.maxZ);
        assert(JSON.stringify(before) === JSON.stringify(after),
            '5. A fixed region\'s bicycles are byte-identical before and after querying many other regions in between');
    }

    // -------------------------------------------------------------
    // Section B — region behavior: inside/outside/boundary/adjacent
    // -------------------------------------------------------------
    {
        const region = { minX: -600, minZ: -600, maxX: 600, maxZ: 600 };
        const presences = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, region.minX, region.minZ, region.maxX, region.maxZ);
        assert(presences.length > 0, '6. Setup: this region has bicycles to check');
        for (const p of presences) {
            assert(p.position.x >= region.minX && p.position.x < region.maxX
                && p.position.z >= region.minZ && p.position.z < region.maxZ,
                `7. Bicycle at (${p.position.x}, ${p.position.z}) falls strictly within the queried [minX, maxX) x [minZ, maxZ) region — inside-region invariant`);
        }

        // Outside behavior: querying a disjoint region never returns a
        // presence whose position falls inside the FIRST region.
        const disjoint = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, 10000, 10000, 10600, 10600);
        for (const p of disjoint) {
            assert(!(p.position.x >= region.minX && p.position.x < region.maxX
                && p.position.z >= region.minZ && p.position.z < region.maxZ),
                '8. A bicycle returned for a disjoint region never falls inside a different, non-overlapping region');
        }

        // Boundary behavior: half-open [min, max) means a candidate whose
        // jittered position lands exactly on maxX/maxZ belongs to the
        // NEXT region, never both.
        const west = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -TERRAIN_TILE_SIZE, -TERRAIN_TILE_SIZE, 0, 0);
        const east = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, 0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
        for (const p of west) assert(p.position.x < 0 || p.position.z < 0, '9. A bicycle in the west/south region never lands at or past the shared (0, 0) boundary');
        for (const p of east) assert(p.position.x >= 0 && p.position.z >= 0, '10. A bicycle in the east/north region never lands before the shared (0, 0) boundary');

        // Adjacent regions: tile-by-tile queries sum to exactly the whole
        // covered region's own query — no gap, no double-count, the same
        // partition guarantee core/NaturalFeatureField.js's own tests
        // establish for trees.
        const wholeRegion = { minX: -4 * TERRAIN_TILE_SIZE, minZ: -4 * TERRAIN_TILE_SIZE, maxX: 4 * TERRAIN_TILE_SIZE, maxZ: 4 * TERRAIN_TILE_SIZE };
        const whole = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, wholeRegion.minX, wholeRegion.minZ, wholeRegion.maxX, wholeRegion.maxZ);
        let sumOfTiles = 0;
        const seenKeys = new Set();
        for (let tx = -4; tx < 4; tx++) {
            for (let tz = -4; tz < 4; tz++) {
                const { minX, minZ, maxX, maxZ } = tileBounds(tx, tz);
                const tilePresences = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
                sumOfTiles += tilePresences.length;
                for (const p of tilePresences) {
                    const key = `${p.position.x},${p.position.z}`;
                    assert(!seenKeys.has(key), `11. Bicycle at (${p.position.x}, ${p.position.z}) is discovered by exactly ONE tile query, never two`);
                    seenKeys.add(key);
                }
            }
        }
        assert(sumOfTiles === whole.length, `12. FLAGSHIP: the sum of bicycles found tile-by-tile (${sumOfTiles}) exactly equals the count found querying the whole covered region in one call (${whole.length}) — a perfect partition, no gap, no double-count`);
        assert(TERRAIN_TILE_SIZE % BICYCLE_LATTICE_SPACING === 0, '13. TERRAIN_TILE_SIZE is an exact multiple of BICYCLE_LATTICE_SPACING, so no lattice cell can ever straddle two tiles');

        // Streaming order independence: the same tile ring queried
        // ascending vs. descending discovers exactly the same bicycles.
        const tiles = [];
        for (let tx = -4; tx < 4; tx++) { for (let tz = -4; tz < 4; tz++) tiles.push({ tx, tz }); }
        function collect(order) {
            const found = new Set();
            for (const { tx, tz } of order) {
                const b2 = tileBounds(tx, tz);
                for (const p of vehiclePresenceInRegion(DEFAULT_WORLD_SEED, b2.minX, b2.minZ, b2.maxX, b2.maxZ)) {
                    found.add(`${p.position.x},${p.position.z}`);
                }
            }
            return found;
        }
        const ascending = collect(tiles);
        const descending = collect([...tiles].reverse());
        assert(ascending.size === descending.size && [...ascending].every((k) => descending.has(k)),
            '14. Streaming the same tile ring in reverse order discovers exactly the same bicycles as forward order — tile load order never changes placement');
    }

    // -------------------------------------------------------------
    // Section C — every generated presence is VehicleType.BICYCLE
    // -------------------------------------------------------------
    {
        const presences = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -2000, -2000, 2000, 2000);
        assert(presences.length > 0, '15. Setup: a wide scan finds bicycles to check');
        for (const p of presences) {
            assert(p.type === VehicleType.BICYCLE, `16. Every generated presence is VehicleType.BICYCLE (got ${p.type}) — no motorcycle/car/drone placement in this milestone`);
        }
    }

    // -------------------------------------------------------------
    // Section D — every returned item is a valid, immutable
    // VehiclePresence
    // -------------------------------------------------------------
    {
        const presences = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600);
        assert(presences.length > 0, '17. Setup: this region has bicycles to check');
        for (const p of presences) {
            assert(p instanceof VehiclePresence, '18. Every returned item is an actual VehiclePresence instance, never a plain object');
            assert(Object.isFrozen(p), '19. Every returned VehiclePresence is frozen');
            assert(Number.isFinite(p.position.x) && Number.isFinite(p.position.y) && Number.isFinite(p.position.z),
                '20. Every returned VehiclePresence has a finite position');
            assert(p.position.y === terrainHeightAt(DEFAULT_WORLD_SEED, p.position.x, p.position.z),
                '21. A bicycle\'s own Y sits at exactly terrainHeightAt(seed, x, z) — never a separately-sampled or stale elevation');
            assert(typeof p.id === 'string' && p.id.length > 0, '21b. Every returned VehiclePresence carries a non-empty string id (core/VehicleIdentity.js, 0.9.74)');
        }

        // fromJSON(toJSON()) still round-trips, proving the returned
        // objects are genuine, fully-formed VehiclePresence instances.
        const sample = presences[0];
        const roundTripped = VehiclePresence.fromJSON(sample.toJSON());
        assert(roundTripped.id === sample.id && roundTripped.type === sample.type && roundTripped.position.equals(sample.position),
            '22. A returned VehiclePresence round-trips through toJSON()/fromJSON() unchanged, id included');
    }

    // -------------------------------------------------------------
    // Section E — rendering/avatar/controller independence
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehiclePlacement.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'canvas', 'WebGL', 'THREE', 'from \'three\'', 'Renderer', 'document.', 'window.',
            'WorldView', 'Avatar', 'Controller',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `23. core/VehiclePlacement.js's own code never references "${term}" — a deterministic placement core, independent of rendering, the avatar, and any controller`);
        }
    }

    // -------------------------------------------------------------
    // Section F — no movement/mounting semantics
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehiclePlacement.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'speed', 'velocity', 'direction', 'acceleration',
            'mount', 'dismount', 'ride', 'rider', 'occupant', 'mounted'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `24. core/VehiclePlacement.js's own code never references "${term}" — placement establishes existence and location only, never movement or riding`);
        }

        // Object-shape confirmation: a returned VehiclePresence itself
        // carries only type and position — VehiclePresence.js (0.9.71)
        // already enforces this shape, checked again here so this
        // milestone's own tests don't silently rely on that guarantee
        // without stating it.
        const presence = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600)[0];
        assert(JSON.stringify(Object.keys(presence.toJSON()).sort()) === JSON.stringify(['id', 'position', 'type']),
            '25. A returned VehiclePresence\'s own JSON shape is exactly {id, type, position} — no speed/velocity/rider/mounted field anywhere');
    }

    // -------------------------------------------------------------
    // Section G — ground gate: never in water or a river channel
    // -------------------------------------------------------------
    {
        const presences = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -2000, -2000, 2000, 2000);
        assert(presences.length > 0, '26. Setup: a wide scan finds bicycles to check');
        for (const p of presences) {
            assert(ecologyZoneAt(DEFAULT_WORLD_SEED, p.position.x, p.position.z) !== ECOLOGY_ZONE.WATER,
                `27. No bicycle stands in WATER (checked independently at its own recorded position)`);
            assert(!isRiverAt(DEFAULT_WORLD_SEED, p.position.x, p.position.z),
                '28. No bicycle stands in a river channel (checked independently at its own recorded position)');
        }
    }

    console.log('✅ All Deterministic Vehicle Placement (VehiclePlacement) tests passed.');
}

await runTests();
