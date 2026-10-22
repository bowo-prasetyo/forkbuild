import { BUILD_CLEARING, isTreeDisplaced } from '../../core/nature/TreeDisplacement.js';
import { TERRAIN_TILE_SIZE } from '../../core/nature/TerrainTiling.js';
import { MAX_TREE_COLLISION_RADIUS } from '../../core/avatar/AvatarTreeCollisionQuery.js';

// How often a tile's bricks are gathered again, so a build put up (or taken
// down) nearby is taken into account, as WildlifeDisplacement does for
// animals.
const OBSTACLE_REFRESH_MS = 2000;

// At most one stale tile is gathered again per this many milliseconds:
// gathering scans every brick of the Worlds nearby.
const REFRESH_SPACING_MS = 50;

// A cap on cached tiles, far above the few dozen around a viewer.
const MAX_CACHED_TILES = 256;

// The bricks gathered for a tile must reach every trunk standing in it, from
// its middle to a corner, the widest trunk and the clearing round a build
// beyond.
export const TREE_OBSTACLE_QUERY_RADIUS = Math.SQRT2 * (TERRAIN_TILE_SIZE / 2) + MAX_TREE_COLLISION_RADIUS + BUILD_CLEARING + 1;

// Which trees give way to what has been built (core/nature/TreeDisplacement.js),
// for this session's loaded Worlds: none grows within `clearing`
// (BUILD_CLEARING) of a brick. Asked by a tree's trunk circle
// (core/nature/TreeCollisionGeometry.js#treeCollisionCircleFor()), which every
// place that meets trees already holds: drawing (renderer/TreeForest.js),
// avatar and vehicle collision (application/avatar/AvatarTreeConstraint.js),
// residents' ways (application/world/ResidentRuntime.js) and where a
// visitor arrives at a door (application/worldNavigation/arrivalMethods.js).
//
// `obstaclesNear(center)` gathers the brick boxes within
// TREE_OBSTACLE_QUERY_RADIUS of `center` (usually
// AvatarMovementConstraint#obstaclesNear with no step allowance, so a floor
// tile counts as much as a wall). They are gathered once per terrain tile and
// refreshed every OBSTACLE_REFRESH_MS, a tile at a time; each tree's answer is
// kept until its tile's bricks are gathered again.
//
// version() counts the times an answer already given has changed, so a
// caller that keeps answers (the forest's sorted trees) knows to ask again.
// Calling it also refreshes one stale tile, so a caller asking every frame
// sees a build arrive or go within a refresh.
export class TreeDisplacement {
    constructor({ obstaclesNear = () => [], now = () => Date.now(), clearing = BUILD_CLEARING } = {}) {
        this._obstaclesNear = obstaclesNear;
        this._clearing = clearing;
        this._now = now;
        this._tiles = new Map(); // tile key -> { tx, tz, gatheredAt, boxes, verdicts: Map(key -> { circle, displaced }) }
        this._lastRefreshAt = -Infinity;
        this._version = 0;
    }

    // Whether the tree whose trunk is `circle` gives way to a build.
    isDisplaced(circle) {
        if (!circle || !circle.center) return false;
        const tile = this._tileAt(circle.center.x, circle.center.z);
        const key = `${circle.center.x},${circle.center.z}`;
        let verdict = tile.verdicts.get(key);
        if (verdict === undefined) {
            verdict = { circle, displaced: isTreeDisplaced(circle, tile.boxes, this._clearing) };
            tile.verdicts.set(key, verdict);
        }
        return verdict.displaced;
    }

    // The trees of `circles` that don't give way: what is still there.
    standing(circles) {
        return circles.filter((circle) => !this.isDisplaced(circle));
    }

    // How many times an answer already given has changed. Refreshes one
    // stale tile first, REFRESH_SPACING_MS apart.
    version() {
        const now = this._now();
        if (now - this._lastRefreshAt >= REFRESH_SPACING_MS) {
            for (const tile of this._tiles.values()) {
                if (now - tile.gatheredAt < OBSTACLE_REFRESH_MS) continue;
                this._lastRefreshAt = now;
                this._gather(tile, now);
                break;
            }
        }
        return this._version;
    }

    // Expire every tile's gathered bricks, e.g. after this session's own edit
    // or a World loaded or let go: the next question about a tile gathers it
    // again at once, and version() takes the rest in turn.
    invalidate() {
        for (const tile of this._tiles.values()) tile.gatheredAt = -Infinity;
        this._lastRefreshAt = -Infinity;
    }

    _tileAt(x, z) {
        const tx = Math.floor(x / TERRAIN_TILE_SIZE);
        const tz = Math.floor(z / TERRAIN_TILE_SIZE);
        const key = `${tx},${tz}`;
        const now = this._now();
        let tile = this._tiles.get(key);
        if (!tile) {
            if (this._tiles.size >= MAX_CACHED_TILES) this._tiles.clear();
            tile = { tx, tz, gatheredAt: -Infinity, boxes: [], verdicts: new Map() };
            this._tiles.set(key, tile);
            this._gather(tile, now);
        } else if (tile.gatheredAt === -Infinity) {
            // Invalidated: this session's own change is seen at once.
            this._gather(tile, now);
        }
        return tile;
    }

    // Gathers `tile`'s bricks again and re-asks every tree already answered
    // there; any answer that changes moves version() on.
    _gather(tile, now) {
        const center = { x: (tile.tx + 0.5) * TERRAIN_TILE_SIZE, y: 0, z: (tile.tz + 0.5) * TERRAIN_TILE_SIZE };
        tile.boxes = this._obstaclesNear(center) || [];
        tile.gatheredAt = now;
        let changed = false;
        for (const verdict of tile.verdicts.values()) {
            const displaced = isTreeDisplaced(verdict.circle, tile.boxes, this._clearing);
            if (displaced !== verdict.displaced) {
                verdict.displaced = displaced;
                changed = true;
            }
        }
        if (changed) this._version++;
    }
}
