import * as THREE from 'three';
import { DAY } from '../core/nature/DayCycle.js';
import { rainColor } from './RainFall.js';

// What drifts down round the camera with the seasons: snowflakes in winter
// (core/nature/Weather.js's snow), leaves in autumn and blossom petals in spring
// (core/nature/Season.js's leafDrift and petalDrift, where trees that shed them
// stand: renderer/TreeForest.js#deciduousNearby).
//
// Drawn as renderer/RainFall.js draws the rain, in one draw: every flake's
// place in a box round the camera, how far through its fall it is, how it
// sways and spins, worked out in the vertex shader from its own fixed
// numbers and the time; a flake leaving the box comes back in on the other
// side. A flake falls only if its rank is below how much is falling, so a
// few flakes are a flurry and all of them a blizzard. Each is a point
// sprite: a soft round flake, or a leaf or a petal turning as it falls.
//
// Seen through, depth-tested but not written. Under water, or with nothing
// falling, nothing is drawn. Inside the build the avatar stands in
// (setShelter()) nothing falls below its top, as with the rain.

export const DRIFT = Object.freeze({ SNOW: 'SNOW', LEAVES: 'LEAVES', PETALS: 'PETALS' });

// count: how many flakes at most. width/height/top: the box round the camera
// and how far its top is above it. speed: metres a second down. size: a
// flake's size, in metres. sway: how far it swings from side to side as it
// falls, in metres. spin: how fast a leaf or petal turns. drift: how far it
// is carried along by the wind for each metre it falls.
const KINDS = Object.freeze({
    [DRIFT.SNOW]: Object.freeze({ count: 1600, width: 32, height: 20, top: 14, speed: 1.4, size: 0.07, sway: 0.5, spin: 0, drift: 0.25, shape: 0 }),
    [DRIFT.LEAVES]: Object.freeze({ count: 600, width: 24, height: 12, top: 8, speed: 1.0, size: 0.2, sway: 1.1, spin: 2.6, drift: 0.35, shape: 1 }),
    [DRIFT.PETALS]: Object.freeze({ count: 700, width: 22, height: 10, top: 7, speed: 0.6, size: 0.1, sway: 0.8, spin: 3.2, drift: 0.45, shape: 2 })
});

// The colours each kind's flakes are drawn from.
const PALETTES = Object.freeze({
    [DRIFT.SNOW]: [[1, 1, 1]],
    [DRIFT.LEAVES]: [[0.70, 0.28, 0.16], [0.80, 0.48, 0.18], [0.82, 0.68, 0.30], [0.55, 0.40, 0.24]],
    [DRIFT.PETALS]: [[0.97, 0.80, 0.86], [0.98, 0.95, 0.93], [0.95, 0.72, 0.80]]
});

const DAY_OPACITY = 0.9;
const NIGHT_OPACITY = 0.55;

function vertexShader(kind) {
    const k = KINDS[kind];
    const f = (v) => v.toFixed(4);
    return /* glsl */ `
    attribute vec4 aFlake;
    attribute vec3 aTint;
    uniform vec3 uCamera;
    uniform float uTime;
    uniform float uAmount;
    uniform vec2 uWind;
    uniform float uPixels;
    uniform vec4 uShelter;
    uniform float uShelterTop;
    varying float vFade;
    varying float vTurn;
    varying vec3 vTint;
    void main() {
        vTint = aTint;
        if (aFlake.w >= uAmount) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vFade = 0.0;
            return;
        }
        float fallen = fract(aFlake.z + uTime * ${f(k.speed / k.height)});
        float drop = fallen * ${f(k.height)};
        float phase = aFlake.z * 6.2831 + uTime * (0.6 + aFlake.x * 0.8);
        vec2 sway = vec2(sin(phase), cos(phase * 0.7 + aFlake.y * 3.0)) * ${f(k.sway)};
        vec2 around = mod(aFlake.xy * ${f(k.width)} - uCamera.xz + uWind * drop * ${f(k.drift)}, ${f(k.width)}) - ${f(k.width / 2)};
        vec3 world = vec3(uCamera.x + around.x + sway.x, uCamera.y + ${f(k.top)} - drop, uCamera.z + around.y + sway.y);
        if (world.y < uShelterTop && world.x > uShelter.x && world.x < uShelter.y && world.z > uShelter.z && world.z < uShelter.w) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vFade = 0.0;
            return;
        }
        float side = 1.0 - smoothstep(${f(k.width * 0.3)}, ${f(k.width / 2)}, length(around));
        float ends = smoothstep(0.0, 0.08, fallen) * (1.0 - smoothstep(0.88, 1.0, fallen));
        vFade = side * ends;
        vTurn = phase * ${f(k.spin)} + aFlake.y * 6.2831;
        vec4 view = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(${f(k.size)} * (0.7 + 0.6 * aFlake.x) * uPixels / max(-view.z, 0.1), 0.0, 48.0);
    }
`;
}

