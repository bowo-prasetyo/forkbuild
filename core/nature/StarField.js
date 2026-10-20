// World View's night sky: a fixed field of stars and the Milky Way across it,
// the same for everyone (made from a fixed seed, nothing sent or stored), and
// how far the sky has turned at any moment of the day (core/nature/DayCycle.js).
//
// Directions are unit vectors in the sky's own frame, which turns once a day
// round the celestial pole: north (+z, core/world/CompassHeading.js) and raised by
// the same 50° the sun's and moon's arc leans south (ARC_TILT in
// core/nature/DayCycle.js), so the celestial equator is their very arc and stars
// rise in the east and set in the west with them. core/nature/DayCycle.js's
// skyBodiesAt() says how far it has turned (skyTurn); renderer/StarSky.js
// turns the sky by it.

// How many stars, and how many fainter ones crowd the Milky Way's band.
export const STAR_COUNT = 1500;
export const MILKY_WAY_STAR_COUNT = 1600;

// The celestial pole: due north, 50° up.
const POLE_HEIGHT = (50 * Math.PI) / 180;
export const CELESTIAL_POLE = Object.freeze({ x: 0, y: Math.sin(POLE_HEIGHT), z: Math.cos(POLE_HEIGHT) });

// The Milky Way's plane, by its pole in the sky's frame: tilted well away
// from the celestial pole, so its band crosses the night sky at a slant.
const MILKY_WAY_POLE = unit(0.62, 0.35, -0.7);
// How far either side of its middle the band spreads (radians, one standard
// deviation): about 7°.
const MILKY_WAY_SPREAD = 0.12;

const SEED = 0x5747a1;

// Star colours: most white, some blue-white, some warm.
const WHITE = 0xffffff;
const BLUE = 0xcad8ff;
const WARM = 0xffe2b8;

// `direction` in the sky's frame, turned by `turn` radians round the
// celestial pole, the way the sun goes: rising in the east, crossing the
// south, setting in the west.
export function turnSky(direction, turn) {
    // Rodrigues' rotation round the pole, by -turn: seen from above the
    // north pole, the sky turns clockwise towards the west.
    const k = CELESTIAL_POLE;
    const angle = -turn;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = k.x * direction.x + k.y * direction.y + k.z * direction.z;
    const cx = k.y * direction.z - k.z * direction.y;
    const cy = k.z * direction.x - k.x * direction.z;
    const cz = k.x * direction.y - k.y * direction.x;
    return {
        x: direction.x * cos + cx * sin + k.x * dot * (1 - cos),
        y: direction.y * cos + cy * sin + k.y * dot * (1 - cos),
        z: direction.z * cos + cz * sin + k.z * dot * (1 - cos)
    };
}

let cached = null;

// { stars, milkyWay }: each a frozen list of { x, y, z, size, brightness,
// color, phase }, direction in the sky's frame, size in CSS pixels,
// brightness 0..1, color 0xRRGGBB, phase (0..2pi) when it twinkles. Made
// once and the same every time.
export function starField() {
    if (!cached) {
        const random = seededRandom(SEED);
        const stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            // Many faint, few bright: brightness falls off steeply.
            const magnitude = Math.pow(random(), 3.2);
            stars.push(Object.freeze({
                ...uniformDirection(random),
                size: 1.2 + magnitude * 3,
                brightness: 0.45 + magnitude * 0.55,
                color: starColor(random()),
                phase: random() * Math.PI * 2
            }));
        }
        const milkyWay = [];
        const [u, v] = basisAround(MILKY_WAY_POLE);
        for (let i = 0; i < MILKY_WAY_STAR_COUNT; i++) {
            const along = random() * Math.PI * 2;
            const off = gaussian(random) * MILKY_WAY_SPREAD;
            const p = MILKY_WAY_POLE;
            const ring = { x: u.x * Math.cos(along) + v.x * Math.sin(along), y: u.y * Math.cos(along) + v.y * Math.sin(along), z: u.z * Math.cos(along) + v.z * Math.sin(along) };
            const direction = unit(
                ring.x * Math.cos(off) + p.x * Math.sin(off),
                ring.y * Math.cos(off) + p.y * Math.sin(off),
                ring.z * Math.cos(off) + p.z * Math.sin(off)
            );
            milkyWay.push(Object.freeze({
                ...direction,
                size: 0.9 + random() * 0.6,
                brightness: 0.18 + random() * 0.25,
                color: random() < 0.5 ? WHITE : BLUE,
                phase: random() * Math.PI * 2
            }));
        }
        cached = Object.freeze({ stars: Object.freeze(stars), milkyWay: Object.freeze(milkyWay) });
    }
    return cached;
}

// The Milky Way's glow: points along the middle of its band (`segments` of
// them, evenly round), with the directions either side at `halfWidth`
// radians, for a ribbon brightest along the middle. Each is { middle, left,
// right }, unit vectors in the sky's frame.
export function milkyWayRibbon(segments, halfWidth) {
    const [u, v] = basisAround(MILKY_WAY_POLE);
    const p = MILKY_WAY_POLE;
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const along = (i / segments) * Math.PI * 2;
        const ring = { x: u.x * Math.cos(along) + v.x * Math.sin(along), y: u.y * Math.cos(along) + v.y * Math.sin(along), z: u.z * Math.cos(along) + v.z * Math.sin(along) };
        const side = (sign) => unit(
            ring.x * Math.cos(halfWidth) + p.x * Math.sin(halfWidth) * sign,
            ring.y * Math.cos(halfWidth) + p.y * Math.sin(halfWidth) * sign,
            ring.z * Math.cos(halfWidth) + p.z * Math.sin(halfWidth) * sign
        );
        points.push({ middle: unit(ring.x, ring.y, ring.z), left: side(1), right: side(-1) });
    }
    return points;
}

export function milkyWayPole() {
    return MILKY_WAY_POLE;
}

function starColor(r) {
    if (r < 0.15) return BLUE;
    if (r < 0.27) return WARM;
    return WHITE;
}

// Evenly over the whole sphere.
function uniformDirection(random) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const flat = Math.sqrt(1 - y * y);
    return { x: flat * Math.cos(angle), y, z: flat * Math.sin(angle) };
}

// Two unit vectors at right angles to `pole` and to each other.
function basisAround(pole) {
    const helper = Math.abs(pole.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const u = unit(
        helper.y * pole.z - helper.z * pole.y,
        helper.z * pole.x - helper.x * pole.z,
        helper.x * pole.y - helper.y * pole.x
    );
    const v = unit(
        pole.y * u.z - pole.z * u.y,
        pole.z * u.x - pole.x * u.z,
        pole.x * u.y - pole.y * u.x
    );
    return [u, v];
}

function gaussian(random) {
    const a = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(Math.PI * 2 * random());
}

// mulberry32: small, fast and the same everywhere.
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function unit(x, y, z) {
    const length = Math.hypot(x, y, z);
    return { x: x / length, y: y / length, z: z / length };
}
