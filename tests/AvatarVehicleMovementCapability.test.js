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
// only "what movement capability — kind, support, and (as of 0.9.86,
// now per-vehicle as of 0.9.87) base speed — does the avatar's current
// vehicle relationship imply," never how, or whether yet, that
// capability actually moves anything. See docs/Roadmap.md, 0.9.84,
// 0.9.86, and 0.9.87.
//
// 0.9.86 note: every constructor call below now passes a fourth
// `movementSpeed` argument (the class's own new required field — see
// core/AvatarVehicleMovementCapability.js's own 0.9.86 header), and
// each section's own expected-shape assertions now include it.
//
// 0.9.87 note: BICYCLE/MOTORCYCLE/CAR no longer share one number —
// Sections B/C/D now assert the exact per-vehicle values and the
// WALK < BICYCLE < MOTORCYCLE < CAR ordering, superseding 0.9.86's own
// "all three share the exact same movementSpeed" assertions.
//
// 0.9.88 note: every constructor call below now passes a fifth
// `collisionRadius` argument (the class's own new required field — see
// core/AvatarVehicleMovementCapability.js's own 0.9.88 header), and
// each section's own expected-shape assertions now include it. Section
// K's own forbidden-term sweep no longer forbids "collision" — this
// file's entire point, as of 0.9.88, is to carry a collision-radius
// capability field; see that section's own updated comment.

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
        assert(capability.movementSpeed === 3, '3a. WALK\'s own movementSpeed is 3 world units/second — MUST equal core/AvatarMovementSimulation.js\'s own WALK_SPEED (see this file\'s own 0.9.86 header)');
        assert(capability.collisionRadius === 0.35, '3b. WALK\'s own collisionRadius is 0.35 world units — MUST equal core/AvatarCollision.js\'s own AVATAR_COLLISION_RADIUS (see this file\'s own 0.9.88 header)');
    }

    // -------------------------------------------------------------
    // Section B — bicycle
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '4. BICYCLE resolves to the GROUND_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.BICYCLE, '5. the resolved capability carries VehicleType.BICYCLE');
        assert(capability.supported === true, '6. GROUND_VEHICLE is a supported capability kind');
        assert(capability.movementSpeed === 6, '6a. BICYCLE\'s own movementSpeed is 6 world units/second — strictly greater than WALK\'s own 3');
        assert(capability.collisionRadius === 0.45, '6b. BICYCLE\'s own collisionRadius is 0.45 world units — strictly greater than WALK\'s own 0.35 (0.9.88)');
    }

    // -------------------------------------------------------------
    // Section C — motorcycle
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '7. MOTORCYCLE resolves to the GROUND_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.MOTORCYCLE, '8. the resolved capability carries VehicleType.MOTORCYCLE');
        assert(capability.supported === true, '9. GROUND_VEHICLE is a supported capability kind, for motorcycle too');
        assert(capability.movementSpeed === 9, '9a. MOTORCYCLE\'s own movementSpeed is 9 world units/second — strictly greater than BICYCLE\'s own 6 (0.9.87)');

        const bicycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        assert(capability.movementSpeed > bicycleCapability.movementSpeed, '9b. MOTORCYCLE is strictly faster than BICYCLE (0.9.87)');
        assert(capability.collisionRadius === 0.55, '9c. MOTORCYCLE\'s own collisionRadius is 0.55 world units — strictly greater than BICYCLE\'s own 0.45 (0.9.88)');
        assert(capability.collisionRadius > bicycleCapability.collisionRadius, '9d. MOTORCYCLE has a strictly larger collision footprint than BICYCLE (0.9.88)');
    }

    // -------------------------------------------------------------
    // Section D — car
    // -------------------------------------------------------------
    {
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(capability.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE, '10. CAR resolves to the GROUND_VEHICLE capability kind');
        assert(capability.vehicleType === VehicleType.CAR, '11. the resolved capability carries VehicleType.CAR');
        assert(capability.supported === true, '12. GROUND_VEHICLE is a supported capability kind, for car too');
        assert(capability.movementSpeed === 12, '12a. CAR\'s own movementSpeed is 12 world units/second — strictly greater than MOTORCYCLE\'s own 9 (0.9.87)');
        assert(capability.collisionRadius === 0.80, '12b. CAR\'s own collisionRadius is 0.80 world units — strictly greater than MOTORCYCLE\'s own 0.55 (0.9.88)');

        const walkCapability = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        const bicycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        assert(capability.movementKind === bicycleCapability.movementKind && capability.movementKind === motorcycleCapability.movementKind,
            '13. bicycle, motorcycle, and car all share the exact same GROUND_VEHICLE movement kind — grouped, not three separate ground vocabularies');
        assert(
            walkCapability.movementSpeed < bicycleCapability.movementSpeed
            && bicycleCapability.movementSpeed < motorcycleCapability.movementSpeed
            && motorcycleCapability.movementSpeed < capability.movementSpeed,
            '13a. WALK < BICYCLE < MOTORCYCLE < CAR — the exact ordering this milestone (0.9.87) exists to establish, superseding 0.9.86\'s own "bicycle/motorcycle/car share one number" behavior'
        );
        assert(
            walkCapability.collisionRadius < bicycleCapability.collisionRadius
            && bicycleCapability.collisionRadius < motorcycleCapability.collisionRadius
            && motorcycleCapability.collisionRadius < capability.collisionRadius,
            '13b. WALK < BICYCLE < MOTORCYCLE < CAR for collisionRadius too — the exact ordering 0.9.88 exists to establish for physical occupancy'
        );
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
        assert(capability.movementSpeed === 0, '17a. DRONE\'s own movementSpeed is 0 — inert, since `supported: false` already blocks movement before any speed is ever consulted (see application/AvatarMovementController.js\'s own 0.9.85 tick() guard)');
        assert(capability.collisionRadius === 0, '17b. DRONE\'s own collisionRadius is 0 — inert, for the identical reason movementSpeed\'s own 0 already is (0.9.88)');

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
            assert(first.movementKind === second.movementKind && first.supported === second.supported && first.movementSpeed === second.movementSpeed && first.collisionRadius === second.collisionRadius,
                `20. resolving ${vehicleType} twice returns field-identical results, movementSpeed and collisionRadius included (${vehicleType})`);
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

        try {
            capability.movementSpeed = 999;
        } catch (err) {
            // see above.
        }
        assert(capability.movementSpeed === 6, '23a. attempting to reassign movementSpeed never changes it');

        try {
            capability.collisionRadius = 999;
        } catch (err) {
            // see above.
        }
        assert(capability.collisionRadius === 0.45, '23b. attempting to reassign collisionRadius never changes it');

        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35).movementKind = AvatarMovementCapabilityKind.RUN,
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
        assertThrows(() => new AvatarVehicleMovementCapability('not-a-kind', VehicleType.NONE, true, 3, 0.35), '30. constructing with an invalid movementKind throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, 'not-a-type', true, 3, 0.35), '31. constructing with an invalid vehicleType throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, 'yes', 3, 0.35), '32. constructing with a non-boolean supported throws');
        // 0.9.86 — the movementSpeed field gets the same "reject
        // anything that isn't a finite, non-negative number" treatment.
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, undefined, 0.35), '32a. constructing with movementSpeed omitted (undefined) throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, null, 0.35), '32b. constructing with a null movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, '3', 0.35), '32c. constructing with a string movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, -1, 0.35), '32d. constructing with a negative movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, NaN, 0.35), '32e. constructing with a NaN movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, Infinity, 0.35), '32f. constructing with an infinite movementSpeed throws');
        // A movementSpeed of exactly 0 is valid (DRONE's own inert value
        // — see core/AvatarVehicleMovementCapability.js's own 0.9.86
        // header) — never rejected merely for being falsy.
        const zeroSpeedCapability = new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false, 0, 0);
        assert(zeroSpeedCapability.movementSpeed === 0, '32g. a movementSpeed of exactly 0 is accepted, not rejected as falsy');

        // 0.9.88 — the new collisionRadius field gets the identical
        // "reject anything that isn't a finite, non-negative number"
        // treatment.
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3), '32h. constructing with collisionRadius omitted (undefined) throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, null), '32i. constructing with a null collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, '0.35'), '32j. constructing with a string collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, -1), '32k. constructing with a negative collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, NaN), '32l. constructing with a NaN collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, Infinity), '32m. constructing with an infinite collisionRadius throws');
        // A collisionRadius of exactly 0 is valid (DRONE's own inert
        // value — see core/AvatarVehicleMovementCapability.js's own
        // 0.9.88 header) — never rejected merely for being falsy.
        const zeroRadiusCapability = new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false, 0, 0);
        assert(zeroRadiusCapability.collisionRadius === 0, '32n. a collisionRadius of exactly 0 is accepted, not rejected as falsy');
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
        assert(isValidAvatarVehicleMovementCapability({ movementKind: 'ground_vehicle', vehicleType: 'car', supported: true, movementSpeed: 6, collisionRadius: 0.8 }) === false, '40. a plain object shaped like a capability is not itself a valid instance');
    }

    // -------------------------------------------------------------
    // Section J — reconstruction
    // -------------------------------------------------------------
    {
        const original = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const json = original.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ movementKind: 'ground_vehicle', vehicleType: 'motorcycle', supported: true, movementSpeed: 9, collisionRadius: 0.55 }),
            '41. toJSON() produces the plain expected shape, movementSpeed (0.9.86, per-vehicle as of 0.9.87) and collisionRadius (0.9.88) included');

        const reconstructed = AvatarVehicleMovementCapability.fromJSON(json);
        assert(reconstructed.movementKind === original.movementKind && reconstructed.vehicleType === original.vehicleType && reconstructed.supported === original.supported && reconstructed.movementSpeed === original.movementSpeed && reconstructed.collisionRadius === original.collisionRadius,
            '42. fromJSON(toJSON()) round-trips to a field-identical capability, movementSpeed and collisionRadius included');
        assert(reconstructed !== original, '43. fromJSON() constructs a genuinely new instance, not the shared cached one');
        assert(Object.isFrozen(reconstructed), '44. a reconstructed instance is frozen too');

        const roundTripAgain = AvatarVehicleMovementCapability.fromJSON(JSON.parse(JSON.stringify(original)));
        assert(roundTripAgain.movementKind === original.movementKind && roundTripAgain.movementSpeed === original.movementSpeed && roundTripAgain.collisionRadius === original.collisionRadius,
            '45. a full JSON.stringify/JSON.parse round trip preserves movementKind, movementSpeed, and collisionRadius');
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

        // 0.9.88 note: bare "collision" is deliberately no longer
        // forbidden — this file's own point, as of 0.9.88, is to carry
        // a `collisionRadius` capability field (see that field's own
        // header). What stays forbidden is any reference to the
        // COLLISION MATHEMATICS or COLLISION MODULES that field feeds —
        // this file still commits no opinion about circles, AABBs,
        // trees, or bricks; it only ever decides which NUMBER a vehicle
        // relationship implies.
        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence',
            'AvatarTreeCollision.js', 'AvatarTreeMovement.js', 'AvatarTreeCollisionQuery.js',
            'AvatarCollision.js', 'AvatarTreeConstraint',
            'circlesIntersect', 'avatarTreeCollision', 'resolveAvatarTreeMovement',
            'treeCollisionCandidatesForMovement', 'AVATAR_COLLISION_RADIUS',
            'AvatarMovementState', 'AvatarMovementSimulation',
            'AvatarContinuousMovement', 'AvatarPresence',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'maxSpeed', 'mass', 'gravity', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `46. core/AvatarVehicleMovementCapability.js's own code never references "${term}" — a pure capability resolver only, never movement/runtime/rendering/collision mathematics/physics/persistence/networking`);
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
