// 0.9.95 — Vehicle Braking Intent.
//
// 0.9.92 (core/AvatarMovementBrakingCapability.js +
// core/AvatarMovementAccelerationSimulation.js's own extended
// resolveMovementSpeed()) gave every movement capability an
// independently-tunable braking RATE, and wired it all the way through
// core/AvatarMovementSimulation.js. But that entire path only ever
// fires when `AvatarMovementState.brakingRequested` is `true` — and, as
// that milestone's own header was explicit about, nothing in this
// codebase has ever set it: "nothing in
// application/AvatarMovementController.js ever sets `brakingRequested`
// true... deciding WHICH user action produces this fact is deliberately
// left to a future input milestone." This file is the first half of
// that future milestone: the vocabulary-only-level SEMANTIC FACT a
// future input layer will need to produce before `brakingRequested` can
// ever become real.
//
//   AvatarVehicleBrakingIntent.NONE  — no braking has been requested
//                                      right now.
//   AvatarVehicleBrakingIntent.BRAKE — the avatar is asking to brake
//                                      right now.
//
// DELIBERATELY LEVEL-DRIVEN, NOT EDGE-DRIVEN — THE OPPOSITE OF
// core/AvatarVehicleInteractionIntent.js's own MOUNT AND
// core/AvatarVehicleDismountIntent.js's own DISMOUNT. Mounting and
// dismounting are single ACTIONS: one key-down must produce exactly one
// MOUNT/DISMOUNT request, and holding the key (key-repeat) must stay
// harmless rather than spamming a transition forever — which is why
// both of those files' own transition rules are careful, documented
// one-shot state machines. Braking is not an action, it is a CONDITION:
// the milestone brief is explicit that braking must keep applying "for
// as long as" it is requested, exactly the same "is this fact true
// right now" shape `AvatarMovementState.jumpRequested` and
// `AvatarMovementState.brakingRequested` itself already have (see
// core/AvatarMovementState.js's own 0.9.92 header: "a snapshot of
// INTENT... never itself a speed, a rate, or a vehicle"). So this file
// is deliberately the SIMPLEST of this codebase's intent vocabularies:
// a pure, stateless, one-argument-in/one-value-out mapping, with no
// `currentIntent` to fold in and no one-shot consumption to implement —
// there is nothing FOR a remembered previous value to influence, because
// the entire answer is already fully determined by whatever
// `brakeRequested` says RIGHT NOW.
//
// deriveAvatarVehicleBrakingIntent() below is a pure function of exactly
// ONE signal:
//
//   brakeRequested — true when the caller's own input layer currently
//                    observes a braking request (e.g. a future input
//                    adapter reporting the brake control is currently
//                    held — see core/AvatarVehicleBrakingInputAdapter.js,
//                    this milestone's own sibling file), false otherwise,
//                    including every ordinary tick where nothing is
//                    pressed.
//
// The transition rule is exactly the two rows the brief itself states:
//
//   brakeRequested: false -> NONE   (nothing requested, nothing braking)
//   brakeRequested: true  -> BRAKE  (braking is being requested, right now)
//
// which already produces every behavior a continuous brake hold needs,
// with no separate cases to keep in sync: pressing sets BRAKE, holding
// keeps reporting BRAKE every single call for as long as `brakeRequested`
// keeps arriving `true` (never a one-shot "already consumed" collapse
// back to NONE while the control is still held), and releasing reports
// NONE on the very next call — immediate, symmetric, and, because this
// function carries no memory of its own between calls, trivially
// idempotent: calling it any number of times with the identical
// `brakeRequested` always returns the identical intent.
//
// DELIBERATELY NOT VEHICLE-AWARE. Exactly like
// core/AvatarVehicleInteractionIntent.js and
// core/AvatarVehicleDismountIntent.js before it, this file's vocabulary
// carries no `vehicleId`, no capability, and its transition function
// never receives an AvatarVehicleMovementCapability, a braking rate, or
// a current speed. It does not even know braking eventually SLOWS
// anything down — BRAKE is simply the name of the one request this
// codebase currently has a use for. Combining BRAKE intent with the
// active capability's own resolved braking rate to actually change speed
// is entirely core/AvatarMovementAccelerationSimulation.js's own
// existing job (since 0.9.92) — this file only ever supplies the
// request itself.
//
// DELIBERATELY NOT DECIDING THE KEYBOARD KEY, THE MOUSE BUTTON, OR THE
// GAMEPAD TRIGGER. Exactly like every intent vocabulary in this
// codebase, this file never sees a key, a KeyboardEvent, a modifier, or
// a gamepad. `brakeRequested` is already semantic ("a brake was
// requested"), not raw ("Space was pressed"). Translating an actual
// physical control into that boolean is core/AvatarVehicleBrakingInputAdapter.js's
// own job, one deliberate layer below this one, and choosing WHICH
// physical control feeds that adapter is left to a still-later milestone
// — see that file's own header, and docs/Roadmap.md, 0.9.95/0.9.96.
//
// DELIBERATELY NOT MOUNT-STATE-AWARE, NOT SPEED-AWARE, NOT
// DIRECTION-AWARE. A BRAKE request fired while nothing is moving, while
// nothing is mounted, or while the avatar is walking rather than
// driving is not this file's problem to prevent or interpret — every
// one of those questions is answered entirely downstream, by
// `core/AvatarMovementSimulation.js`'s own existing consumption of
// `AvatarMovementState.brakingRequested` (already true, unconditionally,
// for on-foot WALK too — see that file's own INSTANT-braking behavior).
// This file only ever answers "is braking being requested, right now,"
// nothing about what riding on, how fast, or which way.
//
// Deliberately excluded, matching this milestone's own brief: any
// vehicle awareness (VehiclePresence, vehicle ids, vehicle types,
// AvatarVehicleMount), any capability or rate awareness
// (AvatarMovementBrakingCapability, a braking rate, movementSpeed), any
// movement or speed computation, throttle semantics or
// brake-overrides-throttle behavior, a target speed of any kind,
// keyboard/controller/gamepad input handling of any kind, rendering,
// collision, physics, persistence, randomness, or the clock. This file
// answers only "what braking, if any, is currently being requested,"
// nothing else.
export const AvatarVehicleBrakingIntent = Object.freeze({
    NONE: 'none',
    BRAKE: 'brake'
});

export function isValidAvatarVehicleBrakingIntent(value) {
    return Object.values(AvatarVehicleBrakingIntent).includes(value);
}

export function deriveAvatarVehicleBrakingIntent({ brakeRequested = false } = {}) {
    return Boolean(brakeRequested)
        ? AvatarVehicleBrakingIntent.BRAKE
        : AvatarVehicleBrakingIntent.NONE;
}
