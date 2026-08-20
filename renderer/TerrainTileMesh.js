import * as THREE from 'three';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { ecologyGroundColorAt } from '../core/TerrainEcology.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';

// The renderer-side counterpart to core/TerrainHeightField.js and
// core/TerrainSurface.js: it knows nothing about WHAT elevation or
// surface a coordinate has, only how to turn one tile coordinate into a
// displaced, colored-per-vertex Three.js mesh from those two pure
// functions — the same split renderer/ThreeBrickFactory.js already
// establishes for bricks (core/BrickRegistry decides what a definitionId
// IS; ThreeBrickFactory only ever builds the mesh for it).
//
// Surface color is sampled per vertex at that vertex's own WORLD (x, z)
// — never at the tile's (tx, tz) — the same "continuous world
// coordinates, not tile coordinates" discipline elevation already uses
// just above it. That is what keeps two neighboring tiles' shared edge
// vertices the exact same color: both compute ecologyGroundColorAt() at
// the identical world coordinate, independent of which tile happened to
// stream in first. See core/TerrainSurface.js's own header.
//
// 0.2.88 — samples core/TerrainEcology.js#ecologyGroundColorAt() rather
// than core/TerrainSurface.js#surfaceColorAt() directly: the ecology
// layer starts from that exact same surfaceColorAt() result and adds a
// BEACH sand tint or FIELD row tint on top for the two zones with a
// genuinely distinct look, passing every other zone's color through
// completely unchanged. See core/TerrainEcology.js's own header.
//
// Deliberately untested directly, same posture as ThreeBrickFactory/
// BrickRenderer/GridHelper/Lights — see
// renderer/TerrainStreamingController.js's own header for why the
// load/unload ORCHESTRATION is unit-tested (with a fake tile factory)
// while the real Three.js geometry-building glue here isn't.
const TILE_SEGMENTS = 12; // vertices per edge = TILE_SEGMENTS + 1

export function buildTerrainTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, TILE_SEGMENTS, TILE_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const center = tileCenter(tx, tz, tileSize);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
        const worldX = center.x + position.getX(i);
        const worldZ = center.z + position.getZ(i);
        position.setY(i, terrainHeightAt(seed, worldX, worldZ));

        const color = ecologyGroundColorAt(seed, worldX, worldZ);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    position.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    // vertexColors: true, no material.color override — the per-vertex
    // buffer set above is the ONLY source of terrain color, never a flat
    // material tint layered on top of it.
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geometry, material);
    // Vertex Y already holds the ABSOLUTE world elevation (sampled at
    // worldX/worldZ above), so the mesh's own position.y stays 0 — only
    // x/z place the tile, matching where its vertices were sampled from.
    mesh.position.set(center.x, 0, center.z);
    return mesh;
}
