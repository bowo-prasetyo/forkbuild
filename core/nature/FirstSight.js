import { DAY, DAY_SKY_BODIES, blendLooks } from './DayCycle.js';
import { weatherOfCover } from './Weather.js';

// A visitor's first sight of the World (docs/Pillars.md, "The World is a
// diorama, not a simulation"): the first World View visit of a page opens in
// fair late-morning light, Always day's sky, whatever the shared clock says,
// then catches up with it. More than half of first visits used to arrive at
// dusk, at night or under cloud (docs/reviews/CreativeDirection-2026-10-22.md,
// finding 4), and a first impression is the one the game is judged by.
//
// For FIRST_SIGHT_HOLD_SECONDS the sky is the fair morning; over the next
// FIRST_SIGHT_BLEND_SECONDS it eases into the shared one: the light and the
// weather blend, the sun and the moon slide where both are up and otherwise
// come or go halfway. A visitor walks alone until a friend arrives, and then
// both are on the shared clock (application/worldNavigation/dayCycleMethods.js).
//
// Pure: how much of the fair morning shows `elapsed` seconds in (1 all of
// it, 0 none), and the sky, weather and sun and moon that weight gives.

export const FIRST_SIGHT_HOLD_SECONDS = 60;
export const FIRST_SIGHT_BLEND_SECONDS = 60;

// How much of the fair morning shows `elapsed` seconds after the visit
// began: 1 while it holds, easing down to 0, and 0 from then on.
export function firstSightWeight(elapsed) {
    if (!Number.isFinite(elapsed) || elapsed <= FIRST_SIGHT_HOLD_SECONDS) return 1;
    const t = (elapsed - FIRST_SIGHT_HOLD_SECONDS) / FIRST_SIGHT_BLEND_SECONDS;
    if (t >= 1) return 0;
    return 1 - t * t * (3 - 2 * t);
}

// The shared sky's `look` with `weight` of the fair morning's (DAY) in it.
export function firstSightLook(look, weight) {
    return blendLooks(look, DAY, clamp01(weight));
}

// The shared `weather` with `weight` of `fair` (core/nature/Weather.js's
// fairWeatherIn() for the season) in it.
export function firstSightWeather(weather, fair, weight) {
    const w = clamp01(weight);
    if (w <= 0 || !fair) return weather;
    if (w >= 1 || !weather) return fair;
    const mix = (key) => lerp(weather[key] || 0, fair[key] || 0, w);
    return weatherOfCover(mix('cloudCover'), mix('rain'), mix('wetness'), mix('snow'), mix('snowCover'));
}

// The shared sun and moon (`bodies`, core/nature/DayCycle.js's skyBodiesAt())
// with `weight` of the fair morning's (DAY_SKY_BODIES) in them: the light
// swings between the two, a sun or moon up in both slides between them, and
// one up in only one is shown while that one holds the larger share.
export function firstSightBodies(bodies, weight) {
    const w = clamp01(weight);
    if (w <= 0 || !bodies) return bodies;
    if (w >= 1) return DAY_SKY_BODIES;
    const day = DAY_SKY_BODIES;
    const shown = w >= 0.5 ? day : bodies;
    return Object.freeze({
        ...shown,
        sun: slide(bodies.sun, day.sun, w),
        moon: slide(bodies.moon, day.moon, w),
        light: slide(bodies.light, day.light, w),
        lightStrength: lerp(bodies.lightStrength ?? 1, day.lightStrength ?? 1, w)
    });
}

function slide(from, to, w) {
    if (from && to) {
        const x = lerp(from.x, to.x, w);
        const y = lerp(from.y, to.y, w);
        const z = lerp(from.z, to.z, w);
        const length = Math.hypot(x, y, z) || 1;
        return Object.freeze({ x: x / length, y: y / length, z: z / length });
    }
    return w >= 0.5 ? to : from;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp01(value) {
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}
