// Pure avatar-tree collision SPATIAL QUERY for World View — see
// docs/Roadmap.md, 0.9.62, "Deterministic Tree Collision Spatial Query,"
// and core/TreeCollisionGeometry.js's, core/AvatarTreeCollision.js's, and
// core/AvatarTreeMovement.js's own headers for the three questions this
// one completes the set of:
//
//   core/TreeCollisionGeometry.js    = "What physical space does a tree occupy?"
//   core/AvatarTreeCollision.js      = "Does the avatar's own space overlap it?"
//   core/AvatarTreeMovement.js       = "Given that, where may the avatar move?"
//   core/AvatarTreeCollisionQuery.js = "Which trees are worth asking either of those about?"
//
// treeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition })
// is a PURE function of exactly its own arguments — no Math.random, no
// Date.now, no persisted state, no spatial index of any kind. It answers
// ONE question and only that one: given an avatar moving from
// `currentPosition` toward `requestedPosition`, which tree collision
// circles could possibly matter? It never answers whether any of them
// actually collide (core/AvatarTreeCollision.js's own job) and never
// resolves the requested movement against them
// (core/AvatarTreeMovement.js's own job) — this file returns a plain
// array of candidate circles, nothing more.
//
// This file performs NO second tree-placement or tree-geometry
// computation of its own. It computes an expanded axis-aligned query
// rectangle from `currentPosition` and `requestedPosition`, then hands
// that rectangle straight to core/TreeCollisionGeometry.js's own
// treeCollisionGeometryInRegion(seed, minX, minZ, maxX, maxZ) — the exact
// same region-level entry point that file already established, with the
// exact same (seed, minX, minZ, maxX, maxZ) half-open-interval contract
// naturalFeaturesInRegion() itself defines. There is deliberately no
// second, differently-named "give me tree circles in a region" function
// in this file: that question already has exactly one owner, and this
// file only ever decides WHICH region to ask it about, matching the same
// "consult, never re-derive" discipline core/TreeCollisionGeometry.js's
// own header already established relative to
// core/NaturalFeatureField.js.
//
// The query region is the AABB spanning `currentPosition` and
// `requestedPosition` — the avatar's full swept path, not merely its
// starting point, so a tree standing just past the start but squarely
// along the direction of travel is never missed — expanded on every side
// by CANDIDATE_QUERY_MARGIN below, so a tree whose CENTER sits just
// outside that raw rectangle, but whose collision circle still reaches
// into it, is never wrongly excluded either. `y` is read from neither
// position: exactly like every file in this pair, tree collision is a
// purely horizontal (X/Z) concern.
//
// Deliberately NOT a spatial index — no QuadTree, no R-Tree, no hash
// grid, no persisted structure of any kind. See this file's own
// "Deliberately not yet" footer, and docs/Roadmap.md, 0.9.62, for why: a
// straightforward expanded-rectangle query is the entire semantic
// requirement this milestone exists to satisfy, and introducing a real
// spatial index before profiling ever demonstrates this approach is too
// slow would be optimizing a cost nobody has measured yet.

import { treeCollisionGeometryInRegion, TREE_TRUNK_COLLISION_RADIUS } from './TreeCollisionGeometry.js';
import { AVATAR_COLLISION_RADIUS } from './AvatarCollision.js';

// core/NaturalFeatureField.js's own `feature.scale` range is fixed at
// [0.7, 1.3) (see that file's own header and
// core/TreeCollisionGeometry.js's own treeCollisionCircleFor(), which
// multiplies TREE_TRUNK_COLLISION_RADIUS by exactly that scale). 1.3 is
// re-stated here as a literal, deliberately never imported — matching
// tests/TreeCollisionGeometry.test.js's own identical
// VISUAL_CANOPY_RADIUS_AT_SCALE_1 precedent of naming a sibling module's
// own internal constant locally rather than reaching into its private
// computation. This is the largest scale factor any real tree's
// collision circle can ever be built from, and therefore the largest
// radius any single tree circle this codebase produces can ever have.
const MAX_TREE_COLLISION_SCALE = 1.3;

