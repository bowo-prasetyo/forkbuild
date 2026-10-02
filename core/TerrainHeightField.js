import { lerp, smoothstep } from '../utils/interpolation.js';

// Deterministic, seeded ground elevation for World View — see
// docs/Roadmap.md, 0.2.76, "World Ground & Terrain Foundation," and
// docs/Principles.md, "Terrain Is A Pure Function Of World Coordinates
// And A World Seed, Never Persisted State." terrainHeightAt(seed, x, z)
// is a PURE function: no Math.random, no Date.now, no I/O, no module-
// level mutable state. Two replicas — or the same replica revisiting a
// position after roaming thousands of units away — compute the exact
// same elevation at the exact same (x, z), because both are functions of
// nothing but their own arguments. That is what makes it safe to never
// persist a single terrain vertex anywhere: Terrain = f(seed, x, z),
// not a database of sampled points.
//
// Deliberately ONE global seed for the whole shared World View
// coordinate space today, not a per-World/per-Document seed — see this
// file's own "Deliberately not yet" note at the bottom. A per-world
// seed would be a Document/World schema change (a new persisted field,
// migration fixtures, the works — see docs/ArchitectureHistory.md's own
// schema-versioning discipline); a single shared constant needs none of
// that and already satisfies the one invariant this milestone actually
// asked for: every replica's camera sees the same ground everywhere.

// 'FKB0' read as bytes — arbitrary but fixed forever; changing this
// constant would change every already-rendered replica's terrain, so it
// is never meant to change casually.
export const DEFAULT_WORLD_SEED = 0x464b4230;

// Three octaves, each contributing less as its frequency rises, so the
// result reads as geography (large-scale continuity, the CONTINENTAL
// term dominates) with texture layered on top — never uniform static.
// Each octave's seedOffset decorrelates it from the others (without
// this, a single hash lattice sampled at three frequencies would show
// visible correlation between "hill" and "detail" bumps).
const OCTAVES = [
    { frequency: 1 / 500, amplitude: 6, seedOffset: 0 },      // continental shape
    { frequency: 1 / 80, amplitude: 2, seedOffset: 104729 },  // regional hills
    { frequency: 1 / 16, amplitude: 0.4, seedOffset: 224737 } // surface detail
];

// The maximum possible |terrainHeightAt()| for any seed/x/z — the sum of
// every octave's own amplitude. Exported so callers (tests, camera far-
// plane tuning, anything that wants a sane vertical bound without
// re-deriving it from OCTAVES) never have to hardcode a second copy of
// this number.
export const TERRAIN_HEIGHT_BOUND = OCTAVES.reduce((sum, octave) => sum + octave.amplitude, 0);

// Sea basins — a fourth, much slower field that, where it rises above
// SEA_BASIN_THRESHOLD, presses the ground well below the water line so
// whole regions read as open sea rather than a scattered lake. Kept
// OUT of TERRAIN_HEIGHT_BOUND on purpose: core/TerrainSurface.js derives
// WATER_LEVEL and HIGHLAND_ELEVATION from that bound, and a sea must
// never shift where an inland lake or a highland begins. The deepest
// sea floor is TERRAIN_HEIGHT_BOUND + SEA_BASIN_DEPTH below zero, and
// TERRAIN_DEPTH_BOUND names it so no caller re-derives it.
const SEA_BASIN_FREQUENCY = 1 / 2400;  // a basin spans thousands of units, never one tile
const SEA_BASIN_SEED_OFFSET = 0x53454121; // 'SEA!' as bytes
const SEA_BASIN_THRESHOLD = 0.58;     // basin noise above this begins to sink
const SEA_BASIN_RAMP = 0.12;          // how much basin noise it takes to reach full depth: the width of the continental shelf
export const SEA_BASIN_DEPTH = 14; // > 1.5 × TERRAIN_HEIGHT_BOUND (the highest land minus WATER_LEVEL), so full-depth sea never breaks the surface
export const TERRAIN_DEPTH_BOUND = TERRAIN_HEIGHT_BOUND + SEA_BASIN_DEPTH;

