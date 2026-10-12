// World View's day and night: how the sky and its light look at a moment.
// Worked out from the clock alone, as wildlife's wandering is, so everyone
// at a build sees the same sky with nothing sent or stored. A whole day lasts
// DAY_CYCLE_SECONDS, short enough that nobody visits only ever at night.
//
// Night stays a blue, moonlit night: builds must stay readable, because they
// are walked through and photographed, so its light never drops below what
// NIGHT gives.

export const DAY_CYCLE_SECONDS = 40 * 60;

// sky: the background color. hemisphereSky / hemisphereGround /
// hemisphereIntensity: the fill light from above and below. sunColor /
// sunIntensity: the one directional light (the moon at night). glow: how
// strongly lamps and lit windows shine, 0 by day and 1 at night.
export const DAY = Object.freeze({
    sky: 0x87ceeb,
    hemisphereSky: 0xbfd9ff,
    hemisphereGround: 0x4a3d2e,
    hemisphereIntensity: 1.0,
    sunColor: 0xffffff,
    sunIntensity: 1.8,
    glow: 0
});

const DUSK = Object.freeze({
    sky: 0xe8956a,
    hemisphereSky: 0xffc8a0,
    hemisphereGround: 0x45342a,
    hemisphereIntensity: 0.8,
    sunColor: 0xffa060,
    sunIntensity: 1.1,
    glow: 0.6
});

export const NIGHT = Object.freeze({
    sky: 0x1b2a4e,
    hemisphereSky: 0x7088c4,
    hemisphereGround: 0x221d2a,
    hemisphereIntensity: 0.6,
    sunColor: 0xa8bcff,
    sunIntensity: 0.5,
    glow: 1
});

const DAWN = Object.freeze({
    sky: 0xf0b4a0,
    hemisphereSky: 0xffd4c0,
    hemisphereGround: 0x4a3d2e,
    hemisphereIntensity: 0.85,
    sunColor: 0xffc49a,
    sunIntensity: 1.2,
    glow: 0.4
});

// Where in the day each look is reached, as a fraction of the day; between
// two the look blends from one to the next. Day takes about half the cycle
// and full night a little over a fifth.
const KEYFRAMES = Object.freeze([
    { at: 0, look: DAWN },
    { at: 0.06, look: DAY },
    { at: 0.56, look: DAY },
    { at: 0.64, look: DUSK },
    { at: 0.72, look: NIGHT },
    { at: 0.94, look: NIGHT },
    { at: 1, look: DAWN }
]);

// How far through its day the world is at `seconds` (Unix time), from 0
// (dawn) up to, not including, 1.
export function dayFractionAt(seconds) {
    if (!Number.isFinite(seconds)) {
        return KEYFRAMES[1].at;
    }
    const into = ((seconds % DAY_CYCLE_SECONDS) + DAY_CYCLE_SECONDS) % DAY_CYCLE_SECONDS;
    return into / DAY_CYCLE_SECONDS;
}

// The sky's look at `seconds`: a frozen object shaped like DAY.
export function skyLookAt(seconds) {
    return skyLookAtFraction(dayFractionAt(seconds));
}

export function skyLookAtFraction(fraction) {
    const f = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
    for (let i = 1; i < KEYFRAMES.length; i++) {
        const to = KEYFRAMES[i];
        if (f <= to.at) {
            const from = KEYFRAMES[i - 1];
            const t = to.at === from.at ? 1 : (f - from.at) / (to.at - from.at);
            return blendLooks(from.look, to.look, t);
        }
    }
    return KEYFRAMES[KEYFRAMES.length - 1].look;
}

// While the sky holds (all day, all night) the same frozen look comes back,
// so a renderer can tell nothing changed.
export function blendLooks(from, to, t) {
    if (t <= 0 || from === to) return from;
    if (t >= 1) return to;
    return Object.freeze({
        sky: blendColor(from.sky, to.sky, t),
        hemisphereSky: blendColor(from.hemisphereSky, to.hemisphereSky, t),
        hemisphereGround: blendColor(from.hemisphereGround, to.hemisphereGround, t),
        hemisphereIntensity: lerp(from.hemisphereIntensity, to.hemisphereIntensity, t),
        sunColor: blendColor(from.sunColor, to.sunColor, t),
        sunIntensity: lerp(from.sunIntensity, to.sunIntensity, t),
        glow: lerp(from.glow, to.glow, t)
    });
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function blendColor(a, b, t) {
    const r = Math.round(lerp((a >> 16) & 0xff, (b >> 16) & 0xff, t));
    const g = Math.round(lerp((a >> 8) & 0xff, (b >> 8) & 0xff, t));
    const bl = Math.round(lerp(a & 0xff, b & 0xff, t));
    return (r << 16) | (g << 8) | bl;
}
