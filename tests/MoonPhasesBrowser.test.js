// @environment browser
import * as THREE from 'three';
import { FULL_MOON, MOON_PHASES, NIGHT, skyBodiesAtFraction } from '../core/nature/DayCycle.js';
import { SkyBodies } from '../renderer/SkyBodies.js';
import { assert } from './support/Assert.js';

// The moon drawn in its phase with real WebGL (renderer/SkyBodies.js): the
// shader compiles; a first quarter is lit on its right and dark on its left,
// a third quarter the other way round; a crescent is a sliver; a full moon is
// lit all over; a new moon is barely paler than the sky behind it.

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
scene.background = new THREE.Color(NIGHT.sky);
const bodies = new SkyBodies({ add: (o) => scene.add(o), remove: (o) => scene.remove(o) });
// A narrow view, so the moon fills most of it.
const camera = new THREE.PerspectiveCamera(3, 1, 0.1, 1000);

// The mean brightness (0 to 765) of the disc's left and right thirds, its
// middle and its right edge (it is about 36 pixels across either way), and
// of the sky in a corner.
function look(phase) {
    const sky = skyBodiesAtFraction(0.83, phase);
    camera.position.set(0, 2, 0);
    camera.lookAt(sky.moon.x, 2 + sky.moon.y, sky.moon.z);
    camera.updateMatrixWorld();
    bodies.set(sky);
    bodies.update(camera, false, NIGHT.sky);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    const at = (x, y) => {
        const i = (y * SIZE + x) * 4;
        return out[i] + out[i + 1] + out[i + 2];
    };
    const mean = (x0, x1) => {
        let sum = 0;
        let n = 0;
        for (let y = SIZE / 2 - 6; y < SIZE / 2 + 6; y++) {
            for (let x = x0; x < x1; x++) {
                sum += at(x, y);
                n++;
            }
        }
        return sum / n;
    };
    const half = SIZE / 2;
    return {
        left: mean(half - 26, half - 14),
        middle: mean(half - 3, half + 3),
        right: mean(half + 14, half + 26),
        rightEdge: mean(half + 29, half + 33),
        sky: at(2, 2)
    };
}

{
    const first = look(MOON_PHASES[2]);
    assert(first.right > 450 && first.left < first.sky + 60, `a first quarter is lit on its right, dark on its left (${JSON.stringify(first)})`);
    const third = look(MOON_PHASES[6]);
    assert(third.left > 450 && third.right < third.sky + 60, `a third quarter the other way round (${JSON.stringify(third)})`);
    const crescent = look(MOON_PHASES[1]);
    assert(crescent.rightEdge > 450 && crescent.middle < crescent.sky + 60, `a waxing crescent is a sliver on its right (${JSON.stringify(crescent)})`);
    const gibbous = look(MOON_PHASES[3]);
    assert(gibbous.middle > 450 && gibbous.right > 450 && gibbous.left < gibbous.right, `a waxing gibbous is mostly lit (${JSON.stringify(gibbous)})`);
    const full = look(FULL_MOON);
    assert(full.left > 400 && full.middle > 400 && full.right > 400, `a full moon is lit all over (${JSON.stringify(full)})`);
    const dark = look(MOON_PHASES[0]);
    for (const part of [dark.left, dark.middle, dark.right]) {
        assert(part >= dark.sky && part < dark.sky + 60, `a new moon is barely paler than the sky (${JSON.stringify(dark)})`);
    }
    console.log('✓ the moon is drawn in its phase, lit from its sun\'s side');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the moon's shader compiles (${shaderErrors.join(' | ')})`);
console.error = originalError;
bodies.dispose();
renderer.dispose();
