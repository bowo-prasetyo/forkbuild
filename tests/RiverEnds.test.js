import {
    terrainHeightAt, baseTerrainHeightAt, riverBedAt, riverPoolAt, riverPoolReachAt, riverChannelFallAt, WATER_LEVEL, HIGHLAND_ELEVATION, DEFAULT_WORLD_SEED
} from '../core/TerrainHeightField.js';
import {
    isRiverAt, riverProximityAt, riverChannelTangentAt, riverChannelDistanceAt, hydrologyFeatureAt, HYDROLOGY_FEATURE,
    RIVER_CHANNEL_THRESHOLD
} from '../core/Hydrology.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { riverFlowAt, riverRapidsAt, MAX_RIVER_SPEED } from '../core/RiverFlow.js';
import { STEP_HEIGHT, RIVER_FILL, POOL_RADIUS, BED_DEPTH, CASCADE_SHALLOWING } from '../core/RiverBed.js';
import { DEFAULT_MAX_WALKABLE_SLOPE } from '../core/TerrainWalkability.js';
import { assert } from './support/Assert.js';

// Where rivers end (core/RiverBed.js): they run over rock rather than
// vanishing, cascade down the steepest ground in walkable steps, and end at
// the highland edge in a pool, a spring where the river runs away from it
// and a still pond where it runs in. Nowhere does a river simply stop on dry
// ground.

const SEED = DEFAULT_WORLD_SEED;
const SPAN = 3000;

function riverCentrePoints(step) {
    const points = [];
    for (let x = -SPAN; x < SPAN; x += step) {
        for (let z = -SPAN; z < SPAN; z += step) {
            if (riverProximityAt(SEED, x, z) >= 0.9) points.push([x, z]);
        }
    }
    return points;
}

