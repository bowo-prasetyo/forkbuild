import { VehicleType } from '../core/VehicleType.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';
import { resolveVehicleMovementDirectionFromSteering } from '../core/VehicleSteeringSimulation.js';
import { AvatarDroneVerticalStateKind, deriveAvatarDroneVerticalState, stepDroneAltitude } from '../core/AvatarDroneVerticalState.js';

// Moves the mounted vehicle, not the avatar:
//
//   movement intent -> simulateAvatarMovement() -> candidate position
//   -> building/brick then tree collision -> VehicleRuntimeInstances.setPosition()
//   -> WorldNavigationSession makes the avatar follow
//
// There is no second movement system: the kinematics are
// core/AvatarMovementSimulation.js's, called verbatim, and collision reuses the
// same AvatarMovementConstraint/AvatarTreeConstraint instances as the on-foot
// avatar, at the vehicle's own collision radius. This class never reads or
// writes an AvatarPresence; ownership flows vehicle -> avatar only.
//
// Only vehicle types that can be placed and rendered move (MOVABLE_VEHICLE_TYPES),
// not every type the capability layer supports, so a future vehicle without a
// visual never starts moving by accident.
//
// A drone additionally steps its own altitude (core/AvatarDroneVerticalState.js)
// on top of the same horizontal pipeline.
//
// An optional steeringIntent redirects the already-resolved step along the
// steered direction without recomputing its length.

const MOVABLE_VEHICLE_TYPES = new Set([VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]);

export function isMovableVehicleType(type) {
    return MOVABLE_VEHICLE_TYPES.has(type);
}

export class AvatarVehicleMovementController {
    // All three collaborators are shared with the caller; this class never builds
    // its own store or constraints.
    constructor(vehicleRuntimeInstances, movementConstraint = null, treeConstraint = null) {
        this._vehicleRuntimeInstances = vehicleRuntimeInstances;
        this._movementConstraint = movementConstraint;
        this._treeConstraint = treeConstraint;
        this._collided = false;
        this._collidedWithTree = false;
        // Used only to detect a new ride so transient state can be reset; never the
        // source of truth for what is mounted.
        this._activeVehicleId = null;
        // Per-ride physics bookkeeping, kept out of VehicleInstance: peers have no use
        // for the rider's transient speed.
        this._verticalVelocity = 0;
        this._grounded = true;
        this._currentMovementSpeed = 0;
        // A mounted drone's altitude; always 0 for other vehicles.
        this._droneAltitude = 0;
        // The last tick's drone vertical state (null for other vehicles), used only to
        // let a hovering drone skip tree collision. The dismount-while-airborne check
        // derives "airborne" independently and does not read this.
        this._droneVerticalStateKind = null;
    }

    canMove(vehicleType) {
        return isMovableVehicleType(vehicleType);
    }

