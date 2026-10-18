// @environment browser
import * as THREE from 'three';
import { createLakeIce, makeWaterWaving, setLakeIce } from '../renderer/WaterWaveMaterial.js';
import { FootprintTrail } from '../renderer/FootprintTrail.js';
import { assert } from './support/Assert.js';

// Winter drawn with real WebGL: a lake's water compiles with and without its
// ice; frozen, a lake turns pale and opaque while the sea beside it stays
// open water; footprints are pressed into the snow and fade away.

const SIZE = 64;
const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE, false);

function mean(scene, camera) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    let r = 0;
    let g = 0;
    let b = 0;
    let drawn = 0;
    for (let i = 0; i < out.length; i += 4) {
        r += out[i];
        g += out[i + 1];
        b += out[i + 2];
        if (out[i] + out[i + 1] + out[i + 2] > 6) drawn++;
    }
    const n = SIZE * SIZE;
    return { r: r / n, g: g / n, b: b / n, drawn };
}

function lit(scene) {
    scene.background = new THREE.Color(0x000000);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a3d2e, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, 10, 6);
    scene.add(sun);
}

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(300, 8, -496);
camera.lookAt(300, 0, -500);

// A sheet of water, all lake (`seaShare` 0) or all sea (1), over a dark bed.
function waterScene(ice, seaShare) {
    const scene = new THREE.Scene();
    lit(scene);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x202018 }));
    bed.position.set(300, -2, -500);
    scene.add(bed);
    const geometry = new THREE.PlaneGeometry(40, 40, 8, 8).rotateX(-Math.PI / 2);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('aSeaShare', new THREE.BufferAttribute(new Float32Array(count).fill(seaShare), 1));
    geometry.setAttribute('aShoreDepth', new THREE.BufferAttribute(new Float32Array(count).fill(4), 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.55), 3));
    const material = makeWaterWaving(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, roughness: 0.4 }), { value: 3 }, { ice });
    const water = new THREE.Mesh(geometry, material);
    water.position.set(300, 0, -500);
    scene.add(water);
    return scene;
}

{
    const ice = createLakeIce();
    const lake = waterScene(ice, 0);
    const sea = waterScene(ice, 1);
    const openLake = mean(lake, camera);
    const openSea = mean(sea, camera);
    setLakeIce(ice, 1);
    const frozenLake = mean(lake, camera);
    const frozenSea = mean(sea, camera);
    assert(frozenLake.r > openLake.r * 1.15 && frozenLake.b > openLake.b, `a frozen lake is pale ice (${JSON.stringify(openLake)} to ${JSON.stringify(frozenLake)})`);
    assert(Math.abs(frozenSea.r - openSea.r) < 2 && Math.abs(frozenSea.b - openSea.b) < 2, 'the sea stays open water');
    setLakeIce(ice, 0);
    const thawed = mean(lake, camera);
    assert(Math.abs(thawed.r - openLake.r) < 1, 'thawed, the lake is open water again');
    console.log('✓ lakes freeze pale and opaque; the sea stays open');
}

{
    const scene = new THREE.Scene();
    lit(scene);
    const snow = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd0d4dc }));
    snow.position.set(300, 0, -500);
    scene.add(snow);
    const trail = new FootprintTrail({ add: (o) => scene.add(o), remove: (o) => scene.remove(o) }, { heightAt: () => 0 });
    const close = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    close.position.set(300, 2.2, -499.2);
    close.lookAt(300, 0, -500);
    const plain = mean(scene, close);
    for (let i = 0; i < 4; i++) trail.add({ x: 299.6 + i * 0.25, z: -500 + (i % 2 ? 0.1 : -0.1), heading: Math.PI / 2, left: i % 2 === 0, at: 100 });
    trail.update(101, 1);
    const pressed = mean(scene, close);
    assert(pressed.r < plain.r - 1, `footprints show as dents in the snow (${plain.r.toFixed(1)} to ${pressed.r.toFixed(1)})`);
    trail.update(1000, 1);
    assert(Math.abs(mean(scene, close).r - plain.r) < 0.5, 'and are gone once they fade');
    trail.dispose();
    console.log('✓ footprints are pressed into the snow, then fade');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `winter's shaders compile (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
