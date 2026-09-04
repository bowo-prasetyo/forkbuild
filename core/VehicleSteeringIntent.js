// 0.9.125 — Vehicle Steering Intent.
//
// 0.9.123/0.9.124 closed the orientation seam: a vehicle's `heading` comes
// ONLY from realized horizontal displacement — never from steering, never
// invented. That audit's own closing recommendation named this milestone's
// exact shape: an explicit, closed vocabulary for steering INTENT — a held
// turn key becomes a requested direction — that deliberately does not yet
// turn the vehicle. This file is that vocabulary, and nothing else.
//
//   Movement input ──▶ vehicle movement realization ──▶ position ──▶ heading
//
//   Steering input ──▶ VehicleSteeringIntent
//                           │
//                     0.9.125 stops here
//
// THE MOST IMPORTANT INVARIANT THIS FILE ENFORCES BY CONSTRUCTION: a
// VehicleSteeringIntent describes what the driver REQUESTS, never what the
// vehicle actually does. `LEFT` is not `heading - 90`; `RIGHT` is not
// `heading + 90`. Those would be BEHAVIORAL interpretations, and belong to
// a later steering SIMULATION milestone (0.9.126, per docs/Roadmap.md,
// 0.9.124's own recommendation) — one that reads a VehicleSteeringIntent
// alongside movement intent, feeds both into vehicle movement realization,
// and only ever lets REALIZED displacement (not the intent itself) resolve
// a new heading, exactly as core/VehicleMovementHeading.js already does
// today. This file never imports core/VehicleMovementHeading.js,
// core/VehicleInstance.js, or application/VehicleRuntimeInstances.js, and
// none of them import this file — the boundary 0.9.124's own audit proved
// clean stays exactly that clean after this milestone, not narrower.
//
// THE DIRECT STRUCTURAL TWIN OF core/AvatarVehicleMount.js, NOT OF
// core/AvatarContinuousMovementIntent.js. AvatarContinuousMovementIntent
// ships a bare closed vocabulary (three raw strings) PLUS a transition
// function, because its own job is deciding what a NEW key-down does to
// intent that already existed. This milestone has no such question yet —
// see "Deliberately not yet" below — so a transition function would be
// answering a question nobody asked. What it DOES need, per this
// milestone's own design brief, is exactly what AvatarVehicleMount already
// established for a different fact: a small, closed vocabulary
// (`VehicleSteeringDirection`) plus a frozen, getter-only, JSON-capable
// value object (`VehicleSteeringIntent`) wrapping ONE validated field from
// it. Two names, not one, for the identical reason
// core/AvatarMovementSteeringCapability.js keeps `AvatarMovementSteeringKind`
// separate from the capability class that carries it: the raw vocabulary
// is reusable on its own (a caller validating a raw direction string before
// it ever becomes an intent), and the wrapping object is where this
// milestone's own immutability guarantee actually lives.
//
//   VehicleSteeringDirection.NONE  — the driver is not currently
//                                     requesting a turn either way.
//   VehicleSteeringDirection.LEFT  — the driver is requesting to turn left.
//   VehicleSteeringDirection.RIGHT — the driver is requesting to turn right.
//
// NONE IS KEPT EXPLICIT, MATCHING EVERY OTHER CLOSED VOCABULARY IN THIS
// CODEBASE — core/AvatarContinuousMovementIntent.js's own NONE,
// core/VehicleType.js's own NONE, core/AvatarVerticalState.js's own
// SUPPORTED — never represented as `null`/`undefined`. "Not steering right
// now" is itself a real, nameable steering intent, not the absence of one.
//
// SEMANTICALLY INDEPENDENT OF ANY VEHICLE. Constructing `LEFT`, `RIGHT`, or
// `NONE` requires no vehicle position, heading, type, movement capability,
// collision state, or avatar rotation — this file imports nothing from
// core/VehicleInstance.js, core/VehicleType.js, core/VehicleMovementHeading.js,
// or anywhere under application/ or renderer/. A VehicleSteeringIntent
// exists entirely independently of any vehicle runtime instance, exactly
// as this milestone's own brief requires — it can be constructed, held,
// compared, and serialized with no vehicle in scope at all.
//
// IMMUTABLE, GETTER-ONLY, FROZEN — the same `Object.freeze(this)`
// discipline core/AvatarVehicleMount.js and
// core/AvatarMovementSteeringCapability.js already enforce for themselves:
// a new steering request means constructing a new VehicleSteeringIntent,
// never mutating one a caller may already be holding. There is no setter,
// mutable internal field, or method that changes `direction` after
// construction — only VALIDATION happens at construction time, matching
// core/AvatarVehicleMount.js's own posture.
//
// A RUNTIME VALUE, NEVER RUNTIME STATE. `application/VehicleRuntimeInstances.js`
// does not acquire a `steering` field, and `core/VehicleInstance.js` gains
// no `steering` getter, `withSteering()` method, or constructor field —
// this milestone deliberately leaves both files byte-for-byte unchanged,
// exactly as 0.9.124's own Section H confirmed no steering-intent
// vocabulary existed anywhere yet. Intent is transient, driver-side input
// state; a caller (an application-layer controller, in a later milestone)
// is free to hold the current VehicleSteeringIntent itself, for exactly as
// long as it needs to, entirely outside the tracked-vehicle store — the
// identical "intent is not runtime vehicle state" boundary
// core/AvatarMovementSteeringCapability.js's own header already draws
// ("a current heading is transient CONTROLLER state, never capability
// data").
//
// Deliberately not yet, matching this milestone's own brief: any change to
// core/VehicleMovementHeading.js, core/VehicleInstance.js, or
// application/VehicleRuntimeInstances.js; a transition function of any
// kind (there is no PRIOR intent this milestone reads — a caller simply
// constructs whichever VehicleSteeringIntent the current input state
// calls for, fresh, same as core/AvatarMovementState.js's own
// per-tick `forwardAxis`/`turnAxis` snapshot); steering angle, steering
// rate, turn radius, angular velocity, heading mutation of any kind, wheel
// rotation, oriented collision, or any other vehicle physics; keyboard,
// gamepad, or any other raw input handling (a future milestone's own job —
// see docs/Roadmap.md, 0.9.125); collision; rendering; persistence;
// networking. See docs/Roadmap.md, 0.9.125, for the full brief and the
// ordered sequence (0.9.126, Vehicle Steering Simulation) this milestone
// opens the door to without building any of it itself.
export const VehicleSteeringDirection = Object.freeze({
    NONE: 'none',
    LEFT: 'left',
    RIGHT: 'right'
});

