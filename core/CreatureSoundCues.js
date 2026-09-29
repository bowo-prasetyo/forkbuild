// The sounds of the living things around the listener, derived from what they
// are already doing: an animal's call when it looks up alert and when you
// come close, its steps while it walks, a sound as you catch or release one;
// a resident's hello when it greets you, its murmur when it talks and its
// steps. Pure: the caller keeps the state between ticks.
//
// Every cue carries `gain` (fading with distance) and `pan` (-1 left to 1
// right of the camera), so a deer to the right is heard on the right.
import { ANIMAL_SPECIES } from './WildlifeField.js';
import { IDLE_ACTION } from './WildlifeMotion.js';

export const CREATURE_SOUND_CUE = Object.freeze({
    ANIMAL_CALL: 'animal-call',
    ANIMAL_STEP: 'animal-step',
    CATCH: 'catch',
    RELEASE: 'release',
    RESIDENT_GREET: 'resident-greet',
    RESIDENT_SPEECH: 'resident-speech',
    RESIDENT_STEP: 'resident-step'
});

// How far each sound carries, in meters.
const CALL_RANGE = 30;
const STEP_RANGE = 12;
const SPEECH_RANGE = 15;
// Full loudness within this distance, fading to nothing at a sound's range.
const NEAR_DISTANCE = 2;

// Coming within this distance startles an animal into a call (the radius it
// turns its head to watch you in, renderer/AnimalReaction.js); it calls
// again only after you have gone twice as far.
const STARTLE_RADIUS = Object.freeze({ [ANIMAL_SPECIES.DEER]: 8, [ANIMAL_SPECIES.RABBIT]: 5 });

// A resident greets you within 3.5 m while it stands facing you, and again
// after you have walked 7 m away (renderer/ResidentReaction.js).
const GREET_RADIUS = 3.5;
const GREET_REARM_RADIUS = 7;
// A resident's walking stride.
const RESIDENT_STRIDE = 0.7;
const SPEECH_SYLLABLES_MIN = 3;
const SPEECH_SYLLABLES_MAX = 14;

export function createCreatureSoundState() {
    return Object.freeze({ animals: new Map(), residents: new Map(), carried: null, lastSpokenAt: undefined });
}

// Loudness and left/right position of a sound at (x, z) heard by `listener`
// ({ position, forward }), or null beyond `range`.
export function placeSound(listener, x, z, range) {
    const dx = x - listener.position.x;
    const dz = z - listener.position.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance) || distance > range) {
        return null;
    }
    const gain = distance <= NEAR_DISTANCE
        ? 1
        : Math.max(0, 1 - (distance - NEAR_DISTANCE) / (range - NEAR_DISTANCE)) ** 2;
    // The camera's right is its forward turned a quarter clockwise seen from
    // above: (-forward.z, forward.x).
    const pan = distance > 1e-6
        ? Math.max(-1, Math.min(1, (dx * -listener.forward.z + dz * listener.forward.x) / distance))
        : 0;
    return { gain, pan, distance };
}

// A stable number in [0, 1) for a string, so each resident keeps its voice.
export function voiceFor(id) {
    let h = 0x811c9dc5;
    const text = String(id);
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    }
    return (h >>> 0) / 4294967296;
}

function cue(kind, placement, extra) {
    return Object.freeze({ kind, gain: placement.gain, pan: placement.pan, ...extra });
}

function advanceAnimals(state, listener, animals, cues) {
    const next = new Map();
    for (const animal of animals) {
        const previous = state.animals.get(animal.id);
        const call = placeSound(listener, animal.x, animal.z, CALL_RANGE);
        const startle = STARTLE_RADIUS[animal.species] ?? 5;
        const distance = call ? call.distance : Infinity;
        const step = Math.floor(animal.gaitPhase || 0);
        const entry = {
            idleAction: animal.idleAction,
            step: animal.moving ? step : 0,
            // Known animals keep their armed state; one first heard already close
            // doesn't startle, so walking into World View beside a deer is quiet.
            startled: previous ? (previous.startled ? distance < startle * 2 : distance < startle) : distance < startle
        };
        if (previous && call) {
            const alerted = animal.idleAction === IDLE_ACTION.ALERT && previous.idleAction !== IDLE_ACTION.ALERT;
            const startled = !previous.startled && entry.startled;
            if (alerted || startled) {
                cues.push(cue(CREATURE_SOUND_CUE.ANIMAL_CALL, call, { species: animal.species, startled }));
            }
            const near = placeSound(listener, animal.x, animal.z, STEP_RANGE);
            if (near && animal.moving && step > previous.step) {
                cues.push(cue(CREATURE_SOUND_CUE.ANIMAL_STEP, near, { species: animal.species }));
            }
        }
        next.set(animal.id, entry);
    }
    return next;
}

