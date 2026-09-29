import * as THREE from 'three';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { stationaryAnimalPoseAt, IDLE_ACTION, ANIMAL_MOTION } from '../core/WildlifeMotion.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { AnimalDecoration } from '../core/AnimalDecoration.js';
import { Position } from '../core/Position.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AnimalRenderer, BODY_FRAME, NECK } from '../renderer/AnimalRenderer.js';
import { AnimalVisual } from '../renderer/AnimalVisual.js';
import { AnimalFieldRenderer } from '../renderer/AnimalFieldRenderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { idleOffsetsAt } from '../renderer/AnimalIdle.js';
import { SPECIES_PRESET } from '../renderer/WildlifeTileMesh.js';
import { assert } from './support/Assert.js';

// Released animals and animal decorations idle in place, and every animal
// has ears and a tail.
//
//   Section A: core/WildlifeMotion.js#stationaryAnimalPoseAt() — idle
//              actions and turns in place, keyed by id
//   Section B: renderer/AnimalRenderer.js + AnimalVisual.js — the joints,
//              the pose, and the same head placement the tiles draw
//   Section C: AnimalFieldRenderer#animate() and
//              WorldRenderer#animateDecorations() — driven per frame,
//              never moving an animal off its spot
//   Section D: ears and a tail in the shared species geometry

const SEED = DEFAULT_WORLD_SEED;
const T0 = 1_759_000_000;
const KEYS = Array.from({ length: 30 }, (_, i) => `9b2f6d1e-5a4c-4f7e-8d2b-${String(i).padStart(12, '0')}`);

