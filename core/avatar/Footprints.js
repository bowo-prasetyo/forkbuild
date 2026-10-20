// Footprints in the snow behind the local avatar: where each one falls,
// worked out frame by frame from what the avatar is already doing, as its
// footsteps are (core/avatar/AvatarSoundCues.js). Only this device's own avatar
// leaves them, and only here: nothing is sent, stored or seen by anyone
// else, and each fades away after FOOTPRINT_SECONDS
// (renderer/FootprintTrail.js). Pure: the caller keeps the state between
// frames.
//
// A print falls every FOOTPRINT_STRIDE walked, left and right in turn, a
// little to either side of the path and pointing the way it goes, while
// the avatar walks or runs on open ground with snow lying at least
// SNOW_FOOTSTEP_COVER deep. None on bricks, on a frozen lake, in the water,
// in the air, riding, or under a roof.
import { AvatarAnimationState } from './AvatarAnimationState.js';
import { AvatarVerticalState } from './AvatarVerticalState.js';
import { AvatarSwimMode } from './AvatarSwimming.js';
import { VehicleType } from '../vehicles/VehicleType.js';
import { SNOW_FOOTSTEP_COVER } from './AvatarSoundCues.js';

export const FOOTPRINT_STRIDE = 0.75;
export const FOOTPRINT_SECONDS = 60;
// How far to either side of the path a foot falls.
export const FOOTPRINT_SPREAD = 0.13;
// As core/avatar/AvatarSoundCues.js: above this the avatar stands on bricks; a move
// longer than the other is a teleport, which leaves no trail.
const ON_STRUCTURE_HEIGHT = 0.05;
const TELEPORT_DISTANCE = 10;

export function createFootprintState() {
    return Object.freeze({ lastPosition: null, walked: 0, left: true });
}

// `observation`: { position, animation, verticalState, vehicleType,
// swimMode, onIce, snowCover, sheltered } for the local avatar (null without
// one); `now`, any steady clock in seconds. Returns the next state and the
// prints that fell this frame, each { x, z, heading, left, at }: heading the
// way it points (radians, as a rotation about the vertical, 0 facing +z).
export function advanceFootprints(state, observation, now) {
    if (!observation || !observation.position) {
        return { state: createFootprintState(), prints: [] };
    }
    const { position } = observation;
    const previous = state.lastPosition;
    let walked = state.walked;
    let left = state.left;
    const prints = [];
    const next = () => Object.freeze({ lastPosition: { x: position.x, z: position.z }, walked, left });
    if (!previous) {
        return { state: next(), prints };
    }
    const dx = position.x - previous.x;
    const dz = position.z - previous.z;
    const moved = Math.hypot(dx, dz);
    const striding = observation.animation === AvatarAnimationState.WALKING || observation.animation === AvatarAnimationState.RUNNING;
    const onSnow = (observation.snowCover || 0) >= SNOW_FOOTSTEP_COVER
        && !observation.sheltered
        && !observation.onIce
        && position.y <= ON_STRUCTURE_HEIGHT
        && (observation.verticalState || AvatarVerticalState.SUPPORTED) === AvatarVerticalState.SUPPORTED
        && (!observation.swimMode || observation.swimMode === AvatarSwimMode.NONE)
        && (!observation.vehicleType || observation.vehicleType === VehicleType.NONE);
    if (!Number.isFinite(moved) || moved > TELEPORT_DISTANCE || !striding || !onSnow || moved === 0) {
        if (!onSnow || !striding) walked = 0;
        return { state: next(), prints };
    }
    walked += moved;
    if (walked >= FOOTPRINT_STRIDE) {
        // At most one print a frame, however long the frame.
        walked = Math.min(walked - FOOTPRINT_STRIDE, FOOTPRINT_STRIDE);
        const heading = Math.atan2(dx, dz);
        const side = left ? 1 : -1;
        // Left of the way it goes: facing north (+z), west (+x) is on the
        // left (core/world/CompassHeading.js).
        const sx = (dz / moved) * side * FOOTPRINT_SPREAD;
        const sz = (-dx / moved) * side * FOOTPRINT_SPREAD;
        prints.push(Object.freeze({ x: position.x + sx, z: position.z + sz, heading, left, at: now }));
        left = !left;
    }
    return { state: next(), prints };
}

// How clearly a print made at `at` shows at `now`, 1 fresh to 0 gone: it
// holds, then fades over the last third of FOOTPRINT_SECONDS, and fades
// with the snow it was made in as that melts.
export function footprintFade(at, now, snowCover = 1) {
    const age = now - at;
    if (!(age >= 0) || age >= FOOTPRINT_SECONDS) return 0;
    const holding = FOOTPRINT_SECONDS * (2 / 3);
    const time = age <= holding ? 1 : 1 - (age - holding) / (FOOTPRINT_SECONDS - holding);
    const snow = Math.min(1, Math.max(0, snowCover / SNOW_FOOTSTEP_COVER));
    return time * snow;
}
