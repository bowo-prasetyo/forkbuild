// World View's weather: how cloudy the sky is at a moment. Worked out from
// the clock alone, as the day and night are (core/DayCycle.js), so everyone
// at a build sees the same clouds with nothing sent or stored, and it is the
// same weather all over the world: friends walking together always share it.
//
// Time is cut into spells of WEATHER_SPELL_SECONDS, each with its own cloud
// cover drawn from a hash of its number: about three spells in five fair,
// with a few clouds; one in four cloudy; and about one in seven overcast.
// Over the last WEATHER_CHANGE_SECONDS of a spell the cover blends into the
// next one's, so clouds gather and clear rather than switching.
//
// Overcast greys the sky and softens its light (overcastLook()), never below
// what a clear NIGHT gives, so builds stay readable in any weather.

import { NIGHT } from './DayCycle.js';

export const WEATHER_SPELL_SECONDS = 8 * 60;
export const WEATHER_CHANGE_SECONDS = 2 * 60;

// The share of spells of each kind, and the cover each kind spans.
const FAIR_SHARE = 0.6;
const CLOUDY_SHARE = 0.25;
const FAIR_COVER = Object.freeze({ from: 0.06, to: 0.22 });
const CLOUDY_COVER = Object.freeze({ from: 0.38, to: 0.62 });
const OVERCAST_COVER = Object.freeze({ from: 0.88, to: 1 });

// Where, in cloud cover, the sky starts to turn overcast and where it is
// fully so.
const OVERCAST_FROM = 0.55;
const OVERCAST_FULL = 0.88;

// cloudCover: how much of the sky the clouds hide, 0 to 1. overcast: how far
// the sky and its light have turned grey, 0 to 1.
export const FAIR_WEATHER = Object.freeze({ cloudCover: 0, overcast: 0 });

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
    return weatherOfCover(cover);
}

export function weatherOfCover(cloudCover) {
    const cover = clamp01(cloudCover);
    return Object.freeze({
        cloudCover: cover,
        overcast: smooth01((cover - OVERCAST_FROM) / (OVERCAST_FULL - OVERCAST_FROM))
    });
}

// The cloud cover a whole spell settles on.
export function spellCover(spell) {
    const u = hashUnit(spell);
    const v = hashUnit(spell ^ 0x5bd1e995);
    if (u < FAIR_SHARE) return lerp(FAIR_COVER.from, FAIR_COVER.to, v);
    if (u < FAIR_SHARE + CLOUDY_SHARE) return lerp(CLOUDY_COVER.from, CLOUDY_COVER.to, v);
    return lerp(OVERCAST_COVER.from, OVERCAST_COVER.to, v);
}

// `look` (shaped like core/DayCycle.js's DAY) under an `overcast` sky: the
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
