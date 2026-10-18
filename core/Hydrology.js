// Deterministic HYDROLOGY classification for World View — see
// docs/Roadmap.md, 0.2.89, "World Water & Hydrology Foundation," and
// docs/Principles.md, "Hydrology Is A Fourth Pure Function Layered On
// Terrain, Sibling To Ecology, Never A New Ground Truth (0.2.89)."
// Answers a DIFFERENT question from its three siblings:
//
//   TerrainHeightField  = "How high is the terrain?"
//   TerrainSurface       = "What does the ground look like here?"
//   TerrainEcology        = "What kind of natural environment is this?"
//   Hydrology              = "Where does water actually collect and flow?"
//
// Every function in this file is PURE, taking exactly the same (seed, x,
// z) triple terrainHeightAt() already takes — no Math.random, no
// Date.now, no persisted state, no tile coordinate anywhere in this
// file. This is deliberately a SIBLING of core/TerrainEcology.js, not a
// dependent of it: both consult core/TerrainSurface.js directly and
// independently, so there is no import cycle and no ordering dependency
// between "what grows here" and "where does water flow" — see this
// file's own "Deliberately not yet" note at the bottom for why the two
// are not yet wired together beyond core/NaturalFeatureField.js's own
// river veto.
//
// core/TerrainSurface.js#SURFACE_CATEGORY.WATER already identifies every
// depression that reads as still water (a LAKE) — this file does not
// reclassify that ground, it names it. What this file actually ADDS is
// RIVER: a winding, bounded-width channel of flowing water threaded
// through lowland ground, deterministically generated the same way
// every other layer in this codebase is — a domain-warped noise band
// (never "put blue objects here"), gated so it only ever occupies flat,
// below-HIGHLAND ground and is biased (never hard-gated) toward locally
// lower cross-sections. See docs/Principles.md, "A River Is A Bounded,
// Local Channel Field, Never A Global Drainage Simulation (0.2.89)" for
// why this is a deliberate, honestly-scoped approximation rather than
// real flow-accumulation hydrology — true accumulation requires summing
// contributions from an UNBOUNDED upstream area, which cannot be
// answered as a local function of (seed, x, z) without either
// persisting a drainage network (forbidden, see
// core/TerrainHeightField.js's own header) or an unbounded per-query
// cost (unworkable for a per-vertex, per-frame streaming renderer).
//
// flowDirectionAt(seed, x, z) is the one piece of REAL local drainage
// physics this file provides: the steepest-descent direction at a
// point, exactly answering "which neighboring location does water flow
// toward" the way the 0.2.89 design conversation asked for it. It is
// intentionally NOT used to build rivers (a steepest-descent walk from
// every point would be an unbounded trace, the same cost problem
// accumulation has) — it exists as its own honest, bounded, local
// primitive for tests and future work to build on.

import { terrainHeightAt, baseTerrainHeightAt, seaBasinAt, riverPoolReachAt } from './TerrainHeightField.js';
import { REACH as RIVER_BED_REACH } from './RiverBed.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL, HIGHLAND_ELEVATION, SURFACE_PALETTE } from './TerrainSurface.js';
import { ecologyGroundColorAt } from './TerrainEcology.js';
import { lerp } from '../utils/interpolation.js';
import {
    riverChannelDistanceAt, riverChannelTangentAt, RIVER_CHANNEL_THRESHOLD, CHANNEL_AXIS_X, CHANNEL_AXIS_Z, CHANNEL_AXIS_LENGTH
} from './RiverChannel.js';

// The channel field lives in core/RiverChannel.js (so the terrain can carve
// river beds without importing this file); re-exported for every caller
// that has always read it from here.
export { riverChannelDistanceAt, riverChannelTangentAt, RIVER_CHANNEL_THRESHOLD };

export const HYDROLOGY_FEATURE = Object.freeze({
    NONE: 'NONE',   // dry ground — no sea, no lake, no river
    SEA: 'SEA',     // SURFACE_CATEGORY.WATER inside a sea basin (see seaBasinAt())
    LAKE: 'LAKE',   // every other SURFACE_CATEGORY.WATER — a still-water depression
    RIVER: 'RIVER'  // a flowing channel threaded through lowland ground
});

