// 0.9.79 — Avatar-Vehicle Dismount Intent.
//
// 0.9.78 (core/AvatarVehicleMountTransition.js) closed the mounting path:
// an intent (0.9.75) plus a resolved target (0.9.76) can now become a
// real, persistent AvatarVehicleMount (0.9.77). But that whole chain only
// ever moves an avatar ONE way — unmounted -> mounted. Nothing in this
// codebase yet answers the mirror-image question a mounted avatar
// eventually needs answered: did the avatar just ask to LEAVE the
// vehicle it is on?
//
// That is deliberately NOT the same question 0.9.75 answers, and it does
// not reuse 0.9.75's vocabulary. Mounting and dismounting only LOOK like
// opposites; their downstream needs differ. A mount transition needs
// just two ingredients — an intent, and a resolved target vehicle
// (0.9.78's own "the one rule this milestone adds"). A dismount
// transition will eventually need a destination-space decision this
// codebase has no machinery for yet: avatar orientation, vehicle
// geometry, terrain, collision clearance — see 0.9.78's own "Mounting
// only, no dismounting" for the exact list of questions dismounting
// still owes an answer. Folding dismount intent into
// AvatarVehicleInteractionIntent, or building a combined
// `AvatarVehicleActionIntent`, would only save a few lines today while
// hard-wiring MOUNT and DISMOUNT together before either one's downstream
// shape is settled. So this is its own file, its own vocabulary:
//
//   AvatarVehicleDismountIntent.NONE     — no dismount has been
//                                          requested right now.
//   AvatarVehicleDismountIntent.DISMOUNT — the avatar just asked to
//                                          leave whatever it is mounted
//                                          on (whatever that ends up
//                                          meaning to a future
//                                          milestone).
//
// Deliberately ONE-SHOT, the identical discipline
// core/AvatarVehicleInteractionIntent.js already established for MOUNT,
// not persistent like core/AvatarContinuousMovementIntent.js's own
// FORWARD/BACKWARD. Dismounting is not a mode; it is a single action
// request. Pressing the dismount key must produce one DISMOUNT request,
// never leave the avatar permanently "in" DISMOUNT intent. Holding the
// dismount key down (key-repeat) must stay harmless rather than spamming
// a future transition with dismount attempts forever — see the
// transition rule below for exactly how that falls out for free.
//
// deriveAvatarVehicleDismountIntent() below is a pure function of
// exactly ONE signal:
//
//   dismountRequested — true when the caller's own input layer just
//                        observed a dismount request (e.g. a future
//                        input adapter translating a dismount key's
//                        key-down into this boolean, the same "raw fact
//                        in, semantic value out" seam
//                        core/AvatarContinuousMovementInputAdapter.js and
//                        core/AvatarVehicleInteractionIntent.js's own
//                        `mountRequested` already established). false
//                        otherwise, including every ordinary tick where
//                        nothing was pressed.
//
// The transition rule is deliberately the smallest one that satisfies
// the brief's own table, mirroring 0.9.75's own row-for-row shape:
//
//   dismountRequested: false -> NONE      (nothing asked, nothing pending)
//   dismountRequested: true  -> DISMOUNT  (a dismount was just requested)
//
// which already produces every row the milestone brief asks for:
//
//   NONE     + no request -> NONE      (nothing happens)
//   NONE     + dismount    -> DISMOUNT (the request registers)
//   DISMOUNT + no request  -> NONE     (the request is CONSUMED the
//                                       moment the caller stops
//                                       asserting it — this is the
//                                       "one-shot" behavior: whatever
//                                       reads DISMOUNT once and then
//                                       calls again without
//                                       `dismountRequested` clears it
//                                       right back to NONE, exactly like
//                                       releasing and re-checking a
//                                       one-shot event flag)
//   DISMOUNT + dismount    -> DISMOUNT (holding the key down /
//                                       key-repeat is harmless and
//                                       idempotent, never a second
//                                       distinct request)
//
// A caller MAY still pass `currentIntent` in the options object (e.g. a
// caller that keeps one shared options shape across this function and
// core/AvatarVehicleInteractionIntent.js's own `currentIntent`) — it is
// simply ignored, the identical precedent that file's own header already
// establishes: the outcome here is already fully determined by
// `dismountRequested` alone, so there is nothing for a remembered past
// value to influence, valid or otherwise.
//
// DELIBERATELY NOT VEHICLE-AWARE. Exactly like 0.9.75 refused to know a
// vehicle exists at all, this file's vocabulary carries no `vehicleId`,
// no candidate list, and its transition function never receives a
// VehiclePresence, a position, or a proximity result.
//
// DELIBERATELY NOT MOUNT-STATE-AWARE. This is the one architectural
// property this milestone insists on above all others: the intent does
// not need to know whether the avatar is actually mounted right now.
// deriveAvatarVehicleDismountIntent() never imports
// core/AvatarVehicleMount.js, never reads an AvatarVehicleMount value,
// and has no `currentMount` parameter of any kind. A DISMOUNT request
// fired while nothing is mounted is not this file's problem to prevent —
// a higher layer (a future dismount transition, mirroring 0.9.78's own
// `deriveAvatarVehicleMount()`) decides whether a dismount request is
// meaningful given the avatar's actual mount state. This file only ever
// answers "did the avatar just ask to leave," nothing about what it is
// currently on, if anything.
//
// DELIBERATELY NOT DECIDING THE KEYBOARD KEY. Exactly like 0.9.75 never
// saw a key, a KeyboardEvent, or a modifier, this file does not either.
// `dismountRequested` is already semantic ("a dismount was requested"),
// not raw ("F was pressed"). Translating an actual keyboard event into
// that boolean is future input layer work.
//
// NO DISMOUNT TRANSITION HERE. This file does not decide where the
// avatar ends up, does not touch core/AvatarVehicleMount.js or
// core/AvatarVehicleMountTransition.js, and does not compute a position,
// check terrain, or check collision. See docs/Roadmap.md, 0.9.79, "Why
// not implement dismount transition immediately" for why that machinery
// is deliberately left for a later milestone once this intent exists to
// drive it.
//
// Deliberately excluded, matching this milestone's own brief: any
// vehicle awareness (VehiclePresence, vehicle ids, vehicle types), any
// mount-state awareness (AvatarVehicleMount, mounted/unmounted, a
// currentMount parameter), proximity or `withinRange`, the actual
// dismount transition or any position/terrain/collision-clearance
// vocabulary, mounting or MOUNT intent, keyboard/controller input
// handling of any kind, rendering, movement, collision, physics,
// persistence, randomness, or the clock. This file answers only "what
// dismount, if any, was just requested," nothing else.
export const AvatarVehicleDismountIntent = Object.freeze({
    NONE: 'none',
    DISMOUNT: 'dismount'
});

export function isValidAvatarVehicleDismountIntent(value) {
    return Object.values(AvatarVehicleDismountIntent).includes(value);
}

export function deriveAvatarVehicleDismountIntent({ dismountRequested = false } = {}) {
    return Boolean(dismountRequested)
        ? AvatarVehicleDismountIntent.DISMOUNT
        : AvatarVehicleDismountIntent.NONE;
}
