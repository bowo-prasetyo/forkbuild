import {
    FAIR_WEATHER, WEATHER_SPELL_SECONDS, WEATHER_CHANGE_SECONDS, weatherAt, weatherOfCover, spellCover, overcastLook
} from '../core/nature/Weather.js';
import { DAY, NIGHT, DAY_CYCLE_SECONDS, skyLookAtFraction } from '../core/nature/DayCycle.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { assert } from './support/Assert.js';

// World View's weather (core/nature/Weather.js): clouds come and go by the clock
// alone, so everyone sees the same sky; overcast greys the sky and softens
// its light without ever making it too dark to see; and Always day keeps it
// fair.

const brightness = (look) => look.hemisphereIntensity + look.sunIntensity;
const saturation = (color) => {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return Math.max(r, g, b) - Math.min(r, g, b);
};

// A moment well inside a spell of each kind, from today on.
function spellTime(test) {
    const first = Math.floor(1_800_000_000 / WEATHER_SPELL_SECONDS);
    for (let spell = first; spell < first + 1000; spell++) {
        if (test(spellCover(spell))) return spell * WEATHER_SPELL_SECONDS + WEATHER_SPELL_SECONDS / 4;
    }
    throw new Error('no such spell');
}

// The same moment gives everyone the same weather; no clock is fair.
{
    const t = 1_800_000_123.25;
    assert(JSON.stringify(weatherAt(t)) === JSON.stringify(weatherAt(t)), 'everyone asking at the same moment sees the same weather');
    assert(weatherAt(NaN) === FAIR_WEATHER && weatherAt(undefined) === FAIR_WEATHER, 'no clock is fair weather');
    assert(FAIR_WEATHER.cloudCover === 0 && FAIR_WEATHER.overcast === 0, 'fair weather has a clear sky');
    console.log('✓ the weather comes from the clock alone');
}

// Mostly fair, sometimes cloudy, now and then overcast; each spell holds,
// and changes into the next gradually.
{
    let fair = 0;
    let cloudy = 0;
    let overcast = 0;
    const spells = 20000;
    const first = Math.floor(1_800_000_000 / WEATHER_SPELL_SECONDS);
    for (let spell = first; spell < first + spells; spell++) {
        const cover = spellCover(spell);
        assert(cover >= 0 && cover <= 1, 'cover is a share of the sky');
        if (cover < 0.3) fair++;
        else if (cover < 0.7) cloudy++;
        else overcast++;
    }
    assert(Math.abs(fair / spells - 0.6) < 0.02, `about three spells in five are fair (${(fair / spells).toFixed(3)})`);
    assert(Math.abs(cloudy / spells - 0.25) < 0.02, `one in four cloudy (${(cloudy / spells).toFixed(3)})`);
    assert(Math.abs(overcast / spells - 0.15) < 0.02, `and about one in seven overcast (${(overcast / spells).toFixed(3)})`);

    const start = first * WEATHER_SPELL_SECONDS;
    let previous = weatherAt(start);
    let steepest = 0;
    for (let t = start; t < start + 200 * WEATHER_SPELL_SECONDS; t += 5) {
        const now = weatherAt(t);
        steepest = Math.max(steepest, Math.abs(now.cloudCover - previous.cloudCover));
        previous = now;
    }
    // 5 seconds of the steepest part of a smoothstep over WEATHER_CHANGE_SECONDS.
    assert(steepest < 1.5 * 5 / WEATHER_CHANGE_SECONDS + 1e-9, `clouds gather and clear gradually (${steepest.toFixed(4)} in 5 s)`);
    const spell = first + 7;
    const held = spell * WEATHER_SPELL_SECONDS;
    assert(weatherAt(held + 1).cloudCover === spellCover(spell)
        && weatherAt(held + WEATHER_SPELL_SECONDS - WEATHER_CHANGE_SECONDS).cloudCover === spellCover(spell),
    'a spell holds its weather until it starts to change');
    assert(Math.abs(weatherAt(held + WEATHER_SPELL_SECONDS).cloudCover - spellCover(spell + 1)) < 1e-12, 'and has become the next by its end');
    console.log(`✓ mostly fair (${fair}), sometimes cloudy (${cloudy}), now and then overcast (${overcast}), changing gradually`);
}

