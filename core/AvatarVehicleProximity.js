import { VehiclePresence } from './VehiclePresence.js';

// 0.9.73 — Avatar-Vehicle Proximity Detection.
//
// 0.9.71 named what it means for a vehicle to exist somewhere
// (core/VehiclePresence.js — a type and a position). 0.9.72 answered
// where the World View actually gets one (core/VehiclePlacement.js —
// deterministic, seeded placement). Neither says anything about
// whether an avatar can currently DO anything with a vehicle it has
// found — that question was deliberately left for this milestone, the
// same way core/AvatarTreeCollision.js was deliberately left open by
// core/TreeCollisionGeometry.js/core/NaturalFeatureField.js until its
// own milestone. This file answers exactly one narrow question:
//
//   avatarVehicleProximity(avatarPosition, vehiclePresence)
//     -> "is this avatar within interaction range of this vehicle?"
//
// Deliberately NOT collision. core/AvatarTreeCollision.js answers "are
// these two physical footprints overlapping" — a question about
// PHYSICAL SPACE, resolved against a movement step so an avatar is
// never allowed to walk through a trunk. Proximity answers "is this
// object within interaction reach" — a question about INTERACTION
// RANGE, which is deliberately larger than either object's own
// physical footprint (an avatar can be close enough to mount a
// bicycle a full meter before its own collision circle would ever
// touch the bicycle's). Reusing AvatarTreeCollision's machinery here,
// or calling into the bicycle's own future collision geometry, would
// quietly conflate two different questions that this file's own
// milestone brief is explicit about keeping separate — see
// docs/Roadmap.md, 0.9.73.
//
// avatarVehicleProximity() and its own withinRadiusXZ() primitive are
// PURE functions of exactly their own arguments — no Math.random, no
// Date.now, no persisted state, no lookup of "which vehicle is
// nearest." The same position and the same VehiclePresence always
// produce the same fact, and this file never chooses BETWEEN several
// candidate vehicles — see this file's own "Deliberately not yet"
// footer for why nearestVehicleToAvatar() is explicitly not built
// here: which vehicle to prefer when several are in range is an
// interaction-POLICY question this milestone does not yet have an
// answer to, and inventing one now would be guessing.
//
// Horizontal (X/Z) only, exactly like core/AvatarTreeCollision.js's
// own circles: a bicycle is a ground vehicle, and its Y coordinate
// (core/VehiclePlacement.js's own terrainHeightAt() sample) is terrain
// elevation, not a meaningful interaction boundary. An avatar standing
// on a slightly different point of the same slope as a nearby bicycle
// must not be excluded from interacting with it merely because terrain
// sampling gave the two of them slightly different Y values.
//
// Deliberately NOT directional. This file never asks whether the
// avatar is FACING the vehicle, or approaching from a particular side
// — those are interaction-policy questions for a future mounting
// milestone to answer, exactly as this file's own milestone brief
// requires. "Spatially close enough" is the entire question this seam
// answers.

function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteXZPosition(position) {
    return position !== null
        && typeof position === 'object'
        && isFiniteCoordinate(position.x)
        && isFiniteCoordinate(position.z);
}

// How close an avatar must be to a vehicle, on the horizontal X/Z
// plane, to be within interaction range of it — the ONE constant this
// entire seam is built around, deliberately established HERE rather
// than as a field on core/VehiclePresence.js. VehiclePresence answers
// "what vehicle, and where" (0.9.71's own header is explicit that it
// is not a policy object); an interaction radius is a policy fact
// about how CLOSE is close enough, which belongs at the seam that
// actually performs the proximity check, not baked into the thing
// being checked.
//
// 1.5 meters: large enough that an avatar can be interacting-distance
// from a bicycle without their own collision circles ever touching —
// AVATAR_COLLISION_RADIUS (core/AvatarCollision.js) is 0.35, so 1.5
// leaves well over a meter of approach room before physical contact
// would even be possible — and small enough that "within range" still
// reads as "standing next to it," not "somewhere in the same field."
// A single global radius, not a per-vehicle-type table: every vehicle
// this codebase can currently place (core/VehiclePlacement.js) is a
// BICYCLE, and nothing yet distinguishes how close interacting with a
// future MOTORCYCLE/CAR/DRONE ought to require — inventing a per-type
// table now would be guessing at a distinction no consumer has asked
// for yet, the same restraint core/VehiclePlacement.js's own density
// gate already applies uniformly across zones for the identical
// reason.
export const VEHICLE_INTERACTION_RADIUS = 1.5;

