import { readFile } from 'node:fs/promises';
import {
    treeCollisionCircleFor, treeCollisionGeometryInRegion,
    COLLISION_OBJECT_KIND, COLLISION_SHAPE, TREE_TRUNK_COLLISION_RADIUS
} from '../core/TreeCollisionGeometry.js';
import { naturalFeaturesInRegion, FEATURE_TYPE } from '../core/NaturalFeatureField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.59 — Deterministic World Tree Collision Geometry, core/TreeCollisionGeometry.js.
//
//   Section A: treeCollisionCircleFor() — per-tree geometry derivation
//   Section B: treeCollisionGeometryInRegion() — determinism and
//              agreement with naturalFeaturesInRegion()'s own placement
//   Section C: proportionality — radius scales with feature.scale, and
//              stays well inside the visual canopy, never past it
//   Section D: architectural regression — this file never reaches into
//              movement, detection, response, or rendering, and its two
//              vocabularies stay exactly one member each
//
// Central architectural claim under test throughout: tree collision
// geometry is a PURE function of exactly the same deterministic tree
// placement core/NaturalFeatureField.js already establishes — never a
// second, independently-seeded placement decision, and never anything
// that detects, blocks, or otherwise resolves movement. See docs/Roadmap.md,
// 0.9.59, for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: treeCollisionCircleFor() — per-tree geometry
    // derivation
    // -------------------------------------------------------------
    {
        const feature = { type: FEATURE_TYPE.TREE, x: 12.5, z: -7.25, y: 3, rotationY: 1.2, scale: 1, variant: 0, zone: 'FOREST' };
        const circle = treeCollisionCircleFor(feature);
        assert(circle.kind === COLLISION_OBJECT_KIND.TREE, '1. treeCollisionCircleFor: kind is TREE');
        assert(circle.shape === COLLISION_SHAPE.CIRCLE, '2. treeCollisionCircleFor: shape is CIRCLE');
        assert(circle.center.x === feature.x && circle.center.z === feature.z,
            '3. treeCollisionCircleFor: center matches the feature\'s own x/z exactly');
        assert(circle.radius === TREE_TRUNK_COLLISION_RADIUS, '4. treeCollisionCircleFor: at scale 1, radius equals the base trunk radius exactly');
        assert(!('y' in circle.center), '5. treeCollisionCircleFor: center is purely horizontal (x/z) — no vertical component, matching a top-down circle');
    }
    {
        // The returned object and its nested center are immutable —
        // this file never hands back geometry a caller could mutate
        // and accidentally desync from the deterministic source.
        const feature = { type: FEATURE_TYPE.TREE, x: 0, z: 0, y: 0, rotationY: 0, scale: 1, variant: 0, zone: 'GRASSLAND' };
        const circle = treeCollisionCircleFor(feature);
        assert(Object.isFrozen(circle), '6. treeCollisionCircleFor: the returned circle is frozen');
        assert(Object.isFrozen(circle.center), '7. treeCollisionCircleFor: the returned center is frozen');
    }

    // -------------------------------------------------------------
    // Section B: treeCollisionGeometryInRegion() — determinism and
    // agreement with naturalFeaturesInRegion()'s own placement
    // -------------------------------------------------------------
    {
        const a = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const b = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        assert(JSON.stringify(a) === JSON.stringify(b), '8. Same seed + same region always produces the exact same collision geometry ARRAY, element for element');
        assert(a.length > 0, '9. A large region always yields at least one tree\'s collision geometry');
    }
    {
        // Every circle's center must land exactly on a tree
        // naturalFeaturesInRegion() itself reports for the identical
        // region — this file never invents a tree of its own, and
        // never drops one naturalFeaturesInRegion() already placed.
        const minX = -100, minZ = -100, maxX = 100, maxZ = 100;
        const placements = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ)
            .filter((f) => f.type === FEATURE_TYPE.TREE);
        const circles = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        assert(circles.length === placements.length, '10. treeCollisionGeometryInRegion: exactly one circle per tree placement, no more, no fewer');
        for (let i = 0; i < placements.length; i++) {
            assert(circles[i].center.x === placements[i].x && circles[i].center.z === placements[i].z,
                `11. Circle ${i} sits exactly on its own tree's placement — same order, same coordinates`);
        }
    }
    {
        // A different seed produces genuinely different collision
        // geometry, the same way it produces genuinely different
        // placement — this file inherits the seed dependency, never
        // hides it.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const a = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const c = treeCollisionGeometryInRegion(otherSeed, -200, -200, 200, 200);
        assert(JSON.stringify(a) !== JSON.stringify(c), '12. A different world seed produces genuinely different tree collision geometry over the same region');
    }
    {
        // Half-open interval, exactly like naturalFeaturesInRegion()'s
        // own contract — every returned circle's center falls strictly
        // within [minX, maxX) x [minZ, maxZ).
        const minX = 0, minZ = 0, maxX = 40, maxZ = 40;
        const circles = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        for (const circle of circles) {
            assert(circle.center.x >= minX && circle.center.x < maxX && circle.center.z >= minZ && circle.center.z < maxZ,
                `13. Circle at (${circle.center.x}, ${circle.center.z}) falls strictly within the queried region`);
        }
    }

    // -------------------------------------------------------------
    // Section C: proportionality — radius scales with feature.scale,
    // and stays well inside the visual canopy, never past it
    // -------------------------------------------------------------
    {
        const small = treeCollisionCircleFor({ type: FEATURE_TYPE.TREE, x: 0, z: 0, y: 0, rotationY: 0, scale: 0.7, variant: 0, zone: 'FOREST' });
        const large = treeCollisionCircleFor({ type: FEATURE_TYPE.TREE, x: 0, z: 0, y: 0, rotationY: 0, scale: 1.3, variant: 0, zone: 'FOREST' });
        assert(Math.abs(small.radius - TREE_TRUNK_COLLISION_RADIUS * 0.7) < 1e-9, '14. A smaller tree (scale 0.7) gets a proportionally smaller hitbox');
        assert(Math.abs(large.radius - TREE_TRUNK_COLLISION_RADIUS * 1.3) < 1e-9, '15. A larger tree (scale 1.3) gets a proportionally larger hitbox');
        assert(large.radius > small.radius, '16. A visually larger tree never gets a smaller or equal hitbox than a visually smaller one');
    }
    {
        // Every real tree's radius, across the whole [0.7, 1.3) scale
        // range naturalFeaturesInRegion() itself declares, stays well
        // under the renderer's own visual canopy radius (0.85 — see
        // renderer/NaturalFeatureTileMesh.js's own CANOPY_RADIUS,
        // deliberately re-stated here as a literal rather than
        // imported, matching this codebase's own "never import a
        // renderer constant into core" precedent) — this milestone's
        // own central design claim: a trunk-sized hitbox, never a
        // canopy-sized one.
        const VISUAL_CANOPY_RADIUS_AT_SCALE_1 = 0.85;
        const circles = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        assert(circles.length > 0, '17. A large region yields real trees to check proportionality against');
        for (const circle of circles) {
            assert(circle.radius < VISUAL_CANOPY_RADIUS_AT_SCALE_1 * 1.3, `18. Circle radius ${circle.radius} stays well under the largest possible visual canopy radius — a trunk hitbox, not a canopy hitbox`);
            assert(circle.radius > 0, '19. Every circle has a strictly positive radius');
        }
    }

    // -------------------------------------------------------------
    // Section D: architectural regression — this file never reaches
    // into movement, detection, response, or rendering, and its two
    // vocabularies stay exactly one member each.
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/TreeCollisionGeometry.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarCollision', 'AvatarMovementConstraint', 'AvatarTerrainConstraint',
            'resolveHorizontalMovement', 'aabbsOverlap',
            'velocity', 'acceleration', 'mass', 'gravity',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `20. core/TreeCollisionGeometry.js's own code never references "${term}" — geometry only, never movement/detection/response/rendering/persistence`);
        }
    }
    {
        // The exported vocabularies stay exactly one member each, on
        // purpose, per this milestone's own explicit scope — an
        // intentional invariant this milestone establishes, not an
        // accident of what happens to exist yet.
        assert(Object.keys(COLLISION_OBJECT_KIND).length === 1 && COLLISION_OBJECT_KIND.TREE === 'TREE',
            '21. COLLISION_OBJECT_KIND has exactly one member (TREE) this milestone');
        assert(Object.keys(COLLISION_SHAPE).length === 1 && COLLISION_SHAPE.CIRCLE === 'CIRCLE',
            '22. COLLISION_SHAPE has exactly one member (CIRCLE) this milestone');
        assert(Object.isFrozen(COLLISION_OBJECT_KIND) && Object.isFrozen(COLLISION_SHAPE),
            '23. Both vocabularies are frozen, matching every other classification enum in this codebase');
    }

    console.log('✅ All Deterministic World Tree Collision Geometry tests passed.');
}

await runTests();
