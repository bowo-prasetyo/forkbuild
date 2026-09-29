import * as THREE from 'three';
import { wildlifeInRegion, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { animalPoseAt, IDLE_ACTION } from '../core/WildlifeMotion.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { gaitOffsetsAt, ANIMAL_GAIT, REST_GAIT } from '../renderer/AnimalGait.js';
import { buildWildlifeTileMesh, updateWildlifeTileMesh } from '../renderer/WildlifeTileMesh.js';
import { assert } from './support/Assert.js';

// Walk animation, renderer/AnimalGait.js and its use in
// renderer/WildlifeTileMesh.js.
//
//   Section A: offsets — rest between strides, the shape of a hop and a step
//   Section B: continuity over real walks — no pops at 60 fps
//   Section C: the tile applies the gait — lifted, pitched body and a head
//              that nods about its neck; at rest the head rides the body

const SEED = DEFAULT_WORLD_SEED;
const T0 = 1_759_000_000;
const ANIMALS = wildlifeInRegion(SEED, -1200, -1200, 1200, 1200);

function runTests() {
    // -------------------------------------------------------------
    // Section A — offsets
    // -------------------------------------------------------------
    {
        for (const species of Object.values(ANIMAL_SPECIES)) {
            assert(gaitOffsetsAt(species, 0) === REST_GAIT, `1. ${species}: gaitPhase 0 (standing) is rest`);
            for (const whole of [1, 2, 5]) {
                const o = gaitOffsetsAt(species, whole);
                assert(Math.abs(o.lift) < 1e-12 && Math.abs(o.bodyPitch) < 1e-12 && Math.abs(o.headPitch) < 1e-12,
                    `2. ${species}: every whole stride ends at rest, so strides and walks join without a pop`);
            }
        }

        const hop = ANIMAL_GAIT[ANIMAL_SPECIES.RABBIT];
        const midHop = gaitOffsetsAt(ANIMAL_SPECIES.RABBIT, 3.5);
        assert(Math.abs(midHop.lift - hop.hopHeight) < 1e-12, '3. A rabbit is highest mid-hop, at its hop height');
        assert(gaitOffsetsAt(ANIMAL_SPECIES.RABBIT, 0.25).bodyPitch < 0, '4. ...nose up while rising');
        assert(gaitOffsetsAt(ANIMAL_SPECIES.RABBIT, 0.75).bodyPitch > 0, '5. ...nose down while landing');
        for (let p = 0.01; p < 3; p += 0.01) {
            assert(gaitOffsetsAt(ANIMAL_SPECIES.RABBIT, p).lift >= 0, '6. A hop never sinks into the ground');
        }

        const step = ANIMAL_GAIT[ANIMAL_SPECIES.DEER];
        const deerQuarter = gaitOffsetsAt(ANIMAL_SPECIES.DEER, 0.25);
        const deerThreeQuarter = gaitOffsetsAt(ANIMAL_SPECIES.DEER, 0.75);
        assert(Math.abs(deerQuarter.lift - step.bobHeight) < 1e-12 && Math.abs(deerThreeQuarter.lift - step.bobHeight) < 1e-12,
            '7. A deer\'s body rises twice per stride, once per step');
        assert(Math.abs(deerQuarter.headPitch - step.headNod) < 1e-12 && deerQuarter.bodyPitch === 0,
            '8. ...its head nods in time, while the body stays level');
        assert(gaitOffsetsAt(ANIMAL_SPECIES.DEER, 0.5).headPitch < 1e-12, '9. ...and comes back up between steps');

        const fallback = gaitOffsetsAt('UNKNOWN', 0.5);
        assert(Math.abs(fallback.lift - hop.hopHeight) < 1e-12, '10. An unknown species falls back to the rabbit gait, never throws');
    }

    // -------------------------------------------------------------
    // Section B — continuity over real walks, at 60 fps
    // -------------------------------------------------------------
    {
        const STEP = 1 / 60;
        let maxLift = 0;
        let maxPitch = 0;
        let hopped = false;
        let nodded = false;
        const sample = [
            ...ANIMALS.filter((a) => a.species === ANIMAL_SPECIES.RABBIT).slice(0, 30),
            ...ANIMALS.filter((a) => a.species === ANIMAL_SPECIES.DEER).slice(0, 30)
        ];
        for (const animal of sample) {
            let previous = gaitOffsetsAt(animal.species, animalPoseAt(SEED, animal, T0).gaitPhase);
            for (let i = 1; i <= 60 * 60; i++) {
                const offsets = gaitOffsetsAt(animal.species, animalPoseAt(SEED, animal, T0 + i * STEP).gaitPhase);
                maxLift = Math.max(maxLift, Math.abs(offsets.lift - previous.lift));
                maxPitch = Math.max(maxPitch, Math.abs(offsets.bodyPitch - previous.bodyPitch), Math.abs(offsets.headPitch - previous.headPitch));
                if (animal.species === ANIMAL_SPECIES.RABBIT && offsets.lift > 0.1) hopped = true;
                if (animal.species === ANIMAL_SPECIES.DEER && offsets.headPitch > 0.15) nodded = true;
                previous = offsets;
            }
        }
        assert(hopped && nodded, '11. Over a minute, rabbits really hop and deer really nod');
        // Fastest possible: a rabbit's eased walk peaks at 2.4 units/s, 4.8
        // hops/s — at most ~0.04 of lift and ~0.15 rad of pitch per frame.
        assert(maxLift < 0.06, `12. No frame jumps the body up or down (max ${maxLift.toFixed(4)} per frame)`);
        assert(maxPitch < 0.2, `13. No frame snaps the body or head round (max ${maxPitch.toFixed(4)} rad per frame)`);
    }

    // -------------------------------------------------------------
    // Section C — the tile applies the gait
    // -------------------------------------------------------------
    {
        // Find a moment when some rabbit and some deer are each mid-stride.
        function midStride(species) {
            for (const animal of ANIMALS.filter((a) => a.species === species)) {
                for (let t = T0; t < T0 + 60; t += 0.05) {
                    const pose = animalPoseAt(SEED, animal, t);
                    const stride = pose.gaitPhase - Math.floor(pose.gaitPhase);
                    if (pose.moving && pose.gaitPhase > 0 && stride > 0.2 && stride < 0.3) return { animal, t, pose };
                }
            }
            throw new Error(`No ${species} found mid-stride — fixture assumption broken`);
        }

        const read = (mesh, i) => {
            const m = new THREE.Matrix4();
            mesh.getMatrixAt(i, m);
            return m;
        };
        const tileOf = (animal, t) => buildWildlifeTileMesh(
            Math.floor(animal.x / TERRAIN_TILE_SIZE), Math.floor(animal.z / TERRAIN_TILE_SIZE), SEED, TERRAIN_TILE_SIZE, new Set(), t);
        const instanceOf = (tile, animal) => {
            const herd = tile.userData.wildlife.herds.find((h) => h.animals.some((a) => a.id === animal.id));
            return { herd, index: herd.animals.findIndex((a) => a.id === animal.id) };
        };

        const rabbit = midStride(ANIMAL_SPECIES.RABBIT);
        {
            const tile = tileOf(rabbit.animal, rabbit.t);
            const { herd, index } = instanceOf(tile, rabbit.animal);
            const body = new THREE.Vector3().setFromMatrixPosition(read(herd.bodyMesh, index));
            const expectedLift = gaitOffsetsAt(ANIMAL_SPECIES.RABBIT, rabbit.pose.gaitPhase).lift * rabbit.animal.scale;
            assert(expectedLift > 0.05 && Math.abs(body.y - (rabbit.pose.y + expectedLift)) < 1e-3,
                '14. A hopping rabbit is drawn lifted off the ground by its hop, scaled with its body');
            const forward = new THREE.Vector3(0, 0, 1).transformDirection(read(herd.bodyMesh, index));
            assert(forward.y > 0.05, '15. ...with its nose tipped up while rising');
        }

        const deer = midStride(ANIMAL_SPECIES.DEER);
        {
            const tile = tileOf(deer.animal, deer.t);
            const { herd, index } = instanceOf(tile, deer.animal);
            const body = read(herd.bodyMesh, index);
            const head = read(herd.headMesh, index);
            assert(!body.equals(head), '16. A walking deer\'s head moves separately from its body');
            // The neck pivot stays attached: it maps to the same world point
            // through either transform.
            const pivot = herd.preset.neckPivot;
            const viaBody = pivot.clone().applyMatrix4(body);
            const viaHead = pivot.clone().applyMatrix4(head);
            assert(viaBody.distanceTo(viaHead) < 1e-4, '17. ...nodding about its neck, never coming loose from the body');
            const headCenter = new THREE.Vector3();
            herd.headMesh.geometry.computeBoundingSphere();
            const localCenter = herd.headMesh.geometry.boundingSphere.center;
            headCenter.copy(localCenter).applyMatrix4(head);
            const restCenter = localCenter.clone().applyMatrix4(body);
            assert(headCenter.y < restCenter.y, '18. ...and the nod dips the head');

            // Standing with nothing to do (no idle action, see
            // tests/AnimalIdle.test.js), the head rides the body again.
            let standing = null;
            for (let t = deer.t; t < deer.t + 600 && standing === null; t += 0.1) {
                const pose = animalPoseAt(SEED, deer.animal, t);
                if (!pose.moving && pose.idleAction === IDLE_ACTION.NONE) standing = t;
            }
            assert(standing !== null, '19a. Setup: the deer stands idle-free at some point');
            updateWildlifeTileMesh(tile, standing);
            assert(read(herd.bodyMesh, index).equals(read(herd.headMesh, index)), '19. A deer standing with nothing to do has its head sharing its body\'s transform');
        }

        // A tile built without a time (placed positions) is at rest.
        const placed = buildWildlifeTileMesh(Math.floor(deer.animal.x / TERRAIN_TILE_SIZE), Math.floor(deer.animal.z / TERRAIN_TILE_SIZE), SEED);
        for (const herd of placed.userData.wildlife.herds) {
            herd.animals.forEach((a, i) => {
                assert(read(herd.bodyMesh, i).equals(read(herd.headMesh, i)), '20. Placed animals stand at rest');
            });
        }
    }

    console.log('✅ All Animal Gait tests passed.');
}

runTests();
