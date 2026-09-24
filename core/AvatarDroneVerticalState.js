// Avatar Drone Vertical State.
//
// A small, closed vocabulary for a mounted drone's vertical state —
// GROUNDED / RISING / HOVERING / DESCENDING — mirroring the same
// "derive, never duplicate" discipline core/AvatarVerticalState.js
// already applies to jump/fall: this file adds no new mutable
// bookkeeping of its own. deriveAvatarDroneVerticalState() is a pure
// read of an `altitude` (world units above the ground the drone took
// off from) and an `ascending` intent flag. How `altitude` itself
// changes tick-to-tick belongs to a future movement-simulation
// milestone, exactly as core/AvatarVerticalState.js defers how its own
// `verticalVelocity` changes to core/AvatarMovementSimulation.js.
//
//   GROUNDED   — altitude 0 or below: the drone sits on the ground,
//                exactly where an avatar can mount/dismount it today
//                (core/AvatarVehicleMount.js and friends).
//   RISING     — altitude between 0 and DRONE_HOVER_ALTITUDE, ascent
//                requested (taking off).
//   HOVERING   — altitude at or above DRONE_HOVER_ALTITUDE.
//   DESCENDING — altitude between 0 and DRONE_HOVER_ALTITUDE, ascent
//                not requested (landing).
//
// DRONE_HOVER_ALTITUDE is a deliberately simple, not-final constant —
// the same posture core/AvatarVehicleMovementCapability.js's own
// BICYCLE_MOVEMENT_SPEED and siblings already take — chosen relative to
// core/AvatarCollision.js's own AVATAR_COLLISION_HEIGHT (1.8 world
// units), since neither tree canopy nor building height is tracked as
// data anywhere in this codebase yet (core/TreeCollisionGeometry.js's
// own trees are a horizontal-only collision circle; see that file's own
// header).
//
// AERIAL MOVEMENT PIPELINE MILESTONE UPDATE: stepDroneAltitude() (below
// deriveAvatarDroneVerticalState()) now DOES decide how fast a drone
// rises or falls, core/AvatarVehicleMovementCapability.js's own DRONE
// `supported` flag is now `true`, and application/avatar/AvatarVehicleMovementController.js's
// own tick() calls both every frame a drone is mounted and moving. See
// each function's own header, below, for exactly what changed.
export const AvatarDroneVerticalStateKind = Object.freeze({
    GROUNDED: 'grounded',
    RISING: 'rising',
    HOVERING: 'hovering',
    DESCENDING: 'descending'
});

export function isValidAvatarDroneVerticalStateKind(value) {
    return Object.values(AvatarDroneVerticalStateKind).includes(value);
}

// World units above ground level a mounted drone hovers at once
// airborne — see this file's own header for how the number was chosen.
export const DRONE_HOVER_ALTITUDE = 4;

// A non-finite `altitude` is treated as `0`, the same "degrade
// gracefully" posture core/AvatarVerticalState.js's own
// deriveAvatarVerticalState() already applies to `verticalVelocity`.
export function deriveAvatarDroneVerticalState({ altitude = 0, ascending = false } = {}) {
    const a = Number.isFinite(altitude) ? altitude : 0;
    if (a <= 0) return AvatarDroneVerticalStateKind.GROUNDED;
    if (a >= DRONE_HOVER_ALTITUDE) return AvatarDroneVerticalStateKind.HOVERING;
    return ascending ? AvatarDroneVerticalStateKind.RISING : AvatarDroneVerticalStateKind.DESCENDING;
}

// Aerial Movement Pipeline milestone — this file's own header ("NO
// TICK, NO RATE, NOT WIRED IN") no longer holds: a mounted, moving
// drone needs its altitude to actually change somewhere, and this is
// that one place, mirroring core/AvatarMovementAccelerationSimulation.js's
// own role for horizontal speed — a small, pure, per-tick stepping
// function, deliberately kept out of the shared, heavily-depended-on
// core/AvatarMovementSimulation.js (see application/avatar/AvatarVehicleMovementController.js's
// own header for where this is actually called from and why altitude
// stays a controller-layer concern rather than joining that file's own
// horizontal kinematics).
//
// `ascending` is the caller's own "does the rider currently want this
// drone airborne" fact — ordinarily "is there any forward/backward
// movement intent this tick," per the product brief this milestone
// implements: a drone sits on the ground when idle and rises once
// ridden. This function has no opinion on how that boolean is decided;
// it only steps `altitude` toward DRONE_HOVER_ALTITUDE when true, and
// back toward `0` when false, at a constant rate, clamped to
// `[0, DRONE_HOVER_ALTITUDE]` so it can never run away in either
// direction.
const DRONE_VERTICAL_SPEED = 3; // world units / second
const MAX_DELTA_SECONDS = 0.25; // mirrors core/AvatarMovementSimulation.js's own per-tick clamp

export function stepDroneAltitude({ altitude = 0, ascending = false, deltaSeconds } = {}) {
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? Math.min(deltaSeconds, MAX_DELTA_SECONDS) : 0;
    const a = Number.isFinite(altitude) ? altitude : 0;
    const next = a + (ascending ? 1 : -1) * DRONE_VERTICAL_SPEED * dt;
    return Math.min(DRONE_HOVER_ALTITUDE, Math.max(0, next));
}
