import {
    AVATAR_SOUND_CUE, FOOTSTEP_SURFACE, advanceAvatarSound, createAvatarSoundState, footstepSurfaceAt
} from '../core/AvatarSoundCues.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarVerticalState } from '../core/AvatarVerticalState.js';
import { VehicleType } from '../core/VehicleType.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { isRiverAt } from '../core/Hydrology.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { assert } from './support/Assert.js';

const SEED = DEFAULT_WORLD_SEED;
const DT = 1 / 60;

function findWhere(predicate) {
    for (let x = -2000; x <= 2000; x += 4) {
        for (let z = -2000; z <= 2000; z += 4) {
            if (predicate(x, z)) return { x, z };
        }
    }
    throw new Error('no such spot');
}

// Where a zone holds and there is no river, so the zone decides the surface.
const zoneSpot = (zone) => findWhere((x, z) => ecologyZoneAt(SEED, x, z) === zone && !isRiverAt(SEED, x, z));

function observe(position, { animation = AvatarAnimationState.WALKING, verticalState = AvatarVerticalState.SUPPORTED, vehicleType = null } = {}) {
    return { position, animation, verticalState, vehicleType };
}

// Walks in a straight line along +x at `speed` for `seconds`, returning every cue.
function walk({ start, speed, seconds, animation = AvatarAnimationState.WALKING, y = 0 }) {
    let state = createAvatarSoundState();
    const cues = [];
    const frames = Math.round(seconds / DT);
    for (let i = 0; i <= frames; i++) {
        const result = advanceAvatarSound(state, observe({ x: start.x + speed * DT * i, y, z: start.z }, { animation }), DT, SEED);
        state = result.state;
        cues.push(...result.cues);
    }
    return cues;
}

// Surfaces follow the land, and bricks underfoot win.
{
    assert(footstepSurfaceAt(SEED, 0, 0, { onStructure: true }) === FOOTSTEP_SURFACE.STRUCTURE, 'bricks underfoot sound like a structure');
    const cases = [
        [ECOLOGY_ZONE.FOREST, FOOTSTEP_SURFACE.LEAVES],
        [ECOLOGY_ZONE.BEACH, FOOTSTEP_SURFACE.SAND],
        [ECOLOGY_ZONE.HIGHLAND, FOOTSTEP_SURFACE.STONE],
        [ECOLOGY_ZONE.GRASSLAND, FOOTSTEP_SURFACE.GRASS],
        [ECOLOGY_ZONE.FIELD, FOOTSTEP_SURFACE.GRASS],
        [ECOLOGY_ZONE.WATER, FOOTSTEP_SURFACE.WATER]
    ];
    for (const [zone, surface] of cases) {
        const { x, z } = zoneSpot(zone);
        assert(footstepSurfaceAt(SEED, x, z) === surface, `${zone} sounds like ${surface}`);
    }
    const river = findWhere((x, z) => isRiverAt(SEED, x, z));
    assert(footstepSurfaceAt(SEED, river.x, river.z) === FOOTSTEP_SURFACE.WATER, 'a river splashes');
    console.log('✓ footstep surfaces follow the land');
}

// Footsteps keep time with the gait: about 4 a second walking, 6.4 running.
{
    const start = zoneSpot(ECOLOGY_ZONE.GRASSLAND);
    const walking = walk({ start, speed: 3, seconds: 2 });
    assert(walking.every((c) => c.kind === AVATAR_SOUND_CUE.FOOTSTEP), 'walking only makes footsteps');
    assert(walking.length >= 7 && walking.length <= 9, `2 s of walking is about 8 steps (got ${walking.length})`);
    assert(walking.every((c) => c.intensity < 1), 'walking steps are softer');
    const running = walk({ start, speed: 6, seconds: 2, animation: AvatarAnimationState.RUNNING });
    assert(running.length >= 12 && running.length <= 14, `2 s of running is about 13 steps (got ${running.length})`);
    assert(running.every((c) => c.intensity === 1), 'running steps are full');
    const first = walk({ start, speed: 3, seconds: 0.15 });
    assert(first.length === 1, 'setting off is heard at once');
    console.log('✓ footsteps keep time with walking and running');
}

// No footsteps standing still, pushing against a wall, or on a teleport.
{
    const start = zoneSpot(ECOLOGY_ZONE.GRASSLAND);
    assert(walk({ start, speed: 0, seconds: 2 }).length === 0, 'walking into a wall is silent');
    assert(walk({ start, speed: 3, seconds: 2, animation: AvatarAnimationState.IDLE }).length === 0, 'an idle avatar makes no steps');
    let state = advanceAvatarSound(createAvatarSoundState(), observe({ x: 0, y: 0, z: 0 }), DT, SEED).state;
    const jumped = advanceAvatarSound(state, observe({ x: 500, y: 0, z: 0 }), DT, SEED);
    assert(jumped.cues.length === 0, 'a teleport makes no footstep');
    console.log('✓ silence when not really walking');
}

