// 0.9.64 — Avatar Continuous Movement Intent.
//
// A small, closed vocabulary — NONE / FORWARD / BACKWARD — for one new
// question: does the avatar have a PERSISTENT forward/backward walking
// intent right now, independent of whether W/S is physically held down?
// Mirrors exactly the restraint core/AvatarVerticalState.js and
// core/AvatarAnimationState.js already apply to their own vocabularies —
// a NAME for a state, plus one pure function that decides it, never a
// class, never mutable bookkeeping of its own.
//
// This is deliberately NOT a second copy of core/AvatarMovementState.js.
// AvatarMovementState is a per-tick snapshot of "what axis is currently
// being asked for," rebuilt fresh every tick from whatever keys are
// physically down right now (see application/AvatarMovementController.js
// #_currentMovementState()). AvatarContinuousMovementIntent answers a
// different, longer-lived question — "should FORWARD (or BACKWARD) keep
// being asked for even after the key that started it is released" — and
// changes only on a deliberate activation or cancellation, never once per
// tick. The two are combined into one actual walk step by a later
// milestone (0.9.65); this file establishes only the vocabulary and its
// transition rule, and moves nothing.
//
// NONE is kept as an explicit third value — matching
// core/AvatarVerticalState.js's own SUPPORTED/RISING/FALLING and
// core/AvatarAnimationState.js's own IDLE — rather than representing
// "no continuous intent" as `null`/`undefined`. The existing movement
// architecture already has a natural way to represent "no intent" for
// ordinary, momentary WASD input (AvatarMovementState.idle()); this is a
// SEPARATE, longer-lived kind of intent, so it gets its own explicit
// at-rest value rather than borrowing that one or inventing an absence
// convention none of its siblings use.
//
// deriveAvatarContinuousMovementIntent() below is a pure TRANSITION
// function, not a stateless read like deriveAvatarVerticalState() — it
// takes the intent that already existed and the ONE new signal that just
// happened, and returns the intent that should exist now, exactly the
// same "caller owns the only mutable state, this file never remembers
// anything itself" discipline core/AvatarMovementSimulation.js already
// follows for verticalVelocity/grounded. The one new signal is
// deliberately already semantic — `direction` is 'forward'/'backward',
// never a raw key name ('w'/'s') or a raw physical modifier
// ('capslock') — mapping an actual keyboard event to this shape is
// explicitly future scope (0.9.66); see that milestone's own header once
// written for why a physical Caps Lock TOGGLE is deliberately never read
// directly as this activation signal.
//
//   direction            — 'forward' or 'backward': which of the two
//                           movement keys produced the key-DOWN event
//                           this call represents. Key-UP is deliberately
//                           never an input here at all — see below.
//   activationRequested  — true when this particular key-down asks to
//                           ACTIVATE (or switch) continuous movement in
//                           `direction` (e.g., the future input layer's
//                           own Caps Lock + W/S combination), false for
//                           an ordinary, momentary key-down.
//
// The transition rule collapses to one sentence: only an ACTIVATING
// press can ever SET this intent; any ORDINARY press can only ever CLEAR
// it, regardless of which direction it names. That single rule already
// produces every behavior the milestone brief asks for, with no separate
// cases to keep in sync:
//
//   activationRequested, NONE      -> that direction (e.g. CapsLock+W activates FORWARD)
//   activationRequested, FORWARD   -> re-activating the SAME direction is a no-op (still FORWARD)
//   activationRequested, opposite  -> re-activating the OTHER direction switches directly (FORWARD -> CapsLock+S -> BACKWARD)
//   ordinary press, matching       -> cancels (continuous FORWARD + a plain W tap -> NONE)
//   ordinary press, opposite       -> cancels (continuous FORWARD + a plain S tap -> NONE — the "obvious escape")
//   ordinary press, NONE           -> stays NONE (ordinary WASD walking is never touched by this file at all)
//
// Releasing a key — physical W/S, or Caps Lock itself — is never a
// signal this function reads. Once FORWARD is active, it stays active
// through any number of key-ups; only a subsequent key-DOWN (ordinary or
// activating) can ever change it. That is the entire point of the
// milestone: this is a change of MOVEMENT INTENT, not a simulation of a
// key being held down.
//
// Deliberately excluded, matching the explicit brief for this milestone:
// actual movement, AvatarMovementController/AvatarMovementState
// integration, timers, acceleration, speed changes, collision, camera,
// UI, persistence, raw keyboard/Caps-Lock event handling. See
// docs/Roadmap.md, 0.9.64, for the full list and the two milestones that
// follow it.
export const AvatarContinuousMovementIntent = Object.freeze({
    NONE: 'none',
    FORWARD: 'forward',
    BACKWARD: 'backward'
});

export function isValidAvatarContinuousMovementIntent(value) {
    return Object.values(AvatarContinuousMovementIntent).includes(value);
}

export function deriveAvatarContinuousMovementIntent({ currentIntent = AvatarContinuousMovementIntent.NONE, direction, activationRequested = false } = {}) {
    const safeCurrentIntent = isValidAvatarContinuousMovementIntent(currentIntent)
        ? currentIntent
        : AvatarContinuousMovementIntent.NONE;
    const requestedIntent = directionToIntent(direction);

    // An unrecognized direction is not a movement key-down at all, from
    // this function's point of view — nothing happened, so nothing
    // changes. Matches the "degrade gracefully" posture every other pure
    // function in this codebase already follows for malformed input.
    if (requestedIntent === null) {
        return safeCurrentIntent;
    }

    if (Boolean(activationRequested)) {
        return requestedIntent;
    }

    return AvatarContinuousMovementIntent.NONE;
}

function directionToIntent(direction) {
    switch (direction) {
        case 'forward': return AvatarContinuousMovementIntent.FORWARD;
        case 'backward': return AvatarContinuousMovementIntent.BACKWARD;
        default: return null;
    }
}
