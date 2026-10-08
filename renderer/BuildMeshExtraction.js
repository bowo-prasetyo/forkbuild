import * as THREE from 'three';
import { BrickRenderer } from './BrickRenderer.js';
import { ThreeBrickFactory } from './ThreeBrickFactory.js';

// The triangles of some bricks, for a model file (core/BuildModelFormats.js):
// each brick's shape exactly as the Editor and World View draw it
// (ThreeBrickFactory), moved and turned to where the brick stands, and
// grouped by color. `bricks` are Bricks or anything shaped like one
// (`{ definitionId, color, position: { x, y, z }, rotation }`, rotation in
// degrees about Y). Returns `[{ color, positions, normals }]`: Float32Arrays,
// three vertices per triangle, Y up. An unknown brick throws, as it does
// when drawn.
export function extractBuildMeshes(bricks, registry, { factory = new ThreeBrickFactory() } = {}) {
    const describer = new BrickRenderer(registry, factory);
    const byColor = new Map();
    const geometries = new Map();
    const matrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3();
    const rotation = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (const brick of bricks) {
        const { definitionId, x, y, z, rotationY, color } = describer.describe(brick);
        let geometry = geometries.get(definitionId);
        if (!geometry) {
            const shaped = factory.createGeometry(definitionId);
            geometry = shaped.index ? shaped.toNonIndexed() : shaped;
            if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
            geometries.set(definitionId, geometry);
        }
        rotation.setFromAxisAngle(axis, rotationY);
        matrix.compose(new THREE.Vector3(x, y, z), rotation, one);
        normalMatrix.getNormalMatrix(matrix);

        const key = Number.isInteger(color) ? color : 0x808080;
        if (!byColor.has(key)) byColor.set(key, { positions: [], normals: [] });
        const target = byColor.get(key);
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
            normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
            target.positions.push(point.x, point.y, point.z);
            target.normals.push(normal.x, normal.y, normal.z);
        }
    }
    for (const geometry of geometries.values()) geometry.dispose();
    return [...byColor.entries()].map(([color, { positions, normals }]) => ({
        color,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals)
    }));
}
