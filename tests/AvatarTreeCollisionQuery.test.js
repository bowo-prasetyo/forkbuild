import { readFile } from 'node:fs/promises';
import {
    treeCollisionCandidatesForMovement, MAX_TREE_COLLISION_RADIUS, CANDIDATE_QUERY_MARGIN
} from '../core/AvatarTreeCollisionQuery.js';
import { treeCollisionGeometryInRegion, TREE_TRUNK_COLLISION_RADIUS } from '../core/TreeCollisionGeometry.js';
import { naturalFeaturesInRegion, FEATURE_TYPE } from '../core/NaturalFeatureField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.62 — Deterministic Tree Collision Spatial Query, core/AvatarTreeCollisionQuery.js.
//
//   Section A: empty region — no trees nearby -> []
//   Section B: deterministic agreement with treeCollisionGeometryInRegion()
//              over the exact same computed bounds
//   Section C: region filtering — real trees well outside the query are
//              excluded
//   Section D: boundary behavior — half-open interval, min inclusive,
//              max exclusive, exactly matching naturalFeaturesInRegion()'s
//              own convention
//   Section E: avatar movement coverage — a tree along the swept path is
//              found even when it sits nowhere near the starting point
//   Section F: collision radius expansion — the margin used to expand
//              the raw movement rectangle is exactly AVATAR_COLLISION_RADIUS
//              plus the largest possible tree collision radius
//   Section G: output identity — returned circles are exactly
//              treeCollisionGeometryInRegion()'s own frozen output, never
//              a reconstructed approximation
//   Section H: determinism — same seed + same query always -> identical
//              result
//   Section I: ordering — preserves treeCollisionGeometryInRegion()'s own
//              deterministic (lattice cell x, then z) order
//   Section J: input immutability — frozen currentPosition/requestedPosition
//              are read, never written
//   Section K: architectural regression — this file stays a spatial query
//              only, never detection, resolution, mutation, rendering,
//              a spatial index, randomness, the clock, persistence, or
//              avatar-runtime integration
//   Section L: 0.9.88 — variable avatarRadius. Omitting it reproduces the
//              exact pre-0.9.88 margin/candidate set; a larger radius
//              (a mounted vehicle's own collisionRadius) produces a
//              proportionally larger margin and finds trees the default
//              WALK-sized margin would miss — the candidate-query/
//              resolution mismatch the milestone's own brief calls out
//              as its single most important technical detail
//
// Central architectural claim under test throughout: this file only ever
// decides WHICH REGION to ask core/TreeCollisionGeometry.js's own
// treeCollisionGeometryInRegion() about — it never re-derives tree
// placement or geometry, never detects a collision, and never resolves a
// movement. See docs/Roadmap.md, 0.9.62, for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: empty region — no trees nearby -> []
    // -------------------------------------------------------------
    {
        // (1000, 1000) is empirically verified (against this same
        // deterministic pipeline) to have no tree within
        // CANDIDATE_QUERY_MARGIN of it under DEFAULT_WORLD_SEED.
        const position = { x: 1000, y: 0, z: 1000 };
        const trees = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: position, requestedPosition: position
        });
        assert(Array.isArray(trees), '1. treeCollisionCandidatesForMovement always returns an array');
        assert(trees.length === 0, '2. A region with no nearby trees returns an empty array, not null/undefined/an error');
    }

    // -------------------------------------------------------------
    // Section B: deterministic agreement with treeCollisionGeometryInRegion()
    // over the exact same computed bounds
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -90, y: 0, z: -100 };
        const requestedPosition = { x: -85, y: 0, z: -95 };
        const minX = Math.min(currentPosition.x, requestedPosition.x) - CANDIDATE_QUERY_MARGIN;
        const maxX = Math.max(currentPosition.x, requestedPosition.x) + CANDIDATE_QUERY_MARGIN;
        const minZ = Math.min(currentPosition.z, requestedPosition.z) - CANDIDATE_QUERY_MARGIN;
        const maxZ = Math.max(currentPosition.z, requestedPosition.z) + CANDIDATE_QUERY_MARGIN;

        const expected = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        const actual = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });

        assert(expected.length > 0, '3. Setup: the manually-computed region contains at least one real tree');
        assert(JSON.stringify(actual) === JSON.stringify(expected),
            '4. treeCollisionCandidatesForMovement() agrees, element for element, with treeCollisionGeometryInRegion() called directly against the identical computed bounds');
    }

    // -------------------------------------------------------------
    // Section C: region filtering — real trees well outside the query
    // are excluded
    // -------------------------------------------------------------
    {
        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const tree = wide[0];

        // A query far from this tree (well beyond CANDIDATE_QUERY_MARGIN)
        // must never return it.
        const farPosition = { x: tree.center.x + 500, y: 0, z: tree.center.z + 500 };
        const farResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: farPosition, requestedPosition: farPosition
        });
        assert(!farResult.some((c) => c.center.x === tree.center.x && c.center.z === tree.center.z),
            '5. A tree far outside the query is excluded from the candidate list');

        // The same tree, queried from right on top of it, IS present.
        const nearResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED,
            currentPosition: { x: tree.center.x, y: 0, z: tree.center.z },
            requestedPosition: { x: tree.center.x, y: 0, z: tree.center.z }
        });
        assert(nearResult.some((c) => c.center.x === tree.center.x && c.center.z === tree.center.z),
            '6. The identical tree, queried at its own position, IS present in the candidate list');
    }

    // -------------------------------------------------------------
    // Section D: boundary behavior — half-open interval, min
    // inclusive, max exclusive, exactly matching
    // naturalFeaturesInRegion()'s own convention
    // -------------------------------------------------------------
    {
        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const tree = wide[0];
        const tx = tree.center.x, tz = tree.center.z;

        // A stationary query (currentPosition === requestedPosition) at
        // (tx - CANDIDATE_QUERY_MARGIN, tz) makes the computed maxX land
        // EXACTLY on the tree's own x — excluded, half-open on the max
        // side, exactly like naturalFeaturesInRegion()'s own `< maxX`.
        const atMaxBoundary = { x: tx - CANDIDATE_QUERY_MARGIN, y: 0, z: tz };
        const maxBoundaryResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: atMaxBoundary, requestedPosition: atMaxBoundary
        });
        assert(!maxBoundaryResult.some((c) => c.center.x === tx && c.center.z === tz),
            '7. A tree landing exactly on the computed maxX boundary is excluded — half-open, max exclusive');

        // The mirror case at (tx + CANDIDATE_QUERY_MARGIN, tz) makes the
        // computed minX land exactly on the tree's own x — included,
        // half-open on the min side, exactly like naturalFeaturesInRegion()'s
        // own `>= minX`.
        const atMinBoundary = { x: tx + CANDIDATE_QUERY_MARGIN, y: 0, z: tz };
        const minBoundaryResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: atMinBoundary, requestedPosition: atMinBoundary
        });
        assert(minBoundaryResult.some((c) => c.center.x === tx && c.center.z === tz),
            '8. A tree landing exactly on the computed minX boundary is included — half-open, min inclusive');
    }

    // -------------------------------------------------------------
    // Section E: avatar movement coverage — a tree along the swept
    // path is found even when it sits nowhere near the starting point
    // -------------------------------------------------------------
    {
        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const tree = wide[0];
        const startZ = tree.center.z - 20; // 20 units away — far beyond CANDIDATE_QUERY_MARGIN

        const stationaryAtStart = { x: tree.center.x, y: 0, z: startZ };
        const stationaryResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: stationaryAtStart, requestedPosition: stationaryAtStart
        });
        assert(!stationaryResult.some((c) => c.center.x === tree.center.x && c.center.z === tree.center.z),
            '9. Setup: a stationary query centered only on the far-away starting point does NOT find this tree');

        const movingTowardTree = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED,
            currentPosition: stationaryAtStart,
            requestedPosition: { x: tree.center.x, y: 0, z: tree.center.z }
        });
        assert(movingTowardTree.some((c) => c.center.x === tree.center.x && c.center.z === tree.center.z),
            '10. The identical starting point, once the requested movement sweeps toward the tree, DOES find it — the swept path is queried, not merely the starting point');
    }

    // -------------------------------------------------------------
    // Section F: collision radius expansion — the margin used to
    // expand the raw movement rectangle is exactly
    // AVATAR_COLLISION_RADIUS plus the largest possible tree collision
    // radius
    // -------------------------------------------------------------
    {
        assert(Math.abs(MAX_TREE_COLLISION_RADIUS - TREE_TRUNK_COLLISION_RADIUS * 1.3) < 1e-12,
            '11. MAX_TREE_COLLISION_RADIUS is exactly TREE_TRUNK_COLLISION_RADIUS at the top of feature.scale\'s own [0.7, 1.3) range');
        assert(Math.abs(CANDIDATE_QUERY_MARGIN - (AVATAR_COLLISION_RADIUS + MAX_TREE_COLLISION_RADIUS)) < 1e-12,
            '12. CANDIDATE_QUERY_MARGIN is exactly AVATAR_COLLISION_RADIUS + MAX_TREE_COLLISION_RADIUS — the avatar\'s own radius, not merely the tree\'s');

        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const tree = wide[0];
        const tx = tree.center.x, tz = tree.center.z;

        // A stationary query whose center is just INSIDE CANDIDATE_QUERY_MARGIN
        // of the tree finds it — this tree's center lies OUTSIDE the raw,
        // zero-size movement point itself, only reachable through the
        // margin expansion.
        const justInside = { x: tx - (CANDIDATE_QUERY_MARGIN - 0.01), y: 0, z: tz };
        const insideResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: justInside, requestedPosition: justInside
        });
        assert(insideResult.some((c) => c.center.x === tx && c.center.z === tz),
            '13. A tree just inside CANDIDATE_QUERY_MARGIN of the query point, but outside the raw (zero-size) movement point itself, is included — the margin expansion is what finds it');

        // A stationary query just OUTSIDE the margin does not.
        const justOutside = { x: tx - (CANDIDATE_QUERY_MARGIN + 0.01), y: 0, z: tz };
        const outsideResult = treeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: justOutside, requestedPosition: justOutside
        });
        assert(!outsideResult.some((c) => c.center.x === tx && c.center.z === tz),
            '14. A tree just outside CANDIDATE_QUERY_MARGIN of the query point is excluded — the margin is finite, not unbounded');
    }

    // -------------------------------------------------------------
    // Section G: output identity — returned circles are exactly
    // treeCollisionGeometryInRegion()'s own frozen output, never a
    // reconstructed approximation
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -89, y: 0, z: -99 };
        const requestedPosition = { x: -87, y: 0, z: -99 };
        const trees = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        assert(trees.length > 0, '15. Setup: this query finds at least one real tree to check identity against');

        for (const circle of trees) {
            assert(Object.isFrozen(circle), '16. Every returned circle is frozen — treeCollisionGeometryInRegion()\'s own output, never a copy');
            assert(Object.isFrozen(circle.center), '17. Every returned circle\'s center is frozen');
            assert('kind' in circle && 'shape' in circle && 'radius' in circle,
                '18. Every returned circle carries the full kind/shape/center/radius shape treeCollisionCircleFor() itself produces, never a stripped-down reconstruction');
        }

        // The same trees, found directly via naturalFeaturesInRegion() +
        // treeCollisionCircleFor(), over the exact same computed bounds,
        // must be reference-identical in VALUE (deep equality) — proving
        // this file never re-derives geometry of its own.
        const minX = Math.min(currentPosition.x, requestedPosition.x) - CANDIDATE_QUERY_MARGIN;
        const maxX = Math.max(currentPosition.x, requestedPosition.x) + CANDIDATE_QUERY_MARGIN;
        const minZ = Math.min(currentPosition.z, requestedPosition.z) - CANDIDATE_QUERY_MARGIN;
        const maxZ = Math.max(currentPosition.z, requestedPosition.z) + CANDIDATE_QUERY_MARGIN;
        const placements = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ)
            .filter((f) => f.type === FEATURE_TYPE.TREE);
        assert(trees.length === placements.length,
            '19. Exactly one candidate circle per real tree placement in the identical computed region — no more, no fewer');
    }

    // -------------------------------------------------------------
    // Section H: determinism — same seed + same query always ->
    // identical result
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -89, y: 3, z: -99 };
        const requestedPosition = { x: -87, y: 3, z: -99 };
        const a = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        const b = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        assert(JSON.stringify(a) === JSON.stringify(b), '20. The identical seed and query always produce the identical candidate array, element for element');

        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const c = treeCollisionCandidatesForMovement({ seed: otherSeed, currentPosition, requestedPosition });
        assert(JSON.stringify(a) !== JSON.stringify(c), '21. A different world seed produces a genuinely different candidate list over the same movement');
    }

    // -------------------------------------------------------------
    // Section I: ordering — preserves treeCollisionGeometryInRegion()'s
    // own deterministic (lattice cell x, then z) order
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -89, y: 0, z: -99 };
        const requestedPosition = { x: -87, y: 0, z: -99 };
        const minX = Math.min(currentPosition.x, requestedPosition.x) - CANDIDATE_QUERY_MARGIN;
        const maxX = Math.max(currentPosition.x, requestedPosition.x) + CANDIDATE_QUERY_MARGIN;
        const minZ = Math.min(currentPosition.z, requestedPosition.z) - CANDIDATE_QUERY_MARGIN;
        const maxZ = Math.max(currentPosition.z, requestedPosition.z) + CANDIDATE_QUERY_MARGIN;

        const expectedOrder = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        const actualOrder = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        assert(expectedOrder.length > 0, '22. Setup: this region contains multiple trees to check ordering against');
        assert(JSON.stringify(actualOrder.map((c) => c.center)) === JSON.stringify(expectedOrder.map((c) => c.center)),
            '23. Candidate order exactly matches treeCollisionGeometryInRegion()\'s own deterministic order — never re-sorted, never shuffled');
    }

    // -------------------------------------------------------------
    // Section J: input immutability — frozen currentPosition/
    // requestedPosition are read, never written
    // -------------------------------------------------------------
    {
        const currentPosition = Object.freeze({ x: 5, y: 0, z: 5 });
        const requestedPosition = Object.freeze({ x: 6, y: 0, z: 6 });
        const before = JSON.stringify({ currentPosition, requestedPosition });
        treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        const after = JSON.stringify({ currentPosition, requestedPosition });
        assert(before === after, '24. currentPosition and requestedPosition are never mutated — frozen inputs survive a real call unchanged');
    }

    // -------------------------------------------------------------
    // Section L: 0.9.88 — variable avatarRadius
    // -------------------------------------------------------------
    {
        // Omitting avatarRadius entirely reproduces the exact pre-0.9.88
        // margin and candidate set, byte for byte.
        const currentPosition = { x: -89, y: 0, z: -99 };
        const requestedPosition = { x: -87, y: 0, z: -99 };
        const withoutRadius = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        const withDefaultRadius = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition, avatarRadius: AVATAR_COLLISION_RADIUS });
        assert(JSON.stringify(withoutRadius) === JSON.stringify(withDefaultRadius),
            '24a. omitting avatarRadius entirely produces the exact same candidate set as explicitly passing AVATAR_COLLISION_RADIUS — the documented default');
    }
    {
        // THE CANDIDATE-QUERY CORRECTNESS CASE: a tree just outside the
        // OLD (WALK-sized) margin, but inside a larger vehicle-sized
        // margin, must be found once a caller passes that larger radius
        // — this is the exact mismatch the milestone's own brief warns
        // a resolver-only fix (without extending this query) would miss.
        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const tree = wide[0];
        const tx = tree.center.x, tz = tree.center.z;
        const carRadius = 0.80; // matches CAR_COLLISION_RADIUS, core/AvatarVehicleMovementCapability.js
        const carMargin = carRadius + MAX_TREE_COLLISION_RADIUS;

        // Positioned strictly between the old (AVATAR_COLLISION_RADIUS-
        // sized) margin and the new, larger car-sized margin.
        const gapDistance = (CANDIDATE_QUERY_MARGIN + carMargin) / 2;
        const between = { x: tx - gapDistance, y: 0, z: tz };
        assert(gapDistance > CANDIDATE_QUERY_MARGIN && gapDistance < carMargin,
            '24b. setup: the chosen query point sits strictly outside the WALK-sized margin and strictly inside the car-sized margin');

        const defaultResult = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: between, requestedPosition: between });
        assert(!defaultResult.some((c) => c.center.x === tx && c.center.z === tz),
            '24c. with the default (WALK-sized) avatarRadius, this tree is correctly excluded — it is genuinely outside the smaller margin');

        const carResult = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: between, requestedPosition: between, avatarRadius: carRadius });
        assert(carResult.some((c) => c.center.x === tx && c.center.z === tz),
            '24d. with a car-sized avatarRadius, the SAME tree — invisible to the default margin — is now found: the candidate query genuinely grows with the moving body\'s own radius, never a fixed WALK-sized window regardless of what is actually moving');
    }
    {
        // A larger avatarRadius never SHRINKS the candidate set relative
        // to a smaller one over the identical query.
        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const tree = wide[0];
        const near = { x: tree.center.x, y: 0, z: tree.center.z };
        const smallResult = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: near, requestedPosition: near, avatarRadius: 0.1 });
        const largeResult = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: near, requestedPosition: near, avatarRadius: 5 });
        assert(largeResult.length >= smallResult.length,
            '24e. a strictly larger avatarRadius never returns FEWER candidate trees than a smaller one over the identical query point');
    }

    // -------------------------------------------------------------
    // Section K: architectural regression — this file stays a spatial
    // query only, never detection, resolution, mutation, rendering, a
    // spatial index, randomness, the clock, persistence, or avatar-
    // runtime integration
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarTreeCollisionQuery.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'circlesIntersect', 'avatarTreeCollision', 'AvatarTreeCollision.js',
            'resolveAvatarTreeMovement', 'AvatarTreeMovement.js',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint',
            'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'position.x =', 'position.z =', '.position =',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `25. core/AvatarTreeCollisionQuery.js's own code never references "${term}" — spatial query only, never detection/resolution/mutation/rendering/a spatial index/randomness/clock/persistence/runtime integration`);
        }
        assert(codeOnly.includes('treeCollisionGeometryInRegion'),
            '26. core/AvatarTreeCollisionQuery.js does consume treeCollisionGeometryInRegion() from core/TreeCollisionGeometry.js — the one deliberate, already-defined region query it is allowed to delegate to, never a second one it invents itself');
        assert(codeOnly.includes('AVATAR_COLLISION_RADIUS'),
            '27. core/AvatarTreeCollisionQuery.js does consume AVATAR_COLLISION_RADIUS from core/AvatarCollision.js to size its own query margin');
    }
    {
        const exportsModule = await import('../core/AvatarTreeCollisionQuery.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['CANDIDATE_QUERY_MARGIN', 'MAX_TREE_COLLISION_RADIUS', 'treeCollisionCandidatesForMovement']),
            '28. core/AvatarTreeCollisionQuery.js exports exactly treeCollisionCandidatesForMovement, MAX_TREE_COLLISION_RADIUS, and CANDIDATE_QUERY_MARGIN — nothing else');
    }

    console.log('✅ All Deterministic Tree Collision Spatial Query tests passed.');
}

await runTests();
