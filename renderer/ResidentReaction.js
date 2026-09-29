import { idleEnvelope } from './AnimalIdle.js';
import { lerpAngle } from '../core/ResidentMotion.js';
import { smoothstep } from '../utils/interpolation.js';

// How a World Resident notices YOUR avatar: while it stands idle, it turns
// to face you, and waves once when you come close. The resident counterpart
// of renderer/AnimalReaction.js, with the same two rules:
//
// PURELY VISUAL, AND ONLY FOR THE VIEWER'S OWN AVATAR. Where a resident is
// (core/ResidentMotion.js) stays the same for everyone; only which way it
// faces while it stands, and whether it waves, depend on who is looking, so
// each viewer's residents greet that viewer alone. A resident never stops
// walking, steps aside or follows anyone.
//
// STATELESS FACING: residentFacingFor() is a pure function of the observer,
// the resident and its pose, continuous as long as the observer moves
// continuously:
//   - it fades in with distance (full within 60% of noticeRadius);
//   - a resident notices what is in front of it and to its sides, fading
//     out toward directly behind, so it never spins round when you cross
//     behind it;
//   - it only turns as far as it is settled in its pause (idleEnvelope):
//     a walking resident keeps walking the way it goes, and one about to
//     set off turns back to its own way first, so nothing ever snaps.
// The wave is the one bit of memory, kept by the caller
// (renderer/ResidentFieldRenderer.js): one wave each time you come close.

export const RESIDENT_REACTION = Object.freeze({
    // Within this distance a settled resident turns to face you.
    noticeRadius: 6,
    // Come this close while it faces you and it waves.
    waveRadius: 3.5,
    // How much it must be facing you to wave, in [0, 1].
    waveAttention: 0.9,
    // Walk this far away and it will wave again next time.
    rearmRadius: 7,
    // Beyond this angle off its own facing (radians), noticing fades toward
    // zero directly behind.
    fieldOfView: 2.0
});

// How far inside a radius the reaction takes to reach full strength.
const FADE_FRACTION = 0.4;

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function wrapAngle(angle) {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a <= -Math.PI) a += Math.PI * 2;
    return a;
}

// Which way a resident at (`pose.x`, `pose.z`) in `pose` (as
// core/ResidentMotion.js#residentPoseAt() reports it) faces while
// `observer` ({ x, z }, or null) is around, and how much it is paying
// attention: { rotationY, attention, distance }, rotationY in radians,
// attention in [0, 1], distance to the observer (Infinity without one).
export function residentFacingFor(pose, observer) {
    if (!observer) {
        return { rotationY: pose.rotationY, attention: 0, distance: Infinity };
    }
    const dx = observer.x - pose.x;
    const dz = observer.z - pose.z;
    const distance = Math.hypot(dx, dz);
    const { noticeRadius, fieldOfView } = RESIDENT_REACTION;
    if (!(distance < noticeRadius) || distance === 0) {
        return { rotationY: pose.rotationY, attention: 0, distance };
    }
    const bearing = wrapAngle(Math.atan2(dx, dz) - pose.rotationY);
    const inView = smoothstep(clamp01((Math.PI - Math.abs(bearing)) / (Math.PI - fieldOfView)));
    const near = smoothstep(clamp01((noticeRadius - distance) / (noticeRadius * FADE_FRACTION)));
    const settled = idleEnvelope(pose.idleSeconds, pose.idleDuration);
    const attention = near * inView * settled;
    return {
        rotationY: lerpAngle(pose.rotationY, pose.rotationY + bearing, attention),
        attention,
        distance
    };
}
