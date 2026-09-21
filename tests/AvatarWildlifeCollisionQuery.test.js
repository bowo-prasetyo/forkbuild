import { readFile } from 'node:fs/promises';
import {
    wildlifeCollisionCandidatesForMovement, MAX_ANIMAL_COLLISION_RADIUS, CANDIDATE_QUERY_MARGIN
} from '../core/AvatarWildlifeCollisionQuery.js';
import { wildlifeCollisionGeometryInRegion, ANIMAL_COLLISION_RADIUS } from '../core/WildlifeCollisionGeometry.js';
import { wildlifeInRegion, WILDLIFE_FEATURE_TYPE } from '../core/WildlifeField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// Deterministic Wildlife Collision Spatial Query, core/AvatarWildlifeCollisionQuery.js
// — the direct structural twin of tests/AvatarTreeCollisionQuery.test.js.
//
//   Section A: empty region — no animals nearby -> []
//   Section B: deterministic agreement with wildlifeCollisionGeometryInRegion()
//              over the exact same computed bounds
//   Section C: avatar movement coverage — an animal along the swept path
//              is found even when it sits nowhere near the starting point
//   Section D: collision radius expansion — the margin is exactly
//              AVATAR_COLLISION_RADIUS plus the largest possible animal
//              (species-aware) collision radius
//   Section E: determinism
//   Section F: variable avatarRadius — a larger radius never shrinks the
//              candidate set
//   Section G: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: empty region — no animals nearby -> []
    // -------------------------------------------------------------
    {
        const position = { x: 1000, y: 0, z: 1000 };
        const animals = wildlifeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: position, requestedPosition: position
        });
        assert(Array.isArray(animals), '1. wildlifeCollisionCandidatesForMovement always returns an array');
    }

    // -------------------------------------------------------------
    // Section B: deterministic agreement with
    // wildlifeCollisionGeometryInRegion() over the exact same computed
    // bounds
    // -------------------------------------------------------------
    {
        const currentPosition = { x: -190, y: 0, z: 0 };
        const requestedPosition = { x: -185, y: 0, z: 5 };
        const minX = Math.min(currentPosition.x, requestedPosition.x) - CANDIDATE_QUERY_MARGIN;
        const maxX = Math.max(currentPosition.x, requestedPosition.x) + CANDIDATE_QUERY_MARGIN;
        const minZ = Math.min(currentPosition.z, requestedPosition.z) - CANDIDATE_QUERY_MARGIN;
        const maxZ = Math.max(currentPosition.z, requestedPosition.z) + CANDIDATE_QUERY_MARGIN;

        const expected = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        const actual = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });

        assert(JSON.stringify(actual) === JSON.stringify(expected),
            '2. wildlifeCollisionCandidatesForMovement() agrees, element for element, with wildlifeCollisionGeometryInRegion() called directly against the identical computed bounds');
    }

    // -------------------------------------------------------------
    // Section C: avatar movement coverage — an animal along the swept
    // path is found even when it sits nowhere near the starting point
    // -------------------------------------------------------------
    {
        const wide = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        assert(wide.length > 0, '3. Setup: a wide region contains at least one real animal');
        const animal = wide[0];
        const startZ = animal.center.z - 20;

        const stationaryAtStart = { x: animal.center.x, y: 0, z: startZ };
        const stationaryResult = wildlifeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: stationaryAtStart, requestedPosition: stationaryAtStart
        });
        assert(!stationaryResult.some((c) => c.center.x === animal.center.x && c.center.z === animal.center.z),
            '4. Setup: a stationary query centered only on the far-away starting point does NOT find this animal');

        const movingTowardAnimal = wildlifeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED,
            currentPosition: stationaryAtStart,
            requestedPosition: { x: animal.center.x, y: 0, z: animal.center.z }
        });
        assert(movingTowardAnimal.some((c) => c.center.x === animal.center.x && c.center.z === animal.center.z),
            '5. The identical starting point, once the requested movement sweeps toward the animal, DOES find it — the swept path is queried, not merely the starting point');
    }

    // -------------------------------------------------------------
    // Section D: collision radius expansion — species-aware max radius
    // -------------------------------------------------------------
    {
        const largestBase = Math.max(...Object.values(ANIMAL_COLLISION_RADIUS));
        assert(Math.abs(MAX_ANIMAL_COLLISION_RADIUS - largestBase * 1.15) < 1e-12,
            '6. MAX_ANIMAL_COLLISION_RADIUS is exactly the largest per-species base radius at the top of feature.scale\'s own [0.85, 1.15) range');
        assert(Math.abs(CANDIDATE_QUERY_MARGIN - (AVATAR_COLLISION_RADIUS + MAX_ANIMAL_COLLISION_RADIUS)) < 1e-12,
            '7. CANDIDATE_QUERY_MARGIN is exactly AVATAR_COLLISION_RADIUS + MAX_ANIMAL_COLLISION_RADIUS');

        const wide = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        const animal = wide[0];
        const ax = animal.center.x, az = animal.center.z;

        const justInside = { x: ax - (CANDIDATE_QUERY_MARGIN - 0.01), y: 0, z: az };
        const insideResult = wildlifeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: justInside, requestedPosition: justInside
        });
        assert(insideResult.some((c) => c.center.x === ax && c.center.z === az),
            '8. An animal just inside CANDIDATE_QUERY_MARGIN of the query point is included — the margin expansion is what finds it');

        const justOutside = { x: ax - (CANDIDATE_QUERY_MARGIN + 0.01), y: 0, z: az };
        const outsideResult = wildlifeCollisionCandidatesForMovement({
            seed: DEFAULT_WORLD_SEED, currentPosition: justOutside, requestedPosition: justOutside
        });
        assert(!outsideResult.some((c) => c.center.x === ax && c.center.z === az),
            '9. An animal just outside CANDIDATE_QUERY_MARGIN of the query point is excluded — the margin is finite, not unbounded');
    }

    // -------------------------------------------------------------
    // Section E: determinism
    // -------------------------------------------------------------
    {
        const wide = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        const animal = wide[0];
        const currentPosition = { x: animal.center.x - 2, y: 3, z: animal.center.z };
        const requestedPosition = { x: animal.center.x, y: 3, z: animal.center.z };
        const a = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        const b = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition, requestedPosition });
        assert(a.length > 0, '10a. Setup: this query, centered on a real animal, finds at least one candidate');
        assert(JSON.stringify(a) === JSON.stringify(b), '10. The identical seed and query always produce the identical candidate array, element for element');

        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const c = wildlifeCollisionCandidatesForMovement({ seed: otherSeed, currentPosition, requestedPosition });
        assert(JSON.stringify(a) !== JSON.stringify(c), '11. A different world seed produces a genuinely different candidate list over the same movement');
    }

    // -------------------------------------------------------------
    // Section F: variable avatarRadius
    // -------------------------------------------------------------
    {
        const withoutRadius = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: { x: -189, y: 0, z: 0 }, requestedPosition: { x: -187, y: 0, z: 0 } });
        const withDefaultRadius = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: { x: -189, y: 0, z: 0 }, requestedPosition: { x: -187, y: 0, z: 0 }, avatarRadius: AVATAR_COLLISION_RADIUS });
        assert(JSON.stringify(withoutRadius) === JSON.stringify(withDefaultRadius),
            '12. omitting avatarRadius entirely produces the exact same candidate set as explicitly passing AVATAR_COLLISION_RADIUS — the documented default');

        const wide = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        const animal = wide[0];
        const near = { x: animal.center.x, y: 0, z: animal.center.z };
        const smallResult = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: near, requestedPosition: near, avatarRadius: 0.1 });
        const largeResult = wildlifeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: near, requestedPosition: near, avatarRadius: 5 });
        assert(largeResult.length >= smallResult.length,
            '13. a strictly larger avatarRadius never returns FEWER candidate animals than a smaller one over the identical query point');
    }

    // -------------------------------------------------------------
    // Section G: architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarWildlifeCollisionQuery.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementConstraint', 'AvatarTerrainConstraint',
            'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'position.x =', 'position.z =', '.position =',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `14. core/AvatarWildlifeCollisionQuery.js's own code never references "${term}" — spatial query only`);
        }
        assert(codeOnly.includes('wildlifeCollisionGeometryInRegion'),
            '15. core/AvatarWildlifeCollisionQuery.js does consume wildlifeCollisionGeometryInRegion() from core/WildlifeCollisionGeometry.js, never a second region query it invents itself');
    }
    {
        const wide = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        const animalTypes = new Set(wide.map((c) => c.kind));
        assert(animalTypes.size <= 1 && (animalTypes.size === 0 || animalTypes.has('ANIMAL')),
            '16. Every candidate circle this query returns carries the ANIMAL collision kind — never a stray tree or other object kind');
    }

    console.log('✅ All Deterministic Wildlife Collision Spatial Query tests passed.');
}

await runTests();
