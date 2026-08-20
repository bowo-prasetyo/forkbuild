import * as THREE from 'three';
import { naturalFeaturesInRegion, FEATURE_TYPE } from '../core/NaturalFeatureField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// The renderer-side counterpart to core/NaturalFeatureField.js — see
// docs/Roadmap.md, 0.2.88: it knows nothing about WHERE a tree stands or
// WHY, only how to turn one tile's worth of deterministic feature
// candidates into stylized Three.js geometry, the same
// core-decides/renderer-builds split renderer/TerrainTileMesh.js already
// establishes for ground.
//
// Deliberately TWO THREE.InstancedMesh objects per tile (trunks, then
// canopies) rather than one Mesh per tree — a tile can host dozens of
// trees, and 40 individual meshes would mean 40 draw calls where two
// instanced ones suffice. This is the "Grass should be treated
// differently from trees... potentially using instancing" design note
// from the 0.2.88 conversation, applied here to trees themselves: it
// scales the same way regardless of how dense a forest tile gets.
//
// Deliberately stylized, low-poly, and muted — matching the exact
// restraint core/TerrainSurface.js's own header already established
// ("soft, low-saturation... buildings and avatars remain the visual
// focus"): a simple cone canopy over a simple cylinder trunk, never a
// detailed tree asset that would visually compete with a building.
//
// Deliberately untested directly, same posture as
// renderer/TerrainTileMesh.js — see renderer/TerrainStreamingController.js's
// own header for why the load/unload ORCHESTRATION is unit-tested (with a
// fake tile factory, reused unchanged for vegetation — see
// renderer/Renderer.js) while the real Three.js geometry-building glue
// here isn't.

const TRUNK_RADIUS_TOP = 0.09;
const TRUNK_RADIUS_BOTTOM = 0.14;
const TRUNK_HEIGHT = 1.5;
const TRUNK_RADIAL_SEGMENTS = 6; // low-poly on purpose

const CANOPY_RADIUS = 0.85;
const CANOPY_HEIGHT = 1.9;
const CANOPY_RADIAL_SEGMENTS = 7; // low-poly on purpose

// Muted, low-saturation tones — the same restraint
// core/TerrainSurface.js#SURFACE_PALETTE already applies to ground color,
// extended here to the one other object type this milestone introduces.
const TRUNK_COLOR = new THREE.Color(0.42, 0.33, 0.24);
const CANOPY_COLORS = [
    new THREE.Color(0.35, 0.49, 0.33), // soft mid green
    new THREE.Color(0.29, 0.43, 0.30), // deeper, conifer-leaning green
    new THREE.Color(0.44, 0.53, 0.34)  // lighter, warmer green
];

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scaleVec = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

function applyBoundingSphere(mesh) {
    if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
}

// Builds one tile's worth of natural-feature (tree) geometry. Returns an
// empty THREE.Group for a tile with no qualifying trees (e.g. entirely
// WATER/ROCK/FIELD ground) rather than null, so callers — exactly
// renderer/TerrainStreamingController.js's own tileFactory contract — can
// treat every tile uniformly.
export function buildNaturalFeatureTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    const features = naturalFeaturesInRegion(seed, minX, minZ, minX + tileSize, minZ + tileSize)
        .filter((feature) => feature.type === FEATURE_TYPE.TREE);

    const group = new THREE.Group();
    if (features.length === 0) return group;

    const trunkGeometry = new THREE.CylinderGeometry(
        TRUNK_RADIUS_TOP, TRUNK_RADIUS_BOTTOM, TRUNK_HEIGHT, TRUNK_RADIAL_SEGMENTS
    );
    trunkGeometry.translate(0, TRUNK_HEIGHT / 2, 0); // pivot at the base, matching a tree planted at ground Y

    const canopyGeometry = new THREE.ConeGeometry(CANOPY_RADIUS, CANOPY_HEIGHT, CANOPY_RADIAL_SEGMENTS);
    canopyGeometry.translate(0, TRUNK_HEIGHT + CANOPY_HEIGHT * 0.45, 0); // canopy sits atop the trunk, slightly overlapping

    const trunkMesh = new THREE.InstancedMesh(
        trunkGeometry, new THREE.MeshStandardMaterial({ color: TRUNK_COLOR }), features.length
    );
    const canopyMesh = new THREE.InstancedMesh(
        canopyGeometry, new THREE.MeshStandardMaterial({ vertexColors: true }), features.length
    );

    // Instance matrices hold ABSOLUTE world coordinates directly (the
    // group itself stays at the origin) — the same "vertex Y already
    // holds absolute world elevation" convention
    // renderer/TerrainTileMesh.js's own header documents, applied here to
    // an instance transform instead of a vertex position.
    features.forEach((feature, i) => {
        _position.set(feature.x, feature.y, feature.z);
        _euler.set(0, feature.rotationY, 0);
        _quaternion.setFromEuler(_euler);
        _scaleVec.set(feature.scale, feature.scale, feature.scale);
        _matrix.compose(_position, _quaternion, _scaleVec);

        trunkMesh.setMatrixAt(i, _matrix);
        canopyMesh.setMatrixAt(i, _matrix);
        canopyMesh.setColorAt(i, CANOPY_COLORS[feature.variant] ?? CANOPY_COLORS[0]);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    applyBoundingSphere(trunkMesh);
    applyBoundingSphere(canopyMesh);

    group.add(trunkMesh);
    group.add(canopyMesh);
    return group;
}
