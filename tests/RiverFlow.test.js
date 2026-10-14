import { riverFlowAt, riverWaterAt, MAX_RIVER_SPEED, FULL_SPEED_SLOPE, FLOW_BASELINE } from '../core/RiverFlow.js';
import {
    riverProximityAt, riverChannelTangentAt, riverChannelDistanceAt, isRiverAt, hydrologyGroundColorAt
} from '../core/Hydrology.js';
import { ecologyGroundColorAt } from '../core/TerrainEcology.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { buildRiverTileMesh, groundMeshHeightAt, RIVER_SURFACE_LIFT } from '../renderer/RiverTileMesh.js';
import { buildTerrainTileMesh } from '../renderer/TerrainTileMesh.js';
import { buildWaterTile } from '../renderer/WaterTileMesh.js';
import { tileCenter } from '../core/TerrainTiling.js';
import { assert } from './support/Assert.js';

// Rivers that run (core/RiverFlow.js): the water covers the channel and
// fades at its banks, runs along the channel and downhill, smoothly, never
// past MAX_RIVER_SPEED; and its sheet (renderer/RiverTileMesh.js) lies
// exactly over the ground the terrain mesh draws.

const SEED = DEFAULT_WORLD_SEED;

function riverPoints(limit) {
    const points = [];
    for (let x = -900; x < 900 && points.length < limit; x += 7) {
        for (let z = -900; z < 900 && points.length < limit; z += 11) {
            if (isRiverAt(SEED, x, z)) points.push([x, z]);
        }
    }
    return points;
}

