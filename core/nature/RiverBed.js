// A river's bed: the shape a river cuts into the ground along its channel
// (core/nature/RiverChannel.js), as a pure function of (seed, x, z) and the lie of
// the land. core/nature/TerrainHeightField.js subtracts it from the land
// (terrainHeightAt()); core/nature/Hydrology.js reads where it is; core/nature/RiverFlow.js
// fills it with water. This module imports neither: the land is handed in
// (`land`: the base height function and the thresholds it is classified
// by), so the height field can use it without a cycle.
//
// Three shapes, each easing to nothing at its edges, so the ground has no
// seam anywhere:
//
//   CHANNEL   a shallow bowl along the channel, BED_DEPTH deep on the
//             centreline, (1 - u²)² across (u the distance from the
//             centreline as a share of the half-width). It runs over grass,
//             soil and rock alike; it fades out towards the water line (so
//             its floor never reads as a lake) and in the last stretch below
//             highland, where a river stops.
//
//   CASCADE   where the channel falls steeply (more than CASCADE_FROM, fully
//             by CASCADE_FULL, over FALL_BASELINE either side: the steepest
//             twentieth of this world's rivers), the bed is cut into a
//             staircase: flat pools, each ending in a drop of STEP_HEIGHT,
//             as short as it can be while no steeper than MAX_DROP_SLOPE,
//             so it reads as a small fall and is still walkable. The steps follow the land's own contours, every
//             STEP_HEIGHT of height, so they need no stored positions; they
//             are only ever cut downward. This world has no cliffs, so a
//             river makes its own little falls rather than one tall one.
//
//   POOL      where a channel meets highland it ends in a round pool,
//             POOL_RADIUS across its centre, centred where the centreline
//             crosses HIGHLAND_ELEVATION. Whether it is a spring or a still
//             pond is the current's business (core/nature/RiverFlow.js); here it is
//             only a bowl POOL_DEPTH deep.
//
// The water fills the channel and the pool (waterDepth); the cascade's
// steps are cut beneath it, so in a pool the water lies flat and at a drop
// it pours over.

import {
    channelFieldAt, riverChannelTangentAt, RIVER_CHANNEL_THRESHOLD, CHANNEL_PHASE_GRADIENT
} from './RiverChannel.js';
import { smoothstep } from '../../utils/interpolation.js';

export const BED_DEPTH = 0.6;
const BED_WATER_CLEARANCE = 0.15; // the floor never comes within about this of the water line
const BED_HIGHLAND_FADE = 1;      // over the last unit of height below highland

export const CASCADE_FROM = 0.045;
export const CASCADE_FULL = 0.055;
export const STEP_HEIGHT = 0.4;
// Each drop is as short as it can be, so it reads as a fall, but never
// steeper than MAX_DROP_SLOPE, well inside what an avatar walks
// (core/nature/TerrainWalkability.js), and never less than MIN_DROP_SHARE of a step.
const MIN_DROP_SHARE = 0.12;
const MAX_DROP_SLOPE = 0.4;
export const CASCADE_SHALLOWING = 0.45;
export const FALL_BASELINE = 15;

export const POOL_RADIUS = 5;
export const POOL_DEPTH = 0.7;
const POOL_MIN_SLOPE = 0.01; // flatter than this, distances up the slope are not measured

// The water fills a bed this share of its smooth depth (the channel's bowl
// and the pool), up to just below the banks.
export const RIVER_FILL = 0.8;

// Everything the bed is, at a point: how deep it cuts (`depth`), how deep the
// water in it stands (`waterDepth`), how much of the point is spring pool
// (`pool`, 1 at its centre), how much the channel cascades there (`cascade`)
// and how much of that is a drop rather than a pool (`drop`).
const NONE = Object.freeze({ depth: 0, waterDepth: 0, pool: 0, cascade: 0, drop: 0 });