function angleDelta(a, b) {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — stationaryAnimalPoseAt()
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        const seen = { GRAZE: 0, ALERT: 0 };
        let maxTurn = 0;
        let turned = 0;
        for (const key of KEYS) {
            let previous = stationaryAnimalPoseAt(SEED, key, species, T0);
            const firstHeading = previous.rotationY;
            for (let i = 1; i <= 60 * 60; i++) {
                const pose = stationaryAnimalPoseAt(SEED, key, species, T0 + i / 60);
                assert(pose.moving === false && pose.gaitPhase === 0, `1. ${species}: an animal that stays put never walks`);
                assert(pose.rotationY >= 0 && pose.rotationY < Math.PI * 2, `2. ${species}: rotationY stays within one turn`);
                maxTurn = Math.max(maxTurn, angleDelta(pose.rotationY, previous.rotationY));
                if (pose.idleAction !== IDLE_ACTION.NONE) {
                    assert(pose.idleSeconds >= 0 && pose.idleSeconds < pose.idleDuration, `3. ${species}: an idle action runs within its window`);
                    if (previous.idleAction !== IDLE_ACTION.NONE && pose.idleSeconds > previous.idleSeconds) {
                        assert(pose.idleAction === previous.idleAction, `4. ${species}: one idle action per pause`);
                        assert(pose.rotationY === previous.rotationY, `5. ${species}: it never turns while idling`);
                    }
                    if (previous.idleAction === IDLE_ACTION.NONE) seen[pose.idleAction]++;
                }
                previous = pose;
            }
            if (angleDelta(previous.rotationY, firstHeading) > 0.1) turned++;
        }
        assert(seen.GRAZE > 0 && seen.ALERT > 0, `6. ${species}: animals that stay put both graze and look around`);
        assert(turned > KEYS.length / 2, `7. ${species}: over a minute, most turn to face a new way`);
        // A half turn over 1.2 s, eased, peaks near 3.9 rad/s: ~0.065 rad per 60 fps frame.
        assert(maxTurn < 0.1, `8. ${species}: they turn smoothly, never snapping round (max ${maxTurn.toFixed(3)} rad per frame)`);
    }
    {
        const a = stationaryAnimalPoseAt(SEED, KEYS[0], ANIMAL_SPECIES.DEER, T0 + 12.3);
        assert(JSON.stringify(a) === JSON.stringify(stationaryAnimalPoseAt(SEED, KEYS[0], ANIMAL_SPECIES.DEER, T0 + 12.3)),
            '9. The same id at the same moment always has the same pose, so every replica agrees on a decoration');
        const differs = KEYS.slice(1, 10).some((key) => stationaryAnimalPoseAt(SEED, key, ANIMAL_SPECIES.DEER, T0 + 12.3).rotationY !== a.rotationY);
        assert(differs, '10. Different ids idle and face independently');
        let threw = false;
        try { stationaryAnimalPoseAt(SEED, KEYS[0], ANIMAL_SPECIES.DEER, Infinity); } catch { threw = true; }
        assert(threw, '11. A non-finite time is refused rather than posing NaN');
        assert(ANIMAL_MOTION.DEER.segmentSeconds > 1.2 + 1.5, '12. sanity: a segment fits an idle window and a turn');
    }

    // -------------------------------------------------------------
    // Section B — AnimalRenderer joints and AnimalVisual#animateAt()
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        const preset = SPECIES_PRESET[species];
        const visual = new AnimalVisual(new AnimalRenderer(), species);
        const bodyFrame = visual.root.getObjectByName(BODY_FRAME);
        const neck = visual.root.getObjectByName(NECK);
        assert(bodyFrame && neck, `13. ${species}: a built animal has a body frame and a neck to move`);
        const meshes = [];
        visual.root.traverse((node) => { if (node.isMesh) meshes.push(node); });
        assert(meshes.length === 2, `14. ${species}: still exactly two meshes, body and head`);
        const [bodyMesh, headMesh] = meshes;
        visual.root.updateMatrixWorld(true);
        assert(headMesh.matrixWorld.equals(bodyMesh.matrixWorld),
            `15. ${species}: at rest the head sits exactly where a tile draws it — the neck and its offset cancel out`);

        // Find a moment mid-graze and compare the head against the tile's
        // own composition, body × T(pivot) × Ry(turn) × Rx(nod) × T(−pivot).
        let t = T0;
        let pose = null;
        const key = KEYS[3];
        for (; t < T0 + 600; t += 0.25) {
            pose = stationaryAnimalPoseAt(SEED, key, species, t);
            if (pose.idleAction === IDLE_ACTION.GRAZE && Math.abs(pose.idleSeconds - pose.idleDuration / 2) < 0.5) break;
        }
        assert(pose.idleAction === IDLE_ACTION.GRAZE, `16. ${species}: setup — found a grazing moment`);
        visual.setPosition({ x: 5, y: 2, z: -3 });
        visual.animateAt(SEED, key, t);
        visual.root.updateMatrixWorld(true);
        assert(visual.root.position.x === 5 && visual.root.position.y === 2 && visual.root.position.z === -3,
            `17. ${species}: animating never moves the animal off its spot`);
        assert(Math.abs(visual.root.rotation.y - pose.rotationY) < 1e-12, `18. ${species}: it faces the pose's heading`);

        const offsets = idleOffsetsAt(species, pose.idleAction, pose.idleSeconds, pose.idleDuration);
        const body = new THREE.Matrix4().compose(
            new THREE.Vector3(5, 2 + offsets.lift, -3),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(offsets.bodyPitch, pose.rotationY, 0, 'YXZ')),
            new THREE.Vector3(1, 1, 1)
        );
        const { x, y, z } = preset.neckPivot;
        const expectedHead = body.clone()
            .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
            .multiply(new THREE.Matrix4().makeRotationY(offsets.headYaw))
            .multiply(new THREE.Matrix4().makeRotationX(offsets.headPitch))
            .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
        const close = (a, b) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-9);
        assert(close(bodyMesh.matrixWorld, body), `19. ${species}: the body is lifted and pitched exactly as a tile would draw it`);
        assert(close(headMesh.matrixWorld, expectedHead), `20. ${species}: the head nods and turns about the neck exactly as a tile would draw it`);
        visual.dispose();
    }

    // -------------------------------------------------------------
    // Section C — per-frame drivers
    // -------------------------------------------------------------
    {
        const field = new AnimalFieldRenderer();
        const ids = KEYS.slice(0, 4);
        ids.forEach((id, i) => field.setAnimal(new AnimalPresence({
            id, species: i % 2 ? ANIMAL_SPECIES.DEER : ANIMAL_SPECIES.RABBIT, position: new Position(i * 3, 0, 1)
        })));
        field.animate(T0 + 40, SEED);
        ids.forEach((id, i) => {
            const root = field.getObject(id);
            const species = i % 2 ? ANIMAL_SPECIES.DEER : ANIMAL_SPECIES.RABBIT;
            assert(Math.abs(root.rotation.y - stationaryAnimalPoseAt(SEED, id, species, T0 + 40).rotationY) < 1e-12,
                '21. AnimalFieldRenderer#animate() poses every released animal by its own id');
            assert(root.position.x === i * 3 && root.position.z === 1, '22. ...and leaves each exactly where it was released');
        });
        field.dispose();
    }
    {
        const added = [];
        const fakeRenderer = { add: (o) => added.push(o), remove() {}, terrainHeightAt: () => 1.5 };
        const worldRenderer = new WorldRenderer(fakeRenderer, null);
        const decoration = new AnimalDecoration({
            id: 'decoration-1', worldId: 'world-1', authorIdentityId: 'author-1',
            species: ANIMAL_SPECIES.RABBIT, position: new Position(2, 4, 6)
        });
        worldRenderer._onAnimalDecorationAdded(decoration);
        assert(added.length === 1, '23. setup: the decoration is drawn');
        const before = added[0].position.clone();
        worldRenderer.animateDecorations(T0 + 17);
        const expected = stationaryAnimalPoseAt(SEED, 'decoration-1', ANIMAL_SPECIES.RABBIT, T0 + 17);
        assert(Math.abs(added[0].rotation.y - expected.rotationY) < 1e-12,
            '24. WorldRenderer#animateDecorations() poses a decoration by its id — the same for everyone who opens the World');
        assert(added[0].position.equals(before) && before.y === 5.5, '25. ...and never moves it off the spot its author placed it on');
    }

    // -------------------------------------------------------------
    // Section D — ears and tails
    // -------------------------------------------------------------
    for (const species of Object.values(ANIMAL_SPECIES)) {
        const { headGeometry, bodyGeometry, neckPivot } = SPECIES_PRESET[species];
        for (const geometry of [headGeometry, bodyGeometry]) {
            const count = geometry.attributes.position.count;
            assert(geometry.attributes.normal.count === count && geometry.attributes.uv.count === count,
                `26. ${species}: merged geometry keeps one normal and uv per vertex`);
            assert(Math.max(...geometry.index.array) < count, `27. ${species}: every index points at a real vertex`);
        }
        headGeometry.computeBoundingBox();
        bodyGeometry.computeBoundingBox();
        const plainHead = new THREE.SphereGeometry(1, 6, 5);
        assert(headGeometry.attributes.position.count > plainHead.attributes.position.count, `28. ${species}: the head carries ears`);
        assert(headGeometry.boundingBox.max.y > neckPivot.y + 0.2, `29. ${species}: ...standing up above the head`);
        // The body sphere is merged first; everything after it is the tail.
        const plainBodyCount = new THREE.SphereGeometry(1, 7, 5).attributes.position.count;
        const position = bodyGeometry.attributes.position;
        assert(position.count > plainBodyCount, `30. ${species}: the body carries a tail`);
        let tailZ = 0;
        for (let i = plainBodyCount; i < position.count; i++) tailZ += position.getZ(i);
        tailZ /= position.count - plainBodyCount;
        assert(tailZ < -bodyGeometry.boundingBox.max.z * 0.8, `30b. ${species}: ...on its rump, at the back of the body`);
    }
    {
        const rabbitEars = SPECIES_PRESET[ANIMAL_SPECIES.RABBIT].headGeometry.boundingBox.max.y;
        const rabbitHeadTop = SPECIES_PRESET[ANIMAL_SPECIES.RABBIT].neckPivot.y + 0.17;
        assert(rabbitEars - rabbitHeadTop > 0.2, '31. A rabbit\'s ears are long — well over its head');
    }

    console.log('✅ All Stationary Animal Idle tests passed.');
}

runTests();
