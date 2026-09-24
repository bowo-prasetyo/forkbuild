import { readFile } from 'node:fs/promises';
import {
    AvatarVehicleMovementController,
    isMovableVehicleType
} from '../application/avatar/AvatarVehicleMovementController.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { assert } from './support/Assert.js';

// 0.9.116 — Mounted Vehicle Movement, application/avatar/AvatarVehicleMovementController.js.
//
//   Section A: canMove()/isMovableVehicleType() — BICYCLE, MOTORCYCLE
//              (0.9.668), CAR (0.9.669), and DRONE (Aerial Movement
//              Pipeline) are all movable
//   Section B: tick() on an untracked vehicle id — null, no throw
//   Section C: forward intent -> forward displacement, spawnPosition
//              untouched (0.9.114's own invariant, reused)
//   Section D: repeated movement — many ticks never stall, never reset
//              spawnPosition !== position after movement
//   Section E: braking reduces speed faster than plain coasting —
//              reusing the EXISTING braking capability, never a new
//              vehicle-specific implementation
//   Section F: reset() actually clears transient bookkeeping — a ride
//              resumed after reset() starts exactly like a brand-new
//              controller would
//   Section G: (removed) DRONE's own former "never moved" behavior is
//              superseded by the Aerial Movement Pipeline milestone —
//              see Section A4, above, and this section's own current
//              note
//   Section G2 (0.9.123): heading tracks realized movement direction —
//              forward, reverse, blocked (unchanged), and idle
//              (unchanged) — never core/AvatarMovementSimulation.js's own
//              steering-derived rotationY
//   Section H: architectural regression — no duplicated movement math,
//              no AvatarPresenceSession/rendering coupling
//
// A fake vehicle store, duck-typed to the exact {get(id), setPosition(id,
// position)} contract application/world/VehicleRuntimeInstances.js itself
// provides — this file tests AvatarVehicleMovementController in complete
// isolation from the real store's own discovery/reconciliation policy
// (covered separately by tests/VehicleRuntimeInstances.test.js), the same
// "duck-typed collaborator, poked directly" posture
// tests/WorldViewVehicleRenderingIntegration.test.js's own fakeRenderFacade()
// already establishes for a render facade.
function fakeVehicleStore(initialInstances = []) {
    const map = new Map(initialInstances.map((instance) => [instance.id, instance]));
    return {
        get(id) {
            return map.get(id) || null;
        },
        setPosition(id, nextPosition) {
            const current = map.get(id);
            if (!current) return null;
            const next = current.withPosition(nextPosition);
            map.set(id, next);
            return next;
        },
        setHeading(id, nextHeading) {
            const current = map.get(id);
            if (!current) return null;
            const next = current.withHeading(nextHeading);
            map.set(id, next);
            return next;
        }
    };
}

function bicycle(id, position) {
    return new VehicleInstance({ id, type: VehicleType.BICYCLE, spawnPosition: position, position });
}

const IDLE_INTENT = Object.freeze({ direction: 0, turnAxis: 0, running: false, brakingRequested: false });
const FORWARD_INTENT = Object.freeze({ direction: 1, turnAxis: 0, running: false, brakingRequested: false });
const BACKWARD_INTENT = Object.freeze({ direction: -1, turnAxis: 0, running: false, brakingRequested: false });
const BRAKE_INTENT = Object.freeze({ direction: 0, turnAxis: 0, running: false, brakingRequested: true });

const bicycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);