// Steps on bricks sound like a structure.
{
    const cues = walk({ start: zoneSpot(ECOLOGY_ZONE.GRASSLAND), speed: 3, seconds: 1, y: 2 });
    assert(cues.length > 0 && cues.every((c) => c.surface === FOOTSTEP_SURFACE.STRUCTURE), 'walking on a roof sounds like a structure');
    console.log('✓ steps on bricks');
}

// A jump as the avatar leaves the ground, a landing when it returns.
{
    const spot = { ...zoneSpot(ECOLOGY_ZONE.GRASSLAND), y: 0 };
    let state = advanceAvatarSound(createAvatarSoundState(), observe(spot, { animation: AvatarAnimationState.IDLE }), DT, SEED).state;
    const up = advanceAvatarSound(state, observe(spot, { animation: AvatarAnimationState.JUMPING, verticalState: AvatarVerticalState.RISING }), DT, SEED);
    assert(up.cues.length === 1 && up.cues[0].kind === AVATAR_SOUND_CUE.JUMP && up.cues[0].surface === FOOTSTEP_SURFACE.GRASS, 'leaving the ground is a jump');
    state = up.state;
    for (let i = 0; i < 40; i++) {
        const air = advanceAvatarSound(state, observe({ ...spot, x: spot.x + i * 0.05 }, {
            animation: AvatarAnimationState.JUMPING,
            verticalState: i < 20 ? AvatarVerticalState.RISING : AvatarVerticalState.FALLING
        }), DT, SEED);
        assert(air.cues.length === 0, 'nothing sounds in the air');
        state = air.state;
    }
    const down = advanceAvatarSound(state, observe(spot, { animation: AvatarAnimationState.IDLE }), DT, SEED);
    assert(down.cues.length === 1 && down.cues[0].kind === AVATAR_SOUND_CUE.LAND, 'returning to the ground is a landing');
    assert(down.cues[0].intensity > 0.6 && down.cues[0].intensity <= 1, `a full jump lands firmly (${down.cues[0].intensity})`);

    // A step down a stair is airborne for a moment and makes no landing.
    let stair = advanceAvatarSound(createAvatarSoundState(), observe(spot, { animation: AvatarAnimationState.IDLE }), DT, SEED).state;
    stair = advanceAvatarSound(stair, observe(spot, { animation: AvatarAnimationState.IDLE, verticalState: AvatarVerticalState.FALLING }), DT, SEED).state;
    const touch = advanceAvatarSound(stair, observe(spot, { animation: AvatarAnimationState.IDLE }), DT, SEED);
    assert(touch.cues.length === 0, 'a brief drop does not thud');
    console.log('✓ jumps and landings');
}

// Riding: an engine that works harder the faster it goes, and no footsteps.
{
    const spot = zoneSpot(ECOLOGY_ZONE.GRASSLAND);
    for (const [type, speed] of [[VehicleType.BICYCLE, 6], [VehicleType.MOTORCYCLE, 9], [VehicleType.CAR, 12], [VehicleType.DRONE, 16]]) {
        let state = createAvatarSoundState();
        let result = null;
        for (let i = 0; i < 30; i++) {
            result = advanceAvatarSound(state, observe({ x: spot.x + speed * 0.5 * DT * i, y: 0, z: spot.z }, { vehicleType: type }), DT, SEED);
            state = result.state;
            assert(result.cues.length === 0, `riding a ${type} makes no footsteps`);
        }
        assert(result.engine && result.engine.vehicleType === type, `riding a ${type} has its engine`);
        assert(Math.abs(result.engine.load - 0.5) < 0.01, `half the ${type}'s top speed is half load (${result.engine.load})`);
        const parked = advanceAvatarSound(state, observe({ x: spot.x + speed * 0.5 * DT * 29, y: 0, z: spot.z }, { vehicleType: type }), DT, SEED);
        assert(parked.engine.load === 0, `a stopped ${type} idles`);
    }
    const onFoot = advanceAvatarSound(createAvatarSoundState(), observe({ x: 0, y: 0, z: 0 }, { vehicleType: VehicleType.NONE }), DT, SEED);
    assert(onFoot.engine === null, 'on foot there is no engine');
    console.log('✓ vehicle engines follow speed');
}

// Without an avatar, nothing plays and the state starts over.
{
    const result = advanceAvatarSound(createAvatarSoundState(), null, DT, SEED);
    assert(result.cues.length === 0 && result.engine === null, 'no avatar, no sound');
    console.log('✓ no avatar is silent');
}