// Half-widths beyond the centreline worth looking at: the pool reaches
// POOL_RADIUS, wider than the channel.
export const REACH = Math.max(1, POOL_RADIUS / (RIVER_CHANNEL_THRESHOLD / CHANNEL_PHASE_GRADIENT));
// A pool lies within POOL_RADIUS of the highland edge, so never more than
// this far below it on any slope a channel runs (at most about 0.2).
const POOL_SEARCH_BELOW = POOL_RADIUS * 0.2;

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// How steeply the land falls along the channel at (x, z): rise over run
// across FALL_BASELINE either side, > 0 where it falls along `tangent`.
export function channelFallAt(seed, x, z, land, tangent = riverChannelTangentAt(seed, x, z)) {
    const behind = land.baseAt(seed, x - tangent.dx * FALL_BASELINE, z - tangent.dz * FALL_BASELINE);
    const ahead = land.baseAt(seed, x + tangent.dx * FALL_BASELINE, z + tangent.dz * FALL_BASELINE);
    return (behind - ahead) / (2 * FALL_BASELINE);
}

// The lie of the land's gradient at (x, z), uphill: { gx, gz } per unit.
export function landGradientAt(seed, x, z, land, base = land.baseAt(seed, x, z)) {
    return {
        gx: land.baseAt(seed, x + 1, z) - base,
        gz: land.baseAt(seed, x, z + 1) - base
    };
}

// Where (x, z) lies relative to the pool a channel ends in at the highland
// edge: `across` (signed, world units from the centreline), `up` (signed,
// world units ALONG the channel past where its centreline crosses into
// highland), the unit direction up the channel into the highland
// (`dirX`, `dirZ`), the land's own gradient (`gx`, `gz`), and the pool's
// share there (1 at its centre, 0 at its rim and beyond). Measured to first
// order: good within a pool's width.
//
// Only where the channel heads INTO the highland: a channel running along
// the highland edge crosses it at a glance, again and again, and a pool at
// each glance smeared into one long strip beside the edge. So the pool
// fades in with how squarely the channel meets the slope (CROSSING_FROM to
// CROSSING_FULL, the cosine between the channel and straight uphill), and
// its distance past the edge is measured along the channel, so it is round
// about the river, not drawn out along the contour.
export const CROSSING_FROM = 0.35;
export const CROSSING_FULL = 0.6;
// The slope a pool is laid out by is read across POOL_GRADIENT_SPAN either
// way: the land's finest bumps (a few units across) would otherwise swing
// its direction from one step to the next, and a channel grazing the edge
// would flicker in and out of having a pool.
const POOL_GRADIENT_SPAN = 4;

function poolGradientAt(seed, x, z, land) {
    const d = POOL_GRADIENT_SPAN;
    return {
        gx: (land.baseAt(seed, x + d, z) - land.baseAt(seed, x - d, z)) / (2 * d),
        gz: (land.baseAt(seed, x, z + d) - land.baseAt(seed, x, z - d)) / (2 * d)
    };
}

export function poolAt(seed, x, z, land, base = land.baseAt(seed, x, z)) {
    const field = channelFieldAt(seed, x, z);
    const across = field / CHANNEL_PHASE_GRADIENT;
    if (Math.abs(across) >= POOL_RADIUS) return null;
    const { gx, gz } = poolGradientAt(seed, x, z, land);
    const slope = Math.hypot(gx, gz);
    if (slope < POOL_MIN_SLOPE) return null;
    const tangent = riverChannelTangentAt(seed, x, z);
    const climb = tangent.dx * gx + tangent.dz * gz; // rise per unit along the tangent
    const crossing = smoothstep(clamp01((Math.abs(climb) / slope - CROSSING_FROM) / (CROSSING_FULL - CROSSING_FROM)));
    if (crossing === 0) return null;
    const up = (base - land.highland) / Math.abs(climb);
    if (Math.abs(up) >= POOL_RADIUS) return null;
    const r = Math.hypot(across, up) / POOL_RADIUS;
    const share = r >= 1 ? 0 : (1 - r * r) * (1 - r * r) * crossing;
    const sign = climb > 0 ? 1 : -1;
    return { across, up, r, share, crossing, dirX: tangent.dx * sign, dirZ: tangent.dz * sign, gx, gz };
}

