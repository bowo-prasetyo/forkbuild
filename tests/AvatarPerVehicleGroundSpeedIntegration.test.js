import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { VehicleType } from '../core/VehicleType.js';
import {
    AvatarMovementCapabilityKind,
    resolveAvatarVehicleMovementCapability
} from '../core/AvatarVehicleMovementCapability.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.87 — Per-Vehicle Ground Movement Speed Resolution.
//
// 0.9.86 (tests/AvatarVehicleMovementSpeedIntegration.test.js) proved a
// mounted ground vehicle moves faster than walking, while deliberately
// keeping BICYCLE/MOTORCYCLE/CAR numerically identical. This milestone
// makes the numeric difference that file's own closing paragraph named
// as future scope: the original intended progression
// (docs/Roadmap.md, 0.9.70) is now real —
//
//   WALK < BICYCLE < MOTORCYCLE < CAR
//
// — while `AvatarMovementCapabilityKind` still has only THREE values,
// and BICYCLE/MOTORCYCLE/CAR still all resolve to the exact same
// GROUND_VEHICLE kind. The change is confined entirely to
// core/AvatarVehicleMovementCapability.js's own resolution data — this
// file exists to prove that confinement, not to re-test what 0.9.85/
// 0.9.86's own suites already cover.
//
//   Section A: exact per-vehicle movementSpeed values
//   Section B: WALK < BICYCLE < MOTORCYCLE < CAR ordering
//   Section C: BICYCLE/MOTORCYCLE/CAR still share one GROUND_VEHICLE
//              movement kind
//   Section D: controller independence — AvatarMovementController.js
//              and core/AvatarMovementSimulation.js contain no
//              BICYCLE/MOTORCYCLE/CAR literal anywhere
//   Section E: end-to-end movement — identical input + elapsed time,
//              driven through the real movement pipeline, covers
//              strictly more ground for BICYCLE < MOTORCYCLE < CAR
//   Section F: running still covers more ground than walking, for
//              each of BICYCLE/MOTORCYCLE/CAR individually, by the
//              exact same multiplier RUN_SPEED_MULTIPLIER already
//              applies to WALK
//   Section G: switching BICYCLE -> MOTORCYCLE -> CAR -> WALK, on the
//              SAME controller instance, changes movement speed
//              immediately on every capability replacement
//   Section H: AERIAL_VEHICLE/DRONE remains fully blocked — no ground
//              speed of any kind is ever assigned to it
//
// Central architectural claim under test throughout: movement
// CAPABILITY, never vehicle IDENTITY, drives movement behavior.
// `AvatarMovementController` still reads only a resolved capability's
// own plain `movementSpeed` number; it has no idea which of BICYCLE,
// MOTORCYCLE, or CAR produced it. See docs/Roadmap.md, 0.9.87.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(registry, username) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, {});
    return { avatarPresenceSession };
}

// Drives `controller` forward (W held) for `ticks` steps of `dt` seconds
// each, at rotationY = 0 the whole time (no turning), and returns the
// total +Z distance covered.
function forwardDistance(controller, avatarPresenceSession, ticks, dt) {
    const startZ = avatarPresenceSession.current.position.z;
    controller.keyDown('w');
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
    }
    controller.keyUp('w');
    return avatarPresenceSession.current.position.z - startZ;
}

