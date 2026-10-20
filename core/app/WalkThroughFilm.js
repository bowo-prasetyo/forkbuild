import { AVATAR_COLLISION_HEIGHT, AVATAR_COLLISION_RADIUS, brickAabb } from '../avatar/AvatarCollision.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../building/BrickWalkability.js';
import { brickCollisionBoxes, isPassableDoor } from '../building/BrickPassage.js';
import { videoCameraDistanceScale } from './BuildVideo.js';

// A walk-through video of a build, filmed in World View (core/app/BuildVideo.js
// has the other kinds): the avatar starts a few steps back from the build's
// door (core/world/BuildEntrance.js), walks up to it, so the door swings open, goes
// in, stops and looks round the room, and the video ends on its end card. A
// build with no door is walked up to and looked at. The film can open on a
// sweep of the camera half way round the outside, ending behind where the
// avatar waits.
//
// Pure: the plan is worked out from the entrance and the bricks, and each
// frame's steering from the plan, where the avatar is and how long the film
// has run. application/worldNavigation/walkThroughFilmMethods.js applies it
// to the real avatar, so it walks with World View's own movement, collisions,
// doors, footsteps and camera.

// How far in front of the door the walk starts, tried in turn until the way
// to the door is clear; the arrival spot itself when none is.
export const APPROACH_DISTANCES = Object.freeze([7, 5.5, 4]);
// How far in front of a build with no door the walk starts.
const FRONT_APPROACH_DISTANCE = 5;
// How far past the door the avatar walks in, at most, keeping this far from
// the build's far wall; seen through its eyes, as far as the middle of the
// room, up to MAX_EYES_INSIDE_DISTANCE (insidePath()).
const INSIDE_DISTANCE = 2.2;
const MAX_EYES_INSIDE_DISTANCE = 4;
const WALL_MARGIN = 0.8;
// The sweep: half way round the build, eased, in SWEEP_SECONDS, from far
// enough back to see it whole and from a little above it.
export const SWEEP_SECONDS = 6;
export const SWEEP_DEGREES = 180;
const SWEEP_MIN_DISTANCE = 9;
const SWEEP_MIN_LIFT = 4;
// World View's camera's vertical field of view, in degrees, which the sweep
// is seen through (renderer/CameraController.js).
const WORLD_VIEW_FIELD_OF_VIEW = 60;
// A waypoint is reached within this distance.
export const WAYPOINT_REACH = 0.35;
// The walk gives up on a waypoint it can't reach after this long (something
// in the way), and looks round from where it got to.
export const WALK_LIMIT_SECONDS = 10;
// How quickly the avatar turns to face where it is going, in degrees a second.
const TURN_RATE = 150;
// Inside, a slow look all the way round; in front of a build with no door, a
// moment's look at it.
export const LOOK_SECONDS = 7;
export const LOOK_DEGREES = 360;
export const FRONT_LOOK_SECONDS = 2.5;
export const END_CARD_SECONDS = 3.5;
const END_CARD_FADE_SECONDS = 0.5;
// A held moment before walking off, so the video opens on the build.
export const OPENING_SECONDS = 1;

// Where the film is seen from: just behind and above the avatar (World View's
// third-person camera, which indoors frames the room with the roof cut away),
// or through its eyes (the first-person camera).
export const WalkThroughCamera = Object.freeze({
    BEHIND: 'behind',
    EYES: 'eyes'
});
export const WALK_THROUGH_CAMERAS = Object.freeze(Object.values(WalkThroughCamera));
// Through its eyes, the walk is filmed with a wide lens (a vertical field of
// view in degrees; World View's is 60), as house tours are, so a small room
// shows whole rather than a wall at a time.
export const EYES_FIELD_OF_VIEW = 80;

export const WalkThroughPhase = Object.freeze({
    SWEEP: 'sweep',
    OPENING: 'opening',
    WALK: 'walk',
    LOOK: 'look',
    END_CARD: 'end-card',
    DONE: 'done'
});

