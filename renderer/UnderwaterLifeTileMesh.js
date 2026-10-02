import * as THREE from 'three';
import {
    seaweedInRegion, fishSchoolsInRegion, fishPoseAt, seaweedSwayAt, FISH_MAX_ORBIT_RADIUS
} from '../core/UnderwaterLifeField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// One terrain tile's seaweed and fish (core/UnderwaterLifeField.js), as two
// instanced meshes each so a whole tile costs a handful of draw calls. Built once
// per tile by the streaming ring; updateUnderwaterLifeTileMesh() then moves the
// fish and sways the seaweed every frame from elapsed time alone.

const SEAWEED_COLORS = [
    new THREE.Color(0.16, 0.42, 0.20), // kelp green
    new THREE.Color(0.30, 0.48, 0.16), // olive
    new THREE.Color(0.12, 0.34, 0.26)  // blue-green
];
const FISH_COLORS = [
    new THREE.Color(0.95, 0.55, 0.15), // orange
    new THREE.Color(0.75, 0.80, 0.85), // silver
    new THREE.Color(0.95, 0.85, 0.25), // yellow
    new THREE.Color(0.30, 0.50, 0.85)  // blue
];

// A flat, tapering frond, rooted at y = 0 and one unit tall; scaled to each
// weed's height. Three blades crossed at the root read as a clump from any side.
function seaweedGeometry() {
    const blades = [0, Math.PI / 3, (2 * Math.PI) / 3].map((angle) => {
        const blade = new THREE.PlaneGeometry(0.28, 1, 1, 4);
        const position = blade.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const y = position.getY(i) + 0.5;
            // Narrow to a point at the tip, with a gentle curl.
            position.setX(i, position.getX(i) * (1 - y * 0.8));
            position.setZ(i, Math.sin(y * Math.PI) * 0.08);
            position.setY(i, y);
        }
        blade.rotateY(angle);
        return blade;
    });
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];
    for (const blade of blades) {
        const base = positions.length / 3;
        positions.push(...blade.attributes.position.array);
        for (const index of blade.index.array) indices.push(index + base);
        blade.dispose();
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

// A small fish facing +Z: an ellipsoid body with a flat tail fin behind it.
function fishBodyGeometry() {
    const geometry = new THREE.SphereGeometry(1, 7, 5);
    geometry.scale(0.1, 0.14, 0.32);
    return geometry;
}

function fishTailGeometry() {
    const geometry = new THREE.ConeGeometry(0.13, 0.2, 4);
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(0.4, 1, 1);
    geometry.translate(0, 0, -0.4);
    return geometry;
}

// Shared by every tile, like the wildlife presets, so dropping a tile only frees
// its instance buffers (disposeInstancedTile).
let shared = null;
function sharedResources() {
    if (!shared) {
        shared = {
            seaweedGeometry: seaweedGeometry(),
            seaweedMaterial: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }),
            fishBodyGeometry: fishBodyGeometry(),
            fishTailGeometry: fishTailGeometry(),
            fishMaterial: new THREE.MeshStandardMaterial({ roughness: 0.5 })
        };
    }
    return shared;
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

function writeSeaweed(mesh, i, weed, timeSeconds) {
    const sway = seaweedSwayAt(weed, timeSeconds);
    _position.set(weed.x, weed.y, weed.z);
    _euler.set(sway, weed.swayPhase, sway * 0.5);
    _quaternion.setFromEuler(_euler);
    _scale.set(1, weed.height, 1);
    _matrix.compose(_position, _quaternion, _scale);
    mesh.setMatrixAt(i, _matrix);
}

function writeFish(bodyMesh, tailMesh, i, school, fish, timeSeconds) {
    const pose = fishPoseAt(school, fish, timeSeconds);
    _position.set(pose.x, pose.y, pose.z);
    // A slight tail-beat wag around the swimming direction.
    _euler.set(0, pose.heading + Math.sin(timeSeconds * 9 + fish.phase) * 0.15, 0);
    _quaternion.setFromEuler(_euler);
    _scale.set(fish.scale, fish.scale, fish.scale);
    _matrix.compose(_position, _quaternion, _scale);
    bodyMesh.setMatrixAt(i, _matrix);
    tailMesh.setMatrixAt(i, _matrix);
}

export function buildUnderwaterLifeTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, timeSeconds = 0) {
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    const seaweed = seaweedInRegion(seed, minX, minZ, minX + tileSize, minZ + tileSize);
    const schools = fishSchoolsInRegion(seed, minX, minZ, minX + tileSize, minZ + tileSize);
    const group = new THREE.Group();
    const life = { seaweed, schools, seaweedMesh: null, fishBodyMesh: null, fishTailMesh: null };
    group.userData.underwaterLife = life;

    const resources = (seaweed.length > 0 || schools.length > 0) ? sharedResources() : null;
    if (seaweed.length > 0) {
        const mesh = new THREE.InstancedMesh(resources.seaweedGeometry, resources.seaweedMaterial, seaweed.length);
        seaweed.forEach((weed, i) => mesh.setColorAt(i, SEAWEED_COLORS[weed.variant] ?? SEAWEED_COLORS[0]));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        life.seaweedMesh = mesh;
        group.add(mesh);
    }

    const fishCount = schools.reduce((sum, school) => sum + school.fish.length, 0);
    if (fishCount > 0) {
        const bodyMesh = new THREE.InstancedMesh(resources.fishBodyGeometry, resources.fishMaterial, fishCount);
        const tailMesh = new THREE.InstancedMesh(resources.fishTailGeometry, resources.fishMaterial, fishCount);
        let i = 0;
        for (const school of schools) {
            const color = FISH_COLORS[school.variant] ?? FISH_COLORS[0];
            for (let f = 0; f < school.fish.length; f++, i++) {
                bodyMesh.setColorAt(i, color);
                tailMesh.setColorAt(i, color);
            }
        }
        if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
        if (tailMesh.instanceColor) tailMesh.instanceColor.needsUpdate = true;
        life.fishBodyMesh = bodyMesh;
        life.fishTailMesh = tailMesh;
        group.add(bodyMesh);
        group.add(tailMesh);
    }

    updateUnderwaterLifeTileMesh(group, timeSeconds);
    // Instances move every frame, so bound each mesh by its whole circle of motion
    // once rather than recomputing per frame.
    for (const mesh of [life.seaweedMesh, life.fishBodyMesh, life.fishTailMesh]) {
        if (mesh && typeof mesh.computeBoundingSphere === 'function') {
            mesh.computeBoundingSphere();
            if (mesh.boundingSphere) mesh.boundingSphere.radius += FISH_MAX_ORBIT_RADIUS * 2;
        }
    }
    return group;
}

export function updateUnderwaterLifeTileMesh(group, timeSeconds) {
    const life = group && group.userData ? group.userData.underwaterLife : null;
    if (!life) return;
    const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    if (life.seaweedMesh) {
        life.seaweed.forEach((weed, i) => writeSeaweed(life.seaweedMesh, i, weed, t));
        life.seaweedMesh.instanceMatrix.needsUpdate = true;
    }
    if (life.fishBodyMesh) {
        let i = 0;
        for (const school of life.schools) {
            for (const fish of school.fish) {
                writeFish(life.fishBodyMesh, life.fishTailMesh, i, school, fish, t);
                i++;
            }
        }
        life.fishBodyMesh.instanceMatrix.needsUpdate = true;
        life.fishTailMesh.instanceMatrix.needsUpdate = true;
    }
}
