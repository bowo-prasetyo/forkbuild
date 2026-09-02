// Pure avatar-tree collision DETECTION for World View — see
// docs/Roadmap.md, 0.9.60, "Avatar-Tree Collision Detection," and
// core/TreeCollisionGeometry.js's own header for the physical-footprint
// half of this pair:
//
//   core/TreeCollisionGeometry.js = "What physical space does a tree occupy?"
//   core/AvatarTreeCollision.js   = "Does the avatar's own space overlap it?"
//
// circlesIntersect(a, b) and avatarTreeCollision(avatar, tree) are PURE
// functions of already-resolved geometric facts — a center and a radius —
// never of a seed, a feature record, or a rendering object. Neither
// function decides WHAT should happen once an overlap is found; they only
// report whether one exists. That is the entire scope of this milestone —
// see this file's own "Deliberately not yet" footer, and docs/Roadmap.md,
// 0.9.60, for the full "Deliberately postponed" list.
//
// avatarCollisionCircleAt(position) is the avatar-side counterpart to
// core/TreeCollisionGeometry.js#treeCollisionCircleFor(): it turns an
// already-known avatar position into the same "{ center: { x, z }, radius
// }" shape a tree circle already has, using core/AvatarCollision.js's own
// AVATAR_COLLISION_RADIUS — the SAME hitbox radius that module already
// uses for brick collision — rather than inventing a second, tree-specific
// avatar radius that could quietly drift out of agreement with it. Y is
// deliberately dropped, exactly as core/TreeCollisionGeometry.js's own
// circles drop it: both sides of this detector are a top-down, purely
// horizontal shape, matching a tree trunk that (for this milestone, same
// as core/AvatarCollision.js's own axis-aligned brick simplification)
// blocks the full height an avatar could stand at, not a height-bounded
// box.
//
// This file imports nothing from core/NaturalFeatureField.js,
// core/TreeCollisionGeometry.js, any renderer, or any avatar movement
// module — it never re-derives where a tree stands or decides what the
// avatar should do next, only whether two already-given circles overlap.
// A caller assembles both circles (a tree's from
// treeCollisionCircleFor()'s own output, the avatar's from
// avatarCollisionCircleAt() below) and hands them here; this file only
// ever consults the `center`/`radius` shape both already share, never the
// extra `kind`/`shape` fields treeCollisionCircleFor() also happens to
// return.

import { AVATAR_COLLISION_RADIUS } from './AvatarCollision.js';

// Circle-circle intersection via squared distance, avoiding an
// unnecessary Math.sqrt on every call — the standard "compare squared
// distance to squared combined radius" test. `<=`, not `<`: two circles
// exactly touching (distance equals the sum of their radii) count as a
// collision, the same way core/AvatarCollision.js's own
// aabbsOverlap()/resolveHorizontalMovement() treat an obstacle's own face
// as something the avatar cannot pass exactly through — a physical
// obstacle with a hairline gap at exact contact would let float noise
// carry the avatar a fraction of a unit past the boundary on the very
// next tick.
//
// Deliberately generic over any two "{ center: { x, z }, radius }"
// shapes, not avatar/tree-specific — this is the one reusable primitive
// docs/Roadmap.md, 0.9.62 ("World Object Collision Composition"), is
// expected to build on for a rock, a building, or any other circular
// footprint, without this file growing a second near-identical function
// for each new object kind.
export function circlesIntersect(a, b) {
    const dx = a.center.x - b.center.x;
    const dz = a.center.z - b.center.z;
    const combinedRadius = a.radius + b.radius;
    return (dx * dx + dz * dz) <= combinedRadius * combinedRadius;
}

// The one per-tree detection entry point. Deliberately returns only
// `{ collides }` — no penetration depth, no surface normal, no push
// vector, no resolved position, no blocked-movement flag. Every one of
// those belongs to 0.9.61's own movement-resolution step, decided from
// a REQUESTED movement step this file never sees; this file only ever
// sees two static circles and reports one fact about them.
export function avatarTreeCollision(avatar, tree) {
    return { collides: circlesIntersect(avatar, tree) };
}

// The avatar-side counterpart to treeCollisionCircleFor() — see this
// file's own header for why AVATAR_COLLISION_RADIUS (core/
// AvatarCollision.js), not a second tree-specific constant, sizes it.
export function avatarCollisionCircleAt(position) {
    return Object.freeze({
        center: Object.freeze({ x: position.x, z: position.z }),
        radius: AVATAR_COLLISION_RADIUS
    });
}

// Deliberately not yet: collision RESPONSE of any kind (stopping,
// sliding, pushing, or otherwise altering a requested movement step —
// 0.9.61's own job); a region-level "which trees does this avatar need
// to be tested against" query (a separate spatial-query concern, not
// this file's — see docs/Roadmap.md, 0.9.60); a generic world-object
// collision query spanning trees, terrain, and future object kinds
// (0.9.62); wiring this file into application/AvatarMovementConstraint.js
// or application/AvatarTerrainConstraint.js in any way; importing
// core/NaturalFeatureField.js, core/TreeCollisionGeometry.js, any
// renderer module, Three.js, or any avatar movement/simulation module;
// randomness, wall-clock time, persistence, or networking of any kind;
// and a richer collision-fact vocabulary (a second COLLISION_OBJECT_KIND
// or COLLISION_SHAPE of its own) — this file deliberately reads, never
// extends, the vocabularies core/TreeCollisionGeometry.js already
// established. See docs/Roadmap.md, 0.9.60, for the full list.
