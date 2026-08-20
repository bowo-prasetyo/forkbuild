import * as THREE from 'three';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';

// The renderer-side counterpart to core/TerrainHeightField.js: it knows
// nothing about WHAT elevation a coordinate has, only how to turn one
// tile coordinate into a displaced-plane Three.js mesh from that pure
// function — the same split renderer/ThreeBrickFactory.js already
// establishes for bricks (core/BrickRegistry decides what a definitionId
// IS; ThreeBrickFactory only ever builds the mesh for it).
//
// Deliberately untested directly, same posture as ThreeBrickFactory/
// BrickRenderer/GridHelper/Lights — see
// renderer/TerrainStreamingController.js's own header for why the
// load/unload ORCHESTRATION is unit-tested (with a fake tile factory)
// while the real Three.js geometry-building glue here isn't.
const TILE_SEGMENTS = 12; // vertices per edge = TILE_SEGMENTS + 1
const TERRAIN_COLOR = 0x5c8a4a;

export function buildTerrainTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, TILE_SEGMENTS, TILE_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const center = tileCenter(tx, tz, tileSize);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const worldX = center.x + position.getX(i);
        const worldZ = center.z + position.getZ(i);
        position.setY(i, terrainHeightAt(seed, worldX, worldZ));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ color: TERRAIN_COLOR });
    const mesh = new THREE.Mesh(geometry, material);
    // Vertex Y already holds the ABSOLUTE world elevation (sampled at
    // worldX/worldZ above), so the mesh's own position.y stays 0 — only
    // x/z place the tile, matching where its vertices were sampled from.
    mesh.position.set(center.x, 0, center.z);
    return mesh;
}
