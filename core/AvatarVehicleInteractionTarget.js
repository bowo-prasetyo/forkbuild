import { VehiclePresence } from './VehiclePresence.js';
import { withinRadiusXZ, VEHICLE_INTERACTION_RADIUS } from './AvatarVehicleProximity.js';
import { AvatarVehicleInteractionIntent } from './AvatarVehicleInteractionIntent.js';

// 0.9.76 — Avatar-Vehicle Interaction Target Resolution.
//
// Three independent facts now exist, each answering exactly one question
// and none of them combined:
//
//   Proximity = "Can I interact with THIS vehicle?"        (0.9.73)
//   Identity  = "WHICH vehicle, stably, is this?"           (0.9.74)
//   Intent    = "I am asking to interact with A vehicle."   (0.9.75)
//
// None of them says which vehicle, if any, an in-flight MOUNT request
// actually targets when several vehicles happen to be nearby. That is
// this milestone's one job:
//
//   resolveAvatarVehicleInteractionTarget({
//       avatarPosition, vehicles, interactionIntent
//   }) -> { targetVehicleId }
//
// This is deliberately the FIRST seam that reads all three facts at
// once. Combining them any earlier — inside 0.9.73's own proximity
// check, or inside 0.9.75's own intent transition — would have meant
// guessing at a selection policy before either milestone had a real
// consumer for one; both of those files' own headers say so explicitly
// (see core/AvatarVehicleProximity.js, "Deliberately not yet:
// nearestVehicleToAvatar()"; core/AvatarVehicleInteractionIntent.js,
// "Deliberately NOT vehicle-aware"). This file is that consumer.
//
// resolveAvatarVehicleInteractionTarget() is a PURE function of exactly
// its own arguments — no Math.random, no Date.now, no persisted state,
// no memory of a previous call. The same avatar position, the same
// vehicle list, and the same intent always produce the same target.
//
// THE POLICY, IN ORDER:
//
//   1. interactionIntent !== MOUNT -> no target. An interaction target
//      is meaningless without a live request to target something FOR.
//   2. No vehicles at all -> no target.
//   3. Vehicles outside core/AvatarVehicleProximity.js's own
//      VEHICLE_INTERACTION_RADIUS are excluded from consideration
//      entirely — reusing withinRadiusXZ() rather than recomputing the
//      identical X/Z distance math a second time in this file. A vehicle
//      the avatar cannot reach cannot be targeted, regardless of how a
//      tie-break might otherwise favor it.
//   4. Among the remaining, eligible candidates: the NEAREST one wins,
//      by the same squared X/Z distance withinRadiusXZ() already
//      computes internally (recomputed here for RANKING, not merely a
//      boolean, since "in range" and "nearest among several in range"
//      are different questions that happen to share one distance
//      formula).
//   5. An exact distance tie between two or more candidates is broken by
//      ascending lexical order of their 0.9.74 vehicle id. Two vehicles
//      cannot occupy the same lattice cell (core/VehiclePlacement.js
//      places at most one per cell), so a real tie is already vanishingly
//      rare in practice — but "vanishingly rare" is not "impossible," and
//      an UNSPECIFIED tie-break would make the result depend on
//      candidate array order, which this file's own tests (Section I)
//      prove it never does.
//
// Y IS IGNORED, exactly like core/AvatarVehicleProximity.js's own
// withinRadiusXZ(): a bicycle's Y is a terrain sample, not a meaningful
// interaction boundary, and nothing about SELECTING among several
// candidates changes that.
//
// DELIBERATELY NOT DIRECTIONAL. Exactly like 0.9.73's own header
// ("Deliberately NOT directional"), this file never asks whether the
// avatar is FACING a candidate vehicle. An avatar standing between two
// bicycles, looking at neither, can still target the nearer one.
// Facing-aware disambiguation is a real future refinement for when
// several vehicles are equidistant from a specific approach angle, but
// inventing it now — with no consumer asking for it — would mix a new
// spatial policy into a milestone whose brief is exactly "nearest
// eligible candidate, deterministic tie-break," nothing more.
//
// RETURNS AN ID, NEVER THE VehiclePresence ITSELF. This is precisely
// what 0.9.74 exists for: a stable name a caller can hold onto (to pass
// to a future mount transition, to look up again later) without pinning
// a reference to a specific, disposable VehiclePresence instance that a
// fresh vehiclePresenceInRegion() call will reconstruct as a DIFFERENT
// object on its very next invocation (see core/VehicleIdentity.js's own
// header). `{ targetVehicleId: null }` — never `undefined`, never a
// missing key — represents "no target," the same explicit-null
// convention this codebase already uses wherever "nothing" is itself a
// meaningful, always-present result rather than an absent field.
//
// DELIBERATELY NO PERSISTENT TARGET STATE. This file introduces no
// `avatar.targetVehicleId` and no `vehicle.targetedByAvatar` — the
// milestone brief is explicit that a resolved target is an EVALUATION
// RESULT, recomputed fresh on demand, not persistent world state. A
// future mounting milestone decides whether and how a resolved target
// ever becomes a stored fact; this file only ever answers the question
// for the instant it is asked.

function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteXZPosition(position) {
    return position !== null
        && typeof position === 'object'
        && isFiniteCoordinate(position.x)
        && isFiniteCoordinate(position.z);
}

function squaredDistanceXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
}

// The one entry point. See this file's own header for the exact,
// ordered policy this function implements.
export function resolveAvatarVehicleInteractionTarget({ avatarPosition, vehicles, interactionIntent } = {}) {
    if (!isFiniteXZPosition(avatarPosition)) {
        throw new Error('resolveAvatarVehicleInteractionTarget requires an avatarPosition with finite numeric x and z');
    }
    if (!Array.isArray(vehicles)) {
        throw new Error('resolveAvatarVehicleInteractionTarget requires a vehicles array');
    }
    for (const vehicle of vehicles) {
        if (!(vehicle instanceof VehiclePresence)) {
            throw new Error('resolveAvatarVehicleInteractionTarget requires every entry in vehicles to be a VehiclePresence instance');
        }
    }

    if (interactionIntent !== AvatarVehicleInteractionIntent.MOUNT) {
        return { targetVehicleId: null };
    }

    let best = null;
    let bestDistance = Infinity;
    for (const vehicle of vehicles) {
        if (!withinRadiusXZ(avatarPosition, vehicle.position, VEHICLE_INTERACTION_RADIUS)) {
            continue;
        }
        const distance = squaredDistanceXZ(avatarPosition, vehicle.position);
        if (
            best === null
            || distance < bestDistance
            || (distance === bestDistance && vehicle.id < best.id)
        ) {
            best = vehicle;
            bestDistance = distance;
        }
    }

    return { targetVehicleId: best === null ? null : best.id };
}

// Deliberately not yet: facing/directional disambiguation (see this
// file's own header, "Deliberately NOT directional"); persistent target
// state of any kind on either an avatar or a vehicle (see "Deliberately
// no persistent target state"); mounting or dismounting as an actual
// world effect; an avatar-vehicle relationship field; a per-vehicle-type
// interaction radius (this file simply reuses
// core/AvatarVehicleProximity.js's own single VEHICLE_INTERACTION_RADIUS,
// exactly as that file's own header already scoped it); keyboard or
// controller input; rendering or animation; vehicle or avatar movement;
// collision or physics; persistence; networking; randomness; the clock.
// See docs/Roadmap.md, 0.9.76, for the full list.
