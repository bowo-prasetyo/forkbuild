import {
    riverFlowAt, riverWaterAt, riverWaterDepthAt, riverSurfaceHeightAt, riverRapidsAt,
    MAX_RIVER_SPEED, FULL_SPEED_SLOPE, FLOW_BASELINE, RIVER_FILL, RAPIDS_FROM_SLOPE, RAPIDS_FULL_SLOPE
} from '../core/RiverFlow.js';
import {
    riverProximityAt, riverChannelTangentAt, riverChannelDistanceAt, isRiverAt, hydrologyGroundColorAt
} from '../core/Hydrology.js';
import { ecologyGroundColorAt } from '../core/TerrainEcology.js';
import {
    terrainHeightAt, baseTerrainHeightAt, riverBedDepthAt, riverBedAt, riverPoolReachAt, RIVER_BED_DEPTH, WATER_LEVEL, DEFAULT_WORLD_SEED
} from '../core/TerrainHeightField.js';
import { POOL_DEPTH } from '../core/RiverBed.js';
import { buildRiverTileMesh, RIVER_SURFACE_LIFT } from '../renderer/RiverTileMesh.js';
import { buildTerrainTileMesh, tileHasRiverDetail, TILE_SEGMENTS, RIVER_SUBDIVISIONS } from '../renderer/TerrainTileMesh.js';
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
            // A highland pool has a current of its own (checked below).
            if (speed < 1e-6 || riverPoolReachAt(SEED, x, z) > 0) continue;
            moving++;
            const { dx, dz } = riverChannelTangentAt(SEED, x, z);
            assert(Math.abs(Math.abs(vx * dx + vz * dz) - speed) < 1e-9, 'the current runs along the channel');
            const fx = vx / speed;
            const fz = vz / speed;
            const fall = baseTerrainHeightAt(SEED, x - fx * FLOW_BASELINE, z - fz * FLOW_BASELINE)
                - baseTerrainHeightAt(SEED, x + fx * FLOW_BASELINE, z + fz * FLOW_BASELINE);
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
        // Carved beds (core/TerrainHeightField.js): the ground is the lie of the
        // land with the bed cut into it, only where a river is, never deeper
        // than RIVER_BED_DEPTH, never down to the water line, and smooth.
        let deep = 0;
        for (const [x, z] of points) {
            const bed = riverBedDepthAt(SEED, x, z);
            assert(Math.abs(terrainHeightAt(SEED, x, z) - (baseTerrainHeightAt(SEED, x, z) - bed)) < 1e-12, 'the ground is the land less the bed');
            assert(bed >= 0 && bed <= Math.max(RIVER_BED_DEPTH, POOL_DEPTH), 'the bed is never deeper than a calm bed or a pool');
            assert(terrainHeightAt(SEED, x, z) > WATER_LEVEL + 0.05, 'a bed never reaches down to the water line');
            if (riverProximityAt(SEED, x, z) > 0.9 && bed > RIVER_BED_DEPTH * 0.5) deep++;
            // Smooth: a small step never jumps the ground.
            assert(Math.abs(terrainHeightAt(SEED, x + 0.05, z) - terrainHeightAt(SEED, x, z)) < 0.05, 'the bed has no edge');
        }
        assert(deep > 20, `the middle of a river runs deep (${deep} deep samples)`);
        for (let i = 0; i < 3000; i++) {
            const x = i * 13.7 - 20000;
            const z = i * -9.1 + 7000;
            const bed = riverBedDepthAt(SEED, x, z);
            if (bed > 0) assert(isRiverAt(SEED, x, z), 'wherever there is a bed there is a river');
            else assert(terrainHeightAt(SEED, x, z) === baseTerrainHeightAt(SEED, x, z), 'off a river the ground is the land itself');
        }
        console.log('✓ river beds are cut only where rivers run, smoothly, never to the water line');
    }

    {
        // The water fills the bed's smooth depth RIVER_FILL of the way up,
        // below the banks (a cascade's steps are cut beneath it).
        for (const [x, z] of points) {
            const bed = riverBedAt(SEED, x, z);
            const depth = riverWaterDepthAt(SEED, x, z);
            assert(Math.abs(depth - bed.waterDepth) < 1e-12 && depth <= bed.depth * RIVER_FILL + 1e-12, 'the water fills the bed');
            assert(Math.abs(riverSurfaceHeightAt(SEED, x, z) - (terrainHeightAt(SEED, x, z) + depth)) < 1e-9, 'the surface is the bed plus the water');
            assert(riverSurfaceHeightAt(SEED, x, z) <= baseTerrainHeightAt(SEED, x, z) + 1e-12, 'the surface sits no higher than the banks');
        }
        console.log('✓ the water fills the bed up to just below its banks');
    }

    {
        // Rapids: only where the river falls steeply, and only a little of it.
        let some = 0;
        for (const [x, z] of points) {
            const rapids = riverRapidsAt(SEED, x, z);
            assert(rapids >= 0 && rapids <= 1, 'rapids are a share');
            const tangent = riverChannelTangentAt(SEED, x, z);
            const fall = Math.abs(baseTerrainHeightAt(SEED, x - tangent.dx * FLOW_BASELINE, z - tangent.dz * FLOW_BASELINE)
                - baseTerrainHeightAt(SEED, x + tangent.dx * FLOW_BASELINE, z + tangent.dz * FLOW_BASELINE)) / (2 * FLOW_BASELINE);
            const bed = riverBedAt(SEED, x, z);
            if (fall <= RAPIDS_FROM_SLOPE) assert(rapids === bed.drop * (1 - bed.pool), 'gentle water never breaks, but at a cascade\'s drop');
            if (fall >= RAPIDS_FULL_SLOPE && bed.cascade === 0 && bed.pool === 0) assert(rapids === 1, 'the steepest water breaks fully');
            assert(rapids >= bed.drop * (1 - bed.pool) - 1e-12, 'water pours white over every drop');
            if (rapids > 0) some++;
        }
        assert(some > 0 && some < points.length * 0.3, `some, not most, of a river is rapids (${some} of ${points.length})`);
        console.log('✓ rapids break only where a river falls steeply');
    }

    {
        // A river tile: its ground is built fine enough to show the bed, and
        // its water lies over that ground at the river's surface, carrying
        // the current, the channel, the rapids and how much water covers it.
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
        assert(tileHasRiverDetail(tile.tx, tile.tz, SEED), 'a river tile is built fine');
        const ground = buildTerrainTileMesh(tile.tx, tile.tz, SEED);
        const fineSide = TILE_SEGMENTS * RIVER_SUBDIVISIONS + 1;
        assert(ground.geometry.attributes.position.count === fineSide * fineSide, 'its ground has the fine grid');
        const center = tileCenter(tile.tx, tile.tz);
        const key = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;
        const groundAt = new Map();
        const gp = ground.geometry.attributes.position;
        for (let i = 0; i < gp.count; i++) groundAt.set(key(gp.getX(i), gp.getZ(i)), gp.getY(i));

        const position = mesh.geometry.attributes.position;
        const color = mesh.geometry.attributes.color;
        const flow = mesh.geometry.attributes.aFlow;
        const channel = mesh.geometry.attributes.aChannel;
        const rapids = mesh.geometry.attributes.aRapids;
        assert(color.itemSize === 4 && flow.itemSize === 2 && channel.itemSize === 2 && rapids.itemSize === 1, 'each vertex has a colour with alpha, a current, a channel and rapids');
        let banks = 0;
        let running = 0;
        let filled = 0;
        for (let i = 0; i < position.count; i++) {
            const x = center.x + position.getX(i);
            const z = center.z + position.getZ(i);
            const below = groundAt.get(key(position.getX(i), position.getZ(i)));
            assert(below !== undefined, 'every water vertex sits on a ground vertex');
            assert(Math.abs(position.getY(i) - riverSurfaceHeightAt(SEED, x, z) - RIVER_SURFACE_LIFT) < 1e-4, 'the water lies at the river\'s surface');
            assert(position.getY(i) >= below + RIVER_SURFACE_LIFT - 1e-4, 'the water lies over the ground');
            if (Math.abs(position.getY(i) - below - RIVER_SURFACE_LIFT - riverWaterDepthAt(SEED, x, z)) < 1e-4) filled++;
            assert(Math.abs(color.getW(i) - riverWaterAt(SEED, x, z)) < 1e-4, 'its alpha is how much water covers it');
            if (color.getW(i) === 0) banks++;
            if (color.getW(i) > 0) {
                const expected = riverFlowAt(SEED, x, z);
                assert(Math.abs(flow.getX(i) - expected.vx) < 1e-5 && Math.abs(flow.getY(i) - expected.vz) < 1e-5, 'it carries the current there');
                const tangent = riverChannelTangentAt(SEED, x, z);
                assert(Math.abs(channel.getX(i) * tangent.dx + channel.getY(i) * tangent.dz) > 0.999, 'and the way the channel lies');
                assert(Math.abs(rapids.getX(i) - riverRapidsAt(SEED, x, z)) < 1e-5, 'and how rough it runs');
                if (Math.hypot(expected.vx, expected.vz) > 0.1) running++;
            }
        }
        assert(banks > 0 && running > 0, 'the sheet fades out at its banks and the water in it runs');
        assert(filled > position.count * 0.9, `the water stands its own depth over the carved ground (${filled} of ${position.count})`);
        const normal = mesh.geometry.attributes.normal;
        for (let i = 0; i < normal.count; i++) assert(normal.getY(i) > 0.5, 'the sheet faces up');
        console.log('✓ a river tile is built fine, and its water fills the bed, carrying the current');

        // Two neighbouring river tiles agree on their shared edge.
        const edgeX = center.x + 20;
        const ours = new Map();
        for (let i = 0; i < position.count; i++) {
            if (Math.abs(center.x + position.getX(i) - edgeX) < 1e-6) ours.set((center.z + position.getZ(i)).toFixed(3), position.getY(i));
        }
        const rightCenter = tileCenter(tile.tx + 1, tile.tz);
        const rp = right.geometry.attributes.position;
        let shared = 0;
        for (let i = 0; i < rp.count; i++) {
            const k = (rightCenter.z + rp.getZ(i)).toFixed(3);
            if (Math.abs(rightCenter.x + rp.getX(i) - edgeX) < 1e-6 && ours.has(k)) {
                assert(Math.abs(ours.get(k) - rp.getY(i)) < 1e-5, 'neighbouring tiles meet at the same height');
                shared++;
            }
        }
        assert(shared > 0, 'the two tiles share river vertices on their edge');
        console.log('✓ neighbouring river tiles meet without a step');
    }

    {
        // Where a fine tile meets an ordinary one, its edge lies on the
        // ordinary tile's edge: no crack between them.
        let pair = null;
        for (let tx = -20; tx <= 20 && !pair; tx++) {
            for (let tz = -20; tz <= 20 && !pair; tz++) {
                if (tileHasRiverDetail(tx, tz, SEED) && !tileHasRiverDetail(tx + 1, tz, SEED)) pair = { tx, tz };
            }
        }
        assert(pair, 'a fine tile beside an ordinary one was found');
        const fine = buildTerrainTileMesh(pair.tx, pair.tz, SEED);
        const coarse = buildTerrainTileMesh(pair.tx + 1, pair.tz, SEED);
        assert(coarse.geometry.attributes.position.count === (TILE_SEGMENTS + 1) ** 2, 'the ordinary tile has the ordinary grid');
        const edgeX = (pair.tx + 1) * 40;
        const coarseEdge = [];
        const cp = coarse.geometry.attributes.position;
        const coarseCenter = tileCenter(pair.tx + 1, pair.tz);
        for (let i = 0; i < cp.count; i++) {
            if (Math.abs(coarseCenter.x + cp.getX(i) - edgeX) < 1e-6) coarseEdge.push({ z: coarseCenter.z + cp.getZ(i), y: cp.getY(i) });
        }
        coarseEdge.sort((a, b) => a.z - b.z);
        const fp = fine.geometry.attributes.position;
        const fineCenter = tileCenter(pair.tx, pair.tz);
        let checked = 0;
        for (let i = 0; i < fp.count; i++) {
            if (Math.abs(fineCenter.x + fp.getX(i) - edgeX) > 1e-6) continue;
            const z = fineCenter.z + fp.getZ(i);
            let k = coarseEdge.findIndex((p, n) => n + 1 < coarseEdge.length && p.z <= z + 1e-6 && coarseEdge[n + 1].z >= z - 1e-6);
            const a = coarseEdge[k];
            const b = coarseEdge[k + 1];
            const t = (z - a.z) / (b.z - a.z);
            assert(Math.abs(fp.getY(i) - (a.y + (b.y - a.y) * t)) < 1e-4, 'the fine edge lies on the ordinary edge');
            checked++;
        }
        assert(checked === TILE_SEGMENTS * RIVER_SUBDIVISIONS + 1, 'every vertex of the shared edge was checked');
        console.log('✓ a fine tile meets an ordinary one without a crack');
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
