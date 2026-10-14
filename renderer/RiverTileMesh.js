import * as THREE from 'three';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { riverChannelDistanceAt, riverChannelTangentAt, RIVER_CHANNEL_THRESHOLD, RIVER_SURFACE_COLOR } from '../core/Hydrology.js';
import { riverWaterAt, riverFlowAt } from '../core/RiverFlow.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';
import { TILE_SEGMENTS } from './TerrainTileMesh.js';
import { makeRiverFlowing } from './RiverFlowMaterial.js';

// A river's water: a thin sheet laid just over the ground mesh along the
// channel core/Hydrology.js draws, carrying at each vertex how much water
// covers it (core/RiverFlow.js#riverWaterAt(), as alpha, so the banks are
// soft), which way it runs (riverFlowAt()) and which way the channel lies
// (core/Hydrology.js#riverChannelTangentAt()), for
// renderer/RiverFlowMaterial.js.
//
// A river is only about six units wide and the ground has a vertex every
// TILE_SEGMENTS-th of a tile (3.3 units), so the water gets a finer grid,
// RIVER_SUBDIVISIONS to each ground cell. Its height is not
// terrainHeightAt() but the GROUND MESH's own height there
// (groundMeshHeightAt()), the flat triangles renderer/TerrainTileMesh.js
// actually draws, so the water follows exactly what is seen: the true
// terrain can bulge above those triangles and would poke through the water,
// or sag below them and leave it floating. The fine cells are cut along the
// same diagonal as the ground's, so every fine triangle lies within one
// ground triangle and the sheet stays exactly RIVER_SURFACE_LIFT above it.
//
// Every vertex is placed from its own world (x, z), so tiles meet without a
// seam, the same discipline renderer/WaterTileMesh.js keeps.
export const RIVER_SUBDIVISIONS = 4;
export const RIVER_SURFACE_LIFT = 0.08;
const RIVER_OPACITY = 0.8;
const RIVER_ROUGHNESS = 0.35;
// A tile is searched for river water only when its ground grid comes this
// near a channel: a few half-widths, well past how far the channel can
// move between two ground vertices, so a river crossing a tile's corner is
// never missed.
const SEARCH_MARGIN = 3;

// The height of renderer/TerrainTileMesh.js's ground at world (x, z): the
// plane through the ground triangle (x, z) falls in, as THREE.PlaneGeometry
// (rotated flat) splits each cell, along the diagonal from its (x0, z1)
// corner to its (x1, z0) corner. `heightAt(i, j)` is the ground's height at
// lattice point (i, j) of spacing `spacing`.
export function groundMeshHeightAt(x, z, spacing, heightAt) {
    const i = Math.floor(x / spacing);
    const j = Math.floor(z / spacing);
    const u = x / spacing - i;
    const v = z / spacing - j;
    if (u + v <= 1) {
        const h00 = heightAt(i, j);
        return h00 + (heightAt(i + 1, j) - h00) * u + (heightAt(i, j + 1) - h00) * v;
    }
    const h11 = heightAt(i + 1, j + 1);
    return h11 + (heightAt(i, j + 1) - h11) * (1 - u) + (heightAt(i + 1, j) - h11) * (1 - v);
}

// The river water for one tile, or null when no river runs through it.
// `waveTime` is the same shared { value } the lakes' waves read.
export function buildRiverTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, waveTime = { value: 0 }) {
    const center = tileCenter(tx, tz, tileSize);
    const groundSpacing = tileSize / TILE_SEGMENTS;
    const minX = center.x - tileSize / 2;
    const minZ = center.z - tileSize / 2;

    let nearChannel = false;
    for (let i = 0; i <= TILE_SEGMENTS && !nearChannel; i++) {
        for (let j = 0; j <= TILE_SEGMENTS; j++) {
            if (riverChannelDistanceAt(seed, minX + i * groundSpacing, minZ + j * groundSpacing) < RIVER_CHANNEL_THRESHOLD * SEARCH_MARGIN) {
                nearChannel = true;
                break;
            }
        }
    }
    if (!nearChannel) return null;

    const groundHeights = new Map();
    const groundHeightAt = (i, j) => {
        const key = `${i},${j}`;
        let h = groundHeights.get(key);
        if (h === undefined) {
            h = terrainHeightAt(seed, i * groundSpacing, j * groundSpacing);
            groundHeights.set(key, h);
        }
        return h;
    };

    const n = TILE_SEGMENTS * RIVER_SUBDIVISIONS;
    const step = tileSize / n;
    const side = n + 1;
    const coverage = new Float32Array(side * side);
    for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
            coverage[j * side + i] = riverWaterAt(seed, minX + i * step, minZ + j * step);
        }
    }

    // Keep each fine cell any of whose corners has water, cut like the
    // ground's: (x0,z0)(x0,z1)(x1,z0) and (x0,z1)(x1,z1)(x1,z0).
    const indexOf = new Map();
    const positions = [];
    const normals = [];
    const colors = [];
    const flows = [];
    const channels = [];
    const indices = [];
    const vertex = (i, j) => {
        const key = j * side + i;
        let index = indexOf.get(key);
        if (index !== undefined) return index;
        const x = minX + i * step;
        const z = minZ + j * step;
        const groundAt = (gx, gz) => groundMeshHeightAt(gx, gz, groundSpacing, groundHeightAt);
        const y = groundAt(x, z) + RIVER_SURFACE_LIFT;
        positions.push(x - center.x, y, z - center.z);
        // The ground's slope across one fine step each way, from world
        // positions alone: two tiles sharing an edge vertex give it the
        // same normal, where computeVertexNormals() would see only each
        // tile's own triangles and leave a crease in the light along the
        // edge.
        const slopeX = (groundAt(x + step, z) - groundAt(x - step, z)) / (2 * step);
        const slopeZ = (groundAt(x, z + step) - groundAt(x, z - step)) / (2 * step);
        const length = Math.hypot(slopeX, 1, slopeZ);
        normals.push(-slopeX / length, 1 / length, -slopeZ / length);
        colors.push(RIVER_SURFACE_COLOR.r, RIVER_SURFACE_COLOR.g, RIVER_SURFACE_COLOR.b, coverage[key]);
        const flow = coverage[key] > 0 ? riverFlowAt(seed, x, z) : { vx: 0, vz: 0 };
        flows.push(flow.vx, flow.vz);
        const tangent = riverChannelTangentAt(seed, x, z);
        channels.push(tangent.dx, tangent.dz);
        index = positions.length / 3 - 1;
        indexOf.set(key, index);
        return index;
    };
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            if (coverage[j * side + i] === 0 && coverage[j * side + i + 1] === 0
                && coverage[(j + 1) * side + i] === 0 && coverage[(j + 1) * side + i + 1] === 0) continue;
            const a = vertex(i, j);
            const b = vertex(i, j + 1);
            const c = vertex(i + 1, j + 1);
            const d = vertex(i + 1, j);
            indices.push(a, b, d, b, c, d);
        }
    }
    if (indices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setAttribute('aFlow', new THREE.Float32BufferAttribute(flows, 2));
    geometry.setAttribute('aChannel', new THREE.Float32BufferAttribute(channels, 2));
    geometry.setIndex(indices);

    const material = makeRiverFlowing(new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: RIVER_ROUGHNESS,
        transparent: true,
        opacity: RIVER_OPACITY,
        depthWrite: false,
        // Only RIVER_SURFACE_LIFT above the ground: nudged towards the camera
        // in depth too, so far off the two never flicker through each other.
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4
    }), waveTime);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(center.x, 0, center.z);
    return mesh;
}
