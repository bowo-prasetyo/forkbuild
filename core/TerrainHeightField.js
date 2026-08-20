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
// migration fixtures, the works — see docs/Architecture.md's own
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

// Smoothstep (3t^2 - 2t^3): zero first derivative at both lattice
// corners, so neighboring lattice cells interpolate into each other with
// no visible seam — plain linear interpolation would leave a visible
// crease at every integer boundary.
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
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
    return height;
}

// Deliberately not yet: a per-World/per-Document terrain seed (today's
// DEFAULT_WORLD_SEED is the one shared ground every document sits on);
// biomes, vegetation, water, or any visual layer beyond bare elevation;
// erosion/hydraulic simulation or any non-closed-form generation method;
// and persisting so much as one sampled height anywhere — every value
// this file ever produces is recomputed, never stored. See
// docs/Roadmap.md, 0.2.76, for the full list.
