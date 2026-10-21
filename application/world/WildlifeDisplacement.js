import { wildAnimalById, isAnimalDisplaced } from '../../core/nature/WildlifeDisplacement.js';
import { MAX_WANDER_DISTANCE } from '../../core/nature/WildlifeMotion.js';
import { WILDLIFE_LATTICE_SPACING } from '../../core/nature/WildlifeField.js';
import { TERRAIN_TILE_SIZE } from '../../core/nature/TerrainTiling.js';
import { DEFAULT_WORLD_SEED } from '../../core/nature/TerrainHeightField.js';

// How often a tile's bricks are gathered again, so a build put up (or taken
// down) nearby is taken into account, as ResidentRuntime does for residents.
const OBSTACLE_REFRESH_MS = 2000;

// At most one stale tile is gathered again per this many milliseconds:
// gathering scans every brick of the Worlds nearby.
const REFRESH_SPACING_MS = 50;

// A cap on cached tiles, far above the few dozen around a viewer.
const MAX_CACHED_TILES = 256;

// A cap on remembered animals (an id names one placement forever).
const MAX_CACHED_ANIMALS = 4096;

// The bricks gathered for a tile must reach every animal it holds, however
// far it wanders and however large its body (1 m covers either species).
export const WILDLIFE_OBSTACLE_QUERY_RADIUS = Math.SQRT2 * (TERRAIN_TILE_SIZE / 2) + MAX_WANDER_DISTANCE + 1;

// Which wild animals keep away from what has been built
// (core/nature/WildlifeDisplacement.js), for this session's loaded Worlds.
// Asked by animal id, as caught animals are
// (application/world/AnimalRuntimeInstances.js#isExcluded), so everything that
// already leaves a caught animal out (drawing, collision, catching, sounds,
// what residents mention) leaves a displaced one out too.
//
// `obstaclesNear(center)` gathers the brick boxes within
// WILDLIFE_OBSTACLE_QUERY_RADIUS of `center` (usually
// AvatarMovementConstraint#obstaclesNear with no step allowance, so a floor
// tile counts as much as a wall). They are gathered once per terrain tile
// and refreshed every OBSTACLE_REFRESH_MS; each animal's answer is kept
// until its tile's bricks are gathered again.
export class WildlifeDisplacement {
    constructor({ obstaclesNear = () => [], seed = DEFAULT_WORLD_SEED, now = () => Date.now() } = {}) {
        this._obstaclesNear = obstaclesNear;
        this._seed = seed;
        this._now = now;
        this._tiles = new Map(); // tile key -> { gatheredAt, boxes, verdicts: Map(id -> boolean) }
        this._animals = new Map(); // id -> its wildlifeInRegion() record, or null
        this._lastRefreshAt = -Infinity;
    }

    // Whether the wild animal `id` keeps away from a build. Always false for
    // anything else (a released animal stays where it was let go).
    isDisplaced(id) {
        let animal = this._animals.get(id);
        if (animal === undefined) {
            if (this._animals.size >= MAX_CACHED_ANIMALS) this._animals.clear();
            animal = wildAnimalById(this._seed, id);
            this._animals.set(id, animal);
        }
        if (!animal) return false;
        const tile = this._tileFor(animal);
        let verdict = tile.verdicts.get(id);
        if (verdict === undefined) {
            verdict = isAnimalDisplaced(animal, tile.boxes);
            tile.verdicts.set(id, verdict);
        }
        return verdict;
    }

    // Expire every tile's gathered bricks, e.g. after this session's own edit:
    // the next tile asked about gathers again at once, the rest on their
    // turns, REFRESH_SPACING_MS apart as any stale ones are, so the tiles round
    // a viewer never all refresh in one frame.
    invalidate() {
        for (const tile of this._tiles.values()) tile.gatheredAt = -Infinity;
        this._lastRefreshAt = -Infinity;
    }

    _tileFor(animal) {
        // Cells never straddle tiles (TERRAIN_TILE_SIZE is a whole number of
        // cells), so the cell names the tile.
        const cellX = Math.floor(animal.x / WILDLIFE_LATTICE_SPACING);
        const cellZ = Math.floor(animal.z / WILDLIFE_LATTICE_SPACING);
        const tx = Math.floor((cellX * WILDLIFE_LATTICE_SPACING) / TERRAIN_TILE_SIZE);
        const tz = Math.floor((cellZ * WILDLIFE_LATTICE_SPACING) / TERRAIN_TILE_SIZE);
        const key = `${tx},${tz}`;
        const now = this._now();
        let tile = this._tiles.get(key);
        const stale = tile && now - tile.gatheredAt >= OBSTACLE_REFRESH_MS
            && now - this._lastRefreshAt >= REFRESH_SPACING_MS;
        if (!tile || stale) {
            if (stale) this._lastRefreshAt = now;
            if (this._tiles.size >= MAX_CACHED_TILES) this._tiles.clear();
            const center = { x: (tx + 0.5) * TERRAIN_TILE_SIZE, y: 0, z: (tz + 0.5) * TERRAIN_TILE_SIZE };
            tile = { gatheredAt: now, boxes: this._obstaclesNear(center) || [], verdicts: new Map() };
            this._tiles.set(key, tile);
        }
        return tile;
    }
}
