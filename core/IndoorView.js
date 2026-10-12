// Seeing inside a build (docs/reviews/CreativeDirection-2026-10-12.md,
// finding 3): when the avatar walks under a roof, the camera comes in with
// it and the part of that build above its head is cut away, so the room it
// is standing in is what the player sees, not the wall the camera was
// behind.
//
// Pure geometry over the same brick boxes collision uses
// (core/AvatarCollision.js#brickAabb: `{ min: {x,y,z}, max: {x,y,z} }`, in
// the avatar's own coordinates, where y is measured from the ground the
// avatar stands on). Nothing here knows about renderers or sessions:
// application/worldNavigation/ asks, and hands the answers to the one
// camera write path and to the renderer.

// A standing avatar's height (core/AvatarCollision.js's 1.8).
export const HEAD_HEIGHT = 1.8;
// A box this far above the avatar's feet, or less, is a ceiling it stands
// under; higher, it is open sky (a canopy, a bridge overhead).
export const MAX_CEILING_HEIGHT = 7;
// Where the cut is made: just above the head, or at the ceiling if lower.
export const CUT_ABOVE_FEET = HEAD_HEIGHT + 0.3;
// How far round the roof over the avatar the build is looked for: two boxes
// this close count as one build.
export const CONNECTED_GAP = 0.6;
// The most boxes walked when finding the build, so a vast one stays cheap.
export const MAX_BUILD_BOXES = 4000;

// The indoor camera's usual stand: behind and above the avatar, looking down
// into the room through the cut, closer than the usual third-person view.
export const INDOOR_CAMERA_BACK = 4;
export const INDOOR_CAMERA_HEIGHT = 4.2;
export const INDOOR_LOOK_HEIGHT = 1.1;
// How far in front of a wall the camera stops, and the closest it comes.
export const CAMERA_WALL_MARGIN = 0.3;
export const MIN_CAMERA_BACK = 0.8;

const EPSILON = 1e-9;

// The lowest box over the avatar's head at `position` (feet), within
// MAX_CEILING_HEIGHT, or null when it stands under open sky.
export function ceilingOver(position, boxes) {
    let lowest = null;
    for (const box of boxes || []) {
        if (!isBox(box)) continue;
        if (position.x < box.min.x || position.x > box.max.x || position.z < box.min.z || position.z > box.max.z) continue;
        const bottom = box.min.y;
        if (bottom < position.y + HEAD_HEIGHT - 0.05 || bottom > position.y + MAX_CEILING_HEIGHT) continue;
        if (!lowest || bottom < lowest.min.y) lowest = box;
    }
    return lowest;
}

// The boxes of the build `seed` belongs to: every box connected to it,
// two boxes touching or within CONNECTED_GAP of each other.
export function connectedBoxes(seed, boxes, { gap = CONNECTED_GAP, limit = MAX_BUILD_BOXES } = {}) {
    const all = (boxes || []).filter(isBox);
    const found = new Set([seed]);
    const queue = [seed];
    while (queue.length > 0 && found.size < limit) {
        const box = queue.shift();
        for (const other of all) {
            if (found.has(other) || !near(box, other, gap)) continue;
            found.add(other);
            queue.push(other);
            if (found.size >= limit) break;
        }
    }
    return [...found];
}

// What to cut away while the avatar at `position` stands inside a build:
// `{ minX, maxX, minZ, maxZ, y }`, the build's footprint and the height above
// which its bricks are hidden, or null outdoors. In the avatar's coordinates.
export function indoorCutaway(position, boxes) {
    const ceiling = ceilingOver(position, boxes);
    if (!ceiling) return null;
    const build = connectedBoxes(ceiling, boxes);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const box of build) {
        minX = Math.min(minX, box.min.x);
        maxX = Math.max(maxX, box.max.x);
        minZ = Math.min(minZ, box.min.z);
        maxZ = Math.max(maxZ, box.max.z);
    }
    const y = Math.min(position.y + CUT_ABOVE_FEET, ceiling.min.y);
    return Object.freeze({ minX, maxX, minZ, maxZ, y, ceiling: ceiling.min.y });
}

// The Editor's See inside (docs/reviews/CreativeDirection-2026-10-12b.md,
// finding 2): the whole build cut away above where a person standing on its
// lowest floor would be cut indoors, so its ground-floor rooms and furniture
// show from the Editor's camera. `bounds` are the build's
// (core/SpatialBounds.js), in its own coordinates; null with none. The lowest
// floor is taken to be one plate (0.25) above the build's lowest point.
export const SEE_INSIDE_FLOOR = 0.25;

export function seeInsideCutaway(bounds) {
    const min = bounds?.min;
    const max = bounds?.max;
    if (!min || !max || ![min.x, min.y, min.z, max.x, max.z].every(Number.isFinite)) return null;
    return Object.freeze({
        minX: min.x - CAMERA_WALL_MARGIN,
        maxX: max.x + CAMERA_WALL_MARGIN,
        minZ: min.z - CAMERA_WALL_MARGIN,
        maxZ: max.z + CAMERA_WALL_MARGIN,
        y: min.y + SEE_INSIDE_FLOOR + CUT_ABOVE_FEET
    });
}

