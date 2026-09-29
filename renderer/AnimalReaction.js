import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { ANIMAL_IDLE, idleEnvelope } from './AnimalIdle.js';
import { smoothstep } from '../utils/interpolation.js';

// How an animal reacts to YOUR avatar: it turns its head to watch you,
// stops grazing to lift its head while it does, and a rabbit close enough
// sits up. The last step of an animal's look, applied on top of its gait
// (renderer/AnimalGait.js) or idle action (renderer/AnimalIdle.js).
//
// PURELY VISUAL, AND ONLY FOR THE VIEWER'S OWN AVATAR. Where an animal is
// stays the same for everyone (core/WildlifeMotion.js), because collision
// and catching depend on it; this only turns heads and changes posture,
// so it can safely differ between viewers. Other players' avatars arrive
// late over the network, so reacting to them would not match what they
// see; each viewer's animals watch that viewer alone.
//
// STATELESS: a pure function of where the observer is, where the animal is
// and its current pose — no per-animal memory, so it is continuous for as
// long as the observer moves continuously:
//
//   - it fades in with distance (full within 60% of the look radius);
//   - an animal only sees what is in front of it: the reaction fades out
//     as the observer moves behind it, so the head never whips from one
//     shoulder to the other when the observer crosses directly behind;
//   - the head turns while walking too, but posture (head lifted, a rabbit
//     sitting up) only changes as far as the animal is settled in its
//     pause (idleEnvelope), so starting or ending a walk never snaps.

// Distances in world units, angles in radians. `lookPitch` is the head's
// pitch while watching (negative lifts it); `maxYaw` is as far as the head
// turns on the neck.
export const ANIMAL_REACTION = Object.freeze({
    [ANIMAL_SPECIES.DEER]: Object.freeze({ lookRadius: 8, maxYaw: 1.3, lookPitch: -0.2, sitUpRadius: 0 }),
    [ANIMAL_SPECIES.RABBIT]: Object.freeze({ lookRadius: 5, maxYaw: 1.1, lookPitch: -0.1, sitUpRadius: 3 })
});

// How far inside a radius a reaction takes to reach full strength.
const FADE_FRACTION = 0.4;

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function wrapAngle(angle) {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a <= -Math.PI) a += Math.PI * 2;
    return a;
}

// 1 well inside `radius`, fading smoothly to 0 at it.
function withinRadius(distance, radius) {
    if (!(radius > 0)) return 0;
    return smoothstep(clamp01((radius - distance) / (radius * FADE_FRACTION)));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// `offsets` (from AnimalGait/AnimalIdle), adjusted for an animal of
// `species` standing at (`x`, `z`) in `pose` (as core/WildlifeMotion.js
// reports it: rotationY, plus idleSeconds/idleDuration while standing)
// being watched by `observer` ({ x, z }, or null for no avatar). Returns
// `offsets` itself when there is nothing to react to.
export function reactToObserver(species, offsets, pose, x, z, observer) {
    if (!observer) return offsets;
    const reaction = ANIMAL_REACTION[species] ?? ANIMAL_REACTION[ANIMAL_SPECIES.RABBIT];
    const dx = observer.x - x;
    const dz = observer.z - z;
    const distance = Math.hypot(dx, dz);
    if (!(distance < reaction.lookRadius) || distance === 0) return offsets;

    // Where the observer is relative to where the animal faces, in (-π, π].
    const bearing = wrapAngle(Math.atan2(dx, dz) - pose.rotationY);
    const inView = smoothstep(clamp01((Math.PI - Math.abs(bearing)) / (Math.PI - reaction.maxYaw)));
    const watch = withinRadius(distance, reaction.lookRadius) * inView;
    if (watch === 0) return offsets;

    const lookYaw = Math.max(-reaction.maxYaw, Math.min(reaction.maxYaw, bearing));
    const settled = idleEnvelope(pose.idleSeconds, pose.idleDuration);
    const posture = watch * settled;

    // The posture it watches in: head lifted; for a rabbit close enough,
    // sitting up (its alert pose, renderer/AnimalIdle.js).
    const sit = withinRadius(distance, reaction.sitUpRadius);
    const alert = ANIMAL_IDLE[species]?.alert ?? ANIMAL_IDLE[ANIMAL_SPECIES.RABBIT].alert;
    const target = {
        lift: sit * (alert.lift ?? 0),
        bodyPitch: sit * (alert.bodyPitch ?? 0),
        headPitch: lerp(reaction.lookPitch, alert.headPitch, sit)
    };

    return {
        lift: lerp(offsets.lift, target.lift, posture),
        bodyPitch: lerp(offsets.bodyPitch, target.bodyPitch, posture),
        headPitch: lerp(offsets.headPitch, target.headPitch, posture),
        headYaw: lerp(offsets.headYaw, lookYaw, watch)
    };
}
