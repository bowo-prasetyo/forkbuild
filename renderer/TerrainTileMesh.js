import * as THREE from 'three';
import { makeWet, TERRAIN_WET } from './WetSurfaces.js';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import {
    hydrologyGroundColorAt, riverTintAt, withRiverTint, riverChannelDistanceAt, RIVER_CHANNEL_THRESHOLD
} from '../core/Hydrology.js';
import { ecologyGroundColorAt, groundCoverAt } from '../core/TerrainEcology.js';
import { TERRAIN_TILE_SIZE, tileCenter } from '../core/TerrainTiling.js';
import { receiveShadows } from './ShadowRoles.js';
import { makeSeasonalGround } from './SeasonalSurfaces.js';

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
// 0.2.89 — samples core/Hydrology.js#hydrologyGroundColorAt() instead,
// the next layer up: it starts from that exact same ecologyGroundColorAt()
// result and blends in a river tint on top, passing every other
// coordinate through completely unchanged. Still surfaces flat lake
// water as ordinary blue ground color here (unchanged from 0.2.79) —
// renderer/WaterTileMesh.js is what gives a lake actual flat water-plane
// geometry, layered as a separate streamed tile alongside this one. See
// core/Hydrology.js's own header.
//
// Deliberately untested directly, same posture as ThreeBrickFactory/
// BrickRenderer/GridHelper/Lights — see
// renderer/TerrainStreamingController.js's own header for why the
// load/unload ORCHESTRATION is unit-tested (with a fake tile factory)
// while the real Three.js geometry-building glue here isn't.
// Exported (0.2.89) so renderer/WaterTileMesh.js builds its own water
// plane at the EXACT same per-tile vertex resolution as the ground it
// sits above/beneath — two independently-built tile meshes sampling the
// same world (x, z) grid, never two different resolutions that could
// drift apart at a shared tile edge.
export const TILE_SEGMENTS = 12; // vertices per edge = TILE_SEGMENTS + 1

// A river's bed (core/TerrainHeightField.js#riverBedDepthAt()) is about six
// units across, narrower than two ground cells, so a tile a river runs
// through is built RIVER_SUBDIVISIONS times finer each way, fine enough to
// show the bed's bowl, and renderer/RiverTileMesh.js lays the river's water
// on that very grid.
export const RIVER_SUBDIVISIONS = 4;

// A tile is built fine when any point of its ordinary grid comes this near
// a river channel: a few half-widths, well past how far the channel can
// wander between two grid points, so no bed is ever left on a coarse tile.
const RIVER_DETAIL_MARGIN = 3;

export function tileHasRiverDetail(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE) {
    const spacing = tileSize / TILE_SEGMENTS;
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    for (let i = 0; i <= TILE_SEGMENTS; i++) {
        for (let j = 0; j <= TILE_SEGMENTS; j++) {
            if (riverChannelDistanceAt(seed, minX + i * spacing, minZ + j * spacing) < RIVER_CHANNEL_THRESHOLD * RIVER_DETAIL_MARGIN) {
                return true;
            }
        }
    }
    return false;
}

// `wetSurfaces` (renderer/WetSurfaces.js#createWetSurfaces()), when given,
// lets the ground soak up the rain and dry again, and snow lie on it.
// `seasonSurfaces` (renderer/SeasonalSurfaces.js#createSeasonSurfaces()),
// when given, colours its grass and fields for the season: every vertex
// carries how much grass and how much field it is (`groundCover`,
// core/TerrainEcology.js#groundCoverAt()).
export function buildTerrainTileMesh(tx, tz, seed, tileSize = TERRAIN_TILE_SIZE, wetSurfaces = null, seasonSurfaces = null) {
    const fine = tileHasRiverDetail(tx, tz, seed, tileSize);
    const segments = fine ? TILE_SEGMENTS * RIVER_SUBDIVISIONS : TILE_SEGMENTS;
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const center = tileCenter(tx, tz, tileSize);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const heightAt = fine ? fineEdgeHeights(tx, tz, seed, tileSize) : (x, z) => terrainHeightAt(seed, x, z);
    const colorAt = fine ? fineColors(tx, tz, seed, tileSize) : (x, z) => hydrologyGroundColorAt(seed, x, z);
    const cover = seasonSurfaces ? new Float32Array(position.count * 2) : null;
    const coverAt = !seasonSurfaces ? null : fine ? fineGroundCover(tx, tz, seed, tileSize) : (x, z) => groundCoverAt(seed, x, z);
    for (let i = 0; i < position.count; i++) {
        const worldX = center.x + position.getX(i);
        const worldZ = center.z + position.getZ(i);
        position.setY(i, heightAt(worldX, worldZ));

        const color = colorAt(worldX, worldZ);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        if (cover) {
            const ground = coverAt(worldX, worldZ);
            cover[i * 2] = ground.grass;
            cover[i * 2 + 1] = ground.field;
        }
    }
    position.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (cover) geometry.setAttribute('groundCover', new THREE.BufferAttribute(cover, 2));
    geometry.computeVertexNormals();

    // vertexColors: true, no material.color override — the per-vertex
    // buffer set above is the ONLY source of terrain color, never a flat
    // material tint layered on top of it.
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    if (wetSurfaces) makeWet(material, wetSurfaces, TERRAIN_WET);
    // After the wet, so the snow lies on top of the season's colours.
    if (seasonSurfaces) makeSeasonalGround(material, seasonSurfaces);
    const mesh = new THREE.Mesh(geometry, material);
    // Vertex Y already holds the ABSOLUTE world elevation (sampled at
    // worldX/worldZ above), so the mesh's own position.y stays 0 — only
    // x/z place the tile, matching where its vertices were sampled from.
    mesh.position.set(center.x, 0, center.z);
    return receiveShadows(mesh);
}

