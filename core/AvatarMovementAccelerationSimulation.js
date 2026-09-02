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
//   resolveMovementSpeed({ currentSpeed, targetSpeed, acceleration, deltaTime }) -> number
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
// Deliberately excluded, as of 0.9.90: braking/deceleration as its own
// rate, coasting, friction, drag, momentum, reverse transition,
// position/rotation of any kind (that stays
// core/AvatarMovementSimulation.js's own job — this file returns a
// speed, never a delta position), and any notion of a VehicleType,
// VehiclePresence, mount, keyboard input, rendering, collision, or world
// state. See docs/Roadmap.md, 0.9.90.
export function resolveMovementSpeed({ currentSpeed, targetSpeed, acceleration, deltaTime }) {
    const current = sanitizeNumber(currentSpeed, 0);
    const target = sanitizeNumber(targetSpeed, 0);
    const rate = sanitizeRate(acceleration);
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
