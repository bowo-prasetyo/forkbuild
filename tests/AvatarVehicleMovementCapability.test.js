import { readFile } from 'node:fs/promises';
import { VehicleType } from '../core/VehicleType.js';
import {
    AvatarMovementCapabilityKind,
    isValidAvatarMovementCapabilityKind,
    AvatarVehicleMovementCapability,
    isValidAvatarVehicleMovementCapability,
    resolveAvatarVehicleMovementCapability
} from '../core/AvatarVehicleMovementCapability.js';
import {
    AvatarMovementDirectionCapability,
    isValidAvatarMovementDirectionCapability
} from '../core/AvatarMovementDirectionCapability.js';
import {
    AvatarMovementAccelerationKind,
    AvatarMovementAccelerationCapability,
    isValidAvatarMovementAccelerationCapability
} from '../core/AvatarMovementAccelerationCapability.js';

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
// now per-vehicle as of 0.9.87) base speed, (0.9.88) collision radius,
// and (0.9.89) permitted movement directions — does the avatar's
// current vehicle relationship imply," never how, or whether yet, that
// capability actually moves anything. See docs/Roadmap.md, 0.9.84,
// 0.9.86, 0.9.87, 0.9.88, and 0.9.89.
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
//
// 0.9.89 note: every constructor call below now passes a sixth
// `movementDirections` argument (an `AvatarMovementDirectionCapability`
// — the class's own new required field, see
// core/AvatarVehicleMovementCapability.js's own 0.9.89 header), and
// each section's own expected-shape assertions now include it. Every
// currently-defined, supported capability (WALK, and GROUND_VEHICLE via
// BICYCLE/MOTORCYCLE/CAR) permits both directions; AERIAL_VEHICLE/DRONE's
// own value is the inert `forward: false, backward: false`.
//
// 0.9.90 note: every constructor call below now passes a seventh
// `acceleration` argument (an `AvatarMovementAccelerationCapability` —
// the class's own new required field, see
// core/AvatarVehicleMovementCapability.js's own 0.9.90 header), and each
// section's own expected-shape assertions now include it. WALK is
// `INSTANT`/`0`; BICYCLE/MOTORCYCLE/CAR are each `RATE_LIMITED` with
// their own strictly positive, deliberately NON-monotonic rates (see
// Section D); AERIAL_VEHICLE/DRONE's own value is the identical
// `INSTANT`/`0` WALK uses, reused rather than duplicated.

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