    // Returns `{ vehicleInstance, rotationY }` after committing the new position,
    // or null when `vehicleId` is not tracked. `movementIntent` is
    // AvatarMovementController#movementState(), reused verbatim; a mounted vehicle
    // never jumps, so jumpRequested is always false. With no steeringIntent the
    // step follows result.rotationY, the avatar's own facing.
    tick({ seed, vehicleId, capability, movementIntent, currentRotationY, deltaSeconds, steeringIntent = null }) {
        const vehicleInstance = this._vehicleRuntimeInstances.get(vehicleId);
        if (!vehicleInstance) {
            return null;
        }
        // Defense in depth: never moves a non-movable type, even if the caller skipped
        // canMove().
        if (!isMovableVehicleType(vehicleInstance.type)) {
            return null;
        }

        if (vehicleId !== this._activeVehicleId) {
            this._activeVehicleId = vehicleId;
            this._verticalVelocity = 0;
            this._grounded = true;
            this._currentMovementSpeed = 0;
            this._droneAltitude = 0;
        }

        const currentPosition = vehicleInstance.position;
        // Ground vehicles follow raw terrain height, as at spawn, never the avatar's
        // brick-aware support height. Sampled before stepping.
        const groundHeight = terrainHeightAt(seed, currentPosition.x, currentPosition.z);

        const movementState = new AvatarMovementState({
            forwardAxis: movementIntent.direction,
            turnAxis: movementIntent.turnAxis,
            running: movementIntent.running,
            jumpRequested: false,
            brakingRequested: movementIntent.brakingRequested
        });

        const result = simulateAvatarMovement({
            position: currentPosition,
            rotationY: currentRotationY,
            verticalVelocity: this._verticalVelocity,
            grounded: this._grounded,
            movementState,
            deltaSeconds,
            groundHeight,
            movementSpeed: capability.movementSpeed,
            acceleration: capability.acceleration.acceleration,
            braking: capability.braking.braking,
            currentMovementSpeed: this._currentMovementSpeed,
            steeringRate: capability.steering.steeringRate
        });

        this._verticalVelocity = result.verticalVelocity;
        this._grounded = result.grounded;
        this._currentMovementSpeed = result.currentMovementSpeed;

        // With a steeringIntent, re-project the step: recover the distance the
        // simulation already resolved from its own direction, then apply it along the
        // steered direction. result.rotationY, the avatar's facing, is returned
        // unchanged.
        let candidatePosition = result.position;
        if (steeringIntent) {
            const attemptedDirection = resolveVehicleMovementDirectionFromSteering({
                previousHeading: vehicleInstance.heading,
                steeringIntent
            });
            const travelRadians = result.rotationY * (Math.PI / 180);
            const signedStepDistance = (result.position.x - currentPosition.x) * Math.sin(travelRadians)
                + (result.position.z - currentPosition.z) * Math.cos(travelRadians);
            const attemptedRadians = attemptedDirection * (Math.PI / 180);
            candidatePosition = {
                x: currentPosition.x + Math.sin(attemptedRadians) * signedStepDistance,
                y: result.position.y,
                z: currentPosition.z + Math.cos(attemptedRadians) * signedStepDistance
            };
        }

        // Drone only: the altitude rises toward hover while moving and settles when
        // idle, layered on top of the terrain-height Y.
        this._droneVerticalStateKind = null;
        if (vehicleInstance.type === VehicleType.DRONE) {
            const ascending = movementIntent.direction !== 0;
            this._droneAltitude = stepDroneAltitude({ altitude: this._droneAltitude, ascending, deltaSeconds });
            this._droneVerticalStateKind = deriveAvatarDroneVerticalState({ altitude: this._droneAltitude, ascending });
            candidatePosition = { ...candidatePosition, y: groundHeight + this._droneAltitude };
        }

        // Collision is horizontal only, so Y survives. For a drone this makes building
        // collision height-aware for free: a building shorter than its altitude no
        // longer blocks it.
        let finalPosition = candidatePosition;
        this._collided = false;
        if (this._movementConstraint) {
            const constrained = this._movementConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: capability.collisionRadius
            });
            finalPosition = constrained.position;
            this._collided = constrained.collided;
        }
        this._collidedWithTree = false;
        // A hovering drone skips tree collision (trees have no height data). Below
        // hover altitude it collides like any other vehicle.
        const droneHovering = this._droneVerticalStateKind === AvatarDroneVerticalStateKind.HOVERING;
        if (this._treeConstraint && !droneHovering) {
            const treeResult = this._treeConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: capability.collisionRadius
            });
            finalPosition = treeResult.position;
            this._collidedWithTree = treeResult.collided;
        }

        // Commits the constrained position, so the avatar that follows can never end
        // up inside an obstacle the vehicle stopped short of.
        let nextVehicleInstance = this._vehicleRuntimeInstances.setPosition(vehicleId, finalPosition);

        // Heading changes only on real horizontal movement after collision, so a fully
        // blocked tick keeps the old heading.
        if (finalPosition.x !== currentPosition.x || finalPosition.z !== currentPosition.z) {
            const nextHeading = resolveVehicleHeadingFromMovement({
                dx: finalPosition.x - currentPosition.x,
                dz: finalPosition.z - currentPosition.z,
                previousHeading: vehicleInstance.heading
            });
            nextVehicleInstance = this._vehicleRuntimeInstances.setHeading(vehicleId, nextHeading) || nextVehicleInstance;
        }

        return { vehicleInstance: nextVehicleInstance, rotationY: result.rotationY };
    }

    isCollided() {
        return this._collided;
    }

    isCollidedWithTree() {
        return this._collidedWithTree;
    }

    // Called by the caller whenever intent is not routed here (unmounted, or an
    // immovable vehicle), so every later ride starts from rest.
    reset() {
        this._activeVehicleId = null;
        this._verticalVelocity = 0;
        this._grounded = true;
        this._currentMovementSpeed = 0;
        this._collided = false;
        this._collidedWithTree = false;
        this._droneAltitude = 0;
        this._droneVerticalStateKind = null;
    }
}

// Heading comes from the realized, post-collision displacement
// (core/VehicleMovementHeading.js) and snaps each tick; it is never smoothed
// the way rotationY is.
