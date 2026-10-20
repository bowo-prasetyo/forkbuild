import * as THREE from 'three';
import { DAY } from '../core/nature/DayCycle.js';

// World View's clouds: a layer CLOUD_HEIGHT up, covering as much of the sky
// as the weather says (core/nature/Weather.js's cloudCover), drifting with the wind
// by the world's clock, so everyone at a build sees the same clouds in the
// same places. Coloured by the sky's look (core/nature/DayCycle.js): white by day,
// rosy at dusk and dawn, a dim moonlit grey at night, and greyer and heavier
// the more overcast it is.
//
// Drawn on a dome round the camera, inside the sun and the moon
// (renderer/SkyBodies.js) and the stars (renderer/StarSky.js) so it passes
// in front of them, kept there as the camera moves: each pixel looks along
// its own direction up to the layer and reads the clouds there, so they
// slide overhead as the camera walks under them and thin out towards the
// horizon. Builds and hills in front hide them; under water they don't
// show; and with no clouds the dome isn't drawn at all.
//
// The clouds' shapes come from one small tiling noise texture
// (cloudNoise()), read twice at two sizes drifting at two speeds, so they
// change shape as they go.

export const CLOUD_HEIGHT = 180;
// Least height of the layer over the camera, however high it stands.
const MIN_CLEARANCE = 60;
// As a share of the camera's far plane: inside the sun and the moon (0.8).
const DISTANCE_SHARE = 0.75;
// World units across one repeat of the noise, for the big shapes and the
// smaller ones that change them; and how fast each drifts, in world units a
// second.
const SCALE_LARGE = 1600;
const SCALE_SMALL = 430;
const WIND_LARGE = Object.freeze({ x: 3.2, z: 1.3 });
const WIND_SMALL = Object.freeze({ x: 4.4, z: 0.4 });
const SMALL_SHARE = 0.3;
// The noise texture: NOISE_SIZE texels a side, with value-noise octaves
// repeating every NOISE_OCTAVES[i] lattice cells.
export const NOISE_SIZE = 256;
const NOISE_OCTAVES = Object.freeze([4, 8, 16, 32, 64]);
const NOISE_SEED = 0x2c1b3c6d;
// How soft a cloud's edge is, below and above the threshold, in noise.
const EDGE_BELOW = 0.03;
const EDGE_ABOVE = 0.08;
// How far past its edge a cloud reaches its thickest, darkest middle.
const THICKNESS_SPAN = 0.4;
// The most a cloud hides of the sky behind, and how much of its lit colour
// its thick middle loses.
const MAX_OPACITY = 0.94;
const THICK_SHADE = 0.22;

const VERTEX = /* glsl */ `
    varying vec3 vDirection;
    void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAGMENT = /* glsl */ `
    uniform sampler2D uNoise;
    uniform vec2 uOffsetLarge;
    uniform vec2 uOffsetSmall;
    uniform float uClearance;
    uniform float uThreshold;
    uniform float uOvercast;
    uniform vec3 uLit;
    uniform vec3 uShade;
    varying vec3 vDirection;
    void main() {
        vec3 d = normalize(vDirection);
        if (d.y <= 0.0) discard;
        // Where this pixel's line of sight meets the layer, from the camera.
        vec2 reach = d.xz * (uClearance / max(d.y, 0.03));
        float n = texture2D(uNoise, reach / ${SCALE_LARGE.toFixed(1)} + uOffsetLarge).r * ${(1 - SMALL_SHARE).toFixed(3)}
            + texture2D(uNoise, reach / ${SCALE_SMALL.toFixed(1)} + uOffsetSmall).r * ${SMALL_SHARE.toFixed(3)};
        float cloud = smoothstep(uThreshold - ${EDGE_BELOW.toFixed(3)}, uThreshold + ${EDGE_ABOVE.toFixed(3)}, n);
        // Overcast: one grey sheet, still darker where it is thick.
        cloud = max(cloud, uOvercast);
        float thick = smoothstep(uThreshold, uThreshold + ${THICKNESS_SPAN.toFixed(3)}, n);
        vec3 color = mix(uLit, uShade, thick * (1.0 - 0.6 * uOvercast) + 0.3 * uOvercast);
        float horizon = smoothstep(0.04, 0.32, d.y);
        float alpha = cloud * horizon * ${MAX_OPACITY.toFixed(3)};
        if (alpha <= 0.002) discard;
        gl_FragColor = vec4(color, alpha);
    }
