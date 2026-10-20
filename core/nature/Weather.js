// World View's weather: how cloudy the sky is at a moment, how hard it is
// raining or snowing, and how much snow lies. Worked out from
// the clock alone, as the day and night are (core/nature/DayCycle.js), so everyone
// at a build sees the same clouds with nothing sent or stored, and it is the
// same weather all over the world: friends walking together always share it.
//
// Time is cut into spells of WEATHER_SPELL_SECONDS, each with its own cloud
// cover drawn from a hash of its number: over the year about three spells in
// five fair, with a few clouds; one in four cloudy; and about one in seven
// overcast. Most overcast spells rain (spellRain()): about one spell in
// eight. The season (core/nature/Season.js) shifts the shares: summer is sunnier,
// spring, autumn and winter cloudier; a world year is a whole number of
// spells, so a spell never straddles two seasons. In winter what falls is
// snow (snowAt(), core/nature/Season.js#snowShareAt()), and it lies
// (snowCoverAt()) until it melts. Over the
// last WEATHER_CHANGE_SECONDS of a spell the cover blends into the next
// one's, so clouds gather and clear rather than switching; rain comes in over
// the last RAIN_CHANGE_SHARE of that, once the clouds have gathered, and stops
// over the first, before they clear.
//
// Overcast greys the sky and softens its light (overcastLook()), never below
// what a clear NIGHT gives, so builds stay readable in any weather.

import { NIGHT } from './DayCycle.js';
import { SEASON, SEASONS, SEASON_SECONDS, WORLD_YEAR_SECONDS, snowShareAt } from './Season.js';

export const WEATHER_SPELL_SECONDS = 8 * 60;
export const WEATHER_CHANGE_SECONDS = 2 * 60;

// The share of spells of each kind in each season (the rest overcast), and
// the share of overcast spells that rain or snow: over the year, 0.6 fair,
// 0.25 cloudy and 0.15 overcast, as before there were seasons.
const SPELL_SHARES = Object.freeze({
    [SEASON.SPRING]: Object.freeze({ fair: 0.55, cloudy: 0.27, falls: 0.8 }),
    [SEASON.SUMMER]: Object.freeze({ fair: 0.72, cloudy: 0.2, falls: 0.75 }),
    [SEASON.AUTUMN]: Object.freeze({ fair: 0.58, cloudy: 0.26, falls: 0.8 }),
    [SEASON.WINTER]: Object.freeze({ fair: 0.55, cloudy: 0.27, falls: 0.9 })
});
const FAIR_COVER = Object.freeze({ from: 0.06, to: 0.22 });
const CLOUDY_COVER = Object.freeze({ from: 0.38, to: 0.62 });
const OVERCAST_COVER = Object.freeze({ from: 0.88, to: 1 });
// How hard an overcast spell rains (or snows), 0 to 1.
const RAIN_STRENGTH = Object.freeze({ from: 0.35, to: 1 });
// The share of a change rain takes to start or stop.
export const RAIN_CHANGE_SHARE = 0.25;

// Where, in cloud cover, the sky starts to turn overcast and where it is
// fully so.
const OVERCAST_FROM = 0.55;
const OVERCAST_FULL = 0.88;

// cloudCover: how much of the sky the clouds hide, 0 to 1. overcast: how far
// the sky and its light have turned grey, 0 to 1. rain: how hard it rains, 0
// (dry) to 1 (a downpour). wetness: how wet the ground is (wetnessAt()), 0
// (dry) to 1 (soaked). snow: how hard it snows, 0 to 1 (a blizzard).
// snowCover: how much snow lies (snowCoverAt()), 0 (none) to 1 (a blanket).
export const FAIR_WEATHER = Object.freeze({ cloudCover: 0, overcast: 0, rain: 0, wetness: 0, snow: 0, snowCover: 0 });

// The weather at `seconds` (Unix time): a frozen object shaped like
// FAIR_WEATHER. With no clock, fair.
export function weatherAt(seconds) {
    if (!Number.isFinite(seconds)) {
        return FAIR_WEATHER;
    }
    const spell = Math.floor(seconds / WEATHER_SPELL_SECONDS);
    const into = seconds - spell * WEATHER_SPELL_SECONDS;
    let cover = spellCover(spell);
    const changing = into - (WEATHER_SPELL_SECONDS - WEATHER_CHANGE_SECONDS);
    if (changing > 0) {
        cover += (spellCover(spell + 1) - cover) * smooth01(changing / WEATHER_CHANGE_SECONDS);
    }
    return weatherOfCover(cover, rainAt(seconds), wetnessAt(seconds), snowAt(seconds), snowCoverAt(seconds));
}

