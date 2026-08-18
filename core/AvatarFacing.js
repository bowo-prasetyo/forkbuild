// 0.2.44 — a pure yaw-angle computation: given two positions, what
// rotation.y (degrees) would make an avatar AT `fromPosition` face
// `toPosition`? Same angle convention core/AvatarMovementSimulation.js
// already established for AvatarPresence.rotation.y — 0 degrees faces
// +Z, 90 faces +X (dx = sin(radians) * distance, dz = cos(radians) *
// distance) — so a value this function returns can be handed straight
// to the exact same renderer code path that already consumes a
// presence rotation, with no unit conversion anywhere else.
//
// Deliberately knows nothing about AvatarPresence, AvatarInteractionState,
// or Three.js — see docs/Principles.md, "Facing A Target Is
// Presentation, Never Presence": this is pure geometry a caller
// applies as a temporary, local-only rendering override (see
// renderer/AvatarVisual.js's setFacingOverride), never something that
// gets written back into presence or broadcast.
//
// Returns null when the two positions coincide on the X/Z plane (the
// exact same spot, or one directly above/below the other) — there is
// no meaningful horizontal yaw to compute, and a caller should simply
// leave the avatar's existing facing alone rather than snapping to an
// arbitrary angle.
export function computeFacingYawDegrees(fromPosition, toPosition) {
    const dx = toPosition.x - fromPosition.x;
    const dz = toPosition.z - fromPosition.z;
    if (dx === 0 && dz === 0) {
        return null;
    }
    const radians = Math.atan2(dx, dz);
    let degrees = radians * (180 / Math.PI);
    degrees %= 360;
    if (degrees < 0) {
        degrees += 360;
    }
    return degrees;
}
