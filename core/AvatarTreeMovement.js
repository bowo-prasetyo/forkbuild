// Pure avatar-tree collision RESOLUTION for World View — see
// docs/Roadmap.md, 0.9.61, "Avatar-Tree Collision Resolution," and
// core/AvatarTreeCollision.js's own header for the detection half of this
// pair:
//
//   core/TreeCollisionGeometry.js = "What physical space does a tree occupy?"
//   core/AvatarTreeCollision.js   = "Does the avatar's own space overlap it?"
//   core/AvatarTreeMovement.js    = "Given that, where may the avatar move?"
//
// resolveAvatarTreeMovement() is a PURE function of already-resolved
// geometric facts — a current position, a requested position, and a list
// of already-selected tree collision circles (exactly
// core/TreeCollisionGeometry.js#treeCollisionCircleFor()'s own output
// shape) — never of a seed, a region, or a rendering object. It does not
// discover which trees exist near the avatar (that is a spatial-query
// concern, deliberately left to a later milestone — see this file's own
// "Deliberately not yet" footer); it only resolves a requested step
// against the blocking circles it is handed.
//
// The response is a SLIDE, never a dead stop — the same "slide along the
// obstacle's own boundary, don't just freeze" feel
// core/AvatarCollision.js#resolveHorizontalMovement() already gives brick
// collision, adapted from that function's axis-separated approach to a
// circle's own radial/tangential split, since a circle (unlike an
// axis-aligned box) has no natural X/Z axis of its own to separate along.
// Approaching a tree diagonally removes only the component of movement
// that would carry the avatar INTO the tree; the component running
// alongside its boundary passes through untouched.
//
// This file returns a resolved POSITION — `{ x, y, z }` — never a status
// vocabulary (`BLOCKED`/`COLLIDING`/`SLIDING`/`PUSHED`). Those describe
// behavior; a position is the one geometric fact that behavior produces,
// and the one thing every caller actually needs. `y` is passed through
// from `requestedPosition` completely untouched — exactly as
// core/AvatarTreeCollision.js's own circles are purely horizontal, tree
// collision here is a horizontal (X/Z) concern only; standing, falling,
// and jumping remain entirely core/AvatarMovementSimulation.js's own.
//
// Never mutates `currentPosition`, `requestedPosition`, or any entry in
// `trees` — every input is read, never written, and the function has no
// side effect beyond its own return value. That purity is what makes this
// file trivially testable without an avatar, a renderer, or a running
// World View at all, and keeps its output exactly as deterministic as its
// inputs: the same three arguments always resolve to the same position.

import { AVATAR_COLLISION_RADIUS } from './AvatarCollision.js';

// Resolves ONE requested step against ONE blocking circle, from a FIXED
// `current` origin. Two cases, unified by the same radial/tangential
// split described in this file's own header:
//
//   1. The avatar does not already overlap `tree` at `current` — sweep
//      the segment from `current` to `requested` and find the first
//      point (if any) where the avatar's own combined radius would touch
//      the tree's boundary. If the segment never gets that close, the
//      full requested step is unobstructed.
//   2. The avatar already overlaps `tree` at `current` (0.9.60's own
//      touching-counts-as-colliding rule, `<=` not `<` — see this
//      function's own `combinedRadiusSq` check below) — there is no
//      earlier "first contact" to find, since contact already happened
//      before this step began. Resolve directly from `current` instead.
//
// Both cases then apply the identical rule from their own contact point:
// strip only the component of the REMAINING movement that points further
// INTO the tree (a negative dot product against the outward normal at
// that contact point); a component pointing away from, or tangential to,
// the tree passes through untouched. That single rule is what both lets
// the avatar slide around a tree it is walking into (case 1) and still
// walk AWAY from a tree it started touching (case 2, `radial >= 0`) —
// collision geometry never becomes a permanent attachment.
// `avatarRadius` — the horizontal radius of whatever body is actually
// moving. Passed straight through from resolveAvatarTreeMovement()'s own
// `avatarRadius` argument (0.9.88) — see that function's own header.
function resolveAgainstTree(current, requested, tree, avatarRadius) {
    const combinedRadius = tree.radius + avatarRadius;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    const startDx = current.x - tree.center.x;
    const startDz = current.z - tree.center.z;
    const startDistSq = startDx * startDx + startDz * startDz;

    let contactX = current.x;
    let contactZ = current.z;
    let remainingX = requested.x - current.x;
    let remainingZ = requested.z - current.z;

    if (startDistSq > combinedRadiusSq) {
        // Not already touching — find the first point along [current,
        // requested] (if any) where the avatar's combined radius would
        // reach the tree's boundary, via the standard ray-circle
        // intersection: solve |current + t*d - tree.center| ===
        // combinedRadius for the smallest t in [0, 1].
        const dx = remainingX;
        const dz = remainingZ;
        const a = dx * dx + dz * dz;
        if (a === 0) {
            // No movement requested at all — nothing to resolve.
            return { x: requested.x, z: requested.z };
        }
        const b = 2 * (startDx * dx + startDz * dz);
        const c = startDistSq - combinedRadiusSq; // > 0, confirmed above
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) {
            // The infinite line never comes within combinedRadius of the
            // tree at all — the full requested step is unobstructed.
            return { x: requested.x, z: requested.z };
        }
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t = (-b - sqrtDiscriminant) / (2 * a);
        if (t < 0 || t > 1) {
            // Closest approach happens before this step starts or after
            // it ends — this step alone never reaches the boundary.
            return { x: requested.x, z: requested.z };
        }
        contactX = current.x + t * dx;
        contactZ = current.z + t * dz;
        remainingX = requested.x - contactX;
        remainingZ = requested.z - contactZ;
    }

    let normalX = contactX - tree.center.x;
    let normalZ = contactZ - tree.center.z;
    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength === 0) {
        // Degenerate: the contact point sits exactly on the tree's own
        // center (a zero-radius tree at the avatar's exact position, or
        // similar). No outward direction is well-defined — hold position
        // rather than guess one.
        return { x: contactX, z: contactZ };
    }
    normalX /= normalLength;
    normalZ /= normalLength;

    const radial = remainingX * normalX + remainingZ * normalZ;
    if (radial >= 0) {
        // The remaining movement points away from, or exactly tangential
        // to, the tree — entirely unobstructed from the contact point on.
        return { x: contactX + remainingX, z: contactZ + remainingZ };
    }

    // Strip only the inward radial component; the tangential component
    // (the part of `remaining` perpendicular to `normal`) passes through
    // untouched, producing the slide.
    return {
        x: contactX + (remainingX - radial * normalX),
        z: contactZ + (remainingZ - radial * normalZ)
    };
}

