import { VehicleSteeringDirection } from './VehicleSteeringIntent.js';

// 0.9.128 — Vehicle Steering Input Adapter.
//
// 0.9.127 wired `core/VehicleSteeringIntent.js`/`core/VehicleSteeringSimulation.js`
// into the real mounted-vehicle pipeline through `application/WorldNavigationSession.js#
// setVehicleSteeringIntent()` — a plain, programmatic seam, deliberately never a
// key binding (see that milestone's own "What this milestone deliberately does
// NOT do"). This file is the missing half: an INPUT INTERPRETATION step, the
// direct structural twin of `core/AvatarVehicleBrakingInputAdapter.js`, that
// turns an actual physical steering control's own transition into the raw fact
// a caller needs to build a `VehicleSteeringIntent` — nothing more.
//
//   Keyboard / controller input
//           |
//           v
//   VehicleSteeringInputAdapter (this file)   <- "what happened"
//           |
//           v
//   VehicleSteeringIntent                     <- "what the driver requests"
//           |
//           v
//   VehicleSteeringSimulation / AvatarVehicleMovementController#tick()
//
// deriveVehicleSteeringInputEvent() below reads exactly one raw fact — `type`,
// the physical steering control's own transition, named after the CONTROL
// rather than a KEY, exactly like `core/AvatarVehicleBrakingInputAdapter.js`'s
// own `brakedown`/`brakeup` — because this file deliberately does not know
// what physical control produces it:
//
//   type: 'steerleftdown'  — the LEFT steering control was just engaged.
//   type: 'steerleftup'    — the LEFT steering control was just released.
//   type: 'steerrightdown' — the RIGHT steering control was just engaged.
//   type: 'steerrightup'   — the RIGHT steering control was just released.
//
// and returns `{ leftHeld, rightHeld, direction }` — `leftHeld`/`rightHeld`
// are the CALLER's own updated hold bits (fed back in on the next call,
// exactly like `core/AvatarContinuousMovementInputAdapter.js`'s own
// `altDown`/`shiftDown`), and `direction` is either `null` ("this event
// implies no new steering request") or one of `VehicleSteeringDirection.LEFT`/
// `.RIGHT` — ready to hand straight to `createVehicleSteeringIntent()`
// (`core/VehicleSteeringIntent.js`). This file never constructs a
// `VehicleSteeringIntent` itself, never calls `setVehicleSteeringIntent()`,
// and has no idea a steering intent is even being tracked anywhere — the
// identical "caller wires the two together" discipline every input adapter
// in this codebase already follows.
//
// WHY A HELD BIT IS TRACKED AT ALL, UNLIKE THE STATELESS
// `core/AvatarVehicleBrakingInputAdapter.js`. Braking is a LEVEL: holding the
// brake control down means "keep braking," every tick, for as long as it's
// held — repeating the identical `brakedown` fact on every browser key-repeat
// event is exactly the desired, idempotent behavior. Steering is a PULSE:
// `core/VehicleSteeringSimulation.js` was always documented as "applied in
// full, in one call, never smoothed or rate-limited across ticks" — so a
// caller who fed a fresh LEFT/RIGHT on every repeated `steerleftdown` a
// browser's own key-repeat fires while a key is held would compound a
// further turn on every single one of those events, not hold a steady turn.
// Tracking `leftHeld`/`rightHeld` across calls is what lets this file tell a
// genuine new PRESS (a false-to-true edge — the only thing that ever produces
// a non-null `direction`) from an uninteresting REPEAT of a control already
// held (same `type` fired again while the bit is already `true` — reported
// back with `direction: null`, exactly like an unrelated key). Releasing and
// re-pressing the SAME control produces a new edge, and therefore a new
// steering request, same as it should.
//
// KEY-UP IS NEVER A SIGNAL, MATCHING EVERY OTHER TRANSITION FUNCTION IN THIS
// CODEBASE. `steerleftup`/`steerrightup` only ever clear their own hold bit —
// never a `direction`. Releasing a turn control does not mean "now go
// straight"; the discrete "turn once, then hold the new heading" model this
// milestone implements has no notion of a steering key-up meaning anything at
// all (see `application/WorldNavigationSession.js`'s own 0.9.128 header for
// how a held-vs-released steering key becomes a real per-tick
// `VehicleSteeringIntent` — decaying LEFT/RIGHT back to NONE the very next
// simulated tick, never on a key release).
//
// CONTROL-NAME-BLIND, THE SAME WAY `core/AvatarVehicleBrakingInputAdapter.js`
// IS. There is no `key` parameter here for a future caller to compare
// against `'ArrowLeft'`/`'a'`. Deciding WHICH physical key, gamepad axis, or
// on-screen control produces `type: 'steerleftdown'`/`'steerrightdown'` is
// entirely `application/WorldNavigationSession.js`'s own job (see that
// file's own `VEHICLE_STEER_LEFT_KEY`/`VEHICLE_STEER_RIGHT_KEY`) — this
// file's own translation rule is identical no matter what eventually
// produces those two facts.
//
// PURE. No runtime store access, no `VehicleSteeringIntent` construction, no
// heading, no vehicle position, no collision, no movement simulation, no
// Three.js, no timers, no DOM/window event listener wiring. Calling this
// function changes nothing about anything passed in, and repeated calls with
// identical arguments always return the identical result.
//
// Deliberately excluded, matching this milestone's own brief: deciding the
// actual key/gamepad control (see "CONTROL-NAME-BLIND" above), constructing
// or holding a `VehicleSteeringIntent`, calling `setVehicleSteeringIntent()`,
// per-tick decay of a held request back to NONE (that is a per-SIMULATION-
// TICK concern, owned entirely by `application/WorldNavigationSession.js`'s
// own frame loop — see this file's own header above), steering angle,
// heading, vehicle position, collision, movement simulation, rendering,
// persistence, networking. See docs/Roadmap.md, 0.9.128.
export function deriveVehicleSteeringInputEvent({ leftHeld = false, rightHeld = false, type } = {}) {
    const safeLeftHeld = Boolean(leftHeld);
    const safeRightHeld = Boolean(rightHeld);
    const normalizedType = String(type || '').toLowerCase();

    if (normalizedType === 'steerleftdown') {
        return {
            leftHeld: true,
            rightHeld: safeRightHeld,
            direction: safeLeftHeld ? null : VehicleSteeringDirection.LEFT
        };
    }
    if (normalizedType === 'steerleftup') {
        return { leftHeld: false, rightHeld: safeRightHeld, direction: null };
    }
    if (normalizedType === 'steerrightdown') {
        return {
            leftHeld: safeLeftHeld,
            rightHeld: true,
            direction: safeRightHeld ? null : VehicleSteeringDirection.RIGHT
        };
    }
    if (normalizedType === 'steerrightup') {
        return { leftHeld: safeLeftHeld, rightHeld: false, direction: null };
    }
    return { leftHeld: safeLeftHeld, rightHeld: safeRightHeld, direction: null };
}
