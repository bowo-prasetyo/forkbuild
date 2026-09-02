// 0.9.65 — Avatar Continuous Movement Input Adapter.
//
// 0.9.64 (core/AvatarContinuousMovementIntent.js) defined the MEANING of
// a continuous-movement transition — `direction` ('forward'/'backward')
// plus an already-resolved `activationRequested` boolean — but
// deliberately had no idea a keyboard exists. This milestone is the seam
// that produces that shape from an actual keyboard event, and nothing
// more: it is an INPUT INTERPRETATION step, not controller integration.
// Wiring the resulting transitions into AvatarMovementController's
// actual movement pipeline is explicitly deferred to 0.9.66 — see
// docs/Roadmap.md.
//
// deriveAvatarContinuousMovementInputEvent() below reads exactly two
// kinds of raw fact — which key, and whether it went down or up — plus
// one piece of caller-owned state carried between calls: whether the
// physical Caps Lock KEY is currently being held down. It returns that
// same piece of state, updated, alongside either `null` (this event has
// no continuous-movement meaning at all) or a `transition` object shaped
// exactly like 0.9.64's own parameters — { direction, activationRequested }
// — ready to pass straight through to deriveAvatarContinuousMovementIntent().
// Nothing here calls that function itself: this file has no idea a
// "continuous movement intent" is even being tracked, let alone what its
// current value is. Same "caller owns the only mutable state, this file
// never remembers anything itself" discipline 0.9.64 already follows for
// `currentIntent` — here applied to `capsLockDown` instead.
//
// Why track capsLockDown (a physical HOLD) rather than read
// event.getModifierState('CapsLock') (the TOGGLE): the toggle reflects
// whether Caps Lock is currently "ON," which has nothing to do with
// whether the player is deliberately CHORDING it with W/S right now.
// Reading the toggle would mean anyone who happens to have Caps Lock on
// for unrelated reasons (writing in all caps, an accidental tap earlier)
// would activate continuous movement the instant they press an ordinary
// W — exactly the false positive the design brief calls out. Tracking
// the physical key's own down/up state instead means continuous movement
// only ever activates from an actual, deliberate Caps-Lock-held-down-
// while-pressing-W/S chord, indistinguishable in kind from holding Shift
// to run.
//
//   capsLockDown — the CALLER's current belief about whether the
//                  physical Caps Lock key is held down, from the
//                  previous call's own returned `capsLockDown` (or
//                  `false` for the very first event of a session).
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
//   W or S key down      -> transition { direction, activationRequested: capsLockDown }
//   W or S key up        -> no transition (key-up is never a signal —
//                            see 0.9.64's own header for why)
//   anything else, any type -> capsLockDown unchanged; no transition
//
// That single rule already produces every behavior the milestone brief
// asks for: an ordinary W (capsLockDown false) becomes an ORDINARY press
// (activationRequested: false), which 0.9.64 already turns into a
// cancellation; a Caps-Lock-held W becomes an ACTIVATING press
// (activationRequested: true), which 0.9.64 already turns into
// activation/switching. Nothing here decides what either press MEANS
// for the current intent — that authority stays entirely inside
// deriveAvatarContinuousMovementIntent(), exactly as the design brief
// insists: "Input = what happened, Intent = what it means, Movement =
// what the avatar does" are three different concerns, and this file is
// only ever the first one.
//
// Key-repeat (holding a key down long enough for the browser to fire
// repeated keydown events) needs no special handling: repeated identical
// input here just produces the identical `transition` shape each time,
// and 0.9.64's own transition rule is already idempotent for a repeated
// activation (SAME direction while already active stays active) and for
// a repeated ordinary press (already NONE stays NONE) — see that file's
// own tests 12/13/20/21. This file does not need to know that.
//
// Deliberately excluded, matching the explicit brief for this milestone:
// actual avatar movement, any change to AvatarMovementController or
// AvatarMovementState, calling deriveAvatarContinuousMovementIntent()
// itself, timers, animation frames, DOM/window event listener wiring,
// camera, UI, persistence. Those belong to 0.9.66 (the milestone that
// actually wires this adapter's output into the movement pipeline).
export function deriveAvatarContinuousMovementInputEvent({ capsLockDown = false, key, type } = {}) {
    const safeCapsLockDown = Boolean(capsLockDown);
    const normalizedKey = String(key || '').toLowerCase();
    const isKeyUp = type === 'keyup';

    if (normalizedKey === 'capslock') {
        return { capsLockDown: !isKeyUp, transition: null };
    }

    if (isKeyUp) {
        return { capsLockDown: safeCapsLockDown, transition: null };
    }

    const direction = directionForKey(normalizedKey);
    if (direction === null) {
        return { capsLockDown: safeCapsLockDown, transition: null };
    }

    return {
        capsLockDown: safeCapsLockDown,
        transition: { direction, activationRequested: safeCapsLockDown }
    };
}

function directionForKey(key) {
    switch (key) {
        case 'w': return 'forward';
        case 's': return 'backward';
        default: return null;
    }
}
