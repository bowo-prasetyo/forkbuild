import {
    STORM_FROM, STRIKE_SLOT_SECONDS, STRIKE_WINDOW_SECONDS, THUNDER_DELAY, FLASH_SECONDS,
    storminessAt, strikeInSlot, lightningAt, lightningLook, thunderBetween
} from '../core/Storms.js';
import { WEATHER_SPELL_SECONDS, overcastLook, rainAt, spellRain, weatherAt } from '../core/Weather.js';
import { DAY, NIGHT, moonPhaseAt, moonlitLook, skyLookAt } from '../core/DayCycle.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// Gentle storms (core/Storms.js): only the heaviest downpours storm; lightning
// is rare, soft and never flickers; thunder follows each flash once, a few
// seconds later; everyone sees and hears the same; Always day has none, and a
// device asking for reduced motion sees no flashes.

const FIRST_SPELL = Math.floor(1_800_000_000 / WEATHER_SPELL_SECONDS);
const SPELLS = 4000;
const FROM = FIRST_SPELL * WEATHER_SPELL_SECONDS;
const TO = (FIRST_SPELL + SPELLS) * WEATHER_SPELL_SECONDS;

const strikes = [];
for (let slot = Math.floor(FROM / STRIKE_SLOT_SECONDS); slot < Math.floor(TO / STRIKE_SLOT_SECONDS); slot++) {
    const strike = strikeInSlot(slot);
    if (strike) strikes.push(strike);
}

// Only the heaviest downpours storm.
{
    assert(strikes.length > 100, `storms strike (${strikes.length} times in ${SPELLS} spells)`);
    for (const strike of strikes) {
        assert(rainAt(strike.at) > STORM_FROM, 'lightning only strikes in a heavy downpour');
    }
    let stormySpells = 0;
    let rainySpells = 0;
    for (let spell = FIRST_SPELL; spell < FIRST_SPELL + SPELLS; spell++) {
        if (spellRain(spell) > 0) rainySpells++;
        if (spellRain(spell) > STORM_FROM) stormySpells++;
    }
    assert(stormySpells > 0 && stormySpells < rainySpells * 0.5, `only the heaviest showers storm (${stormySpells} of ${rainySpells})`);
    assert(storminessAt(NaN) === 0 && lightningAt(NaN) === 0 && thunderBetween(NaN, 5).length === 0, 'no clock, no storm');
    console.log(`✓ only the heaviest downpours storm (${stormySpells} of ${rainySpells} rainy spells)`);
}

// Rare, soft, never flickering: strikes at least 20 s apart, about one in 75
// s at the height of a storm; a flash is at most two soft pulses within half
// a second, never full brightness at once.
{
    let closest = Infinity;
    for (let i = 1; i < strikes.length; i++) closest = Math.min(closest, strikes[i].at - strikes[i - 1].at);
    assert(closest >= STRIKE_SLOT_SECONDS - STRIKE_WINDOW_SECONDS - 1e-6, `strikes are at least 20 s apart (${closest.toFixed(1)} s)`);

    let fullStormSeconds = 0;
    let fullStormStrikes = 0;
    for (let slot = Math.floor(FROM / STRIKE_SLOT_SECONDS); slot < Math.floor(TO / STRIKE_SLOT_SECONDS); slot++) {
        if (storminessAt(slot * STRIKE_SLOT_SECONDS) < 0.999 || storminessAt((slot + 1) * STRIKE_SLOT_SECONDS) < 0.999) continue;
        fullStormSeconds += STRIKE_SLOT_SECONDS;
        if (strikeInSlot(slot)) fullStormStrikes++;
    }
    const every = fullStormSeconds / fullStormStrikes;
    assert(every > 55 && every < 100, `at the height of a storm, a strike about every 75 s (${every.toFixed(0)} s)`);

    for (const strike of strikes.slice(0, 40)) {
        let rises = 0;
        let previous = 0;
        let rising = false;
        let peak = 0;
        let steepest = 0;
        for (let t = strike.at - 0.1; t < strike.at + FLASH_SECONDS + 0.2; t += 0.005) {
            const now = lightningAt(t);
            if (now > previous + 1e-9 && !rising) rises++;
            rising = now > previous + 1e-9;
            steepest = Math.max(steepest, now - previous);
            peak = Math.max(peak, now);
            previous = now;
        }
        assert(rises <= 2, `a flash is at most two pulses (${rises})`);
        assert(peak > 0.3 && peak <= 1, `it lights the sky (${peak.toFixed(2)})`);
        assert(steepest < 0.25, `softly, never all at once (${steepest.toFixed(2)} in 5 ms)`);
        assert(lightningAt(strike.at + FLASH_SECONDS + 0.01) === 0, 'and is over within half a second');
    }
    console.log(`✓ lightning is rare (every ${every.toFixed(0)} s at most, ${closest.toFixed(0)} s apart at least), soft, at most two pulses`);
}