async function runTests() {
    const centre = riverCentrePoints(6);
    assert(centre.length > 1000, `the sample finds river (${centre.length})`);

    {
        // Following a river a few units either way, it either goes on, reaches
        // a lake or the sea, or ends in its pool: never just stops.
        let ends = 0;
        let unexplained = 0;
        for (const [x, z] of centre) {
            const tangent = riverChannelTangentAt(SEED, x, z);
            for (const sign of [1, -1]) {
                const ax = x + sign * tangent.dx * 6;
                const az = z + sign * tangent.dz * 6;
                if (isRiverAt(SEED, ax, az)) continue;
                if (riverChannelDistanceAt(SEED, ax, az) >= RIVER_CHANNEL_THRESHOLD) continue; // the channel bent away
                const feature = hydrologyFeatureAt(SEED, ax, az);
                if (feature === HYDROLOGY_FEATURE.LAKE || feature === HYDROLOGY_FEATURE.SEA) continue;
                ends++;
                if (riverPoolReachAt(SEED, x, z) === 0) unexplained++;
            }
        }
        assert(ends > 0, 'some rivers end');
        assert(unexplained === 0, `every river that ends on land ends in its pool (${unexplained} of ${ends} do not)`);
        console.log(`✓ no river just stops on dry land (${ends} ends, all in pools)`);
    }

    {
        // Over rock: the river goes on, in a carved bed, running white.
        let onRock = 0;
        for (const [x, z] of centre) {
            if (surfaceCategoryAt(SEED, x, z) !== SURFACE_CATEGORY.ROCK) continue;
            onRock++;
            // (Right at a lake's edge a bed fades out, so its floor never
            // comes down to the water line.)
            if (baseTerrainHeightAt(SEED, x, z) > WATER_LEVEL + 0.5) {
                assert(riverBedAt(SEED, x, z).depth > 0, 'a river over rock runs in a bed');
            }
        }
        assert(onRock > 10, `rivers run over rock (${onRock} samples)`);
        console.log('✓ rivers run over rock in their beds');
    }

    {
        // Cascades: on the steepest stretches the floor steps down in flat
        // pools STEP_HEIGHT apart, with a drop between, and the drops foam.
        let poolFloors = 0;
        let drops = 0;
        for (let x = -SPAN; x < SPAN; x += 2) {
            for (let z = -SPAN; z < SPAN; z += 2) {
                const bed = riverBedAt(SEED, x, z);
                if (bed.cascade < 1 || bed.pool > 0) continue;
                if (riverChannelDistanceAt(SEED, x, z) > RIVER_CHANNEL_THRESHOLD * 0.02) continue;
                if (bed.drop > 0.5) {
                    drops++;
                    assert(riverRapidsAt(SEED, x, z) >= bed.drop - 1e-12, 'water pours white over a drop');
                    continue;
                }
                if (bed.drop > 0) continue;
                // Only where the bed is at full strength (not fading out
                // towards highland or the water line).
                if (Math.abs(bed.waterDepth / RIVER_FILL - BED_DEPTH * (1 - CASCADE_SHALLOWING)) > 0.002) continue;
                // In a pool the floor, less the smooth bowl, lies on a step.
                const floor = terrainHeightAt(SEED, x, z) + bed.waterDepth / RIVER_FILL;
                const steps = floor / STEP_HEIGHT;
                assert(Math.abs(steps - Math.round(steps)) < 0.03, `a cascade's pool floor lies on a step (${steps.toFixed(3)})`);
                poolFloors++;
            }
        }
        assert(poolFloors > 20 && drops > 5, `cascades have pools and drops (${poolFloors} pool floors, ${drops} drops)`);
        console.log('✓ cascades step down in flat pools, pouring white over each drop');
    }

    {
        // However the bed is cut, an avatar can walk it: no step anywhere in
        // a cascade or a pool is steeper than the walkable limit.
        let worst = 0;
        let checked = 0;
        for (let x = -SPAN; x < SPAN && checked < 400; x += 4) {
            for (let z = -SPAN; z < SPAN && checked < 400; z += 4) {
                const bed = riverBedAt(SEED, x, z);
                if (bed.cascade <= 0 && bed.pool <= 0) continue;
                checked++;
                for (let i = -6; i <= 6; i++) {
                    for (let j = -6; j <= 6; j++) {
                        const px = x + i * 0.3;
                        const pz = z + j * 0.3;
                        const h = terrainHeightAt(SEED, px, pz);
                        for (const [dx, dz] of [[0.4, 0], [0, 0.4], [0.28, 0.28], [0.28, -0.28]]) {
                            worst = Math.max(worst, Math.abs(terrainHeightAt(SEED, px + dx, pz + dz) - h) / 0.4);
                        }
                    }
                }
            }
        }
        assert(checked >= 100, `enough cascades and pools were checked (${checked})`);
        assert(worst <= DEFAULT_MAX_WALKABLE_SLOPE, `the steepest step in a cascade or pool is walkable (${worst.toFixed(3)})`);
        console.log(`✓ cascades and pools are walkable (steepest ${worst.toFixed(2)})`);
    }

    {
        // Pools at the highland edge: river all through, carved, and either
        // a spring whose water spreads outward or a pond lying still.
        let springs = 0;
        let ponds = 0;
        const seen = new Set();
        for (let x = -SPAN; x < SPAN; x += 2) {
            for (let z = -SPAN; z < SPAN; z += 2) {
                const pool = riverPoolAt(SEED, x, z);
                // Pools at full strength: where the channel meets the edge
                // squarely (a glancing one keeps more of its own current).
                if (!pool || pool.r > 0.6 || pool.r < 0.4 || pool.crossing < 1) continue;
                const key = `${Math.round(x / 15)},${Math.round(z / 15)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                assert(isRiverAt(SEED, x, z) && riverBedAt(SEED, x, z).pool > 0, 'a pool is river, cut into the ground');
                const tangent = riverChannelTangentAt(SEED, x, z);
                const fall = riverChannelFallAt(SEED, x, z, tangent);
                // Which way the river's own channel runs here, against the
                // slope up into the highland: > 0 into it.
                const uphill = (tangent.dx * pool.gx + tangent.dz * pool.gz) / Math.hypot(pool.gx, pool.gz);
                const intoHighland = Math.sign(fall) * uphill;
                const { vx, vz } = riverFlowAt(SEED, x, z);
                const speed = Math.hypot(vx, vz);
                const outX = pool.across * tangent.dz + pool.up * pool.dirX;
                const outZ = pool.across * -tangent.dx + pool.up * pool.dirZ;
                if (Math.abs(fall) < 0.005) continue; // a river too level here to say
                if (intoHighland < -0.3) {
                    springs++;
                    assert(vx * outX + vz * outZ > 0, 'a spring\'s water spreads outward from its centre');
                } else if (intoHighland > 0.3) {
                    ponds++;
                    assert(speed < MAX_RIVER_SPEED * 0.2, `a pond lies nearly still (${speed.toFixed(2)})`);
                }
            }
        }
        assert(springs > 10, `rivers start at springs (${springs})`);
        assert(ponds > 0, `a few rivers end in ponds (${ponds})`);
        console.log(`✓ rivers start at springs (${springs}) and a few end in still ponds (${ponds})`);
    }

    {
        // A pool is round about the river, not drawn out along the highland
        // edge: a pool's length along the edge used to grow wherever a channel
        // ran beside it. Walking along the edge (across the slope) from a
        // pool's centre, the pool ends within its own radius.
        let centres = 0;
        let drawnOut = 0;
        const seen = new Set();
        for (const [px, pz] of centre) {
            const near = riverPoolAt(SEED, px, pz);
            if (!near || near.r >= 1 || near.crossing < 1) continue;
            // The pool's centre, from this point's place in it.
            const tangent = riverChannelTangentAt(SEED, px, pz);
            const x = px - (near.across * tangent.dz + near.up * near.dirX);
            const z = pz - (near.across * -tangent.dx + near.up * near.dirZ);
            const key = `${Math.round(x / 15)},${Math.round(z / 15)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const pool = riverPoolAt(SEED, x, z);
            if (!pool || pool.r > 0.2) continue;
            centres++;
            const slope = Math.hypot(pool.gx, pool.gz);
            const alongX = -pool.gz / slope;
            const alongZ = pool.gx / slope;
            for (const side of [1, -1]) {
                const far = riverPoolAt(SEED, x + side * alongX * POOL_RADIUS * 1.5, z + side * alongZ * POOL_RADIUS * 1.5);
                if (far && far.r < 1 && far.crossing > 0.5) drawnOut++;
            }
        }
        assert(centres > 12, `pool centres were found (${centres})`);
        assert(drawnOut <= centres * 2 * 0.1, `pools are round, not drawn out along the edge (${drawnOut} of ${centres * 2} reach on)`);
        console.log(`✓ pools are round about the river (${drawnOut} of ${centres * 2} reach on along the edge, a neighbouring crossing)`);
    }

    {
        // A pool sits at the highland edge, its centre where the channel
        // crosses into highland.
        let checked = 0;
        for (let x = -SPAN; x < SPAN && checked < 50; x += 2) {
            for (let z = -SPAN; z < SPAN && checked < 50; z += 2) {
                const pool = riverPoolAt(SEED, x, z);
                if (!pool || pool.r > 0.05) continue;
                checked++;
                const slope = Math.hypot(pool.gx, pool.gz);
                assert(Math.abs(baseTerrainHeightAt(SEED, x, z) - HIGHLAND_ELEVATION) <= slope * POOL_RADIUS * 0.1 + 1e-6, 'a pool\'s centre lies on the highland edge');
            }
        }
        assert(checked > 5, 'pool centres were found');
        console.log('✓ pools sit at the highland edge');
    }
}

await runTests();
