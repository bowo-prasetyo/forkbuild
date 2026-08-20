import * as THREE from 'three';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT, LAKE_SURFACE_COLOR } from '../core/Hydrology.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';
import { TILE_SEGMENTS } from './TerrainTileMesh.js';

// The renderer-side counterpart to core/Hydrology.js's LAKE concept —
// see docs/Roadmap.md, 0.2.89: it knows nothing about WHERE a lake is or
// WHY, only how to turn one tile's worth of ground into a still, flat
// water plane, the same core-decides/renderer-builds split
// renderer/TerrainTileMesh.js already establishes for ground and
// renderer/NaturalFeatureTileMesh.js establishes for trees.
//
// A lake gets ACTUAL flat geometry (unlike a river, which stays a ground
// COLOR tint in core/Hydrology.js#hydrologyGroundColorAt() — see that
// file's own header for why the two are represented differently): still
// water genuinely sits at one constant elevation regardless of how the
// terrain beneath it rises and falls, exactly the way a real lake's
// surface does not follow the lakebed. A ground-color tint could never
// express that; a flat plane can, and needs no new streaming machinery
// to do it.
//
// The "sink every dry vertex below ground" trick below is what keeps
// this mesh trivially correct at a tile boundary with zero seam-handling
// code: every vertex is placed from nothing but its own WORLD (x, z),
// the same "continuous world coordinates, never tile coordinates"
// discipline every sibling tile mesh in this codebase already follows —
// two tiles sharing an edge vertex independently compute the exact same
// y for it, water or not.
const SINK_DEPTH = 4; // world units below the actual ground — comfortably occludes even this world's steepest 1-tile relief

const WATER_OPACITY = 0.78; // translucent, not a mirror — see core/TerrainSurface.js's own "buildings and avatars remain the visual focus" restraint, extended here to water

const WATER_COLOR = new THREE.Color(LAKE_SURFACE_COLOR.r, LAKE_SURFACE_COLOR.g, LAKE_SURFACE_COLOR.b);

// Deliberately untested directly, same posture as renderer/TerrainTileMesh.js
// and renderer/NaturalFeatureTileMesh.js — see
// renderer/TerrainStreamingController.js's own header for why load/unload
// ORCHESTRATION is unit-tested (with a fake tile factory, reused unchanged
// for water — see renderer/Renderer.js) while the real Three.js
// geometry-building glue here isn't.
export function buildWaterTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, TILE_SEGMENTS, TILE_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const center = tileCenter(tx, tz, tileSize);
    const position = geometry.attributes.position;
    let hasWater = false;
    for (let i = 0; i < position.count; i++) {
        const worldX = center.x + position.getX(i);
        const worldZ = center.z + position.getZ(i);
        const isLake = surfaceCategoryAt(seed, worldX, worldZ) === SURFACE_CATEGORY.WATER;
        if (isLake) {
            hasWater = true;
            position.setY(i, LAKE_SURFACE_HEIGHT);
        } else {
            position.setY(i, terrainHeightAt(seed, worldX, worldZ) - SINK_DEPTH);
        }
    }

    // No lake anywhere in this tile's sampled grid — every vertex sank
    // below ground, so the mesh would be entirely invisible anyway.
    // Returning an empty group (the same "empty tile" contract
    // renderer/NaturalFeatureTileMesh.js already uses) skips building a
    // draw call the streaming ring would otherwise carry for nothing.
    if (!hasWater) return new THREE.Group();

    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: WATER_COLOR,
        transparent: true,
        opacity: WATER_OPACITY,
        depthWrite: false // standard transparent-water convention — avoids self-sorting artifacts between overlapping lake tiles
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Vertex Y already holds the ABSOLUTE world elevation (sampled at
    // worldX/worldZ above) — the exact same convention
    // renderer/TerrainTileMesh.js's own header documents — so the mesh's
    // own position.y stays 0; only x/z place the tile.
    mesh.position.set(center.x, 0, center.z);
    return mesh;
}