async function runTests() {
    // -------------------------------------------------------------
    // Section A — canMove()/isMovableVehicleType()
    // -------------------------------------------------------------
    {
        const controller = new AvatarVehicleMovementController(fakeVehicleStore());
        for (const type of [VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            assert(controller.canMove(type) === true, `1.${type} ${type} can move`);
            assert(isMovableVehicleType(type) === true, `2.${type} isMovableVehicleType(${type}) === true`);
        }
        for (const type of [VehicleType.NONE]) {
            assert(controller.canMove(type) === false, `3.${type} ${type} cannot move — an unmounted avatar has no vehicle to move at all`);
            assert(isMovableVehicleType(type) === false, `4.${type} isMovableVehicleType(${type}) === false`);
        }
    }

    // -------------------------------------------------------------
    // Section A2 (0.9.668) — a mounted MOTORCYCLE genuinely moves, ticked
    // through this exact controller, exactly like a BICYCLE already does
    // (Section C, below) — not merely "canMove() reports true."
    // -------------------------------------------------------------
    {
        const spawn = { x: 100, y: 3, z: 200 };
        const motorcycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const instance = new VehicleInstance({ id: 'vehicle:a2', type: VehicleType.MOTORCYCLE, spawnPosition: spawn, position: spawn });
        const store = fakeVehicleStore([instance]);
        const controller = new AvatarVehicleMovementController(store);

        let lastResult = null;
        for (let i = 0; i < 40; i++) {
            lastResult = controller.tick({
                seed: DEFAULT_WORLD_SEED,
                vehicleId: 'vehicle:a2',
                capability: motorcycleCapability,
                movementIntent: FORWARD_INTENT,
                currentRotationY: 0,
                deltaSeconds: 0.05
            });
        }
        assert(lastResult !== null, '4b. a mounted, tracked MOTORCYCLE produces a real tick() result');
        assert(lastResult.vehicleInstance.position.z > spawn.z, '4c. forward intent moved the MOTORCYCLE forward, exactly like a BICYCLE');
        assert(lastResult.vehicleInstance.type === VehicleType.MOTORCYCLE, '4d. the moved instance is still a MOTORCYCLE, never silently re-typed');
    }

    // -------------------------------------------------------------
    // Section A3 (0.9.669) — a mounted CAR genuinely moves, ticked
    // through this exact controller, exactly like a BICYCLE/MOTORCYCLE
    // already does — not merely "canMove() reports true."
    // -------------------------------------------------------------
    {
        const spawn = { x: 100, y: 3, z: 200 };
        const carCapability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const instance = new VehicleInstance({ id: 'vehicle:a3', type: VehicleType.CAR, spawnPosition: spawn, position: spawn });
        const store = fakeVehicleStore([instance]);
        const controller = new AvatarVehicleMovementController(store);

        let lastResult = null;
        for (let i = 0; i < 40; i++) {
            lastResult = controller.tick({
                seed: DEFAULT_WORLD_SEED,
                vehicleId: 'vehicle:a3',
                capability: carCapability,
                movementIntent: FORWARD_INTENT,
                currentRotationY: 0,
                deltaSeconds: 0.05
            });
        }
        assert(lastResult !== null, '4e. a mounted, tracked CAR produces a real tick() result');
        assert(lastResult.vehicleInstance.position.z > spawn.z, '4f. forward intent moved the CAR forward, exactly like a BICYCLE/MOTORCYCLE');
        assert(lastResult.vehicleInstance.type === VehicleType.CAR, '4g. the moved instance is still a CAR, never silently re-typed');
    }

    // -------------------------------------------------------------
    // Section A4 (Aerial Movement Pipeline) — a mounted DRONE genuinely
    // moves, ticked through this exact controller, exactly like a
    // BICYCLE/MOTORCYCLE/CAR already does — not merely "canMove()
    // reports true."
    // -------------------------------------------------------------
    {
        const spawn = { x: 100, y: 3, z: 200 };
        const droneCapability = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        const instance = new VehicleInstance({ id: 'vehicle:a4', type: VehicleType.DRONE, spawnPosition: spawn, position: spawn });
        const store = fakeVehicleStore([instance]);
        const controller = new AvatarVehicleMovementController(store);

        let lastResult = null;
        for (let i = 0; i < 40; i++) {
            lastResult = controller.tick({
                seed: DEFAULT_WORLD_SEED,
                vehicleId: 'vehicle:a4',
                capability: droneCapability,
                movementIntent: FORWARD_INTENT,
                currentRotationY: 0,
                deltaSeconds: 0.05
            });
        }
        assert(lastResult !== null, '4h. a mounted, tracked DRONE produces a real tick() result');
        assert(lastResult.vehicleInstance.position.z > spawn.z, '4i. forward intent moved the DRONE forward, exactly like a BICYCLE/MOTORCYCLE/CAR');
        assert(lastResult.vehicleInstance.type === VehicleType.DRONE, '4j. the moved instance is still a DRONE, never silently re-typed');
        const finalPos = lastResult.vehicleInstance.position;
        const groundHeightAtFinalPos = terrainHeightAt(DEFAULT_WORLD_SEED, finalPos.x, finalPos.z);
        assert(finalPos.y > groundHeightAtFinalPos + 1, '4k. a DRONE ridden forward for long enough is genuinely airborne — its own Y sits well above raw terrain height, hovering when moving, per core/AvatarDroneVerticalState.js');
    }

    // -------------------------------------------------------------
    // Section B — tick() on an untracked vehicle id.
    // -------------------------------------------------------------
    {
        const controller = new AvatarVehicleMovementController(fakeVehicleStore());
        const result = controller.tick({
            seed: DEFAULT_WORLD_SEED,
            vehicleId: 'vehicle:nobody:0,0',
            capability: bicycleCapability,
            movementIntent: FORWARD_INTENT,
            currentRotationY: 0,
            deltaSeconds: 0.5
        });
        assert(result === null, '5. tick() on an id this controller\'s own store does not track returns null, never throws, never fabricates a vehicle');
    }

    // -------------------------------------------------------------
    // Section C — forward intent -> forward displacement; spawnPosition
    // untouched.
    // -------------------------------------------------------------
    {
        const spawn = { x: 100, y: 3, z: 200 };
        const store = fakeVehicleStore([bicycle('vehicle:c1', spawn)]);
        const controller = new AvatarVehicleMovementController(store);

        let lastResult = null;
        for (let i = 0; i < 40; i++) {
            lastResult = controller.tick({
                seed: DEFAULT_WORLD_SEED,
                vehicleId: 'vehicle:c1',
                capability: bicycleCapability,
                movementIntent: FORWARD_INTENT,
                currentRotationY: 0,
                deltaSeconds: 0.05
            });
        }
        assert(lastResult !== null, '6. sanity: a tracked, movable vehicle produces a result');
        assert(lastResult.vehicleInstance.position.z > spawn.z, '7. forward intent (rotationY 0) increased Z — forward displacement, exactly as core/AvatarMovementSimulation.js already produces for the avatar');
        assert(lastResult.vehicleInstance.position.x === spawn.x, '8. ...and never introduced any X drift with turnAxis === 0');
        assert(lastResult.vehicleInstance.spawnPosition.x === spawn.x && lastResult.vehicleInstance.spawnPosition.z === spawn.z,
            '9. spawnPosition is EXACTLY the original spawn point after 40 ticks of movement — 0.9.114\'s own withPosition() invariant, reused verbatim');
        assert(lastResult.vehicleInstance.id === 'vehicle:c1', '10. identity never changed either');

        // The store itself was actually updated — setPosition() is
        // reflected, not merely returned.
        assert(store.get('vehicle:c1').position.z === lastResult.vehicleInstance.position.z,
            '11. the runtime store\'s own tracked instance was actually updated, not just the value returned from tick()');
    }

    // -------------------------------------------------------------
    // Section D — repeated movement never stalls, never resets.
    // -------------------------------------------------------------
    {
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore([bicycle('vehicle:d1', spawn)]);
        const controller = new AvatarVehicleMovementController(store);

        const positionsOverTime = [];
        for (let i = 0; i < 100; i++) {
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED,
                vehicleId: 'vehicle:d1',
                capability: bicycleCapability,
                movementIntent: FORWARD_INTENT,
                currentRotationY: 0,
                deltaSeconds: 0.05
            });
            positionsOverTime.push(result.vehicleInstance.position.z);
        }
        for (let i = 1; i < positionsOverTime.length; i++) {
            assert(positionsOverTime[i] >= positionsOverTime[i - 1],
                `12.${i} position never goes backward or resets while continuously holding forward — frame ${i} (${positionsOverTime[i]}) >= frame ${i - 1} (${positionsOverTime[i - 1]})`);
        }
        assert(positionsOverTime[positionsOverTime.length - 1] > positionsOverTime[0],
            '13. genuine forward progress accumulated over 100 frames, never stalling');
        assert(store.get('vehicle:d1').spawnPosition.z === 0, '14. spawnPosition === original spawnPosition after 100 frames');
        assert(store.get('vehicle:d1').position.z !== 0, '15. position !== spawnPosition after movement — the flagship claim this milestone exists to prove');
    }

    // -------------------------------------------------------------
    // Section E — braking reduces speed faster than plain coasting,
    // through the EXISTING braking capability.
    // -------------------------------------------------------------
    {
        const spawn = { x: 0, y: 0, z: 0 };
        const coastStore = fakeVehicleStore([bicycle('vehicle:e1', spawn)]);
        const brakeStore = fakeVehicleStore([bicycle('vehicle:e1', spawn)]);
        const coastController = new AvatarVehicleMovementController(coastStore);
        const brakeController = new AvatarVehicleMovementController(brakeStore);

        // Identical cruise phase for both — build up to a real cruising
        // speed first.
        for (let i = 0; i < 60; i++) {
            coastController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:e1', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
            brakeController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:e1', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        }
        const cruiseZ = coastStore.get('vehicle:e1').position.z;
        assert(cruiseZ === brakeStore.get('vehicle:e1').position.z, '16. sanity: both controllers cruised identically so far');

        // Diverge: one releases forward (plain coasting, decays at the
        // capability's own acceleration rate); the other explicitly
        // brakes (decays at the capability's own, strictly higher,
        // braking rate — core/AvatarVehicleMovementCapability.js's own
        // BICYCLE_BRAKING > BICYCLE_ACCELERATION).
        for (let i = 0; i < 10; i++) {
            coastController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:e1', capability: bicycleCapability, movementIntent: IDLE_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
            brakeController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:e1', capability: bicycleCapability, movementIntent: BRAKE_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        }
        const coastZ = coastStore.get('vehicle:e1').position.z;
        const brakeZ = brakeStore.get('vehicle:e1').position.z;
        assert(brakeZ - cruiseZ < coastZ - cruiseZ,
            '17. explicit braking covers strictly less ground than plain coasting over the same window — the SAME capability layer 0.9.92 already built, connected here, never a new vehicle-specific braking implementation');
        assert(brakeZ > cruiseZ, '18. sanity: the braking vehicle still moved forward some — braking decelerates, it does not stop instantly');
    }

    // -------------------------------------------------------------
    // Section F — reset() actually clears transient bookkeeping.
    // -------------------------------------------------------------
    {
        const spawn = { x: 0, y: 0, z: 0 };
        const riddenStore = fakeVehicleStore([bicycle('vehicle:f1', spawn)]);
        const riddenController = new AvatarVehicleMovementController(riddenStore);
        // Build up real cruising speed.
        for (let i = 0; i < 60; i++) {
            riddenController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:f1', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        }
        riddenController.reset();
        // The DELTA this next tick produces is what should match a
        // fresh controller's own first tick — the ridden vehicle's own
        // ABSOLUTE position already carries 60 ticks' worth of prior
        // forward travel, which is irrelevant to what reset() itself
        // claims.
        const beforeResumedTick = riddenStore.get('vehicle:f1').position.z;
        const resumed = riddenController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:f1', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        const resumedDelta = resumed.vehicleInstance.position.z - beforeResumedTick;

        // A brand-new controller, ticking an identical fresh vehicle
        // exactly once, from rest — the same SAME-id "genuinely new
        // ride" case reset() exists to reproduce (see this file's own
        // header: this controller alone could never otherwise tell a
        // resumed ride of the SAME vehicle id apart from a continuing
        // one).
        const freshStore = fakeVehicleStore([bicycle('vehicle:f1', spawn)]);
        const freshController = new AvatarVehicleMovementController(freshStore);
        const freshResult = freshController.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:f1', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        const freshDelta = freshResult.vehicleInstance.position.z - spawn.z;

        assert(Math.abs(resumedDelta - freshDelta) < 1e-9,
            '19. after reset(), ticking the SAME vehicle id again advances by EXACTLY the same delta as a brand-new controller\'s own first tick — no stale currentMovementSpeed/verticalVelocity carried over from the previous ride');
    }

    // Note: through the Aerial Movement Pipeline milestone, every
    // currently-defined VehicleType (BICYCLE, MOTORCYCLE, CAR, and now
    // DRONE) is movable — there is currently no unsupported vehicle type
    // left to exercise the defense-in-depth "never moved even when
    // directly tracked and ticked" scenario this section once tested
    // with DRONE (Section A4, above, now covers DRONE's own real
    // movement instead). The gate itself
    // (application/avatar/AvatarVehicleMovementController.js's own
    // `isMovableVehicleType()` check inside tick()) remains in place for
    // a future, not-yet-movable vehicle type.

    // -------------------------------------------------------------
    // Section G2 (0.9.123) — heading tracks realized movement direction.
    // -------------------------------------------------------------
    {
        // A. Eastward (+X) movement: heading resolves to 90, matching
        // core/VehicleMovementHeading.js's own convention — never
        // rotationY itself, which tracks steering intent instead.
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore([bicycle('vehicle:h1', spawn)]);
        const controller = new AvatarVehicleMovementController(store);
        // currentRotationY: 90 drives the simulated STEP direction (+X);
        // this deliberately differs from what heading is asserted to
        // become, to prove heading is read from the vehicle's own
        // realized position change, not merely echoed from rotationY.
        let lastResult = null;
        for (let i = 0; i < 20; i++) {
            lastResult = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:h1', capability: bicycleCapability,
                movementIntent: FORWARD_INTENT, currentRotationY: 90, deltaSeconds: 0.05
            });
        }
        assert(lastResult.vehicleInstance.position.x > spawn.x, '25a. sanity: the vehicle actually moved in +X');
        assert(Math.abs(lastResult.vehicleInstance.heading - 90) < 1e-6, '25b. FLAGSHIP: heading resolves to 90 (facing +X), matching the realized movement direction');
        assert(store.get('vehicle:h1').heading === lastResult.vehicleInstance.heading, '25c. the committed store entry carries the same heading returned from tick()');
    }
    {
        // B. Reversing direction: heading changes to reflect the new
        // realized direction once the vehicle actually starts moving the
        // other way.
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore([bicycle('vehicle:h2', spawn)]);
        const controller = new AvatarVehicleMovementController(store);
        for (let i = 0; i < 30; i++) {
            controller.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:h2', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        }
        const forwardHeading = store.get('vehicle:h2').heading;
        assert(Math.abs(forwardHeading - 0) < 1e-6, '26a. sanity: forward (+Z) travel resolved to heading 0');

        let lastZ = store.get('vehicle:h2').position.z;
        let reversedHeading = null;
        for (let i = 0; i < 200; i++) {
            const result = controller.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:h2', capability: bicycleCapability, movementIntent: BACKWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
            if (result.vehicleInstance.position.z < lastZ) {
                reversedHeading = result.vehicleInstance.heading;
                break;
            }
            lastZ = result.vehicleInstance.position.z;
        }
        assert(reversedHeading !== null, '26b. sanity: the vehicle genuinely reversed at some point');
        assert(Math.abs(reversedHeading - 180) < 1e-6, '26c. heading flips to 180 (facing -Z) once the vehicle actually reverses');
    }
    {
        // C. Blocked movement: a movementConstraint that clamps every
        // step back to the pre-tick position must leave heading exactly
        // as it already was — the vehicle never achieved a different
        // horizontal position.
        const blockingConstraint = { apply(position) { return { position: { x: position.x, y: position.y, z: position.z }, collided: true }; } };
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore([bicycle('vehicle:h3', spawn)]);
        const controller = new AvatarVehicleMovementController(store, blockingConstraint, null);
        const before = store.get('vehicle:h3').heading;
        for (let i = 0; i < 20; i++) {
            controller.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:h3', capability: bicycleCapability, movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        }
        assert(store.get('vehicle:h3').position.x === spawn.x && store.get('vehicle:h3').position.z === spawn.z,
            '27a. sanity: the blocking constraint genuinely prevented any movement');
        assert(store.get('vehicle:h3').heading === before, '27b. FLAGSHIP: heading remains completely unchanged after repeated blocked movement — the vehicle never actually moved');
    }
    {
        // D. Idle intent: repeated ticks with zero movement intent never
        // recreate or alter heading, even from a fresh (default, 0)
        // heading.
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore([bicycle('vehicle:h4', spawn)]);
        const controller = new AvatarVehicleMovementController(store);
        const before = store.get('vehicle:h4').heading;
        for (let i = 0; i < 20; i++) {
            controller.tick({ seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:h4', capability: bicycleCapability, movementIntent: IDLE_INTENT, currentRotationY: 0, deltaSeconds: 0.05 });
        }
        assert(store.get('vehicle:h4').heading === before, '28. repeated zero-intent ticks never alter heading');
    }

    // -------------------------------------------------------------
    // Section H — architectural regression.
    // -------------------------------------------------------------
    {
        const source = await readFile(new URL('../application/avatar/AvatarVehicleMovementController.js', import.meta.url), 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        assert(codeOnly.includes('simulateAvatarMovement'),
            '22. reuses core/AvatarMovementSimulation.js\'s own simulateAvatarMovement() — never a duplicated kinematics implementation');
        for (const term of ['AvatarPresenceSession', 'THREE', 'renderer/', 'avatarPresenceSession.update', '.rotation.y =']) {
            assert(!codeOnly.includes(term),
                `23. application/avatar/AvatarVehicleMovementController.js's own code never references "${term}" — it has no idea an AvatarPresence or a renderer exists; see application/world/WorldNavigationSession.js for where the vehicle's result is applied to the avatar`);
        }
        assert(codeOnly.includes('withPosition') || codeOnly.includes('setPosition'),
            '24. commits its result through VehicleRuntimeInstances#setPosition() (itself a VehicleInstance#withPosition() wrapper), never a direct field assignment');
    }

    console.log('✅ All Avatar-Vehicle Movement Controller tests passed.');
}

await runTests();
