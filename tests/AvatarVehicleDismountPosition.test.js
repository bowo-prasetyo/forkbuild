import { readFile } from 'node:fs/promises';
import {
    resolveAvatarVehicleDismountPosition, BICYCLE_DISMOUNT_OFFSET_X
} from '../core/AvatarVehicleDismountPosition.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';

// 0.9.80 — Vehicle Dismount Position Resolution, core/AvatarVehicleDismountPosition.js.
//
//   Section A: deterministic destination — same input, same output
//   Section B: bicycle-specific resolution — the exact candidate a bicycle produces
//   Section C: X/Z semantics — horizontal displacement is correct
//   Section D: Y handling — never copies the vehicle's own terrain-sampled Y
//   Section E: null/invalid inputs — malformed input throws, an unknown
//              vehicle type resolves to null rather than erroring
//   Section F: vehicle identity — driven by the actual VehiclePresence,
//              never a vehicleId or a reconstructed/looked-up vehicle
//   Section G: no mutation — neither the vehicle nor its position changes
//   Section H: determinism across separate, equal-but-distinct instances
//   Section I: architectural regression — no mount-state, transition,
//              vehicle-lookup, orientation, collision, terrain-sampling,
//              input, rendering, or persistence dependency
//
// Central architectural claim under test throughout: this file answers
// only "where would the avatar land if it dismounted THIS vehicle" — it
// never decides whether a dismount should happen, never touches mount
// state, and never resolves a vehicle from an id. See docs/Roadmap.md,
// 0.9.80.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (err) {
        threw = true;
    }
    assert(threw, message);
}