// Water counts as sea once the ground under it lies at least this far
// into a sea basin — past the shallow edge of the shelf, so a pond that
// merely happens to sit near a coast still reads as a lake.
export const SEA_BASIN_MIN = 0.25;

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------
// flowDirectionAt — real, local, steepest-descent drainage direction.
// ---------------------------------------------------------------------

// Same sample distance core/TerrainSurface.js#slopeAt() uses — a
// consistent "one world unit" measuring stick for local terrain
// geometry across every file that samples a gradient.
const FLOW_SAMPLE_DISTANCE = 1;

// Below this gradient magnitude, ground reads as flat enough that
// "downhill" has no meaningful answer — reported as the zero vector
// rather than an arbitrary direction that would flicker with noise.
const FLOW_FLAT_EPSILON = 1e-6;

// The one public entry point for "which neighboring location does water
// flow toward" — a normalized {dx, dz} pointing in the steepest-descent
// direction at (x, z), or {dx: 0, dz: 0} on ground flat enough that no
// direction is meaningfully downhill. Deliberately LOCAL: this is one
// gradient sample, never a traced path and never an accumulated
// upstream area — see this file's own header for why.
export function flowDirectionAt(seed, x, z) {
    const height = terrainHeightAt(seed, x, z);
    const dHeightDx = terrainHeightAt(seed, x + FLOW_SAMPLE_DISTANCE, z) - height;
    const dHeightDz = terrainHeightAt(seed, x, z + FLOW_SAMPLE_DISTANCE) - height;

    // Downhill is the NEGATIVE gradient direction.
    const gx = -dHeightDx;
    const gz = -dHeightDz;
    const magnitude = Math.hypot(gx, gz);
    if (magnitude < FLOW_FLAT_EPSILON) return { dx: 0, dz: 0 };
    return { dx: gx / magnitude, dz: gz / magnitude };
}

// ---------------------------------------------------------------------
// Valley bias — a CONTINUOUS intensity multiplier, never a hard gate,
// so a river tinting toward a locally-flatter or slightly-rising
// cross-section fades smoothly rather than snapping on/off (which would
// reintroduce exactly the "visible seam" class of bug
// core/TerrainSurface.js's own header warns against).
// ---------------------------------------------------------------------

// Perpendicular to the channel axis — the direction a short "is this
// point in a dip?" cross-section probe samples along.
const CROSS_AXIS_X = -CHANNEL_AXIS_Z / CHANNEL_AXIS_LENGTH;
const CROSS_AXIS_Z = CHANNEL_AXIS_X / CHANNEL_AXIS_LENGTH;
const VALLEY_SAMPLE_DISTANCE = 2.5;

// A river cross-section that sits this much LOWER than the average of
// its two flanking probes gets full valley credit; shallower dips (or a
// point on a gentle rise) still get partial credit — real generated
// terrain here is gentle (core/TerrainHeightField.js's own "reads as
// geography, never spiky noise"), so an exact local minimum at the
// precise channel line is the exception, not the rule.
const VALLEY_SOFT_RANGE = 0.6;

// Never fully zero — this is a BIAS toward valley-shaped ground, not a
// second independent gate on top of the channel/elevation/surface ones
// below. A river crossing a gentle local rise within its qualifying
// lowland band still reads as a (fainter) river, exactly the
// "procedural geography, not hydraulic simulation" restraint
// docs/Roadmap.md, 0.2.89 asks for.
const VALLEY_MIN_FACTOR = 0.35;

function valleyFactorAt(seed, x, z, height) {
    const heightA = baseTerrainHeightAt(
        seed, x + CROSS_AXIS_X * VALLEY_SAMPLE_DISTANCE, z + CROSS_AXIS_Z * VALLEY_SAMPLE_DISTANCE
    );
    const heightB = baseTerrainHeightAt(
        seed, x - CROSS_AXIS_X * VALLEY_SAMPLE_DISTANCE, z - CROSS_AXIS_Z * VALLEY_SAMPLE_DISTANCE
    );
    const depth = (heightA + heightB) / 2 - height;
    return lerp(VALLEY_MIN_FACTOR, 1, clamp01(depth / VALLEY_SOFT_RANGE));
}

