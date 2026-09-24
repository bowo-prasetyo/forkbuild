// Pure avatar-wildlife collision SPATIAL QUERY for World View — the direct
// structural twin of core/AvatarTreeCollisionQuery.js, applied to
// core/WildlifeCollisionGeometry.js instead of core/TreeCollisionGeometry.js:
//
//   core/WildlifeCollisionGeometry.js    = "What physical space does an animal occupy?"
//   core/AvatarWildlifeCollisionQuery.js = "Which animals are worth asking about?"
//
// wildlifeCollisionCandidatesForMovement({ seed, currentPosition,
// requestedPosition, avatarRadius }) is a PURE function of exactly its own
// arguments — no Math.random, no Date.now, no persisted state, no spatial
// index of any kind. It answers ONE question: given an avatar moving from
// `currentPosition` toward `requestedPosition`, which animal collision
// circles could possibly matter? It never answers whether any of them
// actually collide and never resolves the requested movement against them
// — see core/AvatarTreeCollisionQuery.js's own header for the identical
// reasoning behind that split, restated here for animals.
//
// This file performs NO second animal-placement or animal-geometry
// computation of its own — it computes an expanded axis-aligned query
// rectangle from `currentPosition` and `requestedPosition`, then hands that
// rectangle straight to
// core/WildlifeCollisionGeometry.js#wildlifeCollisionGeometryInRegion(seed,
// minX, minZ, maxX, maxZ), the exact same region-level entry point that
// file already established.
//
// Deliberately NOT a spatial index — see
// core/AvatarTreeCollisionQuery.js's own header for why: a straightforward
// expanded-rectangle query is the entire semantic requirement here too.

import { wildlifeCollisionGeometryInRegion, ANIMAL_COLLISION_RADIUS } from './WildlifeCollisionGeometry.js';
import { AVATAR_COLLISION_RADIUS } from './AvatarCollision.js';

// core/WildlifeField.js's own `feature.scale` range is fixed at [0.85,
// 1.15) — re-stated here as a literal, deliberately never imported,
// matching core/AvatarTreeCollisionQuery.js#MAX_TREE_COLLISION_SCALE's own
// identical precedent.
const MAX_WILDLIFE_COLLISION_SCALE = 1.15;

// The largest possible radius of any animal collision circle
// core/WildlifeCollisionGeometry.js can ever produce, at the largest base
// per-species radius and the top of the shared scale range.
const LARGEST_BASE_ANIMAL_COLLISION_RADIUS = Math.max(...Object.values(ANIMAL_COLLISION_RADIUS));
export const MAX_ANIMAL_COLLISION_RADIUS = LARGEST_BASE_ANIMAL_COLLISION_RADIUS * MAX_WILDLIFE_COLLISION_SCALE;

// How far, on every side, the raw swept-movement rectangle must be
// expanded before it is safe to hand to
// wildlifeCollisionGeometryInRegion() — the SUM of both radii, matching
// core/AvatarTreeCollisionQuery.js#CANDIDATE_QUERY_MARGIN's own identical
// reasoning. This is the WALK-default margin; a call with a caller-supplied
// `avatarRadius` computes its own margin fresh, never this fixed constant.
export const CANDIDATE_QUERY_MARGIN = AVATAR_COLLISION_RADIUS + MAX_ANIMAL_COLLISION_RADIUS;

// The one entry point. `currentPosition` and `requestedPosition` are plain
// `{ x, y, z }` positions — exactly what a caller already holds immediately
// before calling core/AvatarTreeMovement.js#resolveAvatarTreeMovement({
// currentPosition, requestedPosition, trees, avatarRadius }), reused here
// unchanged (that function is generic over any `{ center, radius }` circle
// — see this file's own sibling, application/avatar/AvatarWildlifeConstraint.js,
// for where the two compose):
//
//   const animals = wildlifeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition, avatarRadius });
//   const resolved = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: animals, avatarRadius });
//
// `avatarRadius` (optional, defaults to AVATAR_COLLISION_RADIUS) — the
// horizontal collision radius of whatever body is actually sweeping this
// path, the same seam core/AvatarTreeCollisionQuery.js's own
// `avatarRadius` argument already establishes.
export function wildlifeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition, avatarRadius = AVATAR_COLLISION_RADIUS }) {
    const margin = avatarRadius + MAX_ANIMAL_COLLISION_RADIUS;
    const minX = Math.min(currentPosition.x, requestedPosition.x) - margin;
    const maxX = Math.max(currentPosition.x, requestedPosition.x) + margin;
    const minZ = Math.min(currentPosition.z, requestedPosition.z) - margin;
    const maxZ = Math.max(currentPosition.z, requestedPosition.z) + margin;

    return wildlifeCollisionGeometryInRegion(seed, minX, minZ, maxX, maxZ);
}
