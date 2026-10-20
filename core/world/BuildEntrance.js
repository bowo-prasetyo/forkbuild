import { AVATAR_COLLISION_HEIGHT, AVATAR_COLLISION_RADIUS, brickAabb } from '../avatar/AvatarCollision.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../building/BrickWalkability.js';
import { archOpening, archOpeningHeightAt, brickCollisionBoxes, isPassableDoor } from '../building/BrickPassage.js';

// Where a visitor arrives to walk into a build: on open ground in front of
// its door, facing it (the Editor's Walk inside it, after Publish, and the
// guided first build's last step; docs/reviews/CreativeDirection-2026-10-11.md,
// "Step inside"). A build with no way in gets a spot in front of it instead.
//
// A door here is a standing door, or an arch an avatar fits through
// (core/building/BrickPassage.js), at ground level. Which side of it is outside is
// worked out by where a walking avatar can get to: a plan of the build is
// drawn on a grid, every doorway is shut, and the ground reached from the
// grid's edge is outside. A door with outside on one side only leads
// somewhere, so it is preferred over a free-standing arch or gate.
//
// Pure: bricks in, a spot out, in the build's own coordinates.

// How far in front of the door the visitor stands, tried in turn until one is
// clear: a few steps, so the door swings open as they walk up.
export const ENTRANCE_STAND_DISTANCES = Object.freeze([2.5, 2, 1.5]);
// How far past the doorway counts as having walked inside.
export const INSIDE_DEPTH = 0.6;
// How far past a doorway there must be room to stand for it to lead in.
const BEHIND_DISTANCE = 1;
// The fallback spot's distance in front of a build with no door.
const FRONT_DISTANCE = 2.5;
const MARGIN = 3;
// The grid's cell: fine enough to find a one-unit doorway's way through.
const FINE_CELL = 0.25;
const COARSE_CELL = 0.5;
// Above this many cell-and-box tests, a coarser grid.
const FINE_BUDGET = 4_000_000;

