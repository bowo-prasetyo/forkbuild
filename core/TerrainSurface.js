// Deterministic terrain SURFACE classification and color for World View —
// see docs/Roadmap.md, 0.2.79, "Terrain Surface & Natural Color," and
// docs/Principles.md, "Terrain Surface Is A Second Pure Function Layered
// On Elevation, Never A New Ground Truth." Answers a DIFFERENT question
// from core/TerrainHeightField.js:
//
//   TerrainHeightField  = "How high is the terrain?"
//   TerrainSurface       = "What kind of surface is here?"
//   TerrainTileMesh       = "How do I render it?"
//
// surfaceCategoryAt(seed, x, z) and surfaceColorAt(seed, x, z) are PURE
// functions of exactly the same (seed, x, z) triple terrainHeightAt()
// already takes — no Math.random, no Date.now, no persisted state, no
// tile coordinate anywhere in this file. That last point matters more
// than it looks: a function of (tileX, tileZ) would let two adjacent
// streamed-in tiles disagree at their shared edge and expose the
// underlying tile grid as a visible checkerboard the moment
// renderer/TerrainStreamingController.js loads/unloads one of them.
// A function of continuous WORLD coordinates instead guarantees the
// exact vertex shared by two neighboring tiles gets the exact same
// color from both, independent of streaming — the identical continuity
// guarantee core/TerrainHeightField.js already gives elevation, now
// extended to color.
//
// Deliberately restrained: four broad VISUAL categories derived from
// elevation and slope alone, never a vegetation/hydrology/geology
// simulation. See this file's own "Deliberately not yet" note at the
// bottom.

import { terrainHeightAt, TERRAIN_HEIGHT_BOUND } from './TerrainHeightField.js';

export const SURFACE_CATEGORY = Object.freeze({
    WATER: 'WATER',   // low depression — looks like a lake, is not one (no water simulation)
    SOIL: 'SOIL',     // moderately steep exposed ground
    ROCK: 'ROCK',     // very steep or very high exposed ground
    GRASS: 'GRASS'    // flat / moderate elevation — the common case
});

// The one place a designer (or a future milestone) changes what terrain
// LOOKS like without touching TerrainHeightField, TerrainTileMesh, or
// TerrainWalkability at all. Deliberately soft, low-saturation, mid-
// value tones — see docs/Roadmap.md, 0.2.79: terrain is background,
// buildings and avatars are the visual focus, so nothing here is as
// saturated as a typical "game grass" green or "game water" blue.
// Channels are 0-1 floats (THREE.Color's own native range), not 0-255
// bytes or hex ints, so renderer/TerrainTileMesh.js never has to convert.
export const SURFACE_PALETTE = Object.freeze({
    [SURFACE_CATEGORY.WATER]: Object.freeze({ r: 0.55, g: 0.67, b: 0.76 }),  // soft blue
    [SURFACE_CATEGORY.SOIL]: Object.freeze({ r: 0.62, g: 0.53, b: 0.42 }),   // muted warm brown
    [SURFACE_CATEGORY.ROCK]: Object.freeze({ r: 0.67, g: 0.66, b: 0.63 }),   // light neutral gray
    [SURFACE_CATEGORY.GRASS]: Object.freeze({ r: 0.58, g: 0.67, b: 0.51 })   // soft pale green
});

// Higher terrain gets a lighter, slightly different vegetation tone —
// see docs/Roadmap.md, 0.2.79: "higher terrain -> lighter/different
// vegetation tone." Deliberately NOT a new category (a whole extra
// SURFACE_CATEGORY for one gradient would be over-modeling a color
// nuance as if it were a distinct kind of ground) — just the far end of
// a continuous blend applied only within GRASS.
const GRASS_HIGHLAND = Object.freeze({ r: 0.67, g: 0.75, b: 0.58 });

// Thresholds are fractions of TERRAIN_HEIGHT_BOUND, never a hardcoded
// absolute elevation — if core/TerrainHeightField.js's OCTAVES amplitude
// ever changes, these scale with it automatically instead of silently
// drifting out of the field's actual range.
// Exported (0.2.88) so core/TerrainEcology.js can classify BEACH/HIGHLAND
// zones against the EXACT same water level and highland elevation this
// file already uses for WATER/GRASS-highland-tint — one shared threshold,
// never two independently-tuned copies that could silently drift apart.
export const WATER_LEVEL = -TERRAIN_HEIGHT_BOUND * 0.5;
export const HIGHLAND_ELEVATION = TERRAIN_HEIGHT_BOUND * 0.5;

// Slope is measured exactly the way core/TerrainWalkability.js measures
// a movement step — rise over a small fixed horizontal run — sampled in
// both the X and Z direction and combined, since (unlike a single
// candidate movement step) surface classification has no single
// "direction of travel" to measure against. Unlike walkability's own
// DEFAULT_MAX_WALKABLE_SLOPE (0.75, tuned against a full movement step
// across many world units), these thresholds are tuned against this
// SAME 1-unit sample distance on 0.2.76's own deliberately gentle
// terrain (docs/Roadmap.md, 0.2.76: "reads as geography, never spiky
// noise" — real generated terrain's steepest 1-unit slope anywhere is
// well under 0.2, nowhere near DEFAULT_MAX_WALKABLE_SLOPE), so a
// genuinely exposed hillside reads as SOIL/ROCK long before it would
// ever be rejected as unwalkable.
const SLOPE_SAMPLE_DISTANCE = 1;
const ROCK_SLOPE = 0.075; // roughly the steepest ~5% of this world's terrain
const SOIL_SLOPE = 0.05;  // roughly the steepest ~20% of this world's terrain

