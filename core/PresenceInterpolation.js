// 0.2.37 — pure visual smoothing math for REMOTE avatars only. A
// remote presence arrives in bursts (whatever the sending replica's
// own movement ticks produced, then a burst-free gap, then another
// burst) — snapping straight to each newly-received position would
// look like teleporting. This function answers exactly one question:
// "partway between the last position we were rendering and the
// latest one we've received, what should we draw RIGHT NOW" — it
// never decides which position is authoritative (see
// docs/Principles.md, "The Authoritative Position Is Always The
// Latest Presence; Interpolation Is Only Ever A Presentation Detail"
// — `to` here, not the interpolated output, is that authoritative
// value; `application/RemoteAvatarInterpolator.js` is the only thing
// that ever reads it as ground truth).
//
// `t` is a caller-supplied progress fraction (elapsed time since the
// interpolation target last changed, divided by a fixed duration) —
// this file has no clock of its own, matching every other time-based
// piece of this codebase (see docs/Principles.md, "Animation Is
// Driven By Elapsed Time, Never By Frame Count").
export function interpolatePresence(from, to, t) {
    const clampedT = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1;
    const fromRotationY = (from.rotation && from.rotation.y) || 0;
    const toRotationY = (to.rotation && to.rotation.y) || 0;
    return {
        position: {
            x: lerp(from.position.x, to.position.x, clampedT),
            y: lerp(from.position.y, to.position.y, clampedT),
            z: lerp(from.position.z, to.position.z, clampedT)
        },
        // Animation itself is never blended numerically (a
        // "half-walking, half-idle" pose isn't a meaningful thing to
        // compute) — it snaps to the latest known value; the pose's
        // OWN gait cycle (core/AvatarPoseOffsets.js) already supplies
        // the visual smoothness a walk needs.
        rotation: { x: 0, y: lerpAngleDegrees(fromRotationY, toRotationY, clampedT), z: 0 },
        animation: to.animation
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Interpolates through the SHORTER arc (e.g. 350deg -> 10deg turns by
// +20, never by -340) — a plain linear lerp on raw degree values
// would spin the long way around exactly half the time.
function lerpAngleDegrees(a, b, t) {
    const delta = (((b - a) % 360) + 540) % 360 - 180;
    return a + delta * t;
}
