import { VehicleType, isValidVehicleType } from './VehicleType.js';

// 0.9.84 — Avatar-Vehicle Movement Capability Resolution.
//
// 0.9.83 connected the complete mount/dismount semantic chain to a real
// `WorldNavigationSession`, and stopped there — its own closing paragraph
// is explicit that "vehicle movement remains completely untouched," and
// names the next question without answering it: "how should mounted
// movement modify the avatar's existing movement capability without
// creating a second movement system." This file is that answer, and
// nothing more than that answer:
//
//   Given the avatar's current vehicle relationship, what movement
//   capability should the existing avatar movement system have?
//
//   resolveAvatarVehicleMovementCapability(vehicleType) -> AvatarVehicleMovementCapability
//
// VEHICLES MODIFY MOVEMENT CAPABILITY; THEY DO NOT CREATE A SECOND AVATAR
// MOVEMENT SYSTEM. `application/AvatarMovementController.js` already owns
// one complete, tested movement pipeline (walk/run, turning, jumping,
// terrain, tree collision). The temptation this milestone deliberately
// refuses is to answer "how fast does a bicycle go" by building a parallel
// `BicycleMovementController`/`CarMovementController` per vehicle type —
// that would duplicate the entire existing pipeline once per vehicle,
// forever. Instead, this file draws the seam 0.9.83 left open: a pure
// function that turns "which vehicle, if any, is the avatar on" into a
// small, closed description of HOW that changes movement — for a future
// 0.9.85 to feed into the ONE existing movement system, never a new one.
//
// TAKES A VehicleType, NEVER AN AvatarVehicleMount OR A VehiclePresence.
// core/AvatarVehicleMount.js's own header already establishes the
// discipline this file continues: "a vehicle's type is already available
// from its own VehiclePresence; duplicating it here would let a mount
// relationship and its vehicle's own presence disagree about what the
// vehicle IS." A mount only ever carries a `vehicleId` — resolving that id
// to an actual `VehicleType` is a lookup this file has no business doing
// (it would require a vehicle registry/query this module has no reason to
// depend on). The caller — whatever future integration reads the current
// mount, looks up the mounted vehicle's own `VehiclePresence`, and already
// holds its `.type` — passes that `VehicleType` straight in.
// `VehicleType.NONE` is passed for "not currently mounted," reusing the
// exact value `core/VehicleType.js`'s own header already reserved for
// this — "the avatar is not currently riding any vehicle" — rather than
// inventing a second not-mounted spelling alongside `AvatarVehicleMount`'s
// own `null`.
//
// A NEW VOCABULARY, BUT NOT A DUPLICATE ONE. It would be easy to mistake
// "don't duplicate VehicleType" for "return VehicleType values verbatim,"
// but that throws away the one distinction this milestone exists to make:
// `VehicleType` names WHAT a vehicle IS (five sibling values with no
// relationship to each other); movement capability groups vehicles by HOW
// they move. `AvatarMovementCapabilityKind` has only three values —
// BICYCLE, MOTORCYCLE, and CAR all resolve to the SAME `GROUND_VEHICLE`
// kind, because (per this milestone's own brief) all three are
// "vehicle-powered ground movement," a distinction a future 0.9.85 needs
// to reuse the SAME existing ground movement pipeline for all three
// without querying `VehicleType` a second time. This is a many-to-one
// grouping, not a second five-value enum standing in for the first — the
// "don't duplicate VehicleType" rule this milestone was given is about
// never re-listing BICYCLE/MOTORCYCLE/CAR/DRONE side by side as if they
// were a second, independent vocabulary; grouping three of them under one
// shared movement semantic is the opposite of that mistake.
//
//   AvatarMovementCapabilityKind.WALK           — the avatar's own,
//       existing on-foot movement. Resolved from VehicleType.NONE.
//   AvatarMovementCapabilityKind.GROUND_VEHICLE — vehicle-powered ground
//       movement. Resolved from BICYCLE, MOTORCYCLE, or CAR alike: all
//       three are ground vehicles (see core/VehicleType.js's own header),
//       and this milestone takes no position on how their eventual
//       ground-movement numbers differ from one another or from WALK —
//       see "no speed values yet" below.
//   AvatarMovementCapabilityKind.AERIAL_VEHICLE — flight. Resolved only
//       from DRONE. Deliberately its own kind, never folded into
//       GROUND_VEHICLE merely because both are "vehicles" — an aerial
//       movement model is a categorically different thing from a ground
//       one, and this codebase has no aerial movement concept of any kind
//       yet (no altitude, no lift, nothing beyond `AvatarVerticalState`'s
//       own jump/fall). Silently routing DRONE through ground-vehicle
//       movement would be actively wrong, not merely premature.
//
// `supported` NAMES WHETHER A MOVEMENT PIPELINE CONCEPT EXISTS FOR THIS
// KIND YET, NOT WHETHER THIS MILESTONE IMPLEMENTED ITS PHYSICS. Nothing
// in this file, or in 0.9.84 at all, makes any vehicle actually move —
// that is explicitly 0.9.85's job, for every kind including WALK's own
// existing pipeline. `supported` instead distinguishes "an existing or
// planned movement pipeline this capability is meant to eventually drive"
// (WALK — already real; GROUND_VEHICLE — the express plan for 0.9.85 is
// reusing the SAME existing ground pipeline, per this milestone's own
// brief) from "no such pipeline exists in this codebase in any form"
// (AERIAL_VEHICLE — there is no flight/altitude system to eventually
// drive at all). A resolved DRONE capability is still a fully-formed,
// valid `AvatarVehicleMovementCapability` — never `null`, never an
// exception — it simply reports `supported: false` rather than silently
// pretending a car's ground movement also serves a drone.
//
// NO SPEED VALUES, NO PHYSICS, YET — DELIBERATELY. An earlier draft of
// this milestone's own brief proposed a `maxSpeed` field (or even bare
// per-vehicle multipliers) as the first concrete capability. This file
// deliberately does neither: BICYCLE/MOTORCYCLE/CAR's actual numeric
// ground-movement characteristics — and DRONE's eventual flight numbers —
// are a currently-unmade decision this vocabulary must NOT prejudge by
// shipping a "reserved but zero" or guessed placeholder number. Settling
// that a bicycle is "faster" than walking is a game-balance decision for
// whichever future milestone actually wires a numeric value into the
// existing movement pipeline (0.9.85 or later); baking a guessed number
// in here now would make this file a disguised balance config rather than
// the semantic vocabulary it is meant to be. `movementKind` and
// `supported` are deliberately the entire descriptor.
//
// IMMUTABLE, GETTER-ONLY, FROZEN, DETERMINISTIC — the same discipline
// core/AvatarVehicleMount.js and core/VehiclePresence.js already enforce.
// `resolveAvatarVehicleMovementCapability()` performs no randomness, no
// clock read, and no I/O; the same `vehicleType` input always resolves to
// the identical (frozen, shared) capability instance.
//
// Deliberately excluded, matching this milestone's own brief: any change
// to `application/AvatarMovementController.js`, W/S input, continuous
// movement, acceleration, braking, turning, vehicle orientation, vehicle
// collision, vehicle-specific terrain handling, vehicle animation, camera
// behavior, mounting/dismounting, persistence, networking, and actual
// vehicle (or drone) movement of any kind. This file answers only "what
// movement capability kind does this vehicle relationship imply," nothing
// about how, or whether yet, that capability actually moves anything.
export const AvatarMovementCapabilityKind = Object.freeze({
    WALK: 'walk',
    GROUND_VEHICLE: 'ground_vehicle',
    AERIAL_VEHICLE: 'aerial_vehicle'
});

