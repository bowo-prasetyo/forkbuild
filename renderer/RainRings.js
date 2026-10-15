// Raindrops landing on water: a shader chunk the lakes and the sea
// (renderer/WaterWaveMaterial.js) and rivers (renderer/RiverFlowMaterial.js)
// share, so rain rings every water surface alike.
//
// The water is cut into cells RING_CELL across; in each cell, drops land one
// after another, each RING_SECONDS-ish apart (a little different from cell to
// cell, so they don't land in step), each at its own place in the cell, and
// a ring spreads from it out to RING_RADIUS, fading as it grows. How many of
// those drops actually fall is the rain's strength (`uRain`, 0 to 1,
// core/Weather.js's rain), so a shower dots the water and a downpour covers
// it. Each pixel looks at its own cell and the eight round it, since a ring
// can reach over a cell's edge.
//
// `rain` is a shared { value } every water material reads, set once a frame
// (renderer/Renderer.js#setWeather()); at 0 the chunk returns at once.
// Like the water's other small patterns, the rings fade out with distance:
// further off they would be smaller than a pixel.

export const RING_CELL = 0.8;
export const RING_RADIUS = 0.55;
export const RING_SECONDS = 0.9;
const RING_WIDTH = 0.07;
const RING_TILT = 0.6;
export const RING_FADE_NEAR = 10;
export const RING_FADE_FAR = 28;

function glslFloat(v) {
    return v.toPrecision(8);
}

// Declares `uRain` and `vec3 rainRings(vec2 p, float time, float near)`:
// (how bright the rings are at p, and the slope they tilt the surface by
// along x and z). Needs `uWaveTime` declared before it.
export const RAIN_RINGS_GLSL = /* glsl */ `
uniform float uRain;
float rainHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec3 rainRings(vec2 p, float time, float near) {
    vec3 rings = vec3(0.0);
    if (uRain <= 0.0 || near <= 0.0) return rings;
    vec2 cell = floor(p / ${glslFloat(RING_CELL)});
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 c = cell + vec2(float(i), float(j));
            float h = rainHash(c);
            float t = time / (${glslFloat(RING_SECONDS)} * (0.75 + 0.5 * h)) + h;
            float drop = floor(t);
            float age = fract(t);
            float d = rainHash(c * 1.37 + vec2(drop * 0.618, drop * 1.414));
            if (d > uRain) continue;
            vec2 centre = (c + vec2(rainHash(c + vec2(drop, 17.0)), rainHash(c + vec2(31.0, drop)))) * ${glslFloat(RING_CELL)};
            vec2 away = p - centre;
            float dist = length(away);
            float off = dist - age * ${glslFloat(RING_RADIUS)};
            float band = 1.0 - smoothstep(0.0, ${glslFloat(RING_WIDTH)}, abs(off));
            float fade = (1.0 - age) * (1.0 - age);
            float ring = band * fade;
            rings.x += ring;
            vec2 way = dist > 1e-4 ? away / dist : vec2(0.0);
            rings.yz += way * sign(off) * ring * ${glslFloat(RING_TILT)};
        }
    }
    return rings * near;
}
float rainNear(float viewDistance) {
    return 1.0 - smoothstep(${glslFloat(RING_FADE_NEAR)}, ${glslFloat(RING_FADE_FAR)}, viewDistance);
}
`;
