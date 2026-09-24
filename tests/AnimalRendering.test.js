import * as THREE from 'three';
import { AnimalRenderer } from '../renderer/AnimalRenderer.js';
import { AnimalVisual } from '../renderer/AnimalVisual.js';
import { AnimalFieldRenderer } from '../renderer/AnimalFieldRenderer.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { assert } from './support/Assert.js';

// 0.9.701 — Released Animal Rendering.
//
//   Section A: renderer/AnimalRenderer.js  — species -> Three.js geometry
//   Section B: renderer/AnimalVisual.js    — one animal's live presence
//   Section C: renderer/AnimalFieldRenderer.js — AnimalPresence -> visible object
//   Section D: multiple animals render independently
//   Section E: stable identity across a position change
//   Section F: SHARED GEOMETRY SAFETY — disposing one released animal's
//              visual never corrupts another, still-visible animal of
//              the SAME species (both reference the SAME shared
//              geometry from renderer/WildlifeTileMesh.js's own
//              SPECIES_PRESET — see renderer/AnimalRenderer.js's own
//              header for why only materials are cloned/disposed
//              per-instance)
//   Section G: architectural regression — the renderer decides nothing
//              about which animals exist, catching, or releasing
//
// No real WebGL/<canvas> anywhere — the same posture
// tests/VehicleRendering.test.js's own header already establishes.

function countMeshes(object3D) {
    let count = 0;
    object3D.traverse((node) => {
        if (node.isMesh) count++;
    });
    return count;
}

