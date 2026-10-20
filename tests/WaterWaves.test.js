import {
    waterWaveAt, WAVE_KIND, LAKE_WAVES, SEA_WAVES, MAX_SWELL_HEIGHT, waveNumber, waveAngularSpeed
} from '../core/nature/WaterWaves.js';
import { seaShareAt, hydrologyFeatureAt, HYDROLOGY_FEATURE } from '../core/nature/Hydrology.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/nature/TerrainSurface.js';
import { DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { buildWaterTileMesh } from '../renderer/WaterTileMesh.js';
import { tileCenter } from '../core/nature/TerrainTiling.js';
import { assert } from './support/Assert.js';

// Lakes ripple and the sea swells (core/nature/WaterWaves.js): a pure function of
// where, when and how much sea, low enough to stay visual only, moving the
// way water moves, and blending from lake to sea across a coast.

const SEED = DEFAULT_WORLD_SEED;

function samples(fn) {
    const out = [];
    for (let i = 0; i < 400; i++) {
        out.push(fn(i * 7.31 - 1400, i * -3.17 + 600, i * 0.37));
    }
    return out;
}

function rms(values) {
    return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
}

async function runTests() {
    {
        const a = waterWaveAt(0.6, 12.5, -40.25, 33.3);
        const b = waterWaveAt(0.6, 12.5, -40.25, 33.3);
        assert(a.height === b.height && a.slopeX === b.slopeX && a.slopeZ === b.slopeZ, 'the same place, time and sea share give the same surface');
        console.log('✓ the surface is a pure function of place, time and sea share');
    }

    {
        assert(MAX_SWELL_HEIGHT > 0 && MAX_SWELL_HEIGHT <= 0.25, `the swell stays low enough to be visual only (got ${MAX_SWELL_HEIGHT})`);
        for (const sea of [0, 0.5, 1]) {
            for (const { height } of samples((x, z, t) => waterWaveAt(sea, x, z, t))) {
                assert(Math.abs(height) <= MAX_SWELL_HEIGHT + 1e-12, `no crest passes MAX_SWELL_HEIGHT (sea ${sea}, got ${height})`);
            }
        }
        console.log('✓ the swell never rises or sinks past MAX_SWELL_HEIGHT');
    }

    {
        const moving = samples((x, z, t) => Math.abs(waterWaveAt(1, x, z, t).height - waterWaveAt(1, x, z, t + 1.5).height));
        assert(moving.filter((d) => d > 1e-4).length > moving.length * 0.9, 'the sea surface moves as time passes');
        const lakeRipple = samples((x, z, t) => waterWaveAt(0, x, z, t, WAVE_KIND.RIPPLE).slopeX - waterWaveAt(0, x, z, t + 0.5, WAVE_KIND.RIPPLE).slopeX);
        assert(lakeRipple.filter((d) => Math.abs(d) > 1e-4).length > lakeRipple.length * 0.9, 'a lake ripples as time passes');
        console.log('✓ lakes and the sea move with time');
    }

    {
        const lake = rms(samples((x, z, t) => waterWaveAt(0, x, z, t).height));
        const sea = rms(samples((x, z, t) => waterWaveAt(1, x, z, t).height));
        assert(sea > lake * 2, `the sea swells well above a lake (sea ${sea}, lake ${lake})`);
        const lakeChop = rms(samples((x, z, t) => waterWaveAt(0, x, z, t, WAVE_KIND.RIPPLE).slopeX));
        const seaChop = rms(samples((x, z, t) => waterWaveAt(1, x, z, t, WAVE_KIND.RIPPLE).slopeX));
        assert(seaChop > lakeChop, `the sea is choppier than a lake (sea ${seaChop}, lake ${lakeChop})`);
        console.log('✓ the sea swells and chops more than a lake');
    }

    {
        // Across a coast the waves blend, never step: halfway is the average.
        for (const [x, z, t] of [[3, 4, 5], [-120, 77, 1000.5], [9000, -4000, 12]]) {
            const lake = waterWaveAt(0, x, z, t);
            const sea = waterWaveAt(1, x, z, t);
            const half = waterWaveAt(0.5, x, z, t);
            assert(Math.abs(half.height - (lake.height + sea.height) / 2) < 1e-12, 'halfway between lake and sea is the average of the two');
            assert(Math.abs(waterWaveAt(0.5001, x, z, t).height - half.height) < 1e-4, 'a small step in sea share is a small step in the surface');
        }
        assert(waterWaveAt(-3, 1, 2, 3).height === waterWaveAt(0, 1, 2, 3).height
            && waterWaveAt(7, 1, 2, 3).height === waterWaveAt(1, 1, 2, 3).height, 'sea share is clamped to 0..1');
        console.log('✓ lake waves blend into sea waves with no seam');
    }

    {
        // The slope is the true derivative of the height, so the normals the
        // renderer tilts light with match the shape it draws.
        const h = 1e-5;
        for (const kind of [WAVE_KIND.SWELL, WAVE_KIND.RIPPLE]) {
            for (const [x, z, t] of [[1.5, 2.5, 3.5], [-50, 20, 99], [400, -800, 7]]) {
                const at = waterWaveAt(0.7, x, z, t, kind);
                const dx = (waterWaveAt(0.7, x + h, z, t, kind).height - waterWaveAt(0.7, x - h, z, t, kind).height) / (2 * h);
                const dz = (waterWaveAt(0.7, x, z + h, t, kind).height - waterWaveAt(0.7, x, z - h, t, kind).height) / (2 * h);
                assert(Math.abs(at.slopeX - dx) < 1e-5 && Math.abs(at.slopeZ - dz) < 1e-5, `${kind} slope is the height's derivative`);
            }
        }
        console.log('✓ the slopes are the derivatives of the height');
    }

    {
        // Like real water, a longer wave travels faster.
        const all = [...LAKE_WAVES, ...SEA_WAVES].sort((a, b) => a.wavelength - b.wavelength);
        for (let i = 1; i < all.length; i++) {
            const speed = (w) => waveAngularSpeed(w) / waveNumber(w);
            assert(speed(all[i]) >= speed(all[i - 1]), 'a longer wave is never slower than a shorter one');
        }
        // And the swell is long enough for the water grid to draw it.
        for (const w of [...LAKE_WAVES, ...SEA_WAVES].filter((w) => w.kind === WAVE_KIND.SWELL)) {
            assert(w.wavelength >= 12, `a swell spans several grid cells (got ${w.wavelength})`);
        }
        console.log('✓ longer waves run faster, and every swell is long enough to draw');
    }

    {
        let seaSeen = false;
        let lakeSeen = false;
        for (let i = 0; i < 4000 && !(seaSeen && lakeSeen); i++) {
            const x = (i % 80) * 37 - 1500;
            const z = Math.floor(i / 80) * 41 - 1000;
            const share = seaShareAt(SEED, x, z);
            assert(share >= 0 && share <= 1, 'sea share is between 0 and 1');
            const feature = hydrologyFeatureAt(SEED, x, z);
            if (feature === HYDROLOGY_FEATURE.SEA) {
                seaSeen = true;
                assert(share === 1, 'open sea is all sea');
            }
            if (feature === HYDROLOGY_FEATURE.LAKE) {
                lakeSeen = true;
                assert(share < 1, 'a lake is never wholly sea');
            }
        }
        assert(seaSeen && lakeSeen, 'the sample found both sea and lake');
        console.log('✓ sea share agrees with where the sea is');
    }

    {
        // Every water vertex of a real tile carries its sea share for the
        // shader, so the motion follows the coast the colour follows.
        let checked = false;
        for (let tx = -40; tx <= 40 && !checked; tx++) {
            for (let tz = -40; tz <= 40 && !checked; tz++) {
                const center = tileCenter(tx, tz);
                if (surfaceCategoryAt(SEED, center.x, center.z) !== SURFACE_CATEGORY.WATER) continue;
                const mesh = buildWaterTileMesh(tx, tz, SEED);
                const position = mesh.geometry.attributes.position;
                const shares = mesh.geometry.attributes.aSeaShare;
                assert(shares && shares.count === position.count, 'the tile has a sea share for every vertex');
                for (let i = 0; i < position.count; i++) {
                    const x = center.x + position.getX(i);
                    const z = center.z + position.getZ(i);
                    if (surfaceCategoryAt(SEED, x, z) !== SURFACE_CATEGORY.WATER) continue;
                    assert(Math.abs(shares.getX(i) - seaShareAt(SEED, x, z)) < 1e-6, 'a water vertex carries seaShareAt() of its own place');
                }
                checked = true;
            }
        }
        assert(checked, 'a water tile was found to check');
        console.log('✓ water tiles carry each vertex\'s sea share');
    }
}

await runTests();
