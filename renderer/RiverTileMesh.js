import * as THREE from 'three';
import { riverChannelTangentAt, RIVER_SURFACE_COLOR } from '../core/Hydrology.js';
import { riverWaterAt, riverCurrentAt, riverRapidsAt, riverSurfaceHeightAt } from '../core/RiverFlow.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';
import { TILE_SEGMENTS, RIVER_SUBDIVISIONS, tileHasRiverDetail } from './TerrainTileMesh.js';
import { makeRiverFlowing } from './RiverFlowMaterial.js';

// A river's water: a sheet filling the river's bed (core/TerrainHeightField.js
// #riverBedDepthAt()) up to its surface (core/RiverFlow.js#riverSurfaceHeightAt()),
// carrying at each vertex how much water covers it (riverWaterAt(), as
// alpha, so the banks are soft), which way it runs (riverFlowAt()), which
// way the channel lies (core/Hydrology.js#riverChannelTangentAt()) and how
// much it breaks into rapids (riverRapidsAt()) and how strongly it wells up
// as a spring, with the way to the spring's centre (riverSpringAt()), for
// renderer/RiverFlowMaterial.js.
//
// It is built on exactly the fine grid renderer/TerrainTileMesh.js gives a
// tile a river runs through (RIVER_SUBDIVISIONS to each ordinary ground
// cell), its cells cut along the same diagonal, so every water triangle
// lies over one ground triangle; the surface is above the bed at every
// vertex, so it is above it everywhere, by RIVER_SURFACE_LIFT where the bed
// runs out at the banks.
//
// Every vertex is placed from its own world (x, z), so tiles meet without a
// seam, the same discipline renderer/WaterTileMesh.js keeps.
export const RIVER_SURFACE_LIFT = 0.03;
const RIVER_OPACITY = 0.8;
const RIVER_ROUGHNESS = 0.35;

// The river water for one tile, or null when no river runs through it.
// `waveTime` is the same shared { value } the lakes' waves read, and `rain`
// the same shared { value } their rain rings read.
export function buildRiverTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, waveTime = { value: 0 }, rain = { value: 0 }) {
    if (!tileHasRiverDetail(tx, tz, seed, tileSize)) return null;

    const center = tileCenter(tx, tz, tileSize);
    const minX = center.x - tileSize / 2;
    const minZ = center.z - tileSize / 2;
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
    const rapids = [];
    const springs = [];
    const indices = [];
    const surfaceAt = (x, z) => riverSurfaceHeightAt(seed, x, z);
    const vertex = (i, j) => {
        const key = j * side + i;
        let index = indexOf.get(key);
        if (index !== undefined) return index;
        const x = minX + i * step;
        const z = minZ + j * step;
        positions.push(x - center.x, surfaceAt(x, z) + RIVER_SURFACE_LIFT, z - center.z);
        // The surface's slope across one step each way, from world
        // positions alone: two tiles sharing an edge vertex give it the
        // same normal, where computeVertexNormals() would see only each
        // tile's own triangles and leave a crease in the light along the
        // edge.
        const slopeX = (surfaceAt(x + step, z) - surfaceAt(x - step, z)) / (2 * step);
        const slopeZ = (surfaceAt(x, z + step) - surfaceAt(x, z - step)) / (2 * step);
        const length = Math.hypot(slopeX, 1, slopeZ);
        normals.push(-slopeX / length, 1 / length, -slopeZ / length);
        colors.push(RIVER_SURFACE_COLOR.r, RIVER_SURFACE_COLOR.g, RIVER_SURFACE_COLOR.b, coverage[key]);
        const wet = coverage[key] > 0;
        const current = wet ? riverCurrentAt(seed, x, z) : { vx: 0, vz: 0, spring: null };
        flows.push(current.vx, current.vz);
        const tangent = riverChannelTangentAt(seed, x, z);
        channels.push(tangent.dx, tangent.dz);
        rapids.push(wet ? riverRapidsAt(seed, x, z) : 0);
        const spring = current.spring;
        springs.push(spring ? spring.strength : 0, spring ? spring.centreX - x : 0, spring ? spring.centreZ - z : 0);
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
    geometry.setAttribute('aRapids', new THREE.Float32BufferAttribute(rapids, 1));
    geometry.setAttribute('aSpring', new THREE.Float32BufferAttribute(springs, 3));
    geometry.setIndex(indices);

    const material = makeRiverFlowing(new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: RIVER_ROUGHNESS,
        transparent: true,
        opacity: RIVER_OPACITY,
        depthWrite: false,
        // At the banks the surface is only RIVER_SURFACE_LIFT over the
        // ground: nudged towards the camera in depth too, so far off the
        // two never flicker through each other.
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4
    }), waveTime, { rain });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(center.x, 0, center.z);
    return mesh;
}