// How hard it rains at `seconds`: what falls (precipitationAt()), as far as
// it isn't snow.
export function rainAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    return precipitationAt(seconds) * (1 - snowShareAt(seconds, WEATHER_CHANGE_SECONDS));
}

// How hard it snows at `seconds`: what falls, as far as it is snow.
export function snowAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    return precipitationAt(seconds) * snowShareAt(seconds, WEATHER_CHANGE_SECONDS);
}

// How hard rain or snow falls at `seconds`: the spell's, changing into the
// next spell's over the last of it.
export function precipitationAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    const spell = Math.floor(seconds / WEATHER_SPELL_SECONDS);
    const into = seconds - spell * WEATHER_SPELL_SECONDS;
    let rain = spellRain(spell);
    const changing = into - (WEATHER_SPELL_SECONDS - WEATHER_CHANGE_SECONDS);
    if (changing > 0) {
        const t = changing / WEATHER_CHANGE_SECONDS;
        const nextRain = spellRain(spell + 1);
        // Rain waits for the clouds to gather, and stops before they clear.
        const rainT = nextRain > rain ? (t - (1 - RAIN_CHANGE_SHARE)) / RAIN_CHANGE_SHARE : t / RAIN_CHANGE_SHARE;
        rain += (nextRain - rain) * smooth01(rainT);
    }
    return rain;
}

export function weatherOfCover(cloudCover, rain = 0, wetness = 0, snow = 0, snowCover = 0) {
    const cover = clamp01(cloudCover);
    return Object.freeze({
        cloudCover: cover,
        overcast: smooth01((cover - OVERCAST_FROM) / (OVERCAST_FULL - OVERCAST_FROM)),
        rain: Number.isFinite(rain) ? clamp01(rain) : 0,
        wetness: Number.isFinite(wetness) ? clamp01(wetness) : 0,
        snow: Number.isFinite(snow) ? clamp01(snow) : 0,
        snowCover: Number.isFinite(snowCover) ? clamp01(snowCover) : 0
    });
}

// How wet the ground is at `seconds`, 0 (dry) to 1 (soaked): it soaks up
// rain quickly (WET_SECONDS, the time to close most of the way towards how
// wet the rain makes it: WET_GAIN times the rain, so even a light shower
// darkens the ground) and dries slowly once it stops (DRY_SECONDS: half dry
// in under two minutes, nearly dry in seven or eight). Worked out from the
// clock alone, like the rest of the weather, by following the rain from
// WETNESS_HISTORY_SECONDS back, in WETNESS_STEP_SECONDS steps on a grid
// fixed in time, so every device reaches the same answer; the last steps
// followed are kept, so following on from one frame to the next is cheap.
export const WET_SECONDS = 40;
export const DRY_SECONDS = 150;
export const WET_GAIN = 2.5;
const WETNESS_STEP_SECONDS = 5;
const WETNESS_HISTORY_SECONDS = 2 * WEATHER_SPELL_SECONDS;

let wetnessFollowed = null;

export function wetnessAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    // Followed from dry at the start of the spell before last: by then the
    // rain of any earlier spell has dried, near enough.
    const anchor = (Math.floor(seconds / WEATHER_SPELL_SECONDS) * WEATHER_SPELL_SECONDS) - WETNESS_HISTORY_SECONDS;
    const steps = Math.floor((seconds - anchor) / WETNESS_STEP_SECONDS);
    let step = 0;
    let wet = 0;
    if (wetnessFollowed && wetnessFollowed.anchor === anchor && wetnessFollowed.step <= steps) {
        step = wetnessFollowed.step;
        wet = wetnessFollowed.wet;
    }
    for (; step < steps; step++) {
        wet = wetnessStep(wet, rainAt(anchor + step * WETNESS_STEP_SECONDS), WETNESS_STEP_SECONDS);
    }
    wetnessFollowed = { anchor, step, wet };
    // Between two steps, part of the next.
    const partial = seconds - (anchor + steps * WETNESS_STEP_SECONDS);
    return clamp01(wetnessStep(wet, rainAt(anchor + steps * WETNESS_STEP_SECONDS), partial));
}

