// 0.9.95 — Vehicle Braking Input Adapter.
//
// core/AvatarVehicleBrakingIntent.js (this milestone's own sibling file,
// immediately preceding this one) defined the MEANING of a braking
// request — `brakeRequested` in, NONE/BRAKE out — and was deliberately
// keyboard-blind: it has no idea a key, a mouse button, or a gamepad
// trigger exists. Something still has to produce that `brakeRequested`
// boolean from an actual physical event. This file is that ONE seam —
// an INPUT INTERPRETATION step, not controller integration and not
// intent derivation — the same role
// core/AvatarContinuousMovementInputAdapter.js already established for
// continuous movement: "Input = what happened, Intent = what it means"
// are different concerns, and this file is only ever the first one.
//
// deriveAvatarVehicleBrakingInputFact() below reads exactly one raw
// fact — `type`, the physical brake CONTROL'S own transition, exactly
// as generic as a keyboard's own 'keydown'/'keyup' but named after the
// CONTROL rather than a KEY, because this milestone deliberately does
// not yet know what physical control produces it:
//
//   type: 'brakedown' — the brake control was just pressed/engaged.
//   type: 'brakeup'   — the brake control was just released/disengaged.
//
// and returns `{ brakeRequested: boolean }` — ready to pass straight
// through to core/AvatarVehicleBrakingIntent.js#deriveAvatarVehicleBrakingIntent().
// Nothing here calls that function itself: this file has no idea a
// "braking intent" is even being tracked, let alone what its current
// value is — the identical "caller wires the two together" discipline
// core/AvatarContinuousMovementInputAdapter.js's own header already
// establishes for its own `transition` output.
//
// WHY `type: 'brakedown'/'brakeup'` RATHER THAN A KEYBOARD-SHAPED EVENT
// (`{ key, type: 'keydown'/'keyup' }`, the shape
// core/AvatarContinuousMovementInputAdapter.js itself reads). That
// adapter's own `key`/`directionForKey()` pairing is exactly the piece
// this milestone's own brief insists must NOT be written yet: "I would
// not decide the actual key in this milestone... that binding can be
// decided at the application/input boundary later." Naming this file's
// own event types after the CONTROL ('brakedown'/'brakeup') rather than
// a KEY keeps that promise structurally, not just by convention — there
// is no `key` parameter here for a future caller to accidentally start
// comparing against `'Space'` or `'s'`. Whatever eventually produces
// `type: 'brakedown'` — a dedicated key's keydown, a gamepad trigger
// crossing a threshold, a mouse button, or (per the milestone's own
// brief) "an automated vehicle-control source" — this file's own
// translation rule is identical either way, and this file never learns
// which one it was.
//
// The translation rule is deliberately the smallest one that satisfies
// the brief's own shape:
//
//   type: 'brakedown' -> { brakeRequested: true  }
//   type: 'brakeup'   -> { brakeRequested: false }
//   anything else     -> { brakeRequested: false } (degrades gracefully,
//                         matching this codebase's own "unrecognized
//                         input never crashes, never leaves a stale
//                         request pending" posture)
//
// STATELESS, UNLIKE core/AvatarContinuousMovementInputAdapter.js's OWN
// `altDown`/`shiftDown` — DELIBERATELY. That adapter has to remember a
// modifier's own hold state ACROSS calls because the W/S key-down event
// it ultimately reports on carries no memory of a PREVIOUS, DIFFERENT
// key's (Alt's) own state. Braking has no such chord to resolve: the
// brake control's own down/up transition already IS the complete fact
// this file needs, in the very same call that reports it — exactly the
// same reason `application/AvatarMovementController.js`'s own
// `_setKey()` needs no cross-call bookkeeping to track `_keys.jumpHeld`
// from Space's own keydown/keyup. So this function takes no caller-owned
// state in, returns none out, and — because it remembers nothing between
// calls — repeating the identical `type` any number of times always
// produces the identical, idempotent result.
//
// Deliberately excluded, matching the explicit brief for this milestone:
// deciding the actual key, mouse button, or gamepad trigger (see
// "WHY... deliberately" above), calling
// deriveAvatarVehicleBrakingIntent() itself, any change to
// AvatarMovementController or AvatarMovementState, throttle semantics,
// a combined brake+throttle vocabulary, timers, animation frames,
// DOM/window event listener wiring, camera, UI, persistence. Those
// belong to a later milestone — see docs/Roadmap.md, 0.9.95/0.9.96.
export function deriveAvatarVehicleBrakingInputFact({ type } = {}) {
    const normalizedType = String(type || '').toLowerCase();
    return { brakeRequested: normalizedType === 'brakedown' };
}
