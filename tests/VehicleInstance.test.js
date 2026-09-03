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
//   Section D: the central architectural claim — moving position never
//              alters spawnPosition, id, or the underlying deterministic
//              placement calculation itself
//   Section E: immutability — getter-only, frozen, no mutation
//   Section F: defensive validation of malformed inputs
//   Section G: toJSON()/fromJSON() round-trips both positions
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
            spawnPosition: new Position(5, 0, 5)
        });
        const moved = original.withPosition(new Position(9, 0, 12));

        assert(moved instanceof VehicleInstance, '20. withPosition() returns a VehicleInstance');
        assert(moved !== original, '21. withPosition() returns a genuinely new instance, never the same object');
        assert(moved.position.equals(new Position(9, 0, 12)), '22. the new instance carries the new position');
        assert(moved.id === original.id, '23. id is carried forward unchanged');
        assert(moved.type === original.type, '24. type is carried forward unchanged');
        assert(moved.spawnPosition === original.spawnPosition, '25. spawnPosition is carried forward as the EXACT SAME reference, not merely an equal value');

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

        assert(Object.isFrozen(instance), '43. the instance itself is frozen');
        assertThrows(() => { instance._id = 'vehicle:1:9,9'; }, '44. reassigning the backing id field directly throws (frozen, strict-mode ESM)');
        assertThrows(() => { instance._position = new Position(0, 0, 0); }, '45. reassigning the backing position field directly throws (frozen, strict-mode ESM)');
        assertThrows(() => { instance._spawnPosition = new Position(0, 0, 0); }, '46. reassigning the backing spawnPosition field directly throws (frozen, strict-mode ESM)');
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
    }

    // -------------------------------------------------------------
    // Section G — toJSON()/fromJSON()
    // -------------------------------------------------------------
    {
        const instance = new VehicleInstance({
            id: 'vehicle:9:3,-4',
            type: VehicleType.MOTORCYCLE,
            spawnPosition: new Position(1, 0, 2),
            position: new Position(30, 0, 40)
        });
        const json = instance.toJSON();
        assert(JSON.stringify(Object.keys(json).sort()) === JSON.stringify(['id', 'position', 'spawnPosition', 'type']), '66. toJSON() carries exactly id/type/spawnPosition/position');

        const roundTripped = VehicleInstance.fromJSON(json);
        assert(roundTripped instanceof VehicleInstance, '67. fromJSON() returns a VehicleInstance instance');
        assert(roundTripped.id === instance.id, '68. fromJSON(toJSON()) preserves id exactly');
        assert(roundTripped.type === instance.type, '69. fromJSON(toJSON()) preserves type');
        assert(roundTripped.spawnPosition.equals(instance.spawnPosition), '70. fromJSON(toJSON()) preserves spawnPosition');
        assert(roundTripped.position.equals(instance.position), '71. fromJSON(toJSON()) preserves position');
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
            'velocity', 'acceleration', 'heading', 'rotation', 'steering', 'braking', 'speed',
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
