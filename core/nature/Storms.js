// Gentle storms: in the heaviest downpours (core/nature/Weather.js), now and then
// lightning softly brightens the sky, and a few seconds later thunder
// rumbles in the distance. Worked out from the clock alone, like the rest of
// the weather, so friends walking together see the same flash and hear the
// same rumble.
//
// Kept gentle on purpose, for anyone sensitive to flashing light: a strike
// is at most two soft pulses, about a quarter of a second apart, and strikes
// are never closer than STRIKE_SLOT_SECONDS - STRIKE_WINDOW_SECONDS (20 s)
// apart, well under the three flashes a second that photosensitivity
// guidance warns of. The flash only lifts the sky and its light part of the
// way (lightningLook()), never to white. The thunder is always far off: a
// low rumble, never a crack.

import { rainAt } from './Weather.js';

// Rain at or above STORM_FROM starts to storm, fully by STORM_FULL: about
// the heaviest third of the rainy spells.
export const STORM_FROM = 0.75;
export const STORM_FULL = 0.9;
// Time is cut into slots; each may hold one strike, somewhere in the first
// STRIKE_WINDOW_SECONDS of it, so two strikes are at least 20 s apart.
export const STRIKE_SLOT_SECONDS = 30;
export const STRIKE_WINDOW_SECONDS = 10;
// The chance of a strike in a slot at full storm: one about every 75 s.
const STRIKE_CHANCE = 0.4;
// How long after the flash the thunder arrives: further strikes later, and
// quieter.
export const THUNDER_DELAY = Object.freeze({ from: 2.5, to: 7 });
// Thunder further back than this is not heard after a long gap.
export const THUNDER_CATCH_UP_SECONDS = 60;
// How long a strike's flash lasts, in seconds.
export const FLASH_SECONDS = 0.5;

// How stormy it is at `seconds`, 0 to 1.
export function storminessAt(seconds) {
    return smooth01((rainAt(seconds) - STORM_FROM) / (STORM_FULL - STORM_FROM));
}

// The strike in slot `slot`, or null: `{ at, distance, delay, brightness,
// loudness }`, `distance` from 0 (nearest) to 1 (furthest), `delay` the
// seconds until its thunder is heard.
export function strikeInSlot(slot) {
    const at = slot * STRIKE_SLOT_SECONDS + hashUnit(slot, 1) * STRIKE_WINDOW_SECONDS;
    const storm = storminessAt(at);
    if (storm <= 0 || hashUnit(slot, 2) >= STRIKE_CHANCE * storm) return null;
    const distance = hashUnit(slot, 3);
    return Object.freeze({
        at,
        distance,
        delay: THUNDER_DELAY.from + (THUNDER_DELAY.to - THUNDER_DELAY.from) * distance,
        brightness: 1 - 0.45 * distance,
        loudness: 1 - 0.55 * distance
    });
}

// How brightly lightning lights the sky at `seconds`, 0 to 1: a soft pulse,
// then a fainter second one.
export function lightningAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    const slot = Math.floor(seconds / STRIKE_SLOT_SECONDS);
    const strike = strikeInSlot(slot);
    if (!strike) return 0;
    const since = seconds - strike.at;
    if (since < 0 || since > FLASH_SECONDS) return 0;
    return Math.min(1, strike.brightness * (pulse(since, 0, 0.06, 0.2) + 0.5 * pulse(since, 0.26, 0.05, 0.18)));
}

// The thunder heard after `from` and up to `to` (seconds), oldest first:
// `{ at, loudness }`, `at` when it starts.
export function thunderBetween(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
    // A long gap (a hidden tab coming back) hears only the last of it.
    const since = Math.max(from, to - THUNDER_CATCH_UP_SECONDS);
    const heard = [];
    const first = Math.floor((since - THUNDER_DELAY.to - STRIKE_WINDOW_SECONDS) / STRIKE_SLOT_SECONDS);
    const last = Math.floor(to / STRIKE_SLOT_SECONDS);
    for (let slot = first; slot <= last; slot++) {
        const strike = strikeInSlot(slot);
        if (!strike) continue;
        const at = strike.at + strike.delay;
        if (at > since && at <= to) heard.push(Object.freeze({ at, loudness: strike.loudness }));
    }
    return heard;
}

// `look` (shaped like core/nature/DayCycle.js's DAY) lit by a flash of `flash` (0 to
// 1): the sky and the light from above lifted part of the way towards a pale
// blue-white, never to white. With no flash, the same look.
const FLASH_COLOR = 0xdfe6ff;
const FLASH_SKY = 0.35;
const FLASH_FILL = 0.6;

export function lightningLook(look, flash) {
    const f = Number.isFinite(flash) ? Math.min(Math.max(flash, 0), 1) : 0;
    if (f === 0) return look;
    return Object.freeze({
        ...look,
        sky: blendColor(look.sky, FLASH_COLOR, FLASH_SKY * f),
        hemisphereSky: blendColor(look.hemisphereSky, FLASH_COLOR, FLASH_SKY * f),
        hemisphereIntensity: look.hemisphereIntensity + FLASH_FILL * f
    });
}

// A soft pulse starting at `start`: up over `rise` seconds, down over `fall`.
function pulse(t, start, rise, fall) {
    const s = t - start;
    if (s <= 0 || s >= rise + fall) return 0;
    return s < rise ? smooth01(s / rise) : 1 - smooth01((s - rise) / fall);
}

function blendColor(a, b, t) {
    const channel = (shift) => Math.round(((a >> shift) & 0xff) + ((((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t));
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function hashUnit(n, salt) {
    let h = Math.imul((n | 0) ^ Math.imul(salt, 0x7feb352d), 0x846ca68b);
    h ^= h >>> 16;
    h = Math.imul(h ^ 0x2f6b9e41, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function smooth01(v) {
    const t = v < 0 ? 0 : v > 1 ? 1 : v;
    return t * t * (3 - 2 * t);
}
