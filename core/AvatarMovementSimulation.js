import { AvatarAnimationState } from './AvatarAnimationState.js';
import { deriveAvatarVerticalState } from './AvatarVerticalState.js';

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
export function simulateAvatarMovement({
    position,
    rotationY = 0,
    verticalVelocity = 0,
    grounded = true,
    movementState,
    deltaSeconds,
    groundHeight = GROUND_Y,
    movementSpeed
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
    const stepDistance = clamp(movementState.forwardAxis * speed * dt, -MAX_STEP_PER_TICK, MAX_STEP_PER_TICK);
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
