import { treeCollisionCandidatesForMovement } from '../core/AvatarTreeCollisionQuery.js';
import { resolveAvatarTreeMovement } from '../core/AvatarTreeMovement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.63 — the application-layer half of avatar/tree collision,
// mirroring exactly the split 0.2.42 (application/AvatarMovementConstraint.js,
// buildings) and 0.2.77 (application/AvatarTerrainConstraint.js, terrain
// slope) already established: core/AvatarTreeCollisionQuery.js and
// core/AvatarTreeMovement.js supply the pure geometry (0.9.59-0.9.62),
// this class supplies only the one thing they deliberately never touch —
// the world seed a real session actually runs under — plus the thin
// `apply(position, desiredPosition)` shape
// application/AvatarMovementController.js's own pipeline already expects
// of every constraint in it.
//
// THIS FILE CONTAINS NO COLLISION MATHEMATICS OF ITS OWN. It calls
// exactly the two already-complete, already-tested pure functions those
// two files' own headers already describe as composing directly:
//
//   const trees = treeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition });
//   const resolved = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees });
//
// See docs/Roadmap.md, 0.9.63, "Avatar Movement Collision Integration."
//
// Deliberately no "currently available to this replica" streaming
// concern the way AvatarMovementConstraint needs one for buildings —
// like AvatarTerrainConstraint, tree placement is a pure function of
// (seed, x, z), always computable for any coordinate regardless of which
// documents happen to be streamed in nearby, so there is no obstacle
// list to collect and no query radius to bound here.
//
// Deliberately kept a fully separate class from AvatarTerrainConstraint,
// never folded into it: tree occupancy is a purely horizontal (X/Z)
// concern (core/TreeCollisionGeometry.js's own header), orthogonal to
// terrain slope walkability, which this class never reads, computes, or
// adjusts. This class has no Three.js dependency and no terrain
// collaborator at all — it stays exactly as headlessly testable as its
// two sibling constraints.
//
// `collided` is DERIVED by comparing the resolved X/Z against the
// requested X/Z — never a new status vocabulary. core/AvatarTreeMovement.js
// deliberately returns only a resolved position (see that file's own
// header for why); this class's own `collided` flag exists purely to
// match the same transient, debug-only posture
// application/AvatarMovementConstraint.js#apply() and
// application/AvatarTerrainConstraint.js#apply() already established for
// their own return values.
export class AvatarTreeConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED } = {}) {
        this._seed = seed;
    }

    // `position` — the avatar's position BEFORE this tick's movement.
    // `desiredPosition` — the candidate destination, already resolved by
    // whatever earlier constraints (building collision, terrain slope,
    // step height) a caller has already applied this tick — see
    // application/AvatarMovementController.js's own pipeline, where this
    // constraint is applied LAST, exactly like every other constraint
    // appended to that pipeline since 0.2.42.
    //
    // Y passes through completely untouched, whether or not a tree was
    // in the way — core/AvatarTreeMovement.js#resolveAvatarTreeMovement()
    // already guarantees this (it copies `requestedPosition.y` straight
    // through); this class adds no Y logic of its own on top, matching
    // its own "tree collision never acquires responsibility for vertical
    // positioning" rule (docs/Roadmap.md, 0.9.63).
    apply(position, desiredPosition) {
        const trees = treeCollisionCandidatesForMovement({
            seed: this._seed,
            currentPosition: position,
            requestedPosition: desiredPosition
        });
        if (trees.length === 0) {
            return { position: desiredPosition, collided: false };
        }
        const resolved = resolveAvatarTreeMovement({
            currentPosition: position,
            requestedPosition: desiredPosition,
            trees
        });
        const collided = resolved.x !== desiredPosition.x || resolved.z !== desiredPosition.z;
        return { position: resolved, collided };
    }
}

// Deliberately not yet: tree destruction, pushing trees, avatar damage,
// tree interaction, sound effects, collision animations, network
// synchronization, multiplayer collision authority, physics/velocity/
// mass, acceleration, jumping, sliding friction, continuous collision
// detection beyond the swept segment core/AvatarTreeCollisionQuery.js
// already covers, spatial indexing, collision caching, persistence, or
// collision events (no generic `CollisionEvent` abstraction — this class
// reuses the same derived-boolean posture its two sibling constraints
// already use). A "currently loaded" streaming concern of its own (see
// this file's own header for why none is needed). Combining tree
// collision with terrain slope into one constraint. See docs/Roadmap.md,
// 0.9.63, for the full list.
