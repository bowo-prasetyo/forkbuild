// Deterministic ecological ZONE classification for World View — see
// docs/Roadmap.md, 0.2.88, "Deterministic World Ecology," and
// docs/Principles.md, "Ecology Is A Third Pure Function Layered On
// Terrain, Never A New Ground Truth." Answers a DIFFERENT question from
// its two siblings:
//
//   TerrainHeightField  = "How high is the terrain?"
//   TerrainSurface       = "What does the ground look like here?"
//   TerrainEcology        = "What kind of natural environment is this?"
//   NaturalFeatureField   = "What naturally grows here?"
//
// ecologyZoneAt(seed, x, z) is a PURE function of exactly the same
// (seed, x, z) triple terrainHeightAt() and surfaceCategoryAt() already
// take — no Math.random, no Date.now, no persisted state, no tile
// coordinate anywhere in this file. It does not invent a second,
// competing ground truth: it CONSULTS surfaceCategoryAt() (elevation +
// slope) and layers two more independent, low-frequency noise fields on
// top — moisture (wet/dry) and cultivation (farmed/wild) — the same
// "own tiny hash lattice, decorrelated by a seed offset" technique
// core/TerrainSurface.js's own variationAt() already established, applied
// here to classification instead of color.
//
// This is why zone boundaries correlate with geography instead of
// looking like an unrelated biome map painted on top: WATER/ROCK always
// mirror surfaceCategoryAt() exactly, HIGHLAND tracks the same
// HIGHLAND_ELEVATION threshold core/TerrainSurface.js already tints
// GRASS lighter at, and BEACH is a narrow band hugging WATER_LEVEL —
// every one of those constants imported from core/TerrainSurface.js
// itself, never re-derived.

import { terrainHeightAt } from './TerrainHeightField.js';
import { surfaceCategoryAt, surfaceColorAt, SURFACE_CATEGORY, WATER_LEVEL, HIGHLAND_ELEVATION } from './TerrainSurface.js';

export const ECOLOGY_ZONE = Object.freeze({
    WATER: 'WATER',         // mirrors SURFACE_CATEGORY.WATER exactly — a low depression
    BEACH: 'BEACH',         // flat ground in a narrow band just above WATER_LEVEL
    ROCK: 'ROCK',           // mirrors SURFACE_CATEGORY.ROCK exactly — very steep exposed ground
    HIGHLAND: 'HIGHLAND',   // high elevation and/or moderately steep — sparse, hardy ground
    FOREST: 'FOREST',       // flat/moderate ground, wet enough to support dense tree cover
    FIELD: 'FIELD',         // flat/moderate ground, dry enough and deliberately "cultivated"
    GRASSLAND: 'GRASSLAND'  // flat/moderate ground, the common default case
});

// A narrow shoreline band, expressed (like every other threshold in this
// file) as a fraction of the SAME TERRAIN_HEIGHT_BOUND-derived constants
// core/TerrainSurface.js already exports, so it scales automatically if
// the height field's own amplitude ever changes instead of drifting out
// of range as a hardcoded absolute would.
const BEACH_BAND_WIDTH = (HIGHLAND_ELEVATION - WATER_LEVEL) * 0.08;

// Moisture above this reads as dense forest; between the min and max
// (drier, but not arid) is where FIELD becomes possible at all — real
// cropland is neither a bog nor a desert. Below FIELD_MOISTURE_MIN is
// the plain default: GRASSLAND.
const FOREST_MOISTURE_THRESHOLD = 0.60;
const FIELD_MOISTURE_MIN = 0.30;
const FIELD_MOISTURE_MAX = 0.60;

// Cultivation is a SEPARATE, much lower-frequency field from moisture —
// broad, patchy regions of "this stretch of otherwise-farmable ground
// happens to be worked" rather than every moisture-eligible tile
// automatically becoming a field. Without this second field, FIELD would
// just be "moisture is in a range," a band that would wrap uniformly
// around every FOREST the same way a topographic contour line does —
// visibly artificial. Cultivation makes field patches look chosen, not
// computed.
const FIELD_CULTIVATION_THRESHOLD = 0.55;

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

