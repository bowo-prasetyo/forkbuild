// Makes a river's water material run with its current: each vertex carries
// the water's velocity (`aFlow`, core/nature/RiverFlow.js#riverFlowAt()) and the
// channel's direction (`aChannel`), how much it breaks into rapids
// (`aRapids`) and how strongly it wells up as a spring (`aSpring`), and the
// fragment shader drifts a soft noise pattern along it, tilting the light
// and lightening the crests, so the surface visibly streams downstream.
//
// The drift is the usual flow-map technique: a pattern pushed along a
// velocity that varies from place to place smears more the longer it runs,
// so two copies run on cycles FLOW_CYCLE seconds long, half a cycle apart,
// each faded out as it resets. The velocity varies smoothly
// (core/nature/RiverFlow.js keeps it continuous), so the current speeds up, slows
// and turns with the river without a seam.
//
// `waveTime` is the shared { value } in seconds the lakes' waves read
// (renderer/WaterWaveMaterial.js), advanced once a frame by
// renderer/Renderer.js. `rain`, a shared { value } as well, is how hard it
// is raining, 0 to 1: rain rings the surface as it does the lakes
// (renderer/RainRings.js). Positions are taken in world space, so tiles meet
// without a seam.

import { RAIN_RINGS_GLSL } from './RainRings.js';

const FLOW_CYCLE = 1.6;
// Off this far from the camera the pattern is smaller than a pixel and
// would only shimmer: it fades out between these distances.
const PATTERN_FADE_NEAR = 18;
const PATTERN_FADE_FAR = 60;
// How hard the pattern tilts the light, and how much it lightens a crest.
const NORMAL_STRENGTH = 0.3;
// How much a raindrop's ring lightens the water.
const RAIN_RING_LIGHTEN = 0.35;
const CREST_LIGHTEN = 0.12;
// Rapids (core/nature/RiverFlow.js#riverRapidsAt(), per vertex as `aRapids`) break
// white: the crests of the drifting pattern turn to foam, more of them the
// rougher the water. Far off, where the pattern fades, a steady share of
// foam stands in for it, so rapids still read from a distance.
const FOAM_COLOR = [0.92, 0.95, 0.96];
const FOAM_STRENGTH = 0.85;
const FAR_FOAM_SHARE = 0.35;
// A spring (core/nature/RiverFlow.js#riverSpringAt(), per vertex as `aSpring`: its
// strength and the way to its centre) wells up: rings spread outward from
// its centre, RING_SPACING apart at RING_SPEED, fading to its rim, and a
// few bubbles break the surface at the middle.
const RING_SPACING = 1.4;
const RING_SPEED = 0.6;
const RING_FADE = 4.5;
const RING_LIGHTEN = 0.18;
const RING_TILT = 0.35;
const BUBBLE_REACH = 1.6;

function glslFloat(v) {
    return v.toPrecision(8);
}