function slopeAt(seed, x, z, height) {
    const dx = terrainHeightAt(seed, x + SLOPE_SAMPLE_DISTANCE, z) - height;
    const dz = terrainHeightAt(seed, x, z + SLOPE_SAMPLE_DISTANCE) - height;
    return Math.sqrt(dx * dx + dz * dz) / SLOPE_SAMPLE_DISTANCE;
}

// The one public classification entry point. Deliberately evaluated in
// a fixed order — water (a depression) always wins over slope, and slope
// always wins over elevation — so one coordinate never reads as two
// different categories depending on evaluation order.
export function surfaceCategoryAt(seed, x, z) {
    const height = terrainHeightAt(seed, x, z);
    if (height <= WATER_LEVEL) return SURFACE_CATEGORY.WATER;

    const slope = slopeAt(seed, x, z, height);
    if (slope >= ROCK_SLOPE) return SURFACE_CATEGORY.ROCK;
    if (slope >= SOIL_SLOPE) return SURFACE_CATEGORY.SOIL;
    return SURFACE_CATEGORY.GRASS;
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpColor(a, b, t) {
    return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

// A second, independent low-frequency hash lattice — deliberately its
// OWN tiny implementation, never importing TerrainHeightField's private
// hash2D()/valueNoise2D(), the same "small dedicated pure module" split
// core/TerrainTiling.js's own header already justifies relative to
// core/SpatialCell.js. A shared seed offset (far outside anything
// core/TerrainHeightField.js's own OCTAVES use) keeps this fully
// decorrelated from elevation, so patches of lighter/darker color never
// visibly track hills/valleys.
const VARIATION_SEED_OFFSET = 0x53555246; // 'SURF' as bytes
const VARIATION_FREQUENCY = 1 / 96; // low frequency: broad, soft patches
const VARIATION_AMPLITUDE = 0.05;   // low contrast: a hint of texture, never a checkerboard

function variationHash(seed, latticeX, latticeZ) {
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

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

// Bilinear value noise, in [0, 1) — same shape as
// core/TerrainHeightField.js's own valueNoise2D(), independently
// implemented for the reasons explained above.
function variationNoise(seed, x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smoothstep(x - x0);
    const tz = smoothstep(z - z0);

    const v00 = variationHash(seed, x0, z0);
    const v10 = variationHash(seed, x0 + 1, z0);
    const v01 = variationHash(seed, x0, z0 + 1);
    const v11 = variationHash(seed, x0 + 1, z0 + 1);

    const top = lerp(v00, v10, tx);
    const bottom = lerp(v01, v11, tx);
    return lerp(top, bottom, tz);
}

// A single soft brightness offset applied equally to every channel — a
// LIGHTNESS variation, never an independent-per-channel one, is what
// keeps this reading as "the same grass, gently lit differently" rather
// than a hue-shifting checkerboard that would expose the noise function
// underneath it. See docs/Roadmap.md, 0.2.79: "very low frequency and
// low contrast," explicitly contrasted with a loud per-vertex dither.
function variationAt(seed, x, z) {
    const n = variationNoise(seed + VARIATION_SEED_OFFSET, x * VARIATION_FREQUENCY, z * VARIATION_FREQUENCY);
    return (n - 0.5) * 2 * VARIATION_AMPLITUDE;
}

// The one public color entry point — surfaceColor(seed, worldX, worldZ),
// exactly the shape docs/Roadmap.md, 0.2.79 asked for: a function of
// CONTINUOUS world coordinates, never tile coordinates, so streaming a
// tile in or out never changes the color any already-loaded neighbor
// computes at their shared edge. Returns {r, g, b} in [0, 1], THREE.Color's
// own native range.
export function surfaceColorAt(seed, x, z) {
    const category = surfaceCategoryAt(seed, x, z);
    let base = SURFACE_PALETTE[category];

    if (category === SURFACE_CATEGORY.GRASS) {
        const height = terrainHeightAt(seed, x, z);
        const t = clamp01((height - WATER_LEVEL) / (HIGHLAND_ELEVATION - WATER_LEVEL));
        base = lerpColor(base, GRASS_HIGHLAND, t);
    }

    const variation = variationAt(seed, x, z);
    return {
        r: clamp01(base.r + variation),
        g: clamp01(base.g + variation),
        b: clamp01(base.b + variation)
    };
}

// Deliberately not yet: water simulation, swimming, rivers, shorelines,
// vegetation objects/meshes, weather, seasons, snow, erosion, a real
// biome simulation, or large terrain-texture assets — WATER/SOIL/ROCK/
// GRASS are visual surface categories, not the systems those words
// usually imply (see docs/Roadmap.md, 0.2.79). Also deliberately not
// yet: a per-World/per-Document surface palette or classification
// (today's SURFACE_PALETTE and thresholds are the one shared look every
// document's terrain uses, the same posture core/TerrainHeightField.js's
// own DEFAULT_WORLD_SEED already established); consulting this file from
// core/TerrainWalkability.js or application/AvatarTerrainConstraint.js
// (walkability stays exactly the slope-only decision 0.2.77 established
// — SOIL/ROCK are not "this ground is unwalkable," they are only "this
// ground looks like exposed dirt/stone"); and any per-vertex texture
// map/normal map beyond flat vertex color.
