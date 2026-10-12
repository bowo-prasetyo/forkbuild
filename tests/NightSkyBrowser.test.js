// @environment browser
import * as THREE from 'three';
import { StarSky } from '../renderer/StarSky.js';
import { assert } from './support/Assert.js';

// The stars and the Milky Way drawn with real WebGL (renderer/StarSky.js):
// the shaders compile, the night sky lights pixels at night and none by day,
// and something drawn in front, as the moon or a build is, covers them.

const SIZE = 96;
const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const sky = new StarSky({ add: (o) => scene.add(o), remove: (o) => scene.remove(o) });
// Looking straight up, where half the sky's stars are.
const camera = new THREE.PerspectiveCamera(120, 1, 0.1, 1000);
camera.position.set(0, 0, 0);
camera.up.set(0, 0, 1);
camera.lookAt(0, 1, 0);

function litPixels() {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    let lit = 0;
    for (let i = 0; i < out.length; i += 4) {
        if (out[i] + out[i + 1] + out[i + 2] > 30) lit++;
    }
    return lit;
}

sky.set(0, 0);
sky.update(camera, 0);
assert(litPixels() === 0, 'by day the sky has no stars');
sky.set(1, 0.4);
sky.update(camera, 3);
const night = litPixels();
assert(night > 40, `at night stars light the sky (${night} pixels)`);

// Something in front, as the moon or a build is, covers what lies behind it.
const cover = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0x000000 }));
cover.position.set(0, 100, 0);
cover.rotation.x = Math.PI / 2;
scene.add(cover);
assert(litPixels() === 0, 'and anything in front of them hides them');
scene.remove(cover);

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the night sky's shaders compile (${shaderErrors.join(' | ')})`);
console.log('✓ the stars and the Milky Way light the night sky, and only the night sky');
console.error = originalError;
sky.dispose();
renderer.dispose();