// The flash lifts the sky part of the way, never to white.
{
    assert(lightningLook(NIGHT, 0) === NIGHT, 'no flash, the same sky');
    for (const look of [DAY, NIGHT]) {
        const lit = lightningLook(look, 1);
        const channels = [(lit.sky >> 16) & 0xff, (lit.sky >> 8) & 0xff, lit.sky & 0xff];
        assert(channels.every((c) => c < 250), 'never white');
        assert(lit.hemisphereIntensity > look.hemisphereIntensity && lit.hemisphereIntensity <= look.hemisphereIntensity + 0.6 + 1e-9,
            'the light from above lifts, gently');
        assert(lit.glow === look.glow && lit.sunIntensity === look.sunIntensity, 'and nothing else changes');
    }
    console.log('✓ a flash lifts the sky part of the way, never to white');
}

// Thunder follows each flash once, 2.5 to 7 s later, quieter the further off;
// however the time is cut into samples.
{
    const window = [strikes[0].at - 1, strikes[0].at + 55];
    const all = thunderBetween(window[0], window[1]);
    const inWindow = strikes.filter((s) => s.at + s.delay > window[0] && s.at + s.delay <= window[1]);
    assert(all.length === inWindow.length && all.length > 0, `each strike is heard once (${all.length})`);
    let pieces = [];
    for (let t = window[0]; t < window[1]; t += 0.25) pieces = pieces.concat(thunderBetween(t, Math.min(t + 0.25, window[1])));
    assert(JSON.stringify(pieces) === JSON.stringify(all), 'cut into samples, the same thunder, each once');
    for (const strike of strikes) {
        assert(strike.delay >= THUNDER_DELAY.from && strike.delay <= THUNDER_DELAY.to, 'thunder comes 2.5 to 7 s after the flash');
    }
    const near = strikes.reduce((a, b) => (a.distance < b.distance ? a : b));
    const far = strikes.reduce((a, b) => (a.distance > b.distance ? a : b));
    assert(near.delay < far.delay && near.loudness > far.loudness && near.brightness > far.brightness,
        'a nearer strike flashes brighter, and its thunder comes sooner and louder');
    assert(thunderBetween(window[0], window[0] + 10 * 3600).length <= 2, 'a long gap (a hidden tab coming back) hears only the latest');
    console.log('✓ thunder follows each flash once, a few seconds later');
}

// The session: the sky flashes, unless the device asks for no flashes or
// Always day is on; and the soundscape hears each thunder once.
{
    const strike = strikes.find((s) => s.distance < 0.5);
    const clock = { now: strike.at + 0.04 };
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    const lit = nav.skyLook();
    const unlit = overcastLook(moonlitLook(skyLookAt(clock.now), moonPhaseAt(clock.now)), weatherAt(clock.now).overcast);
    assert(lit.hemisphereIntensity > unlit.hemisphereIntensity, 'the sky flashes when lightning strikes');
    nav.setNoFlashes(true);
    assert(nav.skyLook().hemisphereIntensity === unlit.hemisphereIntensity, 'asking for reduced motion, it doesn\'t flash');
    assert(nav.thunderBetween(strike.at, strike.at + 10).length === 1, 'but the thunder is still heard');
    nav.setNoFlashes(false);
    nav.setAlwaysDay(true);
    assert(nav.skyLook() === DAY && nav.thunderBetween(strike.at, strike.at + 10).length === 0, 'Always day has no storms');
    nav.setAlwaysDay(false);
    assert(nav.weatherClock() === clock.now, 'the weather\'s clock is the world\'s');

    const played = [];
    const provider = {
        setLayerLevels() {}, setVolume() {}, setMuted() {}, setMusicMood() {}, resume() {}, dispose() {},
        playThunder: (thunder) => played.push(thunder)
    };
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => ({ x: 10, y: 0, z: -20 }),
        seed: DEFAULT_WORLD_SEED,
        weatherClock: () => nav.weatherClock(),
        thunderBetween: (from, to) => nav.thunderBetween(from, to),
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    for (let t = strike.at - 1; t < strike.at + 10; t += 0.25) {
        clock.now = t;
        service.sample();
    }
    assert(played.length === 1 && Math.abs(played[0].loudness - strike.loudness) < 1e-12, `the soundscape plays the thunder once (${played.length})`);
    service.dispose();
    console.log('✓ the session flashes the sky and the soundscape hears the thunder, unless asked not to');
}
