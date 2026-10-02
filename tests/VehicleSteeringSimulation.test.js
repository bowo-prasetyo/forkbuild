import { readFile } from 'node:fs/promises';
import {
    resolveVehicleMovementDirectionFromSteering,
    DEFAULT_VEHICLE_STEERING_TURN_DEGREES
} from '../core/VehicleSteeringSimulation.js';
import { VehicleSteeringIntent, VehicleSteeringDirection } from '../core/VehicleSteeringIntent.js';
import { VehicleInstance, vehicleInstanceFromPresence } from '../core/VehicleInstance.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';
import { assert } from './support/Assert.js';

// 0.9.126 — Vehicle Steering Simulation, core/VehicleSteeringSimulation.js.
//
//   Section A: NONE preserves the current travel direction
//   Section B: RIGHT — deterministic rightward directional transformation
//   Section C: LEFT — deterministic leftward directional transformation
//   Section D: RIGHT/LEFT symmetry
//   Section E: purity — no runtime access, mutation, hidden state, or
//              time dependence
//   Section F: heading separation — the result is an attempted direction,
//              never a VehicleInstance.heading mutation
//   Section G: collision separation — this file has no knowledge of
//              buildings, trees, terrain, or vehicle-vs-world constraints
//   Section H: flagship — intent -> attempted direction -> realized
//              movement -> heading, open path and fully-blocked, composed
//              from this file plus core/VehicleMovementHeading.js alone
//
// Central architectural claim under test throughout: this file produces
// an ATTEMPTED movement direction, never a vehicle FACT — only
// core/VehicleMovementHeading.js's own resolveVehicleHeadingFromMovement(),
// fed REALIZED displacement, ever resolves a new heading. See
// docs/Roadmap.md, 0.9.126.

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (err) {
        threw = true;
    }
    assert(threw, message);
}

function assertClose(actual, expected, message, epsilon = 1e-9) {
    assert(Math.abs(actual - expected) < epsilon, `${message} (expected ${expected}, got ${actual})`);
}

// Turns a heading (degrees, 0 = +Z, 90 = +X — the exact representation
// core/VehicleMovementHeading.js's own header documents) into a unit-step
// (dx, dz) displacement — the direct inverse of that file's own
// `Math.atan2(dx, dz)`, used only by this test's own Section H to compose
// "attempted direction -> realized displacement" without importing any
// movement-simulation or collision code.
function stepFromDirection(directionDegrees, stepDistance = 1) {
    const radians = directionDegrees * (Math.PI / 180);
    return { dx: Math.sin(radians) * stepDistance, dz: Math.cos(radians) * stepDistance };
}

