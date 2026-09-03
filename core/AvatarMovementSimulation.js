import { AvatarAnimationState } from './AvatarAnimationState.js';
import { deriveAvatarVerticalState } from './AvatarVerticalState.js';
import { resolveMovementSpeed } from './AvatarMovementAccelerationSimulation.js';

// 0.2.36 — deterministic, Three.js-free kinematics: given where the
// avatar IS (position/rotationY, plus the small bit of physics-only
// bookkeeping a jump needs — verticalVelocity/grounded) and what the
// player currently WANTS (an AvatarMovementState), produces where it
// should be ONE SIMULATION TICK later. Same "pure geometry,
// independently testable, no engine dependency" split
// PreviewCameraFraming.js (0.2.32) and AvatarPoseOffsets.js (0.2.35)
// already established, applied here to locomotion.
//
// Deliberately NOT physically simulated against world geometry — see
// docs/Principles.md, "Movement Is Kinematic, Not Physically
// Simulated (0.2.36)." There is no notion of a brick, a building, or
// a document anywhere in this file; the avatar can walk straight
// through a published castle, and that is an accepted, explicit
// limitation for this milestone, not an oversight. Collision against
// world geometry is future scope with its own architectural
// questions (is walkability derived from bricks? simplified spatial
// bounds? streamed locally?) that this milestone does not attempt to
// answer.
//
// Pure function: identical inputs always produce identical outputs.
// No hidden clock, no Math.random, no Three.js import. The caller
// (application/AvatarMovementController.js) owns the only mutable
// state — verticalVelocity/grounded between ticks — and feeds it back
// in on the next call; this file never remembers anything itself.
const WALK_SPEED = 3; // world units / second
const RUN_SPEED = 6;
// 0.9.86 — running has always meant "the same base speed, doubled";
// expressed as a ratio (rather than re-deriving RUN_SPEED from
// WALK_SPEED, or vice versa) so the exact same doubling applies
// whatever base speed a caller supplies via `movementSpeed` below —
// see this file's own 0.9.86 header.
const RUN_SPEED_MULTIPLIER = RUN_SPEED / WALK_SPEED;
const TURN_RATE_DEGREES_PER_SECOND = 150;
const JUMP_IMPULSE = 5; // world units / second, initial vertical speed
const GRAVITY = 14; // world units / second^2
const GROUND_Y = 0;
// Defensive, not a gameplay speed limit: protects against a single
// freak deltaSeconds (a backgrounded tab resuming, a debugger pause)
// producing a teleport-sized jump in one tick. WALK_SPEED/RUN_SPEED
// at any sane deltaSeconds never get near this.
const MAX_STEP_PER_TICK = 2; // world units
const MAX_DELTA_SECONDS = 0.25; // seconds — clamps a single tick's dt
const MAX_Y = 8; // world units — "reasonable vertical bounds" ABOVE whatever surface the avatar stands on

