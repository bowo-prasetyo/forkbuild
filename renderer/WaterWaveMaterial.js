import { LAKE_WAVES, SEA_WAVES, WAVE_KIND, waveNumber, waveAngularSpeed } from '../core/WaterWaves.js';

// Makes a water tile's material move with core/WaterWaves.js: the swell
// lifts and drops the vertices and tilts their normals, and, on the lit top
// surface, the ripples tilt the light per pixel. The waves are written into
// the shader from the very constants core/WaterWaves.js tests, so the drawn
// water and the tested water are the same water.
//
// `waveTime` is a shared { value } (seconds) every water tile's material
// reads, so one write a frame (renderer/Renderer.js) moves all the water at
// once with no per-tile work. Each vertex carries `aSeaShare`
// (core/Hydrology.js#seaShareAt()), which blends lake waves into sea waves
// across a shelf exactly as the colour blends.
//
// Positions are taken in world space, never tile space, so two tiles
// sharing an edge move that edge identically: no seam, the same discipline
// renderer/WaterTileMesh.js already keeps for the still surface.

function glslFloat(v) {
    return v.toPrecision(8);
}

function waveTerms(waves, weight, kind) {
    return waves
        .filter((w) => w.kind === kind)
        .map((w) => `r += ${weight} * waterWave(p, vec2(${glslFloat(w.directionX)}, ${glslFloat(w.directionZ)}), `
            + `${glslFloat(waveNumber(w))}, ${glslFloat(waveAngularSpeed(w))}, ${glslFloat(w.amplitude)}, ${glslFloat(w.phase)});`)
        .join('\n    ');
}

// (height, slope along x, slope along z) of every wave of one kind.
function waveFunction(name, kind) {
    return `vec3 ${name}(vec2 p, float sea) {
    vec3 r = vec3(0.0);
    ${waveTerms(LAKE_WAVES, '(1.0 - sea)', kind)}
    ${waveTerms(SEA_WAVES, 'sea', kind)}
    return r;
}`;
}

const WAVE_COMMON = /* glsl */ `
uniform float uWaveTime;
vec3 waterWave(vec2 p, vec2 d, float k, float omega, float a, float phase) {
    float angle = k * dot(d, p) - omega * uWaveTime + phase;
    float slope = a * k * cos(angle);
    return vec3(a * sin(angle), slope * d.x, slope * d.y);
}
`;

const VERTEX_HEAD = `${WAVE_COMMON}
attribute float aSeaShare;
varying vec2 vWaterXZ;
varying float vSeaShare;
${waveFunction('waterSwell', WAVE_KIND.SWELL)}
`;

// Ripples fade out with distance from the camera: further off, a ripple is
// smaller than a pixel and would only shimmer as a moiré.
const RIPPLE_FADE_NEAR = 12;
const RIPPLE_FADE_FAR = 40;

const FRAGMENT_HEAD = `${WAVE_COMMON}
#define RIPPLE_FADE_NEAR ${glslFloat(RIPPLE_FADE_NEAR)}
#define RIPPLE_FADE_FAR ${glslFloat(RIPPLE_FADE_FAR)}
varying vec2 vWaterXZ;
varying float vSeaShare;
${waveFunction('waterRipple', WAVE_KIND.RIPPLE)}
`;

// `lit` for the top surface (a MeshStandardMaterial: swell, tilted normals,
// ripples); false for the unlit underside a diver sees, which only needs to
// follow the swell so it stays glued to the top.
export function makeWaterWaving(material, waveTime, { lit = true } = {}) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uWaveTime = waveTime;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
            .replace('void main() {', `void main() {
    vWaterXZ = (modelMatrix * vec4(position, 1.0)).xz;
    vSeaShare = aSeaShare;
    vec3 waterSwellNow = waterSwell(vWaterXZ, aSeaShare);`)
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tobjectNormal = normalize(vec3(-waterSwellNow.y, 1.0, -waterSwellNow.z));')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y += waterSwellNow.x;');
        if (lit) {
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
\tvec3 waterRippleNow = waterRipple(vWaterXZ, vSeaShare) * (1.0 - smoothstep(RIPPLE_FADE_NEAR, RIPPLE_FADE_FAR, length(vViewPosition)));
\tnormal = normalize(normal + mat3(viewMatrix) * vec3(-waterRippleNow.y, 0.0, -waterRippleNow.z));`);
        }
    };
    material.customProgramCacheKey = () => (lit ? 'forkbuild-water-waves-lit' : 'forkbuild-water-waves-unlit');
    material.needsUpdate = true;
    return material;
}
