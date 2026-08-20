import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { isWalkableSlope, DEFAULT_MAX_WALKABLE_SLOPE } from '../core/TerrainWalkability.js';

// 0.2.77 — the application-layer half of terrain-aware movement,
// mirroring exactly the split 0.2.42 already established for building
// collision: application/AvatarMovementConstraint.js supplies the
// REAL loaded-world geometry, core/AvatarCollision.js supplies the
// pure math applied to it. Here: this class supplies the real world
// coordinates and the real terrain height field, core/
// TerrainWalkability.js supplies the pure slope math.
//
// Deliberately reads core/TerrainHeightField.js's own
// terrainHeightAt(seed, x, z) directly — never through
// renderer.terrainHeightAt(). renderer/Renderer.js's own
// terrainHeightAt() has always been a thin pass-through to that same
// pure function (see its own header, 0.2.76); this class simply calls
// the pure function it was already wrapping, so the PURE function
// remains the one shared authority every ground-placement site reads
// from, and the renderer stays an adapter for rendering-time callers,
// never the semantic owner of "what is the ground here" — see
// docs/Principles.md, "The Terrain Height Field Is The Shared
// Authority; The Renderer Is An Adapter, Not The Owner (0.2.77)."
// Concretely, this means AvatarTerrainConstraint has no Three.js
// dependency and no Renderer collaborator at all — it stays exactly
// as headlessly testable as AvatarMovementConstraint already was, and
// works identically whether or not a WebGL scene exists.
//
// Unlike AvatarMovementConstraint, this class needs no "currently
// available to this replica" streaming concept — terrain is a pure
// function of (seed, x, z), always computable for ANY coordinate
// regardless of what documents happen to be loaded nearby, so there
// is no obstacle list to collect and no query radius to bound.
//
// `heightAt` is an injectable override (defaults to the real terrain
// field under `seed`) purely so tests can substitute a synthetic
// height function — a deliberately engineered cliff — without needing
// to go hunting through real generated terrain for a coordinate steep
// enough to exercise the walkable/unwalkable boundary.
export class AvatarTerrainConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED, maxSlope = DEFAULT_MAX_WALKABLE_SLOPE, heightAt } = {}) {
        this._heightAt = typeof heightAt === 'function' ? heightAt : (x, z) => terrainHeightAt(seed, x, z);
        this._maxSlope = maxSlope;
    }

    // `position` — the avatar's position BEFORE this tick's movement
    // (already possibly adjusted by building collision, when both
    // constraints are wired together — see
    // application/AvatarMovementController.js).
    // `desiredPosition` — the candidate X/Z destination.
    //
    // Y is trusted through exactly unchanged when the step IS
    // walkable, the same "only X/Z are ever constrained here" contract
    // AvatarMovementConstraint.apply() already documents — vertical
    // kinematics (jumping, falling, snapping to the flat Y=0 ground
    // plane) stay entirely core/AvatarMovementSimulation.js's own
    // concern, never rewritten here. When the step is BLOCKED, X/Z
    // revert to where the avatar already stood, but Y still passes
    // through from `desiredPosition` — a rejected horizontal step must
    // never also cancel a legitimate jump/fall already in progress.
    apply(position, desiredPosition) {
        const horizontalDistance = flatDistance(position, desiredPosition);
        if (horizontalDistance <= 0) {
            return { position: desiredPosition, blocked: false };
        }
        const fromHeight = this._heightAt(position.x, position.z);
        const toHeight = this._heightAt(desiredPosition.x, desiredPosition.z);
        if (isWalkableSlope(fromHeight, toHeight, horizontalDistance, this._maxSlope)) {
            return { position: desiredPosition, blocked: false };
        }
        // A simple movement constraint, not physical sliding — see
        // core/TerrainWalkability.js's own header. The whole horizontal
        // step is rejected outright; there is no partial slide along a
        // slope's contour, matching the design doc's explicit
        // instruction to keep this the smallest useful concept, not a
        // physics subsystem.
        return { position: { x: position.x, y: desiredPosition.y, z: position.z }, blocked: true };
    }
}

function flatDistance(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}
