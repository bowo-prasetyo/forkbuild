import { AVATAR_COLLISION_HEIGHT } from './AvatarCollision.js';

// Pure swimming and diving rules for the avatar. Every height here is in one
// shared vertical frame chosen by the caller (the movement controller uses the
// terrain-relative frame AvatarPresence carries; the renderer uses world
// heights); this file only ever compares and steps plain numbers.
//
// Whether the avatar swims is decided from where its feet are against the water
// surface, never from a flag on AvatarPresence: anyone who knows the position
// (a peer drawing a remote avatar, the camera, the sound engine) reaches the same
// answer, and presence keeps its existing wire shape.

// Water deeper than half the avatar's height lifts it off its feet.
export const AVATAR_SWIM_DEPTH = AVATAR_COLLISION_HEIGHT / 2;
// Feet below the surface while floating, which leaves the head and eyes above it.
export const SURFACE_SWIM_FEET_DEPTH = 1.4;
// Nose and mouth above the feet: below the surface here, the avatar holds its breath.
export const AVATAR_BREATH_HEIGHT = 1.55;

// One breath lasts two and a half minutes underwater, and refills in five seconds
// at the surface.
export const BREATH_CAPACITY_SECONDS = 150;
export const BREATH_REFILL_PER_SECOND = BREATH_CAPACITY_SECONDS / 5;

// Swimming moves at the speed of wading at swim depth, so stepping off the
// shelf never jolts the avatar's pace.
export const SWIM_SPEED_FACTOR = 0.4;
export const SWIM_VERTICAL_SPEED = 1.5; // world units / second, diving or rising on request
export const FORCED_ASCENT_SPEED = 2.5; // world units / second, out of air
export const BUOYANCY_SPEED = 0.5; // world units / second, drifting up with no input

const MAX_DELTA_SECONDS = 0.25; // mirrors core/AvatarMovementSimulation.js's per-tick clamp
const EPSILON = 1e-6;

export const AvatarSwimMode = Object.freeze({
    NONE: 'none',
    SURFACE: 'surface',
    DIVING: 'diving'
});

// `waterSurfaceHeight` is null or non-finite where there is no standing water.
export function deriveAvatarSwimMode({ feetHeight, waterSurfaceHeight }) {
    if (!Number.isFinite(waterSurfaceHeight) || !Number.isFinite(feetHeight)) {
        return AvatarSwimMode.NONE;
    }
    if (waterSurfaceHeight - feetHeight <= AVATAR_SWIM_DEPTH + EPSILON) {
        return AvatarSwimMode.NONE;
    }
    return feetHeight + AVATAR_BREATH_HEIGHT < waterSurfaceHeight - EPSILON
        ? AvatarSwimMode.DIVING
        : AvatarSwimMode.SURFACE;
}

// Whether a water column is deep enough to swim in, measured from whatever the
// avatar would stand on (the bed, or a brick under the water).
export function isSwimmableDepth(waterSurfaceHeight, supportHeight) {
    return Number.isFinite(waterSurfaceHeight)
        && Number.isFinite(supportHeight)
        && waterSurfaceHeight - supportHeight > AVATAR_SWIM_DEPTH + EPSILON;
}

// Where the feet rest while floating at the surface.
export function surfaceSwimFeetHeight(waterSurfaceHeight) {
    return waterSurfaceHeight - SURFACE_SWIM_FEET_DEPTH;
}

export function isHeadUnderwater(feetHeight, waterSurfaceHeight) {
    return Number.isFinite(waterSurfaceHeight)
        && feetHeight + AVATAR_BREATH_HEIGHT < waterSurfaceHeight - EPSILON;
}

// One tick of vertical swimming. `verticalInput` is +1 to rise, -1 to dive, 0 to
// drift up slowly. Out of air (`forcedAscent`) the avatar rises at its own speed
// whatever is held. The result stays between the bottom and the floating height.
export function stepSwimFeetHeight({ feetHeight, floorHeight, waterSurfaceHeight, verticalInput = 0, forcedAscent = false, deltaSeconds }) {
    const dt = sanitizeDeltaSeconds(deltaSeconds);
    let speed;
    if (forcedAscent) speed = FORCED_ASCENT_SPEED;
    else if (verticalInput > 0) speed = SWIM_VERTICAL_SPEED;
    else if (verticalInput < 0) speed = -SWIM_VERTICAL_SPEED;
    else speed = BUOYANCY_SPEED;
    const floor = Number.isFinite(floorHeight) ? floorHeight : feetHeight;
    const ceiling = Math.max(floor, surfaceSwimFeetHeight(waterSurfaceHeight));
    const start = Number.isFinite(feetHeight) ? feetHeight : ceiling;
    return Math.min(ceiling, Math.max(floor, start + speed * dt));
}

export function createAvatarBreathState() {
    return Object.freeze({ breathSeconds: BREATH_CAPACITY_SECONDS, forcedAscent: false });
}

// Air runs down while the head is under water and refills above it. Once it runs
// out the avatar is pushed up, and held at the surface until it has caught its
// breath (a full breath again); only then can it dive again.
export function stepAvatarBreath(state, { submerged, deltaSeconds }) {
    const dt = sanitizeDeltaSeconds(deltaSeconds);
    const current = state && Number.isFinite(state.breathSeconds) ? state.breathSeconds : BREATH_CAPACITY_SECONDS;
    const wasForced = Boolean(state && state.forcedAscent);
    if (submerged) {
        const breathSeconds = Math.max(0, current - dt);
        return Object.freeze({ breathSeconds, forcedAscent: wasForced || breathSeconds === 0 });
    }
    const breathSeconds = Math.min(BREATH_CAPACITY_SECONDS, current + BREATH_REFILL_PER_SECOND * dt);
    return Object.freeze({ breathSeconds, forcedAscent: wasForced && breathSeconds < BREATH_CAPACITY_SECONDS });
}

function sanitizeDeltaSeconds(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(value, MAX_DELTA_SECONDS);
}