// How far towards a pool's centre (x, z) lies: 1 at its centre, 0 at its
// rim and beyond. Cheap where no pool can be.
export function poolReachAt(seed, x, z, land, base = land.baseAt(seed, x, z)) {
    if (base <= land.highland - POOL_SEARCH_BELOW) return 0;
    const at = poolAt(seed, x, z, land, base);
    return at && at.r < 1 ? (1 - at.r) * at.crossing : 0;
}

export function riverBedAt(seed, x, z, land, base = land.baseAt(seed, x, z)) {
    const field = channelFieldAt(seed, x, z);
    const distance = Math.abs(field);
    if (distance >= RIVER_CHANNEL_THRESHOLD * REACH) return NONE;
    if (base <= land.waterLevel + BED_WATER_CLEARANCE) return NONE;

    // The channel's bowl, and its cascade.
    let channel = 0;
    let stepCut = 0;
    let cascade = 0;
    let drop = 0;
    if (distance < RIVER_CHANNEL_THRESHOLD && base < land.highland) {
        const u = distance / RIVER_CHANNEL_THRESHOLD;
        const bowl = (1 - u * u) * (1 - u * u);
        const nearWater = smoothstep(clamp01((base - land.waterLevel - BED_WATER_CLEARANCE) / BED_DEPTH));
        const belowHighland = 1 - smoothstep(clamp01((base - (land.highland - BED_HIGHLAND_FADE)) / BED_HIGHLAND_FADE));
        const fade = bowl * nearWater * belowHighland;
        cascade = smoothstep(clamp01((Math.abs(channelFallAt(seed, x, z, land)) - CASCADE_FROM) / (CASCADE_FULL - CASCADE_FROM)));
        // Over a cascade the steps give the bed its depth, so its bowl is
        // shallower (the water runs shallow over falls, as it does), and the
        // two together cut no deeper than a calm river's bed does.
        channel = BED_DEPTH * (1 - CASCADE_SHALLOWING * cascade) * fade;
        if (cascade > 0) {
            // t runs 1 → 0 down each step of height: the drop is its top
            // `share`, the pool the rest. The steeper the land here, the
            // more of the step the drop takes, so it is never steeper than
            // MAX_DROP_SLOPE (a smoothstep is 1.5 times its mean slope).
            const { gx, gz } = landGradientAt(seed, x, z, land, base);
            const share = Math.min(0.5, Math.max(MIN_DROP_SHARE, 1.5 * Math.hypot(gx, gz) / MAX_DROP_SLOPE));
            const level = base / STEP_HEIGHT;
            const t = level - Math.floor(level);
            const stair = smoothstep(clamp01((t - (1 - share)) / share));
            // Cubed towards the banks, so the steps deepen the middle of
            // the channel without steepening its sides.
            stepCut = STEP_HEIGHT * Math.max(0, t - stair) * cascade * fade * fade * fade;
            const lip = smoothstep(clamp01((t - (1 - share - 0.15)) / 0.2)) * (1 - smoothstep(clamp01((t - 0.95) / 0.05)));
            drop = cascade * lip * fade;
        }
    }

    // The pool at the highland edge.
    let pool = 0;
    if (base > land.highland - POOL_SEARCH_BELOW) {
        const at = poolAt(seed, x, z, land, base);
        if (at) pool = at.share;
    }
    const poolCut = POOL_DEPTH * pool;

    const smooth = Math.max(channel, poolCut);
    if (smooth === 0 && stepCut === 0) return NONE;
    return {
        depth: smooth + stepCut,
        waterDepth: smooth * RIVER_FILL,
        pool,
        cascade,
        drop
    };
}
