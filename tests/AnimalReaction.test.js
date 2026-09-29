import * as THREE from 'three';
import { wildlifeInRegion, ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { animalPoseAt, stationaryAnimalPoseAt, IDLE_ACTION } from '../core/WildlifeMotion.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { AnimalDecoration } from '../core/AnimalDecoration.js';
import { Position } from '../core/Position.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { reactToObserver, ANIMAL_REACTION } from '../renderer/AnimalReaction.js';
import { idleOffsetsAt, ANIMAL_IDLE } from '../renderer/AnimalIdle.js';
import { gaitOffsetsAt, REST_GAIT } from '../renderer/AnimalGait.js';
import { buildWildlifeTileMesh, updateWildlifeTileMesh } from '../renderer/WildlifeTileMesh.js';
import { AnimalFieldRenderer } from '../renderer/AnimalFieldRenderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { NECK } from '../renderer/AnimalRenderer.js';
import { assert } from './support/Assert.js';

// Animals turn to watch the viewer's own avatar, renderer/AnimalReaction.js.
//
//   Section A: who is watched — distance, the view cone, the neck's limit
//   Section B: continuity — circling an animal, walking up to it, and over
//              real walks and pauses with the observer standing nearby
//   Section C: posture — grazing interrupted and a rabbit sitting up only
//              while settled in a pause; walking animals only turn their heads
//   Section D: every draw path — tiles, released animals, decorations — and
//              never a change to where an animal is

const SEED = DEFAULT_WORLD_SEED;
const T0 = 1_759_000_000;
// A standing animal mid-pause, with no idle action of its own.
const SETTLED = Object.freeze({ rotationY: 0, idleSeconds: 3, idleDuration: 6 });
// A walking animal (no idle window).
const WALKING = Object.freeze({ rotationY: 0, idleSeconds: 0, idleDuration: 0 });
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function runTests() {
    // -------------------------------------------------------------
    // Section A — who is watched
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        const { lookRadius, maxYaw } = ANIMAL_REACTION[species];
        assert(reactToObserver(species, REST_GAIT, SETTLED, 0, 0, null) === REST_GAIT, `1. ${species}: no avatar, no reaction`);
        assert(reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0, z: lookRadius + 0.1 }) === REST_GAIT,
            `2. ${species}: an avatar beyond the look radius is ignored`);

        // Facing +Z (rotationY 0): an observer ahead and a little to the left (+X).
        const ahead = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 1, z: 2 });
        assert(close(ahead.headYaw, Math.atan2(1, 2)), `3. ${species}: the head turns exactly toward an avatar in view`);
        const right = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: -1, z: 2 });
        assert(close(right.headYaw, Math.atan2(-1, 2)), `4. ${species}: ...to either side`);
        const turned = reactToObserver(species, REST_GAIT, { ...SETTLED, rotationY: Math.PI / 2 }, 0, 0, { x: 2, z: 1 });
        assert(close(Math.PI / 2 + turned.headYaw, Math.atan2(2, 1)), `5. ${species}: ...whichever way the animal itself faces`);

        const atLimit = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 2 * Math.sin(maxYaw), z: 2 * Math.cos(maxYaw) });
        assert(close(atLimit.headYaw, maxYaw), `6. ${species}: the head turns as far as the neck allows`);
        for (let bearing = -Math.PI; bearing <= Math.PI; bearing += 0.01) {
            const o = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 2 * Math.sin(bearing), z: 2 * Math.cos(bearing) });
            assert(Math.abs(o.headYaw) <= maxYaw + 1e-12, `6b. ${species}: ...and never further, wherever the avatar is`);
        }
        const behind = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0, z: -2 });
        assert(Math.abs(behind.headYaw) < 1e-9 && Math.abs(behind.headPitch) < 1e-9,
            `7. ${species}: an avatar directly behind is out of view, so there is no reaction`);

        const edge = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0, z: lookRadius * 0.9 });
        const near = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0, z: lookRadius * 0.5 });
        assert(Math.abs(edge.headPitch) < Math.abs(near.headPitch), `8. ${species}: the reaction fades in as the avatar approaches`);
    }

    // -------------------------------------------------------------
    // Section B — continuity
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        let maxYawStep = 0;
        let maxPitchStep = 0;
        // Circle the animal at 2 units, one degree at a time — including
        // right through the point directly behind it.
        let previous = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0, z: 2 });
        for (let deg = 1; deg <= 360; deg++) {
            const a = deg * Math.PI / 180;
            const o = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 2 * Math.sin(a), z: 2 * Math.cos(a) });
            maxYawStep = Math.max(maxYawStep, Math.abs(o.headYaw - previous.headYaw));
            maxPitchStep = Math.max(maxPitchStep, Math.abs(o.headPitch - previous.headPitch), Math.abs(o.bodyPitch - previous.bodyPitch));
            previous = o;
        }
        assert(maxYawStep < 0.1, `9. ${species}: circling an animal never flicks its head across (max ${maxYawStep.toFixed(3)} rad per degree)`);
        assert(maxPitchStep < 0.1, `10. ${species}: ...or jolts its posture`);

        // Walk straight up to it from outside the look radius, 1 cm at a time.
        let step = 0;
        let last = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0.3, z: ANIMAL_REACTION[species].lookRadius + 1 });
        for (let z = ANIMAL_REACTION[species].lookRadius + 1; z > 0.3; z -= 0.01) {
            const o = reactToObserver(species, REST_GAIT, SETTLED, 0, 0, { x: 0.3, z });
            step = Math.max(step, Math.abs(o.headYaw - last.headYaw), Math.abs(o.headPitch - last.headPitch),
                Math.abs(o.bodyPitch - last.bodyPitch), Math.abs(o.lift - last.lift));
            last = o;
        }
        assert(step < 0.05, `11. ${species}: walking up to an animal, its reaction builds smoothly (max ${step.toFixed(4)} per cm)`);
    }
    {
        // A real animal over a minute of walks, pauses and turns, watched by
        // an avatar standing just beside where it was placed.
        const combined = (animal, pose, observer) => reactToObserver(animal.species,
            pose.moving ? gaitOffsetsAt(animal.species, pose.gaitPhase) : idleOffsetsAt(animal.species, pose.idleAction, pose.idleSeconds, pose.idleDuration),
            pose, pose.x, pose.z, observer);
        let maxStep = 0;
        let reacted = 0;
        const animals = wildlifeInRegion(SEED, -3000, -3000, 3000, 3000);
        for (const animal of [...animals.filter((a) => a.species === 'RABBIT').slice(0, 10), ...animals.filter((a) => a.species === 'DEER').slice(0, 10)]) {
            const observer = { x: animal.x + 1.2, z: animal.z + 1.6 };
            let previous = combined(animal, animalPoseAt(SEED, animal, T0), observer);
            for (let i = 1; i <= 60 * 60; i++) {
                const pose = animalPoseAt(SEED, animal, T0 + i / 60);
                const o = combined(animal, pose, observer);
                if (Math.abs(o.headYaw) > 0.3) reacted++;
                maxStep = Math.max(maxStep, Math.abs(o.headYaw - previous.headYaw), Math.abs(o.headPitch - previous.headPitch),
                    Math.abs(o.bodyPitch - previous.bodyPitch), Math.abs(o.lift - previous.lift));
                previous = o;
            }
        }
        assert(reacted > 0, '12. setup: animals really do turn to watch a nearby avatar');
        assert(maxStep < 0.2, `13. Watched through walks, pauses, turns and grazing, no frame snaps (max ${maxStep.toFixed(4)} per frame)`);
    }

    // -------------------------------------------------------------
    // Section C — posture
    // -------------------------------------------------------------
    {
        const grazing = idleOffsetsAt(ANIMAL_SPECIES.DEER, IDLE_ACTION.GRAZE, 3, 6);
        const watched = reactToObserver(ANIMAL_SPECIES.DEER, grazing, SETTLED, 0, 0, { x: 0.2, z: 2 });
        assert(grazing.headPitch > 0.3 && close(watched.headPitch, ANIMAL_REACTION.DEER.lookPitch, 1e-6),
            '14. A grazing deer stops and lifts its head to watch a nearby avatar');
        const gait = gaitOffsetsAt(ANIMAL_SPECIES.DEER, 0.25);
        const walking = reactToObserver(ANIMAL_SPECIES.DEER, gait, WALKING, 0, 0, { x: 0.2, z: 2 });
        assert(walking.headPitch === gait.headPitch && walking.lift === gait.lift && walking.headYaw !== gait.headYaw,
            '15. A walking deer keeps its stride and nod, and only turns its head to watch');
        const easing = reactToObserver(ANIMAL_SPECIES.DEER, grazing, { rotationY: 0, idleSeconds: 0.1, idleDuration: 6 }, 0, 0, { x: 0.2, z: 2 });
        assert(Math.abs(easing.headPitch - ANIMAL_REACTION.DEER.lookPitch) > 0.1,
            '16. Posture changes only as far as the animal has settled into its pause');

        const sitting = reactToObserver(ANIMAL_SPECIES.RABBIT, REST_GAIT, SETTLED, 0, 0, { x: 0.2, z: 1 });
        assert(close(sitting.bodyPitch, ANIMAL_IDLE.RABBIT.alert.bodyPitch, 1e-6) && close(sitting.lift, ANIMAL_IDLE.RABBIT.alert.lift, 1e-6),
            '17. A rabbit sits up when an avatar comes close');
        const watching = reactToObserver(ANIMAL_SPECIES.RABBIT, REST_GAIT, SETTLED, 0, 0, { x: 0.2, z: 4 });
        assert(watching.bodyPitch === 0 && watching.headYaw !== 0, '18. ...but only watches from further away');
        const hopping = reactToObserver(ANIMAL_SPECIES.RABBIT, REST_GAIT, WALKING, 0, 0, { x: 0.2, z: 1 });
        assert(hopping.bodyPitch === 0, '19. A hopping rabbit never sits up mid-hop');
        const deerClose = reactToObserver(ANIMAL_SPECIES.DEER, REST_GAIT, SETTLED, 0, 0, { x: 0.2, z: 1 });
        assert(deerClose.bodyPitch === 0 && deerClose.lift === 0, '20. A deer never sits up');
    }

    // -------------------------------------------------------------
    // Section D — every draw path
    // -------------------------------------------------------------
    {
        // Wild animals, through the tile: the head's forward direction points
        // at the observer, and body positions are untouched.
        const animal = wildlifeInRegion(SEED, -1200, -1200, 1200, 1200).find((a) => {
            const pose = animalPoseAt(SEED, a, T0);
            return !pose.moving && pose.idleAction === IDLE_ACTION.NONE;
        });
        const pose = animalPoseAt(SEED, animal, T0);
        const observer = { x: pose.x + Math.sin(pose.rotationY + 0.6) * 2.5, z: pose.z + Math.cos(pose.rotationY + 0.6) * 2.5 };
        const tile = buildWildlifeTileMesh(Math.floor(animal.x / TERRAIN_TILE_SIZE), Math.floor(animal.z / TERRAIN_TILE_SIZE), SEED);
        const herd = tile.userData.wildlife.herds.find((h) => h.animals.some((a) => a.id === animal.id));
        const index = herd.animals.findIndex((a) => a.id === animal.id);
        const read = (mesh) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(index, m); return m; };

        updateWildlifeTileMesh(tile, T0);
        const unwatchedBody = read(herd.bodyMesh);
        updateWildlifeTileMesh(tile, T0, observer);
        const body = read(herd.bodyMesh);
        const headForward = new THREE.Vector3(0, 0, 1).transformDirection(read(herd.headMesh));
        const facing = Math.atan2(headForward.x, headForward.z);
        assert(close(facing, Math.atan2(observer.x - pose.x, observer.z - pose.z), 1e-3), '21. A wild animal\'s head, drawn by its tile, faces the avatar');
        const at = (m) => new THREE.Vector3().setFromMatrixPosition(m);
        assert(at(body).x === at(unwatchedBody).x && at(body).z === at(unwatchedBody).z,
            '22. Watching never moves the animal: its position is the same for every viewer');
    }
    {
        const field = new AnimalFieldRenderer();
        field.setAnimal(new AnimalPresence({ id: 'released-1', species: ANIMAL_SPECIES.DEER, position: new Position(10, 0, 10) }));
        const pose = stationaryAnimalPoseAt(SEED, 'released-1', ANIMAL_SPECIES.DEER, T0);
        const observer = { x: 10 + Math.sin(pose.rotationY - 0.5) * 3, z: 10 + Math.cos(pose.rotationY - 0.5) * 3 };
        field.animate(T0, SEED, observer);
        const neck = field.getObject('released-1').getObjectByName(NECK);
        assert(close(neck.rotation.y, -0.5, 1e-6), '23. A released animal turns its head to watch the avatar');
        field.animate(T0, SEED, null);
        const own = idleOffsetsAt(ANIMAL_SPECIES.DEER, pose.idleAction, pose.idleSeconds, pose.idleDuration);
        assert(close(neck.rotation.y, own.headYaw) && close(neck.rotation.x, own.headPitch),
            '24. ...and goes back to its own idling without one');
        field.dispose();
    }
    {
        const added = [];
        const worldRenderer = new WorldRenderer({ add: (o) => added.push(o), remove() {}, terrainHeightAt: () => 0 }, null);
        worldRenderer._onAnimalDecorationAdded(new AnimalDecoration({
            id: 'decoration-7', worldId: 'w', authorIdentityId: 'a', species: ANIMAL_SPECIES.RABBIT, position: new Position(0, 0, 0)
        }));
        const pose = stationaryAnimalPoseAt(SEED, 'decoration-7', ANIMAL_SPECIES.RABBIT, T0);
        const observer = { x: Math.sin(pose.rotationY + 0.4) * 2, z: Math.cos(pose.rotationY + 0.4) * 2 };
        worldRenderer.animateDecorations(T0, SEED, observer);
        assert(close(added[0].getObjectByName(NECK).rotation.y, 0.4, 1e-6), '25. A decoration turns its head to watch the avatar');
        assert(added[0].position.x === 0 && added[0].position.z === 0, '26. ...without moving off its spot');
    }

    console.log('✅ All Animal Reaction tests passed.');
}

runTests();