// A small, fast, deterministic 32-bit avalanche hash — the exact same
// shape core/TerrainHeightField.js#hash2D() and
// core/TerrainSurface.js#variationHash() already use, independently
// reimplemented here rather than imported for the same reason
// core/TerrainSurface.js's own header gives for not importing
// TerrainHeightField's private hash2D(): each noise field this file
// layers on top needs to be its OWN small, self-contained module-private
// primitive, never a shared mutable one two unrelated fields could
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

// Bilinear value noise on the unit lattice, in [0, 1) — same shape as
// core/TerrainHeightField.js#valueNoise2D(), independently implemented
// per this file's own header.
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

// 'MOIS' / 'CULT' as bytes — arbitrary but fixed, and deliberately far
// from core/TerrainHeightField.js's own OCTAVES seedOffsets and
// core/TerrainSurface.js's own VARIATION_SEED_OFFSET, so moisture,
// cultivation, elevation, and surface-color variation are four fully
// decorrelated fields sampling the same (seed, x, z) — a patch of high
// moisture never visibly tracks a hill, a color-variation patch, or a
// cultivated patch.
const MOISTURE_SEED_OFFSET = 0x4d4f4953;
const CULTIVATION_SEED_OFFSET = 0x43554c54;

// Broad, low frequency — moisture reads as sprawling wet/dry REGIONS
// (forests and their surrounding grassland), never a fine speckle.
const MOISTURE_FREQUENCY = 1 / 140;
// Lower frequency still, and independent of moisture — cultivation
// carves occasional, distinctly-shaped patches out of whatever ground is
// already moisture-eligible for FIELD, rather than following moisture's
// own contour.
const CULTIVATION_FREQUENCY = 1 / 90;

// How wet a coordinate's broader region is, in [0, 1). The single input
// FOREST and FIELD classification both consult (in different bands) —
// see the thresholds above.
export function moistureAt(seed, x, z) {
    return valueNoise2D(seed + MOISTURE_SEED_OFFSET, x * MOISTURE_FREQUENCY, z * MOISTURE_FREQUENCY);
}

// How "worked" a coordinate's broader patch is, in [0, 1) — consulted
// only within ground that is already moisture-eligible for FIELD; see
// this file's own header for why this is a second, independent field
// rather than a second moisture threshold.
export function cultivationAt(seed, x, z) {
    return valueNoise2D(seed + CULTIVATION_SEED_OFFSET, x * CULTIVATION_FREQUENCY, z * CULTIVATION_FREQUENCY);
}

// The one public classification entry point. Deliberately evaluated in a
// FIXED order, the same discipline core/TerrainSurface.js#
// surfaceCategoryAt() already established for its own categories: water
// always wins over rock, rock always wins over highland, highland always
// wins over the flat-ground zones, and among the flat-ground zones beach
// wins over forest wins over field wins over the grassland default — so
// one coordinate never reads as two different zones depending on
// evaluation order.
export function ecologyZoneAt(seed, x, z) {
    const surface = surfaceCategoryAt(seed, x, z);
    if (surface === SURFACE_CATEGORY.WATER) return ECOLOGY_ZONE.WATER;
    if (surface === SURFACE_CATEGORY.ROCK) return ECOLOGY_ZONE.ROCK;

    const height = terrainHeightAt(seed, x, z);
    if (surface === SURFACE_CATEGORY.SOIL || height >= HIGHLAND_ELEVATION) {
        return ECOLOGY_ZONE.HIGHLAND;
    }

    // From here on, surface === GRASS: flat/moderate ground, the
    // ecologically interesting case every other zone below refines.
    if (height <= WATER_LEVEL + BEACH_BAND_WIDTH) {
        return ECOLOGY_ZONE.BEACH;
    }

    const moisture = moistureAt(seed, x, z);
    if (moisture >= FOREST_MOISTURE_THRESHOLD) {
        return ECOLOGY_ZONE.FOREST;
    }
    if (moisture >= FIELD_MOISTURE_MIN && moisture < FIELD_MOISTURE_MAX &&
        cultivationAt(seed, x, z) >= FIELD_CULTIVATION_THRESHOLD) {
        return ECOLOGY_ZONE.FIELD;
    }
    return ECOLOGY_ZONE.GRASSLAND;
}

