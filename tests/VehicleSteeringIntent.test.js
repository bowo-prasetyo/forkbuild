import { readFile } from 'node:fs/promises';
import {
    VehicleSteeringDirection,
    isValidVehicleSteeringDirection,
    VehicleSteeringIntent,
    createVehicleSteeringIntent,
    isValidVehicleSteeringIntent
} from '../core/VehicleSteeringIntent.js';
import { VehicleInstance, vehicleInstanceFromPresence } from '../core/VehicleInstance.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';

// 0.9.125 — Vehicle Steering Intent, core/VehicleSteeringIntent.js.
//
//   Section A: vocabulary — NONE/LEFT/RIGHT, isValidVehicleSteeringDirection()
//   Section B: immutability — getter-only, frozen, no mutation after
//              construction
//   Section C: semantic independence — constructing an intent requires no
//              vehicle position, heading, type, movement capability,
//              collision state, or avatar rotation
//   Section D: no behavioral coupling — holding an intent never changes a
//              vehicle's own position or heading
//   Section E: runtime exclusion — VehicleRuntimeInstances/VehicleInstance
//              acquire no steering state
//   Section F: structural audit — no steering angle, rate, turn radius,
//              angular velocity, heading mutation, wheel rotation, oriented
//              collision, or physics anywhere in this file's own code
//   Section G: JSON representation, factories, and predicates
//
// Central architectural claim under test throughout: a VehicleSteeringIntent
// describes what the driver REQUESTS, never what the vehicle actually does.
// See docs/Roadmap.md, 0.9.125.

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
    const { NONE, LEFT, RIGHT } = VehicleSteeringDirection;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none' && LEFT === 'left' && RIGHT === 'right',
            '1. VehicleSteeringDirection has exactly the three expected values');
        assert(Object.isFrozen(VehicleSteeringDirection),
            '2. VehicleSteeringDirection is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(VehicleSteeringDirection).length === 3,
            '3. VehicleSteeringDirection has no fourth value');
    }
    {
        assert(isValidVehicleSteeringDirection(NONE), '4. NONE is a valid direction');
        assert(isValidVehicleSteeringDirection(LEFT), '5. LEFT is a valid direction');
        assert(isValidVehicleSteeringDirection(RIGHT), '6. RIGHT is a valid direction');
        assert(!isValidVehicleSteeringDirection('sideways'), '7. an unrelated string is not a valid direction');
        assert(!isValidVehicleSteeringDirection(undefined), '8. undefined is not a valid direction');
        assert(!isValidVehicleSteeringDirection(null), '9. null is not a valid direction');
        assert(!isValidVehicleSteeringDirection(''), '10. an empty string is not a valid direction');
        assert(!isValidVehicleSteeringDirection('LEFT'), '11. direction validation is case-sensitive — the vocabulary\'s own lower-case values only');
    }
    {
        assertThrows(() => { VehicleSteeringDirection.LEFT = 'sideways'; }, '12. reassigning a value on the frozen vocabulary throws (strict-mode ESM)');
        assert(VehicleSteeringDirection.LEFT === 'left', '13. the vocabulary is unchanged after the rejected reassignment attempt');
        assertThrows(() => { VehicleSteeringDirection.UP = 'up'; }, '14. adding a new value to the frozen vocabulary throws');
        assert(Object.keys(VehicleSteeringDirection).length === 3, '15. the vocabulary still has exactly three values');
    }
    {
        assertThrows(() => new VehicleSteeringIntent('sideways'), '16. constructing with an unknown direction throws');
        assertThrows(() => new VehicleSteeringIntent(undefined), '17. constructing with undefined throws');
        assertThrows(() => new VehicleSteeringIntent(null), '18. constructing with null throws');
        assertThrows(() => new VehicleSteeringIntent(), '19. constructing with no argument at all throws');
        assertThrows(() => new VehicleSteeringIntent('LEFT'), '20. constructing with the wrong case throws');
        assertThrows(() => new VehicleSteeringIntent(1), '21. constructing with a non-string value throws');
        assertThrows(() => createVehicleSteeringIntent('sideways'), '22. the factory function rejects an unknown direction exactly like the class constructor');
    }

    // -------------------------------------------------------------
    // Section B — immutability
    // -------------------------------------------------------------
    {
        const intent = new VehicleSteeringIntent(LEFT);
        assert(Object.isFrozen(intent), '23. a constructed intent is frozen');
        assert(Object.getOwnPropertyDescriptor(VehicleSteeringIntent.prototype, 'direction').set === undefined,
            '24. no direction setter exists');
        assertThrows(() => { intent._direction = RIGHT; }, '25. reassigning the backing field directly throws (frozen, strict-mode ESM)');
        assert(intent.direction === LEFT, '26. direction is unchanged after the rejected reassignment attempt');
    }
    {
        const intent = createVehicleSteeringIntent(RIGHT);
        assert(Object.isFrozen(intent), '27. an intent constructed via the factory function is frozen too');
        assert(intent.direction === RIGHT, '28. direction is exactly what was requested');
    }
    {
        // No mutation of a direction string passed in — strings are
        // already immutable primitives, but this proves the intent never
        // wraps it in anything that could later be mutated in place.
        const rawDirection = LEFT;
        const intent = new VehicleSteeringIntent(rawDirection);
        assert(intent.direction === rawDirection, '29. the stored direction is the exact same primitive string value passed in');
    }

    // -------------------------------------------------------------
    // Section C — semantic independence: constructing an intent needs no
    // vehicle at all
    // -------------------------------------------------------------
    {
        // These constructions happen with zero vehicle position, heading,
        // type, movement capability, collision state, or avatar rotation
        // anywhere in scope — nothing above this block ever mentions a
        // vehicle, and none of these calls take one.
        const none = VehicleSteeringIntent.none();
        const left = VehicleSteeringIntent.left();
        const right = VehicleSteeringIntent.right();
        assert(none.direction === NONE && left.direction === LEFT && right.direction === RIGHT,
            '30. NONE/LEFT/RIGHT all construct successfully with no vehicle in scope at all');
        assert(!('position' in left) && !('heading' in left) && !('type' in left)
            && !('collisionRadius' in left) && !('rotation' in left),
            '31. a VehicleSteeringIntent instance carries no position/heading/type/collision/rotation field of any kind');
    }
    {
        // The class's own constructor signature is the direct proof: it
        // takes exactly one argument, a direction string, never a vehicle
        // or a VehicleInstance-shaped object.
        assert(VehicleSteeringIntent.length === 1, '32. VehicleSteeringIntent\'s constructor takes exactly one parameter (direction)');
        const vehicleLikeObject = { id: 'vehicle:1:0,0', type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 }, heading: 90 };
        assertThrows(() => new VehicleSteeringIntent(vehicleLikeObject), '33. a VehicleInstance-shaped object is rejected — only a plain direction string is accepted');
    }

    // -------------------------------------------------------------
    // Section D — no behavioral coupling: holding an intent never moves
    // or reorients a real vehicle
    // -------------------------------------------------------------
    {
        const presence = new VehiclePresence({ id: 'vehicle:steer:1,1', type: VehicleType.BICYCLE, position: { x: 5, y: 0, z: 5 } });
        const vehicle = vehicleInstanceFromPresence(presence).withHeading(90);
        const beforePosition = vehicle.position;
        const beforeHeading = vehicle.heading;

        const left = VehicleSteeringIntent.left();
        // Merely creating and holding the intent — never passed to the
        // vehicle, never passed to any movement or heading function.
        assert(left.direction === LEFT, '34. the steering intent itself is exactly LEFT');
        assert(vehicle.position === beforePosition, '35. the vehicle\'s own position object reference is unchanged after creating a LEFT steering intent');
        assert(vehicle.position.x === 5 && vehicle.position.z === 5, '36. the vehicle\'s own position value is unchanged after creating a LEFT steering intent');
        assert(vehicle.heading === beforeHeading && vehicle.heading === 90, '37. the vehicle\'s own heading is unchanged after creating a LEFT steering intent');
    }
    {
        const presence = new VehiclePresence({ id: 'vehicle:steer:2,2', type: VehicleType.BICYCLE, position: { x: -3, y: 0, z: 8 } });
        const vehicle = vehicleInstanceFromPresence(presence).withHeading(90);
        const beforePosition = vehicle.position;
        const beforeHeading = vehicle.heading;

        const right = VehicleSteeringIntent.right();
        assert(right.direction === RIGHT, '38. the steering intent itself is exactly RIGHT');
        assert(vehicle.position === beforePosition, '39. the vehicle\'s own position object reference is unchanged after creating a RIGHT steering intent');
        assert(vehicle.heading === beforeHeading && vehicle.heading === 90, '40. the vehicle\'s own heading is unchanged after creating a RIGHT steering intent — heading = 90 still means 90, never 0 (heading - 90) or 180 (heading + 90)');
    }
    {
        // core/VehicleMovementHeading.js's own resolver is entirely
        // unaffected by, and never consulted from, this file — feeding it
        // the exact same displacement before and after constructing a
        // steering intent produces the exact same heading either way.
        const before = resolveVehicleHeadingFromMovement({ dx: 1, dz: 0, previousHeading: 45 });
        VehicleSteeringIntent.left();
        VehicleSteeringIntent.right();
        const after = resolveVehicleHeadingFromMovement({ dx: 1, dz: 0, previousHeading: 45 });
        assert(before === after, '41. resolveVehicleHeadingFromMovement() is unaffected by any steering intent having been constructed in between');
    }

    // -------------------------------------------------------------
    // Section E — runtime exclusion
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        assert(typeof store.setHeading === 'function' && typeof store.setPosition === 'function',
            '42. VehicleRuntimeInstances still exposes its existing setHeading()/setPosition() methods, unchanged');
        assert(typeof store.setSteering !== 'function' && typeof store.setSteeringIntent !== 'function',
            '43. VehicleRuntimeInstances acquires no steering-setting method of any kind');
        assert(!('steering' in store) && !('_steering' in store),
            '44. a VehicleRuntimeInstances instance carries no steering field of any kind');
    }
    {
        const presence = new VehiclePresence({ id: 'vehicle:steer:3,3', type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 } });
        const vehicle = vehicleInstanceFromPresence(presence);
        assert(!('steering' in vehicle) && !('_steering' in vehicle),
            '45. a VehicleInstance carries no steering field of any kind');
        assert(typeof vehicle.withSteering !== 'function',
            '46. VehicleInstance gains no withSteering() method');
        assert(JSON.stringify(Object.keys(vehicle.toJSON()).sort()) === JSON.stringify(['heading', 'id', 'position', 'spawnPosition', 'type']),
            '47. VehicleInstance#toJSON() carries exactly its existing five fields — no steering field added');
    }
    {
        const sourceUrl = new URL('../application/VehicleRuntimeInstances.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/[Ss]teering/.test(codeOnly), '48. application/VehicleRuntimeInstances.js\'s own code never mentions steering — this milestone leaves it byte-for-byte unchanged');
    }
    {
        const sourceUrl = new URL('../core/VehicleInstance.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/[Ss]teering/.test(codeOnly), '49. core/VehicleInstance.js\'s own code never mentions steering — this milestone leaves it byte-for-byte unchanged');
    }
    {
        const sourceUrl = new URL('../core/VehicleMovementHeading.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/[Ss]teering/.test(codeOnly), '50. core/VehicleMovementHeading.js\'s own code never mentions steering, and never imports core/VehicleSteeringIntent.js — heading stays derived only from realized displacement');
        assert(!codeOnly.includes('VehicleSteeringIntent'), '51. core/VehicleMovementHeading.js never imports or references VehicleSteeringIntent');
    }

    // -------------------------------------------------------------
    // Section F — structural audit of this milestone's own new file
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehicleSteeringIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'steeringAngle', 'steeringRate', 'turnRadius', 'turningRadius', 'angularVelocity',
            'wheelRotation', 'rotationY', 'withHeading', 'setHeading', 'resolveVehicleHeading',
            'oriented', 'Ackermann', 'drift', 'skid', 'lean',
            'VehicleInstance', 'VehicleMovementHeading', 'VehicleRuntimeInstances', 'VehiclePresence',
            'position', 'heading', 'collision', 'Collision',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent',
            'velocity', 'acceleration', 'mass', 'gravity', 'physics',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `52. core/VehicleSteeringIntent.js's own code never references "${term}" — a pure, closed steering-intent vocabulary and value object only, never steering angle/rate/turn-radius/angular-velocity/heading-mutation/wheel-rotation/oriented-collision/physics/vehicle-state/input/rendering/persistence/networking`);
        }
    }
    {
        const exportsModule = await import('../core/VehicleSteeringIntent.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify([
            'VehicleSteeringDirection', 'VehicleSteeringIntent',
            'createVehicleSteeringIntent', 'isValidVehicleSteeringDirection', 'isValidVehicleSteeringIntent'
        ]), '53. core/VehicleSteeringIntent.js exports exactly the vocabulary, the value-object class, its factory, and both validators — nothing else');
    }

    // -------------------------------------------------------------
    // Section G — JSON representation, factories, and predicates
    // -------------------------------------------------------------
    {
        const intent = new VehicleSteeringIntent(LEFT);
        const json = intent.toJSON();
        assert(JSON.stringify(Object.keys(json).sort()) === JSON.stringify(['direction']), '54. toJSON() carries exactly one field, direction');
        assert(json.direction === LEFT, '55. toJSON() preserves the direction');

        const roundTripped = VehicleSteeringIntent.fromJSON(json);
        assert(roundTripped instanceof VehicleSteeringIntent, '56. fromJSON() returns a VehicleSteeringIntent instance');
        assert(roundTripped.direction === intent.direction, '57. fromJSON(toJSON()) preserves the direction exactly');
        assert(roundTripped !== intent, '58. fromJSON() always produces a new instance, never the same object');

        json.direction = RIGHT;
        assert(intent.direction === LEFT, '59. mutating a toJSON() snapshot does not affect the source intent');
    }
    {
        assertThrows(() => VehicleSteeringIntent.fromJSON({ direction: 'sideways' }), '60. fromJSON() rejects an unknown direction exactly like the constructor');
        assertThrows(() => VehicleSteeringIntent.fromJSON({}), '61. fromJSON() rejects a missing direction field');
    }
    {
        const none = VehicleSteeringIntent.none();
        const left = VehicleSteeringIntent.left();
        const right = VehicleSteeringIntent.right();
        assert(none.isNone === true && none.isLeft === false && none.isRight === false, '62. NONE\'s own predicates report isNone true, isLeft/isRight false');
        assert(left.isLeft === true && left.isNone === false && left.isRight === false, '63. LEFT\'s own predicates report isLeft true, isNone/isRight false');
        assert(right.isRight === true && right.isNone === false && right.isLeft === false, '64. RIGHT\'s own predicates report isRight true, isNone/isLeft false');
    }
    {
        const a = VehicleSteeringIntent.left();
        const b = VehicleSteeringIntent.left();
        assert(a !== b, '65. two separately constructed LEFT intents are distinct instances');
        assert(a.direction === b.direction, '66. ...but report the same direction');
    }
    {
        assert(isValidVehicleSteeringIntent(VehicleSteeringIntent.none()) === true, '67. a properly constructed NONE intent is valid');
        assert(isValidVehicleSteeringIntent(VehicleSteeringIntent.left()) === true, '68. a properly constructed LEFT intent is valid');
        assert(isValidVehicleSteeringIntent(VehicleSteeringIntent.right()) === true, '69. a properly constructed RIGHT intent is valid');
        assert(isValidVehicleSteeringIntent(undefined) === false, '70. undefined is not a valid steering intent');
        assert(isValidVehicleSteeringIntent(null) === false, '71. null is not a valid steering intent — unlike core/AvatarVehicleMount.js\'s own mount value, there is no "absence" spelling here: NONE already names "not currently steering"');
        assert(isValidVehicleSteeringIntent(LEFT) === false, '72. a bare direction string is not a valid steering intent — it must be a VehicleSteeringIntent instance');
        assert(isValidVehicleSteeringIntent({ direction: LEFT }) === false, '73. a plain object shaped like an intent is not a valid steering intent — object identity matters, not merely matching shape');
    }

    console.log('✅ All Vehicle Steering Intent tests passed.');
}

await runTests();
