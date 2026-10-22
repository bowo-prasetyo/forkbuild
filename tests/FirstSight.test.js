import { DAY, DAY_CYCLE_SECONDS, DAY_SKY_BODIES, NIGHT, skyBodiesAt, skyLookAt } from '../core/nature/DayCycle.js';
import { fairWeatherIn, rainAt, weatherAt } from '../core/nature/Weather.js';
import { thunderBetween } from '../core/nature/Storms.js';
import {
    FIRST_SIGHT_BLEND_SECONDS, FIRST_SIGHT_HOLD_SECONDS, firstSightBodies, firstSightLook, firstSightWeather, firstSightWeight
} from '../core/nature/FirstSight.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { assert } from './support/Assert.js';

// A visitor's first sight (core/nature/FirstSight.js; docs/Pillars.md, "The World
// is a diorama, not a simulation"): the first World View visit of a page
// opens in fair morning light whatever the shared clock says, eases into the
// shared sky over its first two minutes, and ends at once when someone else
// is here.

const brightness = (look) => look.hemisphereIntensity + look.sunIntensity;
// Deep in the night: a little past the middle of its full-night stretch.
const NIGHT_TIME = DAY_CYCLE_SECONDS * 400 + DAY_CYCLE_SECONDS * 0.82;
// A moment it rains, searched for on the world's own clock.
function rainyTime() {
    for (let t = DAY_CYCLE_SECONDS * 400; t < DAY_CYCLE_SECONDS * 2000; t += 37) {
        if (rainAt(t) > 0.5) return t;
    }
    throw new Error('no rain found');
}

// How much of the fair morning shows, over time.
{
    assert(firstSightWeight(0) === 1 && firstSightWeight(FIRST_SIGHT_HOLD_SECONDS) === 1, 'it holds the fair morning for its first minute');
    const mid = firstSightWeight(FIRST_SIGHT_HOLD_SECONDS + FIRST_SIGHT_BLEND_SECONDS / 2);
    assert(Math.abs(mid - 0.5) < 1e-9, `then eases away, halfway through at half (${mid})`);
    assert(firstSightWeight(FIRST_SIGHT_HOLD_SECONDS + FIRST_SIGHT_BLEND_SECONDS) === 0 && firstSightWeight(1e6) === 0, 'and is gone after two minutes');
    let last = 1;
    for (let s = 0; s <= FIRST_SIGHT_HOLD_SECONDS + FIRST_SIGHT_BLEND_SECONDS; s += 1) {
        const w = firstSightWeight(s);
        assert(w <= last + 1e-12, `never coming back once it eases (${s} s)`);
        last = w;
    }
    assert(firstSightWeight(-5) === 1 && firstSightWeight(NaN) === 1, 'read leniently');
    console.log('✓ the fair morning holds a minute, then eases away over the next');
}

// The sky, the weather and the sun and moon at a given weight.
{
    const night = skyLookAt(NIGHT_TIME);
    assert(firstSightLook(night, 1) === DAY, 'all of the fair morning is Always day\'s sky');
    assert(firstSightLook(night, 0) === night, 'none of it, the shared sky');
    const half = firstSightLook(night, 0.5);
    assert(brightness(half) < brightness(DAY) && brightness(half) > brightness(NIGHT), 'halfway, between the two');

    const rain = weatherAt(rainyTime());
    const fair = fairWeatherIn(null);
    assert(firstSightWeather(rain, fair, 1) === fair && firstSightWeather(rain, fair, 0) === rain, 'fair weather, then the shared weather');
    const easing = firstSightWeather(rain, fair, 0.5);
    assert(easing.rain > 0 && easing.rain < rain.rain && easing.cloudCover < rain.cloudCover, `halfway, the rain and cloud come in (${easing.rain.toFixed(2)})`);

    const nightBodies = skyBodiesAt(NIGHT_TIME);
    assert(nightBodies.sun === null && nightBodies.moon, 'sanity: at night the moon is up and the sun is not');
    assert(firstSightBodies(nightBodies, 1) === DAY_SKY_BODIES && firstSightBodies(nightBodies, 0) === nightBodies, 'the morning sun, then the night\'s moon');
    const early = firstSightBodies(nightBodies, 0.7);
    const late = firstSightBodies(nightBodies, 0.3);
    assert(early.sun && !early.moon && !late.sun && late.moon, 'the sun goes and the moon comes at halfway, rather than both at once');
    assert(Math.abs(Math.hypot(early.light.x, early.light.y, early.light.z) - 1) < 1e-9, 'the light swings between them, a direction still');
    const afternoon = skyBodiesAt(DAY_CYCLE_SECONDS * 400 + DAY_CYCLE_SECONDS * 0.4);
    const sliding = firstSightBodies(afternoon, 0.5);
    assert(sliding.sun && sliding.sun.x !== afternoon.sun.x && sliding.sun.x !== DAY_SKY_BODIES.sun.x, 'a sun up in both slides across, never jumps');
    console.log('✓ the sky, the weather, the sun and the moon ease from the fair morning into the shared ones');
}

// In the session: the first visit's sky, its end, and someone else arriving.
{
    let now = NIGHT_TIME;
    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => now });
    assert(nav.skyLook() !== DAY && nav.nightLevel() > 0.5, 'with no first sight, the night is the shared night');
    nav.startFirstSight();
    assert(nav.isFirstSight() && nav.skyLook() === DAY && nav.nightLevel() === 0, 'a first visit at night opens in the fair morning, lamps unlit');
    assert(nav.skyBodies() === DAY_SKY_BODIES, 'with the morning sun');
    now += FIRST_SIGHT_HOLD_SECONDS + FIRST_SIGHT_BLEND_SECONDS / 2;
    const easing = nav.skyLook();
    assert(easing !== DAY && brightness(easing) < brightness(DAY) && nav.isFirstSight(), 'after a minute and a half it is easing into the night');
    now += FIRST_SIGHT_BLEND_SECONDS;
    assert(!nav.isFirstSight() && nav.skyLook() !== DAY && nav.nightLevel() > 0.5, 'after two minutes, the shared night');
    now += DAY_CYCLE_SECONDS;
    assert(!nav.isFirstSight(), 'and it never comes back by itself');

    const rainy = rainyTime();
    now = rainy;
    nav.startFirstSight();
    assert(nav.weather().rain === 0, 'no rain in the first minute');
    const storm = thunderBetween(rainy - DAY_CYCLE_SECONDS * 100, rainy + DAY_CYCLE_SECONDS * 100)[0];
    if (storm) {
        now = storm.at;
        nav.startFirstSight();
        assert(nav.thunderBetween(storm.at - 1, storm.at + 1).length === 0, 'and no thunder');
    }

    now = NIGHT_TIME;
    nav.startFirstSight();
    nav.getKnownRemoteAvatarCount = () => 1;
    assert(!nav.isFirstSight() && nav.skyLook() !== DAY, 'someone else here: the shared sky at once, so friends see the same');
    nav.getKnownRemoteAvatarCount = () => 0;
    assert(!nav.isFirstSight(), 'and it stays shared after they go');

    nav.startFirstSight();
    nav.setAlwaysDay(true);
    assert(nav.skyLook() === DAY, 'Always day is day, first sight or not');
    console.log('✓ the first visit opens in the fair morning, eases into the shared sky, and shares it the moment a friend is here');
}

console.log('✅ All first sight tests passed.');
