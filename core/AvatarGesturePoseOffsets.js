import { AvatarInteractionKind } from './AvatarInteractionKind.js';

// 0.2.44 — a deterministic, Three.js-free mapping from a GESTURE
// (core/AvatarInteractionKind.js) to a pose override — the same
// "pure geometry, easily testable, no engine dependency" split
// core/AvatarPoseOffsets.js already established for locomotion,
// applied here to GREET/WAVE/POINT.
//
// Deliberately reuses only the bodyTilt/headTilt HALF of that same
// pose-offset vocabulary, never legSplay/hopHeight — see
// renderer/AvatarRenderer.js's own applyPose(): a gesture overrides
// only the upper-body portion of whatever locomotion pose is already
// showing, so waving while standing still and (in principle) waving
// mid-stride both render sensibly without this file needing to know
// anything about locomotion at all. The avatar model has no separate
// arm geometry yet (see renderer/AvatarRenderer.js's `build()`) — an
// actual raised/waving arm is future scope for whichever milestone
// adds arm meshes; this reuses exactly the body/head articulation the
// renderer can already move, an honest, deliberately small first pass
// rather than a second, redundant gesture-rendering system.
const GESTURE_POSE = Object.freeze({
    [AvatarInteractionKind.WAVE]: Object.freeze({ headTiltDegrees: -12, bodyTiltDegrees: 0, wobbleHz: 3 }),
    [AvatarInteractionKind.GREET]: Object.freeze({ headTiltDegrees: -6, bodyTiltDegrees: 18, wobbleHz: 0 }),
    [AvatarInteractionKind.POINT]: Object.freeze({ headTiltDegrees: 4, bodyTiltDegrees: -10, wobbleHz: 0 })
});

const WOBBLE_AMPLITUDE_DEGREES = 8;

// Falls back to null (no override — the caller keeps whatever
// locomotion pose was already showing) for an unrecognized kind or
// AvatarInteractionKind.NONE, same "degrade instead of throw" posture
// core/AvatarPoseOffsets.js already follows for a bad animation
// string. `elapsedSeconds` is elapsed time since the gesture STARTED
// (never a frame count — see docs/Principles.md, "Animation Is
// Driven By Elapsed Time, Never By Frame Count"), the same
// requirement core/AvatarPoseOffsets.js's own gait cycle already
// follows.
export function getGesturePoseOverride(interactionKind, elapsedSeconds = 0) {
    const base = GESTURE_POSE[interactionKind];
    if (!base) {
        return null;
    }
    if (!base.wobbleHz) {
        return { headTiltDegrees: base.headTiltDegrees, bodyTiltDegrees: base.bodyTiltDegrees };
    }
    const t = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
    const wobble = WOBBLE_AMPLITUDE_DEGREES * Math.sin(t * base.wobbleHz * Math.PI * 2);
    return { headTiltDegrees: base.headTiltDegrees + wobble, bodyTiltDegrees: base.bodyTiltDegrees };
}
