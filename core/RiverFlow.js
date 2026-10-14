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
// Purely visual, like the waves on lakes and the sea (core/WaterWaves.js):
// nothing walks, swims or floats on a river differently because of it.

import { terrainHeightAt } from './TerrainHeightField.js';
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

// The water's velocity at (x, z): { vx, vz } in world units a second.
// Meaningful where the river is (core/Hydrology.js#riverProximityAt() > 0).
export function riverFlowAt(seed, x, z) {
    const { dx, dz } = riverChannelTangentAt(seed, x, z);
    const behind = terrainHeightAt(seed, x - dx * FLOW_BASELINE, z - dz * FLOW_BASELINE);
    const ahead = terrainHeightAt(seed, x + dx * FLOW_BASELINE, z + dz * FLOW_BASELINE);
    const slope = (behind - ahead) / (2 * FLOW_BASELINE); // > 0: the ground falls along +tangent
    const speed = clampUnit(slope / FULL_SPEED_SLOPE) * MAX_RIVER_SPEED;
    return { vx: dx * speed, vz: dz * speed };
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