// The plan for walking through a build whose entrance is `entrance`
// (findBuildEntrance()), from `bricks` (the build's own, for a clear way in),
// seen from `camera` (WalkThroughCamera), opening on a sweep round the outside
// when `sweep` is set, in the build's coordinates: `{ kind, start: { x, y, z },
// heading, path: [{ x, z }], lookSeconds, lookDegrees, sweep }`, where `sweep`
// is null or `{ center: { x, y, z }, distance, height, fromAzimuth, seconds }`
// (the camera circles at `height`, `distance` from `center`, looking at it,
// from `fromAzimuth` round SWEEP_DEGREES, ending on the side the avatar
// starts from), farther away for a frame `aspect` (width / height) narrower
// than it is high, so a tall video still sees the build whole. Null for no
// entrance.
export function planWalkThrough(entrance, bricks = [], registry = null, { camera = WalkThroughCamera.BEHIND, sweep = false, aspect = 16 / 9 } = {}) {
    if (!entrance) return null;
    const ground = entrance.stand.y;
    const blocking = blockingBoxes(bricks, registry, ground);
    let walk;
    if (entrance.kind === 'door' && entrance.door && entrance.inward) {
        const { door, inward, stand } = entrance;
        const start = APPROACH_DISTANCES
            .map((distance) => ({ x: door.x - inward.x * distance, z: door.z - inward.z * distance }))
            .find((point) => isClear(point, stand, blocking)) ?? { x: stand.x, z: stand.z };
        walk = {
            kind: 'door',
            start: Object.freeze({ x: start.x, y: ground, z: start.z }),
            heading: entrance.heading,
            path: Object.freeze([door, ...insidePath(entrance, blocking, camera)].map((point) => Object.freeze({ x: point.x, z: point.z }))),
            lookSeconds: LOOK_SECONDS,
            lookDegrees: LOOK_DEGREES
        };
    } else {
        const turn = (entrance.heading * Math.PI) / 180;
        const back = { x: entrance.stand.x - Math.sin(turn) * FRONT_APPROACH_DISTANCE, z: entrance.stand.z - Math.cos(turn) * FRONT_APPROACH_DISTANCE };
        const start = isClear(back, entrance.stand, blocking) ? back : entrance.stand;
        walk = {
            kind: 'front',
            start: Object.freeze({ x: start.x, y: ground, z: start.z }),
            heading: entrance.heading,
            path: Object.freeze([Object.freeze({ x: entrance.stand.x, z: entrance.stand.z })]),
            lookSeconds: FRONT_LOOK_SECONDS,
            lookDegrees: 0
        };
    }
    return Object.freeze({ ...walk, sweep: sweep ? planSweep(entrance, bricks, registry, walk.start, aspect) : null });
}

// The sweep round `entrance`'s build: a circle round its middle, wide enough
// to see it whole, ending on the side of `start`, behind the avatar.
function planSweep(entrance, bricks, registry, start, aspect) {
    const ground = entrance.stand.y;
    let top = ground + 1;
    for (const brick of Array.isArray(bricks) ? bricks : []) {
        const definition = registry?.get?.(brick.definitionId);
        if (!definition || !brick.position) continue;
        top = Math.max(top, brickAabb(brick.position, definition, brick.rotation || 0, brick.tilt || 0).max.y);
    }
    const { footprint } = entrance;
    const center = footprint
        ? { x: (footprint.minX + footprint.maxX) / 2, z: (footprint.minZ + footprint.maxZ) / 2 }
        : { x: entrance.stand.x, z: entrance.stand.z };
    const halfDiagonal = footprint ? Math.hypot(footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ) / 2 : 1;
    const height = top - ground;
    const toStart = (Math.atan2(start.x - center.x, start.z - center.z) * 180) / Math.PI;
    return Object.freeze({
        center: Object.freeze({ x: center.x, y: ground + height * 0.4, z: center.z }),
        distance: Math.max(SWEEP_MIN_DISTANCE, halfDiagonal * 2.2 + height * 0.5) * videoCameraDistanceScale(aspect, WORLD_VIEW_FIELD_OF_VIEW),
        height: ground + Math.max(SWEEP_MIN_LIFT, height * 0.9 + 2.5),
        fromAzimuth: normalizeDegrees(toStart - SWEEP_DEGREES),
        seconds: SWEEP_SECONDS
    });
}

