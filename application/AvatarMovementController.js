import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { deriveAvatarVerticalState } from '../core/AvatarVerticalState.js';
import { AvatarContinuousMovementIntent, isValidAvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
import { AvatarContinuousMovementMode, isValidAvatarContinuousMovementMode } from '../core/AvatarContinuousMovementMode.js';
import { AvatarMovementCapabilityKind, isValidAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarVehicleBrakingIntent, isValidAvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';

// The one place raw input becomes an AvatarPresence update, and the one
// movement executor for walking and every vehicle. It never touches Three.js;
// it and renderer/AvatarVisual.js meet only through AvatarPresenceSession (see
// docs/Principles.md, "Input Changes Presence; Presence Changes The Renderer").
//
//   keyDown/keyUp      raw W/A/S/D/Shift/Space, while Avatar Control Mode is on
//   tick(deltaSeconds) once per frame: simulate, constrain, and publish a new
//                      AvatarPresence only if something changed
//
// tick() pipeline: core/AvatarMovementSimulation.js proposes a position, then
// each optional constraint (building, terrain slope, water depth, step height,
// tree, wildlife) adjusts it in that order. Constraints that can revert X/Z run
// before step height, which settles the final Y; tree and wildlife only touch
// X/Z, so they run last.
//
// Vehicles never branch this class: it reads plain numbers (speed, collision
// radius, directions, acceleration, braking, steering) off the active
// AvatarVehicleMovementCapability and never knows which vehicle produced them.
// A null capability means walking, and each _resolvedXxx() returns undefined so
// the simulation's own walking defaults apply.
//
// Continuous-movement intent/mode and braking intent are set from one layer up
// (WorldNavigationSession translates keys); this class only consumes them.
// Transient state (vertical velocity, current speed, the constraint flags) is
// never part of AvatarPresence: peers only need where the avatar is.

const EPSILON = 1e-6;

export class AvatarMovementController {
    constructor(avatarPresenceSession, movementConstraint = null, terrainConstraint = null, stepConstraint = null, treeConstraint = null, waterConstraint = null, wildlifeConstraint = null) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._movementConstraint = movementConstraint;
        this._terrainConstraint = terrainConstraint;
        this._stepConstraint = stepConstraint;
        this._treeConstraint = treeConstraint;
        this._waterConstraint = waterConstraint;
        this._wildlifeConstraint = wildlifeConstraint;
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
        this._verticalVelocity = 0;
        this._grounded = true;
        // Signed current speed (negative while reversing), fed to and returned by the
        // simulation each tick. Reset only on a real capability change.
        this._currentMovementSpeed = 0;
        this._continuousMovementIntent = AvatarContinuousMovementIntent.NONE;
        this._continuousMovementMode = AvatarContinuousMovementMode.NONE;
        this._vehicleBrakingIntent = AvatarVehicleBrakingIntent.NONE;
        this._movementCapability = null;
        // Per-tick flags, never part of AvatarPresence (see docs/Principles.md,
        // "Collided Is Movement Information, Not An Animation Vocabulary").
        this._collided = false;
        this._blockedBySlope = false;
        this._blockedByStepHeight = false;
        this._collidedWithTree = false;
        this._blockedByWaterDepth = false;
        this._collidedWithWildlife = false;
    }

    // Returns whether `key` is handled, so the caller knows to swallow the event.
    // No arrow keys: they already nudge the selection (EditorActionRegistry).
    keyDown(key) {
        return this._setKey(key, true);
    }

    keyUp(key) {
        return this._setKey(key, false);
    }

    // Releases every held key, on leaving Avatar Control Mode and on window blur,
    // so a missed keyup can never leave the avatar walking. Continuous intent and
    // mode are deliberately kept: releasing keys must not cancel them.
    releaseAll() {
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
    }

    // Callers pass an already-resolved intent; invalid input degrades to NONE.
    setContinuousMovementIntent(intent) {
        this._continuousMovementIntent = isValidAvatarContinuousMovementIntent(intent)
            ? intent
            : AvatarContinuousMovementIntent.NONE;
    }

    // Also read back by WorldNavigationSession as the current intent for the next
    // transition.
    continuousMovementIntent() {
        return this._continuousMovementIntent;
    }

    // Invalid input degrades to NONE.
    setContinuousMovementMode(mode) {
        this._continuousMovementMode = isValidAvatarContinuousMovementMode(mode)
            ? mode
            : AvatarContinuousMovementMode.NONE;
    }

    continuousMovementMode() {
        return this._continuousMovementMode;
    }

    // Invalid input degrades to NONE.
    setVehicleBrakingIntent(intent) {
        this._vehicleBrakingIntent = isValidAvatarVehicleBrakingIntent(intent)
            ? intent
            : AvatarVehicleBrakingIntent.NONE;
    }

    vehicleBrakingIntent() {
        return this._vehicleBrakingIntent;
    }

    // Invalid input degrades to null (walking). A changed capability (mount,
    // dismount, switch) resets the current speed to 0 so a new ride starts from
    // rest. Compared by identity: resolveAvatarVehicleMovementCapability() returns
    // the same frozen instance for the same vehicle, so the per-frame re-apply of
    // an unchanged capability never resets speed. Heading is never reset.
    setMovementCapability(capability) {
        const resolved = isValidAvatarVehicleMovementCapability(capability)
            ? capability
            : null;
        if (resolved !== this._movementCapability) {
            this._currentMovementSpeed = 0;
        }
        this._movementCapability = resolved;
    }

    // WALK until a valid capability is set.
    movementCapability() {
        return this._movementCapability
            ? this._movementCapability.movementKind
            : AvatarMovementCapabilityKind.WALK;
    }

    // Read-only snapshot of what is happening now, built from the same resolution
    // tick() uses. Braking comes from the braking intent, never inferred from a
    // falling speed (braking can be requested while the target stays forward).
    // Capability numbers are deliberately not exposed: they describe what is
    // permitted, not current state.
    movementState() {
        const intent = this._currentMovementState();
        return Object.freeze({
            direction: intent.forwardAxis,
            turnAxis: intent.turnAxis,
            running: intent.running,
            jumpRequested: intent.jumpRequested,
            brakingRequested: intent.brakingRequested,
            movementSpeed: this._currentMovementSpeed,
            movementCapability: this.movementCapability()
        });
    }

    // Returns the new AvatarPresence when one was published, or null when nothing
    // changed; standing still is an exact no-op, so `sequence` only advances on
    // visible updates.
    tick(deltaSeconds) {
        if (!this._avatarPresenceSession) {
            return null;
        }
        // An unsupported capability blocks movement outright, never falling back to
        // walking; vertical bookkeeping pauses until a supported one returns.
        if (this._movementCapability && this._movementCapability.supported === false) {
            return null;
        }
        const movementState = this._currentMovementState();
        const current = this._avatarPresenceSession.current;
        const currentRotationY = current.rotation.y || 0;
        const currentPosition = { x: current.position.x, y: current.position.y, z: current.position.z };

        // The surface the avatar stands on now, so gravity and landing resolve against
        // it. `currentPosition.y` is the reference height so a brick far overhead (a
        // bridge deck) never counts as the ground here.
        const currentSupportHeight = this._stepConstraint
            ? this._stepConstraint.supportHeightAt(currentPosition.x, currentPosition.z, currentPosition.y)
            : undefined;

        // Water depth at the current position decides this tick's speed, not the depth
        // of the step about to be taken.
        const currentWaterSpeedFactor = this._waterConstraint
            ? this._waterConstraint.speedFactorAt(currentPosition.x, currentPosition.z)
            : undefined;

        const result = simulateAvatarMovement({
            position: currentPosition,
            rotationY: currentRotationY,
            verticalVelocity: this._verticalVelocity,
            grounded: this._grounded,
            movementState,
            deltaSeconds,
            groundHeight: currentSupportHeight,
            movementSpeed: this._resolvedMovementSpeed(),
            acceleration: this._resolvedAcceleration(),
            braking: this._resolvedBraking(),
            currentMovementSpeed: this._currentMovementSpeed,
            steeringRate: this._resolvedSteeringRate(),
            waterSpeedFactor: currentWaterSpeedFactor
        });
        this._verticalVelocity = result.verticalVelocity;
        this._grounded = result.grounded;
        this._currentMovementSpeed = result.currentMovementSpeed;

        let finalPosition = result.position;
        this._collided = false;
        if (this._movementConstraint) {
            const constrained = this._movementConstraint.apply(currentPosition, result.position, {
                supportHeight: currentSupportHeight
            });
            finalPosition = constrained.position;
            this._collided = constrained.collided;
        }

        this._blockedBySlope = false;
        if (this._terrainConstraint) {
            const terrainResult = this._terrainConstraint.apply(currentPosition, finalPosition);
            finalPosition = terrainResult.position;
            this._blockedBySlope = terrainResult.blocked;
        }

        this._blockedByWaterDepth = false;
        if (this._waterConstraint) {
            const waterResult = this._waterConstraint.apply(currentPosition, finalPosition);
            finalPosition = waterResult.position;
            this._blockedByWaterDepth = waterResult.blocked;
        }

        this._blockedByStepHeight = false;
        if (this._stepConstraint) {
            const stepResult = this._stepConstraint.apply(currentPosition, finalPosition, {
                grounded: result.grounded
            });
            finalPosition = stepResult.position;
            this._blockedByStepHeight = stepResult.blocked;
            // The avatar walked off an edge: the next tick starts airborne, whatever this
            // tick's simulation said about `grounded`.
            if (stepResult.falling) {
                this._grounded = false;
            }
        }

        this._collidedWithTree = false;
        if (this._treeConstraint) {
            const treeResult = this._treeConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: this._resolvedCollisionRadius()
            });
            finalPosition = treeResult.position;
            this._collidedWithTree = treeResult.collided;
        }

        this._collidedWithWildlife = false;
        if (this._wildlifeConstraint) {
            const wildlifeResult = this._wildlifeConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: this._resolvedCollisionRadius()
            });
            finalPosition = wildlifeResult.position;
            this._collidedWithWildlife = wildlifeResult.collided;
        }

        const positionChanged = !samePosition(finalPosition, current.position);
        const rotationChanged = Math.abs(result.rotationY - currentRotationY) > EPSILON;
        const animationChanged = result.animation !== current.animation;
        if (!positionChanged && !rotationChanged && !animationChanged) {
            return null;
        }

        return this._avatarPresenceSession.update({
            position: finalPosition,
            rotation: { y: result.rotationY },
            animation: result.animation
        });
    }

    isCollided() {
        return this._collided;
    }

    isBlockedBySlope() {
        return this._blockedBySlope;
    }

    isBlockedByStepHeight() {
        return this._blockedByStepHeight;
    }

    isBlockedByWaterDepth() {
        return this._blockedByWaterDepth;
    }

    isCollidedWithWildlife() {
        return this._collidedWithWildlife;
    }

    isCollidedWithTree() {
        return this._collidedWithTree;
    }

    verticalState() {
        return deriveAvatarVerticalState({ grounded: this._grounded, verticalVelocity: this._verticalVelocity });
    }

    // Whether a direction key (turning included) is held; while it is, a "look at
    // target" facing override must not apply. Shift and Space imply nothing about
    // facing.
    hasMovementInput() {
        return this._keys.forward || this._keys.backward || this._keys.left || this._keys.right;
    }

    _currentMovementState() {
        return new AvatarMovementState({
            forwardAxis: this._resolvedForwardAxis(),
            turnAxis: (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0),
            running: this._resolvedRunning(),
            jumpRequested: this._keys.jumpHeld,
            brakingRequested: this._resolvedBrakingRequested()
        });
    }

    // Held W/S win, even when they cancel out; only when neither is held does
    // continuous intent apply. Each source is first filtered by the capability's
    // permitted directions: a disallowed direction reads as an unpressed key.
    _resolvedForwardAxis() {
        const directions = this._resolvedMovementDirections();
        const forwardAllowed = directions.forward;
        const backwardAllowed = directions.backward;

        if (this._keys.forward || this._keys.backward) {
            const forward = this._keys.forward && forwardAllowed;
            const backward = this._keys.backward && backwardAllowed;
            return (forward ? 1 : 0) - (backward ? 1 : 0);
        }
        if (this._continuousMovementIntent === AvatarContinuousMovementIntent.FORWARD) return forwardAllowed ? 1 : 0;
        if (this._continuousMovementIntent === AvatarContinuousMovementIntent.BACKWARD) return backwardAllowed ? -1 : 0;
        return 0;
    }

    // Same priority as _resolvedForwardAxis(), so Shift+W and continuous run reach
    // the simulation as the same state.
    _resolvedRunning() {
        if (this._keys.forward || this._keys.backward) {
            return this._keys.running;
        }
        if (this._continuousMovementIntent !== AvatarContinuousMovementIntent.NONE) {
            return this._continuousMovementMode === AvatarContinuousMovementMode.RUN;
        }
        return this._keys.running;
    }

    _resolvedMovementSpeed() {
        return this._movementCapability ? this._movementCapability.movementSpeed : undefined;
    }

    // No `.kind` check needed: INSTANT's rate is always 0 and RATE_LIMITED's is
    // always positive, so the bare rate carries the distinction.
    _resolvedAcceleration() {
        return this._movementCapability ? this._movementCapability.acceleration.acceleration : undefined;
    }

    _resolvedBraking() {
        return this._movementCapability ? this._movementCapability.braking.braking : undefined;
    }

    // Independent of which vehicle, if any, is ridden.
    _resolvedBrakingRequested() {
        return this._vehicleBrakingIntent === AvatarVehicleBrakingIntent.BRAKE;
    }

    // Same bare-rate reasoning as _resolvedAcceleration().
    _resolvedSteeringRate() {
        return this._movementCapability ? this._movementCapability.steering.steeringRate : undefined;
    }

    // Consumed by the tree and wildlife constraints only.
    _resolvedCollisionRadius() {
        return this._movementCapability ? this._movementCapability.collisionRadius : undefined;
    }

    // Never undefined: _resolvedForwardAxis() needs real booleans. Defaults to both
    // directions permitted.
    _resolvedMovementDirections() {
        return this._movementCapability
            ? this._movementCapability.movementDirections
            : { forward: true, backward: true };
    }

    _setKey(key, isDown) {
        switch (String(key || '').toLowerCase()) {
            case 'w': this._keys.forward = isDown; return true;
            case 's': this._keys.backward = isDown; return true;
            case 'a': this._keys.left = isDown; return true;
            case 'd': this._keys.right = isDown; return true;
            case 'shift': this._keys.running = isDown; return true;
            case ' ': case 'space': case 'spacebar': this._keys.jumpHeld = isDown; return true;
            default: return false;
        }
    }
}

function samePosition(a, b) {
    return Math.abs(a.x - b.x) <= EPSILON
        && Math.abs(a.y - b.y) <= EPSILON
        && Math.abs(a.z - b.z) <= EPSILON;
}
