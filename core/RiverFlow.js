// Which way, and how fast, a river's water runs at (x, z) — a pure function
// of the same (seed, x, z) every hydrology layer takes, so the renderer
// (renderer/RiverTileMesh.js) can carry it on each vertex of a river's
// water and every tile agrees on it at a shared edge.
//
// A river here is a winding channel laid over the terrain
// (core/Hydrology.js), not a drainage network, so it has no source and no
// mouth to say which way is downstream. What it does have, everywhere, is
// the ground under it: the water runs ALONG the channel
// (riverChannelTangentAt()) towards whichever way the ground falls over a
// stretch of FLOW_BASELINE either side, faster the steeper that fall, up
// to MAX_RIVER_SPEED at FULL_SPEED_SLOPE. Where a stretch of river levels
// out the water slows smoothly to still and, past the low point, runs the
// other way — two runs meeting in a dip, as water would. The speed passes
// through zero there rather than flipping, so the flow field is continuous
// and the drawn current never jumps.
//
// The current itself is visual, like the waves on lakes and the sea
// (core/WaterWaves.js): nothing is carried along by it. The water's depth
// (riverWaterDepthAt()) is not: wading through a river slows an avatar
// the way wading into a lake does.

import { riverBedAt, riverPoolAt, riverChannelFallAt, riverSurfaceHeightAt as surfaceHeightAt } from './TerrainHeightField.js';
import { riverChannelTangentAt, riverProximityAt } from './Hydrology.js';
import { RIVER_FILL, FALL_BASELINE } from './RiverBed.js';

// World units a second, at full speed: a brisk stream, about a walking pace.
export const MAX_RIVER_SPEED = 1.2;

// The fall (rise over run) at which a river runs at full speed. Measured on
// this world's rivers: about half the river length is at least this steep,
// a tenth under a quarter of it.
export const FULL_SPEED_SLOPE = 0.01;

// How far up- and downstream the ground is compared, in world units: long
// enough to read the lie of the land, not every bump in it. The same
// baseline core/RiverBed.js finds its cascades by.
export const FLOW_BASELINE = FALL_BASELINE;

// Where a river ends in a pool at the highland edge (core/RiverBed.js), the
// pool is a spring when the river runs away from it: its water wells up at
// the centre and spreads outward at up to SPRING_SPEED. When the river runs
// into it instead, it is a still pond the current dies away in.
export const SPRING_SPEED = 0.5;

export { RIVER_FILL };

function clampUnit(v) {
    return v < -1 ? -1 : v > 1 ? 1 : v;
}

function smooth01(v) {
    const t = v < 0 ? 0 : v > 1 ? 1 : v;
    return t * t * (3 - 2 * t);
}

// The water's velocity at (x, z): { vx, vz } in world units a second.
// Meaningful where the river is (core/Hydrology.js#riverProximityAt() > 0).
export function riverFlowAt(seed, x, z) {
    const { vx, vz } = poolCurrentAt(seed, x, z);
    return { vx, vz };
}

// The current at (x, z), and, in a highland pool, how it gives way there:
// the channel's current (`channelVx`, `channelVz`), how far into the pool's
// own water (x, z) is (`inPool`, 0..1), how much the pool is a spring
// (`spring`, 0..1), its centre (`centreX`, `centreZ`) and the current
// itself (`vx`, `vz`).
function poolCurrentAt(seed, x, z) {
    const tangent = riverChannelTangentAt(seed, x, z);
    const speed = clampUnit(riverChannelFallAt(seed, x, z, tangent) / FULL_SPEED_SLOPE) * MAX_RIVER_SPEED;
    const vx = tangent.dx * speed;
    const vz = tangent.dz * speed;
    const pool = riverPoolAt(seed, x, z);
    if (!pool || pool.r >= 1) return { vx, vz, pool: null };

    // In the pool: the channel's current gives way to the pool's own,
    // fully within half its radius.
    const inPool = (1 - smooth01((pool.r - 0.5) / 0.5)) * pool.crossing;
    const slope = Math.hypot(pool.gx, pool.gz) || 1;
    const upX = pool.gx / slope;
    const upZ = pool.gz / slope;
    // A spring when the river runs away from the highland.
    const spring = smooth01(-(vx * upX + vz * upZ) / (0.3 * MAX_RIVER_SPEED));
    // Outward from the pool's centre: across the channel (the channel
    // field's own gradient is (tangent.dz, -tangent.dx)) and on up the
    // channel into the highland.
    const outX = pool.across * tangent.dz + pool.up * pool.dirX;
    const outZ = pool.across * -tangent.dx + pool.up * pool.dirZ;
    const outLength = Math.hypot(outX, outZ) || 1;
    const welling = SPRING_SPEED * spring * smooth01(pool.r * 3);
    return {
        vx: vx * (1 - inPool) + (outX / outLength) * welling * inPool,
        vz: vz * (1 - inPool) + (outZ / outLength) * welling * inPool,
        pool: { inPool, spring, centreX: x - outX, centreZ: z - outZ }
    };
}