export function isValidAvatarMovementCapabilityKind(value) {
    return Object.values(AvatarMovementCapabilityKind).includes(value);
}

export class AvatarVehicleMovementCapability {
    constructor(movementKind, vehicleType, supported) {
        if (!isValidAvatarMovementCapabilityKind(movementKind)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementCapabilityKind, got ${JSON.stringify(movementKind)}`);
        }
        if (!isValidVehicleType(vehicleType)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
        }
        if (typeof supported !== 'boolean') {
            throw new Error(`AvatarVehicleMovementCapability requires a boolean supported, got ${JSON.stringify(supported)}`);
        }
        this._movementKind = movementKind;
        this._vehicleType = vehicleType;
        this._supported = supported;
        Object.freeze(this);
    }

    get movementKind() { return this._movementKind; }
    get vehicleType() { return this._vehicleType; }
    get supported() { return this._supported; }

    toJSON() {
        return { movementKind: this._movementKind, vehicleType: this._vehicleType, supported: this._supported };
    }

    static fromJSON(json) {
        return new AvatarVehicleMovementCapability(json.movementKind, json.vehicleType, json.supported);
    }
}

export function isValidAvatarVehicleMovementCapability(value) {
    return value instanceof AvatarVehicleMovementCapability
        && isValidAvatarMovementCapabilityKind(value.movementKind)
        && isValidVehicleType(value.vehicleType)
        && typeof value.supported === 'boolean';
}

// One frozen instance per VehicleType, built once at module load — never
// reconstructed per call — so `resolveAvatarVehicleMovementCapability()`
// returns the literal same object for the same input, matching
// core/VehicleType.js's own `Object.freeze` closed-vocabulary discipline.
const CAPABILITY_BY_VEHICLE_TYPE = Object.freeze({
    [VehicleType.NONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true),
    [VehicleType.BICYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.BICYCLE, true),
    [VehicleType.MOTORCYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.MOTORCYCLE, true),
    [VehicleType.CAR]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.CAR, true),
    [VehicleType.DRONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false)
});

// The one resolution entry point. See this file's own header for exactly
// what `vehicleType` must be (a VehicleType value, `VehicleType.NONE` for
// "not currently mounted" — never an AvatarVehicleMount or VehiclePresence).
export function resolveAvatarVehicleMovementCapability(vehicleType) {
    if (!isValidVehicleType(vehicleType)) {
        throw new Error(`resolveAvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
    }
    return CAPABILITY_BY_VEHICLE_TYPE[vehicleType];
}

// Deliberately not yet: feeding a resolved capability into
// `application/AvatarMovementController.js` or any other part of the
// actual movement pipeline (0.9.85's own job); numeric speed,
// acceleration, or any other physical quantity; reading an
// `AvatarVehicleMount` or looking up a `VehicleType` from a vehicle id or
// `VehiclePresence` (the caller's job, not this file's); vehicle
// orientation, collision, terrain response, or animation; camera
// behavior; mounting/dismounting; persistence; networking. See
// docs/Roadmap.md, 0.9.84, for the full list.
