import { avatarCollisionCircleAt, avatarTreeCollision } from './AvatarTreeCollision.js';

// 0.9.81 — Vehicle Dismount Destination Clearance.
//
// 0.9.80 (core/AvatarVehicleDismountPosition.js) answered "where would
// the avatar land if it dismounted this vehicle," and stopped there —
// that file's own header is explicit that a resolved candidate "could,
// in principle, land in water or overlap something else," and defers
// occupancy validation to "a later seam, once a real consumer needs
// it." This milestone is that seam, and only that seam:
//
//   Is the resolved dismount position safe for the avatar to occupy?
//
//   isAvatarVehicleDismountPositionClear({ position, treeCollisions })
//     -> { clear: boolean }
//
// A DISTINCT QUESTION FROM POSITION RESOLUTION. 0.9.80 computes a
// candidate; this file judges it. Neither knows about the other:
// this file never imports core/AvatarVehicleDismountPosition.js, never
// reads a VehiclePresence, and has no opinion on how a candidate
// position was produced — it only ever answers whether a GIVEN
// position is one the avatar could actually stand on.
//
// NO NEW COLLISION SYSTEM. The avatar is the object whose occupancy
// matters here, and this codebase already has exactly one detector
// capable of answering "does the avatar's own space overlap something"
// — core/AvatarTreeCollision.js. This file is an adapter/composition
// boundary over that existing machinery, never a second one:
// avatarCollisionCircleAt() turns `position` into the same avatar
// circle core/AvatarTreeCollision.js already builds for movement, and
// avatarTreeCollision() is the same collides/doesn't-collide test
// core/AvatarTreeMovement.js and application/AvatarTreeConstraint.js
// already trust. No new geometric convention, no new circle math, no
// second AVATAR_COLLISION_RADIUS, is introduced here.
//
// TREE CLEARANCE ONLY, ON PURPOSE. This codebase's only obstacle
// system a dismounting avatar could actually be tested against today
// is trees (core/TreeCollisionGeometry.js). There is no building
// clearance, vehicle clearance, dynamic-entity collision, or generic
// walkability query anywhere in this codebase for this file to consult
// — inventing a generic "obstacle registry" now, merely so this
// milestone could claim to validate "everything," would be building
// speculative infrastructure nothing has asked for. If the world
// eventually gains another obstacle kind, that obstacle's own
// clearance contribution is a later seam to ADD here (or compose
// alongside this file at a call site), never something to guess at
// now. See docs/Roadmap.md, 0.9.81, "Deliberately postponed."
//
// ALREADY-RESOLVED CANDIDATES, NOT A SEED. `treeCollisions` is an
// array of already-selected tree collision circles — exactly the same
// shape core/AvatarTreeMovement.js#resolveAvatarTreeMovement()'s own
// `trees` argument already takes (core/TreeCollisionGeometry.js's own
// `{ center: { x, z }, radius, ... }` circles, or
// core/AvatarTreeCollisionQuery.js#treeCollisionCandidatesForMovement()'s
// identical output). This file never accepts a `seed` and never calls
// treeCollisionCandidatesForMovement() or treeCollisionGeometryInRegion()
// itself — the same "core resolves geometry/math from data it is
// handed, a separate layer supplies that data" split
// core/AvatarTreeMovement.js's own header already establishes, and the
// same reason core/AvatarTreeCollisionQuery.js (the query),
// core/AvatarTreeCollision.js (the detector), and
// core/AvatarTreeMovement.js (the resolver) have never been collapsed
// into one file: query and detection stay two separately testable
// concerns, and only an application-layer caller (mirroring
// application/AvatarTreeConstraint.js's own existing composition of
// exactly those two pieces) ever combines them with a real seed.
//
// HORIZONTAL (X/Z) ONLY — Y IS NEVER CONSULTED. `position.y` is read
// nowhere in this file. core/AvatarVehicleDismountPosition.js's own
// resolved Y is always `0` (its own header, "Y is never copied from
// the vehicle"), and core/AvatarTreeCollision.js's own circles are
// already a purely horizontal shape — a tree trunk that blocks the
// full height an avatar could stand at, not a height-bounded box. A
// dismount candidate and a tree collision circle at different,
// unrelated Y values must never make a genuine horizontal overlap
// read as clear merely because this file went looking at Y at all.
//
// CONTACT COUNTS AS BLOCKED, THE SAME BOUNDARY CONVENTION EVERY
// SIBLING ALREADY USES. avatarTreeCollision() itself already treats
// `distance <= avatarRadius + treeRadius` as a collision
// (core/AvatarTreeCollision.js#circlesIntersect()'s own `<=`, not
// `<`) — this file introduces no separate, looser or stricter
// boundary rule of its own.
//
// PURE AND NON-MUTATING. isAvatarVehicleDismountPositionClear() reads
// `position` and `treeCollisions` and returns a fresh result — no
// Math.random, no Date.now, no persisted state, and neither the
// position nor any tree circle it is handed is ever written to. The
// same position and the same tree circles always produce the same
// answer.
//
// MINIMAL RESULT, MIRRORING 0.9.73's OWN PROXIMITY SEAM
// (core/AvatarVehicleProximity.js's own `{ withinRange }`). Just
// `{ clear: true }` or `{ clear: false }` — no collision object, no
// blocking tree, no penetration depth, no distance. The caller only
// ever needs the semantic fact: can the avatar occupy this position?
// Which tree (if any) is responsible is core/AvatarTreeCollision.js's
// own concern, already answerable by a caller that wants it, not
// something this file re-exposes.
//
// NO DISMOUNT TRANSITION HERE. This file never imports
// core/AvatarVehicleMount.js, core/AvatarVehicleMountTransition.js,
// or core/AvatarVehicleDismountIntent.js, never clears a mount, and
// never changes an avatar's stored position — only whether a given
// candidate position is safe to move an avatar to, if some future
// transition ever decides to.

