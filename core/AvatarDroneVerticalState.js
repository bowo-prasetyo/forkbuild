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
// NO TICK, NO RATE, NOT WIRED IN. This file does not decide how fast a
// drone rises or falls, does not touch
// core/AvatarVehicleMovementCapability.js's own DRONE `supported` flag
// (still correctly `false` — no aerial movement pipeline consumes this
// altitude yet), and is called from nowhere. It exists so a future
// milestone has a real vocabulary to wire in, instead of inventing one
// inline.
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