async function runTests() {
    const points = riverPoints(400);
    assert(points.length >= 200, `the sample finds river (got ${points.length})`);

    {
        // Water where the river is, none where it isn't, full in the middle.
        let full = 0;
        for (const [x, z] of points) {
            const water = riverWaterAt(SEED, x, z);
            assert(water > 0 && water <= 1, 'the river has water');
            if (water === 1) full++;
        }
        assert(full > points.length / 2, 'most of a river is full of water');
        for (let i = 0; i < 300; i++) {
            const x = i * 13.7 - 2000;
            const z = i * -9.1 + 700;
            if (!isRiverAt(SEED, x, z)) {
                assert(riverWaterAt(SEED, x, z) === 0 && riverProximityAt(SEED, x, z) === 0, 'off the river there is no river water');
            }
        }
        console.log('✓ river water covers the channel, and only the channel');
    }

    {
        // The bank: water eases away towards the channel's edge, never steps.
        let checked = 0;
        for (const [x, z] of points) {
            const { dx, dz } = riverChannelTangentAt(SEED, x, z);
            // Walk across the channel, perpendicular to it.
            let previous = riverWaterAt(SEED, x, z);
            for (let k = 1; k <= 60; k++) {
                const water = riverWaterAt(SEED, x - dz * k * 0.1, z + dx * k * 0.1);
                assert(Math.abs(water - previous) < 0.25, `water fades across the bank without a step (${previous} → ${water})`);
                previous = water;
            }
            if (++checked >= 40) break;
        }
        console.log('✓ the water fades out at the banks without a step');
    }

    {
        // The tangent follows the channel: moving along it, the distance to
        // the centreline barely changes; across it, it changes fast.
        let along = 0;
        let across = 0;
        for (const [x, z] of points) {
            const { dx, dz } = riverChannelTangentAt(SEED, x, z);
            assert(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9, 'the tangent is a unit vector');
            const here = riverChannelDistanceAt(SEED, x, z);
            along += Math.abs(riverChannelDistanceAt(SEED, x + dx * 0.5, z + dz * 0.5) - here);
            across += Math.abs(riverChannelDistanceAt(SEED, x - dz * 0.5, z + dx * 0.5) - here);
        }
        assert(along * 5 < across, `the tangent runs along the channel (along ${along}, across ${across})`);
        console.log('✓ the channel tangent runs along the river');
    }

    {
        // The current runs along the channel, downhill, never past the limit.
        let downhill = 0;
        let moving = 0;
        for (const [x, z] of points) {
            const { vx, vz } = riverFlowAt(SEED, x, z);
            const speed = Math.hypot(vx, vz);
            assert(speed <= MAX_RIVER_SPEED + 1e-9, 'never faster than MAX_RIVER_SPEED');
            if (speed < 1e-6) continue;
            moving++;
            const { dx, dz } = riverChannelTangentAt(SEED, x, z);
            assert(Math.abs(Math.abs(vx * dx + vz * dz) - speed) < 1e-9, 'the current runs along the channel');
            const fx = vx / speed;
            const fz = vz / speed;
            const fall = terrainHeightAt(SEED, x - fx * FLOW_BASELINE, z - fz * FLOW_BASELINE)
                - terrainHeightAt(SEED, x + fx * FLOW_BASELINE, z + fz * FLOW_BASELINE);
            assert(fall > 0, 'the current runs the way the ground falls');
            downhill++;
            // Steeper ground, faster water, up to full speed.
            const slope = fall / (2 * FLOW_BASELINE);
            const expected = Math.min(1, slope / FULL_SPEED_SLOPE) * MAX_RIVER_SPEED;
            assert(Math.abs(speed - expected) < 1e-9, 'speed follows the fall of the ground');
        }
        assert(moving > points.length * 0.9 && downhill === moving, `rivers run (moving ${moving} of ${points.length})`);
        console.log('✓ rivers run along their channel, downhill, faster where steeper');
    }

    {
        // The current is continuous: a small step never jumps it, even
        // where it turns about in a dip.
        let worst = 0;
        for (const [x, z] of points.slice(0, 150)) {
            const a = riverFlowAt(SEED, x, z);
            const b = riverFlowAt(SEED, x + 0.05, z - 0.05);
            worst = Math.max(worst, Math.hypot(a.vx - b.vx, a.vz - b.vz));
        }
        assert(worst < 0.1, `the current changes smoothly from place to place (worst step ${worst})`);
        const a = riverFlowAt(SEED, points[3][0], points[3][1]);
        const b = riverFlowAt(SEED, points[3][0], points[3][1]);
        assert(a.vx === b.vx && a.vz === b.vz, 'the current is a pure function of place');
        console.log('✓ the current is smooth and deterministic');
    }

    {
        // The ground tint still lies on the bed, unchanged off the river.
        for (const [x, z] of points.slice(0, 50)) {
            const tinted = hydrologyGroundColorAt(SEED, x, z);
            const base = ecologyGroundColorAt(SEED, x, z);
            assert(tinted.b >= base.b - 1e-9 || riverProximityAt(SEED, x, z) === 0, 'the river bed keeps its blue tint');
        }
        console.log('✓ the river bed keeps its tint');
    }

    {
        // groundMeshHeightAt() is the plane of the triangle the terrain mesh
        // actually draws: check it against a real terrain tile's triangles.
        const tx = 3;
        const tz = -2;
        const terrain = buildTerrainTileMesh(tx, tz, SEED);
        const center = tileCenter(tx, tz);
        const position = terrain.geometry.attributes.position;
        const index = terrain.geometry.index.array;
        const spacing = 40 / 12;
        const heightAt = (i, j) => terrainHeightAt(SEED, i * spacing, j * spacing);
        let checkedTriangles = 0;
        for (let f = 0; f < index.length; f += 3) {
            const v = [0, 1, 2].map((k) => ({
                x: center.x + position.getX(index[f + k]),
                y: position.getY(index[f + k]),
                z: center.z + position.getZ(index[f + k])
            }));
            // Points inside the triangle, by barycentric weights.
            for (const [w0, w1] of [[1 / 3, 1 / 3], [0.6, 0.2], [0.2, 0.6], [0.15, 0.15]]) {
                const w2 = 1 - w0 - w1;
                const x = v[0].x * w0 + v[1].x * w1 + v[2].x * w2;
                const z = v[0].z * w0 + v[1].z * w1 + v[2].z * w2;
                const y = v[0].y * w0 + v[1].y * w1 + v[2].y * w2;
                const ours = groundMeshHeightAt(x, z, spacing, heightAt);
                assert(Math.abs(ours - y) < 1e-4, `groundMeshHeightAt() matches the drawn ground (got ${ours}, drawn ${y})`);
            }
            checkedTriangles++;
        }
        assert(checkedTriangles === 12 * 12 * 2, 'every ground triangle was checked');
        console.log('✓ groundMeshHeightAt() is the height of the ground as drawn');
    }

    {
        // A real river tile: its sheet sits RIVER_SURFACE_LIFT over the drawn
        // ground at every vertex, carries the current, and is see-through at
        // its banks.
        // A river tile whose eastern neighbour has river too, to check the
        // edge they share.
        let mesh = null;
        let right = null;
        let tile = null;
        for (let tx = -20; tx <= 20 && !right; tx++) {
            for (let tz = -20; tz <= 20 && !right; tz++) {
                mesh = buildRiverTileMesh(tx, tz, SEED);
                right = mesh && buildRiverTileMesh(tx + 1, tz, SEED);
                tile = { tx, tz };
            }
        }
        assert(mesh && right, 'two neighbouring river tiles were found');
        const center = tileCenter(tile.tx, tile.tz);
        const spacing = 40 / 12;
        const heightAt = (i, j) => terrainHeightAt(SEED, i * spacing, j * spacing);
        const position = mesh.geometry.attributes.position;
        const color = mesh.geometry.attributes.color;
        const flow = mesh.geometry.attributes.aFlow;
        assert(color.itemSize === 4 && flow.itemSize === 2, 'each vertex has a colour with alpha and a current');
        let banks = 0;
        let running = 0;
        for (let i = 0; i < position.count; i++) {
            const x = center.x + position.getX(i);
            const z = center.z + position.getZ(i);
            const ground = groundMeshHeightAt(x, z, spacing, heightAt);
            assert(Math.abs(position.getY(i) - ground - RIVER_SURFACE_LIFT) < 1e-4, 'the water lies just over the drawn ground');
            assert(Math.abs(color.getW(i) - riverWaterAt(SEED, x, z)) < 1e-4, 'its alpha is how much water covers it');
            if (color.getW(i) === 0) banks++;
            const expected = riverFlowAt(SEED, x, z);
            if (color.getW(i) > 0) {
                assert(Math.abs(flow.getX(i) - expected.vx) < 1e-5 && Math.abs(flow.getY(i) - expected.vz) < 1e-5, 'it carries the current there');
                const tangent = riverChannelTangentAt(SEED, x, z);
                const channel = mesh.geometry.attributes.aChannel;
                assert(Math.abs(channel.getX(i) * tangent.dx + channel.getY(i) * tangent.dz) > 0.999, 'and the way the channel lies');
                if (Math.hypot(expected.vx, expected.vz) > 0.1) running++;
            }
        }
        assert(banks > 0 && running > 0, 'the sheet fades out at its banks and the water in it runs');
        // Upward-facing, like the ground.
        const normal = mesh.geometry.attributes.normal;
        for (let i = 0; i < normal.count; i++) assert(normal.getY(i) > 0.5, 'the sheet faces up');
        console.log('✓ a river tile\'s water lies over the ground, carries the current, and fades at its banks');

        // Two neighbouring tiles agree on their shared edge.
        {
            const edgeX = center.x + 20;
            const ours = new Map();
            for (let i = 0; i < position.count; i++) {
                if (Math.abs(center.x + position.getX(i) - edgeX) < 1e-6) ours.set((center.z + position.getZ(i)).toFixed(3), position.getY(i));
            }
            const rightCenter = tileCenter(tile.tx + 1, tile.tz);
            const rp = right.geometry.attributes.position;
            let shared = 0;
            for (let i = 0; i < rp.count; i++) {
                const key = (rightCenter.z + rp.getZ(i)).toFixed(3);
                if (Math.abs(rightCenter.x + rp.getX(i) - edgeX) < 1e-6 && ours.has(key)) {
                    assert(Math.abs(ours.get(key) - rp.getY(i)) < 1e-5, 'neighbouring tiles meet at the same height');
                    shared++;
                }
            }
            assert(shared > 0, 'the two tiles share river vertices on their edge');
            console.log('✓ neighbouring river tiles meet without a step');
        }
    }

    {
        // The water tile carries lake and river together, and nothing when dry.
        let both = 0;
        let dry = 0;
        for (let tx = -12; tx <= 12; tx++) {
            for (let tz = -12; tz <= 12; tz++) {
                const t = buildWaterTile(tx, tz, SEED);
                if (t.children.length === 0) dry++;
                if (t.children.some((c) => c.geometry.attributes.aFlow)) both++;
            }
        }
        assert(both > 0 && dry > 0, `water tiles carry rivers (${both}) and dry tiles nothing (${dry})`);
        console.log('✓ a water tile carries its river, and a dry tile nothing');
    }
}

await runTests();