const VERTEX_HEAD = /* glsl */ `
attribute vec2 aFlow;
attribute vec2 aChannel;
attribute float aRapids;
attribute vec3 aSpring;
varying vec2 vRiverXZ;
varying vec2 vFlow;
varying vec2 vChannel;
varying float vRapids;
varying vec3 vSpring;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uWaveTime;
varying vec2 vRiverXZ;
varying vec2 vFlow;
varying vec2 vChannel;
varying float vRapids;
varying vec3 vSpring;
// A hash without sin(), so it stays steady far from the world's origin.
float riverHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float riverNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(riverHash(i), riverHash(i + vec2(1.0, 0.0)), u.x),
               mix(riverHash(i + vec2(0.0, 1.0)), riverHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Streaks drawn out along the river: the pattern is sampled in the
// channel's own frame, longer along it than across. The channel's
// direction, not the current's: where two runs meet in a dip the current
// turns about, and a frame turned with it would leave a seam there.
vec2 riverAxis;
float riverPattern(vec2 p) {
    vec2 q = vec2(dot(p, riverAxis), dot(p, vec2(-riverAxis.y, riverAxis.x)));
    return riverNoise(q * vec2(0.22, 0.6)) * 0.6 + riverNoise(q * vec2(0.5, 1.4) + 17.0) * 0.4;
}
// The pattern and its slope along x and z, at p.
vec3 riverPatternWithSlope(vec2 p) {
    const float e = 0.2;
    float here = riverPattern(p);
    return vec3(here,
        (riverPattern(p + vec2(e, 0.0)) - here) / e,
        (riverPattern(p + vec2(0.0, e)) - here) / e);
}
// A spring's rings and bubbles at this point: (how much they lighten it,
// how far they tilt it outward); vSpring is (strength, way to the centre).
vec2 springWelling() {
    if (vSpring.x <= 0.0) return vec2(0.0);
    float d = length(vSpring.yz);
    float k = 6.2831853 / ${glslFloat(RING_SPACING)};
    float phase = k * d - k * ${glslFloat(RING_SPEED)} * uWaveTime;
    float fade = 1.0 - smoothstep(0.3, ${glslFloat(RING_FADE)}, d);
    float ring = (0.5 + 0.5 * cos(phase)) * fade;
    float bubbles = smoothstep(0.78, 0.92, riverNoise(vRiverXZ * 3.0 + vec2(uWaveTime * 1.7, -uWaveTime * 1.3)))
        * (1.0 - smoothstep(0.2, ${glslFloat(BUBBLE_REACH)}, d));
    return vSpring.x * vec2(ring * ${glslFloat(RING_LIGHTEN)} + bubbles * 0.5, sin(phase) * fade * ${glslFloat(RING_TILT)});
}
vec3 riverSurface() {
    riverAxis = length(vChannel) > 1e-4 ? normalize(vChannel) : vec2(1.0, 0.0);
    float cycle = ${glslFloat(FLOW_CYCLE)};
    float t0 = fract(uWaveTime / cycle);
    float t1 = fract(uWaveTime / cycle + 0.5);
    float w0 = 1.0 - abs(2.0 * t0 - 1.0);
    vec3 a = riverPatternWithSlope(vRiverXZ - vFlow * t0 * cycle);
    vec3 b = riverPatternWithSlope(vRiverXZ - vFlow * t1 * cycle + vec2(7.3, 3.1));
    return mix(b, a, w0);
}
`;

export function makeRiverFlowing(material, waveTime, { rain = { value: 0 } } = {}) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uWaveTime = waveTime;
        shader.uniforms.uRain = rain;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
            .replace('void main() {', `void main() {
    vRiverXZ = (modelMatrix * vec4(position, 1.0)).xz;
    vFlow = aFlow;
    vChannel = aChannel;
    vRapids = aRapids;
    vSpring = aSpring;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}\n${RAIN_RINGS_GLSL}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
\tfloat riverNear = 1.0 - smoothstep(${glslFloat(PATTERN_FADE_NEAR)}, ${glslFloat(PATTERN_FADE_FAR)}, length(vViewPosition));
\tvec3 riverNow = riverSurface();
\tdiffuseColor.rgb *= 1.0 + (riverNow.x - 0.5) * ${glslFloat(2 * CREST_LIGHTEN)} * riverNear;
\tfloat riverFoam = vRapids * mix(${glslFloat(FAR_FOAM_SHARE)}, smoothstep(0.62 - 0.14 * vRapids, 0.74 - 0.14 * vRapids, riverNow.x), riverNear);
\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${FOAM_COLOR.map(glslFloat).join(', ')}), riverFoam * ${glslFloat(FOAM_STRENGTH)});
\tvec2 springNow = springWelling();
\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${FOAM_COLOR.map(glslFloat).join(', ')}), min(1.0, springNow.x));
\tvec3 riverRain = rainRings(vRiverXZ, uWaveTime, rainNear(length(vViewPosition)));
\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${FOAM_COLOR.map(glslFloat).join(', ')}), min(1.0, riverRain.x) * ${glslFloat(RAIN_RING_LIGHTEN)});`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
\tnormal = normalize(normal + mat3(viewMatrix) * vec3(-riverNow.y, 0.0, -riverNow.z) * ${glslFloat(NORMAL_STRENGTH)} * riverNear);
\tvec2 springWay = length(vSpring.yz) > 1e-4 ? normalize(vSpring.yz) : vec2(0.0);
\tnormal = normalize(normal + mat3(viewMatrix) * vec3(springWay.x, 0.0, springWay.y) * springNow.y);
\tnormal = normalize(normal + mat3(viewMatrix) * vec3(-riverRain.y, 0.0, -riverRain.z));`);
    };
    material.customProgramCacheKey = () => 'forkbuild-river-flow';
    material.needsUpdate = true;
    return material;
}
