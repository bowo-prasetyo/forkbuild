import { VehicleType, isValidVehicleType } from './VehicleType.js';
import { AvatarMovementDirectionCapability, isValidAvatarMovementDirectionCapability } from './AvatarMovementDirectionCapability.js';
import { AvatarMovementAccelerationCapability, AvatarMovementAccelerationKind, isValidAvatarMovementAccelerationCapability } from './AvatarMovementAccelerationCapability.js';
import { AvatarMovementBrakingCapability, AvatarMovementBrakingKind, isValidAvatarMovementBrakingCapability } from './AvatarMovementBrakingCapability.js';
import { AvatarMovementSteeringCapability, AvatarMovementSteeringKind, isValidAvatarMovementSteeringCapability } from './AvatarMovementSteeringCapability.js';

// Resolves the movement capability the one existing avatar movement system
// should use for the avatar's current vehicle:
//
//   resolveAvatarVehicleMovementCapability(vehicleType) -> AvatarVehicleMovementCapability
//
// Vehicles change movement parameters; they never get a movement system of
// their own. BICYCLE, MOTORCYCLE and CAR share the GROUND_VEHICLE kind (one
// movement algorithm) and differ only in the numbers it is fed: speed,
// collision radius, permitted directions, acceleration, braking and steering.
// DRONE is AERIAL_VEHICLE: the same horizontal parameters, with altitude
// handled by core/AvatarDroneVerticalState.js.
//
// Takes a VehicleType (VehicleType.NONE when not mounted), never a mount or a
// VehiclePresence: looking up a mounted vehicle's type is the caller's job.
//
// This module is a pure vocabulary with no coupling to the simulations that
// consume it; tests/AvatarVehicleMovementCapability.test.js (Section K) forbids
// importing them. That is why WALK's speed and radius are local copies below.

export const AvatarMovementCapabilityKind = Object.freeze({
    WALK: 'walk',
    GROUND_VEHICLE: 'ground_vehicle',
    AERIAL_VEHICLE: 'aerial_vehicle'
});

export function isValidAvatarMovementCapabilityKind(value) {
    return Object.values(AvatarMovementCapabilityKind).includes(value);
}

