import * as THREE from 'three';
import { wildlifeInRegion, WILDLIFE_FEATURE_TYPE, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// The renderer-side counterpart to core/WildlifeField.js — the identical
// "core decides, renderer builds" split renderer/NaturalFeatureTileMesh.js
// already establishes for trees: this file knows nothing about WHERE an
// animal stands or WHY, only how to turn one tile's worth of deterministic
// animal candidates into stylized Three.js geometry.
//
// Deliberately TWO THREE.InstancedMesh objects PER SPECIES present in a
// tile (body, then head) — the same batching discipline
// renderer/NaturalFeatureTileMesh.js's own header established for
// trunk/canopy pairs, applied here to body/head pairs. It scales with how
// many SPECIES a tile mixes, never with how many individual animals it
// holds.
//
// Deliberately stylized, low-poly, and muted — the exact restraint
// core/TerrainSurface.js#SURFACE_PALETTE's own header established
// ("buildings and avatars remain the visual focus"), extended here: every
// ANIMAL_SPECIES is still just two low-poly spheres (an elongated-body
// ellipsoid under a smaller head), never a detailed creature asset that
// would visually compete with a building or an avatar. No legs, ears, or
// tail are modeled — the same "no roots modeled" restraint
// renderer/NaturalFeatureTileMesh.js's own trunk/canopy presets already
// accept for trees.
//
// Deliberately untested directly, same posture as
// renderer/NaturalFeatureTileMesh.js — see that file's own header for why
// the load/unload ORCHESTRATION is unit-tested (with a fake tile factory,
// reused unchanged for wildlife — see renderer/Renderer.js) while the real
// Three.js geometry-building glue here isn't.

const BODY_SEGMENTS_WIDTH = 7; // low-poly on purpose
const BODY_SEGMENTS_HEIGHT = 5; // low-poly on purpose
const HEAD_SEGMENTS_WIDTH = 6; // low-poly on purpose
const HEAD_SEGMENTS_HEIGHT = 5; // low-poly on purpose

// One geometry+color preset per core/WildlifeField.js#ANIMAL_SPECIES —
// each pivoted at its own base (y=0, matching an animal standing at
// ground Y) with its head translated forward and up from the body,
// slightly overlapping, the same "canopy translated atop its own trunk"
// convention renderer/NaturalFeatureTileMesh.js's own buildPreset()
// already uses. Built once at module load and reused, unchanged, across
// every tile's InstancedMesh — geometry has no per-tile data, only
// per-instance transforms do.
const SPECIES_PRESET = {
    // A larger, elongated body — deep FOREST cover.
    [ANIMAL_SPECIES.DEER]: buildPreset({
        bodyRadiusX: 0.34, bodyRadiusY: 0.42, bodyRadiusZ: 0.72,
        headRadius: 0.26, headHeightFactor: 1.05, headForwardOverlap: 0.55,
        headColor: new THREE.Color(0.32, 0.22, 0.14),
        furColors: [
            new THREE.Color(0.52, 0.38, 0.24), // warm tan
            new THREE.Color(0.44, 0.32, 0.20), // deeper brown
            new THREE.Color(0.58, 0.45, 0.30)  // lighter, sun-bleached tan
        ]
    }),
    // A smaller, rounder body with a proportionally larger head — sparse
    // open GRASSLAND.
    [ANIMAL_SPECIES.RABBIT]: buildPreset({
        bodyRadiusX: 0.20, bodyRadiusY: 0.20, bodyRadiusZ: 0.28,
        headRadius: 0.17, headHeightFactor: 1.15, headForwardOverlap: 0.5,
        headColor: new THREE.Color(0.38, 0.34, 0.28),
        furColors: [
            new THREE.Color(0.55, 0.51, 0.44), // warm grey
            new THREE.Color(0.42, 0.34, 0.24), // deeper brown
            new THREE.Color(0.62, 0.59, 0.53)  // pale, light grey
        ]
    })
};

function buildPreset({ bodyRadiusX, bodyRadiusY, bodyRadiusZ, headRadius, headHeightFactor, headForwardOverlap, headColor, furColors }) {
    const bodyGeometry = new THREE.SphereGeometry(1, BODY_SEGMENTS_WIDTH, BODY_SEGMENTS_HEIGHT);
    bodyGeometry.scale(bodyRadiusX, bodyRadiusY, bodyRadiusZ);
    bodyGeometry.translate(0, bodyRadiusY, 0);

    const headGeometry = new THREE.SphereGeometry(headRadius, HEAD_SEGMENTS_WIDTH, HEAD_SEGMENTS_HEIGHT);
    headGeometry.translate(0, bodyRadiusY * headHeightFactor, bodyRadiusZ + headRadius * headForwardOverlap);

    return {
        bodyGeometry,
        headGeometry,
        // vertexColors on the body so each instance can be tinted by its
        // own feature.variant (see buildSpeciesMeshes() below) — the same
        // "fixed trunk color, per-variant canopy color" split
        // renderer/NaturalFeatureTileMesh.js already uses, mirrored here
        // as "fixed head color, per-variant body/fur color."
        bodyMaterial: new THREE.MeshStandardMaterial({ vertexColors: true }),
        headMaterial: new THREE.MeshStandardMaterial({ color: headColor }),
        furColors
    };
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scaleVec = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

function applyBoundingSphere(mesh) {
    if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
}

// Builds one species' worth of animals within a tile into a body/head
// InstancedMesh pair, using that species' own shared preset geometry.
function buildSpeciesMeshes(preset, animals) {
    const bodyMesh = new THREE.InstancedMesh(preset.bodyGeometry, preset.bodyMaterial, animals.length);
    const headMesh = new THREE.InstancedMesh(preset.headGeometry, preset.headMaterial, animals.length);

    // Instance matrices hold ABSOLUTE world coordinates directly (the
    // group itself stays at the origin) — the same convention
    // renderer/NaturalFeatureTileMesh.js's own header documents for trees,
    // applied here to an animal's instance transform.
    animals.forEach((animal, i) => {
        _position.set(animal.x, animal.y, animal.z);
        _euler.set(0, animal.rotationY, 0);
        _quaternion.setFromEuler(_euler);
        _scaleVec.set(animal.scale, animal.scale, animal.scale);
        _matrix.compose(_position, _quaternion, _scaleVec);

        bodyMesh.setMatrixAt(i, _matrix);
        headMesh.setMatrixAt(i, _matrix);
        bodyMesh.setColorAt(i, preset.furColors[animal.variant] ?? preset.furColors[0]);
    });
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    applyBoundingSphere(bodyMesh);
    applyBoundingSphere(headMesh);

    return [bodyMesh, headMesh];
}

// Builds one tile's worth of wildlife geometry. Returns an empty
// THREE.Group for a tile with no qualifying animals (e.g. entirely
// WATER/ROCK/FIELD/BEACH/HIGHLAND ground) rather than null, so callers —
// exactly renderer/TerrainStreamingController.js's own tileFactory
// contract — can treat every tile uniformly.
//
// A tile groups its animals by species and builds one body/head
// InstancedMesh PAIR PER SPECIES present — still exactly two draw calls
// per species, never one draw call per animal.
export function buildWildlifeTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    const animals = wildlifeInRegion(seed, minX, minZ, minX + tileSize, minZ + tileSize)
        .filter((animal) => animal.type === WILDLIFE_FEATURE_TYPE.ANIMAL);

    const group = new THREE.Group();
    if (animals.length === 0) return group;

    const bySpecies = new Map();
    for (const animal of animals) {
        const bucket = bySpecies.get(animal.species);
        if (bucket) bucket.push(animal);
        else bySpecies.set(animal.species, [animal]);
    }

    for (const [species, speciesAnimals] of bySpecies) {
        const preset = SPECIES_PRESET[species] ?? SPECIES_PRESET[ANIMAL_SPECIES.RABBIT];
        for (const mesh of buildSpeciesMeshes(preset, speciesAnimals)) group.add(mesh);
    }

    return group;
}
