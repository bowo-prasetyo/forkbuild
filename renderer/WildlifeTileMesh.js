import * as THREE from 'three';
import { wildlifeInRegion, WILDLIFE_FEATURE_TYPE, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { animalPoseAt, MAX_WANDER_DISTANCE } from '../core/WildlifeMotion.js';
import { gaitOffsetsAt, REST_GAIT } from './AnimalGait.js';
import { idleOffsetsAt } from './AnimalIdle.js';
import { reactToObserver } from './AnimalReaction.js';

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
// would visually compete with a building or an avatar. Ears and a tail are
// small ellipsoids merged into the head's and body's own geometry, so they
// cost no extra mesh or draw call and move with what they are attached
// to. No legs are modeled — the same "no roots modeled" restraint
// renderer/NaturalFeatureTileMesh.js's own trunk/canopy presets already
// accept for trees. A walking animal's gait is therefore carried by the
// body and head transforms alone (renderer/AnimalGait.js): body and head
// are separate InstancedMeshes precisely so the head can nod on its own.
//
// Unlike renderer/NaturalFeatureTileMesh.js, whose geometry-building glue
// is deliberately untested, this file's per-frame motion
// (updateWildlifeTileMesh()) is tested directly in
// tests/WildlifeMotionIntegration.test.js: where each instance ends up and
// that its bounding sphere always contains it are behavior worth pinning.

const BODY_SEGMENTS_WIDTH = 7; // low-poly on purpose
const BODY_SEGMENTS_HEIGHT = 5; // low-poly on purpose
const HEAD_SEGMENTS_WIDTH = 6; // low-poly on purpose
const HEAD_SEGMENTS_HEIGHT = 5; // low-poly on purpose
const APPENDAGE_SEGMENTS_WIDTH = 5; // ears and tails: lower-poly still
const APPENDAGE_SEGMENTS_HEIGHT = 4;

// One geometry+color preset per core/WildlifeField.js#ANIMAL_SPECIES —
// each pivoted at its own base (y=0, matching an animal standing at
// ground Y) with its head translated forward and up from the body,
// slightly overlapping, the same "canopy translated atop its own trunk"
// convention renderer/NaturalFeatureTileMesh.js's own buildPreset()
// already uses. Built once at module load and reused, unchanged, across
// every tile's InstancedMesh — geometry has no per-tile data, only
// per-instance transforms do.
//
// 0.9.701 — EXPORTED so renderer/AnimalRenderer.js (a released,
// individually-tracked animal's own visual — see that file's own
// header) can build the SAME body/head shape a decorative, tile-baked
// animal already uses, from the SAME single source of truth, rather
// than a second, drifting copy of these per-species numbers. Still
// built exactly once, here, at module load — renderer/AnimalRenderer.js
// reuses `bodyGeometry`/`headGeometry` directly (shared, never disposed
// by an individual animal's own removal — see that file's own header
// for why) and only ever clones `bodyMaterial`/`headMaterial` for its
// own per-instance ownership.
export const SPECIES_PRESET = {
    // A larger, elongated body — deep FOREST cover.
    [ANIMAL_SPECIES.DEER]: buildPreset({
        bodyRadiusX: 0.34, bodyRadiusY: 0.42, bodyRadiusZ: 0.72,
        headRadius: 0.26, headHeightFactor: 1.05, headForwardOverlap: 0.55,
        // Broad ears held out to the sides; a short tail, cocked up.
        ears: { width: 0.075, height: 0.15, depth: 0.028, spread: 0.15, rise: 0.24, back: -0.07, splay: 0.75, tilt: -0.2 },
        tail: { width: 0.05, height: 0.1, depth: 0.04, rise: 0.23, back: 0.61, tilt: -0.5 },
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
        // Long ears standing up and swept back; a round cotton tail.
        ears: { width: 0.04, height: 0.15, depth: 0.022, spread: 0.055, rise: 0.27, back: -0.04, splay: 0.15, tilt: -0.25 },
        tail: { width: 0.07, height: 0.07, depth: 0.07, rise: 0.04, back: 0.266, tilt: 0 },
        headColor: new THREE.Color(0.38, 0.34, 0.28),
        furColors: [
            new THREE.Color(0.55, 0.51, 0.44), // warm grey
            new THREE.Color(0.42, 0.34, 0.24), // deeper brown
            new THREE.Color(0.62, 0.59, 0.53)  // pale, light grey
        ]
    })
};

// A small low-poly ellipsoid of the given radii, tipped back by `tilt`
// about X and out by `splay` about Z (both about its own center), then
// moved to `(x, y, z)`. The one shape ears and tails are made of.
function ellipsoidAt({ width, height, depth, tilt = 0, splay = 0 }, x, y, z) {
    const geometry = new THREE.SphereGeometry(1, APPENDAGE_SEGMENTS_WIDTH, APPENDAGE_SEGMENTS_HEIGHT);
    geometry.scale(width, height, depth);
    geometry.rotateX(tilt);
    geometry.rotateZ(splay);
    geometry.translate(x, y, z);
    return geometry;
}

// Concatenates indexed geometries sharing position/normal/uv attributes
// into one, so ears ride in the head's geometry and a tail in the body's:
// no extra meshes, no extra draw calls, and they nod, turn and hop with
// whatever they are part of.
function mergeGeometries(geometries) {
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
        const itemSize = geometries[0].attributes[name].itemSize;
        const arrays = geometries.map((g) => g.attributes[name].array);
        const combined = new Float32Array(arrays.reduce((sum, a) => sum + a.length, 0));
        let offset = 0;
        for (const array of arrays) {
            combined.set(array, offset);
            offset += array.length;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(combined, itemSize));
    }
    const indices = [];
    let base = 0;
    for (const geometry of geometries) {
        for (const index of geometry.index.array) indices.push(index + base);
        base += geometry.attributes.position.count;
    }
    merged.setIndex(indices);
    for (const geometry of geometries) geometry.dispose();
    return merged;
}

