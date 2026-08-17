import { AvatarAnimationState } from './AvatarAnimationState.js';

// 0.2.35 — a deterministic, Three.js-free mapping from an animation
// STATE to a static POSE. No Three.js, no rendering, no time/tween
// state — same "pure geometry, no engine dependency, easily testable
// on its own" split PreviewCameraFraming.js (0.2.32) already
// established for camera framing, applied here to avatar posing.
//
// "Static pose for each state is sufficient for 0.2.35" per the
// design doc — real animation mechanics (blending between poses,
// timing, procedural walk cycles) are 0.2.36's job. This file answers
// exactly one question: "given this animation state, what does the
// pose look like right now?" — a pure function of the enum value,
// nothing else.
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

// Falls back to the neutral (IDLE) pose for an unrecognized animation
// value rather than throwing — a pose is a rendering concern, and a
// renderer should never crash the whole avatar over a bad animation
// string; see docs/Principles.md, the same failure-isolation posture
// applied here as everywhere else a renderer consumes external state.
export function getAvatarPoseOffsets(animation) {
    return POSE_BY_ANIMATION[animation] || NEUTRAL_POSE;
}
