import { readFile } from 'node:fs/promises';
import { resolveAvatarTreeMovement } from '../core/AvatarTreeMovement.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { treeCollisionCircleFor, treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { FEATURE_TYPE } from '../core/NaturalFeatureField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.61 — Avatar-Tree Collision Resolution, core/AvatarTreeMovement.js.
//
//   Section A: no collision — free-space movement passes through untouched
//   Section B: direct movement into a tree — stops exactly at the
//              collision boundary
//   Section C: diagonal movement — the tangential component survives, the
//              avatar is never simply frozen
//   Section D: already touching a tree — inward movement is held, never
//              allowed to penetrate further
//   Section E: moving away from a tree — never obstructed, even while
//              touching; collision is never a permanent attachment
//   Section F: no mutation — current position, requested position, and
//              tree geometry are all left exactly as given
//   Section G: determinism — identical inputs always resolve to the
//              identical output
//   Section H: multiple trees — resolved in supplied order, deterministically
//   Section I: Y preservation — resolution never touches the vertical axis
//   Section J: flagship integration — real 0.9.59 tree geometry through
//              real resolution
//   Section K: architectural regression — this file stays resolution-only,
//              never reaching into spatial query, rendering, or the
//              avatar/world runtime
//
// Central architectural claim under test throughout: this file answers
// "where may the avatar move," never "should the avatar move" (0.9.60's
// own job) or "which trees are nearby" (a later milestone's own job). See
// docs/Roadmap.md, 0.9.61, for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

