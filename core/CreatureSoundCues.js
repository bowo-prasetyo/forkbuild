// The sounds of the living things around the listener, derived from what they
// are already doing: an animal's call when it looks up alert and when you
// come close, its steps while it walks, a sound as you catch or release one;
// a resident's hello when it greets you, its murmur when it talks and its
// steps; another player's footsteps, jumps and landings, and, while it rides,
// its engine, getting on and off and braking. Pure: the caller keeps the
// state between ticks.
//
// Every placed cue carries `gain` (fading with distance), `pan` (-1 left to 1
// right of the camera), so a deer to the right is heard on the right, and
// `position` ({ x, y, z } where it is drawn) for 3D sound.
import { ANIMAL_SPECIES } from './WildlifeField.js';
import { IDLE_ACTION } from './WildlifeMotion.js';
import { advanceAvatarSound, createAvatarSoundState, AVATAR_SOUND_CUE } from './AvatarSoundCues.js';
import { AvatarAnimationState } from './AvatarAnimationState.js';
import { AvatarVerticalState } from './AvatarVerticalState.js';

export const CREATURE_SOUND_CUE = Object.freeze({
    ANIMAL_CALL: 'animal-call',
    ANIMAL_STEP: 'animal-step',
    CATCH: 'catch',
    RELEASE: 'release',
    RESIDENT_GREET: 'resident-greet',
    RESIDENT_SPEECH: 'resident-speech',
    RESIDENT_STEP: 'resident-step',
    PLAYER_FOOTSTEP: 'player-footstep',
    PLAYER_JUMP: 'player-jump',
    PLAYER_LAND: 'player-land',
    PLAYER_MOUNT: 'player-mount',
    PLAYER_DISMOUNT: 'player-dismount',
    PLAYER_BRAKE: 'player-brake'
});

// Another player's own sounds, from its presence, as the local avatar's are
// from the local one (core/AvatarSoundCues.js), a little softer.
const PLAYER_CUE = Object.freeze({
    [AVATAR_SOUND_CUE.FOOTSTEP]: CREATURE_SOUND_CUE.PLAYER_FOOTSTEP,
    [AVATAR_SOUND_CUE.JUMP]: CREATURE_SOUND_CUE.PLAYER_JUMP,
    [AVATAR_SOUND_CUE.LAND]: CREATURE_SOUND_CUE.PLAYER_LAND,
    [AVATAR_SOUND_CUE.MOUNT]: CREATURE_SOUND_CUE.PLAYER_MOUNT,
    [AVATAR_SOUND_CUE.DISMOUNT]: CREATURE_SOUND_CUE.PLAYER_DISMOUNT
});
const PLAYER_RANGE = 20;
const PLAYER_LOUDNESS = 0.8;
// Engines and brakes carry farther than steps; only the nearest few engines
// are heard, so a crowd of riders doesn't drown everything else.
export const RIDER_RANGE = 40;
export const MAX_RIDER_ENGINES = 3;
// Braking isn't sent, so it is heard when a rider slows sharply: its speed
// (smoothed, as a fraction of top speed) falls to half of its recent peak,
// from a peak of at least BRAKE_FROM. The peak sinks by PEAK_DECAY a second,
// so easing off slowly is silent. It can sound again once the rider is back
// up to BRAKE_FROM.
const BRAKE_FROM = 0.45;
const PEAK_DECAY = 0.5;
// Positions arrive a few times a second and are interpolated between, so a
// rider can seem to stand still for a moment: speed is smoothed over about
// this many seconds before it drives an engine or a brake.
const LOAD_SMOOTHING_SECONDS = 0.4;
const DEFAULT_SAMPLE_SECONDS = 0.1;

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
    return Object.freeze({ animals: new Map(), residents: new Map(), players: new Map(), carried: null, lastSpokenAt: undefined });
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

// `source` is where the sound comes from ({ x, y, z }), for 3D sound; a cue
// heard up close at the listener (a catch) has none.
function cue(kind, placement, extra, source = null) {
    const position = source ? { x: source.x, y: Number.isFinite(source.y) ? source.y : 0, z: source.z } : null;
    return Object.freeze({ kind, gain: placement.gain, pan: placement.pan, position, ...extra });
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
                cues.push(cue(CREATURE_SOUND_CUE.ANIMAL_CALL, call, { species: animal.species, startled }, animal));
            }
            const near = placeSound(listener, animal.x, animal.z, STEP_RANGE);
            if (near && animal.moving && step > previous.step) {
                cues.push(cue(CREATURE_SOUND_CUE.ANIMAL_STEP, near, { species: animal.species }, animal));
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
            cues.push(cue(CREATURE_SOUND_CUE.RESIDENT_GREET, placement, { voice: voiceFor(resident.id) }, resident));
        }
        if (previous && resident.moving) {
            entry.stride += Math.hypot(resident.x - previous.x, resident.z - previous.z);
            if (entry.stride >= RESIDENT_STRIDE) {
                entry.stride = Math.min(entry.stride - RESIDENT_STRIDE, RESIDENT_STRIDE);
                if (placement) cues.push(cue(CREATURE_SOUND_CUE.RESIDENT_STEP, placement, {}, resident));
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
            cues.push(cue(CREATURE_SOUND_CUE.RESIDENT_SPEECH, placement, { voice: voiceFor(speech.residentId), syllables }, speaker));
        }
    }
    return next;
}

