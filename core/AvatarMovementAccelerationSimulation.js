// 0.9.90 — Vehicle Acceleration Capability: the pure mathematical half.
//
// core/AvatarMovementAccelerationCapability.js answers WHICH strategy a
// capability's movement follows (INSTANT or RATE_LIMITED) and, for the
// latter, WHAT RATE. This file answers a completely separate question,
// deliberately kept in a completely separate file: given a rate, a
// current speed, and a target speed, what is the speed ONE SIMULATION
// TICK later? The same "pure geometry/math, independently testable, no
// engine or vocabulary dependency" split
// core/AvatarMovementSimulation.js itself already established for
// position/rotation kinematics (see that file's own header) — this is
// the direct structural twin, for the ONE new quantity this milestone
// introduces.
//
//   resolveMovementSpeed({ currentSpeed, targetSpeed, acceleration, braking, brakingRequested, deltaTime }) -> number
//   (`braking`/`brakingRequested` are 0.9.92 additions — see that
//   milestone's own header, below, for what they add)
//
// NEVER IMPORTS core/AvatarMovementAccelerationCapability.js, OR ANYTHING
// ELSE. This function does not know an `AvatarMovementAccelerationKind`
// exists, and never will — it receives `acceleration` as a bare number,
// exactly as core/AvatarMovementSimulation.js receives `movementSpeed`
// as a bare number without knowing `AvatarVehicleMovementCapability`
// exists (see that file's own 0.9.86 header for the identical
// discipline). Deciding WHETHER to call this function at all — an
// INSTANT capability has no reason to ever reach it; a caller can simply
// use its own `movementSpeed` directly — is entirely a FUTURE
// integration's job, not this file's. This file only ever answers "given
// a rate, how far can speed move this tick," never "which vehicle, if
// any, is involved" or "should a rate even apply here."
//
// THE CONTROLLER OWNS `currentSpeed`; THIS FILE REMEMBERS NOTHING. Unlike
// `movementSpeed`/`collisionRadius`/`movementDirections` (each resolved
// fresh, statelessly, from a vehicle relationship alone),
// `currentSpeed` is transient, tick-to-tick state — the direct
// structural twin of `application/AvatarMovementController.js`'s own
// `_verticalVelocity`/`_grounded` bookkeeping (see that file's own
// header: "this controller owns the only mutable state ... and feeds it
// back in on the next call; this file never remembers anything itself").
// This function is called once per tick with the PREVIOUS tick's result
// fed back in as `currentSpeed`; it holds no internal state between
// calls, no clock, no Math.random.
//
// NEVER OVERSHOOTS THE TARGET, IN EITHER DIRECTION. Speed moves toward
// `targetSpeed` by at most `acceleration * deltaTime` this tick, and is
// clamped exactly AT the target the moment that step would pass it —
// whether approaching from below (accelerating) or from above
// (decelerating toward a lower target). This one clamp is the entire
// "never overshoots" guarantee; there is deliberately no separate
// braking/deceleration RATE anywhere in this file — see this milestone's
// own brief on why braking is out of scope for 0.9.90 — the SAME
// `acceleration` rate governs closing the gap regardless of which
// direction it is closed from, until a future milestone gives braking
// its own, independently-tunable number.
//
// A non-finite or non-positive `deltaTime`, a non-finite
// `acceleration`/`currentSpeed`/`targetSpeed`, or `acceleration <= 0`
// all degrade to "no change this tick" — `currentSpeed` (sanitized)
// comes back unmodified — the same
// "defensive, never throws, never produces NaN/Infinity" posture
// core/AvatarMovementSimulation.js's own `sanitizeDeltaSeconds()`/
// `sanitizeNumber()` already establish. `currentSpeed === targetSpeed`
// is likewise a no-op, computed with no floating-point rate math at all
// (nothing to close).
//
// 0.9.92 — Vehicle Braking and Coasting Semantics. This file's own
// 0.9.90 header, above, was explicit that "there is deliberately no
// separate braking/deceleration RATE anywhere in this file... until a
// future milestone gives braking its own, independently-tunable
// number." This is that milestone, and it changes exactly one thing:
// `braking` and `brakingRequested` (both optional, both bare values —
// `braking` a number, `brakingRequested` a boolean — no capability, no
// vehicle vocabulary, exactly like every existing parameter here) let a
// caller name a SECOND rate and say, this tick, WHICH of the two rates
// governs closing the gap toward `targetSpeed`.
//
//   brakingRequested is anything other than the literal `true` (the
//       default — omitted, `false`, or any other value; never coerced
//       loosely, the same "degrade gracefully on anything but the exact
//       expected shape" discipline `sanitizeRate()` already applies to
//       `acceleration`/`braking` themselves) — UNCHANGED, byte for byte,
//       from 0.9.90: `acceleration` alone governs closing the gap,
//       whichever direction it is closed from. This is COASTING —
//       releasing a movement request already means "target speed
//       becomes 0" one layer up (core/AvatarMovementSimulation.js), and
//       this function still requires no separate friction/drag/momentum
//       model to slow down toward that lower target: the EXACT same
//       mechanism a rising target already used, per this milestone's
//       own brief, "coasting should remain conservative."
//   brakingRequested is true — `braking` governs closing the gap
//       instead, for this tick only. Whether `targetSpeed` happens to
//       be reached "from above" or "from below" is irrelevant to this
//       choice; explicit braking always means "use the braking rate,"
//       never a directional inference this function would otherwise
//       have to guess at. No real caller in this codebase, as of
//       0.9.92, ever sets `brakingRequested` true — see
//       core/AvatarMovementState.js's own 0.9.92 header for why that is
//       deliberate, not an oversight.
//
// ONE SPEED-RESOLUTION ALGORITHM, NOT TWO. This milestone's own brief is
// explicit that a second, parallel "braking simulation engine" would be
// the wrong shape — every existing guarantee below (never overshoots,
// defensive sanitization, current === target is a no-op, pure/stateless/
// deterministic) applies identically whichever rate ends up selected;
// only the SOURCE of the rate differs, decided once, up front, before
// any of the existing clamp math runs.
//
// `braking` is sanitized with the exact same rule `acceleration` always
// has been (finite, strictly positive, else "no rate applies" — see
// `sanitizeRate()` below, now shared by both). A `brakingRequested: true`
// tick with a non-finite/non-positive `braking` degrades to "no change
// this tick," the same defensive fallback a non-finite/non-positive
// `acceleration` already produces — never a silent fall-through to the
// OTHER rate: an explicit brake request with no real braking rate to
// honor means "held, immobile," not "accelerate instead."
//
// Deliberately excluded, as of 0.9.92: coasting as anything other than
// "target speed 0, resolved by the SAME mechanism as any other target"
// (no rolling resistance, aerodynamic drag, engine braking, tire
// friction, or slope effects — see this milestone's own brief), a third
// rate, directional gating of `brakingRequested` (braking always wins
// when requested, regardless of which way the gap is being closed),
// position/rotation of any kind, and any notion of a VehicleType,
// VehiclePresence, mount, keyboard input, rendering, collision, or world
// state — the identical exclusions 0.9.90 already established, still
// true here. See docs/Roadmap.md, 0.9.92.
export function resolveMovementSpeed({ currentSpeed, targetSpeed, acceleration, braking, brakingRequested, deltaTime }) {
    const current = sanitizeNumber(currentSpeed, 0);
    const target = sanitizeNumber(targetSpeed, 0);
    const rate = brakingRequested === true ? sanitizeRate(braking) : sanitizeRate(acceleration);
    const dt = sanitizeDeltaTime(deltaTime);

    if (current === target || rate === 0 || dt === 0) {
        return current;
    }

    const maxDelta = rate * dt;
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}

function sanitizeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function sanitizeRate(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeDeltaTime(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}
