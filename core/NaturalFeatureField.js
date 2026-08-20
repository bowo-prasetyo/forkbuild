// Deterministic, seeded natural-feature (tree) placement for World View —
// see docs/Roadmap.md, 0.2.88, "Deterministic World Ecology," and
// docs/Principles.md, "Natural Features Are Sampled, Never Stored (0.2.88)."
// naturalFeaturesInRegion(seed, minX, minZ, maxX, maxZ) is a PURE function
// of exactly its own arguments — no Math.random, no Date.now, no
// persisted state, no TreeRecord anywhere in this codebase. Two replicas
// (or the same replica revisiting a region after roaming thousands of
// units away) that query the same region always get back the exact same
// array of trees, because both are recomputing the identical deterministic
// lattice from nothing but (seed, x, z) — the same "content-addressed by
// geography" discipline core/TerrainHeightField.js established for
// elevation and core/TerrainSurface.js extended to color, now extended
// one layer further to WHAT grows somewhere, not just what it looks like.
//
// Deliberately NOT one candidate per world unit: candidate positions sit
// on a coarse, FIXED lattice (TREE_LATTICE_SPACING units apart, jittered
// within each cell) — see core/TerrainTiling.js's own header for the
// precedent of a fixed lattice existing purely so two independent callers
// agree on it without coordinating. Each lattice cell hosts at most one
// tree, so tree density is controlled entirely by which cells PASS their
// ecology/density gate, never by how finely the lattice is subdivided.
//
// core/TerrainTiling.js's TERRAIN_TILE_SIZE (40) is an exact multiple of
// TREE_LATTICE_SPACING, so every render tile's bounds land exactly on
// lattice-cell boundaries — no lattice cell ever straddles two tiles.
// Combined with jitter that is strictly confined to the interior of its
// own cell (never reaching a neighboring cell's territory) and a final
// bounds filter on the jittered position itself, this guarantees every
// tree is discovered by EXACTLY ONE tile query: never duplicated across
// a shared tile edge, never dropped into a gap between them — the same
// "no seam, no double-count" property core/TerrainSurface.js's own
// per-vertex world-coordinate sampling already gives terrain color.

import { terrainHeightAt } from './TerrainHeightField.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';

export const FEATURE_TYPE = Object.freeze({
    TREE: 'TREE'
});

// 40 / 4 = 10 cells per terrain tile edge — see this file's own header
// for why an exact divisor of TERRAIN_TILE_SIZE matters. Also a
// plausible real-world tree-to-tree spacing at this world's scale (one
// tree's own canopy is a few units wide), so candidate cells read as
// "roughly where a tree COULD stand," not an arbitrary sampling grid.
export const TREE_LATTICE_SPACING = 4;

// Jitter is confined to the middle 70% of each cell (from 0.15 to 0.85 of
// the way across it) — enough to break up an obviously-gridded look,
// never so much that a jittered position could cross into a neighboring
// cell's own territory and violate the "exactly one tile discovers this
// tree" guarantee described above.
const JITTER_MARGIN = 0.15;
const JITTER_RANGE = 1 - JITTER_MARGIN * 2;

// A tree stands only where the FOREST or GRASSLAND ecology zone already
// says vegetation-bearing ground exists — WATER/BEACH/ROCK/HIGHLAND/FIELD
// are excluded entirely at the zone level, so this file never re-derives
// "not water" / "slope acceptable" itself; core/TerrainEcology.js is the
// one place that decision is made. FOREST gets a permissive density
// threshold (most qualifying cells host a tree — dense cover); GRASSLAND
// gets a restrictive one (only the noise field's own local peaks host a
// tree — sparse, scattered fringe trees). This is what makes a forest's
// edge FADE into surrounding grassland rather than stopping at a hard
// line: the zone boundary is a hard line, but tree density either side
// of it is not.
const FOREST_DENSITY_THRESHOLD = 0.42;
const GRASSLAND_DENSITY_THRESHOLD = 0.80;

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// A small, fast, deterministic 32-bit avalanche hash — independently
// reimplemented per this file's own header precedent (see
// core/TerrainEcology.js's own identical note): every noise/jitter field
// in this codebase gets its own tiny, module-private primitive rather
// than a shared one.
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

// Arbitrary but fixed forever, and deliberately far from every other
// seed offset in core/TerrainHeightField.js, core/TerrainSurface.js, and
// core/TerrainEcology.js — five fully decorrelated per-cell fields
// (jitter X, jitter Z, rotation, scale, variant) plus one continuous
// density field, none of which should ever visibly track another.
const DENSITY_SEED_OFFSET = 0x4644454e;   // 'FDEN'
const JITTER_X_SEED_OFFSET = 0x4a495458;  // 'JITX'
const JITTER_Z_SEED_OFFSET = 0x4a495a5a;  // 'JITZ'
const ROTATION_SEED_OFFSET = 0x524f5441;  // 'ROTA'
const SCALE_SEED_OFFSET = 0x5343414c;     // 'SCAL'
const VARIANT_SEED_OFFSET = 0x56415249;   // 'VARI'

// Broad and continuous, independently of core/TerrainEcology.js's own
// moistureAt() by design — see this file's own header for why a forest's
// TREE density needs its own texture, decorrelated from the field that
// decided the forest's own boundary, rather than being a direct copy of
// it (a direct copy would make the density threshold and the zone
// boundary the same line twice, defeating the fade-to-grassland effect).
const DENSITY_FREQUENCY = 1 / 26;