// Each other player steps, jumps, lands, gets on and off through the same
// step as the local avatar. Presence carries no vertical state
// (docs/Principles.md, "Local Physics Is Local"), so its JUMPING animation
// stands for being in the air; what it rides comes from its signed vehicle
// message (`vehicleType`, null on foot). Riders' engines are returned in
// `engines`, the nearest first.
function advancePlayers(state, listener, players, seed, deltaSeconds, cues, engines) {
    const next = new Map();
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    for (const player of players) {
        const previous = state.players.get(player.id) || { sound: createAvatarSoundState(), load: 0, peak: 0, brakeArmed: false };
        const result = advanceAvatarSound(previous.sound, {
            position: player.position,
            animation: player.animation,
            verticalState: player.animation === AvatarAnimationState.JUMPING
                ? AvatarVerticalState.RISING
                : AvatarVerticalState.SUPPORTED,
            vehicleType: player.vehicleType || null
        }, deltaSeconds, seed);
        const { x, z } = player.position;
        const source = { x, y: player.y, z };
        const engine = result.engine;
        const sameVehicle = Boolean(engine) && previous.sound.vehicleType === engine.vehicleType;
        const blend = 1 - Math.exp(-dt / LOAD_SMOOTHING_SECONDS);
        const load = sameVehicle ? previous.load + (engine.load - previous.load) * blend : 0;
        const peak = sameVehicle ? Math.max(load, previous.peak - PEAK_DECAY * dt) : 0;
        const braking = sameVehicle && previous.brakeArmed && peak >= BRAKE_FROM && load <= peak / 2;
        const brakeArmed = sameVehicle && !braking && (previous.brakeArmed || load >= BRAKE_FROM);
        next.set(player.id, { sound: result.state, load, peak: braking ? load : peak, brakeArmed });

        const placement = placeSound(listener, x, z, PLAYER_RANGE);
        if (placement) {
            for (const own of result.cues) {
                const kind = PLAYER_CUE[own.kind];
                if (!kind) continue;
                const extra = own.vehicleType
                    ? { vehicleType: own.vehicleType }
                    : { surface: own.surface, intensity: own.intensity * PLAYER_LOUDNESS };
                cues.push(cue(kind, placement, extra, source));
            }
        }
        const far = engine ? placeSound(listener, x, z, RIDER_RANGE) : null;
        if (!far) continue;
        if (braking) {
            cues.push(cue(CREATURE_SOUND_CUE.PLAYER_BRAKE, far, { vehicleType: engine.vehicleType, intensity: peak }, source));
        }
        engines.push({ id: player.id, vehicleType: engine.vehicleType, load, placement: far, source });
    }
    engines.sort((a, b) => a.placement.distance - b.placement.distance);
    engines.splice(MAX_RIDER_ENGINES);
    return next;
}

// `observation` is { listener, animals, carriedAnimals, residents,
// residentSpeech, remoteAvatars } (application/worldNavigation/
// soundObservationMethods.js), or null; `seed` picks the surface under a
// player's feet and `deltaSeconds` is the time since the last look. Returns the
// next state, the cues to play now and the other players' engines to hear
// until the next look: { id, vehicleType, load, gain, pan, position }, placed
// like a cue.
export function advanceCreatureSound(state, observation, { seed = 0, deltaSeconds = DEFAULT_SAMPLE_SECONDS } = {}) {
    if (!observation || !observation.listener) {
        return { state: createCreatureSoundState(), cues: [], engines: [] };
    }
    const cues = [];
    const { listener } = observation;
    const animals = advanceAnimals(state, listener, observation.animals || [], cues);
    const carried = advanceCarried(state, observation.carriedAnimals, cues);
    const residents = advanceResidents(state, listener, observation.residents || [], observation.residentSpeech, cues);
    const riders = [];
    const players = advancePlayers(state, listener, observation.remoteAvatars || [], seed, deltaSeconds, cues, riders);
    const engines = riders.map(({ id, vehicleType, load, placement, source }) => {
        const { kind, ...placed } = cue(null, placement, { id, vehicleType, load }, source);
        return Object.freeze(placed);
    });
    const speech = observation.residentSpeech;
    return {
        state: Object.freeze({ animals, residents, players, carried, lastSpokenAt: speech ? speech.spokenAt : null }),
        cues,
        engines
    };
}
