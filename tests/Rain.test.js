import {
    FAIR_WEATHER, WEATHER_SPELL_SECONDS, WEATHER_CHANGE_SECONDS, RAIN_CHANGE_SHARE, weatherAt, weatherOfCover, spellCover, spellRain
} from '../core/Weather.js';
import { AMBIENT_LAYER, ambientMixAt, ambientMixInRain } from '../core/AmbientSoundscape.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// Rain (core/Weather.js): it falls now and then, only from an overcast sky,
// waiting for the clouds to gather and stopping before they clear; it is heard
// wherever you stand, and quietens the birds and insects; and Always day
// keeps it dry.

const FIRST = Math.floor(1_800_000_000 / WEATHER_SPELL_SECONDS);

// About one spell in eight rains, and only an overcast one.
{
    const spells = 20000;
    let rainy = 0;
    let strengths = 0;
    for (let spell = FIRST; spell < FIRST + spells; spell++) {
        const rain = spellRain(spell);
        assert(rain >= 0 && rain <= 1, 'rain is between dry and a downpour');
        if (rain === 0) continue;
        rainy++;
        strengths += rain;
        assert(spellCover(spell) >= 0.88, 'it only rains from an overcast sky');
    }
    assert(Math.abs(rainy / spells - 0.12) < 0.015, `about one spell in eight rains (${(rainy / spells).toFixed(3)})`);
    const mean = strengths / rainy;
    assert(mean > 0.55 && mean < 0.8, `some showers are light, some heavy (mean ${mean.toFixed(2)})`);
    assert(FAIR_WEATHER.rain === 0 && weatherAt(NaN).rain === 0, 'fair weather, and no clock, is dry');
    assert(weatherOfCover(1).rain === 0 && weatherOfCover(1, 0.6).rain === 0.6 && weatherOfCover(1, 7).rain === 1,
        'a weather is as wet as it is given, and no wetter than a downpour');
    console.log(`✓ about one spell in eight rains (${rainy} of ${spells}), only ever from an overcast sky`);
}

// Rain waits for the clouds to gather, and stops before they clear: as a
// spell changes it never rains under a sky that isn't overcast; and it comes
// and goes gradually.
{
    let checked = 0;
    let steepest = 0;
    for (let spell = FIRST; spell < FIRST + 3000; spell++) {
        if (spellRain(spell) === spellRain(spell + 1)) continue;
        checked++;
        const start = (spell + 1) * WEATHER_SPELL_SECONDS - WEATHER_CHANGE_SECONDS;
        let previous = weatherAt(start);
        // What falls: rain, or in winter snow (core/Season.js).
        const falls = (weather) => weather.rain + weather.snow;
        for (let t = start; t <= start + WEATHER_CHANGE_SECONDS; t += 2) {
            const now = weatherAt(t);
            if (falls(now) > 0) assert(now.overcast > 0.5, `it rains only under a gathered sky (rain ${falls(now).toFixed(2)}, overcast ${now.overcast.toFixed(2)})`);
            steepest = Math.max(steepest, Math.abs(falls(now) - falls(previous)));
            previous = now;
        }
        assert(Math.abs(falls(previous) - spellRain(spell + 1)) < 1e-9, 'by the end of the change it rains as the next spell does');
    }
    assert(checked > 100, `rain came or went often enough to check (${checked})`);
    // 2 seconds of the steepest part of a smoothstep over RAIN_CHANGE_SHARE of the change.
    assert(steepest < 1.5 * 2 / (WEATHER_CHANGE_SECONDS * RAIN_CHANGE_SHARE) + 1e-9, `rain comes and goes gradually (${steepest.toFixed(4)} in 2 s)`);
    console.log(`✓ rain waits for the clouds and stops before they clear (${checked} changes)`);
}

// Heard wherever you stand; birds and insects mostly fall quiet.
{
    const dry = ambientMixAt(DEFAULT_WORLD_SEED, 10, -20);
    assert(dry[AMBIENT_LAYER.RAIN] === 0, 'a place on its own is dry');
    assert(ambientMixInRain(dry, 0) === dry && ambientMixInRain(dry, NaN) === dry, 'no rain, the same mix');
    const wet = ambientMixInRain(dry, 0.8);
    assert(wet[AMBIENT_LAYER.RAIN] === 0.8, 'rain is heard as hard as it falls');
    assert(wet[AMBIENT_LAYER.BIRDS] <= dry[AMBIENT_LAYER.BIRDS] * 0.35 && wet[AMBIENT_LAYER.INSECTS] <= dry[AMBIENT_LAYER.INSECTS] * 0.4,
        'birds and insects mostly fall quiet');
    assert(wet[AMBIENT_LAYER.WIND] === dry[AMBIENT_LAYER.WIND] && wet[AMBIENT_LAYER.WATER] === dry[AMBIENT_LAYER.WATER], 'the land itself sounds the same');
    console.log('✓ rain is heard wherever you stand, and quietens birds and insects');
}

// The soundscape follows the rain as it starts and stops.
{
    const levels = [];
    const provider = {
        setLayerLevels: (l) => levels.push(l), setVolume() {}, setMuted() {}, setMusicMood() {}, resume() {}, dispose() {}
    };
    const weather = { rain: 0 };
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => ({ x: 10, y: 0, z: -20 }),
        seed: DEFAULT_WORLD_SEED,
        rainLevel: () => weather.rain,
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    service.sample();
    assert(levels[levels.length - 1][AMBIENT_LAYER.RAIN] === 0, 'dry, no rain is heard');
    const before = levels.length;
    weather.rain = 0.02;
    service.sample();
    assert(levels.length === before + 1 && levels[levels.length - 1][AMBIENT_LAYER.RAIN] === 0.02, 'the first drops are heard at once');
    weather.rain = 0.04;
    service.sample();
    assert(levels.length === before + 1, 'a tiny change in the rain is not resampled');
    weather.rain = 0.9;
    service.sample();
    assert(levels[levels.length - 1][AMBIENT_LAYER.RAIN] === 0.9, 'a downpour is heard');
    weather.rain = 0;
    service.sample();
    assert(levels[levels.length - 1][AMBIENT_LAYER.RAIN] === 0, 'and when it stops, it is quiet again');
    service.dispose();
    console.log('✓ the soundscape follows the rain');
}

// The session's weather is dry while Always day is on, whatever the clock.
{
    let rainy = null;
    for (let spell = FIRST; spell < FIRST + 1000 && rainy === null; spell++) {
        if (spellRain(spell) > 0.5) rainy = spell * WEATHER_SPELL_SECONDS + WEATHER_SPELL_SECONDS / 4;
    }
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => rainy });
    assert(nav.weather().rain === weatherAt(rainy).rain && nav.weather().rain > 0.5, 'the session rains when the world does');
    nav.setAlwaysDay(true);
    assert(nav.weather().rain === 0, 'Always day keeps it dry');
    console.log('✓ the session rains with the world, and Always day keeps it dry');
}
