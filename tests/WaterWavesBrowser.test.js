// @environment browser
import * as THREE from 'three';
import { makeWaterWaving } from '../renderer/WaterWaveMaterial.js';
import { waterWaveAt } from '../core/WaterWaves.js';
import { assert } from './support/Assert.js';

// The waves drawn with real WebGL (renderer/WaterWaveMaterial.js): the
// shader lifts the surface exactly where core/WaterWaves.js says, the lit
// top glints differently as time passes, and every variant compiles.

const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const WIDTH = 64;
const HEIGHT = 128;
const canvas = document.createElement('canvas');
canvas.width = WIDTH;
canvas.height = HEIGHT;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
renderer.setSize(WIDTH, HEIGHT, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const waveTime = { value: 0 };

function read() {
    const gl = renderer.getContext();
    const out = new Uint8Array(WIDTH * HEIGHT * 4);
    gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
}

// --- Side view: a strip of sea along x, seen edge-on, rises and falls where
// the core says. The view spans x in [0, 16] and y in [-0.32, 0.32].
{
    const X_SPAN = 16;
    const Y_HALF = 0.32;
    const camera = new THREE.OrthographicCamera(0, X_SPAN, Y_HALF, -Y_HALF, 0.1, 100);
    camera.position.set(0, 0, 10);
    // A thin upright ribbon, so every column covers a pixel or two.
    const geometry = new THREE.PlaneGeometry(X_SPAN, 0.012, 512, 1);
    geometry.translate(X_SPAN / 2, 0, 0);
    geometry.setAttribute('aSeaShare', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1), 1));
    const line = new THREE.Mesh(geometry, makeWaterWaving(new THREE.MeshBasicMaterial({ color: 0xffffff }), waveTime, { lit: false }));
    scene.add(line);

    for (const time of [0, 2.5, 41.75]) {
        waveTime.value = time;
        renderer.render(scene, camera);
        const pixels = read();
        let checked = 0;
        for (let column = 4; column < WIDTH - 4; column += 6) {
            let sum = 0;
            let count = 0;
            for (let row = 0; row < HEIGHT; row++) {
                if (pixels[(row * WIDTH + column) * 4] > 128) { sum += row; count++; }
            }
            assert(count > 0, `the strip shows in column ${column} at time ${time}`);
            const drawn = ((sum / count + 0.5) / HEIGHT) * 2 * Y_HALF - Y_HALF;
            const x = ((column + 0.5) / WIDTH) * X_SPAN;
            const expected = waterWaveAt(1, x, 0, time).height;
            assert(Math.abs(drawn - expected) < 0.02, `at x ${x.toFixed(2)}, time ${time}, the surface is drawn at ${drawn.toFixed(3)}, the core says ${expected.toFixed(3)}`);
            checked++;
        }
        assert(checked > 5, 'several columns were checked');
    }
    scene.remove(line);
    console.log('✓ the drawn swell matches core/WaterWaves.js');
}

// --- Top view: the lit surface (as in renderer/WaterTileMesh.js) glints
// differently as time passes, and the unlit underside draws too.
{
    const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100);
    camera.position.set(0, 6, 4);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(0, 5, -4);
    scene.add(sun);
    const geometry = new THREE.PlaneGeometry(12, 12, 24, 24);
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute('aSeaShare', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1), 1));
    const top = new THREE.Mesh(geometry, makeWaterWaving(new THREE.MeshStandardMaterial({ color: 0x6688aa, roughness: 0.4 }), waveTime));
    top.add(new THREE.Mesh(geometry, makeWaterWaving(new THREE.MeshBasicMaterial({ color: 0x9fd8e8, side: THREE.BackSide }), waveTime, { lit: false })));
    scene.add(top);

    waveTime.value = 0;
    renderer.render(scene, camera);
    const still = read();
    renderer.render(scene, camera);
    const again = read();
    assert(still.every((v, i) => v === again[i]), 'at one time the surface draws the same every frame');
    waveTime.value = 1.3;
    renderer.render(scene, camera);
    const later = read();
    let changed = 0;
    for (let i = 0; i < later.length; i += 4) {
        if (Math.abs(later[i + 2] - still[i + 2]) > 2) changed++;
    }
    assert(changed > (WIDTH * HEIGHT) / 10, `the light on the water shifts as the waves move (${changed} pixels changed)`);
    console.log('✓ the lit surface glints differently as the waves move');

    camera.position.set(0, -3, 0.01);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const below = read();
    let underside = 0;
    for (let i = 0; i < below.length; i += 4) {
        if (below[i + 2] > 150) underside++;
    }
    assert(underside > (WIDTH * HEIGHT) / 2, 'seen from below, the underside draws');
    console.log('✓ the underside, seen from below, draws');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the water wave shaders compile (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
