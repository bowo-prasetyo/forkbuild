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

// Where the sun and the moon stand. Each crosses the sky from east to west
// along an arc leaning south, as seen from the northern hemisphere, by the
// compass World View shows (core/CompassHeading.js: North is +z, so East is
// -x, South -z and West +x): the sun from just before dawn until it sets in the dusk, the
// moon from late in the dusk until just after dawn, so the two share the sky
// only low down at either end.
const SUN_ARC = Object.freeze({ rise: -0.02, set: 0.7 });
const MOON_ARC = Object.freeze({ rise: 0.64, set: 1.02 });
// How far the arc leans south of straight overhead: its highest point is
// 90° - 50° = 40° up. World View's camera sees at most about 30° above the
// horizon looking level (First Person), and less looking down at an avatar.
const ARC_TILT = (50 * Math.PI) / 180;
// The light never comes from lower than this (the sine of about 14.5°), so a
// sun or moon on the horizon doesn't light builds from underneath.
const MIN_LIGHT_HEIGHT = 0.25;

// Always day's sky: the sun standing still in the south-east, where it is
// partway through the morning, about 19° up and in view.
const ALWAYS_DAY_FRACTION = 0.1;

// Where the sun and the moon are at `seconds` (Unix time); with no clock,
// Always day's still morning sun (DAY_SKY_BODIES).
export function skyBodiesAt(seconds) {
    if (!Number.isFinite(seconds)) {
        return DAY_SKY_BODIES;
    }
    return skyBodiesAtFraction(dayFractionAt(seconds));
}

// { sun, moon, light }: unit directions from the viewer, sun or moon null
// while below the horizon; light is where the scene's directional light
// shines from: the sun's or the moon's, and while both are up, low at either
// end of the night, it sweeps steadily back over the southern sky from the
// one setting to the one rising.
export function skyBodiesAtFraction(fraction) {
    const f = Number.isFinite(fraction) ? fraction - Math.floor(fraction) : KEYFRAMES[1].at;
    const sun = bodyOnArc(SUN_ARC, f);
    const moon = bodyOnArc(MOON_ARC, f);
    const up = [sun, moon].filter(Boolean);
    const weight = up.reduce((sum, body) => sum + body.weight, 0);
    const lightAngle = weight > 0
        ? up.reduce((sum, body) => sum + body.angle * body.weight, 0) / weight
        : up.reduce((sum, body) => sum + body.angle, 0) / Math.max(up.length, 1);
    return Object.freeze({
        sun: sun ? arcDirection(sun.angle) : null,
        moon: moon ? arcDirection(moon.angle) : null,
        light: lightDirection(arcDirection(lightAngle))
    });
}

// How far along its arc a body is at `f` (0 rising in the east, pi setting
// in the west), and how long it has been up or has left (whichever is less)
// as its share of the light; null below the horizon.
function bodyOnArc(arc, f) {
    const length = arc.set - arc.rise;
    const into = (((f - arc.rise) % 1) + 1) % 1;
    if (into > length) {
        return null;
    }
    return { angle: (into / length) * Math.PI, weight: Math.min(into, length - into) };
}

// East (-x) at 0, up and to the south (-z) by pi/2, west (+x) at pi.
function arcDirection(angle) {
    const up = Math.sin(angle);
    return Object.freeze({ x: -Math.cos(angle), y: up * Math.cos(ARC_TILT), z: -up * Math.sin(ARC_TILT) });
}

function lightDirection(dir) {
    if (dir.y >= MIN_LIGHT_HEIGHT) {
        return dir;
    }
    const flat = Math.hypot(dir.x, dir.z);
    const across = Math.sqrt(1 - MIN_LIGHT_HEIGHT * MIN_LIGHT_HEIGHT) / flat;
    return Object.freeze({ x: dir.x * across, y: MIN_LIGHT_HEIGHT, z: dir.z * across });
}

// Always day's sun and light (see ALWAYS_DAY_FRACTION).
export const DAY_SKY_BODIES = skyBodiesAtFraction(ALWAYS_DAY_FRACTION);
