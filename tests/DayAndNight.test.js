import * as THREE from 'three';
import { DAY, NIGHT, DAY_CYCLE_SECONDS, dayFractionAt, skyLookAt, skyLookAtFraction } from '../core/DayCycle.js';
import { NIGHT_GLOW, WINDOW_LIGHT, nightGlowColor } from '../core/NightGlow.js';
import { ambientMixAt, ambientMixAtNight, AMBIENT_LAYER } from '../core/AmbientSoundscape.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { WorldViewSkyStore } from '../application/settings/WorldViewSkyStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// World View's day and night (core/DayCycle.js): the sky follows the clock,
// lamps and lit windows shine after dark, birds give way to crickets, and a
// device can keep it day.

const at = (fraction) => fraction * DAY_CYCLE_SECONDS;
const brightness = (look) => look.hemisphereIntensity + look.sunIntensity;

// The day goes round once every DAY_CYCLE_SECONDS, from the clock alone.
{
    assert(dayFractionAt(0) === 0, 'Unix time 0 is dawn');
    assert(Math.abs(dayFractionAt(DAY_CYCLE_SECONDS * 1000 + at(0.3)) - 0.3) < 1e-9, 'the day repeats every cycle');
    assert(Math.abs(dayFractionAt(-at(0.25)) - 0.75) < 1e-9, 'a time before 1970 still falls in a day');
    assert(JSON.stringify(skyLookAt(1_800_000_123.5)) === JSON.stringify(skyLookAt(1_800_000_123.5)),
        'everyone asking at the same moment sees the same sky');
    assert(dayFractionAt(NaN) > 0 && skyLookAt(NaN) === DAY, 'no clock is broad day');
    console.log('✓ the day goes round every cycle, from the clock alone');
}

// Day, dusk, night and dawn come in turn; full night is about a fifth of the
// cycle and still lit well enough to see by.
{
    assert(skyLookAtFraction(0.3) === DAY && skyLookAtFraction(0.06) === DAY && skyLookAtFraction(0.56) === DAY, 'midday is DAY');
    assert(skyLookAtFraction(0.8) === NIGHT, 'the middle of the night is NIGHT');
    const dusk = skyLookAtFraction(0.64);
    assert(dusk.glow > 0 && dusk.glow < 1 && brightness(dusk) < brightness(DAY) && brightness(dusk) > brightness(NIGHT),
        'dusk is between day and night');
    let nightSamples = 0;
    let previous = skyLookAtFraction(0);
    for (let i = 0; i <= 1000; i++) {
        const look = skyLookAtFraction(i / 1000);
        if (look === NIGHT) nightSamples++;
        assert(brightness(look) >= brightness(NIGHT) - 1e-9, `the light never drops below NIGHT's (at ${i / 1000})`);
        assert(Math.abs(look.glow - previous.glow) < 0.1 && Math.abs(brightness(look) - brightness(previous)) < 0.15,
            `the sky changes gradually (at ${i / 1000})`);
        previous = look;
    }
    assert(nightSamples > 180 && nightSamples < 260, `full night is about a fifth of the day (${nightSamples / 10}%)`);
    assert(NIGHT.hemisphereIntensity >= 0.5 && NIGHT.sunIntensity >= 0.4, 'night is moonlit, never black');
    assert(DAY.glow === 0 && NIGHT.glow === 1, 'lamps are out by day and full at night');
    console.log('✓ day, dusk, night and dawn in turn, never too dark to see');
}

