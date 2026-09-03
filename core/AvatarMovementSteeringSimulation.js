// 0.9.93 — Vehicle Steering Capability: the pure mathematical half.
//
// core/AvatarMovementSteeringCapability.js answers WHICH strategy a
// capability's turning follows (INSTANT or RATE_LIMITED) and, for the
// latter, WHAT RATE. This file answers a completely separate question,
// deliberately kept in a completely separate file: given a rate, a
// current heading, and a requested heading, what is the heading ONE
// SIMULATION TICK later? The exact same "pure math, independently
// testable, no engine or vocabulary dependency" split
// core/AvatarMovementAccelerationSimulation.js already established for
// speed (see that file's own header) — this is the direct structural
// twin, for the angular counterpart of that same question.
//
//   resolveMovementHeading({ currentHeading, targetHeading, steeringRate, deltaTime }) -> number (radians, in [0, 2π))
//
// NEVER IMPORTS core/AvatarMovementSteeringCapability.js, OR ANYTHING
// ELSE. This function does not know an `AvatarMovementSteeringKind`
// exists, and never will — it receives `steeringRate` as a bare number,
// exactly as core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()
// receives `acceleration` as a bare number without knowing
// `AvatarVehicleMovementCapability` exists. Deciding WHETHER to call this
// function at all — an INSTANT capability has no reason to ever reach
// it — is entirely a FUTURE integration's job, not this file's. This file
// only ever answers "given a rate, how far can heading turn this tick,"
// never "which vehicle, if any, is involved" or "should a rate even apply
// here."
//
// THE CONTROLLER OWNS `currentHeading`; THIS FILE REMEMBERS NOTHING. Unlike
// the capability fields this arc has resolved so far (each resolved
// fresh, statelessly, from a vehicle relationship alone), `currentHeading`
// is transient, tick-to-tick state — the direct structural twin of
// `resolveMovementSpeed()`'s own `currentSpeed` parameter (see that
// file's own header). This function is called once per tick with the
// PREVIOUS tick's result fed back in as `currentHeading`; it holds no
// internal state between calls, no clock, no Math.random. As of 0.9.93,
// nothing in this codebase actually owns that transient heading state
// yet — wiring it into a real controller is explicit future scope (see
// this file's own closing "Deliberately excluded" list).
//
// `targetHeading` IS ALREADY RESOLVED BY THE CALLER. This function has no
// notion of keyboard input, mouse movement, A/D, arrow keys, a vehicle's
// identity, or a camera — it receives a single already-decided "this is
// the heading movement currently wants" number, exactly as
// `resolveMovementSpeed()` already receives an already-decided
// `targetSpeed` rather than computing one itself from `movementSpeed`/
// running/direction. Resolving WHAT heading a player's input currently
// requests is entirely a future input milestone's job.
//
// RADIANS, NOT DEGREES — see core/AvatarMovementSteeringCapability.js's
// own header for why `steeringRate` itself is expressed in radians/second.
// `currentHeading`/`targetHeading`/the returned heading follow the same
// unit for consistency with the rate they are measured against; this is a
// deliberately independent representation from
// core/AvatarMovementSimulation.js's own degrees-based `rotationY` —
// reconciling the two, if ever needed, is a future integration's concern,
// not this file's.
//
// THE HEADING ALWAYS TAKES THE SHORTEST ANGULAR PATH, NEVER THE LONG WAY
// AROUND. A heading is a position on a circle, not a line — closing a gap
// from 350° toward 10° must move through 350° -> 360°/0° -> 10° (a 20°
// turn), never the long 340° route the other way. Every returned heading,
// and every `currentHeading`/`targetHeading` this function is given, is
// first normalized into `[0, 2π)` (`normalizeAngle()` below) specifically
// so this wraparound is handled uniformly regardless of how large,
// negative, or already-wrapped the raw input angles are.
//
// NEVER OVERSHOOTS THE TARGET. Heading moves toward `targetHeading` by at
// most `steeringRate * deltaTime` radians this tick, along the shortest
// arc, and is clamped exactly AT the target the moment that step would
// pass it — the direct structural twin of `resolveMovementSpeed()`'s own
// "never overshoots the target, in either direction" guarantee, now for
// an angle instead of a scalar.
//
// A non-finite or non-positive `deltaTime`, a non-finite `steeringRate`,
// or `steeringRate <= 0` all degrade to "no change this tick" —
// `currentHeading` (sanitized and normalized) comes back unmodified — the
// same defensive, never-throws, never-produces-NaN/Infinity posture
// `resolveMovementSpeed()` already establishes. `currentHeading` already
// equal to `targetHeading` (after normalization, and after accounting for
// the shortest-path wraparound — e.g. `0` and `2π` name the identical
// heading) is likewise a no-op, computed with no floating-point rate math
// at all.
//
// Deliberately excluded, matching this milestone's own brief: any notion
// of a VehicleType, VehiclePresence, mount, AvatarVehicleMount, keyboard/
// mouse/gamepad input, vehicle orientation STATE (this function computes
// a next heading; it never stores one), turning radius, Ackermann
// steering, bicycle/motorcycle lean, tire friction, lateral acceleration,
// drift/skid behavior, speed-proportional steering (`steeringRate` is
// received as a flat number, never derived here from any speed),
// rendering, collision, or world state — the identical exclusions
// `resolveMovementSpeed()` already establishes for its own domain. See
// docs/Roadmap.md, 0.9.93.
const TWO_PI = Math.PI * 2;

export function resolveMovementHeading({ currentHeading, targetHeading, steeringRate, deltaTime }) {
    const current = normalizeAngle(sanitizeNumber(currentHeading, 0));
    const target = normalizeAngle(sanitizeNumber(targetHeading, 0));
    const rate = sanitizeRate(steeringRate);
    const dt = sanitizeDeltaTime(deltaTime);

    const diff = shortestAngularDifference(current, target);

    if (diff === 0 || rate === 0 || dt === 0) {
        return current;
    }

    const maxDelta = rate * dt;
    if (Math.abs(diff) <= maxDelta) {
        return target;
    }
    return normalizeAngle(current + Math.sign(diff) * maxDelta);
}

// The signed angular gap from `from` to `to`, taking the shortest of the
// two possible arcs around the circle, in `(-π, π]`. Positive means "turn
// the short way counter-clockwise (increasing angle)"; negative means
// "turn the short way clockwise (decreasing angle)." Both inputs are
// assumed already normalized into `[0, 2π)`.
function shortestAngularDifference(from, to) {
    let diff = (to - from) % TWO_PI;
    if (diff > Math.PI) diff -= TWO_PI;
    if (diff < -Math.PI) diff += TWO_PI;
    return diff;
}

// Wraps any finite angle into `[0, 2π)` — the one place this file decides
// what "the same heading" means regardless of how it was expressed
// (negative, or many full turns past zero).
function normalizeAngle(angle) {
    const wrapped = angle % TWO_PI;
    return wrapped < 0 ? wrapped + TWO_PI : wrapped;
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
