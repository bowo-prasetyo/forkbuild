// @environment browser
import * as THREE from 'three';
import { RainFall } from '../renderer/RainFall.js';
import { makeWaterWaving } from '../renderer/WaterWaveMaterial.js';
import { makeRiverFlowing } from '../renderer/RiverFlowMaterial.js';
import { DAY, NIGHT } from '../core/DayCycle.js';
import { assert } from './support/Assert.js';

// Rain drawn with real WebGL: the streaks fall round the camera, more the
// harder it rains, none in the dry, none under water, none through what is in
// front, and they move; and raindrops ring lakes, the sea and rivers near the
// camera, more the harder it rains, but not far off. The shaders compile.

const SIZE = 128;
const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE, false);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);

function pixels(scene) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
}

function lit(out) {
    let count = 0;
    for (let i = 0; i < out.length; i += 4) if (out[i] + out[i + 1] + out[i + 2] > 0) count++;
    return count;
}

function changed(a, b, threshold = 6) {
    let count = 0;
    for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > threshold) count++;
    }
    return count;
}

// The streaks.
{
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const rain = new RainFall({ add: (o) => scene.add(o), remove: (o) => scene.remove(o) });
    camera.position.set(1234.5, 3, -2345.5);
    camera.lookAt(1234.5, 3, -2355.5);

    rain.set(0);
    rain.update(camera, 10, DAY);
    assert(!rain.lines.visible && lit(pixels(scene)) === 0, 'in the dry no rain falls, and nothing is drawn for it');

    rain.set(0.3);
    rain.update(camera, 10, DAY);
    const light = lit(pixels(scene));
    rain.set(1);
    rain.update(camera, 10, DAY);
    const heavyFrame = pixels(scene);
    const heavy = lit(heavyFrame);
    assert(light > 20, `a shower draws streaks (${light} pixels)`);
    assert(heavy > light * 2, `a downpour draws many more (${heavy} vs ${light})`);

    rain.update(camera, 10.2, DAY);
    const later = pixels(scene);
    assert(changed(heavyFrame, later) > heavy * 0.3, 'a moment later the rain has fallen on');

    rain.update(camera, 10, NIGHT);
    const night = pixels(scene);
    let dayBright = 0;
    let nightBright = 0;
    for (let i = 0; i < heavyFrame.length; i += 4) {
        dayBright += heavyFrame[i] + heavyFrame[i + 1] + heavyFrame[i + 2];
        nightBright += night[i] + night[i + 1] + night[i + 2];
    }
    assert(nightBright < dayBright * 0.6, 'at night it is fainter');

    // Far from the world's origin it falls just the same.
    camera.position.set(91234.5, 3, -82345.5);
    camera.lookAt(91234.5, 3, -82355.5);
    rain.update(camera, 10, DAY);
    const far = lit(pixels(scene));
    assert(far > heavy * 0.7 && far < heavy * 1.3, `the rain goes wherever the camera goes (${far} vs ${heavy})`);

    // Something in front hides it.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    wall.position.set(91234.5, 3, -82345.5 - 0.3);
    scene.add(wall);
    rain.update(camera, 10, DAY);
    assert(lit(pixels(scene)) === 0, 'a wall in front hides the rain behind it');
    scene.remove(wall);

    rain.update(camera, 10, DAY, true);
    assert(!rain.lines.visible, 'under water it doesn\'t fall');
    rain.dispose();
    console.log(`✓ rain falls round the camera, more the harder it rains (${light}, ${heavy} pixels)`);
}

// Rings on the water: a lake (renderer/WaterWaveMaterial.js) and a river
// (renderer/RiverFlowMaterial.js), looked down on from close by.
{
    const lakeGeometry = new THREE.PlaneGeometry(60, 60, 30, 30);
    lakeGeometry.rotateX(-Math.PI / 2);
    const n = lakeGeometry.attributes.position.count;
    lakeGeometry.setAttribute('aSeaShare', new THREE.BufferAttribute(new Float32Array(n), 1));
    lakeGeometry.setAttribute('aShoreDepth', new THREE.BufferAttribute(new Float32Array(n).fill(2), 1));
    const riverGeometry = new THREE.PlaneGeometry(60, 60, 30, 30);
    riverGeometry.rotateX(-Math.PI / 2);
    riverGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4).fill(0.4), 4));
    riverGeometry.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    riverGeometry.setAttribute('aChannel', new THREE.BufferAttribute(new Float32Array(n * 2).fill(0.7071), 2));
    riverGeometry.setAttribute('aRapids', new THREE.BufferAttribute(new Float32Array(n), 1));
    riverGeometry.setAttribute('aSpring', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const waveTime = { value: 5 };
    const rain = { value: 0 };
    const surfaces = {
        lake: new THREE.Mesh(lakeGeometry, makeWaterWaving(new THREE.MeshStandardMaterial({ color: 0x3f7f99, roughness: 0.4 }), waveTime, { rain })),
        river: new THREE.Mesh(riverGeometry, makeRiverFlowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }), waveTime, { rain }))
    };
    for (const [name, surface] of Object.entries(surfaces)) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a3d2e, 1));
        const sun = new THREE.DirectionalLight(0xffffff, 1.8);
        sun.position.set(10, 15, 8);
        scene.add(sun);
        surface.position.set(500, 0, 300);
        scene.add(surface);
        const look = (height) => {
            camera.position.set(500, height, 300);
            camera.up.set(0, 0, -1);
            camera.lookAt(500, 0, 300);
        };
        look(4);
        rain.value = 0;
        const dry = pixels(scene);
        rain.value = 0.3;
        const shower = changed(dry, pixels(scene));
        rain.value = 1;
        const downpourFrame = pixels(scene);
        const downpour = changed(dry, downpourFrame);
        assert(shower > 30, `a shower rings the ${name} (${shower} pixels)`);
        assert(downpour > shower * 1.5, `a downpour rings it more (${downpour} vs ${shower})`);
        waveTime.value = 5.3;
        const moved = changed(downpourFrame, pixels(scene));
        assert(moved > 30, `the rings spread and new drops land (${moved} pixels)`);
        waveTime.value = 5;
        // Far off, the rings are smaller than a pixel and fade out.
        look(60);
        rain.value = 0;
        const farDry = pixels(scene);
        rain.value = 1;
        const far = changed(farDry, pixels(scene));
        assert(far === 0, `far off the ${name} shows no rings (${far} pixels)`);
        camera.up.set(0, 1, 0);
        scene.remove(surface);
        console.log(`✓ rain rings the ${name} near by (${shower}, ${downpour} pixels), not far off`);
    }
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the rain's shaders compile (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
