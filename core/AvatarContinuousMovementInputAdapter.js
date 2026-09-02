// 0.9.65 / 0.9.68 — Avatar Continuous Movement Input Adapter.
//
// 0.9.64 (core/AvatarContinuousMovementIntent.js) defined the MEANING of
// a continuous-movement DIRECTION transition — `direction`
// ('forward'/'backward') plus an already-resolved `activationRequested`
// boolean. 0.9.67 (core/AvatarContinuousMovementMode.js) defined the
// MEANING of a continuous-movement MODE transition — the same
// `activationRequested` plus `runRequested`. Both are deliberately
// keyboard-blind: neither has any idea a Caps Lock or Shift key exists.
// This file is the one seam that produces BOTH shapes from an actual
// keyboard event — it is an INPUT INTERPRETATION step, not controller
// integration. Wiring the resulting DIRECTION transition into
// AvatarMovementController was 0.9.66; wiring the resulting MODE
// transition is explicitly deferred to 0.9.69 — see docs/Roadmap.md.
//
// deriveAvatarContinuousMovementInputEvent() below reads exactly two
// kinds of raw fact — which key, and whether it went down or up — plus
// two pieces of caller-owned state carried between calls: whether the
// physical Caps Lock key is currently held down, and whether the
// physical Shift key is currently held down. It returns that same state,
// updated, alongside either `null` (this event has no continuous-
// movement meaning at all) or a `transition` object carrying every fact
// BOTH 0.9.64's and 0.9.67's own transition functions need —
// { direction, activationRequested, runRequested } — ready to pass
// straight through to either one. Nothing here calls either function
// itself: this file has no idea a "continuous movement intent" or a
// "continuous movement mode" is even being tracked, let alone what its
// current value is. Same "caller owns the only mutable state, this file
// never remembers anything itself" discipline 0.9.65 already followed
// for `capsLockDown` — here extended to `shiftDown` alongside it.
//
// Why track capsLockDown/shiftDown (physical HOLDS) rather than read
// event.getModifierState('CapsLock'/'Shift') (TOGGLE/transient event
// state): see this file's own 0.9.65 reasoning, unchanged by this
// milestone — a physical hold this file tracks itself is the only way
// to tell a deliberate CHORD from an unrelated coincidence (Caps Lock
// already being ON for unrelated reasons; `event.shiftKey` would work
// for Shift specifically, but reading Caps Lock and Shift two different
// ways would make the resulting chord logic depend on which of the two
// modifiers happened to be held, which is exactly the kind of
// inconsistency this adapter exists to avoid).
//
//   capsLockDown — the CALLER's current belief about whether the
//                  physical Caps Lock key is held down, from the
//                  previous call's own returned `capsLockDown` (or
//                  `false` for the very first event of a session).
//   shiftDown    — the CALLER's current belief about whether the
//                  physical Shift key is held down, from the previous
//                  call's own returned `shiftDown` (or `false` for the
//                  very first event of a session). Tracked the exact
//                  same way, for the exact same reason, as
//                  `capsLockDown` — see 0.9.65's own header.
//   key          — the raw key name, e.g. a KeyboardEvent's own `.key`
//                  ('w', 'S', 'CapsLock', 'Shift', ...). Compared
//                  case-insensitively, matching every other raw-key
//                  comparison already in this codebase (see
//                  application/AvatarMovementController.js#_setKey).
//   type         — 'keydown' or 'keyup'. Anything else is treated as
//                  'keydown', matching this codebase's "degrade
//                  gracefully" posture for malformed input.
//
// The translation rule:
//
//   Caps Lock key down   -> capsLockDown becomes true;  no transition
//   Caps Lock key up     -> capsLockDown becomes false; no transition
//   Shift key down       -> shiftDown becomes true;     no transition
//   Shift key up         -> shiftDown becomes false;    no transition
//   W or S key down      -> transition { direction, activationRequested: capsLockDown, runRequested: shiftDown }
//   W or S key up        -> no transition (key-up is never a signal —
//                            see 0.9.64's and 0.9.67's own headers for why)
//   anything else, any type -> capsLockDown/shiftDown unchanged; no transition
//
// `runRequested` is reported as the raw physical Shift-hold fact on
// EVERY W/S key-down, activating or not — this file never asks "does
// runRequested matter right now?" That question already has an answer,
// but it belongs entirely to deriveAvatarContinuousMovementMode(), which
// documents (0.9.67) that `runRequested` is "meaningless, and ignored,
// when activationRequested is false." Reporting it unconditionally here
// keeps this file a pure fact-reporter — current physical modifier
// state, nothing more — exactly like `activationRequested` itself was
// already reported unconditionally by 0.9.65. This is also why the
// milestone brief's own "Shift determines the requested continuous
// movement mode only when Caps Lock is physically held" reads correctly
// end to end without this file needing to encode that rule anywhere:
// the rule already lives entirely inside deriveAvatarContinuousMovementMode()'s
// own `activationRequested` gate, and this file simply hands both raw
// facts over.
//
// A deliberate divergence from the milestone brief's own literal
// "extend the result to { direction, mode, activationRequested }"
// wording: this file reports `runRequested` (the raw physical Shift
// fact), never a computed `mode` (WALK/RUN). Computing `mode` here would
// mean re-implementing deriveAvatarContinuousMovementMode()'s own
// activationRequested-gated WALK-vs-RUN decision a second time, in a
// second place — exactly the "combined transition vocabulary" the
// brief's own "Transition composition" section says NOT to build, and
// exactly the "this adapter decides the avatar should now run" framing
// its own "What 0.9.68 should deliberately NOT do" section rules out.
// `runRequested` is the one raw fact deriveAvatarContinuousMovementMode()
// itself already declares as its expected input (see 0.9.67's own
// header); reporting exactly that, and nothing derived from it, is what
// keeps this file's role "what happened," never "what it means."
//
// That single rule already produces every behavior the milestone brief
// asks for:
//
//   ordinary W/S (capsLockDown false)            -> activationRequested: false
//     -> deriveAvatarContinuousMovementIntent() cancels persistent direction
//     -> deriveAvatarContinuousMovementMode() cancels persistent mode
//   CapsLock-held W/S, Shift NOT held             -> activationRequested: true,  runRequested: false
//     -> intent activates/switches; mode resolves to WALK
//   CapsLock-held W/S, Shift ALSO held            -> activationRequested: true,  runRequested: true
//     -> intent activates/switches; mode resolves to RUN
//
// Nothing here decides what either press MEANS for the current intent
// or the current mode — that authority stays entirely inside
// deriveAvatarContinuousMovementIntent() and
// deriveAvatarContinuousMovementMode(), exactly as the design brief
// insists: "Input = what happened, Intent/Mode = what it means,
// Movement = what the avatar does" are different concerns, and this
// file is only ever the first one.
//
// Modifier-order independence: because capsLockDown/shiftDown are both
// plain current-state booleans, not a record of WHICH order the two
// modifiers were pressed in, "Shift down, then Caps Lock down, then W"
// and "Caps Lock down, then Shift down, then W" produce byte-identical
// transitions. This file is concerned with current physical modifier
// FACTS, never the history that produced them.
//
// Key-repeat (holding a key down long enough for the browser to fire
// repeated keydown events) needs no special handling: repeated identical
// input here just produces the identical `transition` shape each time,
// and both 0.9.64's and 0.9.67's own transition rules are already
// idempotent for a repeated activation and for a repeated ordinary press
// — see those files' own tests. This file does not need to know that.
//
// Deliberately excluded, matching the explicit brief for this milestone:
// actual avatar movement, any change to AvatarMovementController or
// AvatarMovementState, calling deriveAvatarContinuousMovementIntent() or
// deriveAvatarContinuousMovementMode() itself, a combined
// direction+mode vocabulary, timers, animation frames, DOM/window event
// listener wiring, camera, UI, persistence. Those belong to 0.9.69 (the
// milestone that wires this adapter's mode-facing output into the
// movement pipeline, the direct counterpart to 0.9.66).
export function deriveAvatarContinuousMovementInputEvent({ capsLockDown = false, shiftDown = false, key, type } = {}) {
    const safeCapsLockDown = Boolean(capsLockDown);
    const safeShiftDown = Boolean(shiftDown);
    const normalizedKey = String(key || '').toLowerCase();
    const isKeyUp = type === 'keyup';

    if (normalizedKey === 'capslock') {
        return { capsLockDown: !isKeyUp, shiftDown: safeShiftDown, transition: null };
    }

    if (normalizedKey === 'shift') {
        return { capsLockDown: safeCapsLockDown, shiftDown: !isKeyUp, transition: null };
    }

    if (isKeyUp) {
        return { capsLockDown: safeCapsLockDown, shiftDown: safeShiftDown, transition: null };
    }

    const direction = directionForKey(normalizedKey);
    if (direction === null) {
        return { capsLockDown: safeCapsLockDown, shiftDown: safeShiftDown, transition: null };
    }

    return {
        capsLockDown: safeCapsLockDown,
        shiftDown: safeShiftDown,
        transition: { direction, activationRequested: safeCapsLockDown, runRequested: safeShiftDown }
    };
}

function directionForKey(key) {
    switch (key) {
        case 'w': return 'forward';
        case 's': return 'backward';
        default: return null;
    }
}
