// @environment browser
import * as THREE from 'three';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from '/node_modules/three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from '/node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { countTriangles, writeGlb, writeObj, writeStl } from '../core/BuildModelFormats.js';
import { extractBuildMeshes } from '../renderer/BuildMeshExtraction.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { assert } from './support/Assert.js';

// The showcase castle as a 3D model, read back by Three.js's own glTF, STL
// and OBJ loaders (from node_modules, never shipped), the way Blender, a
// slicer or a model viewer reads it: every triangle, in its colors, with its
// credit.

const registry = new CreateBrickRegistryUseCase().execute();
const castle = ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle');
const meshes = extractBuildMeshes(castle.bricks, registry);
const triangles = countTriangles(meshes);
const metadata = { title: 'Castle', author: 'alice', license: 'CC BY 4.0' };

function trianglesOf(object) {
    let count = 0;
    object.traverse((child) => {
        if (child.isMesh) count += (child.geometry.index ? child.geometry.index.count : child.geometry.getAttribute('position').count) / 3;
    });
    return count;
}

// glTF binary.
{
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(writeGlb({ meshes, metadata }), '', resolve, reject));
    assert(trianglesOf(gltf.scene) === triangles, `GLTFLoader reads every triangle (${trianglesOf(gltf.scene)} of ${triangles})`);
    const colors = new Set();
    gltf.scene.traverse((child) => {
        if (child.isMesh) colors.add(child.material.color.getHex(THREE.SRGBColorSpace));
    });
    const expected = new Set(meshes.map((mesh) => mesh.color));
    assert(colors.size === expected.size && [...expected].every((color) => colors.has(color)), `in the bricks' own colors (${[...colors].map((c) => c.toString(16))})`);
    assert(gltf.parser.json.asset.copyright.startsWith('Castle by alice · CC BY 4.0'), 'with its credit');
    console.log(`✓ glTF: ${triangles} triangles in ${expected.size} colors, read by GLTFLoader`);
}

// STL.
{
    const geometry = new STLLoader().parse(writeStl({ meshes, metadata }));
    assert(geometry.getAttribute('position').count / 3 === triangles, 'STLLoader reads every triangle');
    geometry.computeBoundingBox();
    assert(Math.abs(geometry.boundingBox.min.z) < 1e-4 && geometry.boundingBox.max.z > 50, `standing on the bed, in millimetres (${geometry.boundingBox.max.z.toFixed(1)} mm tall)`);
    console.log('✓ STL: read by STLLoader, standing on the bed');
}

// OBJ.
{
    const object = new OBJLoader().parse(writeObj({ meshes, metadata }));
    assert(trianglesOf(object) === triangles, 'OBJLoader reads every triangle');
    let colored = true;
    object.traverse((child) => {
        if (child.isMesh && !child.geometry.getAttribute('color')) colored = false;
    });
    assert(colored, 'with its vertex colors');
    console.log('✓ OBJ: read by OBJLoader, with its colors');
}
