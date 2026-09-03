// 0.2.42 — pure, Three.js-free avatar/world collision geometry. See
// core/AvatarMovementSimulation.js's own header for why NONE of this
// lives there: the kinematic simulation stays completely unaware that
// a brick, a wall, or a document even exists — collision is a
// SEPARATE step applied to its output, never a rewrite of it. See
// docs/Principles.md, "Collision Is A Constraint Applied To Movement,
// Never Part Of The Movement Simulation Itself."
//
// Everything here operates on a plain axis-aligned bounding box shape
// — `{ min: {x,y,z}, max: {x,y,z} }` — and plain `{x,y,z}` positions.
// Nothing here knows what a Document, a WorldPlacement, or a
// BrickRegistry is; application/AvatarMovementConstraint.js is the
// layer that turns "the world geometry currently available to this
// replica" into the obstacle list this file consumes. Same "core
// deals with geometry/math, application supplies the data" split
// core/SpatialOverlap.js already established for placement-level
// overlap (0.2.25), applied here one level down, at brick granularity.

// A rough capsule, approximated as an upright AABB for this first
// milestone — see docs/Principles.md, "Start Simple: A Box Is A Good
// Enough Capsule." Radius/height are chosen to roughly match
// renderer/AvatarRenderer.js's own visual proportions (a ~0.6-wide
// torso, head top around y=1.83) without importing or needing to
// agree with it exactly — collision geometry and render geometry are
// deliberately allowed to diverge slightly, the same way a game's hit
// box is rarely pixel-identical to its sprite.
export const AVATAR_COLLISION_RADIUS = 0.35;
export const AVATAR_COLLISION_HEIGHT = 1.8;

// A very small inset applied to a resolved boundary so the avatar
// comes to rest touching, but never exactly flush with (and so never
// re-triggering float-noise on) an obstacle's face — floating point
// tolerance, not a gameplay concept.
const SKIN_EPSILON = 1e-4;

export function avatarAabbAt(position) {
    return {
        min: { x: position.x - AVATAR_COLLISION_RADIUS, y: position.y, z: position.z - AVATAR_COLLISION_RADIUS },
        max: { x: position.x + AVATAR_COLLISION_RADIUS, y: position.y + AVATAR_COLLISION_HEIGHT, z: position.z + AVATAR_COLLISION_RADIUS }
    };
}

// A brick's own axis-aligned bounds, in whatever coordinate space
// `center` is given in — LOCAL (document) space if `center` is the
// brick's own position, WORLD space once translateAabb() below has
// added a WorldPlacement offset. Deliberately axis-aligned regardless
// of `Brick.rotation` — a small, honestly documented simplification
// for this first collision milestone, exactly the same one
// application/SelectionBoundsService.js already makes for gizmo
// bounds (see its own header) — reused here as the same idea, not the
// same code, since that class lives in application/ and is bound to a
// BrickRegistry instance, while this stays a pure function over
// already-resolved dimensions.
export function brickAabb(center, definition) {
    const width = definition ? definition.width : 1;
    const height = definition ? definition.height : 1;
    const depth = definition ? definition.depth : 1;
    const halfX = width / 2;
    const halfY = height / 2;
    const halfZ = depth / 2;
    return {
        min: { x: center.x - halfX, y: center.y - halfY, z: center.z - halfZ },
        max: { x: center.x + halfX, y: center.y + halfY, z: center.z + halfZ }
    };
}

export function translateAabb(aabb, offset) {
    return {
        min: { x: aabb.min.x + offset.x, y: aabb.min.y + offset.y, z: aabb.min.z + offset.z },
        max: { x: aabb.max.x + offset.x, y: aabb.max.y + offset.y, z: aabb.max.z + offset.z }
    };
}

export function aabbsOverlap(a, b) {
    return a.min.x < b.max.x && a.max.x > b.min.x
        && a.min.y < b.max.y && a.max.y > b.min.y
        && a.min.z < b.max.z && a.max.z > b.min.z;
}