// The one public river PREDICATE — true within the channel band on any
// ground but standing water, strictly below HIGHLAND_ELEVATION (the same
// lowland/midland band core/TerrainEcology.js's own FOREST/FIELD/GRASSLAND
// zones already occupy), and in the round pool a channel ends in where it
// meets highland (core/RiverBed.js). A river runs over soil and rock as
// readily as grass: steep ground is where it breaks white and cascades
// (core/RiverFlow.js, core/RiverBed.js), and a channel that vanished for
// every steeper stretch read as a broken river. Deliberately does NOT
// consult valleyFactorAt() — that stays a continuous TINT INTENSITY
// input (see hydrologyGroundColorAt() below), never a second hard gate a
// boolean predicate would have to snap across.
export function isRiverAt(seed, x, z) {
    return riverProximityAt(seed, x, z) > 0;
}

// How far into a river (x, z) lies: 1 on the channel's centreline (or at
// the centre of the pool it ends in), falling to 0 at its banks, and 0
// off a river. The ground tint
// below and the river's water (core/RiverFlow.js) both fade by it.
export function riverProximityAt(seed, x, z) {
    // The channel first: by far the cheapest test, and false almost
    // everywhere.
    const distance = riverChannelDistanceAt(seed, x, z);
    if (distance >= RIVER_CHANNEL_THRESHOLD * RIVER_BED_REACH) return 0;
    const height = baseTerrainHeightAt(seed, x, z);
    if (height <= WATER_LEVEL) return 0;
    const channel = distance < RIVER_CHANNEL_THRESHOLD && height < HIGHLAND_ELEVATION
        ? 1 - distance / RIVER_CHANNEL_THRESHOLD
        : 0;
    return Math.max(channel, riverPoolReachAt(seed, x, z));
}

// The one public classification entry point — mirrors
// core/TerrainEcology.js#ecologyZoneAt()'s own "fixed evaluation order"
// discipline: standing water (SEA, else LAKE) always wins over RIVER,
// so a coordinate is never ambiguous between them.
export function hydrologyFeatureAt(seed, x, z) {
    if (surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER) {
        return seaBasinAt(seed, x, z) >= SEA_BASIN_MIN ? HYDROLOGY_FEATURE.SEA : HYDROLOGY_FEATURE.LAKE;
    }
    if (isRiverAt(seed, x, z)) return HYDROLOGY_FEATURE.RIVER;
    return HYDROLOGY_FEATURE.NONE;
}

// A soft, slightly more saturated blue than SURFACE_PALETTE.WATER's own
// still-lake tone — flowing water reading as visually distinct from
// still water without breaking core/TerrainSurface.js's own "soft,
// low-saturation... buildings and avatars remain the visual focus"
// restraint (see that file's header).
const RIVER_TINT = Object.freeze({ r: 0.42, g: 0.58, b: 0.72 });

// The river's own water (renderer/RiverTileMesh.js), laid over that tint:
// a touch deeper and greener, as running water over a shallow bed.
export const RIVER_SURFACE_COLOR = Object.freeze({ r: 0.40, g: 0.58, b: 0.72 });

// The one public ground-color entry point for this milestone —
// hydrologyGroundColorAt(seed, x, z) starts from
// core/TerrainEcology.js#ecologyGroundColorAt() (completely unchanged,
// still the single source of truth for WATER/SOIL/ROCK/GRASS/BEACH/
// FIELD coloring) and blends a river tint on top, exactly the way
// ecologyGroundColorAt() itself layers BEACH/FIELD tints onto
// surfaceColorAt() — never a second, competing color system. LAKE
// ground (already SURFACE_CATEGORY.WATER) and every zone no river
// passes through both pass through with ecologyGroundColorAt()'s own
// color completely untouched; renderer/WaterTileMesh.js is what gives
// LAKE ground its actual flat water-plane geometry, a separate concern
// from ground COLOR (see that file's own header).
export function hydrologyGroundColorAt(seed, x, z) {
    return withRiverTint(ecologyGroundColorAt(seed, x, z), riverTintAt(seed, x, z));
}

// How strongly the river tint lies on the ground at (x, z), 0 to 1: the
// half of hydrologyGroundColorAt() that is the river's own. Exported so a
// renderer drawing ground finer than its ecology colour needs to be
// sampled (renderer/TerrainTileMesh.js's river tiles) can sample the tint
// alone at every vertex.
export function riverTintAt(seed, x, z) {
    const proximity = riverProximityAt(seed, x, z);
    if (proximity === 0) return 0;
    return proximity * valleyFactorAt(seed, x, z, baseTerrainHeightAt(seed, x, z));
}

