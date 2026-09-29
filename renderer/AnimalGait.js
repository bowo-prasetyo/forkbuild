import { ANIMAL_SPECIES } from '../core/WildlifeField.js';

// How a walking animal's body moves with each stride — the renderer-side
// half of wildlife motion. core/WildlifeMotion.js says WHERE an animal is
// and how many strides into its current walk it is (`gaitPhase`); this
// file turns that phase into how the body looks mid-stride. It is purely
// visual: nothing here changes where an animal is for collision or
// catching, which only ever read x/z.
//
// No legs are modeled (see renderer/WildlifeTileMesh.js's own header), so a
// gait is carried by the body and head alone:
//
//   RABBIT hops: each stride is one arc off the ground, nose tipping up on
//   take-off and down on landing.
//   DEER steps: the body rises slightly twice per stride (once per step)
//   and the head nods in time with it, pivoting at the neck.
//
// Every offset is zero at a whole-number gaitPhase — the start and end of
// every stride, and so of every walk — which is what keeps the gait
// continuous: a walk begins and ends at rest, and consecutive hops meet
// on the ground.

export const GAIT_STYLE = Object.freeze({
    HOP: 'HOP',
    STEP: 'STEP'
});

// Heights in the animal's own unscaled units (the instance transform
// scales them with the body), angles in radians. Positive pitch tips the
// nose down.
export const ANIMAL_GAIT = Object.freeze({
    [ANIMAL_SPECIES.DEER]: Object.freeze({ style: GAIT_STYLE.STEP, bobHeight: 0.04, headNod: 0.22 }),
    [ANIMAL_SPECIES.RABBIT]: Object.freeze({ style: GAIT_STYLE.HOP, hopHeight: 0.16, hopPitch: 0.3 })
});

// A standing animal, or one exactly between strides.
export const REST_GAIT = Object.freeze({ lift: 0, bodyPitch: 0, headPitch: 0 });

const TWO_PI = Math.PI * 2;

// { lift, bodyPitch, headPitch } for `species` at `gaitPhase` strides into
// a walk: how far to raise the body, and how far to tip the body and,
// separately, the head about its neck.
export function gaitOffsetsAt(species, gaitPhase) {
    if (!(gaitPhase > 0)) return REST_GAIT;
    const gait = ANIMAL_GAIT[species] ?? ANIMAL_GAIT[ANIMAL_SPECIES.RABBIT];
    const stride = gaitPhase - Math.floor(gaitPhase); // [0, 1) through the current stride
    if (gait.style === GAIT_STYLE.HOP) {
        return {
            lift: gait.hopHeight * Math.sin(Math.PI * stride),
            // Nose up while rising (negative), down while landing.
            bodyPitch: -gait.hopPitch * Math.sin(TWO_PI * stride),
            headPitch: 0
        };
    }
    // Two steps per stride: 0 → 1 → 0 twice.
    const step = (1 - Math.cos(2 * TWO_PI * stride)) / 2;
    return {
        lift: gait.bobHeight * step,
        bodyPitch: 0,
        headPitch: gait.headNod * step
    };
}