`;

export class CloudSky {
    constructor(sceneManager) {
        this._sceneManager = sceneManager;
        this._weather = null;
        const noise = cloudNoise();
        this._levels = mixedLevels(noise);
        const texels = new Uint8Array(noise.length);
        for (let i = 0; i < noise.length; i++) texels[i] = Math.round(noise[i] * 255);
        this._texture = new THREE.DataTexture(texels, NOISE_SIZE, NOISE_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
        this._texture.wrapS = THREE.RepeatWrapping;
        this._texture.wrapT = THREE.RepeatWrapping;
        this._texture.magFilter = THREE.LinearFilter;
        this._texture.minFilter = THREE.LinearMipmapLinearFilter;
        this._texture.generateMipmaps = true;
        this._texture.needsUpdate = true;
        this._material = new THREE.ShaderMaterial({
            uniforms: {
                uNoise: { value: this._texture },
                uOffsetLarge: { value: new THREE.Vector2() },
                uOffsetSmall: { value: new THREE.Vector2() },
                uClearance: { value: CLOUD_HEIGHT },
                uThreshold: { value: 1 },
                uOvercast: { value: 0 },
                uLit: { value: new THREE.Color(0xffffff) },
                uShade: { value: new THREE.Color(0xcccccc) }
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        // The upper half of a unit sphere: the layer is never seen below the
        // horizon.
        this._mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), this._material);
        // After the sun, the moon and the stars, before the rest of what is
        // see-through (water among it), which lies nearer.
        this._mesh.renderOrder = -1;
        this._mesh.frustumCulled = false;
        this._mesh.visible = false;
        this._mesh.userData.cloudSky = true;
        sceneManager.add(this._mesh);
    }

    // `weather` shaped like core/nature/Weather.js's FAIR_WEATHER.
    set(weather) {
        this._weather = weather || null;
    }

    // Places the clouds round `camera` for this frame, where the wind has
    // carried them by `seconds` (the world's clock), coloured for `look`
    // (core/nature/DayCycle.js's, already overcast); `hidden` (under water) puts
    // them out of sight.
    update(camera, seconds, look = DAY, hidden = false) {
        const weather = this._weather;
        const cover = weather ? weather.cloudCover : 0;
        this._mesh.visible = !hidden && cover > 0.001;
        if (!this._mesh.visible) return;
        const time = Number.isFinite(seconds) ? seconds : 0;
        const u = this._material.uniforms;
        u.uThreshold.value = this._levels.thresholdFor(cover);
        u.uOvercast.value = weather.overcast || 0;
        u.uClearance.value = Math.max(CLOUD_HEIGHT - camera.position.y, MIN_CLEARANCE);
        driftOffset(u.uOffsetLarge.value, camera.position, time, WIND_LARGE, SCALE_LARGE);
        driftOffset(u.uOffsetSmall.value, camera.position, time, WIND_SMALL, SCALE_SMALL);
        cloudColors(look, weather.overcast || 0, u.uLit.value, u.uShade.value);
        this._mesh.position.copy(camera.position);
        this._mesh.scale.setScalar(camera.far * DISTANCE_SHARE);
    }

    get mesh() {
        return this._mesh;
    }

    dispose() {
        this._sceneManager.remove(this._mesh);
        this._mesh.geometry.dispose();
        this._material.dispose();
        this._texture.dispose();
    }
}

// Where in the noise the point above the camera is once the wind has blown
// for `seconds`, as a fraction of one repeat: worked out here in full
// precision, so the shader only ever adds small numbers to it.
function driftOffset(out, position, seconds, wind, scale) {
    const x = (position.x - wind.x * seconds) / scale;
    const z = (position.z - wind.z * seconds) / scale;
    out.set(x - Math.floor(x), z - Math.floor(z));
}

// The clouds' lit colour and the colour of their thick middles for `look`:
// the sky's own colour brightened towards the light the sky gives, more so
// the brighter the light (so they glow white by day and stay dim at night),
// greyer and darker as it turns overcast.
const WHITE = new THREE.Color(0xffffff);
const scratchSky = new THREE.Color();
const scratchLight = new THREE.Color();
const scratchSun = new THREE.Color();

export function cloudColors(look, overcast, lit, shade) {
    const light = Math.min(1, (look.hemisphereIntensity + look.sunIntensity) / (DAY.hemisphereIntensity + DAY.sunIntensity));
    scratchSky.setHex(look.sky);
    scratchLight.setHex(look.hemisphereSky).lerp(WHITE, 0.55).lerp(scratchSun.setHex(look.sunColor), 0.2);
    lit.copy(scratchSky).lerp(scratchLight, 0.3 + 0.65 * light * light);
    lit.multiplyScalar(1 - 0.1 * overcast);
    shade.copy(lit).multiplyScalar(1 - THICK_SHADE - 0.08 * overcast);
}

// The noise the clouds are shaped from: NOISE_SIZE × NOISE_SIZE values from
// 0 to 1 that tile seamlessly, the same on every device.
export function cloudNoise() {
    const values = new Float32Array(NOISE_SIZE * NOISE_SIZE);
    let amplitude = 1;
    for (let o = 0; o < NOISE_OCTAVES.length; o++) {
        const period = NOISE_OCTAVES[o];
        const cell = NOISE_SIZE / period;
        for (let y = 0; y < NOISE_SIZE; y++) {
            const gy = y / cell;
            const y0 = Math.floor(gy);
            const ty = fade(gy - y0);
            for (let x = 0; x < NOISE_SIZE; x++) {
                const gx = x / cell;
                const x0 = Math.floor(gx);
                const tx = fade(gx - x0);
                const a = lattice(o, x0 % period, y0 % period);
                const b = lattice(o, (x0 + 1) % period, y0 % period);
                const c = lattice(o, x0 % period, (y0 + 1) % period);
                const d = lattice(o, (x0 + 1) % period, (y0 + 1) % period);
                const top = a + (b - a) * tx;
                const bottom = c + (d - c) * tx;
                values[y * NOISE_SIZE + x] += (top + (bottom - top) * ty) * amplitude;
            }
        }
        amplitude *= 0.5;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    for (let i = 0; i < values.length; i++) values[i] = (values[i] - min) / (max - min);
    return values;
}

// How the noise the shader mixes (two reads, SMALL_SHARE of the second) is
// spread, so a cloud cover can be turned into the threshold above which that
// share of the sky is cloud.
function mixedLevels(noise) {
    const n = noise.length;
    const mixed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        // A texel far off in the texture stands in for the second read.
        const j = (i * 7919 + 104729) % n;
        mixed[i] = noise[i] * (1 - SMALL_SHARE) + noise[j] * SMALL_SHARE;
    }
    mixed.sort();
    return {
        thresholdFor(cover) {
            const c = Math.min(Math.max(cover, 0), 1);
            if (c <= 0) return 2;
            const index = Math.min(n - 1, Math.max(0, Math.floor((1 - c) * n)));
            // At full cover, below everything: the edge's softness too.
            return c >= 1 ? mixed[0] - EDGE_ABOVE : mixed[index];
        }
    };
}

function fade(t) {
    return t * t * (3 - 2 * t);
}

function lattice(octave, x, y) {
    let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(octave + 1, 0x9e3779b9) ^ NOISE_SEED;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
