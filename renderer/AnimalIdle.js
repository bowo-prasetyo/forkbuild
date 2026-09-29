import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { IDLE_ACTION } from '../core/WildlifeMotion.js';
import { REST_GAIT } from './AnimalGait.js';
import { smoothstep } from '../utils/interpolation.js';

// How a standing animal looks while it idles — the pause-time counterpart
// of renderer/AnimalGait.js. core/WildlifeMotion.js decides WHICH idle
// action a pause is spent on and for how long (idleAction, idleSeconds,
// idleDuration); this file turns that into the same offsets a gait
// produces, plus a sideways turn of the head:
//
//   GRAZE — DEER lowers its muzzle to the grass and chews; RABBIT drops its
//           head and nibbles, quicker.
//   ALERT — DEER raises its head and slowly looks from side to side;
//           RABBIT sits up on its haunches and glances about.
//
// Every action eases in from rest at the start of the pause and back out
// to rest before the animal turns to leave, so it never pops against the
// turn or the walk around it. Like the gait, it is purely visual.

// Heights in the animal's own unscaled units, angles in radians. Positive
// pitch tips the nose down; positive yaw turns the head to its left.
export const ANIMAL_IDLE = Object.freeze({
    [ANIMAL_SPECIES.DEER]: Object.freeze({
        // A muzzle in the grass: the head's center stays above the ground.
        graze: Object.freeze({ headPitch: 0.45, bodyPitch: 0.04, chewPitch: 0.05, chewHz: 1.5 }),
        alert: Object.freeze({ headPitch: -0.25, lookYaw: 0.6, lookHz: 0.2 })
    }),
    [ANIMAL_SPECIES.RABBIT]: Object.freeze({
        graze: Object.freeze({ headPitch: 0.5, bodyPitch: 0.06, chewPitch: 0.08, chewHz: 4 }),
        // Sitting up pivots the body about its base; the lift keeps its rump
        // on the ground rather than sunk into it, and the head tips forward
        // again to look ahead rather than at the sky.
        alert: Object.freeze({ bodyPitch: -0.5, lift: 0.12, headPitch: 0.35, lookYaw: 0.4, lookHz: 0.35 })
    })
});

// How long an action takes to ease in, and to ease back out.
export const IDLE_EASE_SECONDS = 0.7;

const TWO_PI = Math.PI * 2;

// 0 at both ends of the idle window, rising smoothly to 1 in between.
// Exported as how settled an animal is in its pause: renderer/AnimalReaction.js
// only changes a body's posture as far as this allows, so a reaction never
// snaps when a walk starts or ends.
export function idleEnvelope(seconds, duration) {
    if (!(duration > 0)) return 0;
    return envelope(seconds, duration);
}

function envelope(seconds, duration) {
    const edge = Math.min(seconds, duration - seconds) / IDLE_EASE_SECONDS;
    return smoothstep(Math.max(0, Math.min(1, edge)));
}

// { lift, bodyPitch, headPitch, headYaw } for `species` at `idleSeconds`
// into an `idleAction` lasting `idleDuration` seconds (all as
// core/WildlifeMotion.js#animalPoseAt() reports them).
export function idleOffsetsAt(species, idleAction, idleSeconds, idleDuration) {
    if (idleAction === IDLE_ACTION.NONE || !(idleDuration > 0)) return REST_GAIT;
    const idle = ANIMAL_IDLE[species] ?? ANIMAL_IDLE[ANIMAL_SPECIES.RABBIT];
    const weight = envelope(idleSeconds, idleDuration);
    if (weight === 0) return REST_GAIT;
    if (idleAction === IDLE_ACTION.GRAZE) {
        const { headPitch, bodyPitch, chewPitch, chewHz } = idle.graze;
        return {
            lift: 0,
            bodyPitch: bodyPitch * weight,
            headPitch: (headPitch + chewPitch * Math.sin(TWO_PI * chewHz * idleSeconds)) * weight,
            headYaw: 0
        };
    }
    const { headPitch, bodyPitch = 0, lift = 0, lookYaw, lookHz } = idle.alert;
    return {
        lift: lift * weight,
        bodyPitch: bodyPitch * weight,
        headPitch: headPitch * weight,
        headYaw: lookYaw * Math.sin(TWO_PI * lookHz * idleSeconds) * weight
    };
}