function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteXZPosition(position) {
    return position !== null
        && typeof position === 'object'
        && isFiniteCoordinate(position.x)
        && isFiniteCoordinate(position.z);
}

// The one entry point. See this file's own header for the exact
// reasoning behind every deliberate choice below.
export function isAvatarVehicleDismountPositionClear({ position, treeCollisions } = {}) {
    if (!isFiniteXZPosition(position)) {
        throw new Error('isAvatarVehicleDismountPositionClear requires a position with finite numeric x and z');
    }
    if (!Array.isArray(treeCollisions)) {
        throw new Error('isAvatarVehicleDismountPositionClear requires treeCollisions to be an array of tree collision circles');
    }

    const avatarCircle = avatarCollisionCircleAt(position);
    for (const tree of treeCollisions) {
        if (avatarTreeCollision(avatarCircle, tree).collides) {
            return { clear: false };
        }
    }

    return { clear: true };
}

// Deliberately not yet: any vocabulary or dependency for the actual
// dismount TRANSITION (clearing AvatarVehicleMount, changing an
// avatar's stored position); mount-state awareness of any kind;
// dismount-intent awareness of any kind
// (core/AvatarVehicleDismountIntent.js); vehicle awareness of any kind
// (VehiclePresence, VehicleType, a vehicleId, or importing
// core/AvatarVehicleDismountPosition.js itself — this file judges a
// position, never a vehicle); a seed parameter or any call into
// core/AvatarTreeCollisionQuery.js/core/TreeCollisionGeometry.js — see
// this file's own header, "Already-resolved candidates, not a seed";
// any obstacle kind beyond trees (building clearance, vehicle
// clearance, dynamic-entity collision, a generic obstacle registry, a
// spatial index, a generic walkability system — see "Tree clearance
// only, on purpose"); a richer result than `{ clear }` (no blocking
// tree, no distance, no penetration depth); vehicle orientation or
// heading; keyboard/controller input of any kind; avatar or vehicle
// movement; animation; camera changes; rendering; networking;
// persistence; randomness; the clock. See docs/Roadmap.md, 0.9.81, for
// the full list.
