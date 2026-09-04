import { VehicleSteeringIntent, isValidVehicleSteeringIntent } from './VehicleSteeringIntent.js';

// 0.9.126 — Vehicle Steering Simulation.
//
// 0.9.125 gave the driver's request a name (`VehicleSteeringIntent`) and,
// by its own explicit design, stopped there — "0.9.125 stops here," per
// that file's own header — leaving `LEFT`/`RIGHT`/`NONE` completely inert.
// This is the next, and still deliberately small, seam: turning that
// request into an ATTEMPTED movement direction, without yet touching
// anything that decides whether the vehicle actually gets there.
//
//   VehicleSteeringIntent
//           │
//           ▼
//   ┌─────────────────────┐
//   │ Steering simulation │   <- this file
//   └──────────┬──────────┘
//              │
//              ▼
//   steering-adjusted movement direction
//              │
//              ▼
//   existing movement simulation (core/AvatarMovementSimulation.js)
//              │
//              ▼
//   collision constraints (application/AvatarMovementConstraint.js, etc.)
//              │
//              ▼
//   realized position
//              │
//              ▼
//   VehicleMovementHeading.resolveVehicleHeadingFromMovement()
//              │
//              ▼
//   final heading
//
// THE MOST IMPORTANT INVARIANT THIS FILE ENFORCES BY CONSTRUCTION: this
// file produces an ATTEMPTED direction, never a vehicle FACT. It has no
// notion of "the vehicle's heading is now X" — only
// `core/VehicleMovementHeading.js`'s own `resolveVehicleHeadingFromMovement()`,
// fed REALIZED displacement, ever gets to say that (see that file's own
// header, "heading comes from where the vehicle actually went, never from
// steering intent" — this milestone does not weaken that claim, it merely
// gives the "where the vehicle actually went" step something steering-
// aware to work from). This file never imports `core/VehicleInstance.js`,
// `core/VehicleMovementHeading.js`, or `application/VehicleRuntimeInstances.js`,
// and none of them import this file — the identical boundary
// `core/VehicleSteeringIntent.js`'s own 0.9.125 header already drew stays
// exactly that clean, one file wider.
//
// A PURE DIRECTIONAL TRANSFORMATION, DELIBERATELY NOT VEHICLE PHYSICS.
// Given a previous heading and a steering intent, this file answers
// exactly one question — "which direction is the vehicle now attempting
// to move in" — as simple arithmetic on a heading:
//
//   NONE  -> previousHeading, unchanged (the current travel direction)
//   LEFT  -> previousHeading, rotated left by `steeringTurnDegrees`
//   RIGHT -> previousHeading, rotated right by `steeringTurnDegrees`
//
// `steeringTurnDegrees` is one explicit, named, caller-overridable
// parameter (`DEFAULT_VEHICLE_STEERING_TURN_DEGREES` below) — never an
// arbitrary constant buried inside a future controller. There is no
// steering ANGLE tracked as persistent state anywhere (this function
// receives `previousHeading` fresh every call and remembers nothing
// between calls — see "Purity," below), no steering RATE, no angular
// velocity, no acceleration, no turning radius, no wheelbase, no tire
// friction, no banking, no drifting, no momentum. The transformation is
// applied in full, in one call, exactly as requested — never smoothed or
// rate-limited over multiple ticks, deliberately unlike
// `core/AvatarMovementSteeringSimulation.js`'s own `resolveMovementHeading()`,
// which rate-limits the AVATAR's own rendered facing toward a target
// heading and is left completely untouched by this milestone.
//
// DEGREES, MATCHING `core/VehicleMovementHeading.js` AND
// `VehicleInstance.heading`, NOT `core/AvatarMovementSteeringSimulation.js`'s
// OWN RADIANS. `previousHeading` and the returned direction both use the
// exact representation `core/VehicleMovementHeading.js`'s own header
// already establishes (0 = facing +Z, 90 = facing +X) — the same
// representation `VehicleInstance.heading` already stores, so a caller can
// feed that field straight into this function with no conversion. RIGHT
// increases heading, LEFT decreases it — the identical sign convention
// `application/AvatarMovementController.js`'s own `turnAxis` already
// establishes (`turnAxis = right(1) - left(1)`, and increasing `turnAxis`
// increases `rotationY` in `core/AvatarMovementSimulation.js`) and
// `core/VehicleMovementHeading.js`'s own degrees convention already
// implies (0 -> +Z, 90 -> +X is a clockwise turn when viewed from above,
// i.e. a RIGHT turn).
//
// PURITY. `resolveVehicleMovementDirectionFromSteering()` reads only its
// own arguments and returns a plain number — no runtime store access, no
// `VehicleInstance` mutation, no `VehicleRuntimeInstances` lookup, no
// Three.js, no avatar, no clock, no `Math.random`, no module-level mutable
// state. Repeated calls with identical arguments always return the
// identical result, and calling it changes nothing about any object
// passed in.
//
// NO COLLISION KNOWLEDGE OF ANY KIND. This file has never heard of a
// building, a brick, a tree, terrain, a collision radius, or a
// vehicle-vs-world constraint — those stay entirely downstream, in
// whatever later milestone actually feeds this function's own output into
// `core/AvatarMovementSimulation.js` and a real collision constraint (see
// docs/Roadmap.md, 0.9.126, "0.9.127 — Vehicle Steering Integration
// Audit"). A caller whose attempted direction gets fully blocked by
// collision is expected to leave the vehicle's own `heading` untouched by
// simply never calling `VehicleInstance#withHeading()` for that tick — the
// identical "no real horizontal movement, no new heading" rule
// `application/AvatarVehicleMovementController.js`'s own `tick()` already
// applies today for un-steered movement (see that file's own 0.9.123
// section). This function's own return value never substitutes for that
// check: it names an ATTEMPT, not a guarantee.
export const DEFAULT_VEHICLE_STEERING_TURN_DEGREES = 45;

