// Deterministic animal COLLISION geometry for World View — the direct
// structural twin of core/TreeCollisionGeometry.js, applied to
// core/WildlifeField.js's own animal placement instead of
// core/NaturalFeatureField.js's tree placement:
//
//   core/WildlifeField.js            = "Where does an animal stand, and how?"
//   core/WildlifeCollisionGeometry.js = "What physical space does it occupy?"
//
// animalCollisionCircleFor(feature) and wildlifeCollisionGeometryInRegion(seed,
// minX, minZ, maxX, maxZ) are PURE functions — no Math.random, no Date.now,
// no persisted state, no second animal-placement lattice anywhere in this
// file. They never decide WHERE an animal stands, WHETHER one exists, or
// what species it is — every one of those questions already has exactly one
// owner, core/WildlifeField.js#wildlifeInRegion(), and this file only ever
// CONSULTS its output — the same "consult, never re-derive" discipline
// core/TreeCollisionGeometry.js's own header already established.
//
// Deliberately a CIRCLE around the animal's body footprint, sized PER
// SPECIES rather than a single shared radius the way trees use one fixed
// trunk radius — a resting deer and a rabbit occupy genuinely different
// amounts of ground (see renderer/WildlifeTileMesh.js's own SPECIES_PRESET
// body dimensions, which this file's own ANIMAL_COLLISION_RADIUS values are
// chosen to roughly match, without importing that renderer constant
// directly — the same "roughly match, never import" precedent
// core/TreeCollisionGeometry.js's own header already established for
// TREE_TRUNK_COLLISION_RADIUS versus renderer/NaturalFeatureTileMesh.js's
// TRUNK_RADIUS_BOTTOM).
//
// A returned circle's radius scales with the animal's own `feature.scale`
// ([0.85, 1.15), core/WildlifeField.js) by the same uniform factor
// renderer/WildlifeTileMesh.js already applies to its instance transform —
// so a visually larger animal also occupies a proportionally larger
// physical footprint.

import { WILDLIFE_FEATURE_TYPE, ANIMAL_SPECIES, wildlifeInRegion } from './WildlifeField.js';

// An animal is the only COLLISION_OBJECT_KIND this file produces — kept as
// a frozen, single-member vocabulary object, matching
// core/TreeCollisionGeometry.js#COLLISION_OBJECT_KIND's own precedent.
export const COLLISION_OBJECT_KIND = Object.freeze({
    ANIMAL: 'ANIMAL'
});

// CIRCLE is the only shape this file ever produces — see this file's own
// header for why a circle, not an axis-aligned box: an animal's footprint
// is naturally round, and a circle needs no rotation handling, matching
// this file's own deliberate exclusion of `rotationY` from every returned
// shape below.
export const COLLISION_SHAPE = Object.freeze({
    CIRCLE: 'CIRCLE'
});

// One base hitbox radius per core/WildlifeField.js#ANIMAL_SPECIES, roughly
// matching that species' own renderer/WildlifeTileMesh.js#SPECIES_PRESET
// body half-width — a deer's own bodyRadiusX (0.34) and a rabbit's own
// (0.20), each rounded up slightly for a hitbox an avatar can actually feel
// brushing against, the same "scaled up from a visual dimension, never
// identical to it" precedent core/TreeCollisionGeometry.js's own
// TREE_TRUNK_COLLISION_RADIUS header already established.
export const ANIMAL_COLLISION_RADIUS = Object.freeze({
    [ANIMAL_SPECIES.DEER]: 0.5,
    [ANIMAL_SPECIES.RABBIT]: 0.3
});

// The one per-animal entry point: turns a single wildlife-feature record
// (exactly the shape core/WildlifeField.js#wildlifeInRegion() already
// returns) into an immutable collision description. Deliberately takes the
// FULL feature object, not a bare (x, z) pair — `feature.species` selects
// the base radius and `feature.scale` sizes it, and taking the whole object
// keeps this function trivially callable directly on wildlifeInRegion()'s
// own output, with no adapter step in between.
export function animalCollisionCircleFor(feature) {
    const baseRadius = ANIMAL_COLLISION_RADIUS[feature.species] ?? ANIMAL_COLLISION_RADIUS[ANIMAL_SPECIES.RABBIT];
    return Object.freeze({
        kind: COLLISION_OBJECT_KIND.ANIMAL,
        shape: COLLISION_SHAPE.CIRCLE,
        center: Object.freeze({ x: feature.x, z: feature.z }),
        radius: baseRadius * feature.scale
    });
}

// The one region-level entry point, mirroring wildlifeInRegion()'s own
// (seed, minX, minZ, maxX, maxZ) half-open-interval contract exactly —
// matching core/TreeCollisionGeometry.js#treeCollisionGeometryInRegion()'s
// own identical mirroring of naturalFeaturesInRegion(). Filters to
// WILDLIFE_FEATURE_TYPE.ANIMAL explicitly so a future second wildlife
// feature type never silently gains a circular hitbox of its own.
export function wildlifeCollisionGeometryInRegion(seed, minX, minZ, maxX, maxZ) {
    return wildlifeInRegion(seed, minX, minZ, maxX, maxZ)
        .filter((feature) => feature.type === WILDLIFE_FEATURE_TYPE.ANIMAL)
        .map(animalCollisionCircleFor);
}
