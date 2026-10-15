import * as THREE from 'three';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT, waterSurfaceColorAt, seaShareAt } from '../core/Hydrology.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';
import { TILE_SEGMENTS } from './TerrainTileMesh.js';
import { makeWaterWaving } from './WaterWaveMaterial.js';
import { buildRiverTileMesh } from './RiverTileMesh.js';

// The renderer-side counterpart to core/Hydrology.js's LAKE concept —
// see docs/Roadmap.md, 0.2.89: it knows nothing about WHERE a lake is or
// WHY, only how to turn one tile's worth of ground into a still, flat
// water plane, the same core-decides/renderer-builds split
// renderer/TerrainTileMesh.js already establishes for ground and
// renderer/NaturalFeatureTileMesh.js establishes for trees.
//
// A lake gets ACTUAL flat geometry (a river's water is a separate thin
// sheet that follows the ground instead, renderer/RiverTileMesh.js): still
// water genuinely sits at one constant elevation regardless of how the
// terrain beneath it rises and falls, exactly the way a real lake's
// surface does not follow the lakebed. A ground-color tint could never
// express that; a flat plane can, and needs no new streaming machinery
// to do it.
//
// The surface is still in shape but not in motion: the material moves it
// with core/WaterWaves.js's swell and ripples (renderer/WaterWaveMaterial.js),
// lifting at most MAX_SWELL_HEIGHT, far less than SINK_DEPTH, so a dry
// vertex never rises through the ground.
//
// The "sink every dry vertex below ground" trick below is what keeps
// this mesh trivially correct at a tile boundary with zero seam-handling
// code: every vertex is placed from nothing but its own WORLD (x, z),
// the same "continuous world coordinates, never tile coordinates"
// discipline every sibling tile mesh in this codebase already follows —
// two tiles sharing an edge vertex independently compute the exact same
// y for it, water or not.
const SINK_DEPTH = 4; // world units below the actual ground — comfortably occludes even this world's steepest 1-tile relief

const UNDERSIDE_COLOR = 0x9fd8e8;
const UNDERSIDE_OPACITY = 0.7;
const WATER_OPACITY = 0.78; // translucent, not a mirror — see core/TerrainSurface.js's own "buildings and avatars remain the visual focus" restraint, extended here to water
const WATER_ROUGHNESS = 0.4; // glossy enough that the sun glints off the ripples, still far from a mirror

// Deliberately untested directly, same posture as renderer/TerrainTileMesh.js
// and renderer/NaturalFeatureTileMesh.js — see
// renderer/TerrainStreamingController.js's own header for why load/unload
// ORCHESTRATION is unit-tested (with a fake tile factory, reused unchanged
// for water — see renderer/Renderer.js) while the real Three.js
// geometry-building glue here isn't.
// `waveTime` is the { value } in seconds every water tile's waves read (see
// renderer/WaterWaveMaterial.js); a tile built without one stays still.
export function buildWaterTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, waveTime = { value: 0 }) {
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, TILE_SEGMENTS, TILE_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const center = tileCenter(tx, tz, tileSize);
    const position = geometry.attributes.position;
    // Per-vertex color, so one tile can run from lake tone to sea tone
    // across a shelf (core/Hydrology.js#waterSurfaceColorAt()).
    const colors = new Float32Array(position.count * 3);
    const seaShares = new Float32Array(position.count);
    // How far below the still surface the ground lies, negative on dry
    // ground: where it runs shallow the surface foams
    // (renderer/WaterWaveMaterial.js).
    const shoreDepths = new Float32Array(position.count);
    let hasWater = false;
    for (let i = 0; i < position.count; i++) {
        const worldX = center.x + position.getX(i);
        const worldZ = center.z + position.getZ(i);
        const groundHeight = terrainHeightAt(seed, worldX, worldZ);
        shoreDepths[i] = LAKE_SURFACE_HEIGHT - groundHeight;
        const isLake = surfaceCategoryAt(seed, worldX, worldZ) === SURFACE_CATEGORY.WATER;
        if (isLake) {
            hasWater = true;
            position.setY(i, LAKE_SURFACE_HEIGHT);
            const color = waterSurfaceColorAt(seed, worldX, worldZ);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            seaShares[i] = seaShareAt(seed, worldX, worldZ);
        } else {
            position.setY(i, groundHeight - SINK_DEPTH);
        }
    }

    // No lake anywhere in this tile's sampled grid — every vertex sank
    // below ground, so the mesh would be entirely invisible anyway.
    // Returning an empty group (the same "empty tile" contract
    // renderer/NaturalFeatureTileMesh.js already uses) skips building a
    // draw call the streaming ring would otherwise carry for nothing.
    if (!hasWater) return new THREE.Group();

    position.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSeaShare', new THREE.BufferAttribute(seaShares, 1));
    geometry.setAttribute('aShoreDepth', new THREE.BufferAttribute(shoreDepths, 1));
    geometry.computeVertexNormals();

    const material = makeWaterWaving(new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: WATER_ROUGHNESS,
        transparent: true,
        opacity: WATER_OPACITY,
        depthWrite: false // standard transparent-water convention — avoids self-sorting artifacts between overlapping lake tiles
    }), waveTime);
    const mesh = new THREE.Mesh(geometry, material);
    // Vertex Y already holds the ABSOLUTE world elevation (sampled at
    // worldX/worldZ above) — the exact same convention
    // renderer/TerrainTileMesh.js's own header documents — so the mesh's
    // own position.y stays 0; only x/z place the tile.
    mesh.position.set(center.x, 0, center.z);
    // The underside, seen only by a diver looking up: a bright, unlit sheet, as
    // daylight through the surface looks from below. Back faces only, so it is
    // never drawn from above.
    const underside = new THREE.Mesh(geometry, makeWaterWaving(new THREE.MeshBasicMaterial({
        color: UNDERSIDE_COLOR,
        transparent: true,
        opacity: UNDERSIDE_OPACITY,
        depthWrite: false,
        side: THREE.BackSide
    }), waveTime, { lit: false }));
    mesh.add(underside);
    return mesh;
}

// Everything wet in one tile, for the water streaming ring
// (renderer/Renderer.js): the lake or sea above (buildWaterTileMesh()) and
// any river running through (renderer/RiverTileMesh.js), both moving with
// the one shared `waveTime`. An empty group when the tile is dry.
export function buildWaterTile(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, waveTime = { value: 0 }) {
    const tile = new THREE.Group();
    const standing = buildWaterTileMesh(tx, tz, seed, tileSize, waveTime);
    if (standing.isMesh) tile.add(standing);
    const river = buildRiverTileMesh(tx, tz, seed, tileSize, waveTime);
    if (river) tile.add(river);
    return tile;
}
