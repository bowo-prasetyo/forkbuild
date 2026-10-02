import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../../core/Hydrology.js';
import { waterDepthSpeedFactor, DEFAULT_MAX_WALKING_DEPTH } from '../../core/AvatarWaterWalkability.js';

// Supplies real world water to the avatar's movement: how deep the water is at a
// point, how much wading slows the avatar, and where the surface lies in the
// terrain-relative frame AvatarPresence uses (0 is the ground under the avatar).
// The pure rules live in core/AvatarWaterWalkability.js (wading) and
// core/AvatarSwimming.js (swimming and diving).
//
// "Water" is `surfaceCategoryAt(...) === SURFACE_CATEGORY.WATER`, the same
// predicate the renderer uses, so lakes and the sea count and a river (ground
// color only) never does.
//
// `heightAt`/`isWaterAt` are injectable so tests can substitute synthetic values.
export class AvatarWaterConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED, maxWalkingDepth = DEFAULT_MAX_WALKING_DEPTH, heightAt, isWaterAt } = {}) {
        this._heightAt = typeof heightAt === 'function' ? heightAt : (x, z) => terrainHeightAt(seed, x, z);
        this._isWaterAt = typeof isWaterAt === 'function'
            ? isWaterAt
            : (x, z) => surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER;
        this._maxWalkingDepth = maxWalkingDepth;
    }

    get maxWalkingDepth() {
        return this._maxWalkingDepth;
    }

    // 0 on dry ground, else `LAKE_SURFACE_HEIGHT - groundHeight`, floored at 0 so a
    // shoreline sample above the surface never reports a negative depth.
    depthAt(x, z) {
        if (!this._isWaterAt(x, z)) return 0;
        return Math.max(0, LAKE_SURFACE_HEIGHT - this._heightAt(x, z));
    }

    // The water surface in the terrain-relative frame (which is the depth), or null
    // where there is no standing water.
    waterSurfaceAt(x, z) {
        if (!this._isWaterAt(x, z)) return null;
        return LAKE_SURFACE_HEIGHT - this._heightAt(x, z);
    }

    // The terrain height in world units, for carrying a height from one column to
    // the next: a swimmer keeps its world height, not its height above the bed.
    groundHeightAt(x, z) {
        return this._heightAt(x, z);
    }

    // Read before simulating a tick, against the avatar's current position.
    speedFactorAt(x, z) {
        return waterDepthSpeedFactor(this.depthAt(x, z), this._maxWalkingDepth);
    }
}
