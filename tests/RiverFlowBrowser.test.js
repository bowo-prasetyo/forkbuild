// @environment browser
import * as THREE from 'three';
import { makeRiverFlowing } from '../renderer/RiverFlowMaterial.js';
import { assert } from './support/Assert.js';

// A river's water drawn with real WebGL (renderer/RiverFlowMaterial.js):
// the shader compiles, and its pattern drifts downstream — the way the
// current carries it — not upstream and not across.

const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const SIZE = 128;
const SPAN = 16; // world units across the view: 8 pixels a unit
const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
renderer.setSize(SIZE, SIZE, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 2);
scene.add(sun);
// Looking straight down from close enough that the pattern is not faded.
const camera = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 0.1, 100);
camera.position.set(0, 8, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);

const waveTime = { value: 0 };

function sheet(vx, vz, rapids = 0) {
    const geometry = new THREE.PlaneGeometry(SPAN, SPAN, 8, 8);
    geometry.rotateX(-Math.PI / 2);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 4);
    const flows = new Float32Array(count * 2);
    const channels = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        colors.set([0.4, 0.58, 0.72, 1], i * 4);
        flows.set([vx, vz], i * 2);
        channels.set([1, 0], i * 2);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geometry.setAttribute('aFlow', new THREE.BufferAttribute(flows, 2));
    geometry.setAttribute('aChannel', new THREE.BufferAttribute(channels, 2));
    geometry.setAttribute('aRapids', new THREE.BufferAttribute(new Float32Array(count).fill(rapids), 1));
    return new THREE.Mesh(geometry, makeRiverFlowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }), waveTime));
}

function frame(time) {
    waveTime.value = time;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    const luma = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < luma.length; i++) luma[i] = out[i * 4] + out[i * 4 + 1] + out[i * 4 + 2];
    return luma;
}

// The shift (in pixels along screen x, which is world +x) that best lines
// `later` up with `earlier`.
function bestShift(earlier, later, axis) {
    let best = 0;
    let bestError = Infinity;
    for (let shift = -8; shift <= 8; shift++) {
        let error = 0;
        let n = 0;
        for (let row = 10; row < SIZE - 10; row++) {
            for (let col = 10; col < SIZE - 10; col++) {
                const [r2, c2] = axis === 'x' ? [row, col + shift] : [row + shift, col];
                const d = later[r2 * SIZE + c2] - earlier[row * SIZE + col];
                error += d * d;
                n++;
            }
        }
        if (error / n < bestError) { bestError = error / n; best = shift; }
    }
    return best;
}

{
    // Running along +x at 1.2 units a second: in 0.25 s the pattern should
    // move about 0.3 units, 2.4 pixels, towards +x. The two moments sit in
    // the middle of both flow cycles (core FLOW_CYCLE 1.6 s), so neither
    // copy of the pattern resets between them.
    const water = sheet(1.2, 0);
    scene.add(water);
    const a = frame(0.2);
    const b = frame(0.45);
    let changed = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 3) changed++;
    assert(changed > a.length / 5, `the surface moves as time passes (${changed} pixels changed)`);
    const shift = bestShift(a, b, 'x');
    assert(shift >= 1 && shift <= 5, `the pattern drifts downstream, towards +x (best shift ${shift} px)`);
    const again = frame(0.2);
    assert(a.every((v, i) => v === again[i]), 'at one moment the surface draws the same every time');
    scene.remove(water);
    console.log('✓ the pattern drifts downstream with the current');

    // Turned around, it drifts the other way.
    const back = sheet(-1.2, 0);
    scene.add(back);
    const shiftBack = bestShift(frame(0.2), frame(0.45), 'x');
    assert(shiftBack <= -1 && shiftBack >= -5, `against +x it drifts towards -x (best shift ${shiftBack} px)`);
    scene.remove(back);
    console.log('✓ a current the other way drifts the other way');
}

{
    // Rapids break white: the same water, running rough, is lighter, with
    // foam on its crests.
    const mean = (luma) => luma.reduce((sum, v) => sum + v, 0) / luma.length;
    const calm = sheet(1.2, 0, 0);
    scene.add(calm);
    const smooth = frame(0.3);
    scene.remove(calm);
    const rough = sheet(1.2, 0, 1);
    scene.add(rough);
    const broken = frame(0.3);
    scene.remove(rough);
    assert(mean(broken) > mean(smooth) * 1.05, `rapids are lighter (${mean(broken).toFixed(0)} against ${mean(smooth).toFixed(0)})`);
    // Foam: pixels lighter than anything on the calm water.
    const brightestCalm = Math.max(...smooth);
    const foam = broken.filter((v) => v > brightestCalm + 10).length;
    assert(foam > SIZE * SIZE / 20, `rapids foam on their crests (${foam} pixels lighter than any calm water)`);
    console.log('✓ rapids break white');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the river shader compiles (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