// `base` with the river tint laid over it at `intensity` (riverTintAt()).
export function withRiverTint(base, intensity) {
    if (intensity === 0) return base;
    return {
        r: lerp(base.r, RIVER_TINT.r, intensity),
        g: lerp(base.g, RIVER_TINT.g, intensity),
        b: lerp(base.b, RIVER_TINT.b, intensity)
    };
}

// Re-exported so renderer/WaterTileMesh.js never has to import
// core/TerrainSurface.js itself just to reach the still-water tone and
// its own WATER_LEVEL — one water-focused entry point for the renderer
// layer, the same "renderer never calculates hydrology" posture this
// file's own header names as the goal.
export const LAKE_SURFACE_HEIGHT = WATER_LEVEL;
export const LAKE_SURFACE_COLOR = SURFACE_PALETTE[SURFACE_CATEGORY.WATER];

// The sea shares the lake's water line (one WATER_LEVEL for all still
// water, so a coast never steps) but reads a deeper, still soft blue.
export const SEA_SURFACE_COLOR = Object.freeze({ r: 0.40, g: 0.55, b: 0.68 });

// How much the standing water at (x, z) is sea rather than lake: 0 inland,
// 1 past the shallow edge of the shelf, easing in between. The surface's
// colour (below) and its waves (core/WaterWaves.js) both follow it, so
// neither shows a seam at a coast.
export function seaShareAt(seed, x, z) {
    return clamp01(seaBasinAt(seed, x, z) / SEA_BASIN_MIN);
}

// Where the standing water at (x, z) is a lake rather than the sea: inland
// of the middle of the shelf. Lakes freeze in the depth of winter
// (core/Season.js#lakeIceAt()); the sea never does.
export const LAKE_SEA_SHARE = 0.5;

export function isLakeAt(seed, x, z) {
    return surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER && seaShareAt(seed, x, z) < LAKE_SEA_SHARE;
}

// Surface color of standing water at (x, z): the lake tone inland,
// easing to SEA_SURFACE_COLOR across the shelf so a coast never shows a
// hard color seam. Meaningful only where SURFACE_CATEGORY.WATER holds.
export function waterSurfaceColorAt(seed, x, z) {
    const t = seaShareAt(seed, x, z);
    return {
        r: lerp(LAKE_SURFACE_COLOR.r, SEA_SURFACE_COLOR.r, t),
        g: lerp(LAKE_SURFACE_COLOR.g, SEA_SURFACE_COLOR.g, t),
        b: lerp(LAKE_SURFACE_COLOR.b, SEA_SURFACE_COLOR.b, t)
    };
}

// Deliberately not yet: real flow-ACCUMULATION hydrology (how much
// upstream area drains through a point) — see this file's own header
// for why that cannot be a bounded local function of (seed, x, z) at
// all, not merely "not implemented yet"; guaranteed river-to-lake
// connectivity (today's channel bands and lake depressions are two
// independently-generated fields that often coincide but are never
// forced to); rainfall simulation, fluid particles, real-time water
// physics, tides, waves, erosion, or seasonal flooding (see docs/Roadmap.md, 0.2.89's
// own non-goals); swimming or any avatar movement state tied to water
// (core/TerrainWalkability.js and application/avatar/AvatarTerrainConstraint.js
// stay exactly the slope-only decision 0.2.77 established — no
// HYDROLOGY_FEATURE is "this ground is unwalkable" or "this ground
// requires swimming"); water blocking or otherwise constraining
// construction/placement; a per-World/per-Document hydrology (today's
// thresholds are the one shared hydrology every document's terrain
// uses, the same posture DEFAULT_WORLD_SEED, SURFACE_PALETTE, and
// core/TerrainEcology.js's own thresholds already established); and
// wiring core/TerrainEcology.js's own ecologyZoneAt()/moistureAt() to
// consult this file (that "ecology reacts to real nearby water" richness
// is a plausible FUTURE milestone, not this one — see this file's own
// header for why Hydrology stays Ecology's sibling, not its dependent,
// for now). See docs/Roadmap.md, 0.2.89, for the full list.