// How likely a lattice cell is to host a tree, in [0, 1) — the ONE input
// naturalFeaturesInRegion() thresholds against, at a different cutoff per
// ecology zone (see FOREST_DENSITY_THRESHOLD / GRASSLAND_DENSITY_THRESHOLD
// above).
export function forestDensityAt(seed, x, z) {
    return valueNoise2D(seed + DENSITY_SEED_OFFSET, x * DENSITY_FREQUENCY, z * DENSITY_FREQUENCY);
}

function densityThresholdFor(zone) {
    if (zone === ECOLOGY_ZONE.FOREST) return FOREST_DENSITY_THRESHOLD;
    if (zone === ECOLOGY_ZONE.GRASSLAND) return GRASSLAND_DENSITY_THRESHOLD;
    return null; // no other zone ever hosts a tree
}

// Every natural feature this file can ever produce for one lattice cell,
// or null if the cell hosts nothing — factored out of
// naturalFeaturesInRegion() so both it and tests/tools can evaluate a
// single cell in isolation.
function featureForCell(seed, cellX, cellZ) {
    const jitterX = hash2D(seed + JITTER_X_SEED_OFFSET, cellX, cellZ);
    const jitterZ = hash2D(seed + JITTER_Z_SEED_OFFSET, cellX, cellZ);
    const x = (cellX + JITTER_MARGIN + jitterX * JITTER_RANGE) * TREE_LATTICE_SPACING;
    const z = (cellZ + JITTER_MARGIN + jitterZ * JITTER_RANGE) * TREE_LATTICE_SPACING;

    const zone = ecologyZoneAt(seed, x, z);
    const threshold = densityThresholdFor(zone);
    if (threshold === null) return null;

    const density = forestDensityAt(seed, x, z);
    if (density < threshold) return null;

    // 0.2.89 — a river veto layered on top of ecology's own zone/density
    // decision, the same "final check before returning" shape a GRASSLAND
    // cell already survives via its own restrictive threshold. A tree
    // that qualified on zone and density alone can still stand in the
    // exact channel core/Hydrology.js#isRiverAt() has already claimed for
    // flowing water — checked last, and only here, so a river never has
    // to be reasoned about anywhere else in this file.
    if (isRiverAt(seed, x, z)) return null;

    const rotationY = hash2D(seed + ROTATION_SEED_OFFSET, cellX, cellZ) * Math.PI * 2;
    const scale = 0.7 + hash2D(seed + SCALE_SEED_OFFSET, cellX, cellZ) * 0.6; // [0.7, 1.3)
    const variant = Math.floor(hash2D(seed + VARIANT_SEED_OFFSET, cellX, cellZ) * 3); // 0, 1, or 2

    return {
        type: FEATURE_TYPE.TREE,
        x, z,
        y: terrainHeightAt(seed, x, z),
        rotationY,
        scale,
        variant,
        zone
    };
}

// The one public entry point: every natural feature whose position falls
// within [minX, maxX) x [minZ, maxZ) — a half-open interval so that
// tile-aligned adjacent queries (renderer/NaturalFeatureTileMesh.js
// always passes exact tile bounds, themselves exact multiples of
// TREE_LATTICE_SPACING per this file's own header) partition the world
// with no gap and no overlap, the same half-open convention
// core/TerrainTiling.js's own tile grid already uses implicitly via
// Math.floor(). Returned in a fixed, deterministic order (sorted by cell
// x then z) so two callers querying the same region always get an
// identical ARRAY, element for element — never merely an identical set
// in Map/object iteration order.
export function naturalFeaturesInRegion(seed, minX, minZ, maxX, maxZ) {
    const cellMinX = Math.floor(minX / TREE_LATTICE_SPACING);
    const cellMaxX = Math.ceil(maxX / TREE_LATTICE_SPACING);
    const cellMinZ = Math.floor(minZ / TREE_LATTICE_SPACING);
    const cellMaxZ = Math.ceil(maxZ / TREE_LATTICE_SPACING);

    const features = [];
    for (let cellX = cellMinX; cellX < cellMaxX; cellX++) {
        for (let cellZ = cellMinZ; cellZ < cellMaxZ; cellZ++) {
            const feature = featureForCell(seed, cellX, cellZ);
            if (!feature) continue;
            if (feature.x < minX || feature.x >= maxX || feature.z < minZ || feature.z >= maxZ) continue;
            features.push(feature);
        }
    }
    features.sort((a, b) => (a.x - b.x) || (a.z - b.z));
    return features;
}

// Deliberately not yet: persisting a single placed feature anywhere
// (every tree in this file is recomputed, never stored — see
// docs/Principles.md, "Natural Features Are Sampled, Never Stored");
// tree collision, removal, ownership, or any interaction whatsoever (see
// docs/Roadmap.md, 0.2.88's own "Deliberately postponed" section); grass
// blades or any other per-instance ground-cover object (grass stays a
// ground-color treatment in core/TerrainEcology.js, never an object
// list); a real species/growth simulation; wind/animation; and a second
// feature TYPE beyond TREE (rocks, bushes, deadwood) — FEATURE_TYPE has
// exactly one member on purpose, so this milestone stays "trees, placed
// deterministically" and not "a general scattered-object system." See
// docs/Roadmap.md, 0.2.88, for the full list.