// Overcast: grey sky, dimmer and paler sun, more fill; never darker than a
// clear night, and a clear sky looks just as it did.
{
    assert(weatherOfCover(0.2).overcast === 0 && weatherOfCover(0.5).overcast === 0, 'fair and cloudy skies are not overcast');
    assert(weatherOfCover(0.95).overcast === 1 && weatherOfCover(0.7).overcast > 0, 'an overcast sky is');
    assert(overcastLook(DAY, 0) === DAY && overcastLook(NIGHT, 0) === NIGHT, 'no overcast, the look is unchanged');
    const grey = overcastLook(DAY, 1);
    assert(saturation(grey.sky) < saturation(DAY.sky) * 0.3, 'an overcast sky is grey');
    assert(grey.sunIntensity < DAY.sunIntensity * 0.5 && grey.hemisphereIntensity > DAY.hemisphereIntensity, 'its sun dims and the cloud spreads some of it back');
    assert(saturation(grey.sunColor) <= saturation(DAY.sunColor), 'and the sunlight is pale');
    assert(grey.glow === DAY.glow, 'lamps don\'t light up for clouds');
    assert(overcastLook(DAY, 1) === grey, 'a sky that holds hands over the same look');
    for (let i = 0; i <= 200; i++) {
        const look = skyLookAtFraction(i / 200);
        for (const o of [0.25, 0.5, 1]) {
            const dull = overcastLook(look, o);
            assert(brightness(dull) >= brightness(NIGHT) - 1e-9, `overcast never makes it darker than a clear night (at ${i / 200}, ${o})`);
            assert(dull.sunIntensity >= Math.min(look.sunIntensity, NIGHT.sunIntensity) - 1e-9, 'nor dims the light below the moon\'s');
            assert(brightness(dull) <= brightness(look) + 1e-9, 'it only ever dulls the light');
        }
    }
    console.log('✓ overcast greys the sky and softens its light, never below a clear night');
}

// The session hands World View the weather and the overcast sky with it, and
// Always day keeps it fair.
{
    const overcastNoon = spellTime((cover) => cover > 0.95);
    // The same time of day, on the same day, as a midday.
    const noon = overcastNoon - (overcastNoon % DAY_CYCLE_SECONDS) + 0.3 * DAY_CYCLE_SECONDS;
    const clock = { now: overcastNoon };
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => clock.now });
    const weathers = [];
    const looks = [];
    const frames = new Set();
    nav._session = {
        setSkyLook: (look) => looks.push(look),
        setSkyBodies() {},
        setWeather: (weather) => weathers.push(weather),
        onAnimationFrame: (callback) => {
            frames.add(callback);
            return () => frames.delete(callback);
        }
    };
    nav._setupDayCycle();
    assert(weathers.length === 1 && weathers[0].overcast === 1, 'opening World View under cloud shows the cloud');
    assert(looks[0].sunIntensity < looks[0].hemisphereIntensity + 1 && saturation(looks[0].sky) < 60, 'and the grey sky with it');
    clock.now = noon;
    for (const frame of frames) frame(1 / 60);
    assert(weathers.length === 2, 'each frame follows the weather');
    nav.setAlwaysDay(true);
    assert(weathers[weathers.length - 1] === FAIR_WEATHER && looks[looks.length - 1] === DAY && nav.weather() === FAIR_WEATHER,
        'Always day keeps the weather fair');
    clock.now = overcastNoon;
    for (const frame of frames) frame(1 / 60);
    assert(weathers[weathers.length - 1] === FAIR_WEATHER && looks[looks.length - 1] === DAY, 'whatever the clock');
    nav.setAlwaysDay(false);
    assert(weathers[weathers.length - 1].overcast === 1, 'turning it off brings the world\'s own weather back');
    nav._session.dispose = () => {};
    nav.dispose();

    // A render facade that can't draw clouds is never asked to.
    const noClouds = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => overcastNoon });
    noClouds._session = { onAnimationFrame: () => () => {}, setSkyLook() {} };
    noClouds._setupDayCycle();
    console.log('✓ World View follows the weather, and Always day keeps it fair');
}
