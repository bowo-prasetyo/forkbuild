import { readFile } from 'node:fs/promises';
import { resolveMovementHeading } from '../core/AvatarMovementSteeringSimulation.js';

// 0.9.93 — Vehicle Steering Capability: core/AvatarMovementSteeringSimulation.js,
// the pure mathematical half (see that file's own header). This suite
// covers the ONE function it exports directly — no engine, no capability
// vocabulary, no controller — matching the same "pure geometry/math,
// independently testable" split tests/AvatarMovementAccelerationSimulation.test.js's
// own suite already established for core/AvatarMovementAccelerationSimulation.js's
// own `resolveMovementSpeed()`.
//
//   Section A: approaching a target heading, one tick at a time, never
//              overshooting
//   Section B: angular wraparound — the shortest path around the circle,
//              never the long way
//   Section C: deltaTime edge cases — zero, negative, non-finite
//   Section D: fractional deltaTime
//   Section E: a sufficiently large deltaTime/steeringRate reaches the
//              target exactly, without overshoot
//   Section F: steeringRate/currentHeading/targetHeading edge cases —
//              zero/negative/non-finite rate, already-at-target,
//              non-finite inputs, angle normalization
//   Section G: determinism — identical inputs always produce identical
//              outputs
//   Section H: architectural regression — no VehicleType/VehiclePresence/
//              AvatarVehicleMount/WorldNavigationSession/capability-
//              vocabulary/keyboard import anywhere in this file's own
//              source; and (0.9.94 update — see that milestone's own note
//              below) core/AvatarMovementSimulation.js now DOES call
//              resolveMovementHeading(), gated on a real steeringRate, but
//              application/AvatarMovementController.js still never
//              references this file or the steering capability vocabulary
//              directly — the actual wiring lives exactly one layer down,
//              matching how 0.9.91 wired resolveMovementSpeed() in.
//
// Central architectural claim under test throughout: this file answers
// only "given a rate, a current heading, and a target heading, what is
// the heading one simulation tick later," never "which vehicle, if any,
// is involved" or "should a rate even apply here" — see
// core/AvatarMovementSteeringSimulation.js's own header. See
// docs/Roadmap.md, 0.9.93.
//
// 0.9.94 note — Vehicle Steering State Integration. This file's own
// Section H originally asserted (as of 0.9.93) that NEITHER
// core/AvatarMovementSimulation.js NOR application/AvatarMovementController.js
// referenced this seam at all — "steering is resolved and testable, but
// not yet wired into any real controller." 0.9.94 is that wiring, and
// this suite's own architectural regression section is updated in place
// (not superseded — the exact same "prove the wiring lives where the
// milestone's own header says it does" claim, now proving the OPPOSITE
// half: that it DOES exist, in EXACTLY the one place documented) — see
// tests/AvatarVehicleSteeringStateIntegration.test.js for the full
// behavioral integration suite (WALK regression, per-vehicle ramps,
// held/released turning, capability switching, wraparound, DRONE
// blocking) this milestone adds alongside it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const QUARTER_PI = Math.PI / 4;

