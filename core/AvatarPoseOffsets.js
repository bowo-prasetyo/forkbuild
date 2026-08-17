import { AvatarAnimationState } from './AvatarAnimationState.js';

// 0.2.35 — a deterministic, Three.js-free mapping from an animation
// STATE to a POSE. No Three.js, no rendering — same "pure geometry,
// no engine dependency, easily testable on its own" split
// PreviewCameraFraming.js (0.2.32) already established for camera
// framing, applied here to avatar posing.
//
// 0.2.36 adds the second parameter the 0.2.35 header already flagged
// as deferred: `animationTimeSeconds`, an ELAPSED-TIME input (never a
// frame count — see docs/Principles.md, "Animation Is Driven By
// Elapsed Time, Never By Frame Count") that lets WALKING/RUNNING
// oscillate into an actual gait cycle instead of a single frozen
// pose. Still a pure function of its two arguments, nothing else: the
// same animation + the same elapsed time always produces the exact
// same pose, and `animationTimeSeconds = 0` (the default) reproduces
// 0.2.35's original static values exactly — see WALK/RUN_CYCLE_HZ
// below.
const NEUTRAL_POSE = Object.freeze({
    legSplayDegrees: 0,
    armSwingDegrees: 0,
    bodyTiltDegrees: 0,
    headTiltDegrees: 0,
    hopHeight: 0
});

const POSE_BY_ANIMATION = Object.freeze({
    [AvatarAnimationState.IDLE]: NEUTRAL_POSE,
    [AvatarAnimationState.WALKING]: Object.freeze({
        legSplayDegrees: 20,
        armSwingDegrees: 15,
        bodyTiltDegrees: 0,
        headTiltDegrees: 0,
        hopHeight: 0
    }),
    [AvatarAnimationState.RUNNING]: Object.freeze({
        legSplayDegrees: 35,
        armSwingDegrees: 30,
        bodyTiltDegrees: 8,
        headTiltDegrees: 0,
        hopHeight: 0
    }),
    [AvatarAnimationState.JUMPING]: Object.freeze({
        legSplayDegrees: 10,
        armSwingDegrees: -20,
        bodyTiltDegrees: 0,
        headTiltDegrees: -5,
        hopHeight: 0.3
    })
});

// Gait-cycle constants — how many full swing cycles per second, and
// how far the swing moves the base pose. Deliberately layered ON TOP
// of the 0.2.35 base pose (added to it, not replacing it) rather than
// oscillating around zero: at animationTimeSeconds = 0 the sine term
// is exactly zero, so the very first frame of a fresh WALKING/RUNNING
// state renders identically to 0.2.35's old static pose — no visible
// pop when a gait cycle starts.
const WALK_CYCLE_HZ = 2.0;
const RUN_CYCLE_HZ = 3.2;
const LEG_SWING_AMPLITUDE_DEGREES = 12;
const BOUNCE_AMPLITUDE = 0.05;

function withGaitCycle(basePose, cycleHz, animationTimeSeconds) {
    const t = Number.isFinite(animationTimeSeconds) ? animationTimeSeconds : 0;
    const phase = t * cycleHz * Math.PI * 2;
    return Object.freeze({
        ...basePose,
        legSplayDegrees: basePose.legSplayDegrees + LEG_SWING_AMPLITUDE_DEGREES * Math.sin(phase),
        // abs() so every stride bounces UP from the base height, never
        // down through the floor — a walk/run bounces, it doesn't dip.
        hopHeight: basePose.hopHeight + BOUNCE_AMPLITUDE * Math.abs(Math.sin(phase))
    });
}

// Falls back to the neutral (IDLE) pose for an unrecognized animation
// value rather than throwing — a pose is a rendering concern, and a
// renderer should never crash the whole avatar over a bad animation
// string; see docs/Principles.md, the same failure-isolation posture
// applied here as everywhere else a renderer consumes external state.
//
// IDLE and JUMPING are deliberately left OUT of the gait cycle: an
// idle avatar isn't mid-stride, and a jump's actual up/down motion
// now comes from the real world-space Y movement
// core/AvatarMovementSimulation.js computes (0.2.36) — hopHeight here
// stays a small fixed local flourish (knees tucked), not a second,
// competing source of vertical motion.
export function getAvatarPoseOffsets(animation, animationTimeSeconds = 0) {
    const basePose = POSE_BY_ANIMATION[animation] || NEUTRAL_POSE;
    if (animation === AvatarAnimationState.WALKING) {
        return withGaitCycle(basePose, WALK_CYCLE_HZ, animationTimeSeconds);
    }
    if (animation === AvatarAnimationState.RUNNING) {
        return withGaitCycle(basePose, RUN_CYCLE_HZ, animationTimeSeconds);
    }
    return basePose;
}