// Lanterns shine in their own color and glass windows with lamplight; framed
// openings and everything else don't.
{
    const registry = new CreateBrickRegistryUseCase().execute();
    const lantern = registry.get('core:lantern');
    assert(lantern && lantern.nightGlow === NIGHT_GLOW.OWN_COLOR, 'the Lantern shines in its own color');
    assert(lantern.width === 0.75 && lantern.height === 1 && lantern.depth === 0.75, 'a lantern is 0.75 x 1 x 0.75');
    assert(nightGlowColor(lantern, 0x44aaff) === 0x44aaff && nightGlowColor(lantern, null) === lantern.color,
        'a recolored lantern shines in its new color, an uncolored one in its default');
    for (const id of ['core:window_small', 'core:window_large']) {
        assert(nightGlowColor(registry.get(id), 0x123456) === WINDOW_LIGHT, `${id} glows with lamplight whatever its glass`);
    }
    for (const id of ['core:window_frame', 'core:window_round', 'core:cube', 'core:round_1x1', 'core:door']) {
        assert(nightGlowColor(registry.get(id), 0xffd54f) === 0, `${id} gives off no light`);
    }
    assert(nightGlowColor(null, 0xffffff) === 0, 'an unknown brick gives off no light');

    const renderer = new BrickRenderer(registry);
    const describe = (definitionId, color = null) => renderer.describe(new Brick({ definitionId, position: new Position(0, 0.5, 0), color }));
    assert(describe('core:lantern', 0xff0000).glow === 0xff0000, 'a described lantern carries its light');
    assert(describe('core:window_small').glow === WINDOW_LIGHT && describe('core:cube').glow === 0, 'and a window its lamplight, a cube none');
    console.log('✓ lanterns and glass windows shine after dark, nothing else');
}

// The instanced bricks keep each brick's light through moves, swaps and
// growth, and one strength lights or puts out every lamp.
{
    const scene = { add() {}, remove() {} };
    const instances = new BrickInstanceRegistry(scene);
    const visual = (x, glow) => ({ definitionId: 'core:cube', x, y: 0.5, z: 0, rotationY: 0, color: 0x888888, glow });
    const glowAt = (brickId) => {
        const entry = instances._entries.get(brickId);
        const array = entry.chunk.mesh.geometry.getAttribute('instanceGlow').array;
        return new THREE.Color().fromArray(array, entry.index * 3).getHex();
    };
    instances.add('lamp', 'doc', 'b', visual(0, 0xff0000));
    instances.add('plain', 'doc', 'b', visual(1, 0));
    for (let i = 0; i < 100; i++) instances.add(`filler-${i}`, 'doc', 'b', visual(2 + (i % 10), 0));
    instances.add('window', 'doc', 'b', visual(3, WINDOW_LIGHT));
    assert(glowAt('lamp') === 0xff0000 && glowAt('plain') === 0, 'each instance carries its own light, after the chunk grew');
    instances.remove('lamp');
    assert(glowAt('window') === WINDOW_LIGHT && instances.getGlow('window') === WINDOW_LIGHT,
        'a brick moved into a removed slot keeps its light');
    instances.update('plain', visual(1, 0x00ff00));
    assert(glowAt('plain') === 0x00ff00, 'recoloring a lantern changes its light');
    assert(instances.nightGlow === 0, 'lamps start out (the Editor never lights them)');
    instances.setNightGlow(0.4);
    assert(instances.nightGlow === 0.4, 'night strength is shared by the whole registry');
    instances.setNightGlow(7);
    assert(instances.nightGlow === 1, 'and kept between 0 and 1');
    instances.setNightGlow(NaN);
    assert(instances.nightGlow === 0, 'nonsense puts the lamps out');
    console.log('✓ instanced bricks keep their light, and one strength lights them all');
}

