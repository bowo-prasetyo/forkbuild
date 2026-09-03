import * as THREE from 'three';
import { VehicleRenderer } from '../renderer/VehicleRenderer.js';
import { VehicleVisual } from '../renderer/VehicleVisual.js';
import { VehicleFieldRenderer } from '../renderer/VehicleFieldRenderer.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.115 — Vehicle Rendering.
//
//   Section A: renderer/VehicleRenderer.js — VehicleType -> Three.js geometry
//   Section B: renderer/VehicleVisual.js   — one vehicle's live presence
//   Section C: renderer/VehicleFieldRenderer.js — VehicleInstance -> visible object
//   Section D: correct position (renders instance.position)
//   Section E: spawn/runtime distinction — the milestone's own central claim
//   Section F: multiple vehicles render independently
//   Section G: stable identity across a position change
//   Section H: an unsupported VehicleType is never silently rendered as a bicycle
//   Section I: architectural regression — the renderer never decides
//              placement, identity, or existence
//
// No real WebGL/<canvas> anywhere — the same posture
// tests/AvatarRendering.test.js's own header already establishes: these
// classes build real THREE.Group/Mesh/Material objects (three's CPU-side
// scene graph needs no GPU context at all).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function countMeshes(object3D) {
    let count = 0;
    object3D.traverse((node) => {
        if (node.isMesh) count++;
    });
    return count;
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — renderer/VehicleRenderer.js
    // -------------------------------------------------------------
    {
        const renderer = new VehicleRenderer();
        const bicycle = renderer.build(VehicleType.BICYCLE);
        assert(bicycle instanceof THREE.Group, '1. build(BICYCLE) returns a real THREE.Group');
        assert(countMeshes(bicycle) > 0, '2. the bicycle group contains real, visible mesh geometry');
    }
    {
        // A fresh build() call never reuses geometry/objects from a
        // previous call — each vehicle gets its own independent graph.
        const renderer = new VehicleRenderer();
        const a = renderer.build(VehicleType.BICYCLE);
        const b = renderer.build(VehicleType.BICYCLE);
        assert(a !== b, '3. two build() calls return two independent Object3D graphs');
    }
    {
        const renderer = new VehicleRenderer();
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            assert(renderer.build(type) === null, `4. build(${type}) returns null — no visual exists for it yet`);
        }
    }

    // -------------------------------------------------------------
    // Section B — renderer/VehicleVisual.js
    // -------------------------------------------------------------
    {
        const visual = new VehicleVisual(new VehicleRenderer(), VehicleType.BICYCLE);
        assert(visual.root instanceof THREE.Group, '5. VehicleVisual.root is a real THREE.Group');
        assert(visual.isSupported === true, '6. a supported type reports isSupported === true');
        assert(countMeshes(visual.root) > 0, '7. root already contains the built bicycle geometry');
    }
    {
        const visual = new VehicleVisual(new VehicleRenderer(), VehicleType.DRONE);
        assert(visual.isSupported === false, '8. an unsupported type reports isSupported === false');
        assert(countMeshes(visual.root) === 0, '9. root has no geometry for an unsupported type — never a fallback shape');
    }
    {
        const visual = new VehicleVisual(new VehicleRenderer(), VehicleType.BICYCLE);
        visual.setPosition({ x: 3, y: 1.5, z: -7 });
        assert(visual.root.position.x === 3 && visual.root.position.y === 1.5 && visual.root.position.z === -7,
            '10. setPosition() writes root.position directly, matching whatever it is handed');
    }

    // -------------------------------------------------------------
    // Section C/D — renderer/VehicleFieldRenderer.js: appearance + position
    // -------------------------------------------------------------
    {
        const field = new VehicleFieldRenderer();
        const instance = new VehicleInstance({
            id: 'vehicle:1:0,0',
            type: VehicleType.BICYCLE,
            spawnPosition: { x: 5, y: 0, z: 7 }
        });
        const object = field.setVehicle(instance);
        assert(object instanceof THREE.Group, '11. setVehicle() returns a visible Object3D for a generated bicycle VehicleInstance');
        assert(object.position.x === 5 && object.position.y === 0 && object.position.z === 7,
            '12. the rendered position equals instance.position');
        assert(field.getObject('vehicle:1:0,0') === object, '13. getObject() returns the exact same tracked root');
        assert(field.trackedVehicleIds().length === 1, '14. exactly one vehicle is now tracked');
    }

    // -------------------------------------------------------------
    // Section E — spawn vs. runtime distinction (the milestone's own
    // central regression): deliberately different coordinates.
    // -------------------------------------------------------------
    {
        const field = new VehicleFieldRenderer();
        const instance = new VehicleInstance({
            id: 'vehicle:2:0,0',
            type: VehicleType.BICYCLE,
            spawnPosition: { x: 10, y: 0, z: 10 },
            position: { x: 30, y: 0, z: 40 }
        });
        assert(instance.spawnPosition.x === 10 && instance.spawnPosition.z === 10,
            '15. sanity: spawnPosition really is (10, 0, 10)');
        assert(instance.position.x === 30 && instance.position.z === 40,
            '16. sanity: position really is (30, 0, 40), deliberately different from spawnPosition');

        const object = field.setVehicle(instance);
        assert(object.position.x === 30 && object.position.y === 0 && object.position.z === 40,
            '17. the renderer places the vehicle at instance.position (30, 0, 40)');
        assert(!(object.position.x === 10 && object.position.z === 10),
            '18. the renderer never places the vehicle at instance.spawnPosition (10, 0, 10)');
    }

    // -------------------------------------------------------------
    // Section F — multiple vehicles render independently
    // -------------------------------------------------------------
    {
        const field = new VehicleFieldRenderer();
        const a = new VehicleInstance({ id: 'vehicle:a', type: VehicleType.BICYCLE, spawnPosition: { x: 1, y: 0, z: 1 } });
        const b = new VehicleInstance({ id: 'vehicle:b', type: VehicleType.BICYCLE, spawnPosition: { x: -8, y: 0, z: 15 } });

        const objectA = field.setVehicle(a);
        const objectB = field.setVehicle(b);

        assert(objectA !== objectB, '19. two distinct VehicleInstances get two distinct Object3D roots');
        assert(objectA.position.x === 1 && objectA.position.z === 1, '20. vehicle A keeps its own position');
        assert(objectB.position.x === -8 && objectB.position.z === 15, '21. vehicle B keeps its own, independent position');
        assert(field.trackedVehicleIds().sort().join(',') === 'vehicle:a,vehicle:b',
            '22. both vehicles are independently tracked by id');
    }

    // -------------------------------------------------------------
    // Section G — stable identity across a position change
    // -------------------------------------------------------------
    {
        const field = new VehicleFieldRenderer();
        const original = new VehicleInstance({
            id: 'vehicle:stable:0,0',
            type: VehicleType.BICYCLE,
            spawnPosition: { x: 0, y: 0, z: 0 }
        });
        const rootBefore = field.setVehicle(original);

        const moved = original.withPosition({ x: 12, y: 0, z: -4 });
        assert(moved.id === original.id, '23. sanity: withPosition() carries the exact same id forward');

        const rootAfter = field.setVehicle(moved);
        assert(rootAfter === rootBefore, '24. moving a vehicle updates the SAME Object3D reference — never a rebuilt one');
        assert(rootAfter.position.x === 12 && rootAfter.position.z === -4,
            '25. the existing root now reflects the new position');
        assert(field.trackedVehicleIds().length === 1,
            '26. a position change never creates a second tracked entry for the same vehicle identity');
    }

    // -------------------------------------------------------------
    // Section H — an unsupported VehicleType is never silently
    // rendered as a bicycle
    // -------------------------------------------------------------
    {
        const field = new VehicleFieldRenderer();
        const drone = new VehicleInstance({ id: 'vehicle:drone:0,0', type: VehicleType.DRONE, spawnPosition: { x: 0, y: 0, z: 0 } });
        const object = field.setVehicle(drone);
        assert(object === null, '27. setVehicle() returns null for a vehicle type with no visual yet');
        assert(field.getObject('vehicle:drone:0,0') === null, '28. an unsupported vehicle is never tracked');
        assert(field.trackedVehicleIds().length === 0, '29. trackedVehicleIds() stays empty — nothing was silently substituted');
    }
    {
        const field = new VehicleFieldRenderer();
        let threw = false;
        try {
            field.setVehicle({ id: 'not-a-real-instance', type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 } });
        } catch (err) {
            threw = true;
        }
        assert(threw, '30. setVehicle() rejects anything that is not a real VehicleInstance — see core/VehicleInstance.js#isValidVehicleInstance');
    }

    // -------------------------------------------------------------
    // Section I — architectural regression: the renderer decides
    // nothing about placement, identity, or existence.
    // -------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const rendererSource = await readFile(new URL('../renderer/VehicleFieldRenderer.js', import.meta.url), 'utf8');
        const forbidden = [
            'vehiclePresenceInRegion', 'vehicleIdFor', 'DEFAULT_WORLD_SEED',
            'Math.random', 'mount', 'dismount', 'collision', 'proximity',
            'AvatarVehicleInteractionController'
        ];
        for (const term of forbidden) {
            assert(!rendererSource.includes(term),
                `31. renderer/VehicleFieldRenderer.js never references "${term}" — it observes VehicleInstance, it never decides placement, identity, or existence`);
        }
        const visualSource = await readFile(new URL('../renderer/VehicleVisual.js', import.meta.url), 'utf8');
        const visualCodeOnly = visualSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!visualCodeOnly.includes('spawnPosition'),
            '32. renderer/VehicleVisual.js\'s own CODE (comments aside) never references spawnPosition — it only ever receives a plain position');
    }

    console.log('✅ All Vehicle Rendering tests passed.');
}

await runTests();
