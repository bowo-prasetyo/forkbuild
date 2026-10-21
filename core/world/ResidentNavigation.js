// How a World Resident finds its way round what is built near its home: out
// through a door, round the corner of a house, down a lane between two
// walls. core/world/ResidentMotion.js decides where a resident is going; this
// file says which way it goes.
//
// A NAVIGATION GRID. The ground within `reach` of home is cut into cells
// NAV_CELL across, centred on home. A cell is open when a resident could
// stand at its centre: dry ground (core/world/ResidentPath.js#isResidentGroundAt,
// sampled every TERRAIN_CELL and kept per home, since the land never
// changes), and clear of every brick and trunk by the resident's body
// (RESIDENT_COLLISION_RADIUS) plus half a cell's diagonal. That margin makes
// every step between two neighbouring open cells clear too, and a 1 m
// doorway still leaves a corridor wider than a cell, so a door is always a
// way through. A brick wholly over a resident's head (the wall over a door)
// is not in its way (ResidentPath.js#isInResidentWay). A step between
// neighbours must not be steeper than an avatar can walk.
//
// THE QUICKEST WAY between two cells is a shortest path over the open cells
// and their eight neighbours (no cutting a blocked corner), ties broken by
// cell order, so every replica finds the same one. smoothPath() then pulls
// it tight: it walks straight from each corner as far as the exact geometry
// allows (isStraightClear()), so a resident heads straight for a doorway and
// turns only where something is in the way.
//
// Pure: everything here is a function of the home, the seed and the
// obstacles handed in. A built navigation keeps the ways it has found, and
// the caller keeps the navigation for as long as the obstacles stay the same
// (application/world/ResidentRuntime.js).

import { isResidentGroundAt, isInResidentWay, segmentHitsBox, segmentHitsCircle, RESIDENT_COLLISION_RADIUS } from './ResidentPath.js';
import { terrainHeightAt } from '../nature/TerrainHeightField.js';
import { isWalkableSlope, DEFAULT_MAX_WALKABLE_SLOPE } from '../nature/TerrainWalkability.js';

// How far apart cells are.
export const NAV_CELL = 0.125;

// How far apart the land is sampled.
const TERRAIN_CELL = 0.5;

// A cell must be this much farther from an obstacle than the body's radius.
const BLOCK_MARGIN = NAV_CELL * Math.SQRT1_2;

// How far apart a straight walk is checked against the land.
const STRAIGHT_SAMPLE_SPACING = TERRAIN_CELL / 2;

// The land around a home, kept per (seed, home, reach): it never changes.
const terrainCache = new Map();
const MAX_CACHED_TERRAIN = 128;

// The land within `reach` of `home`, every TERRAIN_CELL: { originX, originZ,
// size, ground: Uint8Array, height: Float64Array }, rows along x.
function terrainAround(seed, home, reach) {
    const key = `${seed}|${home.x},${home.z}|${reach}`;
    const kept = terrainCache.get(key);
    if (kept) return kept;
    const half = Math.ceil((reach + TERRAIN_CELL) / TERRAIN_CELL);
    const size = 2 * half + 1;
    const originX = home.x - half * TERRAIN_CELL;
    const originZ = home.z - half * TERRAIN_CELL;
    const ground = new Uint8Array(size * size);
    const height = new Float64Array(size * size);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const x = originX + i * TERRAIN_CELL;
            const z = originZ + j * TERRAIN_CELL;
            ground[i * size + j] = isResidentGroundAt(seed, x, z) ? 1 : 0;
            height[i * size + j] = terrainHeightAt(seed, x, z);
        }
    }
    const land = { originX, originZ, size, ground, height };
    if (terrainCache.size >= MAX_CACHED_TERRAIN) terrainCache.clear();
    terrainCache.set(key, land);
    return land;
}

// Whether a resident may stand at (x, z) as far as the land goes: dry at all
// four samples round it. The height there, blended between them.
function landAt(land, x, z) {
    const fx = (x - land.originX) / TERRAIN_CELL;
    const fz = (z - land.originZ) / TERRAIN_CELL;
    const i = Math.min(land.size - 2, Math.max(0, Math.floor(fx)));
    const j = Math.min(land.size - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i));
    const tz = Math.min(1, Math.max(0, fz - j));
    const a = i * land.size + j;
    const b = (i + 1) * land.size + j;
    const dry = land.ground[a] && land.ground[a + 1] && land.ground[b] && land.ground[b + 1];
    const h = (land.height[a] * (1 - tz) + land.height[a + 1] * tz) * (1 - tx)
        + (land.height[b] * (1 - tz) + land.height[b + 1] * tz) * tx;
    return { dry: Boolean(dry), height: h };
}

