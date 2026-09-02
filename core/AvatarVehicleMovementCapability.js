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
// NO SPEED VALUES, NO PHYSICS, AS OF 0.9.84 — DELIBERATELY, AT THE TIME.
// An earlier draft of this milestone's own brief proposed a `maxSpeed`
// field (or even bare per-vehicle multipliers) as the first concrete
// capability. This file deliberately did neither: BICYCLE/MOTORCYCLE/
// CAR's actual numeric ground-movement characteristics — and DRONE's
// eventual flight numbers — were a then-unmade decision this vocabulary
// must NOT prejudge by shipping a "reserved but zero" or guessed
// placeholder number. Settling that a bicycle is "faster" than walking
// was left to whichever future milestone actually wired a numeric value
// into the existing movement pipeline. `movementKind` and `supported`
// were deliberately the entire descriptor — until 0.9.86 below.
//
// 0.9.86 — Ground Vehicle Movement Speed Capability. The decision 0.9.84
// deliberately deferred is made here, minimally: `movementSpeed` (world
// units/second — the SAME unit `core/AvatarMovementSimulation.js`'s own
// WALK_SPEED/RUN_SPEED already use, and the requested HORIZONTAL
// movement magnitude, never an acceleration or a physics quantity) joins
// `movementKind`/`supported` as the descriptor's third, and still only
// other, field. WALK's own `movementSpeed` is the avatar's existing
// on-foot speed — an avatar nobody has ever mounted on anything gets the
// numerically IDENTICAL speed it always has, never a "close enough"
// approximation (see "GROUND_VEHICLE_MOVEMENT_SPEED IS A DELIBERATE,
// DOCUMENTED DUPLICATE..." below for why that number is a deliberately
// duplicated constant, not an import).
// GROUND_VEHICLE's own `movementSpeed`, as of 0.9.86, was ONE shared,
// conservative constant, strictly greater than WALK's — BICYCLE,
// MOTORCYCLE, and CAR all resolved to the exact same number.
// Differentiating them numerically was named as explicit future scope;
// 0.9.87 (below) is that future milestone — see its own header for the
// per-vehicle values that replaced this shared constant.
// AERIAL_VEHICLE's own `movementSpeed` is `0` — inert, never actually
// read by anything: `supported: false` already blocks movement outright
// at `application/AvatarMovementController.js#tick()` before any speed
// value is ever consulted (see that file's own 0.9.85 header) — `0`
// merely keeps this a fully-formed, always-numeric field rather than a
// conditionally-absent one, so no caller ever needs an
// `if ('movementSpeed' in capability)` check.
//
// GROUND_VEHICLE_MOVEMENT_SPEED IS A DELIBERATE, DOCUMENTED DUPLICATE OF
// NO EXISTING NUMBER — AND WALK'S OWN movementSpeed IS A DELIBERATE,
// DOCUMENTED DUPLICATE OF core/AvatarMovementSimulation.js's OWN
// WALK_SPEED. This file's own architectural regression test
// (tests/AvatarVehicleMovementCapability.test.js, Section K) forbids
// importing `AvatarMovementSimulation.js` from here — this stays a pure
// capability vocabulary with zero coupling to the simulation module's
// own internals, exactly as 0.9.84 established. That means WALK's own
// `movementSpeed` cannot be *imported* from the one true WALK_SPEED
// constant; it is instead an independently-declared local constant
// documented, right where it is declared below, as required to always
// equal it. `application/WorldNavigationSession.js` resolves and applies
// a capability EVERY animation frame, WALK included (see that file's own
// 0.9.85 header) — so this is not a cosmetic parity, it is the one
// number standing between "ordinary walking" and "ordinary walking, at
// a slightly different speed nobody asked for."
//
// IMMUTABLE, GETTER-ONLY, FROZEN, DETERMINISTIC — the same discipline
// core/AvatarVehicleMount.js and core/VehiclePresence.js already enforce.
// `resolveAvatarVehicleMovementCapability()` performs no randomness, no
// clock read, and no I/O; the same `vehicleType` input always resolves to
// the identical (frozen, shared) capability instance.
//
// 0.9.87 — Per-Vehicle Ground Movement Speed Resolution. 0.9.86's own
// closing paragraph named exactly this as the deferred next step:
// differentiating BICYCLE/MOTORCYCLE/CAR numerically "only once there
// is an actual design reason to." The original intended progression
// (`docs/Roadmap.md`, 0.9.70) — WALK < BICYCLE < MOTORCYCLE < CAR — is
// now that reason. The change is confined entirely to THIS FILE'S OWN
// resolution data: three constants replace the one shared
// `GROUND_VEHICLE_MOVEMENT_SPEED`, and `CAPABILITY_BY_VEHICLE_TYPE`
// below hands each `VehicleType` its own value. `AvatarMovementKind`
// still has only three values — BICYCLE, MOTORCYCLE, and CAR still all
// resolve to the SAME `AvatarMovementCapabilityKind.GROUND_VEHICLE` —
// this milestone deliberately does NOT add a second, per-vehicle
// capability kind vocabulary alongside it. `movementKind` names WHICH
// movement algorithm applies (still exactly one, for all ground
// vehicles); `movementSpeed` names a PARAMETER that algorithm is fed —
// these are two independent dimensions, and only the second one changes
// here. `application/AvatarMovementController.js` reads
// `capability.movementSpeed` as a plain number and has no idea a
// bicycle, motorcycle, or car exists — 0.9.86 already built that seam;
// this milestone merely feeds it three different numbers instead of
// one, with zero corresponding change to that file or to
// `core/AvatarMovementSimulation.js` (see this file's own
// architectural regression test, Section K, and
// `tests/AvatarVehicleMovementSpeedIntegration.test.js`'s own Section H
// for both files' zero-diff proof).
//
// Deliberately excluded, matching 0.9.84's own original brief (0.9.85
// later made the one exception this list itself anticipated — feeding a
// resolved capability into `application/AvatarMovementController.js` —
// 0.9.86 made the further exception described above — a base
// `movementSpeed` — and 0.9.87 made the per-vehicle numeric
// differentiation itself, described above): W/S input, continuous
// movement, acceleration, braking, turning, vehicle orientation,
// vehicle collision, vehicle-specific terrain handling, vehicle
// animation, camera behavior, mounting/dismounting, persistence,
// networking, and a second, per-vehicle `AvatarMovementCapabilityKind`
// vocabulary. This file still answers only "what movement capability —
// kind, support, and base speed — does this vehicle relationship
// imply," never how a caller actually applies it to move anything.
export const AvatarMovementCapabilityKind = Object.freeze({
    WALK: 'walk',
    GROUND_VEHICLE: 'ground_vehicle',
    AERIAL_VEHICLE: 'aerial_vehicle'
});