// 0.3.2 — `groundHeight` (world Y) is what the avatar snaps to/falls
// toward while grounded, and the floor of its "reasonable vertical
// bounds" clamp. Defaults to the ORIGINAL flat-plane constant, so every
// existing caller that never passes it (this file's own pre-0.3.2
// callers, and every test that never mentions ground height at all)
// gets byte-for-byte the same behavior as before this milestone: a
// single, permanently flat GROUND_Y = 0 plane. A caller that DOES pass
// one (application/AvatarMovementController.js, once an
// application/AvatarStepConstraint.js is wired) is supplying "the
// support height directly beneath the avatar's CURRENT position" —
// see that class's own header — so gravity/landing/the jump's own
// apex all resolve relative to whatever surface (terrain or a brick
// top) the avatar actually stands on, never an absolute world
// constant. This file still has no idea what a brick or a document
// is: `groundHeight` is just a number, exactly like every other
// parameter here.
//
// 0.3.4 — Vertical World Navigation. The gravity/jump kinematics below
// are UNCHANGED — they have integrated `verticalVelocity` against
// `groundHeight` and snapped a grounded avatar onto it since 0.2.36/0.3.2
// alike. What's new this milestone lives one layer up, in
// application/AvatarStepConstraint.js: whether a grounded avatar's next
// tick is still "standing on something" at all is now a real geometric
// question (falling off a ledge), not merely "block the step and stay
// put" — see that class's own 0.3.4 header. This file only gained one
// thing: `result.verticalState`, a read-only label
// (core/AvatarVerticalState.js) over the exact same
// `grounded`/`verticalVelocity` this function already tracked —
// SUPPORTED while grounded, RISING while airborne and still ascending,
// FALLING once gravity is winning. No new physics, no new mutable
// state.
//
// 0.9.86 — Ground Vehicle Movement Speed Capability. `movementSpeed`
// (world units/second, optional) is the ONE new parameter this
// milestone adds: the BASE horizontal speed to walk at — the same
// role WALK_SPEED alone used to play unconditionally. Omitted (or
// non-finite, or <= 0) degrades to WALK_SPEED, so every existing
// caller that has never heard of a movement capability (every test
// in this codebase predating 0.9.86, and every production call site
// until application/AvatarMovementController.js starts passing one)
// computes the exact same speed it always has — byte-for-byte, not
// merely "close." Running still means exactly what it always has:
// whatever base speed is active, doubled — see RUN_SPEED_MULTIPLIER
// above — so a mounted ground vehicle's own "running" is faster
// ground-vehicle movement, never a second, independent "vehicle
// running" concept. See core/AvatarVehicleMovementCapability.js for
// where a non-default `movementSpeed` actually comes from — this
// file still has no idea a vehicle, or a capability, exists; it only
// ever receives a plain number.
//
// 0.9.91 — Vehicle Acceleration State Integration. `acceleration`/
// `currentMovementSpeed` (both optional, both bare numbers — no
// AvatarMovementAccelerationCapability, no AvatarMovementAccelerationKind,
// no vehicle vocabulary of any kind reaches this file) are the two new
// parameters this milestone adds, and the ONE place
// core/AvatarMovementAccelerationSimulation.js's own `resolveMovementSpeed()`
// — the pure acceleration math 0.9.90 built and deliberately left
// unconsumed — is actually wired in. See the function body's own 0.9.91
// comment for exactly how `targetMovementSpeed` (forwardAxis * the
// existing running-aware `speed` this file already computed) and
// `currentMovementSpeed` combine into this tick's resolved,
// SIGNED speed. Doing the wiring HERE, rather than in
// application/AvatarMovementController.js, is deliberate: this file
// already owns the one true "target speed a base speed plus running
// implies" computation (RUN_SPEED_MULTIPLIER above) — teaching the
// controller a second, duplicate copy of that arithmetic merely to feed
// a pre-multiplied target into this function would be the exact kind of
// redundant reinvention this codebase's own architecture consistently
// avoids (see tests/AvatarVehicleMovementSpeedIntegration.test.js's own
// architectural regression sweep, which forbids the controller from ever
// hardcoding a "double the speed" multiplication of its own).
// `application/AvatarMovementController.js` still passes only bare
// numbers — its own resolved capability's `acceleration.acceleration`,
// and its own transient `currentMovementSpeed` bookkeeping, the direct
// structural twin of how it already threads `verticalVelocity`/
// `grounded` through this same function — never `AvatarMovementAccelerationKind`,
// never a vehicle identity.
//
// WALK'S OWN INSTANT BEHAVIOR IS BYTE-FOR-BYTE UNCHANGED. WALK's resolved
// `acceleration.acceleration` is always exactly `0` (see
// core/AvatarMovementAccelerationCapability.js's own "INERT ACCELERATION
// VALUE" header) — `Number.isFinite(acceleration) && acceleration > 0` is
// `false`, so `resolvedMovementSpeed` degrades to `targetMovementSpeed`
// directly, with zero rate math, on every tick, regardless of
// `currentMovementSpeed`. This is the SAME degrade path every pre-0.9.91
// caller already takes by never passing `acceleration` at all — WALK
// does not need a special "instant" branch anywhere in this file or in
// the controller; the existing numeric invariant
// `AvatarMovementAccelerationCapability`'s own constructor already
// enforces (INSTANT's rate is always exactly `0`; RATE_LIMITED's is
// always strictly positive) IS the branch.
//
// 0.9.92 — Vehicle Braking and Coasting Semantics. This is the ONE place
// `core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()`'s
// own new `braking`/`brakingRequested` parameters (see that file's own
// 0.9.92 header) are actually threaded through — this file already owns
// the one call site 0.9.91 built, so extending it here, rather than
// giving braking a parallel call site of its own, is what keeps this
// "ONE speed-resolution algorithm" (this milestone's own brief) rather
// than two. COASTING gets no new code at all: releasing a movement
// request already drives `forwardAxis` (and therefore
// `targetMovementSpeed`) to 0 exactly as it always has, and with
// `movementState.brakingRequested` false (the default —
// core/AvatarMovementState.js's own 0.9.92 header), that lower target is
// closed using `acceleration` — the SAME mechanism a rising target
// already used, byte-for-byte unchanged from 0.9.91. See the function
// body's own 0.9.92 comment for exactly how `effectiveRate` decides
// whether this tick is rate-limited at all.
export function simulateAvatarMovement({
    position,
    rotationY = 0,
    verticalVelocity = 0,
    grounded = true,
    movementState,
    deltaSeconds,
    groundHeight = GROUND_Y,
    movementSpeed,
    acceleration,
    braking,
    currentMovementSpeed
}) {
    const floorY = Number.isFinite(groundHeight) ? groundHeight : GROUND_Y;
    const dt = sanitizeDeltaSeconds(deltaSeconds);

    // Turn first, then step along the NEW facing — an ordinary
    // third-person walk, not strafing.
    const nextRotationY = normalizeDegrees(
        sanitizeNumber(rotationY, 0) + movementState.turnAxis * TURN_RATE_DEGREES_PER_SECOND * dt
    );

    const baseSpeed = Number.isFinite(movementSpeed) && movementSpeed > 0 ? movementSpeed : WALK_SPEED;
    const speed = movementState.running ? baseSpeed * RUN_SPEED_MULTIPLIER : baseSpeed;
    const targetMovementSpeed = movementState.forwardAxis * speed;

    // 0.9.91 — Vehicle Acceleration State Integration. `acceleration`
    // (world units/second^2, optional — a bare number, exactly like
    // `movementSpeed` above) is the ONE new parameter this milestone
    // adds. Omitted, non-finite, or <= 0 means "reach targetMovementSpeed
    // this very tick" — the exact same INSTANT behavior this function has
    // always had, and the only behavior every pre-0.9.91 caller (every
    // test that has never heard of acceleration, and every call site
    // until application/AvatarMovementController.js starts passing a real
    // rate) ever produces: `resolvedMovementSpeed` below degrades to
    // `targetMovementSpeed` directly, computed with no rate math at all,
    // byte-for-byte identical to the pre-0.9.91 `forwardAxis * speed`
    // formula it replaces. Only a genuine positive rate hands the
    // approach itself to core/AvatarMovementAccelerationSimulation.js's
    // own `resolveMovementSpeed()` — the pure math half 0.9.90 already
    // built and deliberately left unconsumed — closing over
    // `currentMovementSpeed` (the caller's own previous-tick result,
    // sanitized to `0` when omitted/non-finite, the same "controller owns
    // the state, this file never remembers anything" discipline
    // `verticalVelocity`/`grounded` already establish) and this tick's
    // `dt`. See core/AvatarMovementAccelerationSimulation.js's own header
    // for why acceleration <= 0 could never mean "no change this tick"
    // here the way it does inside `resolveMovementSpeed()` itself — an
    // INSTANT capability must still reach its target, never freeze.
    // 0.9.92 — Vehicle Braking and Coasting Semantics. `braking` (world
    // units/second^2, optional — a bare number, exactly like
    // `acceleration`) is the one new parameter this milestone adds here;
    // `movementState.brakingRequested` (core/AvatarMovementState.js's own
    // 0.9.92 fact) is the other. `effectiveRate` mirrors
    // resolveMovementSpeed()'s own internal rate selection (braking when
    // explicitly requested, acceleration otherwise) purely to decide
    // WHETHER this tick is rate-limited AT ALL — the identical role the
    // bare `acceleration > 0` check already played here since 0.9.91 (see
    // that milestone's own comment, immediately above): a tick with no
    // real rate to apply (WALK's own INSTANT `acceleration`/`braking`,
    // both always exactly 0) still needs its instant jump-to-target, not
    // a frozen no-op — so it skips resolveMovementSpeed() entirely rather
    // than calling it with a rate that would just resolve to "no change."
    // resolveMovementSpeed() itself independently re-sanitizes both
    // `acceleration` and `braking` when it IS called (see that function's
    // own 0.9.92 header) — this gate and that function agreeing on which
    // rate governs is what keeps this a single seam, not two.
    const requestingBrake = Boolean(movementState.brakingRequested);
    const effectiveRate = requestingBrake ? braking : acceleration;
    const resolvedMovementSpeed = Number.isFinite(effectiveRate) && effectiveRate > 0
        ? resolveMovementSpeed({
            currentSpeed: Number.isFinite(currentMovementSpeed) ? currentMovementSpeed : 0,
            targetSpeed: targetMovementSpeed,
            acceleration,
            braking,
            brakingRequested: requestingBrake,
            deltaTime: dt
        })
        : targetMovementSpeed;
    const stepDistance = clamp(resolvedMovementSpeed * dt, -MAX_STEP_PER_TICK, MAX_STEP_PER_TICK);
    const radians = nextRotationY * (Math.PI / 180);
    const dx = Math.sin(radians) * stepDistance;
    const dz = Math.cos(radians) * stepDistance;

    let nextVerticalVelocity = sanitizeNumber(verticalVelocity, 0);
    let nextGrounded = Boolean(grounded);

    // A jump can only START from the ground — holding Space while
    // already airborne does nothing new (no double-jump), and
    // releasing/re-pressing it after landing jumps again; 0.2.36 does
    // not attempt press-vs-hold edge detection, matching "movement is
    // kinematic, not physically simulated" — good enough for a first
    // pass, not a competitive-game-grade input model.
    if (nextGrounded && movementState.jumpRequested) {
        nextVerticalVelocity = JUMP_IMPULSE;
        nextGrounded = false;
    }

    let y;
    if (nextGrounded) {
        // Grounded: the avatar walks on whatever flat surface
        // `floorY` names (Y=0 by default, exactly as before 0.3.2; a
        // brick's own top once application/AvatarStepConstraint.js is
        // wired). Snapping outright (rather than integrating toward
        // it) means any drift can never accumulate while walking — see
        // "no NaN/Infinity, reasonable vertical bounds" in the design
        // doc's own test list.
        y = floorY;
        nextVerticalVelocity = 0;
    } else {
        nextVerticalVelocity -= GRAVITY * dt;
        y = sanitizeNumber(position.y, floorY) + nextVerticalVelocity * dt;
        if (y <= floorY) {
            y = floorY;
            nextVerticalVelocity = 0;
            nextGrounded = true;
        }
    }
    y = clamp(y, floorY, floorY + MAX_Y);

    const nextPosition = {
        x: sanitizeNumber(sanitizeNumber(position.x, 0) + dx, position.x),
        y,
        z: sanitizeNumber(sanitizeNumber(position.z, 0) + dz, position.z)
    };

    return {
        position: nextPosition,
        rotationY: nextRotationY,
        verticalVelocity: nextVerticalVelocity,
        grounded: nextGrounded,
        // 0.9.91 — this tick's resolved, SIGNED forward speed (world
        // units/second — negative while moving backward), the direct
        // structural twin of `verticalVelocity` above: the caller feeds
        // it back in as next tick's own `currentMovementSpeed`, and this
        // function never remembers it itself. Always `targetMovementSpeed`
        // verbatim when no rate-limited acceleration applied this tick —
        // see `resolvedMovementSpeed` above.
        currentMovementSpeed: resolvedMovementSpeed,
        verticalState: deriveAvatarVerticalState({ grounded: nextGrounded, verticalVelocity: nextVerticalVelocity }),
        animation: resolveAnimationState({
            moving: movementState.forwardAxis !== 0,
            running: movementState.running,
            grounded: nextGrounded
        })
    };
}

// A pure sub-decision worth naming on its own: what SHOULD be
// playing, given only the kinematic facts this tick produced.
// Jumping always wins (it temporarily overrides whatever locomotion
// animation was playing before takeoff — see docs/Principles.md);
// otherwise WALKING/RUNNING is exactly "is there any forward/back
// intent right now," never "was there recently."
function resolveAnimationState({ moving, running, grounded }) {
    if (!grounded) return AvatarAnimationState.JUMPING;
    if (moving) return running ? AvatarAnimationState.RUNNING : AvatarAnimationState.WALKING;
    return AvatarAnimationState.IDLE;
}

function sanitizeDeltaSeconds(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(value, MAX_DELTA_SECONDS);
}

function sanitizeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizeDegrees(value) {
    let d = sanitizeNumber(value, 0) % 360;
    if (d < 0) d += 360;
    return d;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
