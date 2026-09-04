import { readFile } from 'node:fs/promises';
import {
    VehicleInstance,
    vehicleInstanceFromPresence,
    isValidVehicleInstance
} from '../core/VehicleInstance.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.114 — Vehicle Runtime Instance State, core/VehicleInstance.js.
//
//   Section A: valid construction — spawnPosition/position, defaulting
//   Section B: vehicleInstanceFromPresence() — the bridge from a real,
//              deterministically-placed VehiclePresence
//   Section C: withPosition() — the only way position ever changes
//   Section C2 (0.9.123): heading — defaulting, withHeading(), and
//              independence from withPosition()
//   Section D: the central architectural claim — moving position never
//              alters spawnPosition, id, or the underlying deterministic
//              placement calculation itself
//   Section E: immutability — getter-only, frozen, no mutation
//   Section F: defensive validation of malformed inputs
//   Section G: toJSON()/fromJSON() round-trips both positions and heading
//   Section H: isValidVehicleInstance()
//   Section I: architectural regression — no rendering/movement/mount/
//              dismount/placement wiring, source sweep + exports check
//
// Central architectural claim under test throughout: a VehicleInstance
// separates a DETERMINISTIC fact (spawnPosition, fixed forever from
// construction) from a mutable-by-replacement RUNTIME fact (position) —
// and changing the latter can never, even indirectly, change the former,
// the vehicle's own identity, or the deterministic lattice
// core/VehiclePlacement.js computes independently. See docs/Roadmap.md,
// 0.9.114.

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
    // Section A — valid construction
    // -------------------------------------------------------------
    {
        const instance = new VehicleInstance({
            id: 'vehicle:1:2,3',
            type: VehicleType.BICYCLE,
            spawnPosition: { x: 10, y: 0, z: 20 }
        });
        assert(instance.id === 'vehicle:1:2,3', '1. id is preserved exactly as constructed');
        assert(instance.type === VehicleType.BICYCLE, '2. type is preserved exactly as constructed');
        assert(instance.spawnPosition instanceof Position, '3. spawnPosition is a Position instance');
        assert(instance.spawnPosition.x === 10 && instance.spawnPosition.z === 20, '4. spawnPosition coordinates preserved');
        assert(instance.position instanceof Position, '5. position is a Position instance');
        assert(instance.position.equals(instance.spawnPosition), '6. position defaults to spawnPosition when omitted');
        assert(instance.position === instance.spawnPosition, '7. the default position is the exact same Position reference as spawnPosition, not merely equal');
        assert(instance.heading === 0, '7b. heading defaults to 0 (a neutral fact, never invented) when omitted');
    }
    {
        // spawnPosition and position may differ from construction.
        const instance = new VehicleInstance({
            id: 'vehicle:1:0,0',
            type: VehicleType.CAR,
            spawnPosition: new Position(0, 0, 0),
            position: new Position(50, 0, -25)
        });
        assert(instance.spawnPosition.equals(new Position(0, 0, 0)), '8. spawnPosition preserved when explicitly given');
        assert(instance.position.equals(new Position(50, 0, -25)), '9. an explicitly different position is preserved verbatim');
        assert(!instance.position.equals(instance.spawnPosition), '10. position and spawnPosition can genuinely differ');
    }
    {
        const instance = new VehicleInstance({
            id: 'vehicle:1:0,0',
            type: VehicleType.CAR,
            spawnPosition: { x: 0, y: 0, z: 0 },
            heading: 137.5
        });
        assert(instance.heading === 137.5, '10b. an explicitly given heading is preserved verbatim');
    }
    {
        // Every non-NONE VehicleType constructs.
        const types = [VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE];
        for (const type of types) {
            const instance = new VehicleInstance({ id: `vehicle:1:${type}`, type, spawnPosition: { x: 0, y: 0, z: 0 } });
            assert(instance.type === type, `11. ${type} constructs and reports exactly its own type`);
        }
    }

    // -------------------------------------------------------------
    // Section B — vehicleInstanceFromPresence()
    // -------------------------------------------------------------
    {
        const presence = new VehiclePresence({
            id: 'vehicle:7:4,-2',
            type: VehicleType.BICYCLE,
            position: new Position(40, 1.5, -8)
        });
        const instance = vehicleInstanceFromPresence(presence);
        assert(instance instanceof VehicleInstance, '12. vehicleInstanceFromPresence() returns a VehicleInstance');
        assert(instance.id === presence.id, '13. id is copied verbatim from the VehiclePresence');
        assert(instance.type === presence.type, '14. type is copied verbatim from the VehiclePresence');
        assert(instance.spawnPosition.equals(presence.position), '15. spawnPosition equals the VehiclePresence\'s own position');
        assert(instance.position.equals(presence.position), '16. position also starts equal to the VehiclePresence\'s own position');
        assert(instance.heading === 0, '16b. heading starts at the neutral 0 default — VehiclePresence has no facing fact to copy');

        assertThrows(() => vehicleInstanceFromPresence({ id: 'x', type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } }), '17. a VehiclePresence-shaped plain object is rejected — a real VehiclePresence instance is required');
        assertThrows(() => vehicleInstanceFromPresence(null), '18. null is rejected');
        assertThrows(() => vehicleInstanceFromPresence(), '19. a missing argument is rejected');
    }

    // -------------------------------------------------------------
    // Section C — withPosition()
    // -------------------------------------------------------------
    {
        const original = new VehicleInstance({
            id: 'vehicle:1:0,0',
            type: VehicleType.BICYCLE,
            spawnPosition: new Position(5, 0, 5),
            heading: 45
        });
        const moved = original.withPosition(new Position(9, 0, 12));

        assert(moved instanceof VehicleInstance, '20. withPosition() returns a VehicleInstance');
        assert(moved !== original, '21. withPosition() returns a genuinely new instance, never the same object');
        assert(moved.position.equals(new Position(9, 0, 12)), '22. the new instance carries the new position');
        assert(moved.id === original.id, '23. id is carried forward unchanged');
        assert(moved.type === original.type, '24. type is carried forward unchanged');
        assert(moved.spawnPosition === original.spawnPosition, '25. spawnPosition is carried forward as the EXACT SAME reference, not merely an equal value');
        assert(moved.heading === 45, '25b. withPosition() carries heading forward UNCHANGED — it never recomputes orientation as a side effect');

        // The original is entirely untouched.
        assert(original.position.equals(new Position(5, 0, 5)), '26. the original instance\'s own position is unchanged after withPosition() is called on it');
        assert(original.position.equals(original.spawnPosition), '27. the original still reports position === spawnPosition (by value) — it was never mutated');

        // Chaining withPosition() repeatedly never touches spawnPosition.
        const afterThreeMoves = original
            .withPosition(new Position(1, 0, 1))
            .withPosition(new Position(2, 0, 2))
            .withPosition(new Position(3, 0, 3));
        assert(afterThreeMoves.position.equals(new Position(3, 0, 3)), '28. the final position reflects the last move in the chain');
        assert(afterThreeMoves.spawnPosition === original.spawnPosition, '29. spawnPosition survives an arbitrarily long chain of withPosition() calls, identical by reference throughout');
        assert(afterThreeMoves.id === original.id, '30. id survives the same chain, unchanged');
        assert(afterThreeMoves.heading === 45, '30b. heading survives the same chain of withPosition() calls, unchanged throughout');
    }

    // -------------------------------------------------------------
    // Section C2 (0.9.123) — heading / withHeading()
    // -------------------------------------------------------------
    {
        const original = new VehicleInstance({
            id: 'vehicle:1:0,0',
            type: VehicleType.BICYCLE,
            spawnPosition: new Position(5, 0, 5),
            position: new Position(9, 0, 12),
            heading: 10
        });
        const faced = original.withHeading(270);

        assert(faced instanceof VehicleInstance, '30c. withHeading() returns a VehicleInstance');
        assert(faced !== original, '30d. withHeading() returns a genuinely new instance, never the same object');
        assert(faced.heading === 270, '30e. the new instance carries the new heading');
        assert(faced.id === original.id, '30f. id is carried forward unchanged');
        assert(faced.type === original.type, '30g. type is carried forward unchanged');
        assert(faced.spawnPosition === original.spawnPosition, '30h. spawnPosition is carried forward as the exact same reference');
        assert(faced.position.equals(original.position), '30i. position is carried forward unchanged — withHeading() never touches position');
        assert(original.heading === 10, '30j. the original instance is entirely untouched by withHeading()');

        // Chaining withHeading() repeatedly never touches position/spawnPosition.
        const afterThreeTurns = original.withHeading(90).withHeading(180).withHeading(359.5);
        assert(afterThreeTurns.heading === 359.5, '30k. the final heading reflects the last turn in the chain');
        assert(afterThreeTurns.position.equals(original.position), '30l. position survives an arbitrarily long chain of withHeading() calls, unchanged throughout');
        assert(afterThreeTurns.spawnPosition === original.spawnPosition, '30m. spawnPosition survives the same chain, identical by reference');

        assertThrows(() => original.withHeading(NaN), '30n. withHeading(NaN) throws — heading must stay a finite number');
        assertThrows(() => original.withHeading('north'), '30o. withHeading() rejects a non-numeric heading');
    }

    // -------------------------------------------------------------
    // Section D — the central architectural claim
    // -------------------------------------------------------------
    {
        // Build a real VehicleInstance from a real, deterministically-
        // placed VehiclePresence, then move it repeatedly. None of that
        // may ever perturb the deterministic placement calculation
        // itself, re-derived independently below.
        const region = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600);
        assert(region.length > 0, '31. sanity: the region actually contains at least one deterministically-placed vehicle');
        const presence = region[0];

        let instance = vehicleInstanceFromPresence(presence);
        const originalSpawn = instance.spawnPosition;
        const originalId = instance.id;

        // Move the vehicle many times, far from its spawn point.
        for (let i = 0; i < 25; i++) {
            instance = instance.withPosition(new Position(i * 17, 0, -i * 31));
        }
        assert(!instance.position.equals(originalSpawn), '32. after repeated movement, the current position genuinely differs from the spawn position');
        assert(instance.spawnPosition === originalSpawn, '33. spawnPosition is still the exact original reference after 25 movements');
        assert(instance.spawnPosition.equals(presence.position), '34. spawnPosition still equals the original VehiclePresence\'s own deterministic position, unchanged');
        assert(instance.id === originalId, '35. id is still the exact original vehicle id after 25 movements');
        assert(instance.id === presence.id, '36. id still equals the original VehiclePresence\'s own deterministic id');

        // Re-deriving the deterministic placement from scratch — a fresh,
        // independent call, exactly as VehiclePlacement.js's own header
        // guarantees any caller can always do — reproduces the identical
        // VehiclePresence, completely unaffected by anything done to the
        // VehicleInstance above.
        const rederived = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600)[0];
        assert(rederived.id === presence.id, '37. re-deriving the deterministic lattice from scratch reproduces the exact same vehicle id — VehicleInstance movement never fed back into VehiclePlacement.js');
        assert(rederived.position.equals(presence.position), '38. re-deriving the deterministic lattice reproduces the exact same position — the deterministic calculation itself was never perturbed');
    }

    // -------------------------------------------------------------
    // Section E — immutability
    // -------------------------------------------------------------
    {
        const instance = new VehicleInstance({ id: 'vehicle:1:1,1', type: VehicleType.CAR, spawnPosition: { x: 1, y: 2, z: 3 } });
        assert(Object.getOwnPropertyDescriptor(VehicleInstance.prototype, 'id').set === undefined, '39. no id setter exists');
        assert(Object.getOwnPropertyDescriptor(VehicleInstance.prototype, 'type').set === undefined, '40. no type setter exists');
        assert(Object.getOwnPropertyDescriptor(VehicleInstance.prototype, 'spawnPosition').set === undefined, '41. no spawnPosition setter exists');
        assert(Object.getOwnPropertyDescriptor(VehicleInstance.prototype, 'position').set === undefined, '42. no position setter exists');
        assert(Object.getOwnPropertyDescriptor(VehicleInstance.prototype, 'heading').set === undefined, '42b. no heading setter exists');

        assert(Object.isFrozen(instance), '43. the instance itself is frozen');
        assertThrows(() => { instance._id = 'vehicle:1:9,9'; }, '44. reassigning the backing id field directly throws (frozen, strict-mode ESM)');
        assertThrows(() => { instance._position = new Position(0, 0, 0); }, '45. reassigning the backing position field directly throws (frozen, strict-mode ESM)');
        assertThrows(() => { instance._spawnPosition = new Position(0, 0, 0); }, '46. reassigning the backing spawnPosition field directly throws (frozen, strict-mode ESM)');
        assertThrows(() => { instance._heading = 45; }, '46b. reassigning the backing heading field directly throws (frozen, strict-mode ESM)');
        assert(instance.id === 'vehicle:1:1,1' && instance.type === VehicleType.CAR, '47. the instance is unchanged after the rejected reassignment attempts');
    }

    // -------------------------------------------------------------
    // Section F — defensive validation
    // -------------------------------------------------------------
    {
        assertThrows(() => new VehicleInstance({ type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 } }), '48. missing id throws');
        assertThrows(() => new VehicleInstance({ id: '', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 } }), '49. empty-string id throws');
        assertThrows(() => new VehicleInstance({ id: 42, type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 } }), '50. non-string id throws');

        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', spawnPosition: { x: 0, y: 0, z: 0 } }), '51. missing type throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.NONE, spawnPosition: { x: 0, y: 0, z: 0 } }), '52. VehicleType.NONE throws — absence, not an instance of type NONE');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: 'scooter', spawnPosition: { x: 0, y: 0, z: 0 } }), '53. unknown type throws');

        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR }), '54. missing spawnPosition throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: null }), '55. a null spawnPosition throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 'left', y: 0, z: 0 } }), '56. a non-numeric spawnPosition coordinate throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: NaN, y: 0, z: 0 } }), '57. a NaN spawnPosition coordinate throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: Infinity, y: 0, z: 0 } }), '58. a non-finite spawnPosition coordinate throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: [0, 0, 0] }), '59. an array spawnPosition throws');

        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, position: null }), '60. an explicit null position throws (only an OMITTED position defaults to spawnPosition)');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, position: 'here' }), '61. a string position throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0 } }), '62. an incomplete position (missing z) throws');
        assertThrows(() => new VehicleInstance(null), '63. null options throws');
        assertThrows(() => new VehicleInstance(), '64. no options at all throws');
        assertThrows(() => new VehicleInstance({}), '65. an empty options object throws');

        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, heading: NaN }), '65b. a NaN heading throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, heading: Infinity }), '65c. a non-finite heading throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, heading: 'north' }), '65d. a non-numeric heading throws');
        assertThrows(() => new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, heading: null }), '65e. an explicit null heading throws (only an OMITTED heading defaults to 0)');
        {
            const zeroHeading = new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, heading: 0 });
            assert(zeroHeading.heading === 0, '65f. an explicit heading of exactly 0 is accepted, not treated as "omitted"');
            const negativeHeading = new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 }, heading: -45 });
            assert(negativeHeading.heading === -45, '65g. a negative heading is accepted verbatim — this file never normalizes it');
        }
    }

    // -------------------------------------------------------------
    // Section G — toJSON()/fromJSON()
    // -------------------------------------------------------------
    {
        const instance = new VehicleInstance({
            id: 'vehicle:9:3,-4',
            type: VehicleType.MOTORCYCLE,
            spawnPosition: new Position(1, 0, 2),
            position: new Position(30, 0, 40),
            heading: 217
        });
        const json = instance.toJSON();
        assert(JSON.stringify(Object.keys(json).sort()) === JSON.stringify(['heading', 'id', 'position', 'spawnPosition', 'type']), '66. toJSON() carries exactly id/type/spawnPosition/position/heading');

        const roundTripped = VehicleInstance.fromJSON(json);
        assert(roundTripped instanceof VehicleInstance, '67. fromJSON() returns a VehicleInstance instance');
        assert(roundTripped.id === instance.id, '68. fromJSON(toJSON()) preserves id exactly');
        assert(roundTripped.type === instance.type, '69. fromJSON(toJSON()) preserves type');
        assert(roundTripped.spawnPosition.equals(instance.spawnPosition), '70. fromJSON(toJSON()) preserves spawnPosition');
        assert(roundTripped.position.equals(instance.position), '71. fromJSON(toJSON()) preserves position');
        assert(roundTripped.heading === instance.heading, '71b. fromJSON(toJSON()) preserves heading');
        assert(roundTripped !== instance, '72. fromJSON() always produces a new instance, never the same object');

        json.id = 'vehicle:tampered:0,0';
        json.spawnPosition = { x: 999, y: 0, z: 999 };
        assert(instance.id === 'vehicle:9:3,-4', '73. mutating a toJSON() snapshot does not affect the source instance\'s id');
        assert(instance.spawnPosition.equals(new Position(1, 0, 2)), '74. mutating a toJSON() snapshot does not affect the source instance\'s spawnPosition');
    }

    // -------------------------------------------------------------
    // Section H — isValidVehicleInstance()
    // -------------------------------------------------------------
    {
        const instance = new VehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR, spawnPosition: { x: 0, y: 0, z: 0 } });
        assert(isValidVehicleInstance(instance) === true, '75. a properly constructed VehicleInstance is valid');
        assert(isValidVehicleInstance(null) === false, '76. null is NOT a valid VehicleInstance — unlike AvatarVehicleMount, there is no in-band "absence" value here');
        assert(isValidVehicleInstance(undefined) === false, '77. undefined is not valid');
        assert(isValidVehicleInstance({ id: 'vehicle:1:0,0', type: VehicleType.CAR }) === false, '78. a plain object shaped like an instance is not valid — object identity matters, not merely matching shape');
        assert(isValidVehicleInstance('vehicle:1:0,0') === false, '79. a bare string is not valid');
    }

    // -------------------------------------------------------------
    // Section I — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehicleInstance.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePlacement', 'vehiclePresenceInRegion', 'VehicleIdentity', 'vehicleIdFor',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount', 'AvatarVehicleMountTransition',
            'AvatarVehicleDismountPosition', 'AvatarVehicleDismountTransition', 'AvatarVehicleDismountClearance',
            'AvatarVehicleProximity', 'AvatarPresence',
            'mount', 'dismount', 'ride', 'rider', 'occupant',
            // 'heading' is deliberately no longer forbidden here — see
            // this file's own 0.9.123 header: it is a legitimate runtime
            // fact this class now owns, the direct structural twin of
            // 'position'. 'rotation' stays forbidden: this file's own
            // heading is expressed purely as a plain number of degrees,
            // never as a rotation/Three.js concept.
            'velocity', 'acceleration', 'rotation', 'steering', 'braking', 'speed',
            'battery', 'fuel', 'health', 'inventory',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'collision', 'terrain', 'seed'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `80. core/VehicleInstance.js's own code never references "${term}" — a pure runtime-state wrapper, never a placement/mount/movement/rendering/persistence/networking dependency`);
        }
    }
    {
        const exportsModule = await import('../core/VehicleInstance.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['VehicleInstance', 'isValidVehicleInstance', 'vehicleInstanceFromPresence']),
            '81. core/VehicleInstance.js exports exactly the runtime class, its VehiclePresence bridge, and its validator — nothing else');
    }
    {
        // The existing deterministic placement/identity files are
        // themselves entirely untouched by this milestone.
        const placementSource = await readFile(new URL('../core/VehiclePlacement.js', import.meta.url), 'utf8');
        assert(!placementSource.includes('VehicleInstance'), '82. core/VehiclePlacement.js has no knowledge of VehicleInstance — the bridge is one-directional, built entirely on top of it');
        const presenceSource = await readFile(new URL('../core/VehiclePresence.js', import.meta.url), 'utf8');
        assert(!presenceSource.includes('VehicleInstance'), '83. core/VehiclePresence.js has no knowledge of VehicleInstance either');
    }

    console.log('✅ All Vehicle Runtime Instance State tests passed.');
}

await runTests();