// Where the sweep's camera is `progress` (0 to 1) of the way round,
// `{ position, target }`, in the build's coordinates: eased, so it sets off
// and arrives gently.
export function sweepFraming(sweep, progress) {
    const turned = sweep.fromAzimuth + SWEEP_DEGREES * ease(Math.min(1, Math.max(0, progress)));
    const azimuth = (turned * Math.PI) / 180;
    return Object.freeze({
        position: Object.freeze({
            x: sweep.center.x + Math.sin(azimuth) * sweep.distance,
            y: sweep.height,
            z: sweep.center.z + Math.cos(azimuth) * sweep.distance
        }),
        target: sweep.center
    });
}

// The film's first state: the sweep, when `plan` has one, else the opening.
export function startWalkThrough(plan = null) {
    return Object.freeze({ phase: plan?.sweep ? WalkThroughPhase.SWEEP : WalkThroughPhase.OPENING, waypoint: 0, phaseStart: 0, time: 0, lookFrom: 0 });
}

// One frame of the film: from `state`, after `deltaSeconds`, with the avatar
// at `position` (the build's coordinates) facing `heading` (degrees, 0 faces
// +z, 90 faces +x). Returns `{ state, heading, walking, endCard, camera }`: the
// heading to face, whether to walk ahead, how far the end card has faded in
// (0 to 1), and during the sweep where the camera is (sweepFraming()), null
// otherwise. `state.phase` is DONE once the end card has been shown.
export function stepWalkThrough(plan, state, { position, heading, deltaSeconds }) {
    const time = state.time + Math.max(0, Number(deltaSeconds) || 0);
    const facing = Number(heading) || 0;
    let next = { ...state, time };
    if (next.phase === WalkThroughPhase.SWEEP) {
        const progress = plan.sweep ? (time - next.phaseStart) / plan.sweep.seconds : 1;
        if (progress < 1) {
            return Object.freeze({
                state: Object.freeze(next),
                heading: plan.heading,
                walking: false,
                endCard: 0,
                camera: sweepFraming(plan.sweep, progress)
            });
        }
        next = { ...next, phase: WalkThroughPhase.OPENING, phaseStart: time };
    }
    if (next.phase === WalkThroughPhase.OPENING && time - next.phaseStart >= OPENING_SECONDS) {
        next = { ...next, phase: WalkThroughPhase.WALK, phaseStart: time };
    }
    if (next.phase === WalkThroughPhase.WALK) {
        let waypoint = next.waypoint;
        while (waypoint < plan.path.length && distance(position, plan.path[waypoint]) <= WAYPOINT_REACH) waypoint++;
        if (waypoint >= plan.path.length || time - next.phaseStart >= WALK_LIMIT_SECONDS) {
            next = { ...next, waypoint, phase: WalkThroughPhase.LOOK, phaseStart: time, lookFrom: facing };
        } else {
            next = { ...next, waypoint };
            const target = plan.path[waypoint];
            const bearing = (Math.atan2(target.x - position.x, target.z - position.z) * 180) / Math.PI;
            return Object.freeze({
                state: Object.freeze(next),
                heading: turnToward(facing, bearing, TURN_RATE * Math.max(0, Number(deltaSeconds) || 0)),
                walking: true,
                endCard: 0,
                camera: null
            });
        }
    }
    if (next.phase === WalkThroughPhase.LOOK) {
        const progress = plan.lookSeconds > 0 ? Math.min(1, (time - next.phaseStart) / plan.lookSeconds) : 1;
        const look = normalizeDegrees(next.lookFrom + plan.lookDegrees * ease(progress));
        if (progress >= 1) {
            next = { ...next, phase: WalkThroughPhase.END_CARD, phaseStart: time };
        } else {
            return Object.freeze({ state: Object.freeze(next), heading: look, walking: false, endCard: 0, camera: null });
        }
    }
    if (next.phase === WalkThroughPhase.END_CARD) {
        const shown = time - next.phaseStart;
        if (shown >= END_CARD_SECONDS) next = { ...next, phase: WalkThroughPhase.DONE };
        return Object.freeze({
            state: Object.freeze(next),
            heading: facing,
            walking: false,
            endCard: Math.min(1, shown / END_CARD_FADE_SECONDS),
            camera: null
        });
    }
    if (next.phase === WalkThroughPhase.DONE) {
        return Object.freeze({ state: Object.freeze(next), heading: facing, walking: false, endCard: 1, camera: null });
    }
    return Object.freeze({ state: Object.freeze(next), heading: plan.heading, walking: false, endCard: 0, camera: null });
}

