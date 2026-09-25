// @environment browser
import * as THREE from 'three';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { assert } from './support/Assert.js';

// Draws instanced bricks with real WebGL and reads the pixels back: each
// instance shows its own color, a highlight lights up only its own
// instance (the shader change in renderer/BrickInstanceRegistry.js), and
// moving or removing a brick changes only that brick on screen.

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
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.add(new THREE.AmbientLight(0xffffff, 1));
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
// Looking at x 0..4, y -2..2: both bricks sit in the same chunk.
camera.position.set(2, 0, 10);
camera.lookAt(2, 0, 0);

const registry = new BrickInstanceRegistry(scene);
const A = 1;
const B = 3;
const brick = (x, color) => ({ definitionId: 'core:cube', x, y: 0, z: 0, rotationY: 0, color });

// Pixel [r, g, b] at a point in world coordinates (x in 0..4, y in -2..2).
function pixelAt(x, y) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = Math.round((x / 4) * SIZE);
    const py = Math.round(((y + 2) / 4) * SIZE);
    const out = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0], out[1], out[2]];
}

registry.add('red', 'doc', 'b', brick(1, 0xff0000));
registry.add('blue', 'doc', 'b', brick(3, 0x0000ff));
{
    const red = pixelAt(A, 0);
    const blue = pixelAt(B, 0);
    assert(registry.chunkCount === 1, 'both bricks are one InstancedMesh');
    assert(red[0] > 150 && red[1] < 40 && red[2] < 40, `the red brick is drawn red (got ${red})`);
    assert(blue[2] > 150 && blue[0] < 40 && blue[1] < 40, `the blue brick is drawn blue (got ${blue})`);
    assert(pixelAt(2, 1.5).every((c) => c === 0), 'empty space is background');
    console.log('✓ each instance is drawn in its own color');
}

{
    registry.setHighlight('red', 0x00ff00);
    const red = pixelAt(A, 0);
    const blue = pixelAt(B, 0);
    assert(red[1] > 150 && red[0] > 150, `the highlighted brick glows green on top of its red (got ${red})`);
    assert(blue[1] < 40 && blue[2] > 150, `the other brick is unchanged (got ${blue})`);
    registry.setHighlight('red', 0);
    const cleared = pixelAt(A, 0);
    assert(cleared[1] < 40 && cleared[0] > 150, `clearing the highlight restores it (got ${cleared})`);
    console.log('✓ a highlight lights up only its own instance');
}

{
    registry.setHighlight('blue', 0x00ff00);
    registry.remove('red');
    assert(pixelAt(A, 0).every((c) => c === 0), 'a removed brick disappears');
    const blue = pixelAt(B, 0);
    assert(blue[2] > 150 && blue[1] > 150, `the brick moved into its slot keeps its color and highlight (got ${blue})`);
    registry.update('blue', brick(A, 0x0000ff));
    assert(pixelAt(B, 0).every((c) => c === 0) && pixelAt(A, 0)[2] > 150, 'a moved brick is drawn at its new place');
    console.log('✓ removing and moving bricks updates what is drawn');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the instanced brick shader compiles (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
