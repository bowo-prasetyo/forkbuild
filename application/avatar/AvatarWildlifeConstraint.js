import { wildlifeCollisionCandidatesForMovement } from '../../core/AvatarWildlifeCollisionQuery.js';
import { resolveAvatarTreeMovement } from '../../core/AvatarTreeMovement.js';
import { DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';

// The application-layer half of avatar/animal collision, mirroring exactly
// the split application/avatar/AvatarTreeConstraint.js already established for
// trees: core/AvatarWildlifeCollisionQuery.js supplies the pure candidate
// geometry, this class supplies only the one thing it deliberately never
// touches — the world seed a real session actually runs under — plus the
// thin `apply(position, desiredPosition)` shape
// application/avatar/AvatarMovementController.js's own pipeline already expects
// of every constraint in it.
//
// THIS FILE CONTAINS NO COLLISION MATHEMATICS OF ITS OWN. Resolution reuses
// core/AvatarTreeMovement.js#resolveAvatarTreeMovement() UNCHANGED, rather
// than a cloned copy — that function is already a pure function of any
// list of `{ center, radius }` circles (it never reads a tree-specific
// field), the same "one reusable geometric primitive, never a near-identical
// copy per object kind" precedent core/AvatarTreeCollision.js#circlesIntersect()'s
// own header establishes and core/AvatarVehicleDismountClearance.js already
// puts into practice for an entirely different, non-tree concern:
//
//   const animals = wildlifeCollisionCandidatesForMovement({ seed, currentPosition, requestedPosition, avatarRadius });
//   const resolved = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: animals, avatarRadius });
//
// Deliberately kept a fully separate class from AvatarTreeConstraint, never
// folded into it — animals and trees are independent candidate sets, each
// queried and resolved against in its own pass, the same "one constraint
// per obstacle source, chained in the movement pipeline" composition every
// other constraint in application/avatar/AvatarMovementController.js already
// uses.
//
// `collided` is DERIVED by comparing the resolved X/Z against the
// requested X/Z, matching AvatarTreeConstraint's own identical posture.
export class AvatarWildlifeConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED } = {}) {
        this._seed = seed;
    }

    // `position` — the avatar's position BEFORE this tick's movement.
    // `desiredPosition` — the candidate destination, already resolved by
    // whatever earlier constraints (building collision, terrain slope,
    // step height, water depth, tree collision) a caller has already
    // applied this tick.
    //
    // `avatarRadius` (optional) — the horizontal collision radius of
    // whatever body is actually moving this tick, passed straight through
    // to both the candidate query and the resolution step, the same
    // "single value reaches both, never two independently-computed radii"
    // rule application/avatar/AvatarTreeConstraint.js's own header already
    // requires.
    apply(position, desiredPosition, { avatarRadius } = {}) {
        const animals = wildlifeCollisionCandidatesForMovement({
            seed: this._seed,
            currentPosition: position,
            requestedPosition: desiredPosition,
            avatarRadius
        });
        if (animals.length === 0) {
            return { position: desiredPosition, collided: false };
        }
        const resolved = resolveAvatarTreeMovement({
            currentPosition: position,
            requestedPosition: desiredPosition,
            trees: animals,
            avatarRadius
        });
        const collided = resolved.x !== desiredPosition.x || resolved.z !== desiredPosition.z;
        return { position: resolved, collided };
    }
}
