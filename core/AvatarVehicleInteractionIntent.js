// 0.9.75 — Avatar-Vehicle Interaction Intent.
//
// 0.9.73 (core/AvatarVehicleProximity.js) gave an avatar a way to know
// WHETHER it is close enough to a vehicle to do something with it. 0.9.74
// (core/VehicleIdentity.js) gave that vehicle a stable name. Neither
// answers the one fact a future mounting transition cannot proceed
// without: did the AVATAR just ask to interact at all? Proximity is a
// derived geometric fact that exists whether or not anyone acts on it;
// this milestone is the first PLAYER ACTION in this vocabulary — the
// deliberate difference the design brief draws between three separate
// questions:
//
//   Proximity = "Can I interact with this vehicle?"      (0.9.73)
//   Intent    = "I am asking to interact with a vehicle." (this file)
//   Mounting  = "The world has established that I am mounted." (future)
//
// This file answers only the middle one, and — just as pointedly —
// answers it without knowing a vehicle exists at all. See "Deliberately
// NOT vehicle-aware" below.
//
//   AvatarVehicleInteractionIntent.NONE  — no interaction has been
//                                          requested right now.
//   AvatarVehicleInteractionIntent.MOUNT — the avatar just asked to
//                                          mount (whatever that ends up
//                                          meaning to a future milestone).
//
// Deliberately ONE-SHOT, not persistent like
// core/AvatarContinuousMovementIntent.js's own FORWARD/BACKWARD. That
// module's whole point is that a direction, once activated, keeps being
// asked for after the key that started it is released — a PERSISTENT
// MOVEMENT MODE. Mounting is not a mode; it is a single action request.
// Pressing the interaction key must produce one MOUNT request, never
// leave the avatar permanently "in" MOUNT intent the way continuous
// FORWARD leaves an avatar permanently walking. Holding the interaction
// key down (key-repeat) must stay harmless rather than spamming an
// avatar with mount attempts forever — see the transition rule below for
// exactly how that falls out for free.
//
// deriveAvatarVehicleInteractionIntent() below is a pure function of
// exactly ONE signal:
//
//   mountRequested — true when the caller's own input layer just
//                    observed an interaction request (e.g. a future
//                    input adapter translating an interaction key's
//                    key-down into this boolean, the same "raw fact in,
//                    semantic value out" seam
//                    core/AvatarContinuousMovementInputAdapter.js already
//                    established for continuous movement). false
//                    otherwise, including every ordinary tick where
//                    nothing was pressed.
//
// The transition rule is deliberately the smallest one that satisfies
// the brief's own table:
//
//   mountRequested: false -> NONE   (nothing asked, nothing pending)
//   mountRequested: true  -> MOUNT  (an interaction was just requested)
//
// which already produces every row the milestone brief asks for:
//
//   NONE  + no request -> NONE   (nothing happens)
//   NONE  + mount       -> MOUNT (the request registers)
//   MOUNT + no request  -> NONE  (the request is CONSUMED the moment the
//                                 caller stops asserting it — this is the
//                                 "one-shot" behavior: whatever reads
//                                 MOUNT once and then calls again without
//                                 `mountRequested` clears it right back
//                                 to NONE, exactly like releasing and
//                                 re-checking a one-shot event flag)
//   MOUNT + mount       -> MOUNT (holding the key down / key-repeat is
//                                 harmless and idempotent, never a second
//                                 distinct request)
//
// A caller MAY still pass `currentIntent` in the options object (e.g. a
// caller that keeps one shared options shape across this function and
// core/AvatarContinuousMovementIntent.js's own `currentIntent`) — it is
// simply ignored, the identical precedent
// core/AvatarContinuousMovementMode.js's own header already establishes
// for `currentMode`: the outcome here is already fully determined by
// `mountRequested` alone, so there is nothing for a remembered past
// value to influence, valid or otherwise.
//
// DELIBERATELY NOT VEHICLE-AWARE. The brief is explicit that this
// milestone must not prematurely combine "what action did the avatar
// request" with "which vehicle, if any, should receive it" — the exact
// two questions core/AvatarVehicleProximity.js's own header already
// refused to combine when it declined to build a
// `nearestVehicleToAvatar()`. So this file's vocabulary carries no
// `vehicleId`, no candidate list, and its transition function never
// receives a VehiclePresence, a position, or a proximity result. It does
// not even know the eventual action is performed ON a vehicle — MOUNT is
// simply the name of the one interaction this codebase currently has a
// use for. A later milestone combines MOUNT intent + a candidate vehicle
// + proximity into an actual mount transition; this file only ever
// supplies the first ingredient.
//
// DELIBERATELY NOT DECIDING THE KEYBOARD KEY. Exactly like
// core/AvatarContinuousMovementIntent.js kept 'forward'/'backward'
// semantic rather than reading a raw key name, this file never sees a
// key, a KeyboardEvent, or a modifier. `mountRequested` is already
// semantic ("an interaction was requested"), not raw ("E was pressed").
// Translating an actual keyboard event into that boolean is future input
// layer work, the same way core/AvatarContinuousMovementInputAdapter.js
// was split out as its own later milestone rather than folded into
// core/AvatarContinuousMovementIntent.js itself.
//
// Deliberately excluded, matching this milestone's own brief: any
// vehicle awareness (VehiclePresence, vehicle ids, vehicle types),
// proximity or `withinRange`, mounting/dismounting as an actual world
// effect, an avatar-vehicle relationship field, avatar position, nearest-
// vehicle selection, keyboard/controller input handling of any kind,
// rendering, movement, collision, physics, persistence, randomness, or
// the clock. This file answers only "what interaction, if any, was just
// requested," nothing else.
export const AvatarVehicleInteractionIntent = Object.freeze({
    NONE: 'none',
    MOUNT: 'mount'
});

export function isValidAvatarVehicleInteractionIntent(value) {
    return Object.values(AvatarVehicleInteractionIntent).includes(value);
}

export function deriveAvatarVehicleInteractionIntent({ mountRequested = false } = {}) {
    return Boolean(mountRequested)
        ? AvatarVehicleInteractionIntent.MOUNT
        : AvatarVehicleInteractionIntent.NONE;
}