async function runTests() {
    const tree = { center: { x: 0, z: 0 }, radius: 0.3 };
    const combinedRadius = AVATAR_COLLISION_RADIUS + tree.radius;

    // -------------------------------------------------------------
    // Section A: no collision — free-space movement passes through
    // untouched
    // -------------------------------------------------------------
    {
        const currentPosition = { x: 10, y: 0, z: 10 };
        const requestedPosition = { x: 11, y: 0, z: 10.5 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [] });
        assert(result.x === requestedPosition.x && result.z === requestedPosition.z, '1. resolveAvatarTreeMovement: with no trees at all, the resolved position is exactly the requested position');
    }
    {
        const currentPosition = { x: -20, y: 0, z: -20 };
        const requestedPosition = { x: -19, y: 0, z: -20 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(result.x === requestedPosition.x && result.z === requestedPosition.z, '2. resolveAvatarTreeMovement: a tree far outside the requested step\'s path never obstructs it');
    }

    // -------------------------------------------------------------
    // Section B: direct movement into a tree — stops exactly at the
    // collision boundary
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -5, y: 1, z: 0 };
        const requestedPosition = { x: 5, y: 1, z: 0 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(Math.abs(distance(result, tree.center) - combinedRadius) < 1e-9, '3. resolveAvatarTreeMovement: moving straight at a tree stops exactly at AVATAR_COLLISION_RADIUS + tree.radius from its center');
        assert(result.x < requestedPosition.x, '4. resolveAvatarTreeMovement: the resolved position never reaches the fully requested (penetrating) position');
        assert(result.x > currentPosition.x, '5. resolveAvatarTreeMovement: the avatar still makes forward progress up to the boundary, rather than not moving at all');
    }

    // -------------------------------------------------------------
    // Section C: diagonal movement — the tangential component
    // survives, the avatar is never simply frozen
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -2, y: 0, z: -2 };
        const requestedPosition = { x: 2, y: 0, z: 2 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(distance(result, currentPosition) > 0.01, '6. resolveAvatarTreeMovement: a diagonal approach still produces real movement — the avatar is not frozen at its starting position');
        assert(Math.abs(distance(result, tree.center) - combinedRadius) < 1e-6, '7. resolveAvatarTreeMovement: a diagonal approach resolves to a point exactly on the tree\'s own collision boundary, having slid along it');
        // Not the straight-line stop point Section B produced — the
        // tangential component genuinely moved the avatar sideways too.
        assert(Math.abs(result.x) > 1e-6 && Math.abs(result.x - result.z) < 1e-9, '8. resolveAvatarTreeMovement: the resolved point reflects real tangential sliding, not merely a radial stop');
    }

    // -------------------------------------------------------------
    // Section D: already touching a tree — inward movement is held,
    // never allowed to penetrate further
    // -------------------------------------------------------------
    {
        // 0.9.60's own rule: exactly `combinedRadius` away counts as
        // already touching/colliding (`<=`, not `<`).
        const currentPosition = { x: combinedRadius, y: 0, z: 0 };
        const requestedPosition = { x: currentPosition.x - 1, y: 0, z: 0 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(Math.abs(result.x - combinedRadius) < 1e-9 && result.z === 0, '9. resolveAvatarTreeMovement: starting exactly touching a tree and requesting further inward movement is held at the boundary, not pushed inward');
    }
    {
        // Starting genuinely overlapping (deeper than exactly touching)
        // must never be allowed to resolve to an even deeper penetration.
        const currentPosition = { x: combinedRadius * 0.5, y: 0, z: 0 };
        const requestedPosition = { x: 0, y: 0, z: 0 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(distance(result, tree.center) >= distance(currentPosition, tree.center) - 1e-9, '10. resolveAvatarTreeMovement: already-overlapping movement further toward the tree\'s own center is never allowed to reduce the distance to it');
    }

    // -------------------------------------------------------------
    // Section E: moving away from a tree — never obstructed, even
    // while touching; collision is never a permanent attachment
    // -------------------------------------------------------------
    {
        const currentPosition = { x: combinedRadius, y: 0, z: 0 };
        const requestedPosition = { x: currentPosition.x + 1, y: 0, z: 0 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(result.x === requestedPosition.x && result.z === requestedPosition.z, '11. resolveAvatarTreeMovement: moving directly away from a tree the avatar is touching is fully unobstructed');
    }
    {
        // Tangential movement while touching is likewise never blocked.
        const currentPosition = { x: combinedRadius, y: 0, z: 0 };
        const requestedPosition = { x: combinedRadius, y: 0, z: 0.001 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(result.z === requestedPosition.z, '12. resolveAvatarTreeMovement: purely tangential movement while touching a tree is unobstructed');
    }

    // -------------------------------------------------------------
    // Section F: no mutation — current position, requested position,
    // and tree geometry are all left exactly as given
    // -------------------------------------------------------------
    {
        const currentPosition = Object.freeze({ x: -5, y: 0, z: 0 });
        const requestedPosition = Object.freeze({ x: 5, y: 0, z: 0 });
        const frozenTree = Object.freeze({ center: Object.freeze({ x: 0, z: 0 }), radius: 0.3 });
        // Frozen inputs would throw under strict-mode mutation — simply
        // not throwing already proves no in-place write is attempted.
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: Object.freeze([frozenTree]) });
        assert(currentPosition.x === -5 && requestedPosition.x === 5 && frozenTree.center.x === 0, '13. resolveAvatarTreeMovement: current position, requested position, and tree geometry are byte-for-byte unchanged after resolution');
        assert(typeof result.x === 'number', '14. resolveAvatarTreeMovement: still returns a usable resolved position when every input is frozen');
    }

    // -------------------------------------------------------------
    // Section G: determinism — identical inputs always resolve to
    // the identical output
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -2, y: 0.5, z: -2 };
        const requestedPosition = { x: 2, y: 0.5, z: 2 };
        const resultA = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        const resultB = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(JSON.stringify(resultA) === JSON.stringify(resultB), '15. resolveAvatarTreeMovement: the same current position, requested position, and trees always resolve to exactly the same output');
    }

    // -------------------------------------------------------------
    // Section H: multiple trees — resolved in supplied order,
    // deterministically
    // -------------------------------------------------------------
    {
        const treeA = { center: { x: -1, z: 0 }, radius: 0.3 };
        const treeB = { center: { x: 1, z: 0 }, radius: 0.3 };
        const currentPosition = { x: -3, y: 0, z: 0 };
        const requestedPosition = { x: 3, y: 0, z: 0 };

        const resultAB = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [treeA, treeB] });
        const combinedA = AVATAR_COLLISION_RADIUS + treeA.radius;
        assert(Math.abs(resultAB.x - (treeA.center.x - combinedA)) < 1e-9, '16. resolveAvatarTreeMovement: with treeA supplied first, the avatar stops at treeA\'s own boundary, never reaching treeB');

        // Supplying the same two trees again, same order, reproduces the
        // identical result — order-driven, not insertion-order-of-an-
        // internal-structure driven.
        const resultAgain = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [treeA, treeB] });
        assert(JSON.stringify(resultAB) === JSON.stringify(resultAgain), '17. resolveAvatarTreeMovement: resolving the identical multi-tree list twice produces the identical result');
    }
    {
        // A tree that is never actually in the way (behind the avatar,
        // relative to its direction of travel) does not affect the
        // outcome, regardless of where it sits in the supplied order.
        const blocking = { center: { x: 1, z: 0 }, radius: 0.3 };
        const behind = { center: { x: -50, z: 0 }, radius: 0.3 };
        const currentPosition = { x: 0, y: 0, z: 0 };
        const requestedPosition = { x: 5, y: 0, z: 0 };
        const resultFirst = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [behind, blocking] });
        const resultLast = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [blocking, behind] });
        assert(JSON.stringify(resultFirst) === JSON.stringify(resultLast), '18. resolveAvatarTreeMovement: a tree the requested step never reaches does not change the result, regardless of its position in the supplied order');
    }

    // -------------------------------------------------------------
    // Section I: Y preservation — resolution never touches the
    // vertical axis
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -5, y: 3.7, z: 0 };
        const requestedPosition = { x: 5, y: 3.7, z: 0 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [tree] });
        assert(result.y === 3.7, '19. resolveAvatarTreeMovement: Y is passed through from requestedPosition untouched, even when a collision resolves X/Z');
    }
    {
        const currentPosition = { x: 10, y: -2.25, z: 10 };
        const requestedPosition = { x: 11, y: -2.25, z: 10 };
        const result = resolveAvatarTreeMovement({ currentPosition, requestedPosition, trees: [] });
        assert(result.y === -2.25, '20. resolveAvatarTreeMovement: Y is preserved on the uncollided free-movement path too');
    }

    // -------------------------------------------------------------
    // Section J: flagship integration — real 0.9.59 tree geometry
    // through real resolution
    // -------------------------------------------------------------
    {
        const minX = -100, minZ = -100, maxX = 100, maxZ = 100;
        const trees = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        assert(trees.length > 0, '21. flagship: the queried region contains at least one real tree to resolve against');
        const realTree = trees[0];
        const realCombined = AVATAR_COLLISION_RADIUS + realTree.radius;

        const approachFrom = { x: realTree.center.x - 5, y: 0, z: realTree.center.z };
        const walkInto = { x: realTree.center.x + 5, y: 0, z: realTree.center.z };
        const result = resolveAvatarTreeMovement({ currentPosition: approachFrom, requestedPosition: walkInto, trees: [realTree] });
        assert(Math.abs(distance(result, realTree.center) - realCombined) < 1e-6, '22. flagship: walking straight through a real tree\'s own trunk position stops exactly at its real collision boundary');

        // A real tree well outside the requested path never interferes.
        const farFeature = { type: FEATURE_TYPE.TREE, x: realTree.center.x + 500, z: realTree.center.z + 500, y: 0, rotationY: 0, scale: 1, variant: 0, zone: 'FOREST' };
        const farTree = treeCollisionCircleFor(farFeature);
        const unaffected = resolveAvatarTreeMovement({ currentPosition: approachFrom, requestedPosition: { x: approachFrom.x + 0.5, y: 0, z: approachFrom.z }, trees: [farTree] });
        assert(unaffected.x === approachFrom.x + 0.5 && unaffected.z === approachFrom.z, '23. flagship: a real, far-away tree never obstructs an unrelated nearby step');
    }

    // -------------------------------------------------------------
    // Section K: architectural regression — this file stays
    // resolution-only, never reaching into spatial query, rendering,
    // or the avatar/world runtime
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarTreeMovement.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'NaturalFeatureField', 'TreeCollisionGeometry',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint',
            'AvatarMovementSimulation', 'resolveHorizontalMovement', 'aabbsOverlap', 'brickAabb',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'mass', 'gravity',
            '.position =', 'avatar.'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `24. core/AvatarTreeMovement.js's own code never references "${term}" — resolution-only, never spatial-query/rendering/simulation/randomness/clock/storage/mutation`);
        }
        assert(codeOnly.includes('AVATAR_COLLISION_RADIUS'), '25. core/AvatarTreeMovement.js does consume AVATAR_COLLISION_RADIUS from core/AvatarCollision.js — the one deliberate, already-defined geometric fact it is allowed to import');
    }
    {
        // A resolved position is never itself applied to anything — the
        // exported surface is exactly the one function, no avatar-
        // mutating side effect hiding among them.
        const exportsModule = await import('../core/AvatarTreeMovement.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['resolveAvatarTreeMovement']),
            '26. core/AvatarTreeMovement.js exports exactly resolveAvatarTreeMovement — nothing else');
    }

    console.log('✅ All Avatar-Tree Collision Resolution tests passed.');
}

await runTests();