// The largest possible radius of any tree collision circle
// core/TreeCollisionGeometry.js can ever produce, at the top of its own
// fixed scale range.
export const MAX_TREE_COLLISION_RADIUS = TREE_TRUNK_COLLISION_RADIUS * MAX_TREE_COLLISION_SCALE;

// How far, on every side, the raw swept-movement rectangle must be
// expanded before it is safe to hand to treeCollisionGeometryInRegion() —
// large enough that a tree whose CENTER lands just outside the raw
// rectangle, but whose own collision circle combined with the avatar's
// own AVATAR_COLLISION_RADIUS still reaches into the avatar's swept path,
// is never excluded. Deliberately the SUM of both radii, the same
// "combined radius" quantity core/AvatarTreeCollision.js#circlesIntersect()
// already tests distance against — a query margin any smaller could
// exclude a tree circlesIntersect() would otherwise report as touching.
export const CANDIDATE_QUERY_MARGIN = AVATAR_COLLISION_RADIUS + MAX_TREE_COLLISION_RADIUS;

// The one entry point. `currentPosition` and `requestedPosition` are
// plain `{ x, y, z }` positions — exactly what a caller already holds
// immediately before calling
// core/AvatarTreeMovement.js#resolveAvatarTreeMovement({ currentPosition,
// requestedPosition, trees }) — so the two compose directly, with this
// function's own return value supplying that function's own `trees`
// argument and nothing standing between them:
//
//   const trees = treeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition });
//   const resolved = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees });
//
// Returns exactly what treeCollisionGeometryInRegion() itself returns for
// the computed region — the same frozen circles, in the same
// deterministic (sorted by lattice cell x then z) order that file's own
// naturalFeaturesInRegion() dependency already guarantees. This function
// never re-sorts, re-wraps, or otherwise touches a single circle it is
// handed back.
export function treeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition }) {
    const minX = Math.min(currentPosition.x, requestedPosition.x) - CANDIDATE_QUERY_MARGIN;
    const maxX = Math.max(currentPosition.x, requestedPosition.x) + CANDIDATE_QUERY_MARGIN;
    const minZ = Math.min(currentPosition.z, requestedPosition.z) - CANDIDATE_QUERY_MARGIN;
    const maxZ = Math.max(currentPosition.z, requestedPosition.z) + CANDIDATE_QUERY_MARGIN;

    return treeCollisionGeometryInRegion(seed, minX, minZ, maxX, maxZ);
}

// Deliberately not yet: collision DETECTION of any kind (does a returned
// circle actually intersect the avatar — core/AvatarTreeCollision.js's
// own job, already done); collision RESPONSE or movement RESOLUTION
// (core/AvatarTreeMovement.js's own job, already done); a spatial index
// of any kind (QuadTree, R-Tree, hash grid, or any persisted structure —
// see this file's own header for why); a second "tree circles in a
// region" function distinct from
// core/TreeCollisionGeometry.js#treeCollisionGeometryInRegion() — this
// file only ever decides which region to ask that one function about;
// wiring this file into application/AvatarMovementConstraint.js,
// application/AvatarTerrainConstraint.js, or the World View avatar update
// loop in any way (a separate integration seam, deliberately left for a
// later milestone — 0.9.63); mutating `currentPosition`, `requestedPosition`,
// or any returned circle; a richer result than a plain array of circles
// (no "distance to avatar," no "was this expanded for by margin or by raw
// rectangle" flag); vertical (Y) movement, standing, falling, jumping, or
// gravity of any kind; a physics engine, velocity, acceleration, or mass;
// tree destruction, harvesting, or any other interaction; damage,
// animation changes, sound, networking, persistence, and any Publication
// integration. No existing file — core/NaturalFeatureField.js,
// core/TreeCollisionGeometry.js, core/AvatarTreeCollision.js,
// core/AvatarTreeMovement.js, core/AvatarCollision.js,
// application/AvatarMovementConstraint.js, and
// application/AvatarTerrainConstraint.js included — is modified by this
// milestone; none of them import or reference
// core/AvatarTreeCollisionQuery.js. See docs/Roadmap.md, 0.9.62, for the
// full list.
