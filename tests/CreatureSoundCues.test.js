import {
    CREATURE_SOUND_CUE, advanceCreatureSound, createCreatureSoundState, placeSound, voiceFor
} from '../core/CreatureSoundCues.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { IDLE_ACTION } from '../core/WildlifeMotion.js';
import { assert } from './support/Assert.js';

const NORTH = { x: 0, z: 1 };
const listenerAt = (x = 0, z = 0, forward = NORTH) => ({ position: { x, y: 0, z }, forward });

function deer(overrides = {}) {
    return { id: 'deer-1', species: ANIMAL_SPECIES.DEER, x: 0, z: 20, moving: false, gaitPhase: 0, idleAction: IDLE_ACTION.NONE, ...overrides };
}

function run(observations) {
    let state = createCreatureSoundState();
    const all = [];
    for (const observation of observations) {
        const result = advanceCreatureSound(state, observation);
        state = result.state;
        all.push(result.cues);
    }
    return all;
}

// Loudness fades with distance; left and right follow the camera.
{
    const near = placeSound(listenerAt(), 0, 1, 30);
    const mid = placeSound(listenerAt(), 0, 15, 30);
    assert(near.gain === 1 && mid.gain > 0 && mid.gain < near.gain, 'sounds fade with distance');
    assert(placeSound(listenerAt(), 0, 31, 30) === null, 'nothing is heard beyond range');
    // Facing +Z, the camera's right is -X.
    assert(placeSound(listenerAt(), -10, 0, 30).pan > 0.99, 'a sound at -X is on the right when facing +Z');
    assert(placeSound(listenerAt(), 10, 0, 30).pan < -0.99, 'a sound at +X is on the left when facing +Z');
    assert(Math.abs(placeSound(listenerAt(), 0, 10, 30).pan) < 1e-9, 'a sound straight ahead is centered');
    const turned = listenerAt(0, 0, { x: 1, z: 0 });
    assert(placeSound(turned, 0, 10, 30).pan > 0.99, 'turning to face +X puts +Z on the right');
    console.log('✓ distance fade and left/right placement');
}

// An animal calls when it looks up alert, not on every tick it stays alert.
{
    const alert = deer({ idleAction: IDLE_ACTION.ALERT });
    const cues = run([
        { listener: listenerAt(), animals: [deer()] },
        { listener: listenerAt(), animals: [alert] },
        { listener: listenerAt(), animals: [alert] },
        { listener: listenerAt(), animals: [deer()] }
    ]);
    const calls = cues.flat().filter((c) => c.kind === CREATURE_SOUND_CUE.ANIMAL_CALL);
    assert(calls.length === 1 && cues[1].length === 1, 'one call as it turns alert');
    assert(calls[0].species === ANIMAL_SPECIES.DEER && !calls[0].startled, 'an alert deer snorts');
    const first = run([{ listener: listenerAt(), animals: [alert] }]);
    assert(first[0].length === 0, 'an animal already alert when first heard stays quiet');
    const far = run([
        { listener: listenerAt(), animals: [deer({ z: 40 })] },
        { listener: listenerAt(), animals: [deer({ z: 40, idleAction: IDLE_ACTION.ALERT })] }
    ]);
    assert(far.flat().length === 0, 'an animal beyond earshot is not heard');
    console.log('✓ alert calls');
}

// Coming close startles it once; it calls again only after you have gone away.
{
    const at = (z) => ({ listener: listenerAt(0, z), animals: [deer({ z: 20 })] });
    const cues = run([at(0), at(14), at(14.5), at(0), at(14)]).map((list) => list.filter((c) => c.kind === CREATURE_SOUND_CUE.ANIMAL_CALL));
    assert(cues[1].length === 1 && cues[1][0].startled, 'walking within 8 m of a deer startles it');
    assert(cues[2].length === 0, 'staying close does not repeat it');
    assert(cues[4].length === 1, 'after going 16 m away, coming back startles it again');
    const rabbit = { id: 'r', species: ANIMAL_SPECIES.RABBIT, x: 0, z: 10, moving: false, gaitPhase: 0, idleAction: IDLE_ACTION.NONE };
    const rabbitCues = run([
        { listener: listenerAt(0, 0), animals: [rabbit] },
        { listener: listenerAt(0, 4), animals: [rabbit] },
        { listener: listenerAt(0, 6), animals: [rabbit] }
    ]);
    assert(rabbitCues[1].length === 0 && rabbitCues[2].length === 1, 'a rabbit only startles within 5 m');
    console.log('✓ startle on approach, rearmed by leaving');
}

