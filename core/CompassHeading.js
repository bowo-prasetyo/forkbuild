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
//
// A YAW IS NOT A BEARING. A yaw grows from +Z toward +X, and +X is on the
// LEFT of someone facing +Z (with the camera behind them, see
// core/CameraPerspective.js), so a yaw grows anticlockwise as the player
// sees it. A compass bearing grows clockwise: N 0, E 90. With North at +Z,
// East is therefore -X, and bearing = 360 - yaw. Everything that names a
// direction goes through compassBearingFromYaw() or compassLabelBetween();
// resolveCompassLabel() takes a bearing.
const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DEGREES_PER_SECTOR = 45;

// A yaw (degrees, 0 = +Z, growing toward +X) as a compass bearing in
// [0, 360): 0 = North (+Z), 90 = East (-X).
export function compassBearingFromYaw(yawDegrees) {
    const bearing = (360 - (((yawDegrees % 360) + 360) % 360)) % 360;
    return bearing === 0 ? 0 : bearing;
}

// The compass label (N, NE, ...) of a direction from `fromPosition` toward
// `toPosition` on the X/Z plane, or null when they coincide there.
export function compassLabelBetween(fromPosition, toPosition) {
    const yaw = computeFacingYawDegrees(fromPosition, toPosition);
    return yaw === null ? null : resolveCompassLabel(compassBearingFromYaw(yaw));
}

// `degrees` is a compass bearing (0 = N, 90 = E), not a yaw.
export function resolveCompassLabel(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    const index = Math.round(normalized / DEGREES_PER_SECTOR) % COMPASS_LABELS.length;
    return COMPASS_LABELS[index];
}

// Returns null when position and target coincide on the X/Z plane —
// there is no meaningful heading to show (the same "no meaningful
// horizontal yaw" case computeFacingYawDegrees already declines to
// resolve, e.g. looking straight down) rather than fabricating an
// arbitrary direction. `degrees` is the camera's raw yaw (what spatial
// presence carries and the 3D view uses); `bearing` and `label` are the
// compass reading a person sees.
export function computeCompassHeading(cameraPosition, cameraTarget) {
    const degrees = computeFacingYawDegrees(cameraPosition, cameraTarget);
    if (degrees === null) {
        return null;
    }
    const bearing = compassBearingFromYaw(degrees);
    return { degrees, bearing, label: resolveCompassLabel(bearing) };
}
