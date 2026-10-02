// Pure waterline rules for vehicles. Wheeled vehicles stop at the water's edge:
// they may roll through the thin film of a shoreline but never deeper. A drone
// flies over water, so for it the water surface is the ground.

// Deep enough to wet the tyres at the very edge, never enough to drive in.
export const VEHICLE_MAX_WATER_DEPTH = 0.3;

// `fromDepth` is the depth where the vehicle stands now: a step that makes the
// water no deeper is always allowed, so a vehicle that somehow stands in water
// can still drive out of it.
export function isVehicleWaterStepAllowed(fromDepth, toDepth, maxDepth = VEHICLE_MAX_WATER_DEPTH) {
    const to = Number.isFinite(toDepth) ? toDepth : 0;
    const from = Number.isFinite(fromDepth) ? fromDepth : 0;
    return to <= maxDepth || to <= from;
}

// What a drone treats as the ground: the terrain, or the water surface above it.
export function droneFloorHeight(groundHeight, waterSurfaceHeight) {
    return Number.isFinite(waterSurfaceHeight) ? Math.max(groundHeight, waterSurfaceHeight) : groundHeight;
}