// The one entry point. `trees` is an array of already-selected blocking
// circles — exactly core/TreeCollisionGeometry.js#treeCollisionCircleFor()'s
// own `{ center: { x, z }, radius, ... }` shape, or any other shape
// carrying those same two fields. This function never queries which trees
// exist near the avatar itself (see this file's own "Deliberately not
// yet" footer) — a caller assembles that list and hands it here, the same
// "core resolves geometry/math, a separate layer supplies the data" split
// core/AvatarCollision.js's own header already establishes for
// `resolveHorizontalMovement()`'s own `obstacles` argument.
//
// Multiple trees are resolved against, in SUPPLIED ORDER, one at a time
// — each tree's resolved candidate position becomes the next tree's own
// `requested` position, while `currentPosition` stays fixed as the
// origin throughout. This is a deliberately simple, deterministic rule,
// not a general multi-obstacle physics solver: the same `trees` array, in
// the same order, always resolves to the same final position, and a
// caller that wants a different resolution order gets it by supplying
// `trees` in that order.
//
// `avatarRadius` (0.9.88, optional, defaults to AVATAR_COLLISION_RADIUS)
// — the horizontal radius of whatever body is actually moving: the
// walking avatar's own existing radius by default, or a mounted ground
// vehicle's own, larger `AvatarVehicleMovementCapability#collisionRadius`
// when a caller supplies one — the SAME value a caller must also pass as
// core/AvatarTreeCollisionQuery.js#treeCollisionCandidatesForMovement()'s
// own `avatarRadius`, so the candidate set this function's own `trees`
// argument was built from, and the radius it resolves against here,
// never disagree (see that function's own 0.9.88 header for why a
// mismatch there would silently drop real collisions). Omitting
// `avatarRadius` reproduces the exact pre-0.9.88 resolution, byte for
// byte — see tests/AvatarTreeMovement.test.js's own regression section.
export function resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees, avatarRadius = AVATAR_COLLISION_RADIUS }) {
    let x = requestedPosition.x;
    let z = requestedPosition.z;

    for (const tree of trees) {
        const resolved = resolveAgainstTree(currentPosition, { x, z }, tree, avatarRadius);
        x = resolved.x;
        z = resolved.z;
    }

    return { x, y: requestedPosition.y, z };
}

// Deliberately not yet: a region-level "which trees does this avatar need
// to be tested against" spatial query (0.9.62's own job — see
// docs/Roadmap.md, 0.9.61); wiring this file into
// application/AvatarMovementConstraint.js, application/
// AvatarTerrainConstraint.js, or the World View avatar update loop in any
// way (a separate integration seam, deliberately left for a later
// milestone so the geometric machinery here stays testable without the
// entire UI/runtime); a general world-object collision resolution
// spanning terrain, trees, and future object kinds (0.9.62 and beyond); a
// true multi-obstacle physics solver that reconciles resolution order
// (explicitly deferred — see this file's own header); mutating an avatar
// object or any other side effect — this file only ever computes and
// returns a position; a richer result vocabulary
// (`BLOCKED`/`COLLIDING`/`SLIDING`/`PUSHED` or similar — this file's own
// header explains why a plain position is preferred); vertical (Y)
// movement, standing, falling, jumping, or gravity of any kind; a physics
// engine, velocity, acceleration, or mass; tree destruction, harvesting,
// or any other interaction; and importing core/NaturalFeatureField.js,
// core/TreeCollisionGeometry.js, any renderer, Three.js, or any avatar
// movement/simulation module beyond core/AvatarCollision.js's own
// AVATAR_COLLISION_RADIUS constant. See docs/Roadmap.md, 0.9.61, for the
// full list.
