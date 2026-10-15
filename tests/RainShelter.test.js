import { indoorCutaway } from '../core/IndoorView.js';
import { brickAabb } from '../core/AvatarCollision.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { AMBIENT_LAYER, ambientMixAt, ambientMixInRain } from '../core/AmbientSoundscape.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { CameraPerspective } from '../core/CameraPerspective.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// Under a roof the rain stays outside (renderer/RainFall.js is handed the
// build the avatar stands in, whatever the camera), and is heard drumming on
// the roof rather than falling round you.

const definitions = new Map(CoreLibrary.definitions.map((definition) => [definition.id, definition]));
const HOUSE = VillageLibrary.structures.find((candidate) => candidate.id === 'village:house');
const houseBoxes = HOUSE.bricks.map((brick) => brickAabb(brick.position, definitions.get(brick.definitionId), brick.rotation, brick.tilt));
const FLOOR = 0.25;

// The build a roof belongs to reaches up to its own top.
{
    const cutaway = indoorCutaway({ x: 0, y: FLOOR, z: -2 }, houseBoxes);
    assert(cutaway, 'inside the starter house');
    const top = Math.max(...houseBoxes.map((box) => box.max.y));
    assert(cutaway.top === top && cutaway.top >= cutaway.ceiling, `the shelter reaches the house's top (${cutaway.top})`);
    console.log('✓ the build over your head reaches up to its own top');
}

// The session hands the renderer the shelter, in its own (ground-lifted)
// coordinates, in every camera perspective; and takes it away outside.
{
    for (const perspective of [null, CameraPerspective.FIRST_PERSON, CameraPerspective.THIRD_PERSON, CameraPerspective.BIRD_EYE]) {
        const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => 0 });
        const shelters = [];
        nav._session = { setRainShelter: (shelter) => shelters.push(shelter), setCutaway() {} };
        nav._indoorBoxesNear = () => houseBoxes;
        nav._cameraPerspective = perspective;
        nav._followIndoors({ position: { x: 0, y: FLOOR, z: -2 }, rotation: { y: 0 } });
        const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, 0, -2);
        const shelter = shelters[shelters.length - 1];
        const cutaway = indoorCutaway({ x: 0, y: FLOOR, z: -2 }, houseBoxes);
        assert(shelter && shelter.minX === cutaway.minX && shelter.maxZ === cutaway.maxZ && Math.abs(shelter.top - (cutaway.top + groundY)) < 1e-9,
            `${perspective || 'free camera'}: the renderer keeps the rain off the house, lifted onto the ground`);
        assert(nav.isSheltered(), 'and the avatar is sheltered');
        const count = shelters.length;
        nav._followIndoors({ position: { x: 0.1, y: FLOOR, z: -2 }, rotation: { y: 0 } });
        assert(shelters.length === count, 'a step within the same house is not handed over again');
        nav._followIndoors({ position: { x: 0, y: 0, z: -8 }, rotation: { y: 0 } });
        assert(shelters[shelters.length - 1] === null && !nav.isSheltered(), 'outside, the rain falls everywhere again');
    }
    // Riding, never sheltered.
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => 0 });
    nav._session = { setRainShelter() {}, setCutaway() {} };
    nav._indoorBoxesNear = () => houseBoxes;
    nav._isRidingMovableVehicle = () => true;
    nav._followIndoors({ position: { x: 0, y: FLOOR, z: -2 }, rotation: { y: 0 } });
    assert(!nav.isSheltered(), 'riding, nothing shelters you');
    console.log('✓ the session keeps the rain off the build you stand in, whatever the camera');
}

// Heard drumming on the roof, the rain outside faint through the walls.
{
    const dry = ambientMixAt(DEFAULT_WORLD_SEED, 10, -20);
    assert(dry[AMBIENT_LAYER.ROOF] === 0, 'a place on its own has no roof drumming');
    const open = ambientMixInRain(dry, 0.8);
    const under = ambientMixInRain(dry, 0.8, true);
    assert(open[AMBIENT_LAYER.ROOF] === 0 && open[AMBIENT_LAYER.RAIN] === 0.8, 'in the open, rain falls round you');
    assert(under[AMBIENT_LAYER.ROOF] === 0.8, 'under a roof it drums on it, as hard as it rains');
    assert(under[AMBIENT_LAYER.RAIN] > 0 && under[AMBIENT_LAYER.RAIN] < open[AMBIENT_LAYER.RAIN] * 0.5, 'and the rain outside is faint');
    assert(ambientMixInRain(dry, 0, true) === dry, 'dry, a roof is silent');
    console.log('✓ under a roof, rain drums on it');
}

// The soundscape hears you step in and out of shelter.
{
    const levels = [];
    const provider = { setLayerLevels: (l) => levels.push(l), setVolume() {}, setMuted() {}, setMusicMood() {}, resume() {}, dispose() {} };
    const state = { sheltered: false };
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => ({ x: 10, y: 0, z: -20 }),
        seed: DEFAULT_WORLD_SEED,
        rainLevel: () => 0.7,
        sheltered: () => state.sheltered,
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    service.sample();
    assert(levels[levels.length - 1][AMBIENT_LAYER.ROOF] === 0 && levels[levels.length - 1][AMBIENT_LAYER.RAIN] === 0.7, 'outside, rain all round');
    state.sheltered = true;
    service.sample();
    assert(levels[levels.length - 1][AMBIENT_LAYER.ROOF] === 0.7, 'stepping in, it drums on the roof at once');
    const count = levels.length;
    service.sample();
    assert(levels.length === count, 'staying in changes nothing');
    state.sheltered = false;
    service.sample();
    assert(levels[levels.length - 1][AMBIENT_LAYER.ROOF] === 0, 'stepping out, it falls round you again');
    service.dispose();
    console.log('✓ the soundscape follows you in and out of shelter');
}