// Resolves a desired horizontal (X/Z) step against a list of static
// obstacle AABBs, one axis at a time — the standard "axis-separated
// slide": moving diagonally into a corner blocks whichever axis
// actually hits something while the other axis keeps moving, which is
// what makes walking alongside a wall read as a SLIDE rather than a
// dead stop the instant any contact happens. Y is never touched here
// — vertical ground/gravity stays entirely
// core/AvatarMovementSimulation.js's own concern; this function has no
// opinion about standing, falling, or jumping, only about whether a
// horizontal step is obstructed.
//
// Each axis is resolved as a SWEEP, not just an endpoint check —
// obstacles are tested against the full [current, proposed] range on
// that axis (padded by the moving body's own radius), never merely
// whether the FINAL position happens to overlap something. A single
// large step (a slow frame, bounded by MAX_STEP_PER_TICK in
// core/AvatarMovementSimulation.js) can therefore never pass clean
// through a thin obstacle just because neither its start nor end
// position happened to land inside it.
//
// `radius` (0.9.119, optional, defaults to AVATAR_COLLISION_RADIUS) —
// the horizontal collision radius of whatever body is actually
// sweeping this step: the walking avatar's own existing radius by
// default, or a mounted vehicle's own, larger
// `AvatarVehicleMovementCapability#collisionRadius` when a caller
// supplies one — the exact same "parameterize the existing query by
// the moving body's own radius, never invent a second collision
// system" seam core/AvatarTreeCollisionQuery.js already established
// for tree collision (0.9.88), applied here to building/brick
// collision. Omitting `radius` reproduces the exact pre-0.9.119
// behavior, byte for byte.
export function resolveHorizontalMovement({ position, dx, dz, obstacles, radius = AVATAR_COLLISION_RADIUS }) {
    let x = position.x;
    let z = position.z;
    let collidedX = false;
    let collidedZ = false;

    if (dx !== 0 && obstacles.length > 0) {
        const resolvedX = resolveAxis({ axis: 'x', origin: x, delta: dx, fixed: { x, y: position.y, z }, obstacles, radius });
        collidedX = resolvedX !== x + dx;
        x = resolvedX;
    } else {
        x += dx;
    }

    if (dz !== 0 && obstacles.length > 0) {
        const resolvedZ = resolveAxis({ axis: 'z', origin: z, delta: dz, fixed: { x, y: position.y, z }, obstacles, radius });
        collidedZ = resolvedZ !== z + dz;
        z = resolvedZ;
    } else {
        z += dz;
    }

    return { x, z, collided: collidedX || collidedZ };
}

function resolveAxis({ axis, origin, delta, fixed, obstacles, radius }) {
    const proposed = origin + delta;
    const movingPositive = delta > 0;
    const sweepMin = Math.min(origin, proposed) - radius;
    const sweepMax = Math.max(origin, proposed) + radius;
    const minY = fixed.y;
    const maxY = fixed.y + AVATAR_COLLISION_HEIGHT;
    // The moving body's position on the OTHER horizontal axis (already-
    // resolved X when this call is resolving Z, current X/Z
    // throughout) — a brick only obstructs THIS axis if the body
    // would actually pass through it sideways too, not merely stand
    // somewhere along its infinite extension.
    const crossMin = (axis === 'x' ? fixed.z : fixed.x) - radius;
    const crossMax = (axis === 'x' ? fixed.z : fixed.x) + radius;

    let boundary = proposed;
    for (const obstacle of obstacles) {
        if (obstacle.min.y >= maxY || obstacle.max.y <= minY) continue; // no vertical overlap at all
        const obstacleAxisMin = axis === 'x' ? obstacle.min.x : obstacle.min.z;
        const obstacleAxisMax = axis === 'x' ? obstacle.max.x : obstacle.max.z;
        const obstacleCrossMin = axis === 'x' ? obstacle.min.z : obstacle.min.x;
        const obstacleCrossMax = axis === 'x' ? obstacle.max.z : obstacle.max.x;
        if (obstacleCrossMin >= crossMax || obstacleCrossMax <= crossMin) continue;
        if (obstacleAxisMin >= sweepMax || obstacleAxisMax <= sweepMin) continue;

        // An obstacle can only ever obstruct movement heading TOWARD
        // it. The sweep check above deliberately includes the ORIGIN
        // (to catch tunneling — see this function's own header), which
        // means an obstacle the avatar is already flush against would
        // otherwise also "overlap the sweep" for a step moving AWAY
        // from it, and get wrongly treated as blocking a retreat. This
        // filters that case out: an obstacle already fully on the
        // trailing side of the avatar's CURRENT position is never a
        // valid reason to stop it.
        if (movingPositive && obstacleAxisMin < origin - radius) continue;
        if (!movingPositive && obstacleAxisMax > origin + radius) continue;

        boundary = movingPositive
            ? Math.min(boundary, obstacleAxisMin - radius - SKIN_EPSILON)
            : Math.max(boundary, obstacleAxisMax + radius + SKIN_EPSILON);
    }

    // Never let a resolved boundary move the avatar BACKWARD past
    // where it started — a defensive clamp that should only matter if
    // the avatar somehow started already overlapping an obstacle.
    return movingPositive ? Math.max(origin, boundary) : Math.min(origin, boundary);
}