// 0.9.91 — the direct structural twin of forwardDistance() above, for
// sections that need a distance ratio EXACT to floating-point precision.
// A RATE_LIMITED capability's own TOTAL distance from rest never ratios
// exactly to its movementSpeed (the ramp-up itself contributes a
// duration-dependent "deficit" — see the callers' own 0.9.91 comments),
// but once a capability has already reached its own cruise movementSpeed,
// core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()'s
// own `currentSpeed === targetSpeed` case is an exact no-op every tick —
// so distance measured ENTIRELY after that point is exactly
// `movementSpeed * measureTime`, discarding `warmupTicks` worth of ramp
// gets there.
function warmedUpDistance(controller, avatarPresenceSession, warmupTicks, measureTicks, dt) {
    controller.keyDown('w');
    for (let i = 0; i < warmupTicks; i++) controller.tick(dt);
    const startZ = avatarPresenceSession.current.position.z;
    for (let i = 0; i < measureTicks; i++) controller.tick(dt);
    const distance = avatarPresenceSession.current.position.z - startZ;
    controller.keyUp('w');
    return distance;
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — exact values
    // -------------------------------------------------------------
    {
        const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(walk.movementSpeed === 3, '1. WALK movementSpeed is exactly 3');
        assert(bicycle.movementSpeed === 6, '2. BICYCLE movementSpeed is exactly 6');
        assert(motorcycle.movementSpeed === 9, '3. MOTORCYCLE movementSpeed is exactly 9');
        assert(car.movementSpeed === 12, '4. CAR movementSpeed is exactly 12');
    }

    // -------------------------------------------------------------
    // Section B — ordering
    // -------------------------------------------------------------
    {
        const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE).movementSpeed;
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).movementSpeed;
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE).movementSpeed;
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR).movementSpeed;
        assert(walk < bicycle && bicycle < motorcycle && motorcycle < car,
            '5. WALK < BICYCLE < MOTORCYCLE < CAR — the exact ordering this milestone exists to establish');
    }

    // -------------------------------------------------------------
    // Section C — shared movement kind
    // -------------------------------------------------------------
    {
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(bicycle.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE
            && motorcycle.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE
            && car.movementKind === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '6. BICYCLE, MOTORCYCLE, and CAR all still resolve to the exact same GROUND_VEHICLE movement kind — differentiated by movementSpeed, a parameter, never by a second per-vehicle capability kind');
        assert(Object.values(AvatarMovementCapabilityKind).length === 3,
            '7. AvatarMovementCapabilityKind still has exactly three values (WALK, GROUND_VEHICLE, AERIAL_VEHICLE) — this milestone adds no BICYCLE/MOTORCYCLE/CAR kind alongside it');
    }

    // -------------------------------------------------------------
    // Section D — controller independence
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/\bVehicleType\.(BICYCLE|MOTORCYCLE|CAR)\b/.test(controllerCodeOnly),
            '8. application/AvatarMovementController.js never references VehicleType.BICYCLE/MOTORCYCLE/CAR — it consumes only a resolved capability\'s own generic movementSpeed number');
        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b/.test(controllerCodeOnly),
            '9. application/AvatarMovementController.js contains no BICYCLE/MOTORCYCLE/CAR literal of any kind, per-vehicle numeric differentiation included');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        const simulationCodeOnly = simulationSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/BICYCLE|MOTORCYCLE|\bCAR\b|VehicleType/.test(simulationCodeOnly),
            '10. core/AvatarMovementSimulation.js contains no vehicle literal of any kind — this milestone changed zero lines of the movement simulation itself');
    }

    // -------------------------------------------------------------
    // Section E — end-to-end movement, real pipeline
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession: bicycleSession } = buildAvatarStack(registry, 'pvgs-e1-bicycle');
        const { avatarPresenceSession: motorcycleSession } = buildAvatarStack(registry, 'pvgs-e1-motorcycle');
        const { avatarPresenceSession: carSession } = buildAvatarStack(registry, 'pvgs-e1-car');
        const bicycleController = new AvatarMovementController(bicycleSession);
        const motorcycleController = new AvatarMovementController(motorcycleSession);
        const carController = new AvatarMovementController(carSession);
        bicycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        motorcycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        carController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        // 0.9.91 note: this used to drive a single 40-tick (2s) burst
        // from rest and compare TOTAL distance. Each GROUND_VEHICLE is
        // now RATE_LIMITED (0.9.90) at its OWN acceleration
        // (BICYCLE/MOTORCYCLE/CAR: 3/5/4 units/second^2) — over a short
        // window, MOTORCYCLE's own faster ramp can legitimately put it
        // ahead of CAR despite CAR's higher eventual top speed (see
        // core/AvatarVehicleMovementCapability.js's own 0.9.90 header,
        // "acceleration is an independent dimension from movementSpeed",
        // and tests/AvatarVehicleAccelerationStateIntegration.test.js's
        // own dedicated coverage of exactly that relationship) — and the
        // exact 9:6/12:6 TOTAL-distance ratios below no longer hold
        // either, since each vehicle's own ramp-up time differs
        // (BICYCLE 2s, MOTORCYCLE 1.8s, CAR 3s). A warm-up phase (driven
        // and discarded, long enough for every vehicle to have already
        // reached its own cruise movementSpeed) followed by a measured
        // burst sidesteps both problems at once: once cruising,
        // resolveMovementSpeed() is an exact no-op every tick (see
        // core/AvatarMovementAccelerationSimulation.js's own header), so
        // the measured distance is exactly `movementSpeed * measureTime`
        // for each — both the strict ordering and the exact resolved-
        // speed ratios this section exists to prove.
        const WARMUP_TICKS = 80; // 4s — comfortably past CAR's own 3s ramp-to-12 time
        const MEASURE_TICKS = 40; // 2s of pure cruise, once warmed up

        const bicycleDistance = warmedUpDistance(bicycleController, bicycleSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);
        const motorcycleDistance = warmedUpDistance(motorcycleController, motorcycleSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);
        const carDistance = warmedUpDistance(carController, carSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);

        assert(bicycleDistance < motorcycleDistance && motorcycleDistance < carDistance,
            '11. for identical W-held input over identical elapsed time, driven through the real simulateAvatarMovement() pipeline (not by inspecting capability objects), BICYCLE < MOTORCYCLE < CAR');

        // The ratios must match the resolver's own numbers exactly —
        // this is genuinely the resolved movementSpeed driving
        // simulation, not merely "some" ordering that happens to hold.
        assert(Math.abs(motorcycleDistance / bicycleDistance - 9 / 6) < 1e-9,
            '12. motorcycle-to-bicycle distance ratio exactly matches their resolved 9:6 movementSpeed ratio');
        assert(Math.abs(carDistance / bicycleDistance - 12 / 6) < 1e-9,
            '13. car-to-bicycle distance ratio exactly matches their resolved 12:6 movementSpeed ratio');
    }

    // -------------------------------------------------------------
    // Section F — running
    // -------------------------------------------------------------
    {
        // 0.9.91 note: this used to drive a single 40-tick (2s) burst
        // from rest. CAR's own RUNNING target (24 units/second, double
        // its 12 unit/second base — see application/AvatarMovementController.js's
        // own 0.9.91 header) now takes a full 6 seconds to actually ramp
        // up to at CAR's own 4 units/second^2 rate — see this file's own
        // Section E note above for why TOTAL distance from rest no
        // longer ratios exactly to 2 under acceleration, and why a
        // warm-up phase (long enough for every vehicle's own RUNNING
        // target to have fully ramped up) followed by a measured burst
        // restores the exact ratio.
        const WARMUP_TICKS = 140; // 7s — comfortably past CAR's own 6s ramp-to-24 (running) time
        const MEASURE_TICKS = 40; // 2s of pure cruise, once warmed up

        for (const vehicleType of [VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR]) {
            const { avatarPresenceSession: walkingSession } = buildAvatarStack(registry, `pvgs-f1-${vehicleType}-walking`);
            const { avatarPresenceSession: runningSession } = buildAvatarStack(registry, `pvgs-f1-${vehicleType}-running`);
            const walkingController = new AvatarMovementController(walkingSession);
            const runningController = new AvatarMovementController(runningSession);
            walkingController.setMovementCapability(resolveAvatarVehicleMovementCapability(vehicleType));
            runningController.setMovementCapability(resolveAvatarVehicleMovementCapability(vehicleType));
            runningController.keyDown('shift');

            const walkingDistance = warmedUpDistance(walkingController, walkingSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);
            const runningDistance = warmedUpDistance(runningController, runningSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);

            assert(runningDistance > walkingDistance, `14. ${vehicleType}: running covers more ground than not running`);
            assert(Math.abs(runningDistance / walkingDistance - 2) < 1e-9,
                `15. ${vehicleType}: running covers EXACTLY twice the ground — the same RUN_SPEED_MULTIPLIER already applied to WALK, never a second per-vehicle running concept`);
        }
    }

    // -------------------------------------------------------------
    // Section G — switching
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'pvgs-g1');
        const controller = new AvatarMovementController(avatarPresenceSession);

        // 0.9.91 note: each phase used to be a single 20-tick (1s) burst.
        // setMovementCapability() still resets the controller's own
        // transient _currentMovementSpeed to 0 on every one of these
        // genuine capability changes (see application/AvatarMovementController.js's
        // own 0.9.91 header) — so each phase below still starts from
        // rest, exactly as before — but CAR's own 3s ramp-to-12 no
        // longer completes within a 1s window. See this file's own
        // Section E note above for why warming up before measuring
        // restores both the strict ordering and the exact WALK
        // byte-identity this section exists to prove.
        const WARMUP_TICKS = 80; // 4s — comfortably past CAR's own 3s ramp-to-12 time
        const MEASURE_TICKS = 40; // 2s of pure cruise, once warmed up

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        const bicycleDistance = warmedUpDistance(controller, avatarPresenceSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        const motorcycleDistance = warmedUpDistance(controller, avatarPresenceSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        const carDistance = warmedUpDistance(controller, avatarPresenceSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        const walkDistance = warmedUpDistance(controller, avatarPresenceSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);

        assert(bicycleDistance < motorcycleDistance && motorcycleDistance < carDistance,
            '16. switching BICYCLE -> MOTORCYCLE -> CAR, on the SAME controller instance, immediately covers strictly more ground at each step, with no controller reconstruction');
        assert(walkDistance < bicycleDistance,
            '17. switching CAR -> WALK, on the SAME controller instance, immediately drops back to the slower WALK speed');

        const { avatarPresenceSession: freshWalkSession } = buildAvatarStack(registry, 'pvgs-g2');
        const freshWalkController = new AvatarMovementController(freshWalkSession);
        freshWalkController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        const freshWalkDistance = warmedUpDistance(freshWalkController, freshWalkSession, WARMUP_TICKS, MEASURE_TICKS, 0.05);
        assert(Math.abs(walkDistance - freshWalkDistance) < 1e-9,
            '18. the WALK speed reached at the end of the BICYCLE -> MOTORCYCLE -> CAR -> WALK chain is byte-identical to a controller that only ever walked — no residual vehicle influence survives the chain');
    }

    // -------------------------------------------------------------
    // Section H — drone
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'pvgs-h1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        const beforePosition = avatarPresenceSession.current.position;
        const before = { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z };
        controller.keyDown('w');
        controller.keyDown('shift');
        for (let i = 0; i < 20; i++) controller.tick(0.05);
        const after = avatarPresenceSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '19. AERIAL_VEHICLE/DRONE remains fully blocked — no ground speed of any kind (bicycle, motorcycle, or car) is ever assigned merely to make the capability complete');
        controller.keyUp('w');
        controller.keyUp('shift');
    }

    console.log('✅ All Per-Vehicle Ground Movement Speed Resolution tests passed.');
}

await runTests();