// After dark birds fall nearly silent and crickets take over.
{
    const mix = ambientMixAt(DEFAULT_WORLD_SEED, 10, -20);
    assert(ambientMixAtNight(mix, 0) === mix, 'by day the mix is unchanged');
    const night = ambientMixAtNight(mix, 1);
    assert(night[AMBIENT_LAYER.BIRDS] <= mix[AMBIENT_LAYER.BIRDS] * 0.1 + 1e-9, 'birds fall nearly silent at night');
    assert(night[AMBIENT_LAYER.INSECTS] > mix[AMBIENT_LAYER.INSECTS] && night[AMBIENT_LAYER.INSECTS] <= 1, 'crickets rise, up to a full layer');
    assert(night[AMBIENT_LAYER.WIND] === mix[AMBIENT_LAYER.WIND] && night[AMBIENT_LAYER.WATER] === mix[AMBIENT_LAYER.WATER],
        'wind and water sound the same');
    const overWater = { ...mix, [AMBIENT_LAYER.WATER]: 1, [AMBIENT_LAYER.INSECTS]: 0 };
    assert(ambientMixAtNight(overWater, 1)[AMBIENT_LAYER.INSECTS] === 0, 'no crickets out on open water');

    const provider = { levels: null, sets: 0, setLayerLevels(levels) { this.levels = levels; this.sets++; }, setVolume() {}, setMuted() {}, setSpatial() {} };
    const clock = { night: 0 };
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => ({ x: 10, y: 0, z: -20 }),
        seed: DEFAULT_WORLD_SEED,
        nightLevel: () => clock.night,
        setIntervalFn: () => 0,
        clearIntervalFn: () => {}
    });
    service.start();
    assert(JSON.stringify(provider.levels) === JSON.stringify(mix), 'by day World View plays the daytime mix');
    clock.night = 0.02;
    service.sample();
    assert(provider.sets === 1, 'a listener standing still is not resampled for a sliver of dusk');
    clock.night = 1;
    service.sample();
    assert(provider.sets === 2 && JSON.stringify(provider.levels) === JSON.stringify(night), 'but is when night falls');
    console.log('✓ birds by day, crickets by night');
}

// The session lights World View by its clock, and Always day keeps it day.
{
    const clock = { now: at(0.3) };
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    assert(nav.skyLook() === DAY && nav.nightLevel() === 0 && nav.isAlwaysDay() === false, 'midday before World View opens');
    const looks = [];
    const frames = new Set();
    nav._session = {
        setSkyLook: (look) => looks.push(look),
        onAnimationFrame: (callback) => {
            frames.add(callback);
            return () => frames.delete(callback);
        }
    };
    nav._setupDayCycle();
    assert(looks.length === 1 && looks[0] === DAY, 'opening World View at midday shows the day');
    clock.now = at(0.8);
    for (const frame of frames) frame(1 / 60);
    assert(looks[looks.length - 1] === NIGHT && nav.nightLevel() === 1, 'each frame follows the clock into the night');
    assert(nav.setAlwaysDay(true) === true && looks[looks.length - 1] === DAY && nav.nightLevel() === 0,
        'Always day brings the day back at once');
    for (const frame of frames) frame(1 / 60);
    assert(looks[looks.length - 1] === DAY, 'and keeps it, whatever the clock');
    nav.setAlwaysDay(false);
    assert(looks[looks.length - 1] === NIGHT, 'turning it off returns to the world\'s own time');
    nav._session.dispose = () => {};
    nav.dispose();
    assert(frames.size === 0, 'closing World View stops following the clock');

    const noSky = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute() });
    noSky._session = { onAnimationFrame: () => () => {} };
    noSky._setupDayCycle();
    noSky.setAlwaysDay(true);
    console.log('✓ the session lights World View by its clock; Always day keeps it day');
}

// Always day is this device's choice, remembered, and damage reads as the
// world's own time.
{
    const storage = new InMemoryStorageProvider();
    const store = new WorldViewSkyStore({ storageProvider: storage });
    assert(store.isAlwaysDay() === false, 'nothing stored follows the world\'s time');
    assert(store.setAlwaysDay(true) === true && new WorldViewSkyStore({ storageProvider: storage }).isAlwaysDay() === true,
        'Always day is remembered');
    store.setAlwaysDay('yes');
    assert(store.isAlwaysDay() === false, 'only true keeps it day');
    storage.save('world-view-sky', 'garbage');
    assert(store.isAlwaysDay() === false, 'a damaged entry follows the world\'s time');
    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
        save() { throw new Error('full'); }
    }
    const throwing = new WorldViewSkyStore({ storageProvider: new ThrowingStorage() });
    assert(throwing.isAlwaysDay() === false && throwing.setAlwaysDay(true) === true, 'a storage error is tolerated');
    let threw = false;
    try {
        new WorldViewSkyStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'a StorageProvider is required');
    console.log('✓ Always day is remembered on this device');
}