// A min-heap of cell indices by cost, ties to the lower index.
class CellHeap {
    constructor() {
        this.cells = [];
        this.costs = [];
    }

    get size() {
        return this.cells.length;
    }

    _less(a, b) {
        return this.costs[a] < this.costs[b] || (this.costs[a] === this.costs[b] && this.cells[a] < this.cells[b]);
    }

    _swap(a, b) {
        [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
        [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
    }

    push(cell, cost) {
        this.cells.push(cell);
        this.costs.push(cost);
        let i = this.cells.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (!this._less(i, parent)) break;
            this._swap(i, parent);
            i = parent;
        }
    }

    pop() {
        const top = { cell: this.cells[0], cost: this.costs[0] };
        const lastCell = this.cells.pop();
        const lastCost = this.costs.pop();
        if (this.cells.length > 0) {
            this.cells[0] = lastCell;
            this.costs[0] = lastCost;
            let i = 0;
            for (;;) {
                const left = 2 * i + 1;
                const right = left + 1;
                let smallest = i;
                if (left < this.cells.length && this._less(left, smallest)) smallest = left;
                if (right < this.cells.length && this._less(right, smallest)) smallest = right;
                if (smallest === i) break;
                this._swap(i, smallest);
                i = smallest;
            }
        }
        return top;
    }
}

// The eight neighbours, orthogonal first: [di, dj, length in cells].
const NEIGHBOURS = Object.freeze([
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
]);

// A navigation grid round `home` ({ x, z }) out to `reach`. `seed` null
// leaves the land out (everywhere is open, level ground). `boxes` are brick
// collision boxes ({ min: {x, y?, z}, max: {x, y?, z} }), `circles` trunks
// ({ center: {x, z}, radius }), all in the same space as home.
export function buildResidentNavigation({
    home,
    reach,
    seed = null,
    boxes = [],
    circles = [],
    radius = RESIDENT_COLLISION_RADIUS,
    maxSlope = DEFAULT_MAX_WALKABLE_SLOPE
} = {}) {
    const hx = home.x;
    const hz = home.z;
    const half = Math.ceil(reach / NAV_CELL);
    const size = 2 * half + 1;
    const count = size * size;
    const land = seed === null ? null : terrainAround(seed, home, reach);
    const inWay = (boxes || []).filter(isInResidentWay);
    const trunks = circles || [];

    const pointOf = (cell) => ({
        x: hx + (Math.floor(cell / size) - half) * NAV_CELL,
        z: hz + ((cell % size) - half) * NAV_CELL
    });

    // Which cells are open, and the land's height at each.
    const open = new Uint8Array(count);
    const height = new Float64Array(count);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const dx = (i - half) * NAV_CELL;
            const dz = (j - half) * NAV_CELL;
            if (dx * dx + dz * dz > reach * reach + 1e-9) continue;
            const cell = i * size + j;
            if (land) {
                const here = landAt(land, hx + dx, hz + dz);
                if (!here.dry) continue;
                height[cell] = here.height;
            }
            open[cell] = 1;
        }
    }
    // Close every cell whose centre is strictly within the grown box.
    const grow = radius + BLOCK_MARGIN;
    for (const box of inWay) {
        const iMin = Math.max(0, Math.floor((box.min.x - grow - hx) / NAV_CELL) + 1 + half);
        const iMax = Math.min(size - 1, Math.ceil((box.max.x + grow - hx) / NAV_CELL) - 1 + half);
        const jMin = Math.max(0, Math.floor((box.min.z - grow - hz) / NAV_CELL) + 1 + half);
        const jMax = Math.min(size - 1, Math.ceil((box.max.z + grow - hz) / NAV_CELL) - 1 + half);
        for (let i = iMin; i <= iMax; i++) {
            for (let j = jMin; j <= jMax; j++) open[i * size + j] = 0;
        }
    }
    for (const trunk of trunks) {
        const reachOut = trunk.radius + grow;
        const iMin = Math.max(0, Math.floor((trunk.center.x - reachOut - hx) / NAV_CELL) + half);
        const iMax = Math.min(size - 1, Math.ceil((trunk.center.x + reachOut - hx) / NAV_CELL) + half);
        const jMin = Math.max(0, Math.floor((trunk.center.z - reachOut - hz) / NAV_CELL) + half);
        const jMax = Math.min(size - 1, Math.ceil((trunk.center.z + reachOut - hz) / NAV_CELL) + half);
        for (let i = iMin; i <= iMax; i++) {
            for (let j = jMin; j <= jMax; j++) {
                const p = { x: hx + (i - half) * NAV_CELL, z: hz + (j - half) * NAV_CELL };
                if (Math.hypot(p.x - trunk.center.x, p.z - trunk.center.z) < reachOut) open[i * size + j] = 0;
            }
        }
    }

    const homeCell = half * size + half;

    // The cell whose centre is nearest `point`, or -1 outside the grid.
    const cellOf = (point) => {
        const i = Math.round((point.x - hx) / NAV_CELL) + half;
        const j = Math.round((point.z - hz) / NAV_CELL) + half;
        if (i < 0 || j < 0 || i >= size || j >= size) return -1;
        return i * size + j;
    };

    // Shortest ways from `source` over open cells, kept per source.
    const searches = new Map();
    const searchFrom = (source) => {
        let found = searches.get(source);
        if (found) return found;
        const cost = new Float64Array(count).fill(Infinity);
        const previous = new Int32Array(count).fill(-1);
        if (open[source]) {
            cost[source] = 0;
            const heap = new CellHeap();
            heap.push(source, 0);
            while (heap.size > 0) {
                const { cell, cost: reached } = heap.pop();
                if (reached > cost[cell]) continue;
                const i = Math.floor(cell / size);
                const j = cell % size;
                for (const [di, dj, steps] of NEIGHBOURS) {
                    const ni = i + di;
                    const nj = j + dj;
                    if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
                    const next = ni * size + nj;
                    if (!open[next]) continue;
                    // No cutting a blocked corner.
                    if (di !== 0 && dj !== 0 && (!open[ni * size + j] || !open[i * size + nj])) continue;
                    const length = steps * NAV_CELL;
                    if (land && !isWalkableSlope(height[cell], height[next], length, maxSlope)) continue;
                    const through = reached + length;
                    if (through < cost[next]) {
                        cost[next] = through;
                        previous[next] = cell;
                        heap.push(next, through);
                    }
                }
            }
        }
        found = { cost, previous };
        searches.set(source, found);
        return found;
    };

    // Whether a resident can walk straight from `from` to `to` by the exact
    // geometry: clear of every brick and trunk by its body, on dry land, never
    // steeper than an avatar can walk.
    const isStraightClear = (from, to) => {
        for (const box of inWay) {
            if (segmentHitsBox(from, to, box, radius)) return false;
        }
        for (const trunk of trunks) {
            if (segmentHitsCircle(from, to, trunk, radius)) return false;
        }
        if (!land) return true;
        const length = Math.hypot(to.x - from.x, to.z - from.z);
        const steps = Math.max(1, Math.ceil(length / STRAIGHT_SAMPLE_SPACING));
        let previousHeight = null;
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const here = landAt(land, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t);
            if (!here.dry) return false;
            if (previousHeight !== null && !isWalkableSlope(previousHeight, here.height, length / steps, maxSlope)) return false;
            previousHeight = here.height;
        }
        return true;
    };

    return {
        home: { x: hx, z: hz },
        homeCell,
        cellOf,
        pointOf,
        // Whether a resident may stand in `cell`.
        isOpen: (cell) => cell >= 0 && cell < count && open[cell] === 1,
        // The cells from `from` to `to` along the quickest way, both ends
        // included, or null when there is none.
        cellPath(from, to) {
            if (from === to) return open[from] ? [from] : null;
            const { cost, previous } = searchFrom(from);
            if (!(cost[to] < Infinity)) return null;
            const path = [to];
            while (path[path.length - 1] !== from) path.push(previous[path[path.length - 1]]);
            return path.reverse();
        },
        isStraightClear,
        // `cells` (a cellPath()) pulled tight: the corners a resident walks
        // between, as points, first and last cells included. From each
        // corner it goes straight as far along the path as it can.
        smoothPath(cells) {
            if (!cells || cells.length === 0) return [];
            const points = [pointOf(cells[0])];
            let anchor = 0;
            while (anchor < cells.length - 1) {
                let reach = anchor + 1;
                while (reach + 1 < cells.length && isStraightClear(pointOf(cells[anchor]), pointOf(cells[reach + 1]))) reach++;
                points.push(pointOf(cells[reach]));
                anchor = reach;
            }
            return points;
        }
    };
}