const FULL_TURN_DEGREES = 360;

// `previousHeading` is expected already normalized into `[0, 360)` — the
// same convention `core/VehicleMovementHeading.js`'s own header already
// documents for itself ("a caller is expected to always hand back a value
// this same function... already produced") — but this function is
// defensive about it regardless: any finite input, in any range, is
// normalized before use, and a non-finite input degrades to `0`, the
// identical fallback `core/VehicleMovementHeading.js` and
// `core/AvatarMovementSteeringSimulation.js` both already use for a bad
// heading.
//
// `steeringTurnDegrees` degrades to `DEFAULT_VEHICLE_STEERING_TURN_DEGREES`
// for anything that is not a finite, non-negative number — never negative,
// never NaN/Infinity — so a caller can never invert LEFT/RIGHT by passing
// a broken configuration value.
export function resolveVehicleMovementDirectionFromSteering({ previousHeading, steeringIntent, steeringTurnDegrees = DEFAULT_VEHICLE_STEERING_TURN_DEGREES } = {}) {
    if (!isValidVehicleSteeringIntent(steeringIntent)) {
        throw new Error(`resolveVehicleMovementDirectionFromSteering requires a valid VehicleSteeringIntent, got ${JSON.stringify(steeringIntent instanceof VehicleSteeringIntent ? steeringIntent.toJSON() : steeringIntent)}`);
    }

    const heading = normalizeDegrees(sanitizeNumber(previousHeading, 0));
    const turnDegrees = sanitizeTurnDegrees(steeringTurnDegrees);

    if (steeringIntent.isLeft) {
        return normalizeDegrees(heading - turnDegrees);
    }
    if (steeringIntent.isRight) {
        return normalizeDegrees(heading + turnDegrees);
    }
    // NONE — the current travel direction, unchanged. Deliberately
    // returned from the ALREADY-normalized `heading`, not the raw
    // `previousHeading` argument, so NONE's own output stays consistent
    // with LEFT/RIGHT's own normalized range; a caller that always hands
    // back an already-normalized heading (per this file's own convention,
    // above) sees byte-identical passthrough either way.
    return heading;
}

// Wraps any finite angle into `[0, 360)` — the direct structural twin of
// `core/AvatarMovementSteeringSimulation.js`'s own `normalizeAngle()`,
// expressed in degrees instead of radians to match this file's own
// representation.
function normalizeDegrees(degrees) {
    const wrapped = degrees % FULL_TURN_DEGREES;
    return wrapped < 0 ? wrapped + FULL_TURN_DEGREES : wrapped;
}

function sanitizeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function sanitizeTurnDegrees(value) {
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_VEHICLE_STEERING_TURN_DEGREES;
}

// Deliberately not yet, matching this milestone's own brief: steering
// angle as persistent vehicle state, steering wheel angle, angular
// velocity, acceleration, turning radius, wheelbase, tire friction,
// banking, drifting, momentum, or any other vehicle physics; reading or
// mutating a `VehicleInstance` or `VehicleRuntimeInstances` (this file
// imports neither); collision detection or world/terrain awareness of any
// kind; updating `heading` (only `core/VehicleMovementHeading.js`'s own
// `resolveVehicleHeadingFromMovement()`, fed REALIZED displacement, ever
// does that); Three.js or any rendering concern; keyboard, gamepad, or any
// other raw input handling — translating a held turn key into a
// `VehicleSteeringIntent` stays `core/VehicleSteeringIntent.js`'s own
// already-settled boundary, and wiring THAT into a real controller is a
// later milestone's job (see docs/Roadmap.md, 0.9.126, "0.9.127 — Vehicle
// Steering Integration Audit" and "0.9.128 — Vehicle Steering Input");
// persistence; networking.