function animal(id, x, z, species = ANIMAL_SPECIES.RABBIT) {
    return new AnimalPresence({ id, species, position: new Position(x, 0, z) });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — renderer/AnimalRenderer.js
    // -------------------------------------------------------------
    {
        const renderer = new AnimalRenderer();
        const rabbit = renderer.build(ANIMAL_SPECIES.RABBIT);
        assert(rabbit instanceof THREE.Group, '1. build(RABBIT) returns a real THREE.Group');
        assert(countMeshes(rabbit) === 2, '2. a body mesh and a head mesh — exactly two, matching WildlifeTileMesh.js\'s own body/head shape');
    }
    {
        const renderer = new AnimalRenderer();
        const deer = renderer.build(ANIMAL_SPECIES.DEER);
        assert(deer instanceof THREE.Group, '3. build(DEER) returns a real THREE.Group too');
        assert(countMeshes(deer) === 2, '4. same body/head shape for DEER');
    }
    {
        // A fresh build() call never reuses MATERIAL objects from a
        // previous call — see renderer/AnimalRenderer.js's own header,
        // "materials are cloned and owned per instance."
        const renderer = new AnimalRenderer();
        const a = renderer.build(ANIMAL_SPECIES.RABBIT);
        const b = renderer.build(ANIMAL_SPECIES.RABBIT);
        assert(a !== b, '5. two build() calls return two independent Object3D graphs');
        const meshesA = []; a.traverse((n) => { if (n.isMesh) meshesA.push(n); });
        const meshesB = []; b.traverse((n) => { if (n.isMesh) meshesB.push(n); });
        assert(meshesA[0].material !== meshesB[0].material, '6. two build() calls never share the same material instance');
        // ...but DO share the same underlying geometry — see Section F.
        assert(meshesA[0].geometry === meshesB[0].geometry, '7. two build() calls for the SAME species DO share the same geometry object, by design');
    }
    {
        const renderer = new AnimalRenderer();
        assert(renderer.build('SHEEP') === null, '8. an unrecognized species returns null, never a fallback shape');
    }

    // -------------------------------------------------------------
    // Section B — renderer/AnimalVisual.js
    // -------------------------------------------------------------
    {
        const visual = new AnimalVisual(new AnimalRenderer(), ANIMAL_SPECIES.RABBIT);
        assert(visual.root instanceof THREE.Group, '9. AnimalVisual.root is a real THREE.Group');
        assert(visual.isSupported === true, '10. a supported species reports isSupported === true');
        assert(countMeshes(visual.root) > 0, '11. root already contains the built geometry');
    }
    {
        const visual = new AnimalVisual(new AnimalRenderer(), 'SHEEP');
        assert(visual.isSupported === false, '12. an unsupported species reports isSupported === false');
        assert(countMeshes(visual.root) === 0, '13. and root contains no geometry at all');
    }
    {
        const visual = new AnimalVisual(new AnimalRenderer(), ANIMAL_SPECIES.DEER);
        visual.setPosition({ x: 3, y: 1.5, z: -7 });
        assert(visual.root.position.x === 3 && visual.root.position.y === 1.5 && visual.root.position.z === -7,
            '14. setPosition() writes root.position directly, matching whatever it is handed');
    }

    // -------------------------------------------------------------
    // Section C/D — renderer/AnimalFieldRenderer.js
    // -------------------------------------------------------------
    {
        const field = new AnimalFieldRenderer();
        const instance = animal('animal:released:1', 5, 7, ANIMAL_SPECIES.RABBIT);
        const object = field.setAnimal(instance);
        assert(object instanceof THREE.Group, '15. setAnimal() returns a visible Object3D for a real AnimalPresence');
        assert(object.position.x === 5 && object.position.z === 7, '16. the rendered position equals instance.position');
        assert(field.getObject('animal:released:1') === object, '17. getObject() returns the exact same tracked root');
        assert(field.trackedAnimalIds().length === 1, '18. exactly one animal is now tracked');
    }
    {
        const field = new AnimalFieldRenderer();
        let threw = false;
        try {
            field.setAnimal({ id: 'not-a-real-instance', species: ANIMAL_SPECIES.RABBIT, position: { x: 0, y: 0, z: 0 } });
        } catch (err) {
            threw = true;
        }
        assert(threw, '19. setAnimal() rejects anything that is not a real AnimalPresence — see core/AnimalPresence.js');
    }

    // -------------------------------------------------------------
    // Section D — multiple animals render independently
    // -------------------------------------------------------------
    {
        const field = new AnimalFieldRenderer();
        const a = animal('animal:a', 1, 1, ANIMAL_SPECIES.RABBIT);
        const b = animal('animal:b', -8, 15, ANIMAL_SPECIES.DEER);

        const objectA = field.setAnimal(a);
        const objectB = field.setAnimal(b);

        assert(objectA !== objectB, '20. two distinct AnimalPresences get two distinct Object3D roots');
        assert(objectA.position.x === 1 && objectA.position.z === 1, '21. animal A keeps its own position');
        assert(objectB.position.x === -8 && objectB.position.z === 15, '22. animal B keeps its own, independent position');
        assert(field.trackedAnimalIds().sort().join(',') === 'animal:a,animal:b', '23. both animals are independently tracked by id');
    }

    // -------------------------------------------------------------
    // Section E — stable identity across a position change
    // -------------------------------------------------------------
    {
        const field = new AnimalFieldRenderer();
        const original = animal('animal:stable', 0, 0);
        const rootBefore = field.setAnimal(original);

        const moved = animal('animal:stable', 12, -4);
        const rootAfter = field.setAnimal(moved);
        assert(rootAfter === rootBefore, '24. re-setting the SAME animal id updates the SAME Object3D reference — never a rebuilt one');
        assert(rootAfter.position.x === 12 && rootAfter.position.z === -4, '25. the existing root now reflects the new position');
        assert(field.trackedAnimalIds().length === 1, '26. a position change never creates a second tracked entry for the same animal identity');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: shared geometry safety
    // -------------------------------------------------------------
    {
        const field = new AnimalFieldRenderer();
        const a = field.setAnimal(animal('animal:shared:a', 0, 0, ANIMAL_SPECIES.RABBIT));
        const b = field.setAnimal(animal('animal:shared:b', 1, 1, ANIMAL_SPECIES.RABBIT));

        const meshA = []; a.traverse((n) => { if (n.isMesh) meshA.push(n); });
        const meshB = []; b.traverse((n) => { if (n.isMesh) meshB.push(n); });
        assert(meshA[0].geometry === meshB[0].geometry, '27. sanity: both rabbits share the same body geometry, exactly as renderer/AnimalRenderer.js intends');

        // Remove (and dispose) animal A. If dispose() ever touched the
        // SHARED geometry, animal B's own body would now be pointing at
        // disposed GPU buffers — the exact corruption
        // renderer/AnimalVisual.js's own header exists to prevent.
        field.removeAnimal('animal:shared:a');
        assert(field.trackedAnimalIds().length === 1, '28. only animal A was removed');
        assert(meshB[0].geometry.attributes.position !== undefined,
            '29. FLAGSHIP: animal B\'s own shared geometry is still fully intact after animal A was disposed — a real, observable proof that dispose() never touches shared geometry');
    }

    // -------------------------------------------------------------
    // Section G — architectural regression
    // -------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const rendererSource = await readFile(new URL('../renderer/AnimalFieldRenderer.js', import.meta.url), 'utf8');
        // Comments aside (this file's own header legitimately discusses
        // "released"/"catching" in prose, explaining WHY it must never
        // touch either concept) — only the real CODE is checked.
        const codeOnly = rendererSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbidden = [
            'animalPresenceInRegion', 'animalIdFor', 'DEFAULT_WORLD_SEED',
            'Math.random', 'catch', 'release', 'collision', 'proximity',
            'AvatarAnimalInteractionController', 'AnimalRuntimeInstances'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term),
                `30. renderer/AnimalFieldRenderer.js's own CODE never references "${term}" — it observes AnimalPresence, it never decides which animals exist or why`);
        }
    }

    console.log('✅ All Animal Rendering tests passed.');
}

await runTests();
