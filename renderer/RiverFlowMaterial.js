// Makes a river's water material run with its current: each vertex carries
// the water's velocity (`aFlow`, core/RiverFlow.js#riverFlowAt()) and the
// channel's direction (`aChannel`), and the
// fragment shader drifts a soft noise pattern along it, tilting the light
// and lightening the crests, so the surface visibly streams downstream.
//
// The drift is the usual flow-map technique: a pattern pushed along a
// velocity that varies from place to place smears more the longer it runs,
// so two copies run on cycles FLOW_CYCLE seconds long, half a cycle apart,
// each faded out as it resets. The velocity varies smoothly
// (core/RiverFlow.js keeps it continuous), so the current speeds up, slows
// and turns with the river without a seam.
//
// `waveTime` is the shared { value } in seconds the lakes' waves read
// (renderer/WaterWaveMaterial.js), advanced once a frame by
// renderer/Renderer.js. Positions are taken in world space, so tiles meet
// without a seam.

const FLOW_CYCLE = 1.6;
// Off this far from the camera the pattern is smaller than a pixel and
// would only shimmer: it fades out between these distances.
const PATTERN_FADE_NEAR = 18;
const PATTERN_FADE_FAR = 60;
// How hard the pattern tilts the light, and how much it lightens a crest.
const NORMAL_STRENGTH = 0.3;
const CREST_LIGHTEN = 0.12;

function glslFloat(v) {
    return v.toPrecision(8);
}

const VERTEX_HEAD = /* glsl */ `
attribute vec2 aFlow;
attribute vec2 aChannel;
varying vec2 vRiverXZ;
varying vec2 vFlow;
varying vec2 vChannel;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uWaveTime;
varying vec2 vRiverXZ;
varying vec2 vFlow;
varying vec2 vChannel;
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

export function makeRiverFlowing(material, waveTime) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uWaveTime = waveTime;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
            .replace('void main() {', `void main() {
    vRiverXZ = (modelMatrix * vec4(position, 1.0)).xz;
    vFlow = aFlow;
    vChannel = aChannel;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
\tfloat riverNear = 1.0 - smoothstep(${glslFloat(PATTERN_FADE_NEAR)}, ${glslFloat(PATTERN_FADE_FAR)}, length(vViewPosition));
\tvec3 riverNow = riverSurface();
\tdiffuseColor.rgb *= 1.0 + (riverNow.x - 0.5) * ${glslFloat(2 * CREST_LIGHTEN)} * riverNear;`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
\tnormal = normalize(normal + mat3(viewMatrix) * vec3(-riverNow.y, 0.0, -riverNow.z) * ${glslFloat(NORMAL_STRENGTH)} * riverNear);`);
    };
    material.customProgramCacheKey = () => 'forkbuild-river-flow';
    material.needsUpdate = true;
    return material;
}