// Every already-built structure sits near the origin, so the land
// around it stays land: no basin within SEA_ORIGIN_CLEAR_RADIUS, a
// full-strength one only past SEA_ORIGIN_CLEAR_RADIUS + SEA_ORIGIN_FADE.
const SEA_ORIGIN_CLEAR_RADIUS = 900;
const SEA_ORIGIN_FADE = 700;

// A small, fast, deterministic 32-bit integer hash (a Squirrel3/xxhash-
// style avalanche) turning a (seed, latticeX, latticeZ) integer triple
// into a pseudo-random value in [0, 1). Uses only Math.imul/bitwise ops,
// which the JS spec guarantees behave identically on every engine — the
// same portability guarantee every other signed/hashed primitive in this
// codebase already relies on (see identity/Ed25519.js's own from-scratch
// posture).
function hash2D(seed, latticeX, latticeZ) {
    let h = seed | 0;
    h = Math.imul(h ^ latticeX, 0x27d4eb2d);
    h = Math.imul(h ^ (latticeZ + 0x9e3779b9), 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Bilinear value noise on the unit lattice, in [0, 1). One octave's
// worth of "bumpiness" at whatever (x, z) scale the caller already
// applied its own frequency to.
function valueNoise2D(seed, x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smoothstep(x - x0);
    const tz = smoothstep(z - z0);

    const v00 = hash2D(seed, x0, z0);
    const v10 = hash2D(seed, x0 + 1, z0);
    const v01 = hash2D(seed, x0, z0 + 1);
    const v11 = hash2D(seed, x0 + 1, z0 + 1);

    const top = lerp(v00, v10, tx);
    const bottom = lerp(v01, v11, tx);
    return lerp(top, bottom, tz);
}

// The one public entry point: deterministic ground elevation at world
// (x, z) for `seed` — every renderer/ and application/ ground-placement
// site in this codebase calls this SAME function rather than computing
// its own approximation (see renderer/Renderer.js#terrainHeightAt(),
// the single shared query point that wraps it with DEFAULT_WORLD_SEED).
export function terrainHeightAt(seed, x, z) {
    let height = 0;
    for (const octave of OCTAVES) {
        const n = valueNoise2D(seed + octave.seedOffset, x * octave.frequency, z * octave.frequency);
        height += (n - 0.5) * 2 * octave.amplitude;
    }
    return height - seaBasinAt(seed, x, z) * SEA_BASIN_DEPTH;
}

// How far (x, z) lies into a sea basin: 0 on ordinary land, 1 over open
// sea, easing between the two across the shelf. Pure, like everything
// here; core/Hydrology.js reads it to tell a sea from a lake.
export function seaBasinAt(seed, x, z) {
    const n = valueNoise2D(seed + SEA_BASIN_SEED_OFFSET, x * SEA_BASIN_FREQUENCY, z * SEA_BASIN_FREQUENCY);
    const basin = smoothstep(clamp01((n - SEA_BASIN_THRESHOLD) / SEA_BASIN_RAMP));
    if (basin === 0) return 0;
    const fromOrigin = Math.hypot(x, z);
    return basin * smoothstep(clamp01((fromOrigin - SEA_ORIGIN_CLEAR_RADIUS) / SEA_ORIGIN_FADE));
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Deliberately not yet: a per-World/per-Document terrain seed (today's
// DEFAULT_WORLD_SEED is the one shared ground every document sits on);
// biomes, vegetation, or any visual layer beyond bare elevation (sea
// basins shape elevation only; core/Hydrology.js names them);
// erosion/hydraulic simulation or any non-closed-form generation method;
// and persisting so much as one sampled height anywhere — every value
// this file ever produces is recomputed, never stored. See
// docs/Roadmap.md, 0.2.76, for the full list.