function advanceCarried(state, carriedAnimals, cues) {
    const carried = new Map((carriedAnimals || []).map((animal) => [animal.id, animal.species]));
    if (state.carried) {
        const here = { gain: 1, pan: 0 };
        for (const [id, species] of carried) {
            if (!state.carried.has(id)) cues.push(cue(CREATURE_SOUND_CUE.CATCH, here, { species }));
        }
        for (const [id, species] of state.carried) {
            if (!carried.has(id)) cues.push(cue(CREATURE_SOUND_CUE.RELEASE, here, { species }));
        }
    }
    return carried;
}

function advanceResidents(state, listener, residents, speech, cues) {
    const next = new Map();
    for (const resident of residents) {
        const previous = state.residents.get(resident.id);
        const placement = placeSound(listener, resident.x, resident.z, STEP_RANGE);
        const distance = Math.hypot(resident.x - listener.position.x, resident.z - listener.position.z);
        const entry = {
            x: resident.x,
            z: resident.z,
            stride: previous ? previous.stride : 0,
            greeted: previous ? (previous.greeted ? distance < GREET_REARM_RADIUS : false) : distance < GREET_REARM_RADIUS
        };
        if (!entry.greeted && !resident.moving && distance < GREET_RADIUS && placement) {
            entry.greeted = true;
            cues.push(cue(CREATURE_SOUND_CUE.RESIDENT_GREET, placement, { voice: voiceFor(resident.id) }));
        }
        if (previous && resident.moving) {
            entry.stride += Math.hypot(resident.x - previous.x, resident.z - previous.z);
            if (entry.stride >= RESIDENT_STRIDE) {
                entry.stride = Math.min(entry.stride - RESIDENT_STRIDE, RESIDENT_STRIDE);
                if (placement) cues.push(cue(CREATURE_SOUND_CUE.RESIDENT_STEP, placement, {}));
            }
        }
        next.set(resident.id, entry);
    }
    // The first tick only records what was last said, so a conversation from
    // before sound started isn't replayed.
    if (speech && state.lastSpokenAt !== undefined && speech.spokenAt !== state.lastSpokenAt) {
        const speaker = residents.find((resident) => resident.id === speech.residentId);
        const placement = speaker ? placeSound(listener, speaker.x, speaker.z, SPEECH_RANGE) : null;
        if (placement) {
            const words = (speech.remarks || []).join(' ').split(/\s+/).filter(Boolean).length;
            const syllables = Math.max(SPEECH_SYLLABLES_MIN, Math.min(SPEECH_SYLLABLES_MAX, Math.round(words / 2)));
            cues.push(cue(CREATURE_SOUND_CUE.RESIDENT_SPEECH, placement, { voice: voiceFor(speech.residentId), syllables }));
        }
    }
    return next;
}

// `observation` is { listener, animals, carriedAnimals, residents,
// residentSpeech } (application/worldNavigation/soundObservationMethods.js),
// or null. Returns the next state and the cues to play now.
export function advanceCreatureSound(state, observation) {
    if (!observation || !observation.listener) {
        return { state: createCreatureSoundState(), cues: [] };
    }
    const cues = [];
    const { listener } = observation;
    const animals = advanceAnimals(state, listener, observation.animals || [], cues);
    const carried = advanceCarried(state, observation.carriedAnimals, cues);
    const residents = advanceResidents(state, listener, observation.residents || [], observation.residentSpeech, cues);
    const speech = observation.residentSpeech;
    return {
        state: Object.freeze({ animals, residents, carried, lastSpokenAt: speech ? speech.spokenAt : null }),
        cues
    };
}