function wetnessStep(wet, rain, seconds) {
    const soaked = Math.min(1, rain * WET_GAIN);
    const tau = soaked > wet ? WET_SECONDS : DRY_SECONDS;
    return wet + (soaked - wet) * (1 - Math.exp(-seconds / tau));
}

// The season a whole spell falls in.
const SPELLS_PER_SEASON = SEASON_SECONDS / WEATHER_SPELL_SECONDS;
const SPELLS_PER_YEAR = WORLD_YEAR_SECONDS / WEATHER_SPELL_SECONDS;

export function spellSeason(spell) {
    const intoYear = ((spell % SPELLS_PER_YEAR) + SPELLS_PER_YEAR) % SPELLS_PER_YEAR;
    return SEASONS[Math.floor(intoYear / SPELLS_PER_SEASON)];
}

// The cloud cover a whole spell settles on.
export function spellCover(spell) {
    const shares = SPELL_SHARES[spellSeason(spell)];
    const u = hashUnit(spell);
    const v = hashUnit(spell ^ 0x5bd1e995);
    if (u < shares.fair) return lerp(FAIR_COVER.from, FAIR_COVER.to, v);
    if (u < shares.fair + shares.cloudy) return lerp(CLOUDY_COVER.from, CLOUDY_COVER.to, v);
    return lerp(OVERCAST_COVER.from, OVERCAST_COVER.to, v);
}

// How hard a whole spell rains (or snows, in winter): only ever an overcast one.
export function spellRain(spell) {
    const shares = SPELL_SHARES[spellSeason(spell)];
    if (hashUnit(spell) < shares.fair + shares.cloudy) return 0;
    if (hashUnit(spell ^ 0x1b873593) >= shares.falls) return 0;
    return lerp(RAIN_STRENGTH.from, RAIN_STRENGTH.to, hashUnit(spell ^ 0x68e31da4));
}

// How much snow lies at `seconds`, 0 (none) to 1 (a blanket): while it snows
// the cover grows towards SNOW_GAIN times the snowfall, most of the way in
// SNOW_SETTLE_SECONDS, so a steady snow whitens the ground from patches to a
// blanket in a few minutes; once it stops it melts, slowly through winter
// (WINTER_MELT_SECONDS, so it lies from one snowfall to the next) and
// quickly once it is over (THAW_SECONDS), faster still in the rain.
// Followed from the clock like the wetness, in SNOW_STEP_SECONDS steps, from
// the start of the latest winter, when none lies; outside winter and the
// hour after it, there is none.
export const SNOW_GAIN = 2;
export const SNOW_SETTLE_SECONDS = 150;
export const WINTER_MELT_SECONDS = 60 * 60;
export const THAW_SECONDS = 4 * 60;
const RAIN_MELT_SECONDS = 2 * 60;
const SNOW_STEP_SECONDS = 30;
const SNOW_AFTER_WINTER_SECONDS = 60 * 60;

let snowFollowed = null;

export function snowCoverAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    const year = Math.floor(seconds / WORLD_YEAR_SECONDS);
    const into = seconds - year * WORLD_YEAR_SECONDS;
    const winterStart = 3 * SEASON_SECONDS;
    // Snow starts at the end of autumn's last change; take winter as from then.
    const from = winterStart - WEATHER_CHANGE_SECONDS;
    let anchor;
    if (into >= from) {
        anchor = year * WORLD_YEAR_SECONDS + from;
    } else if (into < SNOW_AFTER_WINTER_SECONDS) {
        anchor = (year - 1) * WORLD_YEAR_SECONDS + from;
    } else {
        return 0;
    }
    const steps = Math.floor((seconds - anchor) / SNOW_STEP_SECONDS);
    let step = 0;
    let cover = 0;
    if (snowFollowed && snowFollowed.anchor === anchor && snowFollowed.step <= steps) {
        step = snowFollowed.step;
        cover = snowFollowed.cover;
    }
    for (; step < steps; step++) {
        cover = snowStep(cover, anchor + step * SNOW_STEP_SECONDS, SNOW_STEP_SECONDS);
    }
    snowFollowed = { anchor, step, cover };
    return clamp01(snowStep(cover, anchor + steps * SNOW_STEP_SECONDS, seconds - (anchor + steps * SNOW_STEP_SECONDS)));
}

