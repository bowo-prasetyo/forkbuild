// 0.9.123 — Vehicle Orientation.
//
// The pure geometry half of "which way is this vehicle actually facing":
// given a horizontal displacement (dx, dz) a vehicle's position genuinely
// moved by this tick, returns the heading, in DEGREES, that displacement
// represents — the exact same representation
// core/AvatarMovementSimulation.js's own `rotationY` already uses (0 =
// facing +Z, 90 = facing +X, the inverse of that file's own
// `dx = sin(radians)*stepDistance, dz = cos(radians)*stepDistance` step
// formula). No Three.js, no VehicleInstance, no world/collision/rendering
// dependency of any kind — a caller (ordinarily
// application/AvatarVehicleMovementController.js) supplies the raw
// before/after displacement itself.
//
// HEADING COMES FROM WHERE THE VEHICLE ACTUALLY WENT, NEVER FROM STEERING
// INTENT. This is the one deliberate departure this milestone makes from
// core/AvatarMovementSimulation.js's own `rotationY`: that value tracks
// requested TURNING (turnAxis, rate-limited toward a requested heading —
// see that file's own 0.9.94 header), which can differ from the direction
// the vehicle's position actually just moved in in a great many cases,
// even on this codebase's own kinematics (a vehicle mid-turn steps along
// its PREVIOUS heading before this tick's new one takes effect; a vehicle
// held against a collision constraint may have its position entirely
// absorbed while `rotationY` keeps turning regardless). See docs/Roadmap.md,
// 0.9.123, "heading should not come from the renderer" — this file is the
// other half of that same discipline: heading also does not come from
// steering intent, only from realized movement.
//
// NEVER INVENTS A HEADING FOR ZERO DISPLACEMENT. A vehicle that did not
// actually move this tick — no movement intent at all, or every attempted
// step was entirely absorbed by a world-collision constraint — has no new
// FACT about which way it is facing. `Math.atan2(0, 0)` is mathematically
// `0`, which would silently snap a stationary or fully-blocked vehicle
// back to "facing +Z" for no real reason; this function instead returns
// `previousHeading`, completely unchanged, exactly matching this
// milestone's own rule: "heading changes only when the vehicle actually
// achieves a different horizontal position." See docs/Roadmap.md, 0.9.123.
export function resolveVehicleHeadingFromMovement({ dx, dz, previousHeading = 0 }) {
    const fallbackHeading = Number.isFinite(previousHeading) ? previousHeading : 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) {
        return fallbackHeading;
    }
    const degrees = Math.atan2(dx, dz) * (180 / Math.PI);
    return degrees < 0 ? degrees + 360 : degrees;
}

// Deliberately not yet: normalizing/wrapping an arbitrary `previousHeading`
// input (a caller is expected to always hand back a value this same
// function, or VehicleInstance's own `0` default, already produced);
// smoothing/rate-limiting a heading change over multiple ticks (unlike
// core/AvatarMovementSteeringSimulation.js's own turn-rate math, a
// heading here snaps to the realized movement direction instantly — see
// docs/Roadmap.md, 0.9.123's own exclusion list, "vehicle angular
// velocity"); reading a VehicleInstance, a movement capability, or any
// collision constraint directly — this file only ever transforms the
// (dx, dz) a caller already computed.
