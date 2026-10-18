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

// The sky through the seasons (core/Season.js hands one in, seasonalSky()):
// `dayShift`, how much longer the day lasts, as a share of the cycle (a
// shorter one below 0), and `sunTilt` and `moonTilt`, how far the sun's and
// the moon's arcs lean south of overhead, in radians. EQUINOX_SKY changes
// nothing, and is what every function here assumes when given none.
//
// A longer day ends later: the dusk, the night and the moonrise all come
// later and the night is shorter, while dawn stays at the start of the
// cycle (seasonalFraction()). In summer the sun climbs higher and the full
// moon rides low; in winter the sun stays low, with long shadows, and the
// moon rides high, as they do. Kept modest (SEASON_DAY_SHIFT,
// SEASON_TILT_DEGREES): the longest winter night is about a quarter of the
// cycle, and the light never comes from lower than it ever did
// (MIN_LIGHT_HEIGHT), so builds stay readable.
export const SEASON_DAY_SHIFT = 0.05;
export const SEASON_TILT_DEGREES = 12;
const ARC_TILT_DEGREES = 50;
// Where in the cycle the day's light gives way to the dusk's: the part of
// the cycle before it stretches or shrinks with the day, the rest the other
// way.
const DAY_PIVOT = 0.6;

export const EQUINOX_SKY = Object.freeze({
    dayShift: 0,
    sunTilt: (ARC_TILT_DEGREES * Math.PI) / 180,
    moonTilt: (ARC_TILT_DEGREES * Math.PI) / 180
});

// The sky for `summer`, from -1 (midwinter) through 0 (the equinoxes) to 1
// (midsummer).
export function seasonalSky(summer) {
    const s = Number.isFinite(summer) ? Math.min(Math.max(summer, -1), 1) : 0;
    if (s === 0) return EQUINOX_SKY;
    const tilt = (degrees) => (degrees * Math.PI) / 180;
    return Object.freeze({
        dayShift: SEASON_DAY_SHIFT * s,
        sunTilt: tilt(ARC_TILT_DEGREES - SEASON_TILT_DEGREES * s),
        moonTilt: tilt(ARC_TILT_DEGREES + SEASON_TILT_DEGREES * s)
    });
}

// The point of an equinox day that `fraction` of a day lengthened by
// `dayShift` stands for: what the looks and the arcs are worked out at.
export function seasonalFraction(fraction, dayShift = 0) {
    const d = Number.isFinite(dayShift) ? dayShift : 0;
    if (d === 0) return fraction;
    const split = DAY_PIVOT + d;
    return fraction < split
        ? (fraction * DAY_PIVOT) / split
        : DAY_PIVOT + ((fraction - split) * (1 - DAY_PIVOT)) / (1 - split);
}

function skyOf(sky) {
    return sky && Number.isFinite(sky.dayShift) && Number.isFinite(sky.sunTilt) && Number.isFinite(sky.moonTilt) ? sky : EQUINOX_SKY;
}

// The sky's look at `seconds`, in the season's `sky`: a frozen object
// shaped like DAY.
export function skyLookAt(seconds, sky = EQUINOX_SKY) {
    return skyLookAtFraction(dayFractionAt(seconds), sky);
}

