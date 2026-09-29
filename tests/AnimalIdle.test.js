import * as THREE from 'three';
import { wildlifeInRegion, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { animalPoseAt, IDLE_ACTION, ANIMAL_MOTION } from '../core/WildlifeMotion.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { idleOffsetsAt, ANIMAL_IDLE, IDLE_EASE_SECONDS } from '../renderer/AnimalIdle.js';
import { gaitOffsetsAt, REST_GAIT } from '../renderer/AnimalGait.js';
import { buildWildlifeTileMesh } from '../renderer/WildlifeTileMesh.js';
import { assert } from './support/Assert.js';

// Idle animation: core/WildlifeMotion.js decides what a standing animal
// does during a pause; renderer/AnimalIdle.js decides how that looks.
//
//   Section A: core — one action per pause, only while standing, never
//              overlapping the turn before a walk, at the species' odds
//   Section B: offsets — rest at both ends of a pause, each action's shape
//   Section C: continuity at 60 fps across walks, pauses and the moves
//              between them
//   Section D: in the tile — a grazing head stays above the ground; a
//              rabbit sitting up keeps its rump on it

const SEED = DEFAULT_WORLD_SEED;
const T0 = 1_759_000_000;
const ALL = wildlifeInRegion(SEED, -3000, -3000, 3000, 3000);
const sampleOf = (species, n) => ALL.filter((a) => a.species === species).slice(0, n);
const offsetsFor = (species, pose) => (pose.moving
    ? gaitOffsetsAt(species, pose.gaitPhase)
    : idleOffsetsAt(species, pose.idleAction, pose.idleSeconds, pose.idleDuration));

function runTests() {
    // -------------------------------------------------------------
    // Section A — core
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        const counts = { GRAZE: 0, ALERT: 0, NONE: 0 };
        for (const animal of sampleOf(species, 40)) {
            let previous = animalPoseAt(SEED, animal, T0);
            for (let i = 1; i <= 600 * 4; i++) {
                const pose = animalPoseAt(SEED, animal, T0 + i / 4);
                if (pose.moving) {
                    assert(pose.idleAction === IDLE_ACTION.NONE && pose.idleSeconds === 0 && pose.idleDuration === 0,
                        `1. ${species}: a walking animal is never idling`);
                } else if (pose.idleAction !== IDLE_ACTION.NONE) {
                    assert(pose.idleSeconds >= 0 && pose.idleSeconds < pose.idleDuration && pose.idleDuration >= 1.5,
                        `2. ${species}: an idle action runs within its window, which is long enough to ease in and out`);
                    // Seconds left in the window, plus the pre-walk turn,
                    // never run past the end of the pause.
                    const later = animalPoseAt(SEED, animal, T0 + i / 4 + (pose.idleDuration - pose.idleSeconds) + 0.01);
                    assert(later.idleAction === IDLE_ACTION.NONE, `3. ${species}: the idle action is over before the animal turns to leave`);
                }
                // One action per pause: it only ever changes through NONE
                // (walking, turning) or at the start of a new pause.
                if (previous.idleAction !== IDLE_ACTION.NONE && pose.idleAction !== IDLE_ACTION.NONE
                    && pose.idleSeconds > previous.idleSeconds) {
                    assert(pose.idleAction === previous.idleAction, `4. ${species}: an animal keeps to one idle action for a whole pause`);
                }
                // Count each pause once, at its start.
                if (previous.idleAction === IDLE_ACTION.NONE && pose.idleAction !== IDLE_ACTION.NONE && pose.idleSeconds < 0.3) {
                    counts[pose.idleAction]++;
                }
                previous = pose;
            }
        }
        const starts = counts.GRAZE + counts.ALERT;
        assert(counts.GRAZE > 0 && counts.ALERT > 0, `5. ${species}: both grazing and alert pauses happen`);
        const chances = ANIMAL_MOTION[species].idleChances;
        const grazeShare = counts.GRAZE / starts;
        const expected = chances.GRAZE / (chances.GRAZE + chances.ALERT);
        assert(Math.abs(grazeShare - expected) < 0.12,
            `6. ${species}: grazing and alert pauses come at roughly the species' odds (${grazeShare.toFixed(2)} vs ${expected.toFixed(2)})`);
    }
    {
        const animal = ALL[3];
        assert(JSON.stringify(animalPoseAt(SEED, animal, T0 + 42.5)) === JSON.stringify(animalPoseAt(SEED, animal, T0 + 42.5)),
            '7. The idle action at a moment is deterministic, so every replica sees the same one');
    }

    // -------------------------------------------------------------
    // Section B — offsets
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        assert(idleOffsetsAt(species, IDLE_ACTION.NONE, 3, 6) === REST_GAIT, `8. ${species}: no idle action is rest`);
        for (const action of [IDLE_ACTION.GRAZE, IDLE_ACTION.ALERT]) {
            for (const seconds of [0, 6]) {
                const o = idleOffsetsAt(species, action, seconds, 6);
                assert(Math.abs(o.lift) < 1e-12 && Math.abs(o.bodyPitch) < 1e-12 && Math.abs(o.headPitch) < 1e-12 && Math.abs(o.headYaw) < 1e-12,
                    `9. ${species} ${action}: rest at both ends of the pause, so it never pops against arriving or turning`);
            }
        }
    }
    {
        const deerGraze = idleOffsetsAt(ANIMAL_SPECIES.DEER, IDLE_ACTION.GRAZE, 3, 6);
        assert(Math.abs(deerGraze.headPitch - ANIMAL_IDLE.DEER.graze.headPitch) <= ANIMAL_IDLE.DEER.graze.chewPitch + 1e-12,
            '10. A grazing deer holds its head down, chewing');
        const deerAlert = [1, 2, 3, 4].map((s) => idleOffsetsAt(ANIMAL_SPECIES.DEER, IDLE_ACTION.ALERT, s + 1, 12));
        assert(deerAlert.every((o) => o.headPitch < 0), '11. An alert deer holds its head up');
        assert(deerAlert.some((o) => o.headYaw > 0.2) && deerAlert.some((o) => o.headYaw < -0.2), '12. ...and looks from side to side');
        const rabbitAlert = idleOffsetsAt(ANIMAL_SPECIES.RABBIT, IDLE_ACTION.ALERT, 2, 4);
        assert(rabbitAlert.bodyPitch < -0.3 && rabbitAlert.lift > 0, '13. An alert rabbit sits up');
        assert(Math.abs(idleOffsetsAt(ANIMAL_SPECIES.RABBIT, IDLE_ACTION.GRAZE, IDLE_EASE_SECONDS / 2, 6).headPitch)
            < Math.abs(idleOffsetsAt(ANIMAL_SPECIES.RABBIT, IDLE_ACTION.GRAZE, 3, 6).headPitch), '14. Actions ease in');
        assert(idleOffsetsAt('UNKNOWN', IDLE_ACTION.GRAZE, 3, 6).headPitch > 0, '15. An unknown species falls back to the rabbit, never throws');
    }

    // -------------------------------------------------------------
    // Section C — continuity at 60 fps, walking and idling together
    // -------------------------------------------------------------
    {
        let maxLift = 0;
        let maxAngle = 0;
        let sawGraze = false;
        let sawAlert = false;
        for (const animal of [...sampleOf(ANIMAL_SPECIES.RABBIT, 25), ...sampleOf(ANIMAL_SPECIES.DEER, 25)]) {
            let previous = offsetsFor(animal.species, animalPoseAt(SEED, animal, T0));
            for (let i = 1; i <= 60 * 60; i++) {
                const pose = animalPoseAt(SEED, animal, T0 + i / 60);
                const o = offsetsFor(animal.species, pose);
                maxLift = Math.max(maxLift, Math.abs(o.lift - previous.lift));
                maxAngle = Math.max(maxAngle,
                    Math.abs(o.bodyPitch - previous.bodyPitch), Math.abs(o.headPitch - previous.headPitch), Math.abs(o.headYaw - previous.headYaw));
                if (pose.idleAction === IDLE_ACTION.GRAZE && o.headPitch > 0.3) sawGraze = true;
                if (pose.idleAction === IDLE_ACTION.ALERT && Math.abs(o.headYaw) > 0.2) sawAlert = true;
                previous = o;
            }
        }
        assert(sawGraze && sawAlert, '16. Over a minute, animals really graze and really look around');
        assert(maxLift < 0.06, `17. No frame jumps the body up or down (max ${maxLift.toFixed(4)})`);
        assert(maxAngle < 0.2, `18. No frame snaps the body or head, walking, idling or between the two (max ${maxAngle.toFixed(4)} rad)`);
    }

    // -------------------------------------------------------------
    // Section D — in the tile
    // -------------------------------------------------------------
    {
        // A moment, in the middle of a pause, when `species` is doing `action`.
        function midAction(species, action) {
            for (const animal of sampleOf(species, 200)) {
                for (let t = T0; t < T0 + 120; t += 0.5) {
                    const pose = animalPoseAt(SEED, animal, t);
                    if (pose.idleAction === action && Math.abs(pose.idleSeconds - pose.idleDuration / 2) < 0.3) return { animal, t, pose };
                }
            }
            throw new Error(`No ${species} found mid-${action} — fixture assumption broken`);
        }
        const matrixOf = (mesh, i) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; };
        function lowestPoint(geometry, matrix) {
            const position = geometry.attributes.position;
            const v = new THREE.Vector3();
            let min = Infinity;
            for (let i = 0; i < position.count; i++) {
                min = Math.min(min, v.fromBufferAttribute(position, i).applyMatrix4(matrix).y);
            }
            return min;
        }
        function drawn(found) {
            const tile = buildWildlifeTileMesh(Math.floor(found.animal.x / TERRAIN_TILE_SIZE), Math.floor(found.animal.z / TERRAIN_TILE_SIZE),
                SEED, TERRAIN_TILE_SIZE, new Set(), found.t);
            const herd = tile.userData.wildlife.herds.find((h) => h.animals.some((a) => a.id === found.animal.id));
            const index = herd.animals.findIndex((a) => a.id === found.animal.id);
            return { herd, body: matrixOf(herd.bodyMesh, index), head: matrixOf(herd.headMesh, index) };
        }

        for (const species of Object.values(ANIMAL_SPECIES)) {
            const grazing = midAction(species, IDLE_ACTION.GRAZE);
            const { herd, body, head } = drawn(grazing);
            const geometry = herd.headMesh.geometry;
            geometry.computeBoundingSphere();
            const headCenter = geometry.boundingSphere.center.clone().applyMatrix4(head);
            const restCenter = geometry.boundingSphere.center.clone().applyMatrix4(body);
            assert(headCenter.y < restCenter.y - 0.1, `19. ${species}: a grazing head is lowered to the grass`);
            assert(headCenter.y > grazing.pose.y, `20. ${species}: ...its center staying above the ground`);
        }

        const sitting = midAction(ANIMAL_SPECIES.RABBIT, IDLE_ACTION.ALERT);
        const { herd, body } = drawn(sitting);
        const low = lowestPoint(herd.bodyMesh.geometry, body);
        assert(low > sitting.pose.y - 0.06, `21. A rabbit sitting up keeps its rump on the ground, not sunk into it (${(low - sitting.pose.y).toFixed(3)})`);
        const nose = new THREE.Vector3(0, 0.2, 0.28).applyMatrix4(body);
        assert(nose.y > sitting.pose.y + 0.3, '22. ...with its front raised');
    }

    console.log('✅ All Animal Idle tests passed.');
}

runTests();
