import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../../core/Hydrology.js';
import { riverWaterDepthAt } from '../../core/RiverFlow.js';
import { waterDepthSpeedFactor, DEFAULT_MAX_WALKING_DEPTH } from '../../core/AvatarWaterWalkability.js';

// Supplies real world water to the avatar's movement: how deep the water is at a
// point, how much wading slows the avatar, and where the surface lies in the
// terrain-relative frame AvatarPresence uses (0 is the ground under the avatar).
// The pure rules live in core/AvatarWaterWalkability.js (wading) and
// core/AvatarSwimming.js (swimming and diving).
//
// Standing water is `surfaceCategoryAt(...) === SURFACE_CATEGORY.WATER`, the
// same predicate the renderer uses: lakes and the sea, which an avatar wades
// into and swims in. A river (core/RiverFlow.js#riverWaterDepthAt(), the
// water in its carved bed) is wading only: it slows the avatar by its depth,
// but at most about half a unit deep it is never deep enough to swim, so it
// has no surface for swimming (waterSurfaceAt()).
//
// A lake frozen hard (`frozenAt(x, z)`, core/Season.js#lakeIceAt()) is
// walked on, not waded: it slows no one (depthAt() is 0) and it has a top,
// level with the surface, for the avatar to stand on (iceTopAt(); the step
// constraint stands it there). Under the ice the water is still there: a
// swimmer caught beneath it as it froze swims on (waterSurfaceAt()) until it
// comes out at the shore.
//
// `heightAt`/`isWaterAt`/`riverDepthAt`/`frozenAt` are injectable so tests
// can substitute synthetic values.
export class AvatarWaterConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED, maxWalkingDepth = DEFAULT_MAX_WALKING_DEPTH, heightAt, isWaterAt, riverDepthAt, frozenAt = null } = {}) {
        this._frozenAt = typeof frozenAt === 'function' ? frozenAt : () => false;
        this._heightAt = typeof heightAt === 'function' ? heightAt : (x, z) => terrainHeightAt(seed, x, z);
        this._isWaterAt = typeof isWaterAt === 'function'
            ? isWaterAt
            : (x, z) => surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER;
        // A synthetic ground (an injected heightAt) has no rivers unless it is
        // given some: the real world's rivers would not line up with it.
        this._riverDepthAt = typeof riverDepthAt === 'function'
            ? riverDepthAt
            : typeof heightAt === 'function' ? () => 0 : (x, z) => riverWaterDepthAt(seed, x, z);
        this._maxWalkingDepth = maxWalkingDepth;
    }

    get maxWalkingDepth() {
        return this._maxWalkingDepth;
    }

    // In standing water `LAKE_SURFACE_HEIGHT - groundHeight`, floored at 0 so a
    // shoreline sample above the surface never reports a negative depth; in a
    // river, the water in its bed; 0 on dry ground and on ice.
    depthAt(x, z) {
        if (!this._isWaterAt(x, z)) return this._riverDepthAt(x, z);
        if (this._frozenAt(x, z)) return 0;
        return Math.max(0, LAKE_SURFACE_HEIGHT - this._heightAt(x, z));
    }

    // The top of the ice on a frozen lake, in the terrain-relative frame, or
    // null where there is none.
    iceTopAt(x, z) {
        if (!this._isWaterAt(x, z) || !this._frozenAt(x, z)) return null;
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
