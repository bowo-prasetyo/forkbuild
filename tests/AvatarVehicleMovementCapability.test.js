import { readFile } from 'node:fs/promises';
import { VehicleType } from '../core/VehicleType.js';
import {
    AvatarMovementCapabilityKind,
    isValidAvatarMovementCapabilityKind,
    AvatarVehicleMovementCapability,
    isValidAvatarVehicleMovementCapability,
    resolveAvatarVehicleMovementCapability
} from '../core/AvatarVehicleMovementCapability.js';

// 0.9.84 — Avatar-Vehicle Movement Capability Resolution,
// core/AvatarVehicleMovementCapability.js.
//
//   Section A: unmounted (VehicleType.NONE) -> WALK capability
//   Section B: BICYCLE -> GROUND_VEHICLE capability
//   Section C: MOTORCYCLE -> GROUND_VEHICLE capability
//   Section D: CAR -> GROUND_VEHICLE capability
//   Section E: DRONE -> a defined, but unsupported, AERIAL_VEHICLE capability
//   Section F: determinism — same input -> identical result
//   Section G: immutability — getter-only, frozen, no mutation
//   Section H: invalid input rejection
//   Section I: isValidAvatarMovementCapabilityKind() / isValidAvatarVehicleMovementCapability()
//   Section J: reconstruction — toJSON()/fromJSON() round-trips
//   Section K: architectural regression — no movement/runtime/rendering
//              imports anywhere in this file's own source
//
// Central architectural claim under test throughout: this file answers
// only "what movement capability kind does the avatar's current vehicle
// relationship imply," never how, or whether yet, that capability
// actually moves anything. See docs/Roadmap.md, 0.9.84.

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