// A walking animal is heard stepping, once per stride, only when near.
{
    const walk = (phase, z = 5) => ({ listener: listenerAt(), animals: [deer({ z, moving: true, gaitPhase: phase })] });
    const steps = run([walk(0.2), walk(0.8), walk(1.1), walk(1.5), walk(2.05)]).flat()
        .filter((c) => c.kind === CREATURE_SOUND_CUE.ANIMAL_STEP);
    assert(steps.length === 2, `a step for each whole stride (${steps.length})`);
    const far = run([walk(0.2, 20), walk(1.2, 20)]).flat().filter((c) => c.kind === CREATURE_SOUND_CUE.ANIMAL_STEP);
    assert(far.length === 0, 'steps farther than 12 m are not heard');
    console.log('✓ animal steps');
}

// Catching and releasing are heard as the carried animals change.
{
    const obs = (carried) => ({ listener: listenerAt(), animals: [], carriedAnimals: carried });
    const cues = run([
        obs([{ id: 'a', species: ANIMAL_SPECIES.RABBIT }]),
        obs([{ id: 'a', species: ANIMAL_SPECIES.RABBIT }, { id: 'b', species: ANIMAL_SPECIES.DEER }]),
        obs([{ id: 'b', species: ANIMAL_SPECIES.DEER }])
    ]);
    assert(cues[0].length === 0, 'what is already carried when sound starts is not a catch');
    assert(cues[1].length === 1 && cues[1][0].kind === CREATURE_SOUND_CUE.CATCH && cues[1][0].species === ANIMAL_SPECIES.DEER, 'a new animal carried is a catch');
    assert(cues[2].length === 1 && cues[2][0].kind === CREATURE_SOUND_CUE.RELEASE, 'an animal no longer carried is a release');
    assert(cues[1][0].gain === 1 && cues[1][0].pan === 0, 'catching is heard up close, centered');
    console.log('✓ catch and release');
}

// A resident greets you once as you come close to it standing, again after you leave.
{
    const resident = (moving = false) => ({ id: 'res-1', x: 0, z: 10, moving });
    const at = (z, moving = false) => ({ listener: listenerAt(0, z), animals: [], residents: [resident(moving)] });
    const cues = run([at(0), at(7.5, true), at(7.5), at(8), at(0), at(8)]).map((list) => list.filter((c) => c.kind === CREATURE_SOUND_CUE.RESIDENT_GREET));
    assert(cues[1].length === 0, 'a walking resident does not greet');
    assert(cues[2].length === 1, 'a standing resident within 3.5 m greets you');
    assert(cues[2][0].voice === voiceFor('res-1'), 'in its own voice');
    assert(cues[3].length === 0, 'once per approach');
    assert(cues[5].length === 1, 'again after you have been 7 m away');
    const startClose = run([at(8)]);
    assert(startClose[0].length === 0, 'a resident beside you when sound starts does not greet');
    console.log('✓ resident greetings');
}

// A resident is heard talking when it speaks, in its voice, longer for more words.
{
    const resident = { id: 'res-2', x: 0, z: 3, moving: false };
    const speech = (spokenAt, remarks) => ({ residentId: 'res-2', spokenAt, remarks });
    const obs = (said) => ({ listener: listenerAt(0, 0), animals: [], residents: [resident], residentSpeech: said });
    const short = speech(1000, ['A deer grazes nearby.']);
    const long = speech(2000, ['A red bicycle stands about 40 m to the north, beside the old mill by the river.', 'Carol built a tower to the east.']);
    const cues = run([obs(null), obs(short), obs(short), obs(long)]).map((list) => list.filter((c) => c.kind === CREATURE_SOUND_CUE.RESIDENT_SPEECH));
    assert(cues[1].length === 1 && cues[1][0].voice === voiceFor('res-2'), 'speaking is heard in its voice');
    assert(cues[2].length === 0, 'the same speech is heard once');
    assert(cues[3].length === 1 && cues[3][0].syllables > cues[1][0].syllables, 'more words, more syllables');
    const old = run([obs(short)]);
    assert(old[0].length === 0, 'something said before sound started is not replayed');
    console.log('✓ resident speech');
}

// A walking resident's steps; voices differ between residents and never change.
{
    const at = (z) => ({ listener: listenerAt(), animals: [], residents: [{ id: 'walker', x: 0, z, moving: true }] });
    const steps = run([at(5), at(5.4), at(5.8), at(6.2), at(6.6)]).flat().filter((c) => c.kind === CREATURE_SOUND_CUE.RESIDENT_STEP);
    assert(steps.length === 2, `a step every 0.7 m (${steps.length})`);
    assert(voiceFor('a') !== voiceFor('b') && voiceFor('a') === voiceFor('a'), 'each resident keeps its own voice');
    assert(voiceFor('x') >= 0 && voiceFor('x') < 1, 'a voice is in [0, 1)');
    console.log('✓ resident steps and voices');
}

// No listener, no sound.
{
    const result = advanceCreatureSound(createCreatureSoundState(), null);
    assert(result.cues.length === 0, 'nothing without a listener');
    console.log('✓ silent without a listener');
}
