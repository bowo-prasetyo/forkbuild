// Deterministic tree COLLISION geometry for World View — see
// docs/Roadmap.md, 0.9.59, "Deterministic World Tree Collision Geometry,"
// and docs/Principles.md, "Tree Collision Geometry Is Derived From The
// Same Placement As Rendering, Never A Second Placement Decision (0.9.59)."
// Answers exactly one question, and only that one:
//
//   core/NaturalFeatureField.js  = "Where does a tree stand, and how?"
//   core/TreeCollisionGeometry.js = "What physical space does it occupy?"
//
// treeCollisionCircleFor(feature) and treeCollisionGeometryInRegion(seed,
// minX, minZ, maxX, maxZ) are PURE functions — no Math.random, no
// Date.now, no persisted state, no second tree-placement lattice anywhere
// in this file. They never decide WHERE a tree stands, WHETHER one
// exists, or what it looks like — every one of those questions already
// has exactly one owner, core/NaturalFeatureField.js#naturalFeaturesInRegion(),
// and this file only ever CONSULTS its output, the same "consult, never
// re-derive" discipline core/TerrainEcology.js's own header already
// established relative to core/TerrainSurface.js. Two replicas that
// resolve the same seed and region therefore always agree on both WHERE
// every tree is AND what it physically occupies, because both facts trace
// back to the identical upstream computation.
//
// Deliberately a CIRCLE around the trunk, not the full visual canopy —
// renderer/NaturalFeatureTileMesh.js's own CANOPY_RADIUS (0.85) describes
// how wide a tree looks, not how much space an avatar's body should
// actually be blocked from occupying; a canopy-sized hitbox would read as
// the avatar bumping into invisible walls well outside a tree's own
// trunk. TREE_TRUNK_COLLISION_RADIUS is chosen to roughly match that same
// file's own TRUNK_RADIUS_BOTTOM (0.14), scaled up to a hitbox an avatar
// can actually feel brushing against, WITHOUT importing that renderer
// constant directly — the same "roughly match, never import, deliberately
// allowed to diverge" precedent core/AvatarCollision.js's own
// AVATAR_COLLISION_RADIUS header already established for the avatar's own
// hitbox versus renderer/AvatarRenderer.js's visual proportions. Rendering
// dimensions and physical collision dimensions are related, never
// identical.
//
// A returned circle's radius scales with the tree's own `feature.scale`
// ([0.7, 1.3), core/NaturalFeatureField.js) by the same uniform factor
// renderer/NaturalFeatureTileMesh.js already applies to its instance
// transform — so a visually larger tree also occupies a proportionally
// larger physical footprint, and the collision world never disagrees with
// what the rendered world actually shows standing at that position.

import { FEATURE_TYPE, naturalFeaturesInRegion } from './NaturalFeatureField.js';

// A tree is the only COLLISION_OBJECT_KIND this milestone produces — kept
// as a frozen, single-member vocabulary object rather than a bare string
// for the exact reason core/NaturalFeatureField.js's own FEATURE_TYPE is
// (see that file's own header): a future object kind (a rock, a building)
// is expected to join this vocabulary later without renaming what already
// exists.
export const COLLISION_OBJECT_KIND = Object.freeze({
    TREE: 'TREE'
});

// CIRCLE is the only shape this milestone ever produces — see this file's
// own header for why a circle, not an axis-aligned box (core/
// AvatarCollision.js#brickAabb's own shape for bricks): a tree's footprint
// is naturally round, and a circle needs no rotation handling the way a
// box would, matching this file's own deliberate exclusion of `rotationY`
// from every returned shape below.
export const COLLISION_SHAPE = Object.freeze({
    CIRCLE: 'CIRCLE'
});

// Roughly matches renderer/NaturalFeatureTileMesh.js's own
// TRUNK_RADIUS_BOTTOM (0.14), scaled up for a hitbox an avatar can
// actually feel — see this file's own header for why this is a
// deliberately independent constant, never an import of that renderer
// value.
export const TREE_TRUNK_COLLISION_RADIUS = 0.3;

// The one per-tree entry point: turns a single natural-feature record
// (exactly the shape core/NaturalFeatureField.js#naturalFeaturesInRegion()
// already returns) into an immutable collision description. Deliberately
// takes the FULL feature object, not a bare (x, z) pair — `feature.scale`
// is required to size the circle correctly, and taking the whole object
// (rather than destructuring specific fields at every call site) keeps
// this function trivially callable directly on naturalFeaturesInRegion()'s
// own output, with no adapter step in between.
export function treeCollisionCircleFor(feature) {
    return Object.freeze({
        kind: COLLISION_OBJECT_KIND.TREE,
        shape: COLLISION_SHAPE.CIRCLE,
        center: Object.freeze({ x: feature.x, z: feature.z }),
        radius: TREE_TRUNK_COLLISION_RADIUS * feature.scale
    });
}

// The one region-level entry point, mirroring naturalFeaturesInRegion()'s
// own (seed, minX, minZ, maxX, maxZ) half-open-interval contract exactly
// — so a caller who already queries tree PLACEMENT for a tile (e.g. a
// future obstacle-collection step, mirroring application/
// AvatarMovementConstraint.js's own per-brick collection) can query tree
// COLLISION GEOMETRY for the identical region with the identical
// arguments, never a second coordinate convention to keep in sync. Filters
// to FEATURE_TYPE.TREE explicitly (matching renderer/
// NaturalFeatureTileMesh.js's own identical filter) so a future second
// FEATURE_TYPE never silently gains a circular tree hitbox of its own.
//
// This performs no detection and no response — it returns WHAT collision
// geometry exists in a region, never whether anything intersects it. See
// this file's own header and docs/Roadmap.md, 0.9.59, for why avatar-tree
// intersection testing and movement resolution are both deliberately left
// to later, separate milestones.
export function treeCollisionGeometryInRegion(seed, minX, minZ, maxX, maxZ) {
    return naturalFeaturesInRegion(seed, minX, minZ, maxX, maxZ)
        .filter((feature) => feature.type === FEATURE_TYPE.TREE)
        .map(treeCollisionCircleFor);
}

// Deliberately not yet: avatar-tree collision DETECTION (does a point or
// AABB intersect one of these circles — the next milestone's own job, see
// docs/Roadmap.md, 0.9.59's own "Deliberately postponed" section);
// collision RESPONSE (blocking, sliding, or any other movement outcome);
// wiring this file into application/AvatarMovementConstraint.js,
// application/AvatarTerrainConstraint.js, or core/AvatarCollision.js in
// any way; a physics engine, velocity, acceleration, or mass of any kind;
// tree destruction, harvesting, or any other interaction; a second
// COLLISION_SHAPE (a box, a capsule) or a second COLLISION_OBJECT_KIND (a
// rock, a building) — both frozen vocabularies have exactly one member on
// purpose, the same "one member today, room to grow later" posture
// core/NaturalFeatureField.js's own FEATURE_TYPE already established; and
// persisting a single resolved circle anywhere — every circle here is
// recomputed fresh from naturalFeaturesInRegion()'s own sampled (never
// stored) output, exactly as that file's own header already requires. See
// docs/Roadmap.md, 0.9.59, for the full list.