function bicycleAt(x, y, z, id = 'vehicle:1:0,0') {
    return new VehiclePresence({ id, type: VehicleType.BICYCLE, position: new Position(x, y, z) });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — deterministic destination
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(10, 3, -4);
        const first = resolveAvatarVehicleDismountPosition(vehicle);
        const second = resolveAvatarVehicleDismountPosition(vehicle);
        assert(first.equals(second), '1. the same vehicle input always resolves to an equal dismount position');
    }

    // -------------------------------------------------------------
    // Section B — bicycle-specific resolution
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(5, 1.2, 7);
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(result instanceof Position, '2. a valid bicycle produces a Position instance');
        assert(result.x === 5 + BICYCLE_DISMOUNT_OFFSET_X, '3. x is offset from the vehicle by exactly BICYCLE_DISMOUNT_OFFSET_X');
        assert(result.z === 7, '4. z matches the vehicle exactly, unshifted');
        assert(result.y === 0, '5. y is the flat avatar-domain ground level, not the vehicle\'s own y');
    }

    // -------------------------------------------------------------
    // Section C — X/Z semantics
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(0, 0, 0);
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(result.x === BICYCLE_DISMOUNT_OFFSET_X, '6. at the origin, x is offset by exactly the fixed constant');
        assert(result.z === 0, '7. at the origin, z is left exactly at the vehicle\'s own z');
    }
    {
        // Negative coordinates: the offset is additive, not a magnitude
        // or a "move away from origin" rule.
        const vehicle = bicycleAt(-20, 2, -35);
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(result.x === -20 + BICYCLE_DISMOUNT_OFFSET_X, '8. the offset is added to a negative x exactly as it is to a positive one');
        assert(result.z === -35, '9. z is preserved exactly, including when negative');
    }

    // -------------------------------------------------------------
    // Section D — Y handling
    // -------------------------------------------------------------
    {
        // The vehicle's own Y is a nonzero terrain sample
        // (core/VehiclePlacement.js) — proving the result does not
        // blindly copy it is the entire point of this section.
        const vehicle = bicycleAt(3, 17.5, 9);
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(result.y === 0, '10. the resolved Y is 0 regardless of how large the vehicle\'s own terrain-sampled Y is');
    }
    {
        const vehicle = bicycleAt(3, -8.25, 9);
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(result.y === 0, '11. the resolved Y is 0 even when the vehicle\'s own Y is negative');
    }

    // -------------------------------------------------------------
    // Section E — null/invalid inputs
    // -------------------------------------------------------------
    {
        assertThrows(() => resolveAvatarVehicleDismountPosition(null), '12. null is rejected — not a VehiclePresence instance');
        assertThrows(() => resolveAvatarVehicleDismountPosition(undefined), '13. undefined is rejected');
        assertThrows(() => resolveAvatarVehicleDismountPosition('vehicle:1:0,0'), '14. a bare vehicle id string is rejected');
        assertThrows(
            () => resolveAvatarVehicleDismountPosition({ id: 'vehicle:1:0,0', type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 } }),
            '15. a plain object shaped like a VehiclePresence is rejected — only a real instance is accepted'
        );
    }
    {
        // A vehicle type this file has no dismount rule for is a
        // legitimate "no destination known" answer, not malformed input.
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            const vehicle = new VehiclePresence({ id: 'vehicle:1:0,0', type, position: new Position(1, 1, 1) });
            const result = resolveAvatarVehicleDismountPosition(vehicle);
            assert(result === null, `16. a ${type} vehicle resolves to null rather than throwing or guessing at a geometry it has none for`);
        }
    }

    // -------------------------------------------------------------
    // Section F — vehicle identity
    // -------------------------------------------------------------
    {
        // The function's own signature accepts only a VehiclePresence —
        // there is no vehicleId parameter for it to resolve through a
        // lookup, and two VehiclePresence instances describing the same
        // conceptual vehicle but built as separate objects still resolve
        // identically, proving the result is driven by the position this
        // instance actually carries, never a cached/looked-up one.
        const a = bicycleAt(12, 4, -6, 'vehicle:1:3,-2');
        const b = bicycleAt(12, 4, -6, 'vehicle:1:3,-2');
        assert(a !== b, '17. two separately constructed VehiclePresence instances are distinct objects');
        const resultA = resolveAvatarVehicleDismountPosition(a);
        const resultB = resolveAvatarVehicleDismountPosition(b);
        assert(resultA.equals(resultB), '18. both resolve to the same position, since only the VehiclePresence actually handed in is ever consulted');
    }
    {
        // A vehicle whose id is well-formed but nonsensical is still
        // resolved purely from its position — the id itself plays no
        // role in the computation.
        const vehicle = bicycleAt(2, 0, 2, 'vehicle:not-really-checked:999,999');
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(result.x === 2 + BICYCLE_DISMOUNT_OFFSET_X && result.z === 2, '19. the vehicle id has no bearing on the resolved position');
    }

    // -------------------------------------------------------------
    // Section G — no mutation
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(6, 2, 6);
        const beforeJSON = vehicle.toJSON();
        const result = resolveAvatarVehicleDismountPosition(vehicle);
        assert(JSON.stringify(vehicle.toJSON()) === JSON.stringify(beforeJSON), '20. the vehicle is never mutated by resolution');
        assert(Object.isFrozen(vehicle), '21. the vehicle instance remains frozen');
        assert(result !== vehicle.position, '22. the result is a newly constructed Position, never the vehicle\'s own position object');
    }

    // -------------------------------------------------------------
    // Section H — determinism across distinct instances
    // -------------------------------------------------------------
    {
        const first = resolveAvatarVehicleDismountPosition(bicycleAt(8, 1, 8));
        const second = resolveAvatarVehicleDismountPosition(bicycleAt(8, 1, 8));
        assert(first !== second, '23. two separate resolutions produce distinct Position instances...');
        assert(first.equals(second), '24. ...but equal in value, since neither call carries any hidden state');
    }

    // -------------------------------------------------------------
    // Section I — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleDismountPosition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarVehicleMount', 'clearAvatarVehicleMount', 'createAvatarVehicleMount', 'isValidAvatarVehicleMount',
            'AvatarVehicleMountTransition', 'deriveAvatarVehicleMount',
            'AvatarVehicleDismountIntent', 'deriveAvatarVehicleDismountIntent',
            'AvatarVehicleInteractionIntent', 'AvatarVehicleInteractionTarget', 'resolveAvatarVehicleInteractionTarget',
            'AvatarVehicleProximity', 'withinRadiusXZ', 'VEHICLE_INTERACTION_RADIUS',
            'VehiclePlacement', 'vehiclePresenceInRegion', 'VehicleIdentity', 'vehicleIdFor',
            'TerrainHeightField', 'terrainHeightAt', 'TerrainEcology', 'ecologyZoneAt', 'Hydrology', 'isRiverAt',
            'AvatarMovementController', 'AvatarMovementState', 'AvatarMovementSimulation',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'mass', 'gravity', 'collision', 'Collision', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `25. core/AvatarVehicleDismountPosition.js's own code never references "${term}" — a pure spatial resolver only, never mount-state/transition/vehicle-lookup/terrain-sampling/collision/input/rendering/persistence/networking`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarVehicleDismountPosition.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(
            JSON.stringify(exportedNames) === JSON.stringify(['BICYCLE_DISMOUNT_OFFSET_X', 'resolveAvatarVehicleDismountPosition']),
            '26. core/AvatarVehicleDismountPosition.js exports exactly the offset constant and the one resolver function — nothing else'
        );
    }

    console.log('✅ All Vehicle Dismount Position Resolution tests passed.');
}

await runTests();