export function skyLookAtFraction(fraction, sky = EQUINOX_SKY) {
    const f = seasonalFraction(Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0, skyOf(sky).dayShift);
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
// How far the arc leans south of straight overhead (EQUINOX_SKY's tilts):
// its highest point is 90° - 50° = 40° up at the equinoxes, 52° at
// midsummer and 28° at midwinter. World View's camera sees at most about
// 30° above the horizon looking level (First Person), and less looking down
// at an avatar.
// The light never comes from lower than this (the sine of about 14.5°), so a
// sun or moon on the horizon doesn't light builds from underneath.
const MIN_LIGHT_HEIGHT = 0.25;

// Always day's sky: the sun standing still in the south-east, where it is
// partway through the morning, about 19° up and in view.
const ALWAYS_DAY_FRACTION = 0.1;

// Where the sun and the moon are at `seconds` (Unix time), in the season's
// `sky`; with no clock, Always day's still morning sun (DAY_SKY_BODIES).
export function skyBodiesAt(seconds, sky = EQUINOX_SKY) {
    if (!Number.isFinite(seconds)) {
        return DAY_SKY_BODIES;
    }
    return skyBodiesAtFraction(dayFractionAt(seconds), moonPhaseAt(seconds, sky), sky);
}

// { sun, moon, light, lightStrength }: unit directions from the viewer, sun
// or moon null while below the horizon; light is where the scene's
// directional light shines from: the sun's or the moon's, and while both are
// up, low at either end of the night, it sweeps steadily back over the
// southern sky from the one setting to the one rising. lightStrength, from 0
// to 1, is how much of the look's sun (moon) light comes from that direction:
// 1 while only one is up, fading to nothing halfway through the handover and
// back, so shadows fade out and in rather than swinging across the ground
// (the rest of the light is spread as fill instead; renderer/Lights.js).
// skyTurn is how far the starry sky has turned round its pole since dawn,
// once round a day, in radians (core/StarField.js). moonPhase is the night's
// phase (MOON_PHASES; a full moon unless `phase` says otherwise), and
// moonLitFrom the unit direction its light falls on the moon from, where the
// sun would stand for that phase, null while the moon is down.
export function skyBodiesAtFraction(fraction, phase = FULL_MOON, sky = EQUINOX_SKY) {
    const season = skyOf(sky);
    const f = Number.isFinite(fraction) ? seasonalFraction(fraction - Math.floor(fraction), season.dayShift) : KEYFRAMES[1].at;
    const moonPhase = phase && Number.isFinite(phase.angle) ? phase : FULL_MOON;
    const sun = bodyOnArc(SUN_ARC, f);
    const moon = bodyOnArc(MOON_ARC, f);
    if (sun) sun.tilt = season.sunTilt;
    if (moon) moon.tilt = season.moonTilt;
    const up = [sun, moon].filter(Boolean);
    const weight = up.reduce((sum, body) => sum + body.weight, 0);
    const mean = (key) => (weight > 0
        ? up.reduce((sum, body) => sum + body[key] * body.weight, 0) / weight
        : up.reduce((sum, body) => sum + body[key], 0) / Math.max(up.length, 1));
    return Object.freeze({
        sun: sun ? arcDirection(sun.angle, sun.tilt) : null,
        moon: moon ? arcDirection(moon.angle, moon.tilt) : null,
        light: lightDirection(arcDirection(mean('angle'), up.length > 0 ? mean('tilt') : season.sunTilt)),
        lightStrength: handoverStrength(sun, moon),
        skyTurn: f * Math.PI * 2,
        moonPhase,
        // Its light falls from where the sun would stand, on the sun's arc.
        moonLitFrom: moon ? arcDirection(moon.angle + moonPhase.angle, season.sunTilt) : null
    });
}

// 1 with one body up; while both are, how far the light is from an even
// share between them, eased, so it falls smoothly from 1 to 0 and back.
function handoverStrength(sun, moon) {
    if (!sun || !moon) {
        return 1;
    }
    const total = sun.weight + moon.weight;
    if (total <= 0) {
        return 0;
    }
    const lean = Math.abs(sun.weight - moon.weight) / total;
    return lean * lean * (3 - 2 * lean);
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

// East (-x) at 0, up and to the south (-z) by pi/2, west (+x) at pi, on an
// arc leaning `tilt` south of overhead.
function arcDirection(angle, tilt = EQUINOX_SKY.sunTilt) {
    const up = Math.sin(angle);
    return Object.freeze({ x: -Math.cos(angle), y: up * Math.cos(tilt), z: -up * Math.sin(tilt) });
}

function lightDirection(dir) {
    if (dir.y >= MIN_LIGHT_HEIGHT) {
        return dir;
    }
    const flat = Math.hypot(dir.x, dir.z);
    const across = Math.sqrt(1 - MIN_LIGHT_HEIGHT * MIN_LIGHT_HEIGHT) / flat;
    return Object.freeze({ x: dir.x * across, y: MIN_LIGHT_HEIGHT, z: dir.z * across });
}

// The moon's phases. The moon goes from new to full and back in
// MOON_CYCLE_DAYS of World View's days, one phase a night, so a visit of an
// hour or two sees it change and a player coming back sees another. Each
// night's phase is set from the clock alone as the moon rises (MOON_ARC.rise)
// and holds until the next moonrise, so it never changes while the moon is up.
//
// The moon still crosses the whole night, whatever its phase (unlike the real
// one, which is up by day around new moon): the night must stay moonlit, so
// only how much of it is lit changes. Its lit side faces where the sun would
// stand for that phase: angle (0 new, pi full) further west along the same
// arc, so a waxing moon is lit on its western side, a waning one on its east.
// illumination is the share of the disc lit, (1 - cos angle) / 2.
export const MOON_CYCLE_DAYS = 8;

export const MOON_PHASES = Object.freeze([
    'newMoon',
    'waxingCrescent',
    'firstQuarter',
    'waxingGibbous',
    'fullMoon',
    'waningGibbous',
    'thirdQuarter',
    'waningCrescent'
].map((name, index) => {
    const angle = (index / MOON_CYCLE_DAYS) * Math.PI * 2;
    return Object.freeze({
        index,
        name,
        angle,
        // Rounded so a quarter is exactly half lit.
        illumination: Math.round(((1 - Math.cos(angle)) / 2) * 1e9) / 1e9,
        waxing: index > 0 && index < MOON_CYCLE_DAYS / 2
    });
}));

export const FULL_MOON = MOON_PHASES[MOON_CYCLE_DAYS / 2];

// The moon's phase on the night under way at `seconds` (Unix time): the one
// it took at the last moonrise (later in a longer day: `sky`). With no
// clock, a full moon.
export function moonPhaseAt(seconds, sky = EQUINOX_SKY) {
    if (!Number.isFinite(seconds)) {
        return FULL_MOON;
    }
    // From the same fraction of the day the moon's arc is worked out from, so
    // the phase turns on the very frame the moon rises.
    const fraction = dayFractionAt(seconds);
    const day = Math.round(seconds / DAY_CYCLE_SECONDS - fraction);
    const night = seasonalFraction(fraction, skyOf(sky).dayShift) >= MOON_ARC.rise ? day : day - 1;
    return MOON_PHASES[((night % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS];
}

// How a night looks under `phase`'s moon. NIGHT is a half-lit moon's (a
// first or third quarter): towards new, less of the moon's light comes
// straight from it, and what it doesn't give goes to the fill from above
// instead, so the night is never darker than NIGHT (builds stay readable),
// only flatter, with fainter shadows and a deeper blue sky; towards full, the
// moonlight grows brighter and more silver, and the sky a little paler. Only full night is touched: from dusk's
// glow (0.6) to night's (1) it comes in, so the sun at dusk and dawn is as it
// was, and day is untouched. The same look comes back for the same night.
const MOONLIGHT_FROM_GLOW = DUSK.glow;
const NEW_MOON_LIGHT = 0.3;
const FULL_MOON_LIGHT = 1.25;
const FULL_MOON_FILL = 0.05;
const NEW_MOON_SKY = 0x111c38;
const FULL_MOON_SKY = 0x22345c;
const FULL_MOON_COLOR = 0xc4d2ff;

let lastMoonlit = null;

export function moonlitLook(look, phase = FULL_MOON) {
    const weight = look ? Math.min(Math.max((look.glow - MOONLIGHT_FROM_GLOW) / (1 - MOONLIGHT_FROM_GLOW), 0), 1) : 0;
    if (weight === 0 || !phase) return look;
    if (lastMoonlit && lastMoonlit.look === look && lastMoonlit.phase === phase) return lastMoonlit.result;
    const lit = phase.illumination;
    // From new (0) to half lit (1), and from half lit (0) to full (1).
    const waxing = Math.min(lit * 2, 1);
    const fuller = Math.max(lit * 2 - 1, 0);
    const light = lit < 0.5 ? lerp(NEW_MOON_LIGHT, 1, waxing) : lerp(1, FULL_MOON_LIGHT, fuller);
    const sunIntensity = look.sunIntensity * lerp(1, light, weight);
    const sky = lit < 0.5 ? blendColor(NEW_MOON_SKY, look.sky, waxing) : blendColor(look.sky, FULL_MOON_SKY, fuller);
    const result = Object.freeze({
        ...look,
        sky: blendColor(look.sky, sky, weight),
        hemisphereIntensity: look.hemisphereIntensity + Math.max(look.sunIntensity - sunIntensity, 0) + FULL_MOON_FILL * fuller * weight,
        sunColor: blendColor(look.sunColor, FULL_MOON_COLOR, fuller * weight),
        sunIntensity
    });
    lastMoonlit = { look, phase, result };
    return result;
}

// Always day's sun and light (see ALWAYS_DAY_FRACTION).
export const DAY_SKY_BODIES = skyBodiesAtFraction(ALWAYS_DAY_FRACTION);
