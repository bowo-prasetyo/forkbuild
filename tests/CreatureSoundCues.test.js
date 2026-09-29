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

// Placed cues carry where they come from, for 3D sound; a catch is heard at the listener.
{
    const call = run([
        { listener: listenerAt(), animals: [deer({ y: 12.5 })] },
        { listener: listenerAt(), animals: [deer({ y: 12.5, idleAction: IDLE_ACTION.ALERT })] }
    ]).flat()[0];
    assert(call.position && call.position.x === 0 && call.position.y === 12.5 && call.position.z === 20, 'an animal call carries its position');
    const caught = run([
        { listener: listenerAt(), animals: [], carriedAnimals: [] },
        { listener: listenerAt(), animals: [], carriedAnimals: [{ id: 'a', species: ANIMAL_SPECIES.RABBIT }] }
    ]).flat()[0];
    assert(caught.position === null, 'a catch has no position: it is heard up close');
    console.log('✓ placed cues carry their position');
}

// Other players are heard walking, jumping and landing, from where they are.
{
    const { advanceCreatureSound: advance } = await import('../core/CreatureSoundCues.js');
    const { DEFAULT_WORLD_SEED } = await import('../core/TerrainHeightField.js');
    const seed = DEFAULT_WORLD_SEED;
    const step = (state, player) => advance(state, { listener: listenerAt(0, 0), animals: [], remoteAvatars: [player] }, { seed, deltaSeconds: 0.1 });
    let state = createCreatureSoundState();
    const cues = [];
    for (let i = 0; i <= 20; i++) {
        const result = step(state, { id: 'p1', position: { x: 0.3 * i, y: 0, z: 8 }, y: 3.2, animation: 'walking' });
        state = result.state;
        cues.push(...result.cues);
    }
    const steps = cues.filter((c) => c.kind === CREATURE_SOUND_CUE.PLAYER_FOOTSTEP);
    assert(steps.length >= 7 && steps.length <= 9, `2 s of another player walking is about 8 steps (${steps.length})`);
    assert(steps.every((c) => c.position.y === 3.2 && c.position.z === 8 && c.gain > 0 && typeof c.surface === 'string'),
        'each step is placed where the player is drawn, on its surface');
    assert(steps.every((c) => c.intensity < 0.6), 'a little softer than your own');

    const jump = [];
    for (const [animation, x] of [['idle', 0], ['jumping', 0.1], ['jumping', 0.2], ['jumping', 0.3], ['idle', 0.4]]) {
        const result = step(state, { id: 'p1', position: { x, y: 0, z: 8 }, y: 3.2, animation });
        state = result.state;
        jump.push(result.cues.map((c) => c.kind));
    }
    assert(jump[1].includes(CREATURE_SOUND_CUE.PLAYER_JUMP), 'their jump is heard');
    assert(jump[4].includes(CREATURE_SOUND_CUE.PLAYER_LAND), 'and their landing');

    let far = createCreatureSoundState();
    const farCues = [];
    for (let i = 0; i <= 10; i++) {
        const result = step(far, { id: 'p2', position: { x: 0.3 * i, y: 0, z: 25 }, y: 0, animation: 'walking' });
        far = result.state;
        farCues.push(...result.cues);
    }
    assert(farCues.length === 0, 'a player beyond 20 m is not heard');
    console.log('✓ other players walking, jumping and landing');
}

