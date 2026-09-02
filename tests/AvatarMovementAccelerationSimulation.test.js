import { readFile } from 'node:fs/promises';
import { resolveMovementSpeed } from '../core/AvatarMovementAccelerationSimulation.js';

// 0.9.90 — Vehicle Acceleration Capability: core/AvatarMovementAccelerationSimulation.js,
// the pure mathematical half (see that file's own header). This suite
// covers the ONE function it exports directly — no engine, no
// capability vocabulary, no controller — matching the same "pure
// geometry/math, independently testable" split tests/AvatarMovement.test.js's
// own Section B already established for core/AvatarMovementSimulation.js's
// own `simulateAvatarMovement()`.
//
//   Section A: approaching a higher target speed, one tick at a time,
//              never overshooting
//   Section B: approaching a LOWER target speed (decelerating toward
//              it), never overshooting past it
//   Section C: deltaTime edge cases — zero, negative, non-finite
//   Section D: fractional deltaTime
//   Section E: a sufficiently large deltaTime/rate reaches the target
//              exactly, without overshoot
//   Section F: acceleration/currentSpeed/targetSpeed edge cases —
//              zero/negative/non-finite rate, already-at-target,
//              non-finite inputs
//   Section G: determinism — identical inputs always produce identical
//              outputs
//   Section H: architectural regression — no VehicleType/VehiclePresence/
//              AvatarVehicleMount/WorldNavigationSession/capability-
//              vocabulary import anywhere in this file's own source
//
// Central architectural claim under test throughout: this file answers
// only "given a rate, a current speed, and a target speed, what is the
// speed one simulation tick later," never "which vehicle, if any, is
// involved" or "should a rate even apply here" — see
// core/AvatarMovementAccelerationSimulation.js's own header. See
// docs/Roadmap.md, 0.9.90.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — approaching a higher target speed
    // -------------------------------------------------------------
    {
        const first = resolveMovementSpeed({ currentSpeed: 0, targetSpeed: 6, acceleration: 3, deltaTime: 1 });
        assert(first === 3, '1. current=0, target=6, acceleration=3, dt=1 -> 3');

        const second = resolveMovementSpeed({ currentSpeed: first, targetSpeed: 6, acceleration: 3, deltaTime: 1 });
        assert(second === 6, '2. current=3, target=6, acceleration=3, dt=1 -> 6 (reaches target exactly on the second tick)');

        const third = resolveMovementSpeed({ currentSpeed: second, targetSpeed: 6, acceleration: 3, deltaTime: 1 });
        assert(third === 6, '3. once at target, another tick at the same rate stays exactly at target — no overshoot into a "negative gap"');

        const almostThere = resolveMovementSpeed({ currentSpeed: 5, targetSpeed: 6, acceleration: 3, deltaTime: 1 });
        assert(almostThere === 6, '4. current=5, target=6, acceleration=3, dt=1 -> 6, clamped exactly at the target rather than overshooting to 8');
    }

    // -------------------------------------------------------------
    // Section B — approaching a lower target speed
    // -------------------------------------------------------------
    {
        const first = resolveMovementSpeed({ currentSpeed: 12, targetSpeed: 0, acceleration: 4, deltaTime: 1 });
        assert(first === 8, '5. current=12, target=0, acceleration=4, dt=1 -> 8 — the SAME rate closes a gap from above too');

        const closeToZero = resolveMovementSpeed({ currentSpeed: 2, targetSpeed: 0, acceleration: 4, deltaTime: 1 });
        assert(closeToZero === 0, '6. current=2, target=0, acceleration=4, dt=1 -> 0, clamped exactly at the target rather than overshooting to -2 (never a negative speed produced by this clamp)');

        const droppingToMidpoint = resolveMovementSpeed({ currentSpeed: 10, targetSpeed: 4, acceleration: 2, deltaTime: 1 });
        assert(droppingToMidpoint === 8, '7. decelerating toward a strictly positive, lower target still moves by exactly rate*dt without passing the target');
    }

    // -------------------------------------------------------------
    // Section C — deltaTime edge cases
    // -------------------------------------------------------------
    {
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: 3, deltaTime: 0 }) === 3, '8. deltaTime=0 never changes speed');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: 3, deltaTime: -1 }) === 3, '9. a negative deltaTime is sanitized to "no change" rather than moving speed backward in time');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: 3, deltaTime: NaN }) === 3, '10. a NaN deltaTime is sanitized to "no change"');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: 3, deltaTime: Infinity }) === 3, '11. a non-finite (Infinity) deltaTime is sanitized to "no change," the same defensive treatment as NaN — never Infinity/NaN propagated into the result');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: 3, deltaTime: undefined }) === 3, '12. deltaTime omitted (undefined) is sanitized to "no change"');
    }

    // -------------------------------------------------------------
    // Section D — fractional deltaTime
    // -------------------------------------------------------------
    {
        const halfTick = resolveMovementSpeed({ currentSpeed: 0, targetSpeed: 6, acceleration: 3, deltaTime: 0.5 });
        assert(halfTick === 1.5, '13. current=0, target=6, acceleration=3, dt=0.5 -> 1.5, exactly half of one full-second tick\'s own step');

        const manyFractionalTicks = accumulateTicks(0, 6, 3, 0.1, 20);
        assert(Math.abs(manyFractionalTicks - 6) < 1e-9, '14. twenty 0.1s ticks at acceleration=3 sum to exactly the same result as one full 2-second step, within floating-point tolerance');
    }

    // -------------------------------------------------------------
    // Section E — large deltaTime/rate reaches target without overshoot
    // -------------------------------------------------------------
    {
        assert(resolveMovementSpeed({ currentSpeed: 0, targetSpeed: 6, acceleration: 3, deltaTime: 1000 }) === 6, '15. a very large deltaTime reaches the target exactly, never overshooting past it');
        assert(resolveMovementSpeed({ currentSpeed: 0, targetSpeed: 6, acceleration: 1e9, deltaTime: 1 }) === 6, '16. a very large acceleration reaches the target exactly in one tick, never overshooting past it');
        assert(resolveMovementSpeed({ currentSpeed: 12, targetSpeed: 0, acceleration: 1e9, deltaTime: 1 }) === 0, '17. a very large acceleration decelerating to 0 lands exactly at 0, never a negative speed');
    }

    // -------------------------------------------------------------
    // Section F — acceleration/currentSpeed/targetSpeed edge cases
    // -------------------------------------------------------------
    {
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: 0, deltaTime: 1 }) === 3, '18. acceleration=0 never changes speed — a zero rate never approaches a target');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: -3, deltaTime: 1 }) === 3, '19. a negative acceleration is sanitized to "no rate applies" rather than moving speed away from the target');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: NaN, deltaTime: 1 }) === 3, '20. a NaN acceleration is sanitized to "no rate applies"');
        assert(resolveMovementSpeed({ currentSpeed: 6, targetSpeed: 6, acceleration: 3, deltaTime: 1 }) === 6, '21. currentSpeed already equal to targetSpeed is an exact no-op, computed with no rate math at all');
        assert(resolveMovementSpeed({ currentSpeed: NaN, targetSpeed: 6, acceleration: 3, deltaTime: 1 }) === 3, '22. a non-finite currentSpeed is sanitized to 0 before resolving (0 -> 3 at acceleration=3, dt=1)');
        assert(resolveMovementSpeed({ currentSpeed: 0, targetSpeed: NaN, acceleration: 3, deltaTime: 1 }) === 0, '23. a non-finite targetSpeed is sanitized to 0, which currentSpeed already equals, so the result is an exact no-op');
        assert(resolveMovementSpeed({ currentSpeed: 3, targetSpeed: 6, acceleration: undefined, deltaTime: 1 }) === 3, '24. acceleration omitted (undefined) is sanitized to "no rate applies"');
    }

    // -------------------------------------------------------------
    // Section G — determinism
    // -------------------------------------------------------------
    {
        for (let i = 0; i < 5; i++) {
            const result = resolveMovementSpeed({ currentSpeed: 2, targetSpeed: 9, acceleration: 5, deltaTime: 0.35 });
            assert(result === 2 + 5 * 0.35, `25.${i} identical inputs always produce the identical result — no hidden clock, no Math.random`);
        }
    }

    // -------------------------------------------------------------
    // Section H — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarMovementAccelerationSimulation.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'WorldNavigationSession',
            'AvatarVehicleInteractionController', 'AvatarVehicleMount',
            'VehiclePlacement', 'VehiclePresence', 'VehicleType',
            'AvatarVehicleMovementCapability', 'AvatarMovementAccelerationCapability',
            'AvatarMovementDirectionCapability', 'AvatarMovementState', 'AvatarPresence',
            'terrain', 'Terrain', 'keyboard', 'Keyboard', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'mass', 'physics', 'collision', 'Collision',
            'turnAxis', 'turning', 'steering', 'left', 'right',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `26. core/AvatarMovementAccelerationSimulation.js's own code never references "${term}" — pure rate math only, no vehicle/capability/runtime/rendering/collision knowledge whatsoever`);
        }

        const exportsModule = await import('../core/AvatarMovementAccelerationSimulation.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['resolveMovementSpeed']),
            '27. core/AvatarMovementAccelerationSimulation.js exports exactly the one resolution function — nothing else');
    }
    {
        // application/AvatarMovementController.js and
        // core/AvatarMovementSimulation.js are BOTH untouched by this
        // milestone (see core/AvatarVehicleMovementCapability.js's own
        // 0.9.90 header) — neither references resolveMovementSpeed() or
        // this file at all, proving existing instantaneous movement
        // behavior stays completely unchanged until a future milestone
        // wires this seam in.
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        assert(!controllerSource.includes('AvatarMovementAccelerationSimulation') && !controllerSource.includes('resolveMovementSpeed'),
            '28. application/AvatarMovementController.js does not yet reference this file or resolveMovementSpeed() — existing instantaneous movement behavior is untouched by 0.9.90');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        assert(!simulationSource.includes('AvatarMovementAccelerationSimulation') && !simulationSource.includes('resolveMovementSpeed'),
            '29. core/AvatarMovementSimulation.js does not yet reference this file or resolveMovementSpeed() — existing instantaneous movement behavior is untouched by 0.9.90');
    }

    console.log('✅ All Vehicle Acceleration Simulation tests passed.');
}

function accumulateTicks(startSpeed, targetSpeed, acceleration, deltaTime, tickCount) {
    let speed = startSpeed;
    for (let i = 0; i < tickCount; i++) {
        speed = resolveMovementSpeed({ currentSpeed: speed, targetSpeed, acceleration, deltaTime });
    }
    return speed;
}

await runTests();
