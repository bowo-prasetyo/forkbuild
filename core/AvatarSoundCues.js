// The local avatar's sounds, derived frame by frame from what it is already
// doing: a footstep every stride while it walks or runs on the ground, a
// jump as it leaves the ground, a landing as it returns; getting on and off a
// vehicle, braking, and an engine while it rides. Pure: the caller keeps the
// state between frames.
import { AvatarAnimationState } from './AvatarAnimationState.js';
import { AvatarVerticalState } from './AvatarVerticalState.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';
import { VehicleType } from './VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from './AvatarVehicleMovementCapability.js';

export const FOOTSTEP_SURFACE = Object.freeze({
    GRASS: 'grass',
    LEAVES: 'leaves',
    SAND: 'sand',
    STONE: 'stone',
    WATER: 'water',
    STRUCTURE: 'structure'
});

export const AVATAR_SOUND_CUE = Object.freeze({
    FOOTSTEP: 'footstep',
    JUMP: 'jump',
    LAND: 'land',
    MOUNT: 'mount',
    DISMOUNT: 'dismount',
    BRAKE: 'brake'
});

// Braking is only heard when the vehicle is going at least this fraction of
// its top speed: pressing the brake at a standstill makes no squeal.
const BRAKE_AUDIBLE_LOAD = 0.15;

// One footstep per leg swing of core/AvatarPoseOffsets.js's gait: 3 m/s over
// its 2 Hz walking cycle, 6 m/s over its 3.2 Hz running cycle, two steps a
// cycle. Counted by distance, so an avatar pressing against a wall is silent.
const WALK_STRIDE = 0.75;
const RUN_STRIDE = 0.94;
// The first step after standing still comes this far into a stride, so
// setting off is heard at once.
const FIRST_STEP_FRACTION = 0.6;
// Avatar Y is a flat simulated plane (see docs/Architecture.md, "Avatar
// movement constraint pipeline"): above it while supported means standing on
// bricks.
const ON_STRUCTURE_HEIGHT = 0.05;
// A move longer than this in one frame is a teleport (Home, a spawn), not a
// walk, and makes no footsteps.
const TELEPORT_DISTANCE = 10;
// Stepping down a stair is airborne for a moment; only a real fall lands.
const MIN_LANDING_AIRBORNE_SECONDS = 0.15;
const HARD_LANDING_AIRBORNE_SECONDS = 1;

export function footstepSurfaceAt(seed, x, z, { onStructure = false } = {}) {
    if (onStructure) {
        return FOOTSTEP_SURFACE.STRUCTURE;
    }
    const zone = ecologyZoneAt(seed, x, z);
    if (zone === ECOLOGY_ZONE.WATER || isRiverAt(seed, x, z)) {
        return FOOTSTEP_SURFACE.WATER;
    }
    switch (zone) {
        case ECOLOGY_ZONE.BEACH:
            return FOOTSTEP_SURFACE.SAND;
        case ECOLOGY_ZONE.ROCK:
        case ECOLOGY_ZONE.HIGHLAND:
            return FOOTSTEP_SURFACE.STONE;
        case ECOLOGY_ZONE.FOREST:
            return FOOTSTEP_SURFACE.LEAVES;
        default:
            return FOOTSTEP_SURFACE.GRASS;
    }
}

export function createAvatarSoundState() {
    return Object.freeze({
        lastPosition: null,
        strideDistance: WALK_STRIDE * FIRST_STEP_FRACTION,
        verticalState: AvatarVerticalState.SUPPORTED,
        airborneSeconds: 0,
        vehicleType: null,
        braking: false
    });
}

function isRiding(vehicleType) {
    return typeof vehicleType === 'string' && vehicleType !== VehicleType.NONE;
}

// How hard a vehicle is working, 0 to 1: its speed over its top speed.
function engineFor(vehicleType, speed) {
    let topSpeed = 0;
    try {
        topSpeed = resolveAvatarVehicleMovementCapability(vehicleType).movementSpeed;
    } catch {
        topSpeed = 0;
    }
    const load = topSpeed > 0 ? Math.min(1, Math.max(0, speed / topSpeed)) : 0;
    return Object.freeze({ vehicleType, load });
}