// About how long the film runs: the sweep, the opening, the walk at walking pace (3
// units a second), the look and the end card. For a progress bar; the film
// itself ends when stepWalkThrough() says DONE.
export function estimateWalkThroughSeconds(plan) {
    let length = 0;
    let from = plan.start;
    for (const point of plan.path) {
        length += distance(from, point);
        from = point;
    }
    return (plan.sweep ? plan.sweep.seconds : 0) + OPENING_SECONDS + Math.min(WALK_LIMIT_SECONDS, length / 3) + plan.lookSeconds + END_CARD_SECONDS;
}

// `heading` turned toward `target` by at most `maxDegrees`, the short way.
export function turnToward(heading, target, maxDegrees) {
    const difference = normalizeDegrees(target - heading);
    const signed = difference > 180 ? difference - 360 : difference;
    const step = Math.max(-maxDegrees, Math.min(maxDegrees, signed));
    return normalizeDegrees(heading + step);
}

function normalizeDegrees(degrees) {
    return ((degrees % 360) + 360) % 360;
}

// Slow at either end of the look, steady in the middle.
function ease(progress) {
    return 0.5 - Math.cos(Math.PI * progress) / 2;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

// Where to walk to past the door, as the points after it. Behind the
// avatar: straight in, INSIDE_DISTANCE or less in a small build, keeping
// WALL_MARGIN from where the build's footprint ends. Through its eyes: to the
// most open spot within MAX_EYES_INSIDE_DISTANCE of the door, the farthest
// from any wall or furniture with a clear way to it from just inside the
// door, so its look round shows the room rather than the wall beside the
// door; as behind it when there is none. The spot is well in, and roughly
// ahead (within EYES_CONE of straight on), never off to the side just past
// the doorway, where the door swings open into the room.
function insidePath({ door, inward, footprint }, blocking, camera) {
    const room = footprint ? roomAlong(door, inward, footprint) : Infinity;
    const straight = Math.max(1, Math.min(INSIDE_DISTANCE, room - WALL_MARGIN));
    const ahead = (distance, side = 0) => ({ x: door.x + inward.x * distance + inward.z * side, z: door.z + inward.z * distance - inward.x * side });
    if (camera === WalkThroughCamera.EYES && footprint) {
        const threshold = ahead(1);
        let best = null;
        if (isClear(door, threshold, blocking)) {
            for (let distance = EYES_MIN_DISTANCE; distance <= MAX_EYES_INSIDE_DISTANCE + 1e-9; distance += EYES_GRID_STEP) {
                for (let side = -MAX_EYES_INSIDE_DISTANCE; side <= MAX_EYES_INSIDE_DISTANCE + 1e-9; side += EYES_GRID_STEP) {
                    const spot = ahead(distance, side);
                    if (Math.hypot(distance, side) > MAX_EYES_INSIDE_DISTANCE || !withinFootprint(spot, footprint)) continue;
                    if (Math.abs(side) > (distance - 1) * Math.tan(EYES_CONE)) continue;
                    if (!isClear(threshold, spot, blocking)) continue;
                    const openness = clearance(spot, blocking);
                    // The most open; of two as open, the nearer the door.
                    if (!best || openness > best.openness + 1e-6 || (Math.abs(openness - best.openness) <= 1e-6 && distance < best.distance)) {
                        best = { spot, openness, distance, side };
                    }
                }
            }
        }
        if (best && best.openness > clearance(ahead(straight), blocking)) {
            return Math.abs(best.side) < 1e-6 ? [best.spot] : [threshold, best.spot];
        }
    }
    return [ahead(straight)];
}

// The spots tried through the avatar's eyes: this far apart, at least this
// far in, and within this angle of straight on from just inside the door.
const EYES_GRID_STEP = 0.5;
const EYES_MIN_DISTANCE = 2;
const EYES_CONE = Math.PI / 6;

// How far `point` is from the nearest of `boxes`, on the ground.
function clearance(point, boxes) {
    let nearest = Infinity;
    for (const box of boxes) {
        const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
        const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
        nearest = Math.min(nearest, Math.hypot(dx, dz));
    }
    return nearest;
}

// How far from `door` along `inward` the footprint ends.
function roomAlong(door, inward, footprint) {
    let room = Infinity;
    if (inward.x > 1e-6) room = Math.min(room, (footprint.maxX - door.x) / inward.x);
    if (inward.x < -1e-6) room = Math.min(room, (footprint.minX - door.x) / inward.x);
    if (inward.z > 1e-6) room = Math.min(room, (footprint.maxZ - door.z) / inward.z);
    if (inward.z < -1e-6) room = Math.min(room, (footprint.minZ - door.z) / inward.z);
    return room;
}

function withinFootprint(point, footprint) {
    return !footprint || (point.x > footprint.minX + WALL_MARGIN && point.x < footprint.maxX - WALL_MARGIN
        && point.z > footprint.minZ + WALL_MARGIN && point.z < footprint.maxZ - WALL_MARGIN);
}

// The bricks an avatar walking at `ground` would bump into: tall enough not
// to step onto, low enough not to walk under. Doors open as the avatar
// comes, so they never block.
function blockingBoxes(bricks, registry, ground) {
    const boxes = [];
    if (!registry || !Array.isArray(bricks)) return boxes;
    for (const brick of bricks) {
        const definition = registry.get?.(brick.definitionId);
        if (!definition || !brick.position || isPassableDoor(definition, brick.tilt || 0)) continue;
        for (const box of brickCollisionBoxes(brick.position, brick.definitionId, definition, brick.rotation || 0, brick.tilt || 0)) {
            if (box.max.y > ground + DEFAULT_MAX_STEP_HEIGHT && box.min.y < ground + AVATAR_COLLISION_HEIGHT) boxes.push(box);
        }
    }
    return boxes;
}

// Whether an avatar can walk in a straight line from `from` to `to` without
// touching any of `boxes`.
function isClear(from, to, boxes) {
    const length = distance(from, to);
    const steps = Math.max(1, Math.ceil(length / 0.2));
    for (let i = 0; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const z = from.z + ((to.z - from.z) * i) / steps;
        for (const box of boxes) {
            if (x > box.min.x - AVATAR_COLLISION_RADIUS && x < box.max.x + AVATAR_COLLISION_RADIUS
                && z > box.min.z - AVATAR_COLLISION_RADIUS && z < box.max.z + AVATAR_COLLISION_RADIUS) return false;
        }
    }
    return true;
}