function buildPreset({ bodyRadiusX, bodyRadiusY, bodyRadiusZ, headRadius, headHeightFactor, headForwardOverlap, ears, tail, headColor, furColors }) {
    const body = new THREE.SphereGeometry(1, BODY_SEGMENTS_WIDTH, BODY_SEGMENTS_HEIGHT);
    body.scale(bodyRadiusX, bodyRadiusY, bodyRadiusZ);
    body.translate(0, bodyRadiusY, 0);
    // The tail sits on the rump: `rise` above the body's middle, `back`
    // behind its center.
    const bodyGeometry = mergeGeometries([
        body,
        ellipsoidAt(tail, 0, bodyRadiusY + tail.rise, -tail.back)
    ]);

    const headY = bodyRadiusY * headHeightFactor;
    const headZ = bodyRadiusZ + headRadius * headForwardOverlap;
    const head = new THREE.SphereGeometry(headRadius, HEAD_SEGMENTS_WIDTH, HEAD_SEGMENTS_HEIGHT);
    head.translate(0, headY, headZ);
    // A pair of ears, mirrored: `spread` to each side of the head's
    // center, `rise` above it, `back` along it, each splayed outward.
    const headGeometry = mergeGeometries([
        head,
        ellipsoidAt({ ...ears, splay: -ears.splay }, ears.spread, headY + ears.rise, headZ + ears.back),
        ellipsoidAt({ ...ears, splay: ears.splay }, -ears.spread, headY + ears.rise, headZ + ears.back)
    ]);

    return {
        bodyGeometry,
        headGeometry,
        // No vertexColors here — InstancedMesh#setColorAt() (see
        // buildSpeciesMeshes() below) tints each instance through its own
        // instanceColor attribute, which three.js applies automatically
        // whenever it's present. Setting vertexColors:true as well would
        // make the shader ALSO read a per-vertex 'color' geometry
        // attribute this geometry never defines; WebGL then supplies the
        // default (0,0,0) for that missing attribute, multiplying every
        // instance's color to black regardless of instanceColor — the
        // same "fixed head color, per-variant body/fur color" split
        // renderer/NaturalFeatureTileMesh.js already uses, mirrored here
        // as "fixed head color, per-variant body/fur color."
        bodyMaterial: new THREE.MeshStandardMaterial(),
        headMaterial: new THREE.MeshStandardMaterial({ color: headColor }),
        furColors,
        // The base of the (unmodeled) neck, in the same local frame as the
        // geometry: the point a nodding head swings about (see
        // renderer/AnimalGait.js). Set back inside the front of the body,
        // at the head's height, so the head swings on a neck-length arm —
        // a pivot at the head itself would only spin the sphere in place.
        neckPivot: new THREE.Vector3(0, bodyRadiusY * headHeightFactor, bodyRadiusZ * 0.35)
    };
}

