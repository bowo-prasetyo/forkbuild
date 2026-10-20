// @environment browser
import * as THREE from 'three';
import { BrickSurface } from '../core/building/BrickSurface.js';
import { ThreeBrickFactory } from '../renderer/ThreeBrickFactory.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { applyBrickSurface, withBrickBounds } from '../renderer/BrickSurfaceMaterial.js';
import { assert } from './support/Assert.js';

// The brick look with real WebGL (renderer/BrickSurfaceMaterial.js): every
// surface's shader compiles, instanced and standalone, beside the night
// glow; a brick's edges are drawn darker than the middle of its face; and
// the plain grain stays close to the brick's own colour.

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
// Even light from the camera's side, so a face is one brightness but for its surface.
scene.add(new THREE.AmbientLight(0xffffff, 3));

// Looking straight at the +z face of a 1×1×1 box filling the middle of the picture.
const camera = new THREE.OrthographicCamera(-0.75, 0.75, 0.75, -0.75, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

function brightness(x, y) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(4);
    gl.readPixels(Math.round(((x + 0.75) / 1.5) * SIZE), Math.round(((y + 0.75) / 1.5) * SIZE), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out[0] + out[1] + out[2];
}

// Edges, on a plain brick (a library's unknown brick: the fallback box).
{
    const box = new ThreeBrickFactory().createMesh('community:box', 0x888888);
    scene.add(box);
    const middle = brightness(0, 0);
    const edge = brightness(0.485, 0);
    const corner = brightness(0.485, 0.485);
    assert(middle > 150, `the face is lit (${middle})`);
    assert(edge < middle * 0.9, `its edge is drawn darker than its middle (${edge} vs ${middle})`);
    assert(corner <= edge + 6, `and its corner at least as dark (${corner})`);
    const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    scene.remove(box);
    scene.add(plain);
    const flat = brightness(0, 0);
    assert(Math.abs(flat - middle) < flat * 0.12, `the plain grain stays close to the brick's colour (${middle} vs ${flat} unsurfaced)`);
    scene.remove(plain);
    console.log('✓ a brick\'s edges are drawn darker than its face, and its grain keeps its colour');
}

// Every surface compiles, standalone and instanced, beside the night glow.
{
    const instances = new BrickInstanceRegistry(scene);
    const kinds = ['core:brick_1x2', 'core:wall_1x1', 'core:beam', 'core:roof_gable', 'core:window_small', 'core:bush', 'core:rock', 'core:plate_1x1', 'core:lantern'];
    kinds.forEach((definitionId, i) => {
        instances.add(`i${i}`, 'doc', 'b', { definitionId, x: i * 3 - 12, y: 0.5, z: -5, rotationY: 0, color: 0x9a9a9a, glow: definitionId === 'core:lantern' ? 0xffd54f : 0 });
        const mesh = new ThreeBrickFactory().createMesh(definitionId, 0x9a9a9a);
        mesh.position.set(i * 3 - 12, 0.5, -8);
        scene.add(mesh);
    });
    instances.setNightGlow(1);
    const glass = applyBrickSurface(new THREE.MeshStandardMaterial({ color: 0x9ad0e6 }), BrickSurface.GLASS);
    scene.add(new THREE.Mesh(withBrickBounds(new THREE.BoxGeometry(1, 1, 0.1)), glass));
    renderer.render(scene, camera);
    const programs = renderer.info.programs || [];
    const gl = renderer.getContext();
    const broken = programs.filter((program) => !gl.getProgramParameter(program.program, gl.LINK_STATUS));
    assert(broken.length === 0 && shaderErrors.filter((text) => /shader|program/i.test(text)).length === 0,
        `every surface's shader compiles and links (${shaderErrors.join(' | ')})`);
    const surfaces = new Set(instances.pickableObjects().map((mesh) => mesh.material.userData.brickSurface));
    assert(surfaces.size >= 8, `nine kinds of brick, eight surfaces (${[...surfaces]})`);
    console.log('✓ every surface\'s shader compiles and links, instanced and standalone, beside the night glow');
}
