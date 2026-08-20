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

import { terrainHeightAt } from './TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL, HIGHLAND_ELEVATION, SURFACE_PALETTE } from './TerrainSurface.js';
import { ecologyGroundColorAt } from './TerrainEcology.js';

export const HYDROLOGY_FEATURE = Object.freeze({
    NONE: 'NONE',   // dry ground — no lake, no river
    LAKE: 'LAKE',   // mirrors SURFACE_CATEGORY.WATER exactly — a still-water depression
    RIVER: 'RIVER'  // a flowing channel threaded through lowland ground
});

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

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
// River channel field — a bounded, local, domain-warped noise band.
// ---------------------------------------------------------------------

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
const CHANNEL_AXIS_X = 1;
const CHANNEL_AXIS_Z = 0.35;
const CHANNEL_AXIS_LENGTH = Math.hypot(CHANNEL_AXIS_X, CHANNEL_AXIS_Z);

// The channel field's own phase gradient magnitude along its axis —
// derived, not tuned by hand, so RIVER_CHANNEL_THRESHOLD (below) can be
// expressed as an actual world-space half-width instead of an opaque
// sine-space number that would silently drift out of proportion if
// RIVER_FREQUENCY or the axis ever changed.
const CHANNEL_PHASE_GRADIENT = RIVER_FREQUENCY * Math.PI * 2 * CHANNEL_AXIS_LENGTH;

// A signed value in [-1, 1] whose zero-crossings trace winding channel
// centerlines across the world — a warped sine band, the standard
// "fake a river without simulating one" technique: cheap, O(1), and by
// construction continuous in world coordinates (never tile coordinates),
// so two tiles sharing an edge always agree on it exactly.
function channelFieldAt(seed, x, z) {
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
const RIVER_HALF_WIDTH = 3;
const RIVER_CHANNEL_THRESHOLD = RIVER_HALF_WIDTH * CHANNEL_PHASE_GRADIENT;

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
    const heightA = terrainHeightAt(
        seed, x + CROSS_AXIS_X * VALLEY_SAMPLE_DISTANCE, z + CROSS_AXIS_Z * VALLEY_SAMPLE_DISTANCE
    );
    const heightB = terrainHeightAt(
        seed, x - CROSS_AXIS_X * VALLEY_SAMPLE_DISTANCE, z - CROSS_AXIS_Z * VALLEY_SAMPLE_DISTANCE
    );
    const depth = (heightA + heightB) / 2 - height;
    return lerp(VALLEY_MIN_FACTOR, 1, clamp01(depth / VALLEY_SOFT_RANGE));
}

// The one public river PREDICATE — true only within the channel band,
// on flat-enough ground (GRASS surface, same restriction every flat
// ecology zone already imposes), and strictly below HIGHLAND_ELEVATION
// (the same lowland/midland band core/TerrainEcology.js's own
// FOREST/FIELD/GRASSLAND zones already occupy — rivers thread through
// exactly the ground those zones exist on, never across ROCK or
// HIGHLAND). Deliberately does NOT consult valleyFactorAt() — that
// stays a continuous TINT INTENSITY input (see hydrologyGroundColorAt()
// below), never a second hard gate a boolean predicate would have to
// snap across.
export function isRiverAt(seed, x, z) {
    if (surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.GRASS) return false;

    const height = terrainHeightAt(seed, x, z);
    if (height >= HIGHLAND_ELEVATION) return false;

    return riverChannelDistanceAt(seed, x, z) < RIVER_CHANNEL_THRESHOLD;
}

// The one public classification entry point — mirrors
// core/TerrainEcology.js#ecologyZoneAt()'s own "fixed evaluation order"
// discipline: LAKE (an existing WATER depression) always wins over
// RIVER, so a coordinate is never ambiguous between the two.
export function hydrologyFeatureAt(seed, x, z) {
    if (surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER) return HYDROLOGY_FEATURE.LAKE;
    if (isRiverAt(seed, x, z)) return HYDROLOGY_FEATURE.RIVER;
    return HYDROLOGY_FEATURE.NONE;
}

// A soft, slightly more saturated blue than SURFACE_PALETTE.WATER's own
// still-lake tone — flowing water reading as visually distinct from
// still water without breaking core/TerrainSurface.js's own "soft,
// low-saturation... buildings and avatars remain the visual focus"
// restraint (see that file's header).
const RIVER_TINT = Object.freeze({ r: 0.42, g: 0.58, b: 0.72 });

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
    const base = ecologyGroundColorAt(seed, x, z);
    if (!isRiverAt(seed, x, z)) return base;

    const distance = riverChannelDistanceAt(seed, x, z);
    const proximity = 1 - clamp01(distance / RIVER_CHANNEL_THRESHOLD); // 1 at centerline, 0 at the channel's own edge
    const height = terrainHeightAt(seed, x, z);
    const intensity = proximity * valleyFactorAt(seed, x, z, height);

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

// Deliberately not yet: real flow-ACCUMULATION hydrology (how much
// upstream area drains through a point) — see this file's own header
// for why that cannot be a bounded local function of (seed, x, z) at
// all, not merely "not implemented yet"; guaranteed river-to-lake
// connectivity (today's channel bands and lake depressions are two
// independently-generated fields that often coincide but are never
// forced to); rainfall simulation, fluid particles, real-time water
// physics, erosion, or seasonal flooding (see docs/Roadmap.md, 0.2.89's
// own non-goals); swimming or any avatar movement state tied to water
// (core/TerrainWalkability.js and application/AvatarTerrainConstraint.js
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