async function runTests() {
    const { NONE, RIGHT, LEFT } = VehicleSteeringDirection;
    const none = VehicleSteeringIntent.none();
    const right = VehicleSteeringIntent.right();
    const left = VehicleSteeringIntent.left();

    // -------------------------------------------------------------
    // Section A — NONE preserves the current travel direction
    // -------------------------------------------------------------
    {
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 0, steeringIntent: none }), 0,
            '1. NONE at heading 0 returns 0, unchanged');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 90, steeringIntent: none }), 90,
            '2. NONE at heading 90 returns 90, unchanged');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 271.5, steeringIntent: none }), 271.5,
            '3. NONE preserves a non-cardinal heading exactly');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 359.999, steeringIntent: none }), 359.999,
            '4. NONE preserves a heading left at the wrap boundary exactly');
    }
    {
        // "existing bicycle movement + NONE steering = existing movement
        // semantics" — for every heading a real ride could already be at,
        // NONE is a pure identity, so composing it with the existing
        // heading resolver changes nothing about that resolver's own
        // behavior (regression proof for the pre-0.9.126 pipeline).
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const direction = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: none });
            assertClose(direction, heading, `5. NONE at heading ${heading} is a pure identity`);
        }
    }

    // -------------------------------------------------------------
    // Section B — RIGHT: deterministic rightward directional transformation
    // -------------------------------------------------------------
    {
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 0, steeringIntent: right }), 315,
            '6. RIGHT at heading 0 (facing +Z) rotates to 315');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 90, steeringIntent: right }), 45,
            '7. RIGHT at heading 90 (facing +X) rotates to 45');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 180, steeringIntent: right }), 135,
            '8. RIGHT at heading 180 (facing -Z) rotates to 135');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 270, steeringIntent: right }), 225,
            '9. RIGHT at heading 270 (facing -X) rotates to 225');
    }
    {
        // Diagonal headings.
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 45, steeringIntent: right }), 0,
            '10. RIGHT at heading 45 rotates to 0');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 315, steeringIntent: right }), 270,
            '11. RIGHT at heading 315 rotates to 270');
    }
    {
        // Boundary angles around 0/360 — RIGHT must wrap forward through
        // 360 back toward 0, never go negative or throw.
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 10, steeringIntent: right }), 325,
            '12. RIGHT at heading 10 wraps to 325, not -35');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 0, steeringIntent: right }), 315,
            '13. RIGHT at heading 0 wraps to 315, not -45');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 44, steeringIntent: right }), 359,
            '14. RIGHT at heading 44 wraps to 359, not -1');
    }
    {
        // A custom steeringTurnDegrees is honored exactly.
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 100, steeringIntent: right, steeringTurnDegrees: 10 }), 90,
            '15. RIGHT honors a caller-supplied steeringTurnDegrees');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 5, steeringIntent: right, steeringTurnDegrees: 30 }), 335,
            '16. RIGHT with a custom steeringTurnDegrees still wraps correctly');
    }

    // -------------------------------------------------------------
    // Section C — LEFT: mirror of Section B
    // -------------------------------------------------------------
    {
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 0, steeringIntent: left }), 45,
            '17. LEFT at heading 0 (facing +Z) rotates to 45');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 90, steeringIntent: left }), 135,
            '18. LEFT at heading 90 (facing +X) rotates to 135');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 180, steeringIntent: left }), 225,
            '19. LEFT at heading 180 (facing -Z) rotates to 225');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 270, steeringIntent: left }), 315,
            '20. LEFT at heading 270 (facing -X) rotates to 315');
    }
    {
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 45, steeringIntent: left }), 90,
            '21. LEFT at heading 45 rotates to 90');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 315, steeringIntent: left }), 0,
            '22. LEFT at heading 315 rotates to 0');
    }
    {
        // Boundary angles around 0/360 — LEFT must wrap backward through
        // 0 back toward 360, never overshoot past 360.
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 350, steeringIntent: left }), 35,
            '23. LEFT at heading 350 wraps to 35, not 395');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 359, steeringIntent: left }), 44,
            '24. LEFT at heading 359 wraps to 44, not 404');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 315, steeringIntent: left }), 0,
            '25. LEFT at heading 315 wraps exactly to 0, not 360');
    }
    {
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 100, steeringIntent: left, steeringTurnDegrees: 10 }), 110,
            '26. LEFT honors a caller-supplied steeringTurnDegrees');
        assertClose(resolveVehicleMovementDirectionFromSteering({ previousHeading: 355, steeringIntent: left, steeringTurnDegrees: 30 }), 25,
            '27. LEFT with a custom steeringTurnDegrees still wraps correctly');
    }

    // -------------------------------------------------------------
    // Section D — RIGHT/LEFT symmetry
    // -------------------------------------------------------------
    {
        for (const heading of [0, 17, 45, 90, 179, 270, 330, 359]) {
            const rightResult = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: right });
            const leftResult = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: left });
            // Both rotate away from `heading` by exactly the same
            // magnitude, in opposite directions — the shortest signed gap
            // from `heading` to each result has equal absolute value.
            const rightGap = shortestSignedGap(heading, rightResult);
            const leftGap = shortestSignedGap(heading, leftResult);
            assertClose(Math.abs(rightGap), DEFAULT_VEHICLE_STEERING_TURN_DEGREES, `28. RIGHT at heading ${heading} rotates by exactly steeringTurnDegrees`);
            assertClose(Math.abs(leftGap), DEFAULT_VEHICLE_STEERING_TURN_DEGREES, `29. LEFT at heading ${heading} rotates by exactly steeringTurnDegrees`);
            assertClose(rightGap, -leftGap, `30. RIGHT and LEFT at heading ${heading} are symmetric, opposite-sign rotations`);
        }
    }
    {
        // Applying RIGHT then LEFT (or LEFT then RIGHT) of the identical
        // magnitude returns to the original heading.
        for (const heading of [0, 60, 200, 340]) {
            const afterRightThenLeft = resolveVehicleMovementDirectionFromSteering({
                previousHeading: resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: right }),
                steeringIntent: left
            });
            const afterLeftThenRight = resolveVehicleMovementDirectionFromSteering({
                previousHeading: resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: left }),
                steeringIntent: right
            });
            assertClose(afterRightThenLeft, heading, `31. RIGHT then LEFT from heading ${heading} returns to the original heading`);
            assertClose(afterLeftThenRight, heading, `32. LEFT then RIGHT from heading ${heading} returns to the original heading`);
        }
    }

    // -------------------------------------------------------------
    // Section E — purity
    // -------------------------------------------------------------
    {
        const results = new Set();
        for (let i = 0; i < 20; i++) {
            results.add(resolveVehicleMovementDirectionFromSteering({ previousHeading: 123.5, steeringIntent: right, steeringTurnDegrees: 17 }));
        }
        assert(results.size === 1, '33. repeated calls with identical inputs produce identical results — no randomness, no time dependence, no hidden state');
    }
    {
        const intent = VehicleSteeringIntent.right();
        const beforeDirection = intent.direction;
        const beforeFrozen = Object.isFrozen(intent);
        resolveVehicleMovementDirectionFromSteering({ previousHeading: 10, steeringIntent: intent });
        resolveVehicleMovementDirectionFromSteering({ previousHeading: 10, steeringIntent: intent });
        assert(intent.direction === beforeDirection, '34. calling the function never mutates the VehicleSteeringIntent passed in');
        assert(Object.isFrozen(intent) === beforeFrozen, '35. the passed-in VehicleSteeringIntent is still frozen after the call');
    }
    {
        // A fresh call with a different intent object, but the identical
        // (previousHeading, direction, steeringTurnDegrees) values,
        // produces the identical result — the function reads only the
        // intent's own `direction`, never object identity.
        const a = resolveVehicleMovementDirectionFromSteering({ previousHeading: 200, steeringIntent: VehicleSteeringIntent.left() });
        const b = resolveVehicleMovementDirectionFromSteering({ previousHeading: 200, steeringIntent: VehicleSteeringIntent.left() });
        assertClose(a, b, '36. two independently constructed but equivalent steering intents produce the identical result');
    }
    {
        const sourceUrl = new URL('../core/VehicleSteeringSimulation.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbidden = ['Math.random', 'Date.now', 'performance.now', 'setTimeout', 'setInterval', 'requestAnimationFrame'];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `37. core/VehicleSteeringSimulation.js's own code never references "${term}" — no hidden time or randomness dependence`);
        }
    }

    // -------------------------------------------------------------
    // Section F — heading separation: an attempted direction is never a
    // VehicleInstance.heading mutation
    // -------------------------------------------------------------
    {
        const presence = new VehiclePresence({ id: 'vehicle:steersim:1,1', type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 } });
        const vehicle = vehicleInstanceFromPresence(presence).withHeading(10);
        const beforeHeading = vehicle.heading;

        const attemptedDirection = resolveVehicleMovementDirectionFromSteering({ previousHeading: vehicle.heading, steeringIntent: right });

        assert(attemptedDirection !== beforeHeading, '38. the attempted direction genuinely differs from the vehicle\'s own current heading, for this test\'s own chosen heading/intent');
        assert(vehicle.heading === beforeHeading && vehicle.heading === 10, '39. the vehicle\'s own heading is completely unchanged by calling this function — it returns a value, it does not set one');
        assert(typeof vehicle.withHeading === 'function', '40. VehicleInstance#withHeading() still exists — this function never replaces the caller\'s own responsibility to call it explicitly, with realized displacement, later');
    }
    {
        const sourceUrl = new URL('../core/VehicleSteeringSimulation.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('VehicleInstance'), '41. core/VehicleSteeringSimulation.js never references VehicleInstance');
        assert(!codeOnly.includes('VehicleRuntimeInstances'), '42. core/VehicleSteeringSimulation.js never references VehicleRuntimeInstances');
        assert(!codeOnly.includes('withHeading') && !codeOnly.includes('setHeading'), '43. core/VehicleSteeringSimulation.js never calls withHeading()/setHeading() — it produces an attempted direction, never a heading mutation');
        assert(!codeOnly.includes('resolveVehicleHeadingFromMovement'), '44. core/VehicleSteeringSimulation.js never calls resolveVehicleHeadingFromMovement() — heading resolution stays entirely downstream');
    }
    {
        const exportsModule = await import('../core/VehicleSteeringSimulation.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['DEFAULT_VEHICLE_STEERING_TURN_DEGREES', 'resolveVehicleMovementDirectionFromSteering']),
            '45. core/VehicleSteeringSimulation.js exports exactly the pure resolver function and its one named default constant — nothing else');
    }

    // -------------------------------------------------------------
    // Section G — collision separation
    // -------------------------------------------------------------
    {
        assert(resolveVehicleMovementDirectionFromSteering.length === 0, '46. the function takes a single options object, not separate positional collision-shaped parameters — its arity reveals no collision-related parameter exists');
        const options = { previousHeading: 90, steeringIntent: right };
        assert(!('collisionRadius' in options), '47. sanity: this test\'s own call never supplies a collision parameter either, because none exists to supply');
    }
    {
        const sourceUrl = new URL('../core/VehicleSteeringSimulation.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbidden = [
            'building', 'Building', 'brick', 'Brick', 'tree', 'Tree', 'terrain', 'Terrain',
            'collision', 'Collision', 'obstacle', 'Obstacle', 'constraint', 'Constraint',
            'collisionRadius', 'AvatarMovementConstraint', 'AvatarTreeConstraint',
            'steeringAngle', 'steeringRate', 'turnRadius', 'turningRadius', 'angularVelocity',
            'wheelbase', 'friction', 'banking', 'momentum', 'THREE', 'from \'three\''
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `48. core/VehicleSteeringSimulation.js's own code never references "${term}" — no collision, world-geometry, or vehicle-physics knowledge of any kind`);
        }
    }
    {
        // The same attempted direction is returned whether or not the
        // caller happens to be mid-collision-resolution elsewhere — this
        // function is never even given the information needed to know.
        const inTheOpen = resolveVehicleMovementDirectionFromSteering({ previousHeading: 60, steeringIntent: left });
        const nearAWall = resolveVehicleMovementDirectionFromSteering({ previousHeading: 60, steeringIntent: left });
        assertClose(inTheOpen, nearAWall, '49. the attempted direction is identical regardless of any collision context a caller might separately be tracking — this function cannot see it');
    }

    // -------------------------------------------------------------
    // Section H — flagship: intent -> attempted direction -> realized
    // movement -> heading, open path and fully blocked
    // -------------------------------------------------------------
    {
        // Ride forward with NONE: the vehicle actually moves along its
        // current heading, and heading follows the realized movement,
        // exactly as it already did before this milestone.
        let heading = 0;
        const attempted = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: VehicleSteeringIntent.none() });
        const { dx, dz } = stepFromDirection(attempted);
        heading = resolveVehicleHeadingFromMovement({ dx, dz, previousHeading: heading });
        assertClose(heading, 0, '50. riding forward with NONE keeps heading at 0');

        // RIGHT steering, open path: the vehicle attempts a changed
        // direction, nothing blocks it, and the realized movement
        // determines the new heading.
        const attemptedRight = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: VehicleSteeringIntent.right() });
        assertClose(attemptedRight, 315, '51. RIGHT steering from heading 0 attempts direction 315');
        const openStep = stepFromDirection(attemptedRight);
        heading = resolveVehicleHeadingFromMovement({ dx: openStep.dx, dz: openStep.dz, previousHeading: heading });
        assertClose(heading, 315, '52. an unobstructed RIGHT turn realizes the attempted direction as the new heading');

        // LEFT steering, open path: same story, mirrored.
        const attemptedLeft = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: VehicleSteeringIntent.left() });
        assertClose(attemptedLeft, 0, '53. LEFT steering from heading 315 attempts direction 0');
        const openStep2 = stepFromDirection(attemptedLeft);
        heading = resolveVehicleHeadingFromMovement({ dx: openStep2.dx, dz: openStep2.dz, previousHeading: heading });
        assertClose(heading, 0, '54. an unobstructed LEFT turn realizes the attempted direction as the new heading');
    }
    {
        // The most important regression case: RIGHT steering while
        // completely blocked. The vehicle still ATTEMPTS a changed
        // direction — this file's own output is identical whether or not
        // anything downstream will honor it — but a collision constraint
        // (simulated here as "no displacement at all," never actually
        // invoked from this file) absorbs the entire step, so realized
        // displacement is zero, position is unchanged, and heading is
        // therefore unchanged too. Steering never becomes a disguised
        // heading setter.
        const startingHeading = 200;
        const attempted = resolveVehicleMovementDirectionFromSteering({ previousHeading: startingHeading, steeringIntent: VehicleSteeringIntent.right() });
        assertClose(attempted, 155, '55. RIGHT steering from heading 200 attempts direction 155, regardless of what happens next');

        // A fully-blocked tick: the collision constraint (not this file)
        // absorbs the entire attempted step, so realized displacement is
        // (0, 0) — exactly the "no genuine horizontal movement" case
        // core/VehicleMovementHeading.js's own header already documents.
        const blockedHeading = resolveVehicleHeadingFromMovement({ dx: 0, dz: 0, previousHeading: startingHeading });
        assertClose(blockedHeading, startingHeading, '56. a fully-blocked RIGHT turn leaves heading completely unchanged, even though the attempted direction (155) differed from it');
        assert(blockedHeading !== attempted, '57. the vehicle\'s own realized heading and this file\'s own attempted direction are two genuinely different numbers here — the flagship proof that steering never becomes a disguised heading setter');
    }

    console.log('✅ All Vehicle Steering Simulation tests passed.');
}

// The shortest signed gap, in degrees, from `from` to `to` — positive
// means "to" is reached by increasing angle (a LEFT-style rotation),
// negative means decreasing angle (a RIGHT-style rotation). Used only by
// this test's own Section D to compare RIGHT/LEFT rotations without
// duplicating core/VehicleSteeringSimulation.js's own normalization.
function shortestSignedGap(from, to) {
    let diff = (to - from) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
}

await runTests();