export function isValidVehicleSteeringDirection(value) {
    return Object.values(VehicleSteeringDirection).includes(value);
}

export class VehicleSteeringIntent {
    constructor(direction) {
        if (!isValidVehicleSteeringDirection(direction)) {
            throw new Error(`VehicleSteeringIntent requires a valid VehicleSteeringDirection, got ${JSON.stringify(direction)}`);
        }
        this._direction = direction;
        Object.freeze(this);
    }

    // What the driver is requesting — see this file's own header,
    // "describes what the driver requests, never what the vehicle
    // actually does." Never mutated after construction.
    get direction() { return this._direction; }

    get isNone() { return this._direction === VehicleSteeringDirection.NONE; }
    get isLeft() { return this._direction === VehicleSteeringDirection.LEFT; }
    get isRight() { return this._direction === VehicleSteeringDirection.RIGHT; }

    toJSON() {
        return { direction: this._direction };
    }

    static fromJSON(json) {
        return new VehicleSteeringIntent(json.direction);
    }

    // Fresh, explicitly-named constructions — the direct structural twin
    // of core/AvatarMovementState.js's own `static idle()` — never a
    // shared mutable singleton; each call returns a brand new, independently
    // frozen instance.
    static none() { return new VehicleSteeringIntent(VehicleSteeringDirection.NONE); }
    static left() { return new VehicleSteeringIntent(VehicleSteeringDirection.LEFT); }
    static right() { return new VehicleSteeringIntent(VehicleSteeringDirection.RIGHT); }
}

// The one construction entry point for a raw direction string — the direct
// structural twin of core/AvatarVehicleMount.js's own
// `createAvatarVehicleMount()`. Equivalent to `new VehicleSteeringIntent(direction)`;
// exists only to give construction-from-a-raw-value an explicit, named
// spelling for a caller who wants one (e.g. translating an already-resolved
// input direction into an intent), same as that file's own header explains
// for its own factory function.
export function createVehicleSteeringIntent(direction) {
    return new VehicleSteeringIntent(direction);
}

export function isValidVehicleSteeringIntent(value) {
    return value instanceof VehicleSteeringIntent && isValidVehicleSteeringDirection(value.direction);
}
