import {
    PLAZA_CENTER, PLAZA_GAP, PLAZA_OPEN_RADIUS, layoutPlazaExhibits, plazaEntryOrder, plazaFootprint
} from '../core/ChallengePlaza.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { SURFACE_CATEGORY, surfaceCategoryAt } from '../core/TerrainSurface.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { HYDROLOGY_FEATURE, hydrologyFeatureAt } from '../core/Hydrology.js';
import { naturalFeaturesInRegion } from '../core/NaturalFeatureField.js';
import { PLAZA_CLEARING_RADIUS, isInPlazaClearing } from '../core/ChallengePlaza.js';
import { assert } from './support/Assert.js';

// The challenge plaza (core/ChallengePlaza.js): where a week's entries stand.

function footprint(width, depth, { x = 0, z = 0 } = {}) {
    return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

// Where an exhibit's footprint ends up, as a circle round its middle.
function circles(items, placed) {
    return placed.map(({ key, position }) => {
        const f = items.find((item) => item.key === key).footprint;
        return {
            key,
            x: position.x + (f.minX + f.maxX) / 2,
            z: position.z + (f.minZ + f.maxZ) / 2,
            r: Math.hypot(f.maxX - f.minX, f.maxZ - f.minZ) / 2
        };
    });
}

// The first published stand first, whatever order they were found in.
{
    const order = plazaEntryOrder([
        { id: 'c', publishedAt: '2026-10-07T10:00:00Z' },
        { id: 'b', publishedAt: '2026-10-05T10:00:00Z' },
        { id: 'a', publishedAt: '2026-10-07T10:00:00Z' },
        null,
        { id: 'd' }
    ]);
    assert(order.map((p) => p.id).join() === 'd,b,a,c', `oldest first, ties by id (${order.map((p) => p.id)})`);
    assert(plazaEntryOrder('junk').length === 0, 'junk is no entries');
    console.log('✓ entries stand in the order they were published');
}

// No two exhibits overlap, none stands in the open middle, and the same
// entries always stand in the same places.
{
    const sizes = [[8, 8], [20, 12], [4, 4], [30, 30], [10, 6], [6, 10], [12, 12], [8, 16], [5, 5], [14, 9], [9, 14], [3, 3], [18, 18], [7, 7]];
    const items = sizes.map(([w, d], i) => ({ key: `e${i}`, footprint: footprint(w, d, { x: i % 3, z: -(i % 2) * 5 }) }));
    const placed = layoutPlazaExhibits(items);
    assert(placed.length === items.length, 'every entry stands');
    assert(JSON.stringify(placed) === JSON.stringify(layoutPlazaExhibits(items)), 'the same layout every time');
    const shapes = circles(items, placed);
    for (const a of shapes) {
        const fromMiddle = Math.hypot(a.x - PLAZA_CENTER.x, a.z - PLAZA_CENTER.z);
        assert(fromMiddle - a.r >= PLAZA_OPEN_RADIUS - 0.01, `${a.key} leaves the middle open`);
        for (const b of shapes) {
            if (a.key >= b.key) continue;
            const apart = Math.hypot(a.x - b.x, a.z - b.z);
            assert(apart >= a.r + b.r + PLAZA_GAP - 0.01, `${a.key} and ${b.key} don't overlap (${apart.toFixed(2)} apart)`);
        }
    }
    assert(placed.every((p) => p.position.y === PLAZA_CENTER.y), 'on the ground');
    console.log('✓ exhibits stand apart, round an open middle, the same way every time');
}

// A newly found entry joins the end; those already standing keep their places
// while their ring has room.
{
    const items = [0, 1, 2].map((i) => ({ key: `e${i}`, footprint: footprint(6, 6) }));
    const before = layoutPlazaExhibits(items.slice(0, 2));
    const after = layoutPlazaExhibits(items);
    assert(after.length === 3 && after[2].key === 'e2', 'the new entry stands last');
    assert(before[0].key === after[0].key, 'the first keeps its turn');
    console.log('✓ a new entry joins the end');
}

// A build too large to share a ring stands on one of its own; a broken
// footprint stands as a small one.
{
    const placed = layoutPlazaExhibits([
        { key: 'huge', footprint: footprint(400, 400) },
        { key: 'broken', footprint: { minX: NaN } },
        { key: 'small', footprint: footprint(4, 4) }
    ]);
    assert(placed.length === 3 && placed.every((p) => Number.isFinite(p.position.x) && Number.isFinite(p.position.z)), 'every one stands somewhere');
    assert(plazaFootprint(null).maxX === 0.5, 'no bounds is a small footprint');
    assert(layoutPlazaExhibits(null).length === 0, 'nothing to lay out');
    console.log('✓ huge and broken builds still stand');
}

// The plaza's ground: dry and level where its first rings stand, and clear of
// the grid published builds land on.
{
    let lowest = Infinity;
    let highest = -Infinity;
    for (let dx = -60; dx <= 60; dx += 5) {
        for (let dz = -60; dz <= 60; dz += 5) {
            if (dx * dx + dz * dz > 60 * 60) continue;
            const x = PLAZA_CENTER.x + dx;
            const z = PLAZA_CENTER.z + dz;
            const surface = surfaceCategoryAt(DEFAULT_WORLD_SEED, x, z);
            assert(surface !== SURFACE_CATEGORY.WATER && surface !== SURFACE_CATEGORY.ROCK, `dry, walkable ground at ${x}, ${z} (${surface})`);
            assert(hydrologyFeatureAt(DEFAULT_WORLD_SEED, x, z) === HYDROLOGY_FEATURE.NONE, `no river or lake at ${x}, ${z}`);
            const height = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
            lowest = Math.min(lowest, height);
            highest = Math.max(highest, height);
        }
    }
    assert(highest - lowest < 3, `level ground (${(highest - lowest).toFixed(2)} from lowest to highest)`);
    const gridCorner = computeDeterministicGridPosition('any');
    assert(PLAZA_CENTER.x + 60 < 0 && gridCorner.x >= 0 && gridCorner.z >= 0, 'clear of the publishing grid');
    console.log('✓ the plaza stands on dry, level ground, clear of the publishing grid');
}

// No tree grows in the plaza's clearing, and trees still grow just outside it.
{
    const r = PLAZA_CLEARING_RADIUS + 40;
    const trees = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, PLAZA_CENTER.x - r, PLAZA_CENTER.z - r, PLAZA_CENTER.x + r, PLAZA_CENTER.z + r);
    assert(trees.every((tree) => !isInPlazaClearing(tree.x, tree.z)), 'no tree in the clearing');
    assert(trees.length > 0, 'trees round it');
    assert(isInPlazaClearing(PLAZA_CENTER.x, PLAZA_CENTER.z) && !isInPlazaClearing(PLAZA_CENTER.x + PLAZA_CLEARING_RADIUS, PLAZA_CENTER.z), 'the clearing is a circle round the middle');
    console.log('✓ the plaza is a clearing');
}
