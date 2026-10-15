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

import { baseTerrainHeightAt, riverBedDepthAt } from './TerrainHeightField.js';
import { riverChannelTangentAt, riverProximityAt } from './Hydrology.js';

// World units a second, at full speed: a brisk stream, about a walking pace.
export const MAX_RIVER_SPEED = 1.2;

// The fall (rise over run) at which a river runs at full speed. Measured on
// this world's rivers: about half the river length is at least this steep,
// a tenth under a quarter of it.
export const FULL_SPEED_SLOPE = 0.01;

// How far up- and downstream the ground is compared, in world units: long
// enough to read the lie of the land, not every bump in it.
export const FLOW_BASELINE = 15;

function clampUnit(v) {
    return v < -1 ? -1 : v > 1 ? 1 : v;
}

// The fall of the land along the channel at (x, z), over FLOW_BASELINE
// either side: > 0 where it falls along `tangent`. Read from the lie of
// the land (core/TerrainHeightField.js#baseTerrainHeightAt()), not the
// carved bed, whose own depth would add bumps of its own.
function channelFallAt(seed, x, z, tangent) {
    const behind = baseTerrainHeightAt(seed, x - tangent.dx * FLOW_BASELINE, z - tangent.dz * FLOW_BASELINE);
    const ahead = baseTerrainHeightAt(seed, x + tangent.dx * FLOW_BASELINE, z + tangent.dz * FLOW_BASELINE);
    return (behind - ahead) / (2 * FLOW_BASELINE);
}

// The water's velocity at (x, z): { vx, vz } in world units a second.
// Meaningful where the river is (core/Hydrology.js#riverProximityAt() > 0).
export function riverFlowAt(seed, x, z) {
    const tangent = riverChannelTangentAt(seed, x, z);
    const speed = clampUnit(channelFallAt(seed, x, z, tangent) / FULL_SPEED_SLOPE) * MAX_RIVER_SPEED;
    return { vx: tangent.dx * speed, vz: tangent.dz * speed };
}

// Rapids: where the river runs down ground well past FULL_SPEED_SLOPE it
// breaks white. 0 on gentle water, rising to 1 by RAPIDS_FULL_SLOPE; the
// renderer foams the surface by it (renderer/RiverFlowMaterial.js).
// Measured on this world's rivers: about a tenth of their length falls
// faster than RAPIDS_FROM_SLOPE.
export const RAPIDS_FROM_SLOPE = 0.035;
export const RAPIDS_FULL_SLOPE = 0.05;

export function riverRapidsAt(seed, x, z) {
    const fall = Math.abs(channelFallAt(seed, x, z, riverChannelTangentAt(seed, x, z)));
    const t = Math.min(1, Math.max(0, (fall - RAPIDS_FROM_SLOPE) / (RAPIDS_FULL_SLOPE - RAPIDS_FROM_SLOPE)));
    return t * t * (3 - 2 * t);
}

// The water in a river's bed. The bed (core/TerrainHeightField.js#
// riverBedDepthAt()) is filled RIVER_FILL of the way up, so the surface
// sits just below the banks and meets the ground where the bed runs out.
// Wading reads the depth (application/avatar/AvatarWaterConstraint.js):
// at most RIVER_FILL × RIVER_BED_DEPTH (0.48), well short of swimming.
export const RIVER_FILL = 0.8;

export function riverWaterDepthAt(seed, x, z) {
    return riverBedDepthAt(seed, x, z) * RIVER_FILL;
}

// The height of a river's surface at (x, z): the bed's floor plus the water
// in it. Where there is no bed, the ground itself.
export function riverSurfaceHeightAt(seed, x, z) {
    const base = baseTerrainHeightAt(seed, x, z);
    return base - riverBedDepthAt(seed, x, z) * (1 - RIVER_FILL);
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