function snowStep(cover, at, seconds) {
    if (seconds <= 0) return cover;
    const settled = Math.min(1, snowAt(at) * SNOW_GAIN);
    if (settled > cover) {
        return cover + (settled - cover) * (1 - Math.exp(-seconds / SNOW_SETTLE_SECONDS));
    }
    const rain = rainAt(at);
    const winter = snowShareAt(at, WEATHER_CHANGE_SECONDS);
    const tau = rain > 0.05 ? RAIN_MELT_SECONDS : winter > 0.5 ? WINTER_MELT_SECONDS : THAW_SECONDS;
    return cover * Math.exp(-seconds / tau);
}

// The weather `weather` (weatherAt()) as a device that keeps one season sees
// it (application/settings/WorldViewSeasonStore.js), `look` being that
// season's (core/nature/Season.js#seasonLookOf()): the clouds and what falls are
// the world's, but in a kept winter it falls as snow and the season's snow
// lies, and in any other season it falls as rain and no more snow lies than
// the season brings.
export function weatherInSeason(weather, look) {
    if (!weather || !look) return weather;
    const falls = clamp01((weather.rain || 0) + (weather.snow || 0));
    const typical = Number.isFinite(look.snowCover) ? look.snowCover : 0;
    if (look.season === SEASON.WINTER) {
        return weatherOfCover(weather.cloudCover, 0, weather.wetness, falls, Math.max(typical, weather.snowCover || 0));
    }
    return weatherOfCover(weather.cloudCover, falls, Math.max(weather.wetness || 0, Math.min(1, falls * WET_GAIN)), 0, typical);
}

// Fair weather in `look`'s season: a clear sky over whatever snow the season
// brings (for Always day).
export function fairWeatherIn(look) {
    const typical = look && Number.isFinite(look.snowCover) ? look.snowCover : 0;
    return typical > 0 ? weatherOfCover(0, 0, 0, 0, typical) : FAIR_WEATHER;
}

// `look` (shaped like core/nature/DayCycle.js's DAY) under an `overcast` sky: the
// sky turns grey, the sun's (moon's) light dims and goes pale, and the cloud
// spreads some of it back as fill from above, so shadows soften. The sun's
// light never drops below a clear NIGHT's moonlight. With no overcast the
// same look comes back, so a renderer can tell nothing changed.
const OVERCAST_SKY_GREYING = 0.8;
const OVERCAST_SKY_DIMMING = 0.92;
const OVERCAST_FILL_GREYING = 0.6;
const OVERCAST_SUN_GREYING = 0.5;
const OVERCAST_SUN_DIMMING = 0.6;
const OVERCAST_FILL_SHARE = 0.3;

let lastOvercast = null;

export function overcastLook(look, overcast) {
    const o = Number.isFinite(overcast) ? clamp01(overcast) : 0;
    if (o === 0) return look;
    // A sky that holds keeps handing the renderer the same look.
    if (lastOvercast && lastOvercast.look === look && lastOvercast.o === o) return lastOvercast.result;
    const sunIntensity = Math.max(look.sunIntensity * (1 - OVERCAST_SUN_DIMMING * o), Math.min(look.sunIntensity, NIGHT.sunIntensity));
    const result = Object.freeze({
        sky: greyColor(look.sky, OVERCAST_SKY_GREYING * o, 1 - (1 - OVERCAST_SKY_DIMMING) * o),
        hemisphereSky: greyColor(look.hemisphereSky, OVERCAST_FILL_GREYING * o, 1),
        hemisphereGround: look.hemisphereGround,
        hemisphereIntensity: look.hemisphereIntensity + (look.sunIntensity - sunIntensity) * OVERCAST_FILL_SHARE,
        sunColor: greyColor(look.sunColor, OVERCAST_SUN_GREYING * o, 1),
        sunIntensity,
        glow: look.glow
    });
    lastOvercast = { look, o, result };
    return result;
}

// `color` turned `greying` of the way to the grey of its own brightness, and
// dimmed to `dimming` of it.
function greyColor(color, greying, dimming) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    const channel = (c) => Math.round(Math.min(255, Math.max(0, lerp(c, grey, greying) * dimming)));
    return (channel(r) << 16) | (channel(g) << 8) | channel(b);
}

// A spell's number to a fraction in [0, 1), the same on every device.
function hashUnit(n) {
    let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    h = Math.imul(h ^ 0x27d4eb2f, 0x165667b1);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth01(v) {
    const t = clamp01(v);
    return t * t * (3 - 2 * t);
}