// Shared, frozen, never mutated — a caller with nothing caught yet
// passes no argument at all, and this file never allocates a fresh
// empty Set per tile just to have something to call .has() on.
const EMPTY_EXCLUSION_SET = new Set();

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
// 'YXZ': turn to the heading first, then pitch about the animal's own
// sideways axis — so a positive pitch always tips its nose down, whichever
// way it faces.
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scaleVec = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _headMatrix = new THREE.Matrix4();
const _nod = new THREE.Matrix4();
const _turn = new THREE.Matrix4();
const _pivot = new THREE.Matrix4();

// A tile's bounding spheres are computed once, from where its animals were
// placed, and padded by how far they can wander (core/WildlifeMotion.js)
// so frustum culling never hides an animal that has walked toward the
// edge of the view. Twice the wander distance leaves room for the terrain
// rising or falling under a wandering animal as well.
const BOUNDING_SPHERE_PADDING = MAX_WANDER_DISTANCE * 2;

function applyBoundingSphere(mesh) {
    if (typeof mesh.computeBoundingSphere !== 'function') return;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += BOUNDING_SPHERE_PADDING;
}

// Writes one animal's transform, at `pose`, into instance `i` of both
// meshes. Instance matrices hold ABSOLUTE world coordinates directly (the
// group itself stays at the origin) — the same convention
// renderer/NaturalFeatureTileMesh.js's own header documents for trees.
//
// `offsets` (renderer/AnimalGait.js while walking, renderer/AnimalIdle.js
// while standing) lifts and pitches the body, and turns and nods the head
// about `preset.neckPivot` on top of that; at rest the head simply shares
// the body's transform.
function writeInstance(bodyMesh, headMesh, i, pose, scale, preset, offsets = REST_GAIT) {
    _position.set(pose.x, pose.y + offsets.lift * scale, pose.z);
    _euler.set(offsets.bodyPitch, pose.rotationY, 0);
    _quaternion.setFromEuler(_euler);
    _scaleVec.set(scale, scale, scale);
    _matrix.compose(_position, _quaternion, _scaleVec);
    bodyMesh.setMatrixAt(i, _matrix);
    if (offsets.headPitch === 0 && offsets.headYaw === 0) {
        headMesh.setMatrixAt(i, _matrix);
        return;
    }
    // body × T(pivot) × Ry(turn) × Rx(nod) × T(-pivot), all in the
    // geometry's own frame: the head turns, then nods, about its neck.
    const { x, y, z } = preset.neckPivot;
    _headMatrix.copy(_matrix)
        .multiply(_pivot.makeTranslation(x, y, z))
        .multiply(_turn.makeRotationY(offsets.headYaw))
        .multiply(_nod.makeRotationX(offsets.headPitch))
        .multiply(_pivot.makeTranslation(-x, -y, -z));
    headMesh.setMatrixAt(i, _headMatrix);
}

