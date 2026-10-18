// @environment browser
import * as THREE from 'three';
import { naturalFeaturesInRegion } from '../core/NaturalFeatureField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { TreeForest, TREE_DETAIL } from '../renderer/TreeForest.js';
import { createWetSurfaces, setWetness } from '../renderer/WetSurfaces.js';
import { assert } from './support/Assert.js';

// World View's trees with real WebGL (renderer/TreeForest.js): every level's
// shaders compile, with the wind, the rain and the shadow pass; a tree close
// by covers the view with leaves that let the sky through; the wind moves it,
// and a still day doesn't; plainer detail draws too.

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const SKY = 0x88c8f0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
sun.shadow.camera.right = sun.shadow.camera.top = 40;
scene.add(sun);
scene.add(sun.target);

const wet = createWetSurfaces();
const forest = new TreeForest(scene, { seed: DEFAULT_WORLD_SEED, wetSurfaces: wet });

// A broadleaf standing on its own, so the sky shows round its crown.
let tile = null;
for (let tx = -40; tx < 40 && !tile; tx++) {
    for (let tz = -40; tz < 40 && !tile; tz++) {
        const minX = tx * TERRAIN_TILE_SIZE;
        const minZ = tz * TERRAIN_TILE_SIZE;
        const trees = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, minX + TERRAIN_TILE_SIZE, minZ + TERRAIN_TILE_SIZE);
        const around = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX - 12, minZ - 12, minX + TERRAIN_TILE_SIZE + 12, minZ + TERRAIN_TILE_SIZE + 12);
        const alone = trees.find((t) => t.species === 'BROADLEAF' && around.every((o) => o === t || (o.x === t.x && o.z === t.z) || Math.hypot(o.x - t.x, o.z - t.z) > 10));
        if (alone) tile = { tx, tz, tree: alone };
    }
}
assert(tile, 'found a tree to look at');
for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) forest.loadTile(tile.tx + dx, tile.tz + dz);
}
const { tree } = tile;
sun.position.set(tree.x + 20, tree.y + 40, tree.z + 10);
sun.target.position.set(tree.x, tree.y, tree.z);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);

function draw(from, at) {
    camera.position.set(from.x, from.y, from.z);
    camera.lookAt(at.x, at.y, at.z);
    camera.updateMatrixWorld();
    forest.update(camera);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
}

const skyBytes = [(SKY >> 16) & 255, (SKY >> 8) & 255, SKY & 255];
function skyShare(pixels) {
    let skyPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - skyBytes[0]) + Math.abs(pixels[i + 1] - skyBytes[1]) + Math.abs(pixels[i + 2] - skyBytes[2]) < 12) skyPixels++;
    }
    return skyPixels / (SIZE * SIZE);
}
function changed(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++;
    }
    return n;
}

// Standing near it, looking up at its crown: leaves fill much of the view,
// with sky round and between them.
const under = { x: tree.x + 8, y: tree.y + 1.6, z: tree.z + 3 };
const up = { x: tree.x, y: tree.y + 5, z: tree.z };
forest.setWind(0);
forest.setTime(1);
const still = draw(under, up);
const share = skyShare(still);
assert(forest.lodCounts.NEAR > 0, 'the tree overhead is drawn in full detail');
assert(share > 0.03 && share < 0.85, `leaves cover the view with gaps between them (${share.toFixed(2)} sky)`);
forest.setTime(4.5);
assert(changed(still, draw(under, up)) === 0, 'with no wind, nothing moves');

forest.setWind(1);
forest.setTime(1);
const gale1 = draw(under, up);
forest.setTime(2.7);
const gale2 = draw(under, up);
assert(changed(gale1, gale2) > SIZE * SIZE * 0.02, 'in a gale the leaves move');

// The rain darkens them.
forest.setWind(0);
setWetness(wet, 1);
const soaked = draw(under, up);
const lum = (pixels) => {
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    return sum;
};
assert(lum(soaked) < lum(still), 'wet trees are darker');
setWetness(wet, 0);

// From afar, from above: mid and far shapes draw too.
const above = draw({ x: tree.x - 90, y: tree.y + 45, z: tree.z - 90 }, tree);
assert(forest.lodCounts.FAR + forest.lodCounts.MID > 0, 'far-off trees are drawn as simpler shapes');
assert(skyShare(above) < 0.98, 'and they show');

// Plainer detail, close by.
forest.setDetail(TREE_DETAIL.LOW);
const low = draw(under, up);
assert(forest.lodCounts.NEAR === 0 && skyShare(low) < 0.95, 'LOW draws the solid shapes close by');

assert(shaderErrors.length === 0, `every tree shader compiled: ${shaderErrors.join(' | ')}`);
forest.dispose();
renderer.dispose();
console.log('✓ trees compile and draw at every level, leaves let the sky through, the wind moves them and the rain darkens them');
