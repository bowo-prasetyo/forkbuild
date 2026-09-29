// Where a World Resident (core/WorldResident.js) may walk: is the straight
// walk from one point to another clear?
//
//   core/ResidentPath.js   = "Can a resident walk straight from here to there?"
//   core/ResidentMotion.js = "Where is a resident right now?"
//
// isResidentWalkClear() is a PURE function of its arguments: the terrain
// seed, the two points, and the obstacles a caller hands it — brick boxes
// from the World's own buildings and placed structures, and circles such as
// tree trunks. It reads no clock and no session, so every replica that has
// loaded the same Worlds gets the same answer, which is what keeps every
// replica's residents on the same paths (core/ResidentMotion.js).
//
// A walk is clear when, all along it:
//   - the resident's body (a circle of RESIDENT_COLLISION_RADIUS) never
//     touches an obstacle's footprint on the ground plane;
//   - the ground is dry — no lake (SURFACE_CATEGORY.WATER) and no river;
//   - the terrain is never steeper than an avatar can walk.
//
// Obstacles are 2D here on purpose: the caller has already decided which
// bricks stand in a resident's way (see
// application/world/ResidentRuntime.js, which asks
// application/avatar/AvatarMovementConstraint.js, so a resident is blocked
// by exactly the bricks an avatar on the ground would be — a floor tile or
// a step is not in the way, a wall is).

import { terrainHeightAt } from './TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from './TerrainSurface.js';
import { isRiverAt } from './Hydrology.js';
import { isWalkableSlope, DEFAULT_MAX_WALKABLE_SLOPE } from './TerrainWalkability.js';

// A resident's body on the ground plane. Slightly slimmer than an avatar's
// (core/AvatarCollision.js#AVATAR_COLLISION_RADIUS, 0.35), so wherever an
// avatar could stand to add a resident, the resident fits too.
export const RESIDENT_COLLISION_RADIUS = 0.3;

// How far apart the ground is sampled along a walk.
const GROUND_SAMPLE_SPACING = 0.5;

// Whether a resident may stand at (x, z) as far as the ground goes: dry land.
export function isResidentGroundAt(seed, x, z) {
    return surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.WATER && !isRiverAt(seed, x, z);
}

// Whether the segment from `from` to `to` passes within `radius` of the
// box's footprint: the classic slab test against the box grown by
// `radius` on every side. Grazing the grown box's edge does not count.
function segmentHitsBox(from, to, box, radius) {
    const minX = box.min.x - radius;
    const maxX = box.max.x + radius;
    const minZ = box.min.z - radius;
    const maxZ = box.max.z + radius;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    let tEnter = 0;
    let tExit = 1;
    for (const [start, delta, min, max] of [[from.x, dx, minX, maxX], [from.z, dz, minZ, maxZ]]) {
        if (delta === 0) {
            if (start <= min || start >= max) return false;
            continue;
        }
        let t0 = (min - start) / delta;
        let t1 = (max - start) / delta;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tEnter = Math.max(tEnter, t0);
        tExit = Math.min(tExit, t1);
        if (tEnter >= tExit) return false;
    }
    return true;
}

// Whether the segment passes closer than `circle.radius + radius` to the
// circle's center.
function segmentHitsCircle(from, to, circle, radius) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSq = dx * dx + dz * dz;
    let t = 0;
    if (lengthSq > 0) {
        t = ((circle.center.x - from.x) * dx + (circle.center.z - from.z) * dz) / lengthSq;
        t = Math.max(0, Math.min(1, t));
    }
    const px = from.x + dx * t - circle.center.x;
    const pz = from.z + dz * t - circle.center.z;
    const reach = circle.radius + radius;
    return px * px + pz * pz < reach * reach;
}

// Whether a resident can walk straight from `from` to `to` ({ x, z } each).
// `boxes` are `{ min: {x, z}, max: {x, z} }` footprints (a brick AABB works
// as is), `circles` are `{ center: {x, z}, radius }`.
export function isResidentWalkClear(seed, from, to, {
    boxes = [],
    circles = [],
    radius = RESIDENT_COLLISION_RADIUS,
    maxSlope = DEFAULT_MAX_WALKABLE_SLOPE
} = {}) {
    for (const box of boxes) {
        if (segmentHitsBox(from, to, box, radius)) return false;
    }
    for (const circle of circles) {
        if (segmentHitsCircle(from, to, circle, radius)) return false;
    }
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(length / GROUND_SAMPLE_SPACING));
    let previousHeight = null;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        if (!isResidentGroundAt(seed, x, z)) return false;
        const height = terrainHeightAt(seed, x, z);
        if (previousHeight !== null && !isWalkableSlope(previousHeight, height, length / steps, maxSlope)) {
            return false;
        }
        previousHeight = height;
    }
    return true;
}
