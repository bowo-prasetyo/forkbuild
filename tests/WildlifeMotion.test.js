import { wildlifeInRegion, WILDLIFE_LATTICE_SPACING, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { animalPoseAt, wildlifeInRegionAt, ANIMAL_MOTION, MAX_WANDER_DISTANCE } from '../core/WildlifeMotion.js';
import { ecologyZoneAt } from '../core/TerrainEcology.js';
import { isRiverAt } from '../core/Hydrology.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { assert } from './support/Assert.js';

// Deterministic wildlife motion, core/WildlifeMotion.js.
//
//   Section A: determinism and well-formed poses
//   Section B: an animal wanders, but never leaves its cell or wander radius
//   Section C: motion is continuous — no jumps in position or heading
//   Section D: a standing animal stands on valid ground (its own zone, no river)
//   Section E: wildlifeInRegionAt() — current positions, placed positions
//              without a clock, and tile-aligned regions still partition
//              the world while animals move

const SEED = DEFAULT_WORLD_SEED;
// A fixed wall-clock moment, so every run tests the same stretch of time.
const T0 = 1_759_000_000;

// A good spread of real animals, both species.
const ANIMALS = wildlifeInRegion(SEED, -1200, -1200, 1200, 1200);

function angleDelta(a, b) {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
}

function runTests() {
    assert(ANIMALS.some((a) => a.species === ANIMAL_SPECIES.DEER) && ANIMALS.some((a) => a.species === ANIMAL_SPECIES.RABBIT),
        '0. Setup: the sample holds both deer and rabbits');

    // -------------------------------------------------------------
    // Section A — determinism and well-formed poses
    // -------------------------------------------------------------
    {
        for (const animal of ANIMALS.slice(0, 40)) {
            const a = animalPoseAt(SEED, animal, T0 + 12.345);
            const b = animalPoseAt(SEED, animal, T0 + 12.345);
            assert(JSON.stringify(a) === JSON.stringify(b), '1. The same animal at the same moment always has the exact same pose');
            assert(a.y === terrainHeightAt(SEED, a.x, a.z), '2. A pose stands exactly on the terrain under it');
            assert(a.rotationY >= 0 && a.rotationY < Math.PI * 2, '3. rotationY stays within one full turn');
            assert(typeof a.moving === 'boolean', '4. moving is a boolean');
        }
        let threw = false;
        try {
            animalPoseAt(SEED, ANIMALS[0], NaN);
        } catch {
            threw = true;
        }
        assert(threw, '5. animalPoseAt() refuses a non-finite time rather than returning a NaN pose');
        assert(MAX_WANDER_DISTANCE === Math.max(...Object.values(ANIMAL_MOTION).map((m) => m.wanderRadius)),
            '6. MAX_WANDER_DISTANCE is the largest wander radius of any species');
        for (const motion of Object.values(ANIMAL_MOTION)) {
            assert(motion.segmentSeconds > (2 * motion.wanderRadius) / motion.walkSpeed,
                '7. Every species\' segment is long enough for its longest possible walk');
        }
    }

    // -------------------------------------------------------------
    // Sections B, C and D — one sweep over two minutes at 30 fps
    // -------------------------------------------------------------
    {
        const STEP = 1 / 30;
        let movedAway = 0;
        let sawMoving = false;
        let sawStanding = false;
        let maxJump = 0;
        let maxTurn = 0;
        let maxAllowedJump = 0;
        for (const animal of ANIMALS.slice(0, 60)) {
            const motion = ANIMAL_MOTION[animal.species];
            // An eased walk peaks at 1.5x its average speed.
            maxAllowedJump = Math.max(maxAllowedJump, motion.walkSpeed * 1.5 * STEP);
            const cellX = Math.floor(animal.x / WILDLIFE_LATTICE_SPACING);
            const cellZ = Math.floor(animal.z / WILDLIFE_LATTICE_SPACING);
            let previous = animalPoseAt(SEED, animal, T0);
            let farthest = 0;
            for (let i = 1; i <= 120 * 30; i++) {
                const pose = animalPoseAt(SEED, animal, T0 + i * STEP);
                assert(Math.floor(pose.x / WILDLIFE_LATTICE_SPACING) === cellX && Math.floor(pose.z / WILDLIFE_LATTICE_SPACING) === cellZ,
                    '8. An animal never leaves the lattice cell it was placed in');
                const distance = Math.hypot(pose.x - animal.x, pose.z - animal.z);
                assert(distance <= motion.wanderRadius + 1e-9, '9. An animal never strays beyond its species\' wander radius');
                farthest = Math.max(farthest, distance);
                maxJump = Math.max(maxJump, Math.hypot(pose.x - previous.x, pose.z - previous.z));
                maxTurn = Math.max(maxTurn, angleDelta(pose.rotationY, previous.rotationY));
                if (pose.moving) {
                    sawMoving = true;
                } else {
                    sawStanding = true;
                    assert(ecologyZoneAt(SEED, pose.x, pose.z) === animal.zone,
                        '16. A standing animal always stands in its own ecology zone');
                    assert(!isRiverAt(SEED, pose.x, pose.z), '17. A standing animal never stands in a river channel');
                }
                previous = pose;
            }
            if (farthest > 0.5) movedAway++;
        }
        assert(movedAway > 30, `10. Most animals genuinely wander over two minutes (${movedAway} of 60 moved more than half a unit)`);
        assert(sawMoving && sawStanding, '11. Animals both walk and stand still');
        assert(maxJump <= maxAllowedJump + 1e-9, `12. Position is continuous: no frame moves an animal faster than its eased walk allows (max ${maxJump.toFixed(4)})`);
        // A turn of at most π over TURN_SECONDS (0.8 s), eased, peaks near
        // 5.9 rad/s: about 0.2 rad per 30 fps frame.
        assert(maxTurn < 0.25, `13. Heading is continuous: an animal turns, it never snaps round (max ${maxTurn.toFixed(3)} rad per frame)`);
    }
    {
        // Two replicas that agree on the clock agree on every animal,
        // however they got there — a pose is never replayed from earlier ones.
        const animal = ANIMALS[5];
        const direct = animalPoseAt(SEED, animal, T0 + 86_400);
        let stepped = null;
        for (let t = T0; t <= T0 + 86_400; t += 3_600) stepped = animalPoseAt(SEED, animal, t);
        assert(JSON.stringify(direct) === JSON.stringify(stepped), '14. A pose depends only on the moment, never on which moments were asked about before');
        const otherSeed = SEED ^ 0x5bd1e995;
        const moved = ANIMALS.slice(0, 20).some((a) => {
            const here = animalPoseAt(SEED, a, T0 + 30);
            const there = animalPoseAt(otherSeed, a, T0 + 30);
            return here.x !== there.x || here.z !== there.z;
        });
        assert(moved, '15. A different world seed gives the same animal a different path');
    }

    // -------------------------------------------------------------
    // Section E — wildlifeInRegionAt()
    // -------------------------------------------------------------
    {
        const placed = wildlifeInRegion(SEED, -400, -400, 400, 400);
        const unclocked = wildlifeInRegionAt(SEED, -400, -400, 400, 400);
        assert(unclocked.length === placed.length && unclocked.every((a, i) => a.id === placed[i].id && a.x === placed[i].x && a.z === placed[i].z),
            '18. Without a clock, wildlifeInRegionAt() returns every animal at its placed position');
        assert(unclocked.every((a) => a.moving === false && a.spawnX === a.x && a.spawnZ === a.z),
            '19. ...standing, with spawnX/spawnZ equal to its position');

        const t = T0 + 77.7;
        const now = wildlifeInRegionAt(SEED, -400, -400, 400, 400, t);
        // Placed records, looking far enough out to include animals placed
        // just outside the region that have wandered in.
        const placedWide = wildlifeInRegion(SEED, -410, -410, 410, 410);
        for (const animal of now) {
            assert(animal.x >= -400 && animal.x < 400 && animal.z >= -400 && animal.z < 400,
                '20. Every animal returned is inside the region where it is NOW');
            const record = placedWide.find((p) => p.id === animal.id);
            const pose = animalPoseAt(SEED, record, t);
            assert(record.x === animal.spawnX && record.z === animal.spawnZ && pose.x === animal.x && pose.z === animal.z && pose.rotationY === animal.rotationY,
                '21. ...at exactly the pose animalPoseAt() gives its placed record, with that record\'s position as spawnX/spawnZ');
        }
        for (let i = 1; i < now.length; i++) {
            assert(now[i - 1].x < now[i].x || (now[i - 1].x === now[i].x && now[i - 1].z <= now[i].z), '22. Results are sorted by x, then z');
        }

        // Tile-aligned regions still partition the world at any moment:
        // every animal is found by exactly one tile, the one it is in now.
        const byTiles = [];
        for (let tx = -10; tx < 10; tx++) {
            for (let tz = -10; tz < 10; tz++) {
                const minX = tx * TERRAIN_TILE_SIZE;
                const minZ = tz * TERRAIN_TILE_SIZE;
                byTiles.push(...wildlifeInRegionAt(SEED, minX, minZ, minX + TERRAIN_TILE_SIZE, minZ + TERRAIN_TILE_SIZE, t));
            }
        }
        const ids = byTiles.map((a) => a.id);
        assert(new Set(ids).size === ids.length, '23. No animal is found by two tiles at once');
        assert(ids.length === now.length && now.every((a) => ids.includes(a.id)), '24. No animal is missed by the tiles either');
    }
    {
        // An animal placed just outside a region can have walked into it: a
        // region hugging one animal's current spot finds it wherever it is.
        const animal = ANIMALS.find((a) => {
            const pose = animalPoseAt(SEED, a, T0 + 40);
            return Math.hypot(pose.x - a.x, pose.z - a.z) > 1;
        });
        assert(animal !== undefined, '25. Setup: some animal has walked more than a unit from its spawn point');
        const pose = animalPoseAt(SEED, animal, T0 + 40);
        const found = wildlifeInRegionAt(SEED, pose.x - 0.25, pose.z - 0.25, pose.x + 0.25, pose.z + 0.25, T0 + 40);
        assert(found.some((a) => a.id === animal.id), '26. A small region around where an animal is now finds it, not around where it was placed');
        const atSpawn = wildlifeInRegionAt(SEED, animal.x - 0.25, animal.z - 0.25, animal.x + 0.25, animal.z + 0.25, T0 + 40);
        assert(!atSpawn.some((a) => a.id === animal.id), '27. ...and a small region around its empty spawn point does not');
    }

    console.log('✅ All Wildlife Motion tests passed.');
}

runTests();
