import { computeFacingYawDegrees } from './AvatarFacing.js';

// 0.2.94 — World View Location & Navigation.
//
// A pure, derived orientation reading — "which way is the camera
// looking, expressed as a compass heading" — computed fresh from
// nothing but the camera's own position and target. Never a stored
// fact, never presence, never a document field: exactly like
// core/AvatarFacing.js#computeFacingYawDegrees, whose EXACT angle
// convention this reuses (0° faces +Z, 90° faces +X, going clockwise
// when viewed from above) rather than inventing a second one — a
// caller that already has a yaw in this codebase's convention can
// convert it straight through resolveCompassLabel() below with no unit
// translation. "North" has no real-world meaning here (this is a
// synthetic, deterministic (seed, x, z) terrain — see
// core/TerrainHeightField.js's own header); +Z is simply the fixed
// direction this codebase already calls 0°, chosen as North so the
// compass has a stable reference regardless of where the camera is or
// which document happens to be loaded.
//
// See docs/Principles.md, "A Compass Heading Is Computed From Camera
// Orientation, Never Stored Or Broadcast (0.2.94)."
const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DEGREES_PER_SECTOR = 45;

export function resolveCompassLabel(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    const index = Math.round(normalized / DEGREES_PER_SECTOR) % COMPASS_LABELS.length;
    return COMPASS_LABELS[index];
}

// Returns null when position and target coincide on the X/Z plane —
// there is no meaningful heading to show (the same "no meaningful
// horizontal yaw" case computeFacingYawDegrees already declines to
// resolve, e.g. looking straight down) rather than fabricating an
// arbitrary direction.
export function computeCompassHeading(cameraPosition, cameraTarget) {
    const degrees = computeFacingYawDegrees(cameraPosition, cameraTarget);
    if (degrees === null) {
        return null;
    }
    return { degrees, label: resolveCompassLabel(degrees) };
}
