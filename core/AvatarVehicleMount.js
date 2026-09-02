// 0.9.77 — Avatar-Vehicle Mount Relationship.
//
// Three independent facts existed before this milestone, none of them a
// relationship: proximity — is the avatar close enough to a given vehicle
// (0.9.73); identity — a stable name for a given vehicle (0.9.74); intent —
// did the avatar just ask to interact at all (0.9.75); and target — which
// single vehicle, if any, an in-flight MOUNT request currently resolves to
// (0.9.76). None of them PERSISTS anything. A resolved target is, by
// 0.9.76's own header, "an EVALUATION RESULT, recomputed fresh on demand —
// never stored world state." This milestone is the first one that stores
// anything at all:
//
//   Avatar X is mounted on vehicle Y.
//
// core/AvatarVehicleMount.js exports a small immutable descriptor for
// exactly that fact, and nothing about how it comes to be true.
//
//   createAvatarVehicleMount(vehicleId) -> AvatarVehicleMount
//   isValidAvatarVehicleMount(value)    -> boolean
//   clearAvatarVehicleMount()           -> null
//
// THE SMALLEST USEFUL STATE. The descriptor carries exactly one field —
// `vehicleId` — never `vehicleType`. A vehicle's type is already available
// from its own VehiclePresence (core/VehiclePresence.js); duplicating it
// here would let a mount relationship and its vehicle's own presence
// disagree about what the vehicle IS, for a value this file never needs to
// answer any question of its own. Exactly like 0.9.74's own VehicleIdentity
// names a vehicle without describing it, an AvatarVehicleMount names WHICH
// vehicle an avatar is mounted on without redescribing it.
//
// A VEHICLE IDENTITY, NEVER A VEHICLE OBJECT. `createAvatarVehicleMount`
// takes a plain vehicle id string — the same 0.9.74 `vehicle:<seed>:
// <cellX>,<cellZ>` id `resolveAvatarVehicleInteractionTarget()` already
// returns as `targetVehicleId` — never a VehiclePresence instance. This is
// exactly the discipline core/VehicleIdentity.js's own header established:
// a `vehiclePresenceInRegion()` call reconstructs its VehiclePresence
// instances from nothing on every invocation, so the SAME conceptual
// vehicle is a different object on every query. A mount relationship that
// held a VehiclePresence reference would go stale the moment that object is
// discarded and rebuilt; holding the id instead means the relationship
// stays meaningful even when `old VehiclePresence` and `new VehiclePresence`
// are two different JavaScript objects describing the same vehicle slot.
//
// ABSENCE IS `null`, NEVER A SENTINEL. Exactly like this codebase's
// existing precedent that "no vehicle here" is represented by there being
// no VehiclePresence at all, never a VehicleType.NONE placeholder
// (core/VehiclePresence.js's own header) — "not currently mounted" is
// represented by `null`, never an invented `AvatarVehicleMount.NONE` or an
// empty-string `vehicleId`. `clearAvatarVehicleMount()` exists only to give
// that absence an explicit, named spelling for a caller who wants one,
// rather than inlining `null` at every call site; it is otherwise exactly
// the constant `null`.
//
// A SEPARATE VALUE, DELIBERATELY NOT ATTACHED TO EITHER SIDE YET. This
// milestone's own brief explicitly rejects two easier-looking placements:
//
//   VehiclePresence { ..., mountedByAvatarId }  — would make a
//     world-content descriptor (what a vehicle IS, and where) responsible
//     for a runtime relationship (who is currently using it). A
//     VehiclePresence is reconstructed fresh from a deterministic formula
//     on every query (core/VehiclePlacement.js); a mounted-by fact living
//     on it would need to survive that reconstruction with no obvious home
//     to survive IN.
//
//   AvatarPresence { ..., mountedVehicleId }  — would grow
//     core/AvatarPresence.js's own existing "avatar/world presence"
//     responsibility (see that file's own header) to also carry a
//     capability/relationship layered on top of presence, before any
//     transition milestone has decided how the two should compose.
//
// A dedicated value keeps both descriptors exactly as small as they already
// are, and gives a future mount TRANSITION (0.9.78) one unambiguous place
// to read from and write to, independent of either side's own lifecycle.
//
// IMMUTABLE, GETTER-ONLY, FROZEN — the same discipline
// core/VehiclePresence.js's own header explains and enforces with
// `Object.freeze(this)`: a new relationship means constructing a new
// AvatarVehicleMount (or calling `clearAvatarVehicleMount()`), never
// mutating one a caller may already be holding.
//
// THIS MILESTONE ESTABLISHES STATE, IT DOES NOT PERFORM MOUNTING. This
// file never decides WHEN a mount relationship comes to exist, changes, or
// clears — it has no opinion on a MOUNT intent, a resolved interaction
// target, proximity, or anything else that might one day trigger a call to
// `createAvatarVehicleMount()`. It also takes no position on whether
// `mount.vehicleId` still names a vehicle that currently exists in the
// world — that lifecycle/validity question belongs to whatever future
// mount TRANSITION reads this value, never to the descriptor itself.
//
// Deliberately excluded, matching this milestone's own brief: position
// changes, avatar movement, vehicle movement, animation, camera changes,
// collision changes, keyboard/controller input handling, proximity
// checking, interaction target resolution, vehicle occupancy, physics,
// persistence, and networking. This file answers only "what relationship,
// if any, currently holds between an avatar and a vehicle by id," nothing
// about how that relationship comes to be, changes, or ends.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

export class AvatarVehicleMount {
    constructor(vehicleId) {
        if (!isNonEmptyString(vehicleId)) {
            throw new Error(`AvatarVehicleMount requires a non-empty string vehicleId, got ${JSON.stringify(vehicleId)}`);
        }
        this._vehicleId = vehicleId;
        Object.freeze(this);
    }

    get vehicleId() { return this._vehicleId; }

    toJSON() {
        return { vehicleId: this._vehicleId };
    }

    static fromJSON(json) {
        return new AvatarVehicleMount(json.vehicleId);
    }
}

// The one construction entry point. See this file's own header for exactly
// what `vehicleId` must be (a 0.9.74 vehicle id, never a VehiclePresence).
export function createAvatarVehicleMount(vehicleId) {
    return new AvatarVehicleMount(vehicleId);
}

// Explicit "not currently mounted" spelling. Always returns `null` — see
// this file's own header, "Absence is null, never a sentinel."
export function clearAvatarVehicleMount() {
    return null;
}

// `value` may be `null` (not mounted) or an AvatarVehicleMount instance
// with a non-empty string `vehicleId`. Anything else — a plain object, a
// bare string, `undefined` — is not a valid mount value.
export function isValidAvatarVehicleMount(value) {
    if (value === null) {
        return true;
    }
    return value instanceof AvatarVehicleMount && isNonEmptyString(value.vehicleId);
}

// Deliberately not yet: what triggers a mount or dismount (a future 0.9.78
// mount TRANSITION reading a MOUNT intent and a resolved interaction
// target); where this value is actually stored on a running avatar (an
// architectural choice this milestone deliberately leaves open); whether a
// mount relationship is still valid if its `vehicleId` no longer names an
// existing VehiclePresence (a lifecycle/validity question for whatever
// reads this value, not for the descriptor itself); vehicle occupancy
// limits; position, movement, or animation of either the avatar or the
// vehicle; camera changes; collision or physics; keyboard or controller
// input; proximity or interaction target resolution (0.9.73/0.9.76 already
// answer those); persistence; networking. See docs/Roadmap.md, 0.9.77, for
// the full list.
