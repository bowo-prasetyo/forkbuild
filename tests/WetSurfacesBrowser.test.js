// @environment browser
import * as THREE from 'three';
import { BRICK_WET, TERRAIN_WET, createWetSurfaces, makeWet, setWetShelter, setWetness } from '../renderer/WetSurfaces.js';
import { applyBrickSurface, withBrickBounds } from '../renderer/BrickSurfaceMaterial.js';
import { assert } from './support/Assert.js';

// Wet ground and bricks drawn with real WebGL (renderer/WetSurfaces.js): dry,
// they look exactly as before; wet, they are darker; what faces the sky gets
// a sheen, walls only darken a little; the room under the avatar's roof stays
// dry; instanced bricks soak too; and the shaders compile.

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

function brightness(scene, camera) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    let sum = 0;
    for (let i = 0; i < out.length; i += 4) sum += out[i] + out[i + 1] + out[i + 2];
    return sum / (SIZE * SIZE * 3);
}

function lit(scene) {
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a3d2e, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(0, 10, 10);
    scene.add(sun);
}

// The ground, looked down on, and a wall, looked at: dry, the same as an
// unpatched material; wet, darker, the ground more than the wall.
{
    const wet = createWetSurfaces();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const ground = (material) => {
        const scene = new THREE.Scene();
        lit(scene);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), material);
        plane.position.set(300, 2, -500);
        scene.add(plane);
        return scene;
    };
    camera.position.set(300, 8, -496);
    camera.lookAt(300, 2, -500);
    const plain = brightness(ground(new THREE.MeshStandardMaterial({ color: 0x6a8f4a })), camera);
    const patched = ground(makeWet(new THREE.MeshStandardMaterial({ color: 0x6a8f4a }), wet, TERRAIN_WET));
    setWetness(wet, 0);
    const dry = brightness(patched, camera);
    assert(Math.abs(dry - plain) < 0.5, `dry ground looks just as before (${dry.toFixed(1)} vs ${plain.toFixed(1)})`);
    setWetness(wet, 1);
    const soaked = brightness(patched, camera);
    assert(soaked < dry * 0.85, `soaked ground is darker (${soaked.toFixed(1)} vs ${dry.toFixed(1)})`);
    setWetness(wet, 0.4);
    const damp = brightness(patched, camera);
    assert(damp < dry && damp > soaked, 'damp ground is in between');

    // The room under the avatar's roof stays dry; its roof (above the
    // underside) and everything outside do not.
    setWetness(wet, 1);
    setWetShelter(wet, { minX: 280, maxX: 320, minZ: -520, maxZ: -480, top: 6, ceiling: 4 });
    const sheltered = brightness(patched, camera);
    assert(Math.abs(sheltered - dry) < 0.5, `under the roof the floor stays dry (${sheltered.toFixed(1)})`);
    setWetShelter(wet, { minX: 280, maxX: 320, minZ: -520, maxZ: -480, top: 6, ceiling: 1 });
    assert(brightness(patched, camera) < dry * 0.85, 'above the roof\'s underside, it is wet');
    setWetShelter(wet, { minX: 0, maxX: 10, minZ: 0, maxZ: 10, top: 6, ceiling: 4 });
    assert(brightness(patched, camera) < dry * 0.85, 'outside the build, it is wet');
    setWetShelter(wet, null);

    // A wall, faced square on, darkens less than ground.
    const wallScene = new THREE.Scene();
    lit(wallScene);
    const wallMaterial = makeWet(new THREE.MeshStandardMaterial({ color: 0x6a8f4a }), wet, TERRAIN_WET);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), wallMaterial);
    wall.position.set(300, 2, -510);
    wallScene.add(wall);
    camera.position.set(300, 2, -500);
    camera.lookAt(300, 2, -510);
    setWetness(wet, 0);
    const wallDry = brightness(wallScene, camera);
    setWetness(wet, 1);
    const wallWet = brightness(wallScene, camera);
    assert(wallWet < wallDry && wallWet / wallDry > soaked / dry, `a wall darkens, less than the ground (${(wallWet / wallDry).toFixed(2)} vs ${(soaked / dry).toFixed(2)})`);
    console.log(`✓ wet ground is darker (${(soaked / dry).toFixed(2)} of dry), walls less so, and the room under the roof stays dry`);
}

// Bricks, with their surface and instanced, soak too.
{
    const wet = createWetSurfaces();
    const scene = new THREE.Scene();
    lit(scene);
    const material = makeWet(applyBrickSurface(new THREE.MeshStandardMaterial({ color: 0xc8b090 }), 'masonry'), wet, BRICK_WET);
    const geometry = withBrickBounds(new THREE.BoxGeometry(2, 0.5, 2));
    const bricks = new THREE.InstancedMesh(geometry, material, 9);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 9; i++) {
        bricks.setMatrixAt(i, m.makeTranslation(-1000 + (i % 3) * 2, 0, 700 + Math.floor(i / 3) * 2));
    }
    scene.add(bricks);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(-998, 6, 702.5);
    camera.lookAt(-998, 0, 702);
    setWetness(wet, 0);
    const dry = brightness(scene, camera);
    setWetness(wet, 1);
    const soaked = brightness(scene, camera);
    assert(dry > 5 && soaked < dry * 0.95, `instanced bricks soak (${soaked.toFixed(1)} vs ${dry.toFixed(1)})`);
    assert(makeWet(material, wet, BRICK_WET) === material, 'patching twice does nothing more');
    console.log('✓ bricks, instanced and with their surface, soak too');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the wet shaders compile (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
