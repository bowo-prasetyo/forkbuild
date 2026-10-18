import * as THREE from 'three';
import { CELESTIAL_POLE, starField, milkyWayRibbon } from '../core/StarField.js';

// World View's stars and the Milky Way (core/StarField.js), drawn as far off
// as the camera sees and kept there as it moves, like the sun and the moon
// (renderer/SkyBodies.js), and turned with the sky once a day round the
// celestial pole. They come out as dusk deepens and fade at dawn, twinkle a
// little, and thin out towards the horizon. Builds, hills and the moon in
// front hide them; under water they don't show.
//
// The moon washes them out: the more of it is lit, the fainter the stars,
// and the Milky Way fainter still, so a new moon's night shows the most of
// them, as the night always did, and a full moon's the least.
//
// One draw for the stars and one for the Milky Way's glow, with additive
// blending in the opaque pass before everything else (renderOrder), so
// whatever is drawn after them, the moon among it, covers them.

// Just inside the sun and the moon (0.8), as a share of the far plane.
const DISTANCE_SHARE = 0.85;
// Where, in the look's glow (0 by day, 1 at night), stars start to show and
// where they are all out.
const APPEAR_FROM = 0.72;
const ALL_OUT_AT = 0.98;
// The Milky Way's glow: how wide either side of its middle, and how bright.
const MILKY_WAY_HALF_WIDTH = 0.2;
const MILKY_WAY_GLOW = new THREE.Color(0x3a4468);
const RIBBON_SEGMENTS = 180;
// How much of the stars' and of the Milky Way's light a full moon takes away.
const MOON_STAR_DIMMING = 0.45;
const MOON_MILKY_WAY_DIMMING = 0.75;

const STAR_VERTEX = /* glsl */ `
    attribute float aSize;
    attribute float aBrightness;
    attribute float aPhase;
    attribute vec3 aColor;
    uniform float uNight;
    uniform float uStarLight;
    uniform float uTime;
    uniform float uPixelRatio;
    varying vec3 vColor;
    void main() {
        vec3 world = normalize(mat3(modelMatrix) * position);
        float horizon = smoothstep(-0.02, 0.18, world.y);
        float twinkle = 0.78 + 0.22 * sin(uTime * (1.3 + fract(aPhase * 7.0)) + aPhase);
        vColor = aColor * aBrightness * twinkle * horizon * uNight * uStarLight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
    }
`;

const STAR_FRAGMENT = /* glsl */ `
    varying vec3 vColor;
    void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(vColor * alpha, 1.0);
    }
`;

const GLOW_VERTEX = /* glsl */ `
    attribute float aGlow;
    uniform float uNight;
    uniform float uGlowLight;
    varying float vGlow;
    void main() {
        vec3 world = normalize(mat3(modelMatrix) * position);
        vGlow = aGlow * uNight * uGlowLight * smoothstep(-0.02, 0.25, world.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const GLOW_FRAGMENT = /* glsl */ `
    uniform vec3 uColor;
    varying float vGlow;
    void main() {
        gl_FragColor = vec4(uColor * vGlow, 1.0);
    }
