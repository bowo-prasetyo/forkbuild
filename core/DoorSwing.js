// How far a door in World View stands open: it swings open, away from
// whoever walks up to it, and closes again behind them. A door doesn't
// collide (core/BrickPassage.js), so this is what makes walking through one
// look like going through a door rather than through a wall.
//
// Purely a matter of drawing. Nothing is recorded or shared: the build
// still holds a closed door, each viewer sees the doors near the people
// they see, and the Editor shows every door closed.
//
// Angles are radians about the door's hinge, its local -x edge. A positive
// angle swings the free edge toward the door's local -z side.

// How near (horizontally, from the door's middle) someone has to be for it
// to open: about a stride and a half, so it is open before they reach it.
export const DOOR_OPEN_RADIUS = 1.6;
// How far it opens: a little short of square, so it reads as a door left
// open rather than a gap.
export const DOOR_OPEN_ANGLE = (80 * Math.PI) / 180;
// How fast it swings: fully open in about a third of a second.
export const DOOR_SWING_SPEED = DOOR_OPEN_ANGLE / 0.3;
// Someone on a floor above or below doesn't open it.
const VERTICAL_REACH = 1;

// The angle `door` swings toward for `observers`: 0 with nobody near, or
// DOOR_OPEN_ANGLE away from the nearest one.
//
// door: { x, y, z, rotationY (radians, as drawn), width, height }, its
// middle in the same space as the observers' positions.
// observers: [{ x, y, z }], where people stand (their feet).
export function doorSwingTarget(door, observers) {
    if (!door || !Array.isArray(observers)) return 0;
    const bottom = door.y - door.height / 2;
    const top = door.y + door.height / 2;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const observer of observers) {
        if (!observer || !Number.isFinite(observer.x) || !Number.isFinite(observer.z)) continue;
        if (Number.isFinite(observer.y) && (observer.y < bottom - VERTICAL_REACH || observer.y > top)) continue;
        const distance = Math.hypot(observer.x - door.x, observer.z - door.z);
        if (distance <= DOOR_OPEN_RADIUS && distance < nearestDistance) {
            nearest = observer;
            nearestDistance = distance;
        }
    }
    if (!nearest) return 0;
    // Which side of the door they're on, along its local z (the inverse of
    // the turn the door is drawn with).
    const rotation = Number.isFinite(door.rotationY) ? door.rotationY : 0;
    const dx = nearest.x - door.x;
    const dz = nearest.z - door.z;
    const localZ = dx * Math.sin(rotation) + dz * Math.cos(rotation);
    return localZ >= 0 ? DOOR_OPEN_ANGLE : -DOOR_OPEN_ANGLE;
}

// The door's angle `deltaSeconds` after `current`, swinging toward `target`
// at DOOR_SWING_SPEED. A door already open one way keeps opening that way
// for as long as someone is near: walking through it puts them on its other
// side, and it mustn't flap back through them.
export function stepDoorSwing(current, target, deltaSeconds) {
    const from = Number.isFinite(current) ? current : 0;
    let to = Number.isFinite(target) ? target : 0;
    if (to !== 0 && from !== 0 && Math.sign(to) !== Math.sign(from)) {
        to = Math.sign(from) * Math.abs(to);
    }
    const step = DOOR_SWING_SPEED * (Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0);
    if (Math.abs(to - from) <= step) return to;
    return from + Math.sign(to - from) * step;
}

// Where a door swung `angle` about its hinge is drawn: its middle moved by
// { x, z } and its turn increased by `angle`. A door turned `rotationY`
// keeps its hinge (local x = -width / 2) where the closed door's was.
export function doorSwingOffset(width, rotationY, angle) {
    if (!angle) return { x: 0, z: 0 };
    const half = width / 2;
    // The hinge-relative middle before and after the swing, in the door's
    // own frame (a turn by `angle` about the vertical axis, as drawn).
    const localX = -half + half * Math.cos(angle);
    const localZ = -half * Math.sin(angle);
    const rotation = Number.isFinite(rotationY) ? rotationY : 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
        x: localX * cos + localZ * sin,
        z: -localX * sin + localZ * cos
    };
}
