import { resolveAvatarTreeMovement } from '../../core/AvatarTreeMovement.js';
import { AVATAR_COLLISION_RADIUS } from '../../core/AvatarCollision.js';
import { RESIDENT_COLLISION_RADIUS } from '../../core/ResidentPath.js';

// Residents walk on the ground; an avatar whose feet are higher than this
// (on a roof, a bridge, a raised floor) walks over them, not into them.
const RESIDENT_BODY_HEIGHT = 1.7;

// Avatar/resident collision: a World Resident blocks the avatar where it is
// drawn, the resident counterpart of AvatarWildlifeConstraint. Each resident
// is a circle of RESIDENT_COLLISION_RADIUS at its current pose (from
// application/world/ResidentRuntime.js, on the session clock the renderer
// uses too), resolved by core/AvatarTreeMovement.js#resolveAvatarTreeMovement()
// unchanged, as animals are.
//
// Only the avatar is ever pushed: a resident's path never depends on an
// avatar (see core/ResidentMotion.js), so a resident strolling into a
// standing avatar walks through it rather than disagreeing with other
// replicas about where it is.
export class AvatarResidentConstraint {
    constructor({ runtime, clock = () => Date.now() / 1000 } = {}) {
        this._runtime = runtime;
        this._clock = clock;
    }

    apply(position, desiredPosition, { avatarRadius = AVATAR_COLLISION_RADIUS } = {}) {
        if (!this._runtime || !(desiredPosition.y < RESIDENT_BODY_HEIGHT)) {
            return { position: desiredPosition, collided: false };
        }
        const reach = Math.hypot(desiredPosition.x - position.x, desiredPosition.z - position.z)
            + avatarRadius + RESIDENT_COLLISION_RADIUS;
        const residents = this._runtime.posesNear(position, reach, this._clock())
            .map((pose) => ({ center: { x: pose.x, z: pose.z }, radius: RESIDENT_COLLISION_RADIUS }));
        if (residents.length === 0) {
            return { position: desiredPosition, collided: false };
        }
        const resolved = resolveAvatarTreeMovement({
            currentPosition: position,
            requestedPosition: desiredPosition,
            trees: residents,
            avatarRadius
        });
        const collided = resolved.x !== desiredPosition.x || resolved.z !== desiredPosition.z;
        return { position: resolved, collided };
    }
}
