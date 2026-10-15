import * as THREE from 'three';
import { DAY } from '../core/DayCycle.js';

// World View's rain: streaks falling all round the camera, as many as the
// weather's rain says (core/Weather.js, 0 to 1), coloured by the sky's look
// (core/DayCycle.js) so they are pale grey by day and faint at night.
//
// DROP_COUNT drops, each a short line from its top to its tip, in one draw:
// every drop's place in a box BOX_WIDTH across and BOX_HEIGHT tall round the
// camera, and how far through its fall it is, are worked out in the vertex
// shader from its own fixed numbers and the time. A drop leaving the box on
// one side comes back in on the other (its place is wrapped round the
// camera), so the rain goes wherever the camera goes, and costs no more far
// from the world's origin than near it. A drop falls only if its rank is
// below the rain's strength: drizzle is a few of them, a downpour all of
// them. The rest are folded away out of view.
//
// Seen through, depth-tested but not written, so builds and hills in front
// hide the rain behind them. Under water, or with no rain, nothing is drawn.
// Inside the build the avatar stands in (setShelter(): its footprint and its
// top, application/worldNavigation/avatarPresenceMethods.js), no drop falls
// below the top, so it doesn't rain in the room, while it still rains outside
// the windows. Other builds' roofs it knows nothing of, but their walls hide
// what falls inside them.

export const DROP_COUNT = 3000;
export const BOX_WIDTH = 36;
export const BOX_HEIGHT = 24;
// The top of the box above the camera.
const BOX_TOP = 16;
// World units a second, and a streak's length.
export const FALL_SPEED = 14;
const STREAK_LENGTH = 0.7;
// A slight slant, as if blown: how far a drop drifts sideways for each unit
// it falls.
const SLANT = Object.freeze({ x: 0.12, z: 0.05 });
// How see-through the streaks are, by day and in the dark.
const DAY_OPACITY = 0.45;
const NIGHT_OPACITY = 0.25;

const VERTEX = /* glsl */ `
    attribute vec4 aDrop;
    attribute float aTip;
    uniform vec3 uCamera;
    uniform float uTime;
    uniform float uRain;
    uniform vec4 uShelter;
    uniform float uShelterTop;
    varying float vFade;
    void main() {
        if (aDrop.w >= uRain) {
            // Not falling: folded away behind the far plane.
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            vFade = 0.0;
            return;
        }
        float fallen = fract(aDrop.z + uTime * ${(FALL_SPEED / BOX_HEIGHT).toFixed(6)});
        float drop = fallen * ${BOX_HEIGHT.toFixed(1)};
        vec2 around = mod(aDrop.xy * ${BOX_WIDTH.toFixed(1)} - uCamera.xz, ${BOX_WIDTH.toFixed(1)}) - ${(BOX_WIDTH / 2).toFixed(1)};
        vec3 world = vec3(uCamera.x + around.x, uCamera.y + ${BOX_TOP.toFixed(1)} - drop, uCamera.z + around.y);
        world.xz += vec2(${SLANT.x.toFixed(3)}, ${SLANT.z.toFixed(3)}) * drop;
        // Under the shelter's roof, any part of its streak: folded away like a
        // drop that isn't falling.
        if (world.y - ${STREAK_LENGTH.toFixed(2)} < uShelterTop && world.x > uShelter.x && world.x < uShelter.y && world.z > uShelter.z && world.z < uShelter.w) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            vFade = 0.0;
            return;
        }
        world += vec3(${SLANT.x.toFixed(3)}, -1.0, ${SLANT.z.toFixed(3)}) * (aTip * ${STREAK_LENGTH.toFixed(2)});
        // Thin out towards the box's sides and its top and bottom, so its
        // edges never show.
        float side = 1.0 - smoothstep(${(BOX_WIDTH * 0.32).toFixed(1)}, ${(BOX_WIDTH / 2).toFixed(1)}, length(around));
        float ends = smoothstep(0.0, 0.1, fallen) * (1.0 - smoothstep(0.85, 1.0, fallen));
        vFade = side * ends * mix(0.35, 1.0, aTip);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    }
`;

const FRAGMENT = /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vFade;
    void main() {
        float alpha = uOpacity * vFade;
        if (alpha <= 0.003) discard;
        gl_FragColor = vec4(uColor, alpha);
    }
