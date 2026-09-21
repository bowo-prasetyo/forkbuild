import * as THREE from 'three';
import { naturalFeaturesInRegion, FEATURE_TYPE, TREE_SPECIES } from '../core/NaturalFeatureField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';

// The renderer-side counterpart to core/NaturalFeatureField.js — see
// docs/Roadmap.md, 0.2.88: it knows nothing about WHERE a tree stands or
// WHY, only how to turn one tile's worth of deterministic feature
// candidates into stylized Three.js geometry, the same
// core-decides/renderer-builds split renderer/TerrainTileMesh.js already
// establishes for ground.
//
// Deliberately TWO THREE.InstancedMesh objects PER SPECIES present in a
// tile (trunks, then canopies) rather than one Mesh per tree — a tile can
// host dozens of trees, and 40 individual meshes would mean 40 draw calls
// where a handful of instanced pairs suffice. This is the "Grass should
// be treated differently from trees... potentially using instancing"
// design note from the 0.2.88 conversation, applied here to trees
// themselves: it scales with how many SPECIES a tile mixes, never with
// how many individual trees it holds.
//
// Deliberately stylized, low-poly, and muted — matching the exact
// restraint core/TerrainSurface.js#SURFACE_PALETTE's own header already
// established ("soft, low-saturation... buildings and avatars remain the
// visual focus"): every core/NaturalFeatureField.js#TREE_SPECIES is still
// just a cylinder trunk under one simple canopy primitive (a cone or a
// low-poly sphere), never a detailed tree asset that would visually
// compete with a building.
//
// Deliberately untested directly, same posture as
// renderer/TerrainTileMesh.js — see renderer/TerrainStreamingController.js's
// own header for why the load/unload ORCHESTRATION is unit-tested (with a
// fake tile factory, reused unchanged for vegetation — see
// renderer/Renderer.js) while the real Three.js geometry-building glue
// here isn't.

const TRUNK_RADIAL_SEGMENTS = 6; // low-poly on purpose
const CANOPY_RADIAL_SEGMENTS = 7; // low-poly on purpose

// One geometry+color preset per core/NaturalFeatureField.js#TREE_SPECIES —
// each pivoted at its own base (y=0, matching a tree planted at ground Y)
// with its canopy translated to sit atop its own trunk, slightly
// overlapping, the same way the single original conifer preset already
// did. Built once at module load and reused, unchanged, across every
// tile's InstancedMesh — geometry has no per-tile data, only per-instance
// transforms do, so there is nothing tile-specific to rebuild per call.
const SPECIES_PRESET = {
    // The original preset, unchanged: a narrow cone over a slim trunk —
    // deep, wet FOREST interior.
    [TREE_SPECIES.CONIFER]: buildPreset({
        trunkRadiusTop: 0.09, trunkRadiusBottom: 0.14, trunkHeight: 1.5,
        canopy: () => new THREE.ConeGeometry(0.85, 1.9, CANOPY_RADIAL_SEGMENTS),
        canopyOverlap: 1.9 * 0.45,
        trunkColor: new THREE.Color(0.42, 0.33, 0.24),
        canopyColors: [
            new THREE.Color(0.35, 0.49, 0.33), // soft mid green
            new THREE.Color(0.29, 0.43, 0.30), // deeper, conifer-leaning green
            new THREE.Color(0.44, 0.53, 0.34)  // lighter, warmer green
        ]
    }),
    // A stockier trunk under a rounded canopy (a low-poly sphere, not a
    // cone) — the drier, transitional half of FOREST.
    [TREE_SPECIES.BROADLEAF]: buildPreset({
        trunkRadiusTop: 0.11, trunkRadiusBottom: 0.16, trunkHeight: 1.3,
        canopy: () => new THREE.SphereGeometry(0.95, 7, 5),
        canopyOverlap: 0.95 * 0.85,
        trunkColor: new THREE.Color(0.40, 0.31, 0.20),
        canopyColors: [
            new THREE.Color(0.47, 0.56, 0.30), // warm mid green
            new THREE.Color(0.41, 0.50, 0.26), // deeper olive green
            new THREE.Color(0.54, 0.60, 0.34)  // light, yellow-leaning green
        ]
    }),
    // Short and thin, with a small rounded canopy — sparse, hardy
    // GRASSLAND fringe trees, deliberately the smallest of the three
    // presets so a scattered fringe tree never reads as forest-scale.
    [TREE_SPECIES.SCRUB]: buildPreset({
        trunkRadiusTop: 0.06, trunkRadiusBottom: 0.09, trunkHeight: 0.75,
        canopy: () => new THREE.SphereGeometry(0.55, 6, 4),
        canopyOverlap: 0.55 * 0.85,
        trunkColor: new THREE.Color(0.45, 0.38, 0.27),
        canopyColors: [
            new THREE.Color(0.56, 0.57, 0.39), // dry sage
            new THREE.Color(0.49, 0.51, 0.33), // deeper olive-drab
            new THREE.Color(0.61, 0.60, 0.42)  // pale, sun-bleached green
        ]
    })
};

