// 0.9.67 — Continuous Movement Mode Vocabulary.
//
// 0.9.64–0.9.66 established persistent DIRECTION — does the avatar keep
// walking FORWARD or BACKWARD after Caps Lock + W/S is released. That
// answers only one of the two questions continuous running needs
// answered: `application/AvatarMovementController.js` already has an
// existing, ordinary concept of running (`AvatarMovementState.running`,
// driven by Shift — see core/AvatarMovementState.js), completely
// orthogonal to direction. This milestone is the SECOND, independent
// vocabulary continuous movement needs — persistent WALK/RUN — built the
// exact same way 0.9.64 built the first one: a small, closed vocabulary
// plus one pure transition function, nothing more.
//
// Deliberately a SEPARATE file from core/AvatarContinuousMovementIntent.js,
// not a fourth/fifth value bolted onto it
// (CONTINUOUS_FORWARD_WALK/CONTINUOUS_FORWARD_RUN/...). Direction and
// mode are independent dimensions — see docs/Roadmap.md, 0.9.67 — and
// mixing them into one vocabulary would mean every consumer that only
// cares about direction (or only about mode) has to pattern-match all
// four/six combinations instead of reading one value. This mirrors the
// same reasoning that already keeps AvatarMovementState's own
// `forwardAxis` and `running` two separate fields rather than a single
// combined enum.
//
//   AvatarContinuousMovementMode.NONE — no persistent mode; continuous
//                                       movement is not active at all.
//   AvatarContinuousMovementMode.WALK — persistent movement at ordinary
//                                       (walking) speed.
//   AvatarContinuousMovementMode.RUN  — persistent movement at running
//                                       speed.
//
// `NONE` is kept as an explicit third value for exactly the reason
// core/AvatarContinuousMovementIntent.js's own header already gives for
// its own NONE: matching core/AvatarVerticalState.js's
// SUPPORTED/RISING/FALLING and core/AvatarAnimationState.js's IDLE,
// rather than representing "no persistent mode" as `null`/`undefined`.
// It also keeps this vocabulary's own shape a direct structural mirror
// of AvatarContinuousMovementIntent's NONE/FORWARD/BACKWARD — three
// values, one of them the explicit at-rest case — which is deliberate:
// the two are meant to be read side by side wherever a later milestone
// combines them.
//
// deriveAvatarContinuousMovementMode() below is a pure TRANSITION
// function, following the identical discipline
// deriveAvatarContinuousMovementIntent() already established: it takes
// the mode that already existed plus the ONE new signal that just
// happened, and returns the mode that should exist now. The caller owns
// the only mutable state; this file never remembers anything itself.
//
//   activationRequested — true when this key-down asks to ACTIVATE (or
//                          re-activate) continuous movement at all —
//                          the exact same signal
//                          deriveAvatarContinuousMovementIntent() already
//                          reads under this name, and expected to be the
//                          SAME boolean passed to both functions for the
//                          same key event once a later milestone wires
//                          them together (0.9.68). false for an
//                          ordinary, momentary key-down.
//   runRequested         — true when this particular activating press
//                          asks for RUN rather than WALK (e.g. the
//                          future input layer's own Caps Lock + Shift +
//                          W/S chord). Meaningless, and ignored, when
//                          `activationRequested` is false — an ordinary
//                          press cancels mode regardless of whether
//                          Shift happens to also be down.
//
// The transition rule is the direct structural twin of
// deriveAvatarContinuousMovementIntent()'s own: only an ACTIVATING press
// can ever SET this mode; any ORDINARY press can only ever CLEAR it.
// Where the intent's own rule additionally distinguishes "same" from
// "opposite" direction (because FORWARD and BACKWARD are both
// directions a press can name), mode has no such distinction to make —
// `runRequested` is not "a mode the press names," it is "whether THIS
// activation wants running," so re-activating with a different
// `runRequested` value is a plain, direct switch, not a special case:
//
//   activationRequested,  runRequested: false, NONE -> WALK   (CapsLock+W activates persistent WALK)
//   activationRequested,  runRequested: true,  NONE -> RUN    (CapsLock+Shift+W activates persistent RUN)
//   activationRequested,  runRequested: false, WALK -> WALK   (re-activating WALK is idempotent, not a toggle-off)
//   activationRequested,  runRequested: true,  RUN  -> RUN    (same idempotence for RUN)
//   activationRequested,  runRequested: true,  WALK -> RUN    (re-activating with Shift now held switches WALK -> RUN directly)
//   activationRequested,  runRequested: false, RUN  -> WALK   (and back, RUN -> WALK, releasing Shift and re-activating)
//   ordinary press (any runRequested), any mode      -> NONE  (an ordinary W/S tap cancels persistent mode exactly as it cancels persistent direction)
//
// Key-UP — of W, S, Shift, or Caps Lock itself — is never an input this
// function reads, for the identical reason
// deriveAvatarContinuousMovementIntent() never reads one (see that
// file's own header): only a subsequent key-DOWN can ever change the
// mode, which is the entire mechanism by which "release every key and
// the avatar keeps running" works.
//
// Deliberately excluded, matching the explicit brief for this milestone:
// any keyboard/Caps-Lock/Shift event handling (that translation is
// 0.9.68's own job, the direct mode-vocabulary counterpart to 0.9.65),
// any change to core/AvatarContinuousMovementIntent.js,
// application/AvatarMovementController.js, or core/AvatarMovementState.js
// (wiring this mode into the movement pipeline is 0.9.69's job, the
// counterpart to 0.9.66), actual avatar movement, speed values of any
// kind, timers, collision, camera, UI, persistence. This file answers
// only "what persistent MODE should exist," never how fast that mode
// actually moves the avatar — that number already lives entirely inside
// core/AvatarMovementSimulation.js and is left untouched.
export const AvatarContinuousMovementMode = Object.freeze({
    NONE: 'none',
    WALK: 'walk',
    RUN: 'run'
});

export function isValidAvatarContinuousMovementMode(value) {
    return Object.values(AvatarContinuousMovementMode).includes(value);
}

// A caller MAY still pass `currentMode` in the options object (e.g. a
// caller that keeps one shared options shape across both this function
// and deriveAvatarContinuousMovementIntent()'s own `currentIntent`) —
// it is simply ignored. Unlike direction (where FORWARD vs. BACKWARD
// vs. re-activating the SAME direction are three different outcomes
// deriveAvatarContinuousMovementIntent() must distinguish by reading
// `currentIntent`), the outcome here is already fully determined by
// `activationRequested`/`runRequested` alone — unaffected by what mode,
// valid or otherwise, happened to be active a moment ago. So a malformed
// `currentMode` needs no defensive sanitizing here: it can never reach
// this function's return value in the first place.
export function deriveAvatarContinuousMovementMode({ activationRequested = false, runRequested = false } = {}) {
    if (!Boolean(activationRequested)) {
        return AvatarContinuousMovementMode.NONE;
    }

    return Boolean(runRequested)
        ? AvatarContinuousMovementMode.RUN
        : AvatarContinuousMovementMode.WALK;
}