`;

export class RainFall {
    constructor(sceneManager) {
        this._sceneManager = sceneManager;
        this._rain = 0;
        const drops = new Float32Array(DROP_COUNT * 2 * 4);
        const tips = new Float32Array(DROP_COUNT * 2);
        for (let i = 0; i < DROP_COUNT; i++) {
            const x = unit(i, 1);
            const z = unit(i, 2);
            const phase = unit(i, 3);
            // Ranks spread evenly, so a rain of r drops exactly r of them.
            const rank = (i + 0.5) / DROP_COUNT;
            for (let end = 0; end < 2; end++) {
                drops.set([x, z, phase, rank], (i * 2 + end) * 4);
                tips[i * 2 + end] = end;
            }
        }
        const geometry = new THREE.BufferGeometry();
        // Positions are made in the shader; this only gives each vertex a slot.
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROP_COUNT * 2 * 3), 3));
        geometry.setAttribute('aDrop', new THREE.BufferAttribute(drops, 4));
        geometry.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
        this._material = new THREE.ShaderMaterial({
            uniforms: {
                uCamera: { value: new THREE.Vector3() },
                uTime: { value: 0 },
                uRain: { value: 0 },
                // (minX, maxX, minZ, maxZ) and top; with none, below everything.
                uShelter: { value: new THREE.Vector4(0, 0, 0, 0) },
                uShelterTop: { value: -1e9 },
                uColor: { value: new THREE.Color(0xcfd8e0) },
                uOpacity: { value: DAY_OPACITY }
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        this._lines = new THREE.LineSegments(geometry, this._material);
        this._lines.frustumCulled = false;
        this._lines.visible = false;
        this._lines.userData.rainFall = true;
        sceneManager.add(this._lines);
    }

    // How hard it rains, 0 to 1 (core/Weather.js's rain).
    set(rain) {
        this._rain = Number.isFinite(rain) ? Math.min(Math.max(rain, 0), 1) : 0;
    }

    // Keeps the rain off `shelter`: `{ minX, maxX, minZ, maxZ, top }` in
    // world coordinates, the build the avatar stands in; null lets it fall
    // everywhere.
    setShelter(shelter) {
        const u = this._material.uniforms;
        const valid = shelter && [shelter.minX, shelter.maxX, shelter.minZ, shelter.maxZ, shelter.top].every(Number.isFinite);
        if (valid) {
            u.uShelter.value.set(shelter.minX, shelter.maxX, shelter.minZ, shelter.maxZ);
            u.uShelterTop.value = shelter.top;
        } else {
            u.uShelter.value.set(0, 0, 0, 0);
            u.uShelterTop.value = -1e9;
        }
    }

    // Lets the rain fall round `camera` for this frame, `seconds` into its
    // fall (any steady clock), coloured for `look`; `hidden` (under water)
    // stops it.
    update(camera, seconds, look = DAY, hidden = false) {
        this._lines.visible = !hidden && this._rain > 0.001;
        if (!this._lines.visible) return;
        const u = this._material.uniforms;
        u.uCamera.value.copy(camera.position);
        // Kept small, for the shader's precision: the fall repeats every
        // BOX_HEIGHT / FALL_SPEED seconds anyway.
        const cycle = BOX_HEIGHT / FALL_SPEED;
        u.uTime.value = Number.isFinite(seconds) ? (seconds % (cycle * 1000)) : 0;
        u.uRain.value = this._rain;
        rainColor(look, u.uColor.value);
        u.uOpacity.value = DAY_OPACITY + (NIGHT_OPACITY - DAY_OPACITY) * (look.glow || 0);
    }

    get lines() {
        return this._lines;
    }

    dispose() {
        this._sceneManager.remove(this._lines);
        this._lines.geometry.dispose();
        this._material.dispose();
    }
}

// The streaks' colour for `look`: the light the sky gives, paled towards
// white and dimmed with it.
const WHITE = new THREE.Color(0xffffff);
export function rainColor(look, out) {
    const light = Math.min(1, (look.hemisphereIntensity + look.sunIntensity) / (DAY.hemisphereIntensity + DAY.sunIntensity));
    return out.setHex(look.hemisphereSky).lerp(WHITE, 0.4).multiplyScalar(0.55 + 0.4 * light);
}

// A drop's `salt`th number in [0, 1), the same every time.
function unit(i, salt) {
    let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}