// Builds one species' worth of animals within a tile into a body/head
// InstancedMesh pair, using that species' own shared preset geometry,
// with every animal at its placed position.
function buildSpeciesMeshes(preset, animals) {
    const bodyMesh = new THREE.InstancedMesh(preset.bodyGeometry, preset.bodyMaterial, animals.length);
    const headMesh = new THREE.InstancedMesh(preset.headGeometry, preset.headMaterial, animals.length);

    animals.forEach((animal, i) => {
        writeInstance(bodyMesh, headMesh, i, animal, animal.scale, preset);
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
// 0.9.700 — Animal Catching. `excludedAnimalIds` (optional, defaults to
// an empty set) is the ONE new parameter this milestone adds — a caught
// animal's own core/AnimalIdentity.js id, so this tile simply never
// builds geometry for it, the same "renderer glue reads whatever the
// application layer already decided" split
// application/world/VehicleRuntimeInstances.js's own render sync already
// establishes for vehicles. This file still computes no catch/exclusion
// policy of its own — it only ever filters a set it is handed.
//
// A tile holds the animals PLACED in it, and keeps holding them while
// they wander: core/WildlifeMotion.js never lets an animal leave its own
// lattice cell, so it never leaves its tile either. The tile remembers
// them (in `userData.wildlife`) so updateWildlifeTileMesh() can move them
// each frame. `timeSeconds` (optional) poses them straight away; without
// it they start at their placed positions.
export function buildWildlifeTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, excludedAnimalIds = EMPTY_EXCLUSION_SET, timeSeconds = null) {
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    const animals = wildlifeInRegion(seed, minX, minZ, minX + tileSize, minZ + tileSize)
        .filter((animal) => animal.type === WILDLIFE_FEATURE_TYPE.ANIMAL && !excludedAnimalIds.has(animal.id));

    const group = new THREE.Group();
    if (animals.length === 0) return group;

    const bySpecies = new Map();
    for (const animal of animals) {
        const bucket = bySpecies.get(animal.species);
        if (bucket) bucket.push(animal);
        else bySpecies.set(animal.species, [animal]);
    }

    const herds = [];
    for (const [species, speciesAnimals] of bySpecies) {
        const preset = SPECIES_PRESET[species] ?? SPECIES_PRESET[ANIMAL_SPECIES.RABBIT];
        const [bodyMesh, headMesh] = buildSpeciesMeshes(preset, speciesAnimals);
        group.add(bodyMesh);
        group.add(headMesh);
        herds.push({ species, preset, animals: speciesAnimals, bodyMesh, headMesh });
    }
    group.userData.wildlife = { seed, herds };

    if (timeSeconds !== null && timeSeconds !== undefined) {
        updateWildlifeTileMesh(group, timeSeconds);
    }
    return group;
}

// Moves every animal in a tile built by buildWildlifeTileMesh() to where
// it is at `timeSeconds` (core/WildlifeMotion.js#animalPoseAt()) by
// rewriting instance transforms in place — no geometry is rebuilt and no
// draw call is added. Called once per frame for every loaded tile. A
// group with no animals is left alone. A walking animal also moves with
// its gait (renderer/AnimalGait.js) — hopping or stepping in time with the
// ground it covers — and a standing one with its idle action
// (renderer/AnimalIdle.js): grazing, or alert and looking around.
//
// `observer` ({ x, z } — the viewer's own avatar — or null) is who the
// animals watch (renderer/AnimalReaction.js): heads turn toward it, and
// nothing about where an animal is changes.
export function updateWildlifeTileMesh(group, timeSeconds, observer = null) {
    const wildlife = group.userData.wildlife;
    if (!wildlife) return;
    for (const { species, preset, animals, bodyMesh, headMesh } of wildlife.herds) {
        animals.forEach((animal, i) => {
            const pose = animalPoseAt(wildlife.seed, animal, timeSeconds);
            const own = pose.moving
                ? gaitOffsetsAt(species, pose.gaitPhase)
                : idleOffsetsAt(species, pose.idleAction, pose.idleSeconds, pose.idleDuration);
            const offsets = reactToObserver(species, own, pose, pose.x, pose.z, observer);
            writeInstance(bodyMesh, headMesh, i, pose, animal.scale, preset, offsets);
        });
        bodyMesh.instanceMatrix.needsUpdate = true;
        headMesh.instanceMatrix.needsUpdate = true;
    }
}