function buildPreset({ trunkRadiusTop, trunkRadiusBottom, trunkHeight, canopy, canopyOverlap, trunkColor, canopyColors }) {
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, TRUNK_RADIAL_SEGMENTS);
    trunkGeometry.translate(0, trunkHeight / 2, 0);

    const canopyGeometry = canopy();
    canopyGeometry.translate(0, trunkHeight + canopyOverlap, 0);

    return {
        trunkGeometry,
        canopyGeometry,
        // Muted, low-saturation tones — the same restraint
        // core/TerrainSurface.js#SURFACE_PALETTE already applies to ground
        // color, extended here to every species this milestone introduces.
        trunkMaterial: new THREE.MeshStandardMaterial({ color: trunkColor }),
        canopyMaterial: new THREE.MeshStandardMaterial({ vertexColors: true }),
        canopyColors
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

// Builds one species' worth of trees within a tile into a trunk/canopy
// InstancedMesh pair, using that species' own shared preset geometry —
// the exact per-feature transform/color loop the single-species version
// of this file already used, unchanged, just scoped to one species' own
// feature subset instead of the whole tile's.
function buildSpeciesMeshes(preset, features) {
    const trunkMesh = new THREE.InstancedMesh(preset.trunkGeometry, preset.trunkMaterial, features.length);
    const canopyMesh = new THREE.InstancedMesh(preset.canopyGeometry, preset.canopyMaterial, features.length);

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
        canopyMesh.setColorAt(i, preset.canopyColors[feature.variant] ?? preset.canopyColors[0]);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    applyBoundingSphere(trunkMesh);
    applyBoundingSphere(canopyMesh);

    return [trunkMesh, canopyMesh];
}

// Builds one tile's worth of natural-feature (tree) geometry. Returns an
// empty THREE.Group for a tile with no qualifying trees (e.g. entirely
// WATER/ROCK/FIELD ground) rather than null, so callers — exactly
// renderer/TerrainStreamingController.js's own tileFactory contract — can
// treat every tile uniformly.
//
// A tile groups its trees by species and builds one trunk/canopy
// InstancedMesh PAIR PER SPECIES present — still exactly two draw calls
// per species, never one draw call per tree, preserving the batching
// discipline this file's own header established when there was only one
// species to batch.
export function buildNaturalFeatureTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    const features = naturalFeaturesInRegion(seed, minX, minZ, minX + tileSize, minZ + tileSize)
        .filter((feature) => feature.type === FEATURE_TYPE.TREE);

    const group = new THREE.Group();
    if (features.length === 0) return group;

    const bySpecies = new Map();
    for (const feature of features) {
        const bucket = bySpecies.get(feature.species);
        if (bucket) bucket.push(feature);
        else bySpecies.set(feature.species, [feature]);
    }

    for (const [species, speciesFeatures] of bySpecies) {
        const preset = SPECIES_PRESET[species] ?? SPECIES_PRESET[TREE_SPECIES.CONIFER];
        for (const mesh of buildSpeciesMeshes(preset, speciesFeatures)) group.add(mesh);
    }

    return group;
}
