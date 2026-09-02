import { readFile } from 'node:fs/promises';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';

// 0.9.71 — Vehicle Presence Descriptor, core/VehiclePresence.js.
// Extended by 0.9.74 — Deterministic Vehicle Identity (adds `id`).
//
//   Section A: valid descriptors for every non-NONE VehicleType
//   Section B: immutability — getter-only, no setters, no mutation
//   Section C: defensive validation of malformed inputs
//   Section D: type preservation across instances
//   Section E: architectural regression — no movement/mounting/rendering/etc.
//
// Central architectural claim under test throughout: a VehiclePresence
// answers only "what vehicle is present, where, and by what name" — see
// docs/Roadmap.md, 0.9.71 and 0.9.74.

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
    // Section A — valid descriptor
    // -------------------------------------------------------------
    {
        const bicycle = new VehiclePresence({ id: 'vehicle:1:2,3', type: VehicleType.BICYCLE, position: { x: 1, y: 0, z: 2 } });
        assert(bicycle.id === 'vehicle:1:2,3', '1. id is preserved exactly as constructed');
        assert(bicycle.type === VehicleType.BICYCLE, '2. BICYCLE + valid position constructs');
        assert(bicycle.position instanceof Position, '3. position is a Position instance');
        assert(bicycle.position.x === 1 && bicycle.position.y === 0 && bicycle.position.z === 2, '4. position coordinates preserved');

        const motorcycle = new VehiclePresence({ id: 'vehicle:1:9,-4', type: VehicleType.MOTORCYCLE, position: new Position(5, 0, -3) });
        assert(motorcycle.type === VehicleType.MOTORCYCLE, '5. MOTORCYCLE + valid Position instance constructs');

        const car = new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } });
        assert(car.type === VehicleType.CAR, '6. CAR + valid position constructs');

        const drone = new VehiclePresence({ id: 'vehicle:1:-1,7', type: VehicleType.DRONE, position: { x: -10, y: 40, z: 100 } });
        assert(drone.type === VehicleType.DRONE, '7. DRONE + valid position constructs');
        assert(drone.position.y === 40, '8. DRONE can sit above ground level — no altitude constraint imposed here');

        // id carries whatever string it is given — VehiclePresence never
        // inspects, parses, or validates its FORMAT, only its shape
        // (non-empty string). An id that looks nothing like
        // core/VehicleIdentity.js's own convention is still accepted.
        const arbitraryId = new VehiclePresence({ id: 'anything-at-all', type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } });
        assert(arbitraryId.id === 'anything-at-all', '9. an arbitrarily-shaped non-empty string id is accepted verbatim — this file enforces no format');
    }

    // -------------------------------------------------------------
    // Section B — immutability
    // -------------------------------------------------------------
    {
        const presence = new VehiclePresence({ id: 'vehicle:1:1,1', type: VehicleType.CAR, position: { x: 1, y: 2, z: 3 } });
        assert(Object.getOwnPropertyDescriptor(VehiclePresence.prototype, 'id').set === undefined, '10. no id setter exists');
        assert(Object.getOwnPropertyDescriptor(VehiclePresence.prototype, 'type').set === undefined, '11. no type setter exists');
        assert(Object.getOwnPropertyDescriptor(VehiclePresence.prototype, 'position').set === undefined, '12. no position setter exists');

        assert(Object.isFrozen(presence), '13. the instance itself is frozen');
        assertThrows(() => { presence._id = 'vehicle:1:9,9'; }, '14. reassigning the backing id field directly throws (frozen, strict-mode ESM)');
        assertThrows(() => { presence._type = VehicleType.DRONE; }, '15. reassigning the backing type field directly throws (frozen, strict-mode ESM)');
        assert(presence.id === 'vehicle:1:1,1' && presence.type === VehicleType.CAR, '16. the descriptor is unchanged after the rejected reassignment attempts');

        const json = presence.toJSON();
        json.id = 'vehicle:1:9,9';
        json.type = VehicleType.DRONE;
        assert(presence.id === 'vehicle:1:1,1' && presence.type === VehicleType.CAR, '17. mutating a toJSON() snapshot does not affect the source descriptor');

        const roundTripped = VehiclePresence.fromJSON(presence.toJSON());
        assert(roundTripped.id === presence.id, '18. fromJSON(toJSON()) preserves id exactly');
        assert(roundTripped.type === presence.type, '19. fromJSON(toJSON()) preserves type');
        assert(roundTripped.position.equals(presence.position), '20. fromJSON(toJSON()) preserves position');
        assert(roundTripped !== presence, '21. fromJSON() always produces a new instance, never the same object');
    }

    // -------------------------------------------------------------
    // Section C — defensive validation
    // -------------------------------------------------------------
    {
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } }), '22. missing id throws');
        assertThrows(() => new VehiclePresence({ id: '', type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } }), '23. empty-string id throws');
        assertThrows(() => new VehiclePresence({ id: 42, type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } }), '24. non-string (numeric) id throws');
        assertThrows(() => new VehiclePresence({ id: null, type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } }), '25. null id throws');
        assertThrows(() => new VehiclePresence({ id: {}, type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } }), '26. an object id throws');

        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', position: { x: 0, y: 0, z: 0 } }), '27. missing type throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.NONE, position: { x: 0, y: 0, z: 0 } }), '28. VehicleType.NONE throws — absence, not a NONE presence');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: 'scooter', position: { x: 0, y: 0, z: 0 } }), '29. unknown type throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR }), '30. missing position throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: { x: 'left', y: 0, z: 0 } }), '31. non-numeric coordinate throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: { x: NaN, y: 0, z: 0 } }), '32. NaN coordinate throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: { x: Infinity, y: 0, z: 0 } }), '33. non-finite coordinate throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: { x: 0, y: 0 } }), '34. incomplete position (missing z) throws');
        assertThrows(() => new VehiclePresence(null), '35. null options throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: [0, 0, 0] }), '36. an array position throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: null }), '37. a null position throws');
        assertThrows(() => new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.CAR, position: 'here' }), '38. a string position throws');
        assertThrows(() => new VehiclePresence({}), '39. an empty options object throws');
    }

    // -------------------------------------------------------------
    // Section D — type preservation
    // -------------------------------------------------------------
    {
        const position = { x: 0, y: 0, z: 0 };
        const types = [VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]
            .map((type) => new VehiclePresence({ id: `vehicle:1:${type}`, type, position }).type);
        assert(new Set(types).size === 4, '40. all four non-NONE vehicle types remain distinct through construction');
        assert(types[0] === VehicleType.BICYCLE && types[1] === VehicleType.MOTORCYCLE
            && types[2] === VehicleType.CAR && types[3] === VehicleType.DRONE,
            '41. each descriptor reports exactly the type it was constructed with, no coercion between them');

        // Two descriptors sharing the same TYPE but different ids remain
        // distinguishable by id — the exact fact 0.9.74 exists to make
        // possible ("two vehicles can have the same type").
        const first = new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.BICYCLE, position });
        const second = new VehiclePresence({ id: 'vehicle:1:1,0', type: VehicleType.BICYCLE, position });
        assert(first.type === second.type && first.id !== second.id,
            '42. two same-type descriptors with different ids are distinguishable by id alone');
    }

    // -------------------------------------------------------------
    // Section E — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehiclePresence.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement',
            'AvatarContinuousMovementIntent', 'AvatarContinuousMovementMode',
            'mount', 'dismount', 'ride', 'rider', 'occupant',
            'velocity', 'acceleration', 'heading', 'rotation',
            'battery', 'fuel', 'health', 'inventory',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'collision', 'terrain', 'seed',
            'VehicleIdentity', 'vehicleIdFor'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `43. core/VehiclePresence.js's own code never references "${term}" — a world-level existence-and-location descriptor that CARRIES an id, never derives one`);
        }
    }
    {
        const exportsModule = await import('../core/VehiclePresence.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['VehiclePresence']),
            '44. core/VehiclePresence.js exports exactly the descriptor class, nothing else');
    }

    console.log('✅ All Vehicle Presence tests passed.');
}

await runTests();
