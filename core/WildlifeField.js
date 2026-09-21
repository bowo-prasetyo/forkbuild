// Deterministic, seeded wildlife (animal) placement for World View — the
// same "sampled, never stored" discipline core/NaturalFeatureField.js
// established for trees in 0.2.88, applied here to grazing/resting
// animals instead of vegetation. wildlifeInRegion(seed, minX, minZ, maxX,
// maxZ) is a PURE function of exactly its own arguments — no Math.random,
// no Date.now, no persisted state, no AnimalRecord anywhere in this
// codebase. Two replicas (or the same replica revisiting a region after
// roaming thousands of units away) that query the same region always get
// back the exact same array of animals, because both are recomputing the
// identical deterministic lattice from nothing but (seed, x, z).
//
// Deliberately a SIBLING of core/NaturalFeatureField.js, not a dependent
// of it: both consult core/TerrainEcology.js and core/Hydrology.js
// directly and independently, so an animal's position is never derived
// from — or checked against — a tree's own position. A resting deer that
// happens to stand where a tree also stands is an acceptable, honestly
// static-decoration outcome (see this file's own "Deliberately not yet"
// section), the same "no collision, no interaction" posture 0.2.88 itself
// shipped with for trees before any collision layer existed for them.
//
// Candidate positions sit on their own coarse, FIXED lattice
// (WILDLIFE_LATTICE_SPACING units apart, jittered within each cell) —
// deliberately coarser than core/NaturalFeatureField.js#TREE_LATTICE_SPACING
// (10 vs 4), because animals are a far sparser population than trees:
// a world reads as "forested" when many lattice cells qualify, but reads
// as "has wildlife" even when only a handful of cells anywhere ever do.
// core/TerrainTiling.js's own TERRAIN_TILE_SIZE (40) is an exact multiple
// of WILDLIFE_LATTICE_SPACING, so every render tile's bounds land exactly
// on lattice-cell boundaries — no lattice cell ever straddles two tiles,
// the identical partition guarantee core/NaturalFeatureField.js's own
// header already proves for trees, re-proven here for animals in
// tests/WildlifeField.test.js.

import { terrainHeightAt } from './TerrainHeightField.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';

export const WILDLIFE_FEATURE_TYPE = Object.freeze({
    ANIMAL: 'ANIMAL'
});

// What SPECIES an animal is — a property of the animal itself, orthogonal
// to WILDLIFE_FEATURE_TYPE, the same relationship core/NaturalFeatureField.js#TREE_SPECIES
// has to its own FEATURE_TYPE.TREE. Each species is tied to exactly one
// ecology zone (no climate blend yet — see this file's own header for why
// that is a plausible future extension, not a v1 requirement): DEER favor
// the cover of FOREST, RABBIT favor open GRASSLAND.
export const ANIMAL_SPECIES = Object.freeze({
    DEER: 'DEER',
    RABBIT: 'RABBIT'
});

// 40 / 10 = 4 cells per terrain tile edge — an exact divisor of
// TERRAIN_TILE_SIZE, and deliberately coarser than
// core/NaturalFeatureField.js#TREE_LATTICE_SPACING (see this file's own
// header for why wildlife needs a sparser candidate grid than trees).
export const WILDLIFE_LATTICE_SPACING = 10;

// Same jitter shape core/NaturalFeatureField.js already uses: confined to
// the middle 70% of each cell so a jittered position can never cross into
// a neighboring cell's own territory, preserving the "exactly one tile
// discovers this animal" guarantee the lattice partition depends on.
const JITTER_MARGIN = 0.15;
const JITTER_RANGE = 1 - JITTER_MARGIN * 2;

// An animal stands only where FOREST or GRASSLAND ecology already says
// vegetation-bearing ground exists — the identical zone restriction
// core/NaturalFeatureField.js imposes on trees, for the identical reason:
// this file never re-derives "not water," "not too steep," or "not
// cultivated," core/TerrainEcology.js is the one place that decision is
// made. Each zone hosts exactly one species; the thresholds are
// deliberately stricter (fewer qualifying cells) than either of
// core/NaturalFeatureField.js's own tree thresholds, because a world with
// as many animals as trees would read as a farm, not a wilderness.
const FOREST_ANIMAL_DENSITY_THRESHOLD = 0.90;   // DEER — rare, deep cover
const GRASSLAND_ANIMAL_DENSITY_THRESHOLD = 0.82; // RABBIT — sparse, but more common than deer

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// A small, fast, deterministic 32-bit avalanche hash — independently
// reimplemented per core/NaturalFeatureField.js's own header precedent:
// every noise/jitter field in this codebase gets its own tiny,
// module-private primitive rather than a shared one.
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

// Arbitrary but fixed forever, and deliberately far from every other seed
// offset in this codebase (core/TerrainHeightField.js,
// core/TerrainSurface.js, core/TerrainEcology.js, core/Hydrology.js,
// core/NaturalFeatureField.js) — five fully decorrelated per-cell fields
// (jitter X, jitter Z, rotation, scale, variant) plus one continuous
// density field, none of which should ever visibly track another or a
// tree's own identically-shaped fields.
const DENSITY_SEED_OFFSET = 0x5744454e;  // 'WDEN'
const JITTER_X_SEED_OFFSET = 0x574a5458; // 'WJTX'
const JITTER_Z_SEED_OFFSET = 0x574a545a; // 'WJTZ'
const ROTATION_SEED_OFFSET = 0x57524f54; // 'WROT'
const SCALE_SEED_OFFSET = 0x5753434c;    // 'WSCL'
const VARIANT_SEED_OFFSET = 0x57564152;  // 'WVAR'