// The fraction (0..1) along the segment from `a` to `b` where it first
// enters `box`, or null when it misses it. A segment starting inside the
// box enters it at 0.
export function segmentEntersBox(a, b, box) {
    let tMin = 0;
    let tMax = 1;
    for (const axis of ['x', 'y', 'z']) {
        const d = b[axis] - a[axis];
        if (Math.abs(d) < EPSILON) {
            if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return null;
            continue;
        }
        let t1 = (box.min[axis] - a[axis]) / d;
        let t2 = (box.max[axis] - a[axis]) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
    }
    return tMin;
}

// Where a camera that wants to be at `desired`, looking at `target`, can be
// without a box between them: pulled in along the line to just in front of
// the first box in the way, never closer than `minDistance`. Boxes above
// `cutHeight` (cut away) don't count, and those reaching above it count only
// up to it.
export function clearCameraPosition(target, desired, boxes, { cutHeight = Infinity, margin = CAMERA_WALL_MARGIN, minDistance = MIN_CAMERA_BACK } = {}) {
    const length = Math.hypot(desired.x - target.x, desired.y - target.y, desired.z - target.z);
    if (length < EPSILON) return { ...desired };
    let first = 1;
    for (const raw of boxes || []) {
        if (!isBox(raw) || raw.min.y >= cutHeight) continue;
        const box = raw.max.y > cutHeight ? { min: raw.min, max: { ...raw.max, y: cutHeight } } : raw;
        // A box the target itself is inside (the floor under the feet, say)
        // never stands in the way.
        if (contains(box, target)) continue;
        const t = segmentEntersBox(target, desired, box);
        if (t !== null && t < first) first = t;
    }
    if (first >= 1) return { ...desired };
    const reach = Math.max(minDistance, first * length - margin);
    const scale = Math.min(1, reach / length);
    return {
        x: target.x + (desired.x - target.x) * scale,
        y: target.y + (desired.y - target.y) * scale,
        z: target.z + (desired.z - target.z) * scale
    };
}

// Where the indoor camera tries to stand, nearest the usual view first: back
// from the avatar and up, each steeper than the last, until it stands almost
// overhead, so a wall right behind the avatar raises the camera rather than
// pushing it into the avatar's back.
export const INDOOR_CAMERA_STANDS = Object.freeze([
    Object.freeze({ back: INDOOR_CAMERA_BACK, height: INDOOR_CAMERA_HEIGHT }),
    Object.freeze({ back: 3, height: 4.8 }),
    Object.freeze({ back: 2, height: 5.3 }),
    Object.freeze({ back: 1.2, height: 5.6 }),
    Object.freeze({ back: 0.6, height: 5.8 })
]);

// The camera framing indoors, `{ position, target }`, for an avatar at
// `position` (feet) facing `headingDegrees` (0 faces +Z), in the avatar's
// coordinates; null outdoors. Behind and above, looking down into the room
// through the cut: the first of INDOOR_CAMERA_STANDS nothing stands in the
// way of, else the steepest, pulled in front of what is.
export function computeIndoorFraming(position, headingDegrees, boxes, cutaway = indoorCutaway(position, boxes)) {
    if (!cutaway) return null;
    const radians = (Number.isFinite(headingDegrees) ? headingDegrees : 0) * (Math.PI / 180);
    const forward = { x: Math.sin(radians), z: Math.cos(radians) };
    const target = { x: position.x, y: position.y + INDOOR_LOOK_HEIGHT, z: position.z };
    let desired = null;
    for (const stand of INDOOR_CAMERA_STANDS) {
        desired = {
            x: position.x - forward.x * stand.back,
            y: position.y + stand.height,
            z: position.z - forward.z * stand.back
        };
        const clear = clearCameraPosition(target, desired, boxes, { cutHeight: cutaway.y });
        if (clear.x === desired.x && clear.y === desired.y && clear.z === desired.z) return { position: clear, target };
    }
    return { position: clearCameraPosition(target, desired, boxes, { cutHeight: cutaway.y }), target };
}

function isBox(box) {
    return box && box.min && box.max
        && Number.isFinite(box.min.x) && Number.isFinite(box.min.y) && Number.isFinite(box.min.z)
        && Number.isFinite(box.max.x) && Number.isFinite(box.max.y) && Number.isFinite(box.max.z);
}

function near(a, b, gap) {
    return a.min.x - gap <= b.max.x && b.min.x - gap <= a.max.x
        && a.min.y - gap <= b.max.y && b.min.y - gap <= a.max.y
        && a.min.z - gap <= b.max.z && b.min.z - gap <= a.max.z;
}

function contains(box, point) {
    return point.x > box.min.x && point.x < box.max.x
        && point.y > box.min.y && point.y < box.max.y
        && point.z > box.min.z && point.z < box.max.z;
}