// Other riders: their engine follows their speed from where they are, their
// getting on and off is heard, a sharp slowdown sounds as a brake, and only
// the nearest few engines within 40 m play.
{
    const { resolveAvatarVehicleMovementCapability } = await import('../core/AvatarVehicleMovementCapability.js');
    const { MAX_RIDER_ENGINES, RIDER_RANGE } = await import('../core/CreatureSoundCues.js');
    const topSpeed = resolveAvatarVehicleMovementCapability('car').movementSpeed;
    const look = (state, players, listenerX = 0) => advanceCreatureSound(state, { listener: listenerAt(listenerX, 0), remoteAvatars: players }, { deltaSeconds: 0.1 });
    const rider = (id, x, z, vehicleType = 'car') => ({ id, position: { x, y: 2, z }, y: 2, animation: 'idle', vehicleType });

    // On foot, then on a car, cruising at full speed for 2 s, stopping in 0.3 s, then off.
    let state = createCreatureSoundState();
    let x = 0;
    const frames = [];
    const speeds = [
        ['walking', null, 0], ['idle', 'car', 0],
        ...Array(20).fill(['idle', 'car', topSpeed]),
        ['idle', 'car', topSpeed * 0.3], ['idle', 'car', 0], ...Array(6).fill(['idle', 'car', 0]),
        ['idle', null, 0]
    ];
    for (const [animation, vehicleType, speed] of speeds) {
        x += speed * 0.1;
        // Heard by someone keeping pace with them.
        const result = look(state, [{ ...rider('alice', x, 10, vehicleType), animation }], x);
        state = result.state;
        frames.push(result);
    }
    const kinds = frames.map((frame) => frame.cues.map((c) => c.kind));
    assert(kinds[1].includes(CREATURE_SOUND_CUE.PLAYER_MOUNT) && frames[1].cues[0].vehicleType === 'car', 'getting on is heard, with the vehicle');
    assert(kinds.at(-1).includes(CREATURE_SOUND_CUE.PLAYER_DISMOUNT), 'and getting off');
    assert(frames[0].engines.length === 0 && frames.at(-1).engines.length === 0, 'no engine on foot');
    const cruising = frames[21].engines[0];
    assert(cruising.id === 'alice' && cruising.vehicleType === 'car' && cruising.load > 0.9,
        `an engine at full speed works hard (${cruising.load})`);
    assert(frames[3].engines[0].load < cruising.load, 'and builds up rather than jumping');
    assert(cruising.position.z === 10 && cruising.position.y === 2 && cruising.gain > 0, 'placed where the rider is drawn');
    const brakes = kinds.flat().filter((kind) => kind === CREATURE_SOUND_CUE.PLAYER_BRAKE);
    assert(brakes.length === 1, `a sharp stop brakes once (${brakes.length})`);
    const braked = frames.findIndex((frame) => frame.cues.some((c) => c.kind === CREATURE_SOUND_CUE.PLAYER_BRAKE));
    assert(braked > 21 && braked < 29, `soon after slowing (${braked})`);

    // Slowing gently, over 4 s, is not braking.
    state = createCreatureSoundState();
    x = 0;
    const gentle = [];
    for (let i = 0; i < 70; i++) {
        const speed = i < 20 ? topSpeed : Math.max(0, topSpeed * (1 - (i - 20) / 40));
        x += speed * 0.1;
        const result = look(state, [rider('alice', x, 10)]);
        state = result.state;
        gentle.push(...result.cues.map((c) => c.kind));
    }
    assert(!gentle.includes(CREATURE_SOUND_CUE.PLAYER_BRAKE), 'easing off slowly is silent');

    // A rider first heard already on a car makes no getting-on sound.
    const already = look(createCreatureSoundState(), [rider('bob', 0, 10)]);
    assert(already.cues.length === 0 && already.engines.length === 1, 'someone already riding just has an engine');

    // The nearest few engines within range, nearest first.
    const crowd = [5, 30, 12, 20, 8].map((z, i) => rider(`r${i}`, 0, z));
    const heard = look(createCreatureSoundState(), [...crowd, rider('far', 0, RIDER_RANGE + 5, 'drone')]).engines;
    assert(heard.length === MAX_RIDER_ENGINES && MAX_RIDER_ENGINES === 3, 'a crowd is heard as the nearest three');
    assert(heard.map((e) => e.id).join() === 'r0,r4,r2', `nearest first (${heard.map((e) => e.id)})`);
    assert(look(createCreatureSoundState(), [rider('far', 0, RIDER_RANGE + 5)]).engines.length === 0, 'none beyond 40 m');
    const quiet = look(createCreatureSoundState(), [rider('a', 0, 30)]).engines[0];
    const loud = look(createCreatureSoundState(), [rider('a', 0, 5)]).engines[0];
    assert(quiet.gain < loud.gain && quiet.pan === 0, 'a farther engine is quieter');
    assert(look(createCreatureSoundState(), [rider('a', 10, 0)]).engines[0].pan < 0, 'and one to the left is on the left');
    console.log('✓ other riders: engines, getting on and off, braking');
}