function fragmentShader(kind) {
    const shape = KINDS[kind].shape;
    return /* glsl */ `
    uniform vec3 uLight;
    uniform float uOpacity;
    varying float vFade;
    varying float vTurn;
    varying vec3 vTint;
    void main() {
        vec2 p = gl_PointCoord - 0.5;
        float alpha;
        ${shape === 0 ? `
        alpha = 1.0 - smoothstep(0.2, 0.5, length(p));` : `
        // A leaf or petal, turning: an ellipse, narrowed as it turns edge on.
        float c = cos(vTurn);
        float s = sin(vTurn);
        vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
        float edgeOn = 0.25 + 0.75 * abs(sin(vTurn * 0.7));
        q.y /= ${shape === 1 ? '0.5' : '0.38'} * edgeOn;
        alpha = 1.0 - smoothstep(0.38, 0.48, length(q));`}
        alpha *= uOpacity * vFade;
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(vTint * uLight, alpha);
    }
`;
}

export class Drift {
    constructor(sceneManager, kind = DRIFT.SNOW) {
        this._sceneManager = sceneManager;
        this._kind = KINDS[kind] ? kind : DRIFT.SNOW;
        const spec = KINDS[this._kind];
        this._amount = 0;
        const flakes = new Float32Array(spec.count * 4);
        const tints = new Float32Array(spec.count * 3);
        const palette = PALETTES[this._kind];
        for (let i = 0; i < spec.count; i++) {
            // Ranks spread evenly, so an amount of a falls exactly a of them.
            flakes.set([unit(i, 1), unit(i, 2), unit(i, 3), (i + 0.5) / spec.count], i * 4);
            const tint = palette[Math.floor(unit(i, 4) * palette.length)];
            const shade = 0.85 + 0.15 * unit(i, 5);
            tints.set(tint.map((c) => c * shade), i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(spec.count * 3), 3));
        geometry.setAttribute('aFlake', new THREE.BufferAttribute(flakes, 4));
        geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
        this._material = new THREE.ShaderMaterial({
            uniforms: {
                uCamera: { value: new THREE.Vector3() },
                uTime: { value: 0 },
                uAmount: { value: 0 },
                uWind: { value: new THREE.Vector2(0.92, 0.39) },
                uPixels: { value: 800 },
                uShelter: { value: new THREE.Vector4(0, 0, 0, 0) },
                uShelterTop: { value: -1e9 },
                uLight: { value: new THREE.Color(1, 1, 1) },
                uOpacity: { value: DAY_OPACITY }
            },
            vertexShader: vertexShader(this._kind),
            fragmentShader: fragmentShader(this._kind),
            transparent: true,
            depthWrite: false,
            fog: false
        });
        this._points = new THREE.Points(geometry, this._material);
        this._points.frustumCulled = false;
        this._points.visible = false;
        this._points.userData.drift = this._kind;
        sceneManager.add(this._points);
    }

    get kind() {
        return this._kind;
    }

    get points() {
        return this._points;
    }

    get amount() {
        return this._amount;
    }

    // How much is falling, 0 to 1.
    set(amount) {
        this._amount = Number.isFinite(amount) ? Math.min(Math.max(amount, 0), 1) : 0;
    }

    // Keeps it off `shelter`, as renderer/RainFall.js#setShelter() does.
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

    // Lets it fall round `camera` for this frame, `seconds` into its fall
    // (any steady clock), lit for `look`, carried along `wind` (a direction
    // on the ground, as long as the wind is strong, 0 to 1), drawn for a view
    // `pixelHeight` pixels tall; `hidden` (under water) stops it.
    update(camera, seconds, look = DAY, hidden = false, { wind = null, pixelHeight = 800 } = {}) {
        this._points.visible = !hidden && this._amount > 0.001;
        if (!this._points.visible) return;
        const spec = KINDS[this._kind];
        const u = this._material.uniforms;
        u.uCamera.value.copy(camera.position);
        const cycle = spec.height / spec.speed;
        u.uTime.value = Number.isFinite(seconds) ? seconds % (cycle * 100) : 0;
        u.uAmount.value = this._amount;
        if (wind) u.uWind.value.set(wind.x, wind.y);
        const fov = camera.isPerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 3;
        u.uPixels.value = pixelHeight / (2 * Math.tan(fov / 2));
        // As bright as the light the sky gives (renderer/RainFall.js's
        // streaks, without their grey).
        rainColor(look, u.uLight.value);
        u.uLight.value.multiplyScalar(1.25);
        u.uOpacity.value = DAY_OPACITY + (NIGHT_OPACITY - DAY_OPACITY) * (look.glow || 0);
    }

    dispose() {
        this._sceneManager.remove(this._points);
        this._points.geometry.dispose();
        this._material.dispose();
    }
}

// A flake's `salt`th number in [0, 1), the same every time.
function unit(i, salt) {
    let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}
