// Where rivers run: the winding channel field core/Hydrology.js decides
// rivers from, moved here, unchanged, so core/TerrainHeightField.js can
// carve their beds (riverBedDepthAt()) without importing Hydrology, which
// itself reads the terrain. Pure functions of (seed, x, z), like every
// layer of the world; nothing here knows about the terrain at all.
//
// The noise primitive is this module's own, per core/Hydrology.js's
// "every noise field gets its own tiny primitive" precedent, and is
// bit-for-bit the one the channel was always drawn with, so no river
// moves.

import { lerp, smoothstep } from '../utils/interpolation.js';

// A small, fast, deterministic 32-bit avalanche hash — independently
// reimplemented per core/TerrainEcology.js's own header precedent: every
// noise field in this codebase gets its own tiny, module-private
// primitive rather than a shared one two unrelated fields could
// accidentally correlate through.
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

// 'HYWX' / 'HYWZ' / 'HYVL' as bytes — arbitrary but fixed forever, and
// deliberately far from every seed offset core/TerrainHeightField.js,
// core/TerrainSurface.js, and core/TerrainEcology.js already use, so the
// channel warp, its own axis noise, and every other decorrelated field
// in this codebase never visibly track one another.
const WARP_X_SEED_OFFSET = 0x48595758;
const WARP_Z_SEED_OFFSET = 0x48595a5a;

// Low frequency, broad warp — enough to bend otherwise-straight channel
// bands into winding curves without breaking them into disconnected
// fragments (a HIGH-frequency warp would do that instead).
const WARP_FREQUENCY = 1 / 220;
const WARP_AMPLITUDE = 60;

// Wavelength ~260 world units (half that between two adjacent parallel
// bands pre-warp) — sparse enough that exploring a handful of terrain
// tiles (TERRAIN_TILE_SIZE = 40) plausibly crosses one river rather than
// a dense grid of them, the same "restrained, not everywhere" posture
// core/TerrainEcology.js's own FIELD cultivation threshold established.
const RIVER_FREQUENCY = 1 / 260;

// The channel axis is a FIXED (never seed- or position-dependent)
// direction in world space, deliberately not aligned to either world
// axis (the same "not aligned to any tile axis" reasoning
// core/TerrainEcology.js#FIELD_ROW_ANGLE already used for furrow rows) —
// otherwise every river would read as either perfectly north-south or
// perfectly east-west before warp bends it, an obviously artificial
// tell. The warp above is what actually gives a river its winding
// shape; this axis just keeps the unwarped band from looking grid-like.
export const CHANNEL_AXIS_X = 1;
export const CHANNEL_AXIS_Z = 0.35;
export const CHANNEL_AXIS_LENGTH = Math.hypot(CHANNEL_AXIS_X, CHANNEL_AXIS_Z);

// The channel field's own phase gradient magnitude along its axis —
// derived, not tuned by hand, so RIVER_CHANNEL_THRESHOLD (below) can be
// expressed as an actual world-space half-width instead of an opaque
// sine-space number that would silently drift out of proportion if
// RIVER_FREQUENCY or the axis ever changed.
export const CHANNEL_PHASE_GRADIENT = RIVER_FREQUENCY * Math.PI * 2 * CHANNEL_AXIS_LENGTH;

// A signed value in [-1, 1] whose zero-crossings trace winding channel
// centerlines across the world — a warped sine band, the standard
// "fake a river without simulating one" technique: cheap, O(1), and by
// construction continuous in world coordinates (never tile coordinates),
// so two tiles sharing an edge always agree on it exactly.
export function channelFieldAt(seed, x, z) {
    const warpX = (valueNoise2D(seed + WARP_X_SEED_OFFSET, x * WARP_FREQUENCY, z * WARP_FREQUENCY) - 0.5) * 2 * WARP_AMPLITUDE;
    const warpZ = (valueNoise2D(seed + WARP_Z_SEED_OFFSET, x * WARP_FREQUENCY, z * WARP_FREQUENCY) - 0.5) * 2 * WARP_AMPLITUDE;

    const warpedX = x + warpX;
    const warpedZ = z + warpZ;
    const along = warpedX * CHANNEL_AXIS_X + warpedZ * CHANNEL_AXIS_Z;
    return Math.sin(along * RIVER_FREQUENCY * Math.PI * 2);
}

// How close (x, z) sits to the nearest channel centerline, in [0, 1] —
// 0 exactly ON a centerline, rising toward 1 at the midpoint between two
// adjacent bands. Exported so tests (and any future renderer/tool) can
// inspect the raw field without re-deriving it from isRiverAt().
export function riverChannelDistanceAt(seed, x, z) {
    return Math.abs(channelFieldAt(seed, x, z));
}

// river half-width expressed in ACTUAL world units, not sine-space —
// a modest stream, comparable in scale to core/NaturalFeatureField.js's
// own TREE_LATTICE_SPACING (4), never a lake-sized body of flowing
// water.
export const RIVER_HALF_WIDTH = 3;
export const RIVER_CHANNEL_THRESHOLD = RIVER_HALF_WIDTH * CHANNEL_PHASE_GRADIENT;

// The unit direction along the river channel at (x, z): perpendicular to
// the channel field's gradient, so it follows the winding centreline.
// Which of the two ways it points is not meaningful (it flips between
// neighbouring channels); core/RiverFlow.js decides downstream from the
// terrain. Meaningful only in or near a channel.
const TANGENT_SAMPLE_DISTANCE = 0.5;
export function riverChannelTangentAt(seed, x, z) {
    const d = TANGENT_SAMPLE_DISTANCE;
    const gx = channelFieldAt(seed, x + d, z) - channelFieldAt(seed, x - d, z);
    const gz = channelFieldAt(seed, x, z + d) - channelFieldAt(seed, x, z - d);
    const magnitude = Math.hypot(gx, gz);
    if (magnitude === 0) return { dx: CHANNEL_AXIS_Z / CHANNEL_AXIS_LENGTH, dz: -CHANNEL_AXIS_X / CHANNEL_AXIS_LENGTH };
    return { dx: -gz / magnitude, dz: gx / magnitude };
}