export class AvatarVehicleMovementCapability {
    constructor(movementKind, vehicleType, supported, movementSpeed, collisionRadius, movementDirections, acceleration, braking, steering) {
        if (!isValidAvatarMovementCapabilityKind(movementKind)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementCapabilityKind, got ${JSON.stringify(movementKind)}`);
        }
        if (!isValidVehicleType(vehicleType)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
        }
        if (typeof supported !== 'boolean') {
            throw new Error(`AvatarVehicleMovementCapability requires a boolean supported, got ${JSON.stringify(supported)}`);
        }
        if (typeof movementSpeed !== 'number' || !Number.isFinite(movementSpeed) || movementSpeed < 0) {
            throw new Error(`AvatarVehicleMovementCapability requires a finite, non-negative movementSpeed, got ${JSON.stringify(movementSpeed)}`);
        }
        if (typeof collisionRadius !== 'number' || !Number.isFinite(collisionRadius) || collisionRadius < 0) {
            throw new Error(`AvatarVehicleMovementCapability requires a finite, non-negative collisionRadius, got ${JSON.stringify(collisionRadius)}`);
        }
        if (!isValidAvatarMovementDirectionCapability(movementDirections)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementDirectionCapability, got ${JSON.stringify(movementDirections)}`);
        }
        if (!isValidAvatarMovementAccelerationCapability(acceleration)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementAccelerationCapability, got ${JSON.stringify(acceleration)}`);
        }
        if (!isValidAvatarMovementBrakingCapability(braking)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementBrakingCapability, got ${JSON.stringify(braking)}`);
        }
        if (!isValidAvatarMovementSteeringCapability(steering)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementSteeringCapability, got ${JSON.stringify(steering)}`);
        }
        this._movementKind = movementKind;
        this._vehicleType = vehicleType;
        this._supported = supported;
        this._movementSpeed = movementSpeed;
        this._collisionRadius = collisionRadius;
        this._movementDirections = movementDirections;
        this._acceleration = acceleration;
        this._braking = braking;
        this._steering = steering;
        Object.freeze(this);
    }

    get movementKind() { return this._movementKind; }
    get vehicleType() { return this._vehicleType; }
    get supported() { return this._supported; }
    get movementSpeed() { return this._movementSpeed; }
    get collisionRadius() { return this._collisionRadius; }
    get movementDirections() { return this._movementDirections; }
    get acceleration() { return this._acceleration; }
    get braking() { return this._braking; }
    get steering() { return this._steering; }

    toJSON() {
        return {
            movementKind: this._movementKind,
            vehicleType: this._vehicleType,
            supported: this._supported,
            movementSpeed: this._movementSpeed,
            collisionRadius: this._collisionRadius,
            movementDirections: this._movementDirections.toJSON(),
            acceleration: this._acceleration.toJSON(),
            braking: this._braking.toJSON(),
            steering: this._steering.toJSON()
        };
    }

    static fromJSON(json) {
        return new AvatarVehicleMovementCapability(
            json.movementKind,
            json.vehicleType,
            json.supported,
            json.movementSpeed,
            json.collisionRadius,
            AvatarMovementDirectionCapability.fromJSON(json.movementDirections),
            AvatarMovementAccelerationCapability.fromJSON(json.acceleration),
            AvatarMovementBrakingCapability.fromJSON(json.braking),
            AvatarMovementSteeringCapability.fromJSON(json.steering)
        );
    }
}

export function isValidAvatarVehicleMovementCapability(value) {
    return value instanceof AvatarVehicleMovementCapability
        && isValidAvatarMovementCapabilityKind(value.movementKind)
        && isValidVehicleType(value.vehicleType)
        && typeof value.supported === 'boolean'
        && typeof value.movementSpeed === 'number'
        && Number.isFinite(value.movementSpeed)
        && value.movementSpeed >= 0
        && typeof value.collisionRadius === 'number'
        && Number.isFinite(value.collisionRadius)
        && value.collisionRadius >= 0
        && isValidAvatarMovementDirectionCapability(value.movementDirections)
        && isValidAvatarMovementAccelerationCapability(value.acceleration)
        && isValidAvatarMovementBrakingCapability(value.braking)
        && isValidAvatarMovementSteeringCapability(value.steering);
}

// Must equal core/AvatarMovementSimulation.js's WALK_SPEED; copied rather than
// imported (see header) so walking speed is unchanged.
const WALK_MOVEMENT_SPEED = 3; // world units / second

// Must satisfy WALK < BICYCLE < MOTORCYCLE < CAR < DRONE (checked by the tests).
const BICYCLE_MOVEMENT_SPEED = 6; // world units / second
const MOTORCYCLE_MOVEMENT_SPEED = 9; // world units / second
const CAR_MOVEMENT_SPEED = 12; // world units / second
const DRONE_MOVEMENT_SPEED = 16; // world units / second

// Must equal core/AvatarCollision.js's AVATAR_COLLISION_RADIUS; copied rather
// than imported (see header).
const WALK_COLLISION_RADIUS = 0.35; // world units

// Must satisfy WALK < BICYCLE < MOTORCYCLE < CAR (checked by the tests).
const BICYCLE_COLLISION_RADIUS = 0.45; // world units
const MOTORCYCLE_COLLISION_RADIUS = 0.55; // world units
const CAR_COLLISION_RADIUS = 0.80; // world units
const DRONE_COLLISION_RADIUS = 0.5; // world units

const PERMITS_BOTH_DIRECTIONS = new AvatarMovementDirectionCapability(true, true);
const NO_DIRECTIONS_PERMITTED = new AvatarMovementDirectionCapability(false, false);

// On-foot movement reaches its target speed, stops and turns within a single
// tick, so WALK uses INSTANT for acceleration, braking and steering.
const INSTANT_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.INSTANT, 0);

// World units/second². Deliberately not ordered like speed: CAR is fastest
// but accelerates slower than MOTORCYCLE, so nothing can assume the two
// dimensions move together.
const BICYCLE_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 3);
const MOTORCYCLE_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 5);
const CAR_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 4);
const DRONE_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 5);

const INSTANT_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.INSTANT, 0);

// Each vehicle brakes faster than it accelerates. The rates are chosen
// independently, never derived from acceleration.
const BICYCLE_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 6);
const MOTORCYCLE_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 9);
const CAR_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 8);
const DRONE_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 7);

const INSTANT_STEERING = new AvatarMovementSteeringCapability(AvatarMovementSteeringKind.INSTANT, 0);

// Radians/second, chosen independently of speed, acceleration and braking.
const BICYCLE_STEERING = new AvatarMovementSteeringCapability(AvatarMovementSteeringKind.RATE_LIMITED, 3.5);
const MOTORCYCLE_STEERING = new AvatarMovementSteeringCapability(AvatarMovementSteeringKind.RATE_LIMITED, 4.5);
const CAR_STEERING = new AvatarMovementSteeringCapability(AvatarMovementSteeringKind.RATE_LIMITED, 2.5);
const DRONE_STEERING = new AvatarMovementSteeringCapability(AvatarMovementSteeringKind.RATE_LIMITED, 3.0);

// Built once at module load, so the same input always returns the same frozen
// instance.
const CAPABILITY_BY_VEHICLE_TYPE = Object.freeze({
    [VehicleType.NONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, WALK_MOVEMENT_SPEED, WALK_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, INSTANT_ACCELERATION, INSTANT_BRAKING, INSTANT_STEERING),
    [VehicleType.BICYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.BICYCLE, true, BICYCLE_MOVEMENT_SPEED, BICYCLE_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, BICYCLE_ACCELERATION, BICYCLE_BRAKING, BICYCLE_STEERING),
    [VehicleType.MOTORCYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.MOTORCYCLE, true, MOTORCYCLE_MOVEMENT_SPEED, MOTORCYCLE_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, MOTORCYCLE_ACCELERATION, MOTORCYCLE_BRAKING, MOTORCYCLE_STEERING),
    [VehicleType.CAR]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.CAR, true, CAR_MOVEMENT_SPEED, CAR_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, CAR_ACCELERATION, CAR_BRAKING, CAR_STEERING),
    [VehicleType.DRONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, true, DRONE_MOVEMENT_SPEED, DRONE_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, DRONE_ACCELERATION, DRONE_BRAKING, DRONE_STEERING)
});

export function resolveAvatarVehicleMovementCapability(vehicleType) {
    if (!isValidVehicleType(vehicleType)) {
        throw new Error(`resolveAvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
    }
    return CAPABILITY_BY_VEHICLE_TYPE[vehicleType];
}