export function isValidAvatarMovementCapabilityKind(value) {
    return Object.values(AvatarMovementCapabilityKind).includes(value);
}

export class AvatarVehicleMovementCapability {
    constructor(movementKind, vehicleType, supported, movementSpeed) {
        if (!isValidAvatarMovementCapabilityKind(movementKind)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementCapabilityKind, got ${JSON.stringify(movementKind)}`);
        }
        if (!isValidVehicleType(vehicleType)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
        }
        if (typeof supported !== 'boolean') {
            throw new Error(`AvatarVehicleMovementCapability requires a boolean supported, got ${JSON.stringify(supported)}`);
        }
        if (typeof movementSpeed !== 'number' || !Number.isFinite(movementSpeed) || movementSpeed < 0) {
            throw new Error(`AvatarVehicleMovementCapability requires a finite, non-negative movementSpeed, got ${JSON.stringify(movementSpeed)}`);
        }
        this._movementKind = movementKind;
        this._vehicleType = vehicleType;
        this._supported = supported;
        this._movementSpeed = movementSpeed;
        Object.freeze(this);
    }

    get movementKind() { return this._movementKind; }
    get vehicleType() { return this._vehicleType; }
    get supported() { return this._supported; }
    // 0.9.86 — the BASE horizontal movement speed (world units/second)
    // this capability implies, before the existing running modifier is
    // ever applied — see this file's own 0.9.86 header. Always a finite
    // number >= 0, never undefined/NaN: AERIAL_VEHICLE's own `0` is
    // inert (see that header) rather than a conditionally-missing field.
    get movementSpeed() { return this._movementSpeed; }

    toJSON() {
        return { movementKind: this._movementKind, vehicleType: this._vehicleType, supported: this._supported, movementSpeed: this._movementSpeed };
    }

    static fromJSON(json) {
        return new AvatarVehicleMovementCapability(json.movementKind, json.vehicleType, json.supported, json.movementSpeed);
    }
}

export function isValidAvatarVehicleMovementCapability(value) {
    return value instanceof AvatarVehicleMovementCapability
        && isValidAvatarMovementCapabilityKind(value.movementKind)
        && isValidVehicleType(value.vehicleType)
        && typeof value.supported === 'boolean'
        && typeof value.movementSpeed === 'number'
        && Number.isFinite(value.movementSpeed)
        && value.movementSpeed >= 0;
}

// 0.9.86 — WALK's own base movement speed. MUST always equal
// core/AvatarMovementSimulation.js's own WALK_SPEED — see this file's
// own 0.9.86 header ("GROUND_VEHICLE_MOVEMENT_SPEED IS A DELIBERATE,
// DOCUMENTED DUPLICATE...") for why that is an independently-declared
// constant here rather than an import.
const WALK_MOVEMENT_SPEED = 3; // world units / second

// 0.9.87 — per-vehicle GROUND_VEHICLE base movement speeds, replacing
// 0.9.86's own single shared `GROUND_VEHICLE_MOVEMENT_SPEED` constant.
// `BICYCLE_MOVEMENT_SPEED` deliberately keeps 0.9.86's own value
// unchanged (it was already `WALK_MOVEMENT_SPEED`'s own existing
// RUN_SPEED-equal baseline — see the now-superseded comment this
// replaces), so nothing that previously mounted a bicycle changes
// speed. MOTORCYCLE and CAR are new, deliberately conservative choices
// satisfying this milestone's one semantic requirement —
// `WALK < BICYCLE < MOTORCYCLE < CAR`, verified directly by
// tests/AvatarVehicleMovementCapability.test.js's own ordering section —
// never a tuned "game balance" number. These three constants are owned
// by this file, the vehicle capability layer, exactly as this file's
// own 0.9.87 header describes: the movement simulation
// (core/AvatarMovementSimulation.js) owns HOW a speed is applied; this
// file owns WHICH speed each vehicle capability carries.
const BICYCLE_MOVEMENT_SPEED = 6; // world units / second
const MOTORCYCLE_MOVEMENT_SPEED = 9; // world units / second
const CAR_MOVEMENT_SPEED = 12; // world units / second

// One frozen instance per VehicleType, built once at module load — never
// reconstructed per call — so `resolveAvatarVehicleMovementCapability()`
// returns the literal same object for the same input, matching
// core/VehicleType.js's own `Object.freeze` closed-vocabulary discipline.
const CAPABILITY_BY_VEHICLE_TYPE = Object.freeze({
    [VehicleType.NONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, WALK_MOVEMENT_SPEED),
    [VehicleType.BICYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.BICYCLE, true, BICYCLE_MOVEMENT_SPEED),
    [VehicleType.MOTORCYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.MOTORCYCLE, true, MOTORCYCLE_MOVEMENT_SPEED),
    [VehicleType.CAR]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.CAR, true, CAR_MOVEMENT_SPEED),
    [VehicleType.DRONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false, 0)
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

// Deliberately not yet (0.9.87, still): acceleration, braking, momentum,
// or any other physical quantity beyond the one base `movementSpeed`;
// a second, per-vehicle `AvatarMovementCapabilityKind` vocabulary (see
// this file's own 0.9.87 header for why BICYCLE/MOTORCYCLE/CAR still
// share the one GROUND_VEHICLE kind); reading an `AvatarVehicleMount`
// or looking up a `VehicleType` from a vehicle id or `VehiclePresence`
// (the caller's job, not this file's); vehicle orientation, collision,
// terrain response, or animation; camera behavior; mounting/
// dismounting; persistence; networking. See docs/Roadmap.md, 0.9.84 for
// the original list, 0.9.86 for the base speed field, and 0.9.87 for
// the per-vehicle numeric differentiation.
