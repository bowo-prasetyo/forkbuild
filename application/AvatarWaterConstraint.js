import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../core/Hydrology.js';
import { isWalkableWaterDepth, waterDepthSpeedFactor, DEFAULT_MAX_WALKING_DEPTH } from '../core/AvatarWaterWalkability.js';

// 0.9.634 — Avatar Shallow-Water Ground Traversal. The application-layer
// half of core/AvatarWaterWalkability.js, mirroring EXACTLY the split
// application/AvatarTerrainConstraint.js already established for slope:
// this class supplies the real world coordinates, the real terrain
// height field, and the real water classification; core/
// AvatarWaterWalkability.js supplies the pure depth math applied to it.
//
// A deliberate SIBLING of AvatarTerrainConstraint, never a change to
// it — see tests/AvatarShallowWaterTraversalBoundaryAudit.test.js
// (0.9.633) Section B: that class's own complete absence of any
// Hydrology/WATER reference is a real, load-bearing fact (it stays the
// one constraint that only ever reasons about slope), not an oversight
// this milestone should "fix" by teaching it about water. A second,
// narrow constraint that reasons about depth composes through the
// SAME already-four-times-precedented optional-constraint slot in
// application/AvatarMovementController.js, rather than growing an
// existing class a second, unrelated responsibility.
//
// `isWaterAt` reads `surfaceCategoryAt(...) === SURFACE_CATEGORY.WATER`
// by default — the EXACT SAME predicate
// application/RenderWorldViewUseCase.js#withGroundElevation() (0.9.615)
// already uses, deliberately not routed through
// core/Hydrology.js#hydrologyFeatureAt() even though that function's
// own LAKE branch is defined identically: staying on the render layer's
// own existing import shape keeps the "what counts as water" predicate
// visibly the SAME one seam across both files, never two independently
// maintained definitions that could quietly drift apart. A river is
// never SURFACE_CATEGORY.WATER (core/Hydrology.js's own "a river is
// ground color" design), so this constraint — like the render clamp it
// mirrors — is a structural no-op for a river coordinate, never a new
// lake/river inconsistency.
//
// `heightAt`/`isWaterAt` are both injectable overrides, purely so tests
// can substitute synthetic values — the identical reason
// AvatarTerrainConstraint's own `heightAt` is injectable (see that
// class's own header).
//
// Stateless and per-call, exactly like AvatarTerrainConstraint — no
// AvatarPresence field, no AvatarMovementState value, and no SWIMMING
// vocabulary anywhere. Leaving deep water and coming back reproduces
// the identical answer for the identical coordinate every time; there
// is nothing to reset.
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

    // The real water depth at (x, z) — 0 on dry ground (or a river,
    // never SURFACE_CATEGORY.WATER), the real
    // `LAKE_SURFACE_HEIGHT - groundHeight` otherwise, floored at 0 so a
    // ground height sampled ABOVE the lake's own surface (a shoreline's
    // immediate dry edge, floating-point noise) never reports a
    // negative depth. Public so both this class's own apply() and
    // AvatarMovementController's own pre-simulation speed read
    // (speedFactorAt() below) share exactly one definition of "how deep
    // is it here," never two.
    depthAt(x, z) {
        if (!this._isWaterAt(x, z)) return 0;
        return Math.max(0, LAKE_SURFACE_HEIGHT - this._heightAt(x, z));
    }

    // The depth-derived speed multiplier at (x, z) — see
    // core/AvatarWaterWalkability.js#waterDepthSpeedFactor(). Read by
    // AvatarMovementController BEFORE simulating a tick, against the
    // avatar's CURRENT position — the identical "read the current
    // surface before simulating" posture
    // application/AvatarStepConstraint.js#supportHeightAt() already
    // established for ground height.
    speedFactorAt(x, z) {
        return waterDepthSpeedFactor(this.depthAt(x, z), this._maxWalkingDepth);
    }

    // `position` — the avatar's position BEFORE this tick's movement.
    // `desiredPosition` — the candidate X/Z destination, already
    // resolved by whatever ran before this constraint in the pipeline
    // (building collision, terrain slope). Y passes through unchanged
    // either way — exactly like AvatarTerrainConstraint.apply(), this
    // class never touches vertical kinematics; a rejected horizontal
    // step must never also cancel a jump/fall already in progress. When
    // blocked, X/Z revert to where the avatar already stood, the
    // identical revert shape AvatarTerrainConstraint.apply() already
    // uses.
    apply(position, desiredPosition) {
        const depth = this.depthAt(desiredPosition.x, desiredPosition.z);
        if (isWalkableWaterDepth(depth, this._maxWalkingDepth)) {
            return { position: desiredPosition, blocked: false };
        }
        return { position: { x: position.x, y: desiredPosition.y, z: position.z }, blocked: true };
    }
}