// bricks: [{ id, definitionId, position: { x, y, z }, rotation, tilt }];
// registry: { get(definitionId) }. Returns null for no bricks, else
// { kind: 'door' | 'front', door: { id, definitionId, x, y, z } | null,
//   stand: { x, y, z }, heading (degrees, an avatar's rotationY: 0 faces +z,
//   90 faces +x), inward: { x, z } (a unit vector through the door into the
//   build, or null), footprint: { minX, maxX, minZ, maxZ } (the build's
//   extent on the ground) }.
export function findBuildEntrance(bricks, registry) {
    const solids = [];
    let bounds = null;
    for (const brick of bricks || []) {
        const definition = registry?.get?.(brick.definitionId);
        if (!definition || !brick.position) continue;
        const box = brickAabb(brick.position, definition, brick.rotation || 0, brick.tilt || 0);
        bounds = bounds ? union(bounds, box) : box;
        solids.push({ brick, definition, box });
    }
    if (!bounds) return null;
    const ground = bounds.min.y;
    const footprint = Object.freeze({ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z });

    const doorways = solids.filter(({ brick, definition, box }) => isWayIn(brick, definition) && box.min.y - ground <= DEFAULT_MAX_STEP_HEIGHT);
    if (doorways.length > 0) {
        const plan = drawPlan(solids, doorways, bounds, ground);
        const center = { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
        const choices = [];
        for (const doorway of doorways) {
            const choice = entranceThrough(doorway, plan, center, ground, footprint);
            if (choice) choices.push(choice);
        }
        choices.sort(compareChoices);
        if (choices.length > 0) return choices[0].entrance;
    }

    // No way in: in front of the build (its -z side, where the ready-made
    // builds face), looking at it.
    return Object.freeze({
        kind: 'front',
        door: null,
        stand: Object.freeze({ x: (bounds.min.x + bounds.max.x) / 2, y: ground, z: bounds.min.z - FRONT_DISTANCE }),
        heading: 0,
        inward: null,
        footprint
    });
}

// Whether `position` (the build's coordinates) has gone in through the
// entrance's door: past the doorway on its inside, and within the build
// (not round the side of it). Always true for a build with no door, where
// arriving is all there is to do.
export function hasWalkedInside(entrance, position) {
    if (!entrance || !position) return false;
    if (!entrance.door || !entrance.inward) return true;
    const dx = position.x - entrance.door.x;
    const dz = position.z - entrance.door.z;
    if (dx * entrance.inward.x + dz * entrance.inward.z < INSIDE_DEPTH) return false;
    const { footprint } = entrance;
    return !footprint || (position.x > footprint.minX && position.x < footprint.maxX
        && position.z > footprint.minZ && position.z < footprint.maxZ);
}

function isWayIn(brick, definition) {
    if (isPassableDoor(definition, brick.tilt || 0)) return true;
    const opening = archOpening(brick.definitionId, brick.tilt || 0);
    return Boolean(opening) && opening.sill <= DEFAULT_MAX_STEP_HEIGHT
        && archOpeningHeightAt(opening, 0) - opening.sill >= AVATAR_COLLISION_HEIGHT;
}

// Which cells a walking avatar could stand in (ignoring anything low enough
// to step onto), with every doorway shut, and which of those are reached from
// the grid's edge: outside.
function drawPlan(solids, doorways, bounds, ground) {
    const boxes = [];
    for (const { brick, definition } of solids) {
        for (const box of brickCollisionBoxes(brick.position, brick.definitionId, definition, brick.rotation || 0, brick.tilt || 0)) {
            boxes.push(box);
        }
    }
    for (const doorway of doorways) boxes.push(doorway.box);
    const low = ground + DEFAULT_MAX_STEP_HEIGHT;
    const high = ground + AVATAR_COLLISION_HEIGHT;
    const blocking = boxes.filter((box) => box.max.y > low && box.min.y < high);

    const minX = bounds.min.x - MARGIN;
    const minZ = bounds.min.z - MARGIN;
    const spanX = bounds.max.x - bounds.min.x + 2 * MARGIN;
    const spanZ = bounds.max.z - bounds.min.z + 2 * MARGIN;
    const fine = (spanX / FINE_CELL) * (spanZ / FINE_CELL) * blocking.length <= FINE_BUDGET;
    const cell = fine ? FINE_CELL : COARSE_CELL;
    const columns = Math.ceil(spanX / cell) + 1;
    const rows = Math.ceil(spanZ / cell) + 1;
    const free = new Uint8Array(columns * rows);
    const r = AVATAR_COLLISION_RADIUS;
    const isFree = (x, z) => !blocking.some((box) => x + r > box.min.x && x - r < box.max.x && z + r > box.min.z && z - r < box.max.z);
    for (let i = 0; i < columns; i++) {
        const x = minX + i * cell;
        for (let j = 0; j < rows; j++) {
            const z = minZ + j * cell;
            free[i * rows + j] = isFree(x, z) ? 1 : 0;
        }
    }

    const outside = new Uint8Array(columns * rows);
    const queue = [];
    const visit = (i, j) => {
        if (i < 0 || j < 0 || i >= columns || j >= rows) return;
        const k = i * rows + j;
        if (!free[k] || outside[k]) return;
        outside[k] = 1;
        queue.push(k);
    };
    for (let i = 0; i < columns; i++) { visit(i, 0); visit(i, rows - 1); }
    for (let j = 0; j < rows; j++) { visit(0, j); visit(columns - 1, j); }
    while (queue.length > 0) {
        const k = queue.pop();
        const i = Math.floor(k / rows);
        const j = k % rows;
        visit(i + 1, j); visit(i - 1, j); visit(i, j + 1); visit(i, j - 1);
    }

    // Free asks about the point itself; outside, about the grid cells round
    // it, any of which reached from the edge will do.
    const at = (x, z) => {
        const free = isFree(x, z);
        const fi = (x - minX) / cell;
        const fj = (z - minZ) / cell;
        let reached = false;
        for (const i of [Math.floor(fi), Math.ceil(fi)]) {
            for (const j of [Math.floor(fj), Math.ceil(fj)]) {
                if (i < 0 || j < 0 || i >= columns || j >= rows) reached = true;
                else if (outside[i * rows + j]) reached = true;
            }
        }
        return { free, outside: free && reached };
    };
    return { at };
}

// The spot in front of `doorway` on its outside, or null when neither side
// is outside (a door between two rooms, or into a courtyard).
function entranceThrough(doorway, plan, center, ground, footprint) {
    const { brick } = doorway;
    const turn = ((brick.rotation || 0) * Math.PI) / 180;
    // The door's local +z, as drawn (a turn by rotationY about the vertical axis).
    const normal = { x: Math.sin(turn), z: Math.cos(turn) };
    const sides = [];
    for (const side of [1, -1]) {
        for (const distance of ENTRANCE_STAND_DISTANCES) {
            const x = brick.position.x + normal.x * side * distance;
            const z = brick.position.z + normal.z * side * distance;
            const cell = plan.at(x, z);
            if (cell.free && cell.outside) {
                sides.push({ side, stand: { x, z } });
                break;
            }
        }
    }
    if (sides.length === 0) return null;
    // A door into nothing (set into a solid tower, or over a stall too
    // shallow to stand in) is no way in: there must be room to stand just
    // past it, on both sides.
    for (const side of [1, -1]) {
        const past = plan.at(brick.position.x + normal.x * side * BEHIND_DISTANCE, brick.position.z + normal.z * side * BEHIND_DISTANCE);
        if (!past.free) return null;
    }
    // Outside on both sides (an arch on its own, a gate): stand on the side
    // farther from the build's middle, the -z side if that's a tie.
    const away = (option) => Math.hypot(option.stand.x - center.x, option.stand.z - center.z);
    sides.sort((a, b) => (away(b) - away(a)) || (a.stand.z - b.stand.z));
    const { side, stand } = sides[0];
    const heading = (Math.atan2(brick.position.x - stand.x, brick.position.z - stand.z) * 180) / Math.PI;
    return {
        leadsIn: sides.length === 1,
        isDoor: isPassableDoor(doorway.definition, brick.tilt || 0),
        bottom: doorway.box.min.y,
        fromCenter: Math.hypot(brick.position.x - center.x, brick.position.z - center.z),
        entrance: Object.freeze({
            kind: 'door',
            door: Object.freeze({ id: brick.id ?? null, definitionId: brick.definitionId, x: brick.position.x, y: brick.position.y, z: brick.position.z }),
            stand: Object.freeze({ x: stand.x, y: ground, z: stand.z }),
            heading: normalizeDegrees(heading),
            inward: Object.freeze({ x: -normal.x * side, z: -normal.z * side }),
            footprint
        })
    };
}

// A door that leads in, then a door before an arch, then the lowest, then the
// one nearest the middle (the main way in rather than a side door).
function compareChoices(a, b) {
    if (a.leadsIn !== b.leadsIn) return a.leadsIn ? -1 : 1;
    if (a.isDoor !== b.isDoor) return a.isDoor ? -1 : 1;
    if (a.bottom !== b.bottom) return a.bottom - b.bottom;
    return a.fromCenter - b.fromCenter;
}

function union(a, b) {
    return {
        min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
        max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) }
    };
}

function normalizeDegrees(degrees) {
    const turned = ((degrees % 360) + 360) % 360;
    return Math.abs(turned) < 1e-9 ? 0 : turned;
}
