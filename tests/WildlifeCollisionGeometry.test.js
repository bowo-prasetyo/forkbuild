import { readFile } from 'node:fs/promises';
import {
    animalCollisionCircleFor, wildlifeCollisionGeometryInRegion,
    COLLISION_OBJECT_KIND, COLLISION_SHAPE, ANIMAL_COLLISION_RADIUS
} from '../core/WildlifeCollisionGeometry.js';
import { wildlifeInRegion, WILDLIFE_FEATURE_TYPE, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// Deterministic World Animal Collision Geometry, core/WildlifeCollisionGeometry.js
// — the direct structural twin of tests/TreeCollisionGeometry.test.js,
// applied to core/WildlifeField.js's own animal placement.
//
//   Section A: animalCollisionCircleFor() — per-animal, PER-SPECIES geometry derivation
//   Section B: wildlifeCollisionGeometryInRegion() — determinism and
//              agreement with wildlifeInRegion()'s own placement
//   Section C: proportionality — radius scales with feature.scale, per species
//   Section D: architectural regression — this file never reaches into
//              movement, detection, response, or rendering

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: animalCollisionCircleFor() — per-animal, per-species
    // geometry derivation
    // -------------------------------------------------------------
    {
        const deer = { type: WILDLIFE_FEATURE_TYPE.ANIMAL, x: 12.5, z: -7.25, y: 3, rotationY: 1.2, scale: 1, variant: 0, species: ANIMAL_SPECIES.DEER, zone: 'FOREST' };
        const circle = animalCollisionCircleFor(deer);
        assert(circle.kind === COLLISION_OBJECT_KIND.ANIMAL, '1. animalCollisionCircleFor: kind is ANIMAL');
        assert(circle.shape === COLLISION_SHAPE.CIRCLE, '2. animalCollisionCircleFor: shape is CIRCLE');
        assert(circle.center.x === deer.x && circle.center.z === deer.z,
            '3. animalCollisionCircleFor: center matches the feature\'s own x/z exactly');
        assert(circle.radius === ANIMAL_COLLISION_RADIUS.DEER, '4. animalCollisionCircleFor: at scale 1, a deer\'s radius equals its own base collision radius exactly');
        assert(!('y' in circle.center), '5. animalCollisionCircleFor: center is purely horizontal (x/z)');
    }
    {
        // Species selects a genuinely different base radius — the entire
        // reason this file exists rather than reusing a single shared
        // constant the way trees do.
        const rabbit = { type: WILDLIFE_FEATURE_TYPE.ANIMAL, x: 0, z: 0, y: 0, rotationY: 0, scale: 1, variant: 0, species: ANIMAL_SPECIES.RABBIT, zone: 'GRASSLAND' };
        const circle = animalCollisionCircleFor(rabbit);
        assert(circle.radius === ANIMAL_COLLISION_RADIUS.RABBIT, '6. animalCollisionCircleFor: at scale 1, a rabbit\'s radius equals its own base collision radius exactly');
        assert(ANIMAL_COLLISION_RADIUS.DEER > ANIMAL_COLLISION_RADIUS.RABBIT,
            '7. animalCollisionCircleFor: a deer\'s own base radius is strictly larger than a rabbit\'s own — the two species genuinely differ');
    }
    {
        const feature = { type: WILDLIFE_FEATURE_TYPE.ANIMAL, x: 0, z: 0, y: 0, rotationY: 0, scale: 1, variant: 0, species: ANIMAL_SPECIES.DEER, zone: 'FOREST' };
        const circle = animalCollisionCircleFor(feature);
        assert(Object.isFrozen(circle), '8. animalCollisionCircleFor: the returned circle is frozen');
        assert(Object.isFrozen(circle.center), '9. animalCollisionCircleFor: the returned center is frozen');
    }

    // -------------------------------------------------------------
    // Section B: wildlifeCollisionGeometryInRegion() — determinism and
    // agreement with wildlifeInRegion()'s own placement
    // -------------------------------------------------------------
    {
        const a = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        const b = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        assert(JSON.stringify(a) === JSON.stringify(b), '10. Same seed + same region always produces the exact same collision geometry ARRAY, element for element');
        assert(a.length > 0, '11. A large region always yields at least one animal\'s collision geometry');
    }
    {
        const minX = -300, minZ = -300, maxX = 300, maxZ = 300;
        const placements = wildlifeInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ)
            .filter((f) => f.type === WILDLIFE_FEATURE_TYPE.ANIMAL);
        const circles = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        assert(circles.length === placements.length, '12. wildlifeCollisionGeometryInRegion: exactly one circle per animal placement, no more, no fewer');
        for (let i = 0; i < placements.length; i++) {
            assert(circles[i].center.x === placements[i].x && circles[i].center.z === placements[i].z,
                `13. Circle ${i} sits exactly on its own animal's placement — same order, same coordinates`);
        }
    }
    {
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        const a = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        const c = wildlifeCollisionGeometryInRegion(otherSeed, -300, -300, 300, 300);
        assert(JSON.stringify(a) !== JSON.stringify(c), '14. A different world seed produces genuinely different animal collision geometry over the same region');
    }
    {
        const minX = 0, minZ = 0, maxX = 100, maxZ = 100;
        const circles = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, minX, minZ, maxX, maxZ);
        for (const circle of circles) {
            assert(circle.center.x >= minX && circle.center.x < maxX && circle.center.z >= minZ && circle.center.z < maxZ,
                `15. Circle at (${circle.center.x}, ${circle.center.z}) falls strictly within the queried region`);
        }
    }

    // -------------------------------------------------------------
    // Section C: proportionality — radius scales with feature.scale,
    // per species
    // -------------------------------------------------------------
    {
        const small = animalCollisionCircleFor({ type: WILDLIFE_FEATURE_TYPE.ANIMAL, x: 0, z: 0, y: 0, rotationY: 0, scale: 0.85, variant: 0, species: ANIMAL_SPECIES.DEER, zone: 'FOREST' });
        const large = animalCollisionCircleFor({ type: WILDLIFE_FEATURE_TYPE.ANIMAL, x: 0, z: 0, y: 0, rotationY: 0, scale: 1.15, variant: 0, species: ANIMAL_SPECIES.DEER, zone: 'FOREST' });
        assert(Math.abs(small.radius - ANIMAL_COLLISION_RADIUS.DEER * 0.85) < 1e-9, '16. A smaller deer (scale 0.85) gets a proportionally smaller hitbox');
        assert(Math.abs(large.radius - ANIMAL_COLLISION_RADIUS.DEER * 1.15) < 1e-9, '17. A larger deer (scale 1.15) gets a proportionally larger hitbox');
        assert(large.radius > small.radius, '18. A visually larger animal never gets a smaller or equal hitbox than a visually smaller one');
    }
    {
        const circles = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
        assert(circles.length > 0, '19. A large region yields real animals to check proportionality against');
        for (const circle of circles) {
            assert(circle.radius > 0, '20. Every circle has a strictly positive radius');
        }
    }

    // -------------------------------------------------------------
    // Section D: architectural regression — this file never reaches
    // into movement, detection, response, or rendering
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/WildlifeCollisionGeometry.js', import.meta.url);
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
            assert(!codeOnly.includes(term), `21. core/WildlifeCollisionGeometry.js's own code never references "${term}" — geometry only, never movement/detection/response/rendering/persistence`);
        }
    }
    {
        assert(Object.keys(COLLISION_OBJECT_KIND).length === 1 && COLLISION_OBJECT_KIND.ANIMAL === 'ANIMAL',
            '22. COLLISION_OBJECT_KIND has exactly one member (ANIMAL) this file');
        assert(Object.keys(COLLISION_SHAPE).length === 1 && COLLISION_SHAPE.CIRCLE === 'CIRCLE',
            '23. COLLISION_SHAPE has exactly one member (CIRCLE) this file');
        assert(Object.isFrozen(COLLISION_OBJECT_KIND) && Object.isFrozen(COLLISION_SHAPE) && Object.isFrozen(ANIMAL_COLLISION_RADIUS),
            '24. All three vocabularies are frozen, matching every other classification enum in this codebase');
    }

    console.log('✅ All Deterministic World Animal Collision Geometry tests passed.');
}

await runTests();