function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function assertAnglesClose(actual, expected, message) {
    // Both already normalized into [0, 2π) by resolveMovementHeading() —
    // a direct numeric comparison, with a small floating-point tolerance,
    // is enough; no separate wraparound handling needed here.
    assert(Math.abs(actual - expected) < 1e-9, `${message} (got ${actual}, expected ${expected})`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — approaching a target heading
    // -------------------------------------------------------------
    {
        // The design brief's own worked example: current=0°, target=90°,
        // rate=45°/s, dt=1s -> 45°, then 45° -> 90° exactly one second
        // later.
        const rate = degreesToRadians(45);
        const first = resolveMovementHeading({ currentHeading: 0, targetHeading: HALF_PI, steeringRate: rate, deltaTime: 1 });
        assertAnglesClose(first, QUARTER_PI, '1. current=0, target=π/2 (90°), steeringRate=45°/s, dt=1 -> 45°, exactly steeringRate*dt closer to target');

        const second = resolveMovementHeading({ currentHeading: first, targetHeading: HALF_PI, steeringRate: rate, deltaTime: 1 });
        assertAnglesClose(second, HALF_PI, '2. current=45°, target=90°, steeringRate=45°/s, dt=1 -> 90° exactly, reaching the target on the second tick');

        const third = resolveMovementHeading({ currentHeading: second, targetHeading: HALF_PI, steeringRate: rate, deltaTime: 1 });
        assertAnglesClose(third, HALF_PI, '3. once at target, another tick at the same rate stays exactly at target — no overshoot');
    }

    // -------------------------------------------------------------
    // Section B — angular wraparound
    // -------------------------------------------------------------
    {
        // 350° -> 10° must move through 350° -> 360°/0° -> 10° (a 20°
        // turn), never the long 340° route the other way.
        const current = degreesToRadians(350);
        const target = degreesToRadians(10);
        const rate = degreesToRadians(45);
        const result = resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: 1 });
        // 45°/s for 1s covers the entire 20° gap and clamps exactly at
        // the (normalized) target.
        assertAnglesClose(result, target, '4. current=350°, target=10°, steeringRate=45°/s, dt=1 -> 10° exactly, taking the short 20° route through 0°, not the long 340° route');

        // A smaller step proves the DIRECTION of travel: moving forward
        // (increasing angle, wrapping through 0) rather than backward.
        const smallStep = resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: 0.1 });
        const expectedSmallStep = degreesToRadians(350 + 4.5); // 45°/s * 0.1s = 4.5°, moving forward past 350°
        assertAnglesClose(smallStep, expectedSmallStep, '5. a small step from 350° toward 10° moves FORWARD (350° -> 354.5°), proving the short path through 0° is taken, not backward toward 340°');

        // 10° -> 340° is the mirror image: the short path is BACKWARD
        // (decreasing, wrapping through 0 — a 30° gap), never forward
        // through 180° (which would be a 330° trip).
        const mirrorCurrent = degreesToRadians(10);
        const mirrorTarget = degreesToRadians(340);
        const mirrorSmallStep = resolveMovementHeading({ currentHeading: mirrorCurrent, targetHeading: mirrorTarget, steeringRate: rate, deltaTime: 0.1 });
        const expectedMirrorSmallStep = normalizeExpected(10 - 4.5);
        assertAnglesClose(mirrorSmallStep, degreesToRadians(expectedMirrorSmallStep), '6. a small step from 10° toward 340° moves BACKWARD (10° -> 5.5°), proving the short 30° path through 0° is taken, not the long 330° path forward through 180°');

        // 359° -> 1° (the design brief's own second wraparound example) —
        // the mirror of case 4 above.
        const secondExample = resolveMovementHeading({ currentHeading: degreesToRadians(359), targetHeading: degreesToRadians(1), steeringRate: rate, deltaTime: 1 });
        assertAnglesClose(secondExample, degreesToRadians(1), '7. current=359°, target=1°, steeringRate=45°/s, dt=1 -> 1° exactly, a 2° gap closed instantly through 0°, never the long 358° route');

        // A heading of exactly 0 and a heading of exactly 2π name the
        // identical position on the circle — a target expressed as 2π
        // (rather than its own normalized 0) is still an exact no-op from
        // current=0.
        const alreadyThere = resolveMovementHeading({ currentHeading: 0, targetHeading: TWO_PI, steeringRate: rate, deltaTime: 1 });
        assertAnglesClose(alreadyThere, 0, '8. currentHeading=0 and targetHeading=2π name the identical heading — an exact no-op, not a full-circle turn');
    }

    // -------------------------------------------------------------
    // Section C — deltaTime edge cases
    // -------------------------------------------------------------
    {
        const current = QUARTER_PI;
        const target = HALF_PI;
        const rate = degreesToRadians(45);
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: 0 }), current, '9. deltaTime=0 never changes heading');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: -1 }), current, '10. a negative deltaTime is sanitized to "no change" rather than turning heading backward in time');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: NaN }), current, '11. a NaN deltaTime is sanitized to "no change"');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: Infinity }), current, '12. a non-finite (Infinity) deltaTime is sanitized to "no change," never Infinity/NaN propagated into the result');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: rate, deltaTime: undefined }), current, '13. deltaTime omitted (undefined) is sanitized to "no change"');
    }

    // -------------------------------------------------------------
    // Section D — fractional deltaTime
    // -------------------------------------------------------------
    {
        const rate = degreesToRadians(90);
        const halfTick = resolveMovementHeading({ currentHeading: 0, targetHeading: HALF_PI, steeringRate: rate, deltaTime: 0.5 });
        assertAnglesClose(halfTick, QUARTER_PI, '14. current=0, target=π/2, steeringRate=90°/s, dt=0.5 -> 45°, exactly half of one full-second tick\'s own step');

        const manyFractionalTicks = accumulateHeadingTicks(0, HALF_PI, rate, 0.1, 10);
        assertAnglesClose(manyFractionalTicks, HALF_PI, '15. ten 0.1s ticks at steeringRate=90°/s sum to exactly the same result as one full 1-second step, within floating-point tolerance');
    }

    // -------------------------------------------------------------
    // Section E — large deltaTime/steeringRate reaches target without overshoot
    // -------------------------------------------------------------
    {
        assertAnglesClose(resolveMovementHeading({ currentHeading: 0, targetHeading: Math.PI, steeringRate: degreesToRadians(45), deltaTime: 1000 }), Math.PI, '16. a very large deltaTime reaches the target exactly, never overshooting past it');
        assertAnglesClose(resolveMovementHeading({ currentHeading: 0, targetHeading: Math.PI, steeringRate: 1e9, deltaTime: 1 }), Math.PI, '17. a very large steeringRate reaches the target exactly in one tick, never overshooting past it');
        assertAnglesClose(resolveMovementHeading({ currentHeading: degreesToRadians(350), targetHeading: degreesToRadians(10), steeringRate: 1e9, deltaTime: 1 }), degreesToRadians(10), '18. a very large steeringRate closing a wraparound gap lands exactly at the (normalized) target');
    }

    // -------------------------------------------------------------
    // Section F — steeringRate/currentHeading/targetHeading edge cases
    // -------------------------------------------------------------
    {
        const current = 0;
        const target = HALF_PI;
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: 0, deltaTime: 1 }), current, '19. steeringRate=0 never changes heading — a zero rate never approaches a target');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: -1, deltaTime: 1 }), current, '20. a negative steeringRate is sanitized to "no rate applies" rather than turning heading away from the target');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: NaN, deltaTime: 1 }), current, '21. a NaN steeringRate is sanitized to "no rate applies"');
        assertAnglesClose(resolveMovementHeading({ currentHeading: target, targetHeading: target, steeringRate: degreesToRadians(45), deltaTime: 1 }), target, '22. currentHeading already equal to targetHeading is an exact no-op, computed with no rate math at all');
        assertAnglesClose(resolveMovementHeading({ currentHeading: NaN, targetHeading: target, steeringRate: degreesToRadians(45), deltaTime: 1 }), degreesToRadians(45), '23. a non-finite currentHeading is sanitized to 0 before resolving (0 -> 45° at steeringRate=45°/s, dt=1)');
        assertAnglesClose(resolveMovementHeading({ currentHeading: 0, targetHeading: NaN, steeringRate: degreesToRadians(45), deltaTime: 1 }), 0, '24. a non-finite targetHeading is sanitized to 0, which currentHeading already equals, so the result is an exact no-op');
        assertAnglesClose(resolveMovementHeading({ currentHeading: current, targetHeading: target, steeringRate: undefined, deltaTime: 1 }), current, '25. steeringRate omitted (undefined) is sanitized to "no rate applies"');

        // Negative and many-full-turns-past-zero headings are normalized
        // identically to their [0, 2π) equivalent.
        assertAnglesClose(resolveMovementHeading({ currentHeading: -HALF_PI, targetHeading: -HALF_PI, steeringRate: degreesToRadians(45), deltaTime: 1 }), 1.5 * Math.PI, '26. a negative currentHeading (-π/2) is normalized to its [0, 2π) equivalent (1.5π = 270°) before resolving');
        assertAnglesClose(resolveMovementHeading({ currentHeading: 0, targetHeading: TWO_PI * 3 + HALF_PI, steeringRate: 1e9, deltaTime: 1 }), HALF_PI, '27. a targetHeading many full turns past zero normalizes to the same heading as its single-turn equivalent');
    }

    // -------------------------------------------------------------
    // Section G — determinism
    // -------------------------------------------------------------
    {
        for (let i = 0; i < 5; i++) {
            const result = resolveMovementHeading({ currentHeading: QUARTER_PI, targetHeading: Math.PI, steeringRate: degreesToRadians(30), deltaTime: 0.35 });
            assertAnglesClose(result, QUARTER_PI + degreesToRadians(30) * 0.35, `28.${i} identical inputs always produce the identical result — no hidden clock, no Math.random`);
        }
    }

    // -------------------------------------------------------------
    // Section H — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarMovementSteeringSimulation.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence', 'VehicleType',
            'AvatarVehicleMovementCapability', 'AvatarMovementSteeringCapability',
            'AvatarMovementAccelerationCapability', 'AvatarMovementBrakingCapability',
            'AvatarMovementDirectionCapability', 'AvatarMovementState', 'AvatarPresence',
            'AvatarMovementAccelerationSimulation', 'resolveMovementSpeed',
            'currentSpeed', 'targetSpeed', 'acceleration', 'braking', 'brakingRequested',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'mass', 'physics', 'collision', 'Collision',
            'turnAxis', 'turning', 'left', 'right',
            'turningRadius', 'Ackermann', 'drift', 'skid',
            'coasting', 'friction', 'drag', 'momentum',
            'rotationY', 'TURN_RATE_DEGREES_PER_SECOND',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `29. core/AvatarMovementSteeringSimulation.js's own code never references "${term}" — pure heading math only, no vehicle/capability/runtime/rendering/collision knowledge whatsoever`);
        }

        const exportsModule = await import('../core/AvatarMovementSteeringSimulation.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['resolveMovementHeading']),
            '30. core/AvatarMovementSteeringSimulation.js exports exactly the one resolution function — nothing else');
    }
    {
        // 0.9.94 update — Vehicle Steering State Integration. This seam is
        // now wired into real movement, EXACTLY one layer down from where
        // 0.9.91 wired resolveMovementSpeed() in: core/AvatarMovementSimulation.js
        // itself, never application/AvatarMovementController.js directly —
        // see core/AvatarMovementSimulation.js's own 0.9.94 header for the
        // gate (a real, positive `steeringRate`) that keeps WALK's own
        // existing `TURN_RATE_DEGREES_PER_SECOND`/`rotationY` advance
        // completely untouched, byte-for-byte, whenever that gate is not
        // met.
        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        assert(simulationSource.includes('AvatarMovementSteeringSimulation') && simulationSource.includes('resolveMovementHeading'),
            '31. (as of 0.9.94) core/AvatarMovementSimulation.js now imports and calls resolveMovementHeading() — this is the "future milestone" this file\'s own header originally named as wiring this seam in, the direct twin of resolveMovementSpeed()\'s own 0.9.91 wiring');

        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        // Comment lines are excluded before checking — this class's own
        // prose (like this test file's own) documents the seam by name in
        // several header paragraphs; what matters architecturally is that
        // no CODE line ever imports/instantiates the pure math module or
        // the capability vocabulary directly.
        const controllerCodeOnly = controllerSource
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        assert(!controllerCodeOnly.includes('AvatarMovementSteeringSimulation') && !controllerCodeOnly.includes('resolveMovementHeading'),
            '32. application/AvatarMovementController.js still never imports core/AvatarMovementSteeringSimulation.js or calls resolveMovementHeading() directly — it only ever hands a bare steeringRate number to core/AvatarMovementSimulation.js, which is the one place this seam is actually wired in (the direct twin of _resolvedAcceleration()\'s own 0.9.91 discipline)');
        assert(!controllerCodeOnly.includes('AvatarMovementSteeringCapability') && !controllerCodeOnly.includes('AvatarMovementSteeringKind'),
            '33. application/AvatarMovementController.js never imports the AvatarMovementSteeringCapability vocabulary itself — it reads only a resolved capability\'s bare steering.steeringRate number (see its own _resolvedSteeringRate())');
    }

    console.log('✅ All Vehicle Steering Simulation tests passed.');
}

function accumulateHeadingTicks(startHeading, targetHeading, steeringRate, deltaTime, tickCount) {
    let heading = startHeading;
    for (let i = 0; i < tickCount; i++) {
        heading = resolveMovementHeading({ currentHeading: heading, targetHeading, steeringRate, deltaTime });
    }
    return heading;
}

// Normalizes an expected plain-degree value (which may be negative) into
// [0, 360) — a small test-only helper, kept separate from
// core/AvatarMovementSteeringSimulation.js's own normalizeAngle() so this
// suite never imports the module's internals, only its one public
// function.
function normalizeExpected(degrees) {
    const wrapped = degrees % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

await runTests();