// `observation` is { position, animation, verticalState, vehicleType,
// braking } for the local avatar, or null without one. Returns the next state, the one-off
// cues to play this frame, and the engine to hear (null on foot).
export function advanceAvatarSound(state, observation, deltaSeconds, seed) {
    if (!observation || !observation.position) {
        return { state: createAvatarSoundState(), cues: [], engine: null };
    }
    const { position, animation, vehicleType } = observation;
    const verticalState = observation.verticalState || AvatarVerticalState.SUPPORTED;
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;

    let moved = 0;
    if (state.lastPosition) {
        moved = Math.hypot(position.x - state.lastPosition.x, position.z - state.lastPosition.z);
        if (!Number.isFinite(moved) || moved > TELEPORT_DISTANCE) {
            moved = 0;
        }
    }
    const next = {
        lastPosition: { x: position.x, y: position.y, z: position.z },
        strideDistance: state.strideDistance,
        verticalState,
        airborneSeconds: verticalState === AvatarVerticalState.SUPPORTED ? 0 : state.airborneSeconds + dt,
        vehicleType: isRiding(vehicleType) ? vehicleType : null,
        braking: Boolean(observation.braking) && isRiding(vehicleType)
    };

    const cues = [];
    // Getting on or off is only heard once the state is known: the first frame
    // after sound starts, already riding, is not a mount.
    const known = state.lastPosition !== null;
    const wasRiding = isRiding(state.vehicleType);
    if (known && wasRiding && state.vehicleType !== next.vehicleType) {
        cues.push(Object.freeze({ kind: AVATAR_SOUND_CUE.DISMOUNT, vehicleType: state.vehicleType }));
    }
    if (known && isRiding(vehicleType) && state.vehicleType !== vehicleType) {
        cues.push(Object.freeze({ kind: AVATAR_SOUND_CUE.MOUNT, vehicleType }));
    }

    if (isRiding(vehicleType)) {
        next.strideDistance = WALK_STRIDE * FIRST_STEP_FRACTION;
        const speed = dt > 0 ? moved / dt : 0;
        const engine = engineFor(vehicleType, speed);
        if (next.braking && !state.braking && engine.load >= BRAKE_AUDIBLE_LOAD) {
            cues.push(Object.freeze({ kind: AVATAR_SOUND_CUE.BRAKE, vehicleType, intensity: engine.load }));
        }
        return { state: Object.freeze(next), cues, engine };
    }

    const surface = () => footstepSurfaceAt(seed, position.x, position.z, {
        onStructure: position.y > ON_STRUCTURE_HEIGHT
    });
    const wasSupported = state.verticalState === AvatarVerticalState.SUPPORTED;
    const isSupported = verticalState === AvatarVerticalState.SUPPORTED;

    if (wasSupported && verticalState === AvatarVerticalState.RISING) {
        cues.push(Object.freeze({ kind: AVATAR_SOUND_CUE.JUMP, surface: surface(), intensity: 0.8 }));
    } else if (!wasSupported && isSupported && state.airborneSeconds + dt >= MIN_LANDING_AIRBORNE_SECONDS) {
        const intensity = Math.min(1, Math.max(0.4, (state.airborneSeconds + dt) / HARD_LANDING_AIRBORNE_SECONDS));
        cues.push(Object.freeze({ kind: AVATAR_SOUND_CUE.LAND, surface: surface(), intensity }));
        next.strideDistance = 0;
    }

    const striding = animation === AvatarAnimationState.WALKING || animation === AvatarAnimationState.RUNNING;
    if (!isSupported) {
        // In the air: no footsteps, and the stride resumes from the landing.
    } else if (!striding || moved === 0) {
        if (!striding) {
            next.strideDistance = WALK_STRIDE * FIRST_STEP_FRACTION;
        }
    } else {
        const running = animation === AvatarAnimationState.RUNNING;
        const stride = running ? RUN_STRIDE : WALK_STRIDE;
        next.strideDistance += moved;
        if (next.strideDistance >= stride) {
            // At most one step a frame, however long the frame.
            next.strideDistance = Math.min(next.strideDistance - stride, stride);
            cues.push(Object.freeze({
                kind: AVATAR_SOUND_CUE.FOOTSTEP,
                surface: surface(),
                intensity: running ? 1 : 0.6
            }));
        }
    }
    return { state: Object.freeze(next), cues, engine: null };
}