// The generic, reusable primitive underneath avatarVehicleProximity()
// below — deliberately factored out exactly the way
// core/AvatarTreeCollision.js#circlesIntersect() is generic over any
// two "{center, radius}" shapes rather than being avatar/tree-specific.
// "Is point A within `radius` of point B, on the horizontal X/Z plane"
// is not a vehicle-specific question, and a future proximity check
// against some other object kind (an NPC, an item, a doorway) should
// be able to reuse this primitive without this file growing a second,
// near-identical distance check for each new kind.
//
// `<=`, not `<`, matching core/AvatarTreeCollision.js#circlesIntersect()'s
// own inclusive-boundary convention: exactly at the radius counts as
// within range, so a caller who computes "distance === radius" never
// gets a false negative from float noise nudging it a hair past.
//
// Squared-distance comparison, avoiding an unnecessary Math.sqrt on
// every call — the same "compare squared distance to squared radius"
// discipline circlesIntersect() already uses.
export function withinRadiusXZ(a, b, radius) {
    if (!isFiniteXZPosition(a)) {
        throw new Error('withinRadiusXZ requires a position with finite numeric x and z');
    }
    if (!isFiniteXZPosition(b)) {
        throw new Error('withinRadiusXZ requires a position with finite numeric x and z');
    }
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return (dx * dx + dz * dz) <= radius * radius;
}

// The one per-vehicle entry point. Deliberately returns only
// `{ withinRange }` — no distance, no direction, no side, no nearest-
// point — matching this milestone's own brief: prefer the boolean
// alone unless a real consumer needs the distance. Takes the whole
// VehiclePresence, not merely its position, so a future per-vehicle-
// type interaction radius could be added at this one seam without
// changing the call signature every existing caller already depends
// on — even though today every VehiclePresence is checked against the
// identical VEHICLE_INTERACTION_RADIUS regardless of its own type.
//
// avatarPosition is deliberately duck-typed (any `{x, z}`-bearing
// value — a Position instance, an AvatarPresence's own `.position`,
// or a plain object), matching core/AvatarTreeCollision.js's own
// avatarCollisionCircleAt() precedent, rather than requiring a
// specific class this file has no other reason to import.
export function avatarVehicleProximity(avatarPosition, vehiclePresence) {
    if (!(vehiclePresence instanceof VehiclePresence)) {
        throw new Error('avatarVehicleProximity requires a VehiclePresence instance');
    }
    return {
        withinRange: withinRadiusXZ(avatarPosition, vehiclePresence.position, VEHICLE_INTERACTION_RADIUS)
    };
}

// Deliberately not yet: collision of any kind, or reuse of
// core/AvatarTreeCollision.js or any future bicycle collision geometry
// (see this file's own header, "Deliberately NOT collision");
// directionality/facing/approach-side (see this file's own header,
// "Deliberately NOT directional"); nearestVehicleToAvatar() or any
// other form of vehicle SELECTION among several in-range candidates —
// that is an interaction-policy question this milestone does not
// answer, left for whatever mounting milestone actually needs it; a
// per-vehicle-type interaction radius table; mounting, dismounting, or
// any avatar-vehicle relationship state; keyboard/controller input;
// rendering or animation; vehicle movement of any kind; mutating a
// VehiclePresence or an avatar position; persistence, networking,
// randomness, or wall-clock time. See docs/Roadmap.md, 0.9.73, for the
// full list.
