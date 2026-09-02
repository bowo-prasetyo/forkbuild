import { readFile } from 'node:fs/promises';
import {
    AvatarVehicleMount,
    createAvatarVehicleMount,
    isValidAvatarVehicleMount,
    clearAvatarVehicleMount
} from '../core/AvatarVehicleMount.js';

// 0.9.77 — Avatar-Vehicle Mount Relationship, core/AvatarVehicleMount.js.
//
//   Section A: valid vehicle id — a non-empty string produces a valid
//              relationship
//   Section B: immutability — getter-only, frozen, no mutation
//   Section C: identity preservation — the exact vehicle id is preserved
//   Section D: reconstruction — toJSON()/fromJSON() round-trips
//   Section E: invalid ids — null, undefined, empty string, non-string
//              values are all rejected
//   Section F: no vehicle object dependency — the constructor accepts an
//              id, never a VehiclePresence
//   Section G: independence from position — changing a vehicle's position
//              never alters the relationship
//   Section H: independence from type — no VehicleType is required
//   Section I: absence semantics — null, and clearAvatarVehicleMount()
//   Section J: isValidAvatarVehicleMount()
//   Section K: architectural regression — no proximity, interaction
//              intent, target resolution, keyboard, movement, collision,
//              rendering, physics, persistence, or networking
//
// Central architectural claim under test throughout: this file answers
// only "what relationship, if any, currently holds between an avatar and
// a vehicle by id" — never how that relationship comes to exist, changes,
// or ends. See docs/Roadmap.md, 0.9.77.

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
    // Section A — valid vehicle id
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:seed:12,8');
        assert(mount instanceof AvatarVehicleMount, '1. createAvatarVehicleMount() returns an AvatarVehicleMount instance');
        assert(mount.vehicleId === 'vehicle:seed:12,8', '2. vehicleId is preserved exactly as constructed');
    }
    {
        const mount = new AvatarVehicleMount('anything-non-empty');
        assert(mount.vehicleId === 'anything-non-empty', '3. an arbitrarily-shaped non-empty string id is accepted verbatim — this file enforces no format on the id, matching core/VehiclePresence.js\'s own restraint');
    }

    // -------------------------------------------------------------
    // Section B — immutability
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        assert(Object.getOwnPropertyDescriptor(AvatarVehicleMount.prototype, 'vehicleId').set === undefined, '4. no vehicleId setter exists');
        assert(Object.isFrozen(mount), '5. the instance itself is frozen');
        assertThrows(() => { mount._vehicleId = 'vehicle:1:9,9'; }, '6. reassigning the backing field directly throws (frozen, strict-mode ESM)');
        assert(mount.vehicleId === 'vehicle:1:0,0', '7. the descriptor is unchanged after the rejected reassignment attempt');
    }

    // -------------------------------------------------------------
    // Section C — identity preservation
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:7:12,8');
        assert(mount.vehicleId === 'vehicle:7:12,8', '8. the exact vehicle id handed to the constructor is preserved, never transformed or synthesized');
    }
    {
        const a = createAvatarVehicleMount('vehicle:1:0,0');
        const b = createAvatarVehicleMount('vehicle:1:0,0');
        assert(a !== b, '9. two separately constructed relationships with the same vehicleId are distinct instances');
        assert(a.vehicleId === b.vehicleId, '10. ...but report the same vehicleId');
    }

    // -------------------------------------------------------------
    // Section D — reconstruction
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:seed:3,-4');
        const json = mount.toJSON();
        assert(JSON.stringify(Object.keys(json).sort()) === JSON.stringify(['vehicleId']), '11. toJSON() carries exactly one field, vehicleId');
        assert(json.vehicleId === 'vehicle:seed:3,-4', '12. toJSON() preserves the vehicle id');

        const roundTripped = AvatarVehicleMount.fromJSON(json);
        assert(roundTripped instanceof AvatarVehicleMount, '13. fromJSON() returns an AvatarVehicleMount instance');
        assert(roundTripped.vehicleId === mount.vehicleId, '14. fromJSON(toJSON()) preserves the vehicle id exactly');
        assert(roundTripped !== mount, '15. fromJSON() always produces a new instance, never the same object');

        json.vehicleId = 'vehicle:tampered:0,0';
        assert(mount.vehicleId === 'vehicle:seed:3,-4', '16. mutating a toJSON() snapshot does not affect the source descriptor');
    }

    // -------------------------------------------------------------
    // Section E — invalid ids
    // -------------------------------------------------------------
    {
        assertThrows(() => createAvatarVehicleMount(null), '17. null vehicleId throws');
        assertThrows(() => createAvatarVehicleMount(undefined), '18. undefined vehicleId throws');
        assertThrows(() => createAvatarVehicleMount(), '19. a missing vehicleId argument throws');
        assertThrows(() => createAvatarVehicleMount(''), '20. an empty-string vehicleId throws');
        assertThrows(() => createAvatarVehicleMount(42), '21. a numeric vehicleId throws');
        assertThrows(() => createAvatarVehicleMount({}), '22. an object vehicleId throws');
        assertThrows(() => createAvatarVehicleMount([]), '23. an array vehicleId throws');
        assertThrows(() => createAvatarVehicleMount(true), '24. a boolean vehicleId throws');
        assertThrows(() => new AvatarVehicleMount(null), '25. the class constructor rejects a null vehicleId exactly like the factory function');
    }

    // -------------------------------------------------------------
    // Section F — no vehicle object dependency
    // -------------------------------------------------------------
    {
        // The constructor/factory takes an ID, never a VehiclePresence-
        // shaped object — even one that merely LOOKS like a vehicle is
        // rejected, since it is not itself a string.
        const vehicleLikeObject = { id: 'vehicle:1:0,0', type: 'bicycle', position: { x: 0, y: 0, z: 0 } };
        assertThrows(() => createAvatarVehicleMount(vehicleLikeObject), '26. a VehiclePresence-shaped object is rejected — only a plain string id is accepted');
    }

    // -------------------------------------------------------------
    // Section G — independence from position
    // -------------------------------------------------------------
    {
        // The relationship never carries or reasons about a position at
        // all — constructing it with a bare id is the only shape this
        // file's API accepts, so a caller cannot even attempt to smuggle
        // a position into it. This is that non-capability made explicit.
        const mount = createAvatarVehicleMount('vehicle:1:5,5');
        assert(!('position' in mount), '27. an AvatarVehicleMount instance carries no position field');
        assert(!('x' in mount) && !('y' in mount) && !('z' in mount), '28. no coordinate fields exist on the relationship — moving the vehicle cannot change it, because it never held a position to begin with');
    }

    // -------------------------------------------------------------
    // Section H — independence from type
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        assert(!('vehicleType' in mount), '29. an AvatarVehicleMount instance carries no vehicleType field');
        assert(JSON.stringify(Object.keys(mount.toJSON())) === JSON.stringify(['vehicleId']), '30. the relationship never requires or duplicates a VehicleType — the vehicle\'s own VehiclePresence is the sole source of that fact');
    }

    // -------------------------------------------------------------
    // Section I — absence semantics
    // -------------------------------------------------------------
    {
        assert(clearAvatarVehicleMount() === null, '31. clearAvatarVehicleMount() returns null');
        assert(isValidAvatarVehicleMount(null) === true, '32. null is a valid mount value — "not currently mounted"');
        assert(isValidAvatarVehicleMount(clearAvatarVehicleMount()) === true, '33. the result of clearAvatarVehicleMount() is itself a valid mount value');
    }

    // -------------------------------------------------------------
    // Section J — isValidAvatarVehicleMount()
    // -------------------------------------------------------------
    {
        assert(isValidAvatarVehicleMount(createAvatarVehicleMount('vehicle:1:0,0')) === true, '34. a properly constructed AvatarVehicleMount is valid');
        assert(isValidAvatarVehicleMount(undefined) === false, '35. undefined is not a valid mount value');
        assert(isValidAvatarVehicleMount('vehicle:1:0,0') === false, '36. a bare string is not a valid mount value — it must be an AvatarVehicleMount instance or null');
        assert(isValidAvatarVehicleMount({ vehicleId: 'vehicle:1:0,0' }) === false, '37. a plain object shaped like a mount is not a valid mount value — object identity matters, not merely matching shape');
        assert(isValidAvatarVehicleMount(0) === false, '38. a falsy non-null value is not a valid mount value');
    }

    // -------------------------------------------------------------
    // Section K — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleMount.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleType', 'AvatarPresence',
            'AvatarVehicleProximity', 'withinRadiusXZ', 'VEHICLE_INTERACTION_RADIUS',
            'AvatarVehicleInteractionIntent', 'AvatarVehicleInteractionTarget',
            'resolveAvatarVehicleInteractionTarget', 'targetVehicleId',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'mass', 'gravity', 'collision', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `39. core/AvatarVehicleMount.js's own code never references "${term}" — a relationship descriptor only, never proximity/intent/target-resolution/input/rendering/movement/collision/physics/persistence/networking/randomness/clock`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarVehicleMount.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarVehicleMount', 'clearAvatarVehicleMount', 'createAvatarVehicleMount', 'isValidAvatarVehicleMount']),
            '40. core/AvatarVehicleMount.js exports exactly the descriptor class, its factory, its validator, and clearAvatarVehicleMount — nothing else');
    }
    {
        // No mutation of a vehicleId string passed in — strings are
        // already immutable primitives, but this proves the descriptor
        // never wraps it in anything that could later be mutated in place.
        const id = 'vehicle:1:0,0';
        const mount = createAvatarVehicleMount(id);
        assert(mount.vehicleId === id, '41. the stored vehicleId is the exact same primitive string value passed in');
    }

    console.log('✅ All Avatar-Vehicle Mount Relationship tests passed.');
}

await runTests();