const BOTH_DIRECTIONS = new AvatarMovementDirectionCapability(true, true);
const NO_DIRECTIONS = new AvatarMovementDirectionCapability(false, false);
const INSTANT_ACCEL = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.INSTANT, 0);
const RATE_LIMITED_ACCEL = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 3);

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
        assert(capability.movementDirections.forward === true && capability.movementDirections.backward === true,
            '3c. WALK\'s own movementDirections permits both forward and backward — the avatar\'s existing on-foot movement has always allowed both (0.9.89)');
        assert(capability.acceleration.kind === AvatarMovementAccelerationKind.INSTANT, '3d. WALK\'s own acceleration kind is INSTANT — on-foot movement has always reached movementSpeed in a single tick (0.9.90)');
        assert(capability.acceleration.acceleration === 0, '3e. WALK\'s own acceleration rate is 0 — inert, paired with INSTANT (0.9.90)');
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
        assert(capability.movementDirections.forward === true && capability.movementDirections.backward === true,
            '6c. BICYCLE\'s own movementDirections permits both forward and backward (0.9.89)');
        assert(capability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED, '6d. BICYCLE\'s own acceleration kind is RATE_LIMITED (0.9.90)');
        assert(capability.acceleration.acceleration === 3 && capability.acceleration.acceleration > 0, '6e. BICYCLE\'s own acceleration rate is 3 world units/second^2 — strictly positive (0.9.90)');
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
        assert(capability.movementDirections.forward === true && capability.movementDirections.backward === true,
            '9e. MOTORCYCLE\'s own movementDirections permits both forward and backward (0.9.89)');
        assert(capability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED, '9f. MOTORCYCLE\'s own acceleration kind is RATE_LIMITED (0.9.90)');
        assert(capability.acceleration.acceleration === 5, '9g. MOTORCYCLE\'s own acceleration rate is 5 world units/second^2 (0.9.90)');
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
        assert(capability.movementDirections.forward === true && capability.movementDirections.backward === true,
            '12c. CAR\'s own movementDirections permits both forward and backward (0.9.89)');
        assert(capability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED, '12d. CAR\'s own acceleration kind is RATE_LIMITED (0.9.90)');
        assert(capability.acceleration.acceleration === 4, '12e. CAR\'s own acceleration rate is 4 world units/second^2 (0.9.90)');

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
        assert(
            walkCapability.movementDirections.forward === bicycleCapability.movementDirections.forward
            && bicycleCapability.movementDirections.forward === motorcycleCapability.movementDirections.forward
            && motorcycleCapability.movementDirections.forward === capability.movementDirections.forward
            && walkCapability.movementDirections.backward === bicycleCapability.movementDirections.backward
            && bicycleCapability.movementDirections.backward === motorcycleCapability.movementDirections.backward
            && motorcycleCapability.movementDirections.backward === capability.movementDirections.backward,
            '13c. WALK, BICYCLE, MOTORCYCLE, and CAR all resolve to the exact same movementDirections — this milestone (0.9.89) establishes the seam, without yet differentiating any real vehicle\'s own directions'
        );
        // 0.9.90 — acceleration is a genuinely INDEPENDENT dimension from
        // movementSpeed: CAR's own top speed is strictly the highest of
        // the three ground vehicles, yet its own acceleration rate is
        // strictly LOWER than MOTORCYCLE's — a faster vehicle does not
        // automatically accelerate faster. See
        // core/AvatarVehicleMovementCapability.js's own 0.9.90 header.
        assert(motorcycleCapability.movementSpeed < capability.movementSpeed,
            '13d. MOTORCYCLE\'s own movementSpeed is strictly less than CAR\'s (re-confirming 0.9.87\'s own ordering, as the baseline this independence claim is measured against)');
        assert(motorcycleCapability.acceleration.acceleration > capability.acceleration.acceleration,
            '13e. MOTORCYCLE\'s own acceleration rate is strictly GREATER than CAR\'s, even though CAR is strictly faster — acceleration deliberately does not follow movementSpeed\'s own WALK < BICYCLE < MOTORCYCLE < CAR ordering (0.9.90)');
        assert(
            walkCapability.acceleration.kind === AvatarMovementAccelerationKind.INSTANT
            && bicycleCapability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED
            && motorcycleCapability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED
            && capability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED,
            '13f. WALK alone is INSTANT; BICYCLE, MOTORCYCLE, and CAR are each RATE_LIMITED (0.9.90)'
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
        assert(capability.movementDirections.forward === false && capability.movementDirections.backward === false,
            '17c. DRONE\'s own movementDirections is forward: false, backward: false — inert, for the identical reason movementSpeed\'s/collisionRadius\'s own 0 already is (0.9.89)');
        assert(capability.acceleration.kind === AvatarMovementAccelerationKind.INSTANT && capability.acceleration.acceleration === 0,
            '17d. DRONE\'s own acceleration is INSTANT/0 — inert, for the identical reason movementSpeed\'s/collisionRadius\'s/movementDirections\'s own inert values already are (0.9.90)');
        const walkCapabilityForAcceleration = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        assert(capability.acceleration === walkCapabilityForAcceleration.acceleration,
            '17e. DRONE\'s own acceleration is the exact same (===) shared instance WALK\'s own is — reused, not duplicated, because both genuinely mean "no rate applies" (0.9.90)');

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
            assert(first.movementDirections === second.movementDirections,
                `20a. resolving ${vehicleType} twice returns the identical (===) movementDirections instance both times (${vehicleType})`);
            assert(first.acceleration === second.acceleration,
                `20b. resolving ${vehicleType} twice returns the identical (===) acceleration instance both times (${vehicleType})`);
            assert(first.acceleration.kind === second.acceleration.kind && first.acceleration.acceleration === second.acceleration.acceleration,
                `20c. resolving ${vehicleType} twice returns field-identical acceleration results (${vehicleType})`);
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

        try {
            capability.movementDirections = NO_DIRECTIONS;
        } catch (err) {
            // see above.
        }
        assert(capability.movementDirections.forward === true && capability.movementDirections.backward === true,
            '23c. attempting to reassign movementDirections never changes it');
        assert(Object.isFrozen(capability.movementDirections), '23d. the movementDirections value itself is also frozen');

        try {
            capability.acceleration = INSTANT_ACCEL;
        } catch (err) {
            // see above.
        }
        assert(capability.acceleration.kind === AvatarMovementAccelerationKind.RATE_LIMITED && capability.acceleration.acceleration === 3,
            '23e. attempting to reassign acceleration never changes it (0.9.90)');
        assert(Object.isFrozen(capability.acceleration), '23f. the acceleration value itself is also frozen (0.9.90)');

        try {
            capability.acceleration.acceleration = 999;
        } catch (err) {
            // see above.
        }
        assert(capability.acceleration.acceleration === 3, '23g. attempting to reassign a field directly on the acceleration value never changes it (0.9.90)');

        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35, BOTH_DIRECTIONS, INSTANT_ACCEL).movementKind = AvatarMovementCapabilityKind.RUN,
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
        assertThrows(() => new AvatarVehicleMovementCapability('not-a-kind', VehicleType.NONE, true, 3, 0.35, BOTH_DIRECTIONS), '30. constructing with an invalid movementKind throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, 'not-a-type', true, 3, 0.35, BOTH_DIRECTIONS), '31. constructing with an invalid vehicleType throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, 'yes', 3, 0.35, BOTH_DIRECTIONS), '32. constructing with a non-boolean supported throws');
        // 0.9.86 — the movementSpeed field gets the same "reject
        // anything that isn't a finite, non-negative number" treatment.
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, undefined, 0.35, BOTH_DIRECTIONS), '32a. constructing with movementSpeed omitted (undefined) throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, null, 0.35, BOTH_DIRECTIONS), '32b. constructing with a null movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, '3', 0.35, BOTH_DIRECTIONS), '32c. constructing with a string movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, -1, 0.35, BOTH_DIRECTIONS), '32d. constructing with a negative movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, NaN, 0.35, BOTH_DIRECTIONS), '32e. constructing with a NaN movementSpeed throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, Infinity, 0.35, BOTH_DIRECTIONS), '32f. constructing with an infinite movementSpeed throws');
        // A movementSpeed of exactly 0 is valid (DRONE's own inert value
        // — see core/AvatarVehicleMovementCapability.js's own 0.9.86
        // header) — never rejected merely for being falsy.
        const zeroSpeedCapability = new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false, 0, 0, NO_DIRECTIONS, INSTANT_ACCEL);
        assert(zeroSpeedCapability.movementSpeed === 0, '32g. a movementSpeed of exactly 0 is accepted, not rejected as falsy');

        // 0.9.88 — the new collisionRadius field gets the identical
        // "reject anything that isn't a finite, non-negative number"
        // treatment.
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, undefined, BOTH_DIRECTIONS), '32h. constructing with collisionRadius omitted (undefined) throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, null, BOTH_DIRECTIONS), '32i. constructing with a null collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, '0.35', BOTH_DIRECTIONS), '32j. constructing with a string collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, -1, BOTH_DIRECTIONS), '32k. constructing with a negative collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, NaN, BOTH_DIRECTIONS), '32l. constructing with a NaN collisionRadius throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, Infinity, BOTH_DIRECTIONS), '32m. constructing with an infinite collisionRadius throws');
        // A collisionRadius of exactly 0 is valid (DRONE's own inert
        // value — see core/AvatarVehicleMovementCapability.js's own
        // 0.9.88 header) — never rejected merely for being falsy.
        const zeroRadiusCapability = new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false, 0, 0, NO_DIRECTIONS, INSTANT_ACCEL);
        assert(zeroRadiusCapability.collisionRadius === 0, '32n. a collisionRadius of exactly 0 is accepted, not rejected as falsy');

        // 0.9.89 — the new movementDirections field is rejected unless
        // it is a genuine, valid AvatarMovementDirectionCapability
        // instance — never a plain object shaped like one, and never
        // omitted.
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35), '32o. constructing with movementDirections omitted (undefined) throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35, null), '32p. constructing with a null movementDirections throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35, { forward: true, backward: true }), '32q. constructing with a plain object shaped like movementDirections (not an actual instance) throws');
        assertThrows(() => new AvatarMovementDirectionCapability('true', true), '32r. AvatarMovementDirectionCapability rejects a non-boolean forward');
        assertThrows(() => new AvatarMovementDirectionCapability(true, 'false'), '32s. AvatarMovementDirectionCapability rejects a non-boolean backward');
        assertThrows(() => new AvatarMovementDirectionCapability(), '32t. AvatarMovementDirectionCapability rejects being constructed with no arguments at all');
        // Both booleans exactly false is a valid, meaningful value
        // (DRONE's own inert one), never rejected merely for being
        // falsy.
        const bothFalse = new AvatarMovementDirectionCapability(false, false);
        assert(bothFalse.forward === false && bothFalse.backward === false, '32u. forward: false, backward: false is accepted, not rejected as falsy');

        // 0.9.90 — the new acceleration field is rejected unless it is a
        // genuine, valid AvatarMovementAccelerationCapability instance —
        // never a plain object shaped like one, and never omitted.
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35, BOTH_DIRECTIONS), '32v. constructing with acceleration omitted (undefined) throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35, BOTH_DIRECTIONS, null), '32w. constructing with a null acceleration throws');
        assertThrows(() => new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, 3, 0.35, BOTH_DIRECTIONS, { kind: 'instant', acceleration: 0 }), '32x. constructing with a plain object shaped like acceleration (not an actual instance) throws');

        // AvatarMovementAccelerationCapability's own constructor
        // invariants (core/AvatarMovementAccelerationCapability.js).
        assertThrows(() => new AvatarMovementAccelerationCapability('not-a-kind', 0), '32y. AvatarMovementAccelerationCapability rejects an invalid kind');
        assertThrows(() => new AvatarMovementAccelerationCapability(), '32z. AvatarMovementAccelerationCapability rejects being constructed with no arguments at all');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, undefined), '32aa. constructing with acceleration omitted (undefined) throws');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, null), '32ab. constructing with a null acceleration throws');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, '3'), '32ac. constructing with a string acceleration throws');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, -1), '32ad. constructing with a negative acceleration throws');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, NaN), '32ae. constructing with a NaN acceleration throws');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, Infinity), '32af. constructing with an infinite acceleration throws');
        // The one coupling invariant this class enforces: INSTANT
        // requires exactly 0, RATE_LIMITED forbids exactly 0 — see this
        // file's own "INERT ACCELERATION VALUE" header.
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.INSTANT, 4), '32ag. INSTANT with a non-zero acceleration throws');
        assertThrows(() => new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 0), '32ah. RATE_LIMITED with an acceleration of exactly 0 throws — 0 is reserved for INSTANT');
        const validInstant = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.INSTANT, 0);
        assert(validInstant.kind === AvatarMovementAccelerationKind.INSTANT && validInstant.acceleration === 0, '32ai. INSTANT paired with exactly 0 is accepted');
        const validRateLimited = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 0.01);
        assert(validRateLimited.kind === AvatarMovementAccelerationKind.RATE_LIMITED && validRateLimited.acceleration === 0.01, '32aj. RATE_LIMITED paired with a small strictly-positive acceleration is accepted');
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
        assert(isValidAvatarVehicleMovementCapability({ movementKind: 'ground_vehicle', vehicleType: 'car', supported: true, movementSpeed: 6, collisionRadius: 0.8, movementDirections: BOTH_DIRECTIONS }) === false, '40. a plain object shaped like a capability is not itself a valid instance');

        // 0.9.89 — isValidAvatarMovementDirectionCapability().
        assert(isValidAvatarMovementDirectionCapability(BOTH_DIRECTIONS) === true, '40a. a genuine AvatarMovementDirectionCapability instance is valid');
        assert(isValidAvatarMovementDirectionCapability(capability.movementDirections) === true, '40b. a resolved capability\'s own movementDirections is a valid AvatarMovementDirectionCapability');
        assert(isValidAvatarMovementDirectionCapability(null) === false, '40c. null is not a valid AvatarMovementDirectionCapability');
        assert(isValidAvatarMovementDirectionCapability(undefined) === false, '40d. undefined is not a valid AvatarMovementDirectionCapability');
        assert(isValidAvatarMovementDirectionCapability({ forward: true, backward: true }) === false, '40e. a plain object shaped like a direction capability is not itself a valid instance');
        assert(isValidAvatarVehicleMovementCapability(capability) === true && isValidAvatarMovementDirectionCapability(capability.movementDirections) === true,
            '40f. a fully-valid capability\'s own movementDirections is itself a fully-valid AvatarMovementDirectionCapability — the two validators agree');

        // 0.9.90 — isValidAvatarMovementAccelerationCapability().
        assert(isValidAvatarMovementAccelerationCapability(RATE_LIMITED_ACCEL) === true, '40g. a genuine AvatarMovementAccelerationCapability instance is valid');
        assert(isValidAvatarMovementAccelerationCapability(capability.acceleration) === true, '40h. a resolved capability\'s own acceleration is a valid AvatarMovementAccelerationCapability');
        assert(isValidAvatarMovementAccelerationCapability(null) === false, '40i. null is not a valid AvatarMovementAccelerationCapability');
        assert(isValidAvatarMovementAccelerationCapability(undefined) === false, '40j. undefined is not a valid AvatarMovementAccelerationCapability');
        assert(isValidAvatarMovementAccelerationCapability({ kind: 'rate_limited', acceleration: 3 }) === false, '40k. a plain object shaped like an acceleration capability is not itself a valid instance');
        assert(isValidAvatarVehicleMovementCapability(capability) === true && isValidAvatarMovementAccelerationCapability(capability.acceleration) === true,
            '40l. a fully-valid capability\'s own acceleration is itself a fully-valid AvatarMovementAccelerationCapability — the two validators agree');
    }

    // -------------------------------------------------------------
    // Section J — reconstruction
    // -------------------------------------------------------------
    {
        const original = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const json = original.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ movementKind: 'ground_vehicle', vehicleType: 'motorcycle', supported: true, movementSpeed: 9, collisionRadius: 0.55, movementDirections: { forward: true, backward: true }, acceleration: { kind: 'rate_limited', acceleration: 5 } }),
            '41. toJSON() produces the plain expected shape, movementSpeed (0.9.86, per-vehicle as of 0.9.87), collisionRadius (0.9.88), movementDirections (0.9.89), and acceleration (0.9.90) included');

        const reconstructed = AvatarVehicleMovementCapability.fromJSON(json);
        assert(reconstructed.movementKind === original.movementKind && reconstructed.vehicleType === original.vehicleType && reconstructed.supported === original.supported && reconstructed.movementSpeed === original.movementSpeed && reconstructed.collisionRadius === original.collisionRadius,
            '42. fromJSON(toJSON()) round-trips to a field-identical capability, movementSpeed and collisionRadius included');
        assert(reconstructed.movementDirections.forward === original.movementDirections.forward && reconstructed.movementDirections.backward === original.movementDirections.backward,
            '42a. fromJSON(toJSON()) round-trips movementDirections field-identically too');
        assert(reconstructed.movementDirections !== original.movementDirections, '42b. fromJSON() constructs a genuinely new movementDirections instance, not the shared cached one');
        assert(reconstructed.acceleration.kind === original.acceleration.kind && reconstructed.acceleration.acceleration === original.acceleration.acceleration,
            '42c. fromJSON(toJSON()) round-trips acceleration field-identically too (0.9.90)');
        assert(reconstructed.acceleration !== original.acceleration, '42d. fromJSON() constructs a genuinely new acceleration instance, not the shared cached one (0.9.90)');
        assert(reconstructed !== original, '43. fromJSON() constructs a genuinely new instance, not the shared cached one');
        assert(Object.isFrozen(reconstructed), '44. a reconstructed instance is frozen too');
        assert(Object.isFrozen(reconstructed.movementDirections), '44a. a reconstructed instance\'s own movementDirections is frozen too');
        assert(Object.isFrozen(reconstructed.acceleration), '44b. a reconstructed instance\'s own acceleration is frozen too (0.9.90)');

        const roundTripAgain = AvatarVehicleMovementCapability.fromJSON(JSON.parse(JSON.stringify(original)));
        assert(roundTripAgain.movementKind === original.movementKind && roundTripAgain.movementSpeed === original.movementSpeed && roundTripAgain.collisionRadius === original.collisionRadius,
            '45. a full JSON.stringify/JSON.parse round trip preserves movementKind, movementSpeed, and collisionRadius');
        assert(roundTripAgain.acceleration.kind === original.acceleration.kind && roundTripAgain.acceleration.acceleration === original.acceleration.acceleration,
            '45b. a full JSON.stringify/JSON.parse round trip preserves acceleration too (0.9.90)');
        assert(roundTripAgain.movementDirections.forward === original.movementDirections.forward && roundTripAgain.movementDirections.backward === original.movementDirections.backward,
            '45a. a full JSON.stringify/JSON.parse round trip preserves movementDirections too');
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
        //
        // 0.9.90 note: bare "acceleration" is likewise deliberately no
        // longer forbidden — this file's own point, as of 0.9.90, is to
        // carry an `acceleration` capability field (see that field's own
        // header). What stays forbidden is any reference to the
        // ACCELERATION MATH MODULE that field eventually feeds —
        // `AvatarMovementAccelerationSimulation` — this file still
        // commits no opinion about how a rate is actually simulated tick
        // to tick; it only ever decides which kind/rate a vehicle
        // relationship implies.
        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence',
            'AvatarTreeCollision.js', 'AvatarTreeMovement.js', 'AvatarTreeCollisionQuery.js',
            'AvatarCollision.js', 'AvatarTreeConstraint',
            'circlesIntersect', 'avatarTreeCollision', 'resolveAvatarTreeMovement',
            'treeCollisionCandidatesForMovement', 'AVATAR_COLLISION_RADIUS',
            'AvatarMovementState', 'AvatarMovementSimulation', 'AvatarMovementAccelerationSimulation',
            'resolveMovementSpeed', 'currentSpeed', 'deltaTime',
            'AvatarContinuousMovement', 'AvatarPresence',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'maxSpeed', 'mass', 'gravity', 'physics',
            'turnAxis', 'turning', 'steering', 'left', 'right',
            'braking', 'coasting', 'friction', 'drag', 'momentum',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `46. core/AvatarVehicleMovementCapability.js's own code never references "${term}" — a pure capability resolver only, never movement/runtime/rendering/collision mathematics/physics/turning/persistence/networking`);
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
    {
        // 0.9.89 — the new sibling file gets the identical architectural
        // sweep: a small, closed value vocabulary, nothing more.
        const sourceUrl = new URL('../core/AvatarMovementDirectionCapability.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence', 'VehicleType',
            'AvatarMovementState', 'AvatarMovementSimulation',
            'AvatarContinuousMovement', 'AvatarPresence',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'maxSpeed', 'mass', 'gravity', 'physics',
            'turnAxis', 'turning', 'steering', 'left', 'right',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `48. core/AvatarMovementDirectionCapability.js's own code never references "${term}" — a small, closed forward/backward value, nothing else`);
        }

        const exportsModule = await import('../core/AvatarMovementDirectionCapability.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify([
            'AvatarMovementDirectionCapability',
            'isValidAvatarMovementDirectionCapability'
        ]), '49. core/AvatarMovementDirectionCapability.js exports exactly the descriptor class and its one validator — nothing else');
    }
    {
        // 0.9.90 — the new AvatarMovementAccelerationCapability sibling
        // file gets the identical architectural sweep: a small, closed
        // value vocabulary, nothing more. Unlike the two sweeps above,
        // bare "acceleration" is NOT forbidden here — it is this file's
        // entire subject — but the ACTUAL SIMULATION MATH that consumes
        // it (core/AvatarMovementAccelerationSimulation.js) still is:
        // this file only ever resolves a kind/rate pair, never computes
        // a next-tick speed.
        const sourceUrl = new URL('../core/AvatarMovementAccelerationCapability.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence', 'VehicleType',
            'AvatarMovementState', 'AvatarMovementSimulation', 'AvatarMovementAccelerationSimulation',
            'resolveMovementSpeed', 'currentSpeed', 'targetSpeed', 'deltaTime',
            'AvatarContinuousMovement', 'AvatarPresence',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'maxSpeed', 'mass', 'gravity', 'physics',
            'turnAxis', 'turning', 'steering', 'left', 'right',
            'braking', 'coasting', 'friction', 'drag', 'momentum',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `50. core/AvatarMovementAccelerationCapability.js's own code never references "${term}" — a small, closed kind/rate value, nothing else`);
        }

        const exportsModule = await import('../core/AvatarMovementAccelerationCapability.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify([
            'AvatarMovementAccelerationCapability',
            'AvatarMovementAccelerationKind',
            'isValidAvatarMovementAccelerationCapability',
            'isValidAvatarMovementAccelerationKind'
        ]), '51. core/AvatarMovementAccelerationCapability.js exports exactly the kind vocabulary, the descriptor class, and its two validators — nothing else');
    }

    console.log('✅ All Avatar-Vehicle Movement Capability tests passed.');
}

await runTests();
