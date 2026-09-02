import { readFile } from 'node:fs/promises';
import {
    circlesIntersect, avatarTreeCollision, avatarCollisionCircleAt
} from '../core/AvatarTreeCollision.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { treeCollisionCircleFor, treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { naturalFeaturesInRegion, FEATURE_TYPE } from '../core/NaturalFeatureField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.60 — Avatar-Tree Collision Detection, core/AvatarTreeCollision.js.
//
//   Section A: circlesIntersect() — the generic circle-circle primitive,
//              covering outside/touching/inside/same-center/different-radii
//   Section B: avatarCollisionCircleAt() — avatar position -> circle,
//              consuming AVATAR_COLLISION_RADIUS, dropping Y, frozen
//   Section C: avatarTreeCollision() — narrow `{ collides }` output only
//   Section D: flagship integration — real 0.9.59 tree geometry, a real
//              avatar circle, determinism/reproducibility of the result
//   Section E: architectural regression — this file stays geometry-only,
//              never reaching into placement, movement, rendering,
//              randomness, the clock, or storage
//
// Central architectural claim under test throughout: this file DETECTS,
// it never RESOLVES — every test asserts a boolean fact about two given
// circles, never a movement outcome. See docs/Roadmap.md, 0.9.60, for the
// full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: circlesIntersect() — the generic circle-circle
    // primitive
    // -------------------------------------------------------------
    {
        const a = { center: { x: 0, z: 0 }, radius: 1 };
        const outside = { center: { x: 10, z: 0 }, radius: 1 };
        assert(circlesIntersect(a, outside) === false, '1. circlesIntersect: two circles well apart never intersect');
    }
    {
        // Exactly touching (distance === combined radius) counts as an
        // intersection — see this file's own header for why: a
        // physical obstacle with a hairline gap at exact contact would
        // let the avatar cross it on the very next floating-point tick.
        const a = { center: { x: 0, z: 0 }, radius: 1 };
        const touching = { center: { x: 2, z: 0 }, radius: 1 };
        assert(circlesIntersect(a, touching) === true, '2. circlesIntersect: two circles exactly touching (distance === combined radius) DO intersect');
    }
    {
        const a = { center: { x: 0, z: 0 }, radius: 1 };
        const overlapping = { center: { x: 1, z: 0 }, radius: 1 };
        assert(circlesIntersect(a, overlapping) === true, '3. circlesIntersect: two overlapping circles intersect');
    }
    {
        // Same center is always a collision, regardless of radius —
        // including the degenerate zero-radius case.
        const a = { center: { x: 5, z: -3 }, radius: 0 };
        const b = { center: { x: 5, z: -3 }, radius: 0 };
        assert(circlesIntersect(a, b) === true, '4. circlesIntersect: identical centers always intersect, even at zero radius');
    }
    {
        // Different scales: a small circle just outside a large one's
        // radius does not collide; the same small circle just inside
        // the large one's expanded (by its own radius) boundary does.
        const small = { center: { x: 0, z: 0 }, radius: 0.3 };
        const large = { center: { x: 1.31, z: 0 }, radius: 1 };
        assert(circlesIntersect(small, large) === false, '5. circlesIntersect: just outside the combined radius does not intersect');
        const closer = { center: { x: 1.29, z: 0 }, radius: 1 };
        assert(circlesIntersect(small, closer) === true, '6. circlesIntersect: moving just inside the combined radius does intersect');
    }
    {
        // Order independence — a geometric fact about two circles must
        // not depend on which argument is "avatar" and which is "tree."
        const a = { center: { x: 0, z: 0 }, radius: 1 };
        const b = { center: { x: 1.5, z: 0 }, radius: 1 };
        assert(circlesIntersect(a, b) === circlesIntersect(b, a), '7. circlesIntersect: symmetric — argument order never changes the result');
    }

    // -------------------------------------------------------------
    // Section B: avatarCollisionCircleAt() — avatar position -> circle
    // -------------------------------------------------------------
    {
        const circle = avatarCollisionCircleAt({ x: 3, y: 1.2, z: -4 });
        assert(circle.center.x === 3 && circle.center.z === -4, '8. avatarCollisionCircleAt: center matches the position\'s own x/z exactly');
        assert(!('y' in circle.center), '9. avatarCollisionCircleAt: center is purely horizontal (x/z) — no vertical component');
        assert(circle.radius === AVATAR_COLLISION_RADIUS, '10. avatarCollisionCircleAt: radius is exactly core/AvatarCollision.js\'s own AVATAR_COLLISION_RADIUS, never a second constant');
    }
    {
        const circle = avatarCollisionCircleAt({ x: 0, y: 0, z: 0 });
        assert(Object.isFrozen(circle), '11. avatarCollisionCircleAt: the returned circle is frozen');
        assert(Object.isFrozen(circle.center), '12. avatarCollisionCircleAt: the returned center is frozen');
    }
    {
        // Y is ignored entirely — two positions differing only in
        // height produce the identical circle.
        const low = avatarCollisionCircleAt({ x: 2, y: 0, z: 5 });
        const high = avatarCollisionCircleAt({ x: 2, y: 40, z: 5 });
        assert(JSON.stringify(low) === JSON.stringify(high), '13. avatarCollisionCircleAt: differing only in Y produces the identical circle');
    }

    // -------------------------------------------------------------
    // Section C: avatarTreeCollision() — narrow `{ collides }` output
    // only
    // -------------------------------------------------------------
    {
        const avatar = avatarCollisionCircleAt({ x: 0, y: 0, z: 0 });
        const treeFar = { center: { x: 100, z: 100 }, radius: 0.3 };
        const result = avatarTreeCollision(avatar, treeFar);
        assert(result.collides === false, '14. avatarTreeCollision: a far-away tree never collides');
        assert(Object.keys(result).length === 1 && 'collides' in result, '15. avatarTreeCollision: the result object has exactly one key, `collides` — no penetrationDepth/normal/pushVector/resolvedPosition/blockedMovement');
    }
    {
        const avatar = avatarCollisionCircleAt({ x: 0, y: 0, z: 0 });
        const treeHere = { center: { x: 0, z: 0 }, radius: 0.3 };
        const result = avatarTreeCollision(avatar, treeHere);
        assert(result.collides === true, '16. avatarTreeCollision: a tree standing exactly where the avatar stands collides');
    }

    // -------------------------------------------------------------
    // Section D: flagship integration — real 0.9.59 tree geometry, a
    // real avatar circle, determinism/reproducibility of the result
    // -------------------------------------------------------------
    {
        const minX = -100, minZ = -100, maxX = 100, maxZ = 100;
        const trees = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        assert(trees.length > 0, '17. flagship: the queried region contains at least one real tree to test against');
        const tree = trees[0];

        const avatarAtTrunk = avatarCollisionCircleAt({ x: tree.center.x, y: 0, z: tree.center.z });
        assert(avatarTreeCollision(avatarAtTrunk, tree).collides === true, '18. flagship: an avatar standing exactly on a real tree\'s own trunk position collides with it');

        const avatarFarAway = avatarCollisionCircleAt({ x: tree.center.x + 1000, y: 0, z: tree.center.z + 1000 });
        assert(avatarTreeCollision(avatarFarAway, tree).collides === false, '19. flagship: an avatar 1000 units away from that same tree does not collide with it');

        // Determinism: recomputing the identical pipeline from the
        // identical seed and region always yields the identical
        // collision fact — the same tree, the same avatar circle, the
        // same result, every time.
        const treesAgain = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        const treeAgain = treesAgain[0];
        const resultA = avatarTreeCollision(avatarAtTrunk, tree);
        const resultB = avatarTreeCollision(avatarAtTrunk, treeAgain);
        assert(JSON.stringify(resultA) === JSON.stringify(resultB), '20. flagship: the same seed + region + avatar position always produces the same collision fact');
    }
    {
        // Exact-boundary case built from real 0.9.59 geometry: an
        // avatar placed exactly `AVATAR_COLLISION_RADIUS + tree.radius`
        // away from a real tree's own center must register as a
        // collision (touching counts — see Section A).
        const feature = { type: FEATURE_TYPE.TREE, x: 20, z: 20, y: 0, rotationY: 0, scale: 1, variant: 0, zone: 'FOREST' };
        const tree = treeCollisionCircleFor(feature);
        const combined = AVATAR_COLLISION_RADIUS + tree.radius;
        const avatarOnBoundary = avatarCollisionCircleAt({ x: tree.center.x + combined, y: 0, z: tree.center.z });
        assert(avatarTreeCollision(avatarOnBoundary, tree).collides === true, '21. flagship: an avatar exactly `AVATAR_COLLISION_RADIUS + tree.radius` away from a real tree\'s center still collides (exact boundary)');

        const avatarJustPast = avatarCollisionCircleAt({ x: tree.center.x + combined + 0.001, y: 0, z: tree.center.z });
        assert(avatarTreeCollision(avatarJustPast, tree).collides === false, '22. flagship: an avatar just past that same boundary no longer collides');
    }
    {
        // Different scales: a larger tree's proportionally larger
        // radius reaches an avatar a smaller tree at the same position
        // would not.
        const smallFeature = { type: FEATURE_TYPE.TREE, x: 50, z: 50, y: 0, rotationY: 0, scale: 0.7, variant: 0, zone: 'FOREST' };
        const largeFeature = { type: FEATURE_TYPE.TREE, x: 50, z: 50, y: 0, rotationY: 0, scale: 1.3, variant: 0, zone: 'FOREST' };
        const smallTree = treeCollisionCircleFor(smallFeature);
        const largeTree = treeCollisionCircleFor(largeFeature);
        const avatarJustOutsideSmall = avatarCollisionCircleAt({
            x: smallTree.center.x + AVATAR_COLLISION_RADIUS + smallTree.radius + 0.05, y: 0, z: smallTree.center.z
        });
        assert(avatarTreeCollision(avatarJustOutsideSmall, smallTree).collides === false, '23. flagship: an avatar just outside a smaller tree\'s reach does not collide with it');
        assert(avatarTreeCollision(avatarJustOutsideSmall, largeTree).collides === true, '24. flagship: the identical avatar position DOES collide with a larger tree at the same center, because its combined radius reaches further');
    }

    // -------------------------------------------------------------
    // Section E: architectural regression — this file stays geometry-
    // only, never reaching into placement, movement, rendering,
    // randomness, the clock, or storage
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarTreeCollision.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'NaturalFeatureField', 'TreeCollisionGeometry',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint',
            'AvatarMovementSimulation', 'resolveHorizontalMovement', 'aabbsOverlap', 'brickAabb',
            'penetrationDepth', 'pushVector', 'resolvedPosition', 'blockedMovement', 'normal:',
            'velocity', 'acceleration', 'mass', 'gravity',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `25. core/AvatarTreeCollision.js's own code never references "${term}" — geometry-only detection, never placement/movement/response/rendering/randomness/clock/storage`);
        }
        assert(codeOnly.includes('AVATAR_COLLISION_RADIUS'), '26. core/AvatarTreeCollision.js does consume AVATAR_COLLISION_RADIUS from core/AvatarCollision.js — the one deliberate, already-defined geometric fact it is allowed to import');
    }
    {
        // A detected collision is never itself used to move anything —
        // the exported surface is exactly these three functions, no
        // avatar-mutating side effect hiding among them.
        const exportsModule = await import('../core/AvatarTreeCollision.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['avatarCollisionCircleAt', 'avatarTreeCollision', 'circlesIntersect']),
            '27. core/AvatarTreeCollision.js exports exactly circlesIntersect, avatarTreeCollision, and avatarCollisionCircleAt — nothing else');
    }

    console.log('✅ All Avatar-Tree Collision Detection tests passed.');
}

await runTests();