// Sand tone blended into BEACH ground, and the subtle furrow-row tint
// blended into FIELD ground — deliberately as restrained as
// core/TerrainSurface.js's own SURFACE_PALETTE (soft, low-saturation, see
// that file's own header for why): this is still background, not a
// texture asset.
const BEACH_SAND = Object.freeze({ r: 0.78, g: 0.73, b: 0.58 });
const FIELD_ROW_LOW = Object.freeze({ r: -0.03, g: -0.015, b: -0.03 });
const FIELD_ROW_HIGH = Object.freeze({ r: 0.03, g: 0.015, b: 0.03 });

// Furrow rows run in one fixed world-space direction (not aligned to any
// tile axis) so adjacent fields never look like they belong to different
// farms — a single continuous stripe frequency evaluated at the rotated
// coordinate `u`.
const FIELD_ROW_ANGLE = 0.4636; // ~26.57deg — arbitrary but fixed forever
const FIELD_ROW_FREQUENCY = 1 / 3.2;
const ROW_COS = Math.cos(FIELD_ROW_ANGLE);
const ROW_SIN = Math.sin(FIELD_ROW_ANGLE);

// The one public ground-color entry point for this milestone —
// ecologyGroundColorAt(seed, worldX, worldZ) starts from
// core/TerrainSurface.js#surfaceColorAt() (completely unchanged, still
// the single source of truth for WATER/SOIL/ROCK/GRASS coloring) and
// layers a BEACH sand tint or a FIELD row tint on top, exactly the way
// surfaceColorAt() itself layers its own GRASS-highland tint and
// brightness-variation noise on top of SURFACE_PALETTE — never a second,
// competing color system. HIGHLAND/ROCK/FOREST/GRASSLAND all pass
// through with the base terrain color untouched; only the two zones with
// a genuinely distinct LOOK (sand, furrows) get one.
export function ecologyGroundColorAt(seed, x, z) {
    const base = surfaceColorAt(seed, x, z);
    const zone = ecologyZoneAt(seed, x, z);

    if (zone === ECOLOGY_ZONE.BEACH) {
        // Blend toward sand more fully the closer a coordinate sits to
        // WATER_LEVEL itself — the shoreline reads as sand, the inland
        // edge of the beach band fades back toward ordinary grass color
        // rather than ending in a hard line.
        const height = terrainHeightAt(seed, x, z);
        const t = 1 - clamp01((height - WATER_LEVEL) / BEACH_BAND_WIDTH);
        return {
            r: lerp(base.r, BEACH_SAND.r, t),
            g: lerp(base.g, BEACH_SAND.g, t),
            b: lerp(base.b, BEACH_SAND.b, t)
        };
    }

    if (zone === ECOLOGY_ZONE.FIELD) {
        const u = x * ROW_COS + z * ROW_SIN;
        const rowPhase = Math.sin(u * FIELD_ROW_FREQUENCY * Math.PI * 2);
        const rowTint = rowPhase >= 0 ? FIELD_ROW_HIGH : FIELD_ROW_LOW;
        return {
            r: clamp01(base.r + rowTint.r),
            g: clamp01(base.g + rowTint.g),
            b: clamp01(base.b + rowTint.b)
        };
    }

    return base;
}

// Deliberately not yet: rivers, hydrology/flow simulation, seasons,
// weather, snow, erosion, per-World/per-Document ecology (today's
// thresholds are the one shared ecology every document's terrain uses,
// the same posture core/TerrainHeightField.js's own DEFAULT_WORLD_SEED
// and core/TerrainSurface.js's own SURFACE_PALETTE already established);
// simulated agriculture (FIELD is a deterministic ground-cover zone, not
// a crop/growth system); consulting this file from
// core/TerrainWalkability.js or application/AvatarTerrainConstraint.js
// (walkability stays exactly the slope-only decision 0.2.77 established
// — no ecology zone is "this ground is unwalkable"); and any change to
// core/TerrainSurface.js's own SURFACE_CATEGORY/SURFACE_PALETTE (this
// file only ever CONSULTS that classification, never redefines it). See
// docs/Roadmap.md, 0.2.88, for the full list.