// A spring at (x, z): how strongly the water there wells up (`strength`,
// 0..1: 1 within the middle of a spring's pool, fading to its rim, 0 in a
// still pond or off a pool) and where its centre is (`centreX`,
// `centreZ`), so the renderer can ring the surface out from it
// (renderer/RiverFlowMaterial.js) and the soundscape can bubble
// (core/AmbientSoundscape.js). Null where there is no spring.
export function riverSpringAt(seed, x, z) {
    return springOf(poolCurrentAt(seed, x, z).pool);
}

function springOf(pool) {
    if (!pool) return null;
    const strength = pool.spring * pool.inPool;
    if (strength <= 0) return null;
    return { strength, centreX: pool.centreX, centreZ: pool.centreZ };
}

// riverFlowAt() and riverSpringAt() at once, for a renderer that wants both
// at every vertex (renderer/RiverTileMesh.js): the pool is found once.
export function riverCurrentAt(seed, x, z) {
    const { vx, vz, pool } = poolCurrentAt(seed, x, z);
    return { vx, vz, spring: springOf(pool) };
}

// Rapids: where the river runs down ground well past FULL_SPEED_SLOPE it
// breaks white. 0 on gentle water, rising to 1 by RAPIDS_FULL_SLOPE; the
// renderer foams the surface by it (renderer/RiverFlowMaterial.js).
// Measured on this world's rivers: about a tenth of their length falls
// faster than RAPIDS_FROM_SLOPE. On a cascade (core/RiverBed.js) the water
// is calmer in its pools and white where it pours over each drop; in a
// highland pool it is still.
export const RAPIDS_FROM_SLOPE = 0.035;
export const RAPIDS_FULL_SLOPE = 0.05;
const CASCADE_POOL_CALM = 0.6;

export function riverRapidsAt(seed, x, z) {
    const fall = Math.abs(riverChannelFallAt(seed, x, z, riverChannelTangentAt(seed, x, z)));
    const rapids = smooth01((fall - RAPIDS_FROM_SLOPE) / (RAPIDS_FULL_SLOPE - RAPIDS_FROM_SLOPE));
    const bed = riverBedAt(seed, x, z);
    const inCascadePool = bed.cascade * (1 - bed.drop);
    return Math.max(rapids * (1 - CASCADE_POOL_CALM * inCascadePool), bed.drop) * (1 - bed.pool);
}

// The water in a river's bed (core/RiverBed.js): RIVER_FILL of its smooth
// depth, the channel's bowl or the pool, so the surface sits just below the
// banks and meets the ground where the bed runs out; a cascade's steps are
// cut beneath it, so it lies flat in each pool and pours over each drop.
// Wading reads the depth (application/avatar/AvatarWaterConstraint.js): at
// most RIVER_FILL × POOL_DEPTH (0.56), well short of swimming.
export function riverWaterDepthAt(seed, x, z) {
    return riverBedAt(seed, x, z).waterDepth;
}

// The height of a river's surface at (x, z): the bed's floor plus the water
// in it. Where there is no bed, the ground itself.
export function riverSurfaceHeightAt(seed, x, z) {
    return surfaceHeightAt(seed, x, z);
}

// How much river water covers (x, z), 0 to 1: full over most of the
// channel, easing to nothing at the banks so the water's edge is soft.
const BANK_FADE = 0.35; // the outer share of the channel's half-width the edge fades across

export function riverWaterAt(seed, x, z) {
    const proximity = riverProximityAt(seed, x, z);
    if (proximity >= BANK_FADE) return 1;
    const t = proximity / BANK_FADE;
    return t * t * (3 - 2 * t);
}
