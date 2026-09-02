import { readFile } from 'node:fs/promises';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';

// 0.9.71 — Vehicle Presence Descriptor, core/VehiclePresence.js.
//
//   Section A: valid descriptors for every non-NONE VehicleType
//   Section B: immutability — getter-only, no setters, no mutation
//   Section C: defensive validation of malformed inputs
//   Section D: type preservation across instances
//   Section E: architectural regression — no movement/mounting/rendering/etc.
//
// Central architectural claim under test throughout: a VehiclePresence
// answers only "what vehicle is present, and where" — see
// docs/Roadmap.md, 0.9.71.

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
        const bicycle = new VehiclePresence({ type: VehicleType.BICYCLE, position: { x: 1, y: 0, z: 2 } });
        assert(bicycle.type === VehicleType.BICYCLE, '1. BICYCLE + valid position constructs');
        assert(bicycle.position instanceof Position, '2. position is a Position instance');
        assert(bicycle.position.x === 1 && bicycle.position.y === 0 && bicycle.position.z === 2, '3. position coordinates preserved');

        const motorcycle = new VehiclePresence({ type: VehicleType.MOTORCYCLE, position: new Position(5, 0, -3) });
        assert(motorcycle.type === VehicleType.MOTORCYCLE, '4. MOTORCYCLE + valid Position instance constructs');

        const car = new VehiclePresence({ type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } });
        assert(car.type === VehicleType.CAR, '5. CAR + valid position constructs');

        const drone = new VehiclePresence({ type: VehicleType.DRONE, position: { x: -10, y: 40, z: 100 } });
        assert(drone.type === VehicleType.DRONE, '6. DRONE + valid position constructs');
        assert(drone.position.y === 40, '7. DRONE can sit above ground level — no altitude constraint imposed here');
    }

    // -------------------------------------------------------------
    // Section B — immutability
    // -------------------------------------------------------------
    {
        const presence = new VehiclePresence({ type: VehicleType.CAR, position: { x: 1, y: 2, z: 3 } });
        assert(Object.getOwnPropertyDescriptor(VehiclePresence.prototype, 'type').set === undefined, '8. no type setter exists');
        assert(Object.getOwnPropertyDescriptor(VehiclePresence.prototype, 'position').set === undefined, '9. no position setter exists');

        assert(Object.isFrozen(presence), '10. the instance itself is frozen');
        assertThrows(() => { presence._type = VehicleType.DRONE; }, '11. reassigning the backing field directly throws (frozen, strict-mode ESM)');
        assert(presence.type === VehicleType.CAR, '12. the descriptor is unchanged after the rejected reassignment attempt');

        const json = presence.toJSON();
        json.type = VehicleType.DRONE;
        assert(presence.type === VehicleType.CAR, '13. mutating a toJSON() snapshot does not affect the source descriptor');

        const roundTripped = VehiclePresence.fromJSON(presence.toJSON());
        assert(roundTripped.type === presence.type, '14. fromJSON(toJSON()) preserves type');
        assert(roundTripped.position.equals(presence.position), '15. fromJSON(toJSON()) preserves position');
        assert(roundTripped !== presence, '16. fromJSON() always produces a new instance, never the same object');
    }

    // -------------------------------------------------------------
    // Section C — defensive validation
    // -------------------------------------------------------------
    {
        assertThrows(() => new VehiclePresence({ position: { x: 0, y: 0, z: 0 } }), '17. missing type throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.NONE, position: { x: 0, y: 0, z: 0 } }), '18. VehicleType.NONE throws — absence, not a NONE presence');
        assertThrows(() => new VehiclePresence({ type: 'scooter', position: { x: 0, y: 0, z: 0 } }), '19. unknown type throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR }), '20. missing position throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: { x: 'left', y: 0, z: 0 } }), '21. non-numeric coordinate throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: { x: NaN, y: 0, z: 0 } }), '22. NaN coordinate throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: { x: Infinity, y: 0, z: 0 } }), '23. non-finite coordinate throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: { x: 0, y: 0 } }), '24. incomplete position (missing z) throws');
        assertThrows(() => new VehiclePresence(null), '25. null options throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: [0, 0, 0] }), '26. an array position throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: null }), '27. a null position throws');
        assertThrows(() => new VehiclePresence({ type: VehicleType.CAR, position: 'here' }), '28. a string position throws');
        assertThrows(() => new VehiclePresence({}), '29. an empty options object throws');
    }

    // -------------------------------------------------------------
    // Section D — type preservation
    // -------------------------------------------------------------
    {
        const position = { x: 0, y: 0, z: 0 };
        const types = [VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]
            .map((type) => new VehiclePresence({ type, position }).type);
        assert(new Set(types).size === 4, '30. all four non-NONE vehicle types remain distinct through construction');
        assert(types[0] === VehicleType.BICYCLE && types[1] === VehicleType.MOTORCYCLE
            && types[2] === VehicleType.CAR && types[3] === VehicleType.DRONE,
            '31. each descriptor reports exactly the type it was constructed with, no coercion between them');
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
            'collision', 'terrain', 'seed'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `32. core/VehiclePresence.js's own code never references "${term}" — a world-level existence-and-location descriptor only`);
        }
    }
    {
        const exportsModule = await import('../core/VehiclePresence.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['VehiclePresence']),
            '33. core/VehiclePresence.js exports exactly the descriptor class, nothing else');
    }

    console.log('✅ All Vehicle Presence tests passed.');
}

await runTests();