// Broad and continuous, independently of core/NaturalFeatureField.js's own
// forestDensityAt() by design — the same decorrelation reasoning that
// file's own header gives for staying independent of
// core/TerrainEcology.js#moistureAt(): a wildlife-density peak should
// never visibly track a tree-density peak, or the two populations would
// silently draw the same map twice.
const DENSITY_FREQUENCY = 1 / 70;

// How likely a lattice cell is to host an animal, in [0, 1) — the ONE
// input wildlifeInRegion() thresholds against, at a different cutoff per
// ecology zone (see FOREST_ANIMAL_DENSITY_THRESHOLD /
// GRASSLAND_ANIMAL_DENSITY_THRESHOLD above).
export function wildlifeDensityAt(seed, x, z) {
    return valueNoise2D(seed + DENSITY_SEED_OFFSET, x * DENSITY_FREQUENCY, z * DENSITY_FREQUENCY);
}

function densityThresholdFor(zone) {
    if (zone === ECOLOGY_ZONE.FOREST) return FOREST_ANIMAL_DENSITY_THRESHOLD;
    if (zone === ECOLOGY_ZONE.GRASSLAND) return GRASSLAND_ANIMAL_DENSITY_THRESHOLD;
    return null; // no other zone ever hosts an animal
}

function speciesForZone(zone) {
    return zone === ECOLOGY_ZONE.FOREST ? ANIMAL_SPECIES.DEER : ANIMAL_SPECIES.RABBIT;
}

// Every animal this file can ever produce for one lattice cell, or null if
// the cell hosts nothing — factored out of wildlifeInRegion() so both it
// and tests/tools can evaluate a single cell in isolation, the same split
// core/NaturalFeatureField.js#featureForCell() already establishes.
function animalForCell(seed, cellX, cellZ) {
    const jitterX = hash2D(seed + JITTER_X_SEED_OFFSET, cellX, cellZ);
    const jitterZ = hash2D(seed + JITTER_Z_SEED_OFFSET, cellX, cellZ);
    const x = (cellX + JITTER_MARGIN + jitterX * JITTER_RANGE) * WILDLIFE_LATTICE_SPACING;
    const z = (cellZ + JITTER_MARGIN + jitterZ * JITTER_RANGE) * WILDLIFE_LATTICE_SPACING;

    const zone = ecologyZoneAt(seed, x, z);
    const threshold = densityThresholdFor(zone);
    if (threshold === null) return null;

    const density = wildlifeDensityAt(seed, x, z);
    if (density < threshold) return null;

    // The identical "final check before returning" river veto
    // core/NaturalFeatureField.js#featureForCell() applies to trees: an
    // animal that qualified on zone and density alone still cannot stand
    // in the exact channel core/Hydrology.js#isRiverAt() has already
    // claimed for flowing water.
    if (isRiverAt(seed, x, z)) return null;

    const rotationY = hash2D(seed + ROTATION_SEED_OFFSET, cellX, cellZ) * Math.PI * 2;
    const scale = 0.85 + hash2D(seed + SCALE_SEED_OFFSET, cellX, cellZ) * 0.3; // [0.85, 1.15)
    const variant = Math.floor(hash2D(seed + VARIANT_SEED_OFFSET, cellX, cellZ) * 3); // 0, 1, or 2
    const species = speciesForZone(zone);

    return {
        type: WILDLIFE_FEATURE_TYPE.ANIMAL,
        x, z,
        y: terrainHeightAt(seed, x, z),
        rotationY,
        scale,
        variant,
        species,
        zone
    };
}

// The one public entry point: every animal whose position falls within
// [minX, maxX) x [minZ, maxZ) — a half-open interval, sorted in a fixed,
// deterministic order (by cell x then z), the same contract
// core/NaturalFeatureField.js#naturalFeaturesInRegion() already commits
// to, so tile-aligned adjacent queries partition the world with no gap
// and no overlap.
export function wildlifeInRegion(seed, minX, minZ, maxX, maxZ) {
    const cellMinX = Math.floor(minX / WILDLIFE_LATTICE_SPACING);
    const cellMaxX = Math.ceil(maxX / WILDLIFE_LATTICE_SPACING);
    const cellMinZ = Math.floor(minZ / WILDLIFE_LATTICE_SPACING);
    const cellMaxZ = Math.ceil(maxZ / WILDLIFE_LATTICE_SPACING);

    const animals = [];
    for (let cellX = cellMinX; cellX < cellMaxX; cellX++) {
        for (let cellZ = cellMinZ; cellZ < cellMaxZ; cellZ++) {
            const animal = animalForCell(seed, cellX, cellZ);
            if (!animal) continue;
            if (animal.x < minX || animal.x >= maxX || animal.z < minZ || animal.z >= maxZ) continue;
            animals.push(animal);
        }
    }
    animals.sort((a, b) => (a.x - b.x) || (a.z - b.z));
    return animals;
}

// Deliberately not yet: persisting a single placed animal anywhere (every
// animal in this file is recomputed, never stored, the identical posture
// docs/Principles.md's "Natural Features Are Sampled, Never Stored"
// establishes for trees); movement, wandering, flocking, or any animation
// whatsoever — every animal here is a static decoration at a fixed point,
// the same "trees, placed deterministically" restraint 0.2.88 itself
// shipped before any later milestone considered motion; collision with
// trees, buildings, or avatars; ownership or interaction of any kind;
// species blending by climate the way core/NaturalFeatureField.js#TREE_SPECIES
// blends CONIFER/BROADLEAF by moisture (a plausible follow-on once more
// than two species exist, not required for this milestone); day/night or
// seasonal presence; and a third ecology zone ever hosting an animal
// (HIGHLAND/ROCK/WATER/BEACH/FIELD stay entirely animal-free, mirroring
// exactly which zones core/NaturalFeatureField.js excludes for trees).