async function runTests() {
    // -------------------------------------------------------------
    // Section A — unmounted
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        assert(capability.movementKind === AvatarMovementCapabilityKind.WALK, '1. VehicleType.NONE resolves to the WALK capability kind');
        assert(capability.vehicleType === VehicleType.NONE, '2. the resolved capability carries the exact VehicleType it was resolved from');
        assert(capability.supported === true, '3. WALK is a supported capability — it is the avatar\'s own existing movement');
    }

    // -------------------------------------------------------------
    // Section B — bicycle
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '4. BICYCLE resolves to the GROUND_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.BICYCLE, '5. the resolved capability carries VehicleType.BICYCLE');
        assert(capability.supported === true, '6. GROUND_VEHICLE is a supported capability kind');
    }

    // -------------------------------------------------------------
    // Section C — motorcycle
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '7. MOTORCYCLE resolves to the GROUND_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.MOTORCYCLE, '8. the resolved capability carries VehicleType.MOTORCYCLE');
        assert(capability.supported === true, '9. GROUND_VEHICLE is a supported capability kind, for motorcycle too');
    }

    // -------------------------------------------------------------
    // Section D — car
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '10. CAR resolves to the GROUND_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.CAR, '11. the resolved capability carries VehicleType.CAR');
        assert(capability.supported === true, '12. GROUND_VEHICLE is a supported capability kind, for car too');

        const bicycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        assert(capability.movementKind === bicycleCapability.movementKind && capability.movementKind === motorcycleCapability.movementKind,
            '13. bicycle, motorcycle, and car all share the exact same GROUND_VEHICLE movement kind — grouped, not three separate ground vocabularies');
    }

    // -------------------------------------------------------------
    // Section E — drone
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        assert(capability !== null && capability !== undefined, '14. DRONE resolves to a defined capability descriptor, never null/undefined');
        assert(capability.movementKind === AvatarMovementCapabilityKind.AERIAL_VEHICLE, '15. DRONE resolves to its own AERIAL_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.DRONE, '16. the resolved capability carries VehicleType.DRONE');
        assert(capability.supported === false, '17. AERIAL_VEHICLE is explicitly reported as not yet supported, rather than silently borrowing GROUND_VEHICLE');

        const carCapability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(capability.movementKind !== carCapability.movementKind, '18. drone is never folded into the same movement kind as a ground vehicle merely because both are vehicles');
    }

    // -------------------------------------------------------------
    // Section F — determinism
    // -------------------------------------------------------------
    {
        for (const vehicleType of Object.values(VehicleType)) {
            const first = resolveAvatarVehicleMovementCapability(vehicleType);
            const second = resolveAvatarVehicleMovementCapability(vehicleType);
            assert(first === second, `19. resolving ${vehicleType} twice returns the identical (===) capability instance both times`);
            assert(first.movementKind === second.movementKind && first.supported === second.supported,
                `20. resolving ${vehicleType} twice returns field-identical results (${vehicleType})`);
        }
    }

    // -------------------------------------------------------------
    // Section G — immutability
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        assert(Object.isFrozen(capability), '21. a resolved capability instance is frozen');

        try {
            capability.movementKind = AvatarMovementCapabilityKind.WALK;
        } catch (err) {
            // strict-mode assignment to a frozen object's accessor-less
            // property throws; that is an equally acceptable proof of
            // immutability as a silent no-op.
        }
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '22. attempting to reassign movementKind never changes it');

        try {
            capability.supported = false;
        } catch (err) {
            // see above.
        }
        assert(capability.supported === true, '23. attempting to reassign supported never changes it');

        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true).movementKind = AvatarMovementCapabilityKind.RUN,
            '24. directly constructing and then mutating a capability throws in strict module code');
    }

    // -------------------------------------------------------------
    // Section H — invalid input rejection
    // -------------------------------------------------------------
    {
        assertThrows(() => resolveAvatarVehicleMovementCapability('bicycle-type-typo'), '25. an unrecognized string is rejected');
        assertThrows(() => resolveAvatarVehicleMovementCapability(null), '26. null is rejected');
        assertThrows(() => resolveAvatarVehicleMovementCapability(undefined), '27. undefined is rejected');
        assertThrows(() => resolveAvatarVehicleMovementCapability(), '28. calling with no argument at all is rejected');
        assertThrows(() => resolveAvatarVehicleMovementCapability(42), '29. a non-string value is rejected');
        assertThrows(() => new AvatarVehicleMovementCapability('not-a-kind', VehicleType.NONE, true), '30. constructing with an invalid movementKind throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, 'not-a-type', true), '31. constructing with an invalid vehicleType throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, 'yes'), '32. constructing with a non-boolean supported throws');
    }

    // -------------------------------------------------------------
    // Section I — validators
    // -------------------------------------------------------------
    {
        assert(isValidAvatarMovementCapabilityKind(AvatarMovementCapabilityKind.WALK) === true, '33. WALK is a valid capability kind');
        assert(isValidAvatarMovementCapabilityKind(AvatarMovementCapabilityKind.GROUND_VEHICLE) === true, '34. GROUND_VEHICLE is a valid capability kind');
        assert(isValidAvatarMovementCapabilityKind(AvatarMovementCapabilityKind.AERIAL_VEHICLE) === true, '35. AERIAL_VEHICLE is a valid capability kind');
        assert(isValidAvatarMovementCapabilityKind('bicycle') === false, '36. a VehicleType value is not itself a valid capability kind');
        assert(isValidAvatarMovementCapabilityKind(null) === false, '37. null is not a valid capability kind');

        const capability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(isValidAvatarVehicleMovementCapability(capability) === true, '38. a resolved capability instance is a valid AvatarVehicleMovementCapability');
        assert(isValidAvatarVehicleMovementCapability(null) === false, '39. null is not a valid AvatarVehicleMovementCapability');
        assert(isValidAvatarVehicleMovementCapability({ movementKind: 'ground_vehicle', vehicleType: 'car', supported: true }) === false, '40. a plain object shaped like a capability is not itself a valid instance');
    }

    // -------------------------------------------------------------
    // Section J — reconstruction
    // -------------------------------------------------------------
    {
        const original = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const json = original.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ movementKind: 'ground_vehicle', vehicleType: 'motorcycle', supported: true }),
            '41. toJSON() produces the plain expected shape');

        const reconstructed = AvatarVehicleMovementCapability.fromJSON(json);
        assert(reconstructed.movementKind === original.movementKind && reconstructed.vehicleType === original.vehicleType && reconstructed.supported === original.supported,
            '42. fromJSON(toJSON()) round-trips to a field-identical capability');
        assert(reconstructed !== original, '43. fromJSON() constructs a genuinely new instance, not the shared cached one');
        assert(Object.isFrozen(reconstructed), '44. a reconstructed instance is frozen too');

        const roundTripAgain = AvatarVehicleMovementCapability.fromJSON(JSON.parse(JSON.stringify(original)));
        assert(roundTripAgain.movementKind === original.movementKind, '45. a full JSON.stringify/JSON.parse round trip preserves movementKind');
    }

    // -------------------------------------------------------------
    // Section K — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleMovementCapability.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence', 'AvatarTreeCollision',
            'AvatarMovementState', 'AvatarMovementSimulation',
            'AvatarContinuousMovement', 'AvatarPresence',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'maxSpeed', 'mass', 'gravity', 'collision', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `46. core/AvatarVehicleMovementCapability.js's own code never references "${term}" — a pure capability resolver only, never movement/runtime/rendering/physics/persistence/networking`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarVehicleMovementCapability.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify([
            'AvatarMovementCapabilityKind',
            'AvatarVehicleMovementCapability',
            'isValidAvatarMovementCapabilityKind',
            'isValidAvatarVehicleMovementCapability',
            'resolveAvatarVehicleMovementCapability'
        ]), '47. core/AvatarVehicleMovementCapability.js exports exactly the capability kind vocabulary, the descriptor class, its two validators, and the one resolver — nothing else');
    }

    console.log('✅ All Avatar-Vehicle Movement Capability tests passed.');
}

await runTests();