// Colours for a fine tile. Only the river's tint needs the fine grid; the
// ground's own colour (core/TerrainEcology.js) is laid across it from the
// ordinary grid's points, over the same triangles an ordinary tile draws,
// so a fine tile looks like its neighbours away from the river and costs
// little more than one to build. The tint (core/Hydrology.js#riverTintAt())
// is sampled at every point, and only near a channel.
function fineColors(tx, tz, seed, tileSize) {
    const spacing = tileSize / TILE_SEGMENTS;
    const side = TILE_SEGMENTS + 1;
    const i0 = tx * TILE_SEGMENTS;
    const j0 = tz * TILE_SEGMENTS;
    const lattice = new Float32Array(side * side * 3);
    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            const color = ecologyGroundColorAt(seed, (i0 + i) * spacing, (j0 + j) * spacing);
            lattice.set([color.r, color.g, color.b], (j * side + i) * 3);
        }
    }
    const at = (component) => (i, j) => {
        const li = Math.min(side - 1, Math.max(0, i - i0));
        const lj = Math.min(side - 1, Math.max(0, j - j0));
        return lattice[(lj * side + li) * 3 + component];
    };
    const r = at(0);
    const g = at(1);
    const b = at(2);
    return (x, z) => {
        const base = { r: onGroundTriangle(x, z, spacing, r), g: onGroundTriangle(x, z, spacing, g), b: onGroundTriangle(x, z, spacing, b) };
        if (riverChannelDistanceAt(seed, x, z) >= RIVER_CHANNEL_THRESHOLD) return base;
        return withRiverTint(base, riverTintAt(seed, x, z));
    };
}

// What grows on a fine tile's ground, laid across it from the ordinary
// grid's points as its colour is (fineColors()).
function fineGroundCover(tx, tz, seed, tileSize) {
    const spacing = tileSize / TILE_SEGMENTS;
    const side = TILE_SEGMENTS + 1;
    const i0 = tx * TILE_SEGMENTS;
    const j0 = tz * TILE_SEGMENTS;
    const lattice = new Float32Array(side * side * 2);
    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            const ground = groundCoverAt(seed, (i0 + i) * spacing, (j0 + j) * spacing);
            lattice.set([ground.grass, ground.field], (j * side + i) * 2);
        }
    }
    const at = (component) => (i, j) => {
        const li = Math.min(side - 1, Math.max(0, i - i0));
        const lj = Math.min(side - 1, Math.max(0, j - j0));
        return lattice[(lj * side + li) * 2 + component];
    };
    const grass = at(0);
    const field = at(1);
    return (x, z) => ({ grass: onGroundTriangle(x, z, spacing, grass), field: onGroundTriangle(x, z, spacing, field) });
}

// A value laid across the ordinary ground grid (spacing `spacing`,
// `valueAt(i, j)` at its points) as its triangles carry it: THREE's
// PlaneGeometry, laid flat, cuts each cell from its (x0, z1) corner to its
// (x1, z0) corner.
function onGroundTriangle(x, z, spacing, valueAt) {
    const i = Math.floor(x / spacing + 1e-9);
    const j = Math.floor(z / spacing + 1e-9);
    const u = Math.min(1, Math.max(0, x / spacing - i));
    const v = Math.min(1, Math.max(0, z / spacing - j));
    if (u + v <= 1) {
        const v00 = valueAt(i, j);
        return v00 + (valueAt(i + 1, j) - v00) * u + (valueAt(i, j + 1) - v00) * v;
    }
    const v11 = valueAt(i + 1, j + 1);
    return v11 + (valueAt(i, j + 1) - v11) * (1 - u) + (valueAt(i + 1, j) - v11) * (1 - v);
}

// Heights for a fine tile. Along an edge it shares with an ordinary tile,
// the points between that tile's grid points lie on the straight line
// between them, as the ordinary tile draws its edge, so the two meet
// without a crack; there is no bed that near an ordinary tile to lose.
// Everywhere else, the ground itself.
function fineEdgeHeights(tx, tz, seed, tileSize) {
    const spacing = tileSize / TILE_SEGMENTS;
    const minX = tx * tileSize;
    const minZ = tz * tileSize;
    const maxX = minX + tileSize;
    const maxZ = minZ + tileSize;
    const coarse = {
        west: !tileHasRiverDetail(tx - 1, tz, seed, tileSize),
        east: !tileHasRiverDetail(tx + 1, tz, seed, tileSize),
        south: !tileHasRiverDetail(tx, tz - 1, seed, tileSize),
        north: !tileHasRiverDetail(tx, tz + 1, seed, tileSize)
    };
    const epsilon = spacing * 1e-6;
    const alongEdge = (fixed, along, lineStart, sample) => {
        const k = Math.floor((along - lineStart) / spacing + epsilon);
        const a = lineStart + k * spacing;
        const t = (along - a) / spacing;
        if (t < 1e-6) return sample(fixed, a);
        return sample(fixed, a) + (sample(fixed, a + spacing) - sample(fixed, a)) * t;
    };
    return (x, z) => {
        if ((coarse.west && Math.abs(x - minX) < epsilon) || (coarse.east && Math.abs(x - maxX) < epsilon)) {
            return alongEdge(x, z, minZ, (fx, fz) => terrainHeightAt(seed, fx, fz));
        }
        if ((coarse.south && Math.abs(z - minZ) < epsilon) || (coarse.north && Math.abs(z - maxZ) < epsilon)) {
            return alongEdge(z, x, minX, (fz, fx) => terrainHeightAt(seed, fx, fz));
        }
        return terrainHeightAt(seed, x, z);
    };
}
