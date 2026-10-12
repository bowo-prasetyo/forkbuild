// @environment browser
import * as THREE from 'three';
import { makeNightGlowing } from '../renderer/NightGlowMaterial.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';

// Standalone brick meshes (plaza exhibits, claimed builds, structure
// placements) that shine after dark, drawn with real WebGL: dark by day,
// lit at night, each in its own light, and still lit after a selection
// highlight comes and goes (renderer/NightGlowMaterial.js).

const SIZE = 32;
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
scene.add(new THREE.AmbientLight(0xffffff, 0.05));
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

function pixelAt(x) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(4);
    gl.readPixels(Math.round(((x + 2) / 4) * SIZE), SIZE / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0], out[1], out[2]];
}

const night = { value: 0 };
const bricks = new BrickRenderer(new CreateBrickRegistryUseCase().execute());
const lantern = bricks.createMesh(new Brick({ definitionId: 'core:lantern', position: new Position(-1, 0, 0), color: 0xff3030 }));
const cube = bricks.createMesh(new Brick({ definitionId: 'core:cube', position: new Position(1, 0, 0), color: 0xff3030 }));
assert(lantern.userData.nightGlow === 0xff3030 && cube.userData.nightGlow === undefined, 'a lantern mesh says what light it gives off; a cube says nothing');
makeNightGlowing(lantern.material, lantern.userData.nightGlow, night);
makeNightGlowing(lantern.material, 0x00ff00, night);
scene.add(lantern, cube);

assert(pixelAt(-1)[0] < 40 && pixelAt(1)[0] < 40, 'by day both are dark in the dark');
night.value = 1;
const lit = pixelAt(-1);
assert(lit[0] > 200 && lit[1] < 120, `at night the lantern shines in its own color, once (got ${lit})`);
assert(pixelAt(1)[0] < 40, 'the cube stays dark');
lantern.material.emissive.setHex(0x0000ff);
assert(pixelAt(-1)[2] > 150, 'a selection highlight shows on top');
lantern.material.emissive.setHex(0x000000);
assert(pixelAt(-1)[0] > 200, 'and clearing it leaves the lantern lit');
night.value = 0;
assert(pixelAt(-1)[0] < 40, 'day puts it out');
console.log('✓ standalone bricks that shine after dark light up only at night');

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the night glow shader compiles (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