`;

const POLE = new THREE.Vector3(CELESTIAL_POLE.x, CELESTIAL_POLE.y, CELESTIAL_POLE.z);

export class StarSky {
    constructor(sceneManager, { pixelRatio = 1 } = {}) {
        this._sceneManager = sceneManager;
        this._night = 0;
        this._turn = 0;
        this._moonlight = 0;
        this._uniforms = {
            uNight: { value: 0 },
            uStarLight: { value: 1 },
            uGlowLight: { value: 1 },
            uTime: { value: 0 },
            uPixelRatio: { value: pixelRatio }
        };

        this._group = new THREE.Group();
        this._group.visible = false;
        this._stars = buildStars(this._uniforms);
        this._milkyWay = buildMilkyWay(this._uniforms);
        this._group.add(this._milkyWay, this._stars);
        sceneManager.add(this._group);
    }

    // How deep into the night it is (core/DayCycle.js's look.glow, 0..1),
    // how far the sky has turned (core/StarField.js#skyTurnAt()), and how
    // much of the moon is lit while it is up (its phase's illumination, 0
    // with no moon up).
    set(night, turn, moonlight = 0) {
        this._night = Number.isFinite(night) ? night : 0;
        this._turn = Number.isFinite(turn) ? turn : 0;
        this._moonlight = Number.isFinite(moonlight) ? Math.min(Math.max(moonlight, 0), 1) : 0;
    }

    // Places the sky round `camera` for this frame at `timeSeconds` (for the
    // twinkle); `hidden` (under water) puts it out of sight.
    update(camera, timeSeconds, hidden = false) {
        const strength = smoothstep(APPEAR_FROM, ALL_OUT_AT, this._night);
        this._uniforms.uNight.value = strength;
        this._uniforms.uStarLight.value = 1 - MOON_STAR_DIMMING * this._moonlight;
        this._uniforms.uGlowLight.value = 1 - MOON_MILKY_WAY_DIMMING * this._moonlight;
        this._uniforms.uTime.value = timeSeconds;
        this._group.visible = !hidden && strength > 0.001;
        if (!this._group.visible) {
            return;
        }
        this._group.position.copy(camera.position);
        this._group.scale.setScalar(camera.far * DISTANCE_SHARE);
        // turnSky()'s turn: by -turn round the pole.
        this._group.quaternion.setFromAxisAngle(POLE, -this._turn);
    }

    get group() {
        return this._group;
    }

    get strength() {
        return this._uniforms.uNight.value;
    }

    dispose() {
        this._sceneManager.remove(this._group);
        for (const object of [this._stars, this._milkyWay]) {
            object.geometry.dispose();
            object.material.dispose();
        }
    }
}

function buildStars(uniforms) {
    const { stars, milkyWay } = starField();
    const all = [...stars, ...milkyWay];
    const positions = new Float32Array(all.length * 3);
    const colors = new Float32Array(all.length * 3);
    const sizes = new Float32Array(all.length);
    const brightness = new Float32Array(all.length);
    const phases = new Float32Array(all.length);
    const color = new THREE.Color();
    all.forEach((star, i) => {
        positions.set([star.x, star.y, star.z], i * 3);
        color.setHex(star.color);
        colors.set([color.r, color.g, color.b], i * 3);
        sizes[i] = star.size;
        brightness[i] = star.brightness;
        phases[i] = star.phase;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const points = new THREE.Points(geometry, skyMaterial(STAR_VERTEX, STAR_FRAGMENT, uniforms));
    points.frustumCulled = false;
    points.renderOrder = -5;
    return points;
}

function buildMilkyWay(uniforms) {
    const ribbon = milkyWayRibbon(RIBBON_SEGMENTS, MILKY_WAY_HALF_WIDTH);
    const positions = new Float32Array(ribbon.length * 3 * 3);
    const glow = new Float32Array(ribbon.length * 3);
    ribbon.forEach(({ left, middle, right }, i) => {
        positions.set([left.x, left.y, left.z, middle.x, middle.y, middle.z, right.x, right.y, right.z], i * 9);
        // Uneven along its length, as the real one is.
        const along = i / RIBBON_SEGMENTS;
        glow.set([0, 0.65 + 0.35 * Math.sin(along * Math.PI * 6) * Math.sin(along * Math.PI * 2 + 1), 0], i * 3);
    });
    const indices = [];
    for (let i = 0; i < ribbon.length - 1; i++) {
        const a = i * 3;
        const b = (i + 1) * 3;
        // left-middle strip and middle-right strip.
        indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    geometry.setIndex(indices);
    const material = skyMaterial(GLOW_VERTEX, GLOW_FRAGMENT, { ...uniforms, uColor: { value: MILKY_WAY_GLOW } });
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -6;
    return mesh;
}

function skyMaterial(vertexShader, fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: false,
        fog: false
    });
}

function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}
