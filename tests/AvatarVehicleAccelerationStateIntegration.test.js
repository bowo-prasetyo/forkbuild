import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.91 — Vehicle Acceleration State Integration.
//
// 0.9.90 (core/AvatarMovementAccelerationCapability.js +
// core/AvatarMovementAccelerationSimulation.js) built the acceleration
// vocabulary and its pure math half, and deliberately stopped short of
// ever calling it — see that milestone's own closing paragraph, "next: a
// future milestone integrates this seam into
// application/AvatarMovementController.js." This is that milestone: the
// controller now maintains a transient, SIGNED "current movement speed"
// between ticks and feeds it through core/AvatarMovementSimulation.js's
// own newly-wired resolveMovementSpeed() call to approach the active
// capability's target speed, rather than reaching it in a single tick.
//
//   Section A: WALK regression — INSTANT capabilities reach their
//              target the same single tick they always have
//   Section B: BICYCLE ramps — strictly increasing speed, never an
//              instant jump, landing exactly on movementSpeed and
//              staying there
//   Section C: MOTORCYCLE ramps — same shape, its own rate/target
//   Section D: CAR ramps — same shape, its own rate/target
//   Section E: acceleration independence — MOTORCYCLE's own faster
//              acceleration can put it ahead of CAR over a SHORT
//              window despite CAR's higher eventual top speed; CAR
//              overtakes once both are given time to reach cruise
//   Section F: releasing movement — current speed decays toward zero
//              rather than freezing at cruising speed
//   Section G: direction reversal — a cruising vehicle passes through
//              EXACTLY zero on the way to a reversed target, never
//              jumping straight from a positive speed to a negative one
//   Section H: the run multiplier doubles the TARGET speed, never the
//              acceleration RATE
//   Section I: capability switching — mounting/dismounting/switching
//              resets transient speed to zero; no capability's own
//              momentum ever leaks into another's
//   Section J: AERIAL_VEHICLE/DRONE remains fully blocked — no
//              acceleration state of any kind ever moves it
//   Section K: architectural regression — the integration seam lives
//              exactly where core/AvatarMovementSimulation.js's and
//              application/AvatarMovementController.js's own 0.9.91
//              headers say it does
//
// Central architectural claim under test throughout: movement CAPABILITY
// (a target speed plus an acceleration rate), never vehicle IDENTITY,
// drives how quickly movement approaches that target — this file reads
// only position (inferring signed speed from consecutive Z deltas over a
// fixed, non-turning dt) and public controller methods; it never reaches
// into a private field. See docs/Roadmap.md, 0.9.91.

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

// The discrete "never overshoots" recurrence
// core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()
// itself implements (see that file's own header) — reproduced here,
// bit-for-bit the same operations in the same order, purely to compute
// EXPECTED per-tick speeds for this file's own assertions. Never
// imported from production code: this file tests the INTEGRATION, not
// the already-covered (tests/AvatarMovementAccelerationSimulation.test.js)
// math itself.
function expectedRampSpeeds(target, rate, dt, ticks) {
    let current = 0;
    const speeds = [];
    for (let i = 0; i < ticks; i++) {
        const maxDelta = rate * dt;
        if (current < target) current = Math.min(current + maxDelta, target);
        else if (current > target) current = Math.max(current - maxDelta, target);
        speeds.push(current);
    }
    return speeds;
}

// Drives `controller` by holding `key` (or no key at all, when `key` is
// null — used to observe pure deceleration on release) for `ticks` steps
// of `dt` seconds each, at rotationY = 0 the whole time (never turning),
// and returns the per-tick SIGNED speed inferred from consecutive Z
// deltas (delta / dt) — the direct observable proxy for the controller's
// own internal `_currentMovementSpeed`, without ever reading a private
// field.
function tickSpeeds(controller, avatarPresenceSession, key, ticks, dt) {
    if (key) controller.keyDown(key);
    const speeds = [];
    let previousZ = avatarPresenceSession.current.position.z;
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
        const z = avatarPresenceSession.current.position.z;
        speeds.push((z - previousZ) / dt);
        previousZ = z;
    }
    if (key) controller.keyUp(key);
    return speeds;
}

const DT = 0.05; // world seconds/tick — small enough that no target*DT (even MOTORCYCLE/CAR running) ever nears MAX_STEP_PER_TICK's own 2-unit clamp

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — WALK regression
    // -------------------------------------------------------------
    {
        // WALK's own resolved acceleration is INSTANT/0 (core/AvatarMovementAccelerationCapability.js)
        // — every tick still reaches its target speed immediately, byte-
        // for-byte the same as every milestone before this one. Two
        // otherwise-identical controllers — one that never hears about a
        // capability, one with an EXPLICIT resolved WALK capability
        // re-applied every tick (the real WorldNavigationSession flow) —
        // must cover byte-identical ground.
        const { avatarPresenceSession: defaultSession } = buildAvatarStack(registry, 'accel-a1-default');
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'accel-a1-walk');
        const defaultController = new AvatarMovementController(defaultSession);
        const walkController = new AvatarMovementController(walkSession);
        const walkCapability = resolveAvatarVehicleMovementCapability(VehicleType.NONE);

        defaultController.keyDown('w');
        walkController.keyDown('w');
        for (let i = 0; i < 40; i++) {
            defaultController.tick(DT);
            walkController.setMovementCapability(walkCapability);
            walkController.tick(DT);
        }
        assert(Math.abs(defaultSession.current.position.z - walkSession.current.position.z) < 1e-9,
            '1. WALK regression: never setting a capability and explicitly re-applying the resolved WALK capability every tick produce byte-identical positions — this milestone changes nothing about WALK\'s own INSTANT speed');
    }
    {
        // The FIRST tick already reaches full WALK_SPEED — never a
        // partial, ramping value the way a RATE_LIMITED capability's own
        // first tick does (see Section B below).
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-a2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        const [firstTickSpeed, secondTickSpeed] = tickSpeeds(controller, avatarPresenceSession, 'w', 2, DT);
        assert(Math.abs(firstTickSpeed - 3) < 1e-9 && Math.abs(secondTickSpeed - 3) < 1e-9,
            '2. WALK: the very first tick already moves at the full WALK_SPEED (3) — INSTANT means instant, not a fast ramp');
    }
    {
        // Releasing W under WALK still settles to IDLE (and to a full
        // stop) on the very next tick — no coasting residual of any kind
        // for an INSTANT capability.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-a3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.keyDown('w');
        controller.tick(DT);
        controller.keyUp('w');
        const zBeforeRelease = avatarPresenceSession.current.position.z;
        controller.tick(DT);
        assert(avatarPresenceSession.current.position.z === zBeforeRelease,
            '3. WALK: releasing W stops movement outright on the very next tick — no residual coasting for an INSTANT capability');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE,
            '4. WALK: releasing W settles to IDLE on the very next tick');
    }

    // -------------------------------------------------------------
    // Section B — BICYCLE ramps
    // -------------------------------------------------------------
    {
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-b1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(bicycle);

        const ticks = 60; // 3s — comfortably past BICYCLE's own 2s ramp-to-6 time
        const observed = tickSpeeds(controller, avatarPresenceSession, 'w', ticks, DT);
        const expected = expectedRampSpeeds(bicycle.movementSpeed, bicycle.acceleration.acceleration, DT, ticks);

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `5.${i} BICYCLE: tick ${i}'s observed speed matches the exact resolveMovementSpeed() recurrence`);
        }
        assert(observed[0] > 0 && observed[0] < bicycle.movementSpeed,
            '6. BICYCLE: the very FIRST tick is already moving, but strictly below movementSpeed — never an instant jump, unlike WALK');
        assert(observed[0] < observed[1] && observed[1] < observed[2],
            '7. BICYCLE: speed strictly increases tick over tick during the ramp — "0 -> 3 -> 6"-shaped, not "0 -> 6"');
        assert(Math.abs(observed[ticks - 1] - bicycle.movementSpeed) < 1e-9,
            '8. BICYCLE: speed reaches EXACTLY movementSpeed once fully ramped, and never exceeds it (no overshoot)');
    }

    // -------------------------------------------------------------
    // Section C — MOTORCYCLE ramps
    // -------------------------------------------------------------
    {
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-c1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(motorcycle);

        const ticks = 60; // 3s — comfortably past MOTORCYCLE's own 1.8s ramp-to-9 time
        const observed = tickSpeeds(controller, avatarPresenceSession, 'w', ticks, DT);
        const expected = expectedRampSpeeds(motorcycle.movementSpeed, motorcycle.acceleration.acceleration, DT, ticks);

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `9.${i} MOTORCYCLE: tick ${i}'s observed speed matches the exact resolveMovementSpeed() recurrence`);
        }
        assert(observed[0] > 0 && observed[0] < motorcycle.movementSpeed,
            '10. MOTORCYCLE: the very FIRST tick is already moving, but strictly below movementSpeed');
        assert(Math.abs(observed[ticks - 1] - motorcycle.movementSpeed) < 1e-9,
            '11. MOTORCYCLE: speed reaches EXACTLY movementSpeed once fully ramped, and never exceeds it');
    }

    // -------------------------------------------------------------
    // Section D — CAR ramps
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-d1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        const ticks = 80; // 4s — comfortably past CAR's own 3s ramp-to-12 time
        const observed = tickSpeeds(controller, avatarPresenceSession, 'w', ticks, DT);
        const expected = expectedRampSpeeds(car.movementSpeed, car.acceleration.acceleration, DT, ticks);

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `12.${i} CAR: tick ${i}'s observed speed matches the exact resolveMovementSpeed() recurrence`);
        }
        assert(observed[0] > 0 && observed[0] < car.movementSpeed,
            '13. CAR: the very FIRST tick is already moving, but strictly below movementSpeed');
        assert(Math.abs(observed[ticks - 1] - car.movementSpeed) < 1e-9,
            '14. CAR: speed reaches EXACTLY movementSpeed once fully ramped, and never exceeds it');
    }

    // -------------------------------------------------------------
    // Section E — acceleration independence (0.9.90's own relationship,
    // now actually observable through real movement)
    // -------------------------------------------------------------
    {
        // CAR: maximum 12, acceleration 4. MOTORCYCLE: maximum 9,
        // acceleration 5. Over a SHORT window, MOTORCYCLE's own faster
        // acceleration lets it pull ahead of CAR despite CAR's higher
        // eventual top speed — see core/AvatarVehicleMovementCapability.js's
        // own 0.9.90 header, "acceleration is an independent dimension
        // from movementSpeed."
        const { avatarPresenceSession: motorcycleShortSession } = buildAvatarStack(registry, 'accel-e1-motorcycle-short');
        const { avatarPresenceSession: carShortSession } = buildAvatarStack(registry, 'accel-e1-car-short');
        const motorcycleShortController = new AvatarMovementController(motorcycleShortSession);
        const carShortController = new AvatarMovementController(carShortSession);
        motorcycleShortController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        carShortController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        motorcycleShortController.keyDown('w');
        carShortController.keyDown('w');
        for (let i = 0; i < 20; i++) { // 1s — well within both ramp windows
            motorcycleShortController.tick(DT);
            carShortController.tick(DT);
        }
        assert(motorcycleShortSession.current.position.z > carShortSession.current.position.z,
            '15. over a SHORT window, MOTORCYCLE (faster acceleration) covers more ground than CAR (slower acceleration, higher eventual top speed) — from rest, neither has reached its own movementSpeed yet');

        // Over a LONG window, both reach cruise and CAR's own higher
        // movementSpeed (12 > 9) wins out — the 0.9.87 ordering still
        // holds once acceleration is no longer the deciding factor.
        const { avatarPresenceSession: motorcycleLongSession } = buildAvatarStack(registry, 'accel-e2-motorcycle-long');
        const { avatarPresenceSession: carLongSession } = buildAvatarStack(registry, 'accel-e2-car-long');
        const motorcycleLongController = new AvatarMovementController(motorcycleLongSession);
        const carLongController = new AvatarMovementController(carLongSession);
        motorcycleLongController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        carLongController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        motorcycleLongController.keyDown('w');
        carLongController.keyDown('w');
        for (let i = 0; i < 400; i++) { // 20s — both are fully cruising for the vast majority of this
            motorcycleLongController.tick(DT);
            carLongController.tick(DT);
        }
        assert(carLongSession.current.position.z > motorcycleLongSession.current.position.z,
            '16. over a LONG window, CAR (higher eventual movementSpeed) overtakes MOTORCYCLE once both have had time to reach cruise — 0.9.87\'s own WALK < BICYCLE < MOTORCYCLE < CAR ordering still holds at the destination, even though acceleration and movementSpeed are independent dimensions along the way');
    }

    // -------------------------------------------------------------
    // Section F — releasing movement decays toward zero
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-f1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        // Warm up to full cruise speed first.
        controller.keyDown('w');
        for (let i = 0; i < 80; i++) controller.tick(DT); // 4s, past CAR's own 3s ramp
        controller.keyUp('w');

        // Now release W entirely and observe deceleration toward 0 — the
        // exact SAME acceleration rate, per core/AvatarMovementAccelerationSimulation.js's
        // own "no separate braking rate" design (0.9.90's own header).
        const ticks = 80; // 4s — comfortably past the 3s needed to decay 12 -> 0 at 4 units/second^2
        const observed = tickSpeeds(controller, avatarPresenceSession, null, ticks, DT);
        const expected = expectedRampSpeeds(0, car.acceleration.acceleration, DT, ticks);
        // expectedRampSpeeds() itself always starts its OWN recurrence
        // from 0 — reset it to start from CAR's own cruise speed instead,
        // matching what the controller's real `_currentMovementSpeed`
        // actually starts this phase at.
        let current = car.movementSpeed;
        const expectedFromCruise = [];
        for (let i = 0; i < ticks; i++) {
            const maxDelta = car.acceleration.acceleration * DT;
            current = Math.max(current - maxDelta, 0);
            expectedFromCruise.push(current);
        }

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expectedFromCruise[i]) < 1e-9,
                `17.${i} CAR: releasing W decays speed toward 0 following the exact same resolveMovementSpeed() recurrence, tick ${i}`);
        }
        assert(observed[0] < car.movementSpeed,
            '18. CAR: the very FIRST tick after releasing W is already below cruise speed — it does not remain at cruising speed for even one extra tick');
        assert(observed[0] > observed[1] && observed[1] > observed[2],
            '19. CAR: speed strictly decreases tick over tick while decelerating to a stop');
        assert(Math.abs(observed[ticks - 1]) < 1e-9,
            '20. CAR: speed reaches EXACTLY 0 once fully decelerated, and never goes negative merely from releasing forward input');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE,
            '21. CAR: animation is IDLE the instant W is released, even while the avatar is still visibly coasting forward for several more ticks — animation is governed by forwardAxis, completely decoupled from the transient currentMovementSpeed this milestone adds (animation is explicitly out of this milestone\'s own scope)');
    }

    // -------------------------------------------------------------
    // Section G — direction reversal passes through exactly zero
    // -------------------------------------------------------------
    {
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-g1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(bicycle);

        // Warm up to full +cruise speed.
        controller.keyDown('w');
        for (let i = 0; i < 60; i++) controller.tick(DT); // 3s, past BICYCLE's own 2s ramp
        controller.keyUp('w');
        const cruiseZ0 = avatarPresenceSession.current.position.z;

        // Now press S (backward) instead — the SAME BICYCLE capability,
        // the SAME acceleration rate, closing the gap toward the
        // NEGATIVE target from whatever positive speed is still active.
        const ticks = 160; // 8s — reaches the full -movementSpeed target on the same controller
        const observed = tickSpeeds(controller, avatarPresenceSession, 's', ticks, DT);
        let current = bicycle.movementSpeed;
        const target = -bicycle.movementSpeed;
        const expected = [];
        for (let i = 0; i < ticks; i++) {
            const maxDelta = bicycle.acceleration.acceleration * DT;
            current = current > target ? Math.max(current - maxDelta, target) : current;
            expected.push(current);
        }

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `22.${i} BICYCLE: reversing from +movementSpeed toward -movementSpeed follows the exact same recurrence, tick ${i}`);
        }
        assert(observed[0] > 0, '23. BICYCLE: the tick right after pressing S is STILL moving forward (positive) — momentum does not vanish the instant the opposite key is pressed');
        const zeroCrossingIndex = observed.findIndex((speed) => Math.abs(speed) < 1e-9);
        assert(zeroCrossingIndex > 0 && zeroCrossingIndex < ticks - 1,
            '24. BICYCLE: the speed sequence hits EXACTLY 0 at some tick strictly between the first and the last — it genuinely passes through zero rather than skipping over it');
        assert(observed[zeroCrossingIndex - 1] > 0, '25. BICYCLE: the tick immediately before the zero crossing is still positive');
        assert(observed[zeroCrossingIndex + 1] < 0, '26. BICYCLE: the tick immediately after the zero crossing is negative — forward, zero, and backward are all actually visited in order');
        assert(Math.abs(observed[ticks - 1] - (-bicycle.movementSpeed)) < 1e-9,
            '27. BICYCLE: given enough time, the reversed speed reaches EXACTLY -movementSpeed and never overshoots past it');
        // No tick ever jumps straight from a positive speed to a
        // negative one without an intervening non-positive value —
        // every step moves by at most acceleration*dt, so a jump larger
        // than that is impossible by construction; this simply confirms
        // no two ADJACENT observed ticks are (positive, negative) with
        // neither being exactly 0 in between (would only be possible if
        // a single tick's own maxDelta straddled zero, which the
        // maxDelta chosen here (`bicycle.acceleration.acceleration * DT`)
        // does not, given movementSpeed's own exact divisibility by it).
        for (let i = 1; i < ticks; i++) {
            const wasPositive = observed[i - 1] > 0;
            const isNegative = observed[i] < 0;
            if (wasPositive && isNegative) {
                assert(Math.abs(observed[i - 1]) < 1e-9 || Math.abs(observed[i]) < 1e-9,
                    `28.${i} BICYCLE: no tick jumps directly from positive to negative without visiting (approximately) exactly 0`);
            }
        }
        // The FIRST reversal tick still added positive +Z (per assertion
        // 23 above) — the avatar is still visibly moving forward on
        // residual momentum right after S is pressed, before eventually
        // reversing, exactly like the milestone's own "+8 -> +4 -> 0 ->
        // -4 -> -8 -> -12" example.
        const zAfterFirstReversalTick = cruiseZ0 + observed[0] * DT;
        assert(zAfterFirstReversalTick > cruiseZ0,
            '29. BICYCLE: the tick right after pressing S still gains +Z — still moving forward on residual momentum, before eventually reversing');
    }

    // -------------------------------------------------------------
    // Section H — the run multiplier doubles the TARGET, never the RATE
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);

        // First tick from rest: walking and running produce the exact
        // SAME speed — proof that running never alters the acceleration
        // RATE (see application/AvatarMovementController.js's own 0.9.91
        // header, "_resolvedAcceleration() reads only .acceleration.acceleration,
        // never .kind, and running never touches it either").
        const { avatarPresenceSession: walkingFirstTickSession } = buildAvatarStack(registry, 'accel-h1-walking');
        const { avatarPresenceSession: runningFirstTickSession } = buildAvatarStack(registry, 'accel-h1-running');
        const walkingFirstTickController = new AvatarMovementController(walkingFirstTickSession);
        const runningFirstTickController = new AvatarMovementController(runningFirstTickSession);
        walkingFirstTickController.setMovementCapability(car);
        runningFirstTickController.setMovementCapability(car);
        runningFirstTickController.keyDown('shift');
        const [walkingFirstTickSpeed] = tickSpeeds(walkingFirstTickController, walkingFirstTickSession, 'w', 1, DT);
        const [runningFirstTickSpeed] = tickSpeeds(runningFirstTickController, runningFirstTickSession, 'w', 1, DT);
        assert(walkingFirstTickSpeed === runningFirstTickSpeed,
            '30. CAR: the FIRST tick from rest produces the IDENTICAL speed whether running or not — running never accelerates faster, only ramps toward a higher target (never "CAR run acceleration = 8")');
        assert(walkingFirstTickSpeed > 0 && walkingFirstTickSpeed < car.movementSpeed,
            '31. CAR: that shared first-tick speed is a genuine partial ramp step, not either target');

        // Once BOTH have had time to reach their own cruise speed, the
        // ratio between them is exactly the RUN_SPEED_MULTIPLIER (2) —
        // proof that running doubles the TARGET.
        function warmedUpDistance(controller, avatarPresenceSession, warmupTicks, measureTicks, dt) {
            controller.keyDown('w');
            for (let i = 0; i < warmupTicks; i++) controller.tick(dt);
            const startZ = avatarPresenceSession.current.position.z;
            for (let i = 0; i < measureTicks; i++) controller.tick(dt);
            const distance = avatarPresenceSession.current.position.z - startZ;
            controller.keyUp('w');
            return distance;
        }
        const { avatarPresenceSession: walkingCruiseSession } = buildAvatarStack(registry, 'accel-h2-walking');
        const { avatarPresenceSession: runningCruiseSession } = buildAvatarStack(registry, 'accel-h2-running');
        const walkingCruiseController = new AvatarMovementController(walkingCruiseSession);
        const runningCruiseController = new AvatarMovementController(runningCruiseSession);
        walkingCruiseController.setMovementCapability(car);
        runningCruiseController.setMovementCapability(car);
        runningCruiseController.keyDown('shift');
        const WARMUP_TICKS = 140; // 7s — comfortably past CAR running's own 6s ramp-to-24 time
        const MEASURE_TICKS = 40; // 2s of pure cruise
        const walkingCruiseDistance = warmedUpDistance(walkingCruiseController, walkingCruiseSession, WARMUP_TICKS, MEASURE_TICKS, DT);
        const runningCruiseDistance = warmedUpDistance(runningCruiseController, runningCruiseSession, WARMUP_TICKS, MEASURE_TICKS, DT);
        assert(Math.abs(runningCruiseDistance / walkingCruiseDistance - 2) < 1e-9,
            '32. CAR: once both have reached cruise, running covers EXACTLY twice the ground — the target speed doubled, the acceleration rate did not');
    }

    // -------------------------------------------------------------
    // Section I — capability switching resets transient speed to zero
    // -------------------------------------------------------------
    {
        // Mounting: WALK (cruising at WALK_SPEED, per WALK's own
        // INSTANT behavior) -> BICYCLE. The first BICYCLE tick must show
        // BICYCLE's own fresh ramp value, never WALK's leftover speed —
        // "BICYCLE at +5 -> mount motorcycle -> motorcycle starts at +5"
        // is exactly the outcome this milestone's own brief names as
        // undefined/wrong.
        {
            const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
            const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-i1');
            const controller = new AvatarMovementController(avatarPresenceSession);
            controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
            controller.keyDown('w');
            controller.tick(DT); // WALK: instantly at WALK_SPEED (3)
            assert(Math.abs((avatarPresenceSession.current.position.z / DT) - 3) < 1e-9, 'pre-33. sanity: WALK reached full speed in one tick');

            controller.setMovementCapability(bicycle);
            const zBeforeMount = avatarPresenceSession.current.position.z;
            controller.tick(DT);
            const firstBicycleTickSpeed = (avatarPresenceSession.current.position.z - zBeforeMount) / DT;
            controller.keyUp('w');

            const expectedFreshRampSpeed = Math.min(bicycle.acceleration.acceleration * DT, bicycle.movementSpeed);
            assert(Math.abs(firstBicycleTickSpeed - expectedFreshRampSpeed) < 1e-9,
                '33. mounting BICYCLE while already walking at WALK_SPEED starts the vehicle\'s own ramp from 0, NOT from WALK\'s own leftover speed');
        }

        // Dismounting: CAR (fully cruising at 12) -> WALK. The very next
        // WALK tick must show WALK's own instant target, never CAR's own
        // leftover cruise speed — "CAR at +12 -> dismount -> WALK at +12"
        // is exactly the outcome this milestone's own brief names as
        // wrong.
        {
            const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
            const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-i2');
            const controller = new AvatarMovementController(avatarPresenceSession);
            controller.setMovementCapability(car);
            controller.keyDown('w');
            for (let i = 0; i < 80; i++) controller.tick(DT); // fully ramped to cruise (12)

            controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
            const zBeforeDismount = avatarPresenceSession.current.position.z;
            controller.tick(DT);
            const firstWalkTickSpeed = (avatarPresenceSession.current.position.z - zBeforeDismount) / DT;
            controller.keyUp('w');

            assert(Math.abs(firstWalkTickSpeed - 3) < 1e-9,
                '34. dismounting a CAR cruising at 12 immediately drops to WALK\'s own instant target (3) — no residual vehicle momentum ever leaks into ordinary walking');
        }

        // Vehicle-to-vehicle (via an intermediate WALK stop, since this
        // codebase still has no direct vehicle-to-vehicle mount —
        // core/AvatarVehicleMovementCapability.js's own 0.9.84 header):
        // BICYCLE (ramped up) -> WALK -> BICYCLE again. The SECOND
        // bicycle ride's own first tick must be a fresh ramp value too —
        // no leakage survives an intermediate capability, however brief.
        {
            const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
            const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
            const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-i3');
            const controller = new AvatarMovementController(avatarPresenceSession);
            controller.setMovementCapability(bicycle);
            controller.keyDown('w');
            for (let i = 0; i < 60; i++) controller.tick(DT); // fully ramped to cruise (6)

            controller.setMovementCapability(walk);
            controller.tick(DT); // one WALK tick in between

            controller.setMovementCapability(bicycle);
            const zBeforeSecondRide = avatarPresenceSession.current.position.z;
            controller.tick(DT);
            const secondRideFirstTickSpeed = (avatarPresenceSession.current.position.z - zBeforeSecondRide) / DT;
            controller.keyUp('w');

            const expectedFreshRampSpeed = Math.min(bicycle.acceleration.acceleration * DT, bicycle.movementSpeed);
            assert(Math.abs(secondRideFirstTickSpeed - expectedFreshRampSpeed) < 1e-9,
                '35. re-mounting BICYCLE after an intermediate WALK stop starts the ramp fresh from 0 again — no residual survives even a brief capability detour');
        }

        // Re-applying the SAME resolved capability every tick (the real
        // WorldNavigationSession flow) never resets anything — a ride
        // must be able to actually reach cruise speed.
        {
            const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
            const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-i4');
            const controller = new AvatarMovementController(avatarPresenceSession);
            controller.keyDown('w');
            for (let i = 0; i < 60; i++) {
                controller.setMovementCapability(bicycle); // resolveAvatarVehicleMovementCapability() returns the SAME frozen instance every call
                controller.tick(DT);
            }
            const finalTickZ0 = avatarPresenceSession.current.position.z;
            controller.tick(DT);
            const finalSpeed = (avatarPresenceSession.current.position.z - finalTickZ0) / DT;
            controller.keyUp('w');
            assert(Math.abs(finalSpeed - bicycle.movementSpeed) < 1e-9,
                '36. re-applying the identical resolved BICYCLE capability every single tick (WorldNavigationSession\'s own real usage pattern) still reaches full cruise speed — the every-frame re-application itself never resets transient speed');
        }
    }

    // -------------------------------------------------------------
    // Section J — AERIAL_VEHICLE/DRONE remains fully blocked
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'accel-j1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        const beforePosition = avatarPresenceSession.current.position;
        const before = { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z };
        controller.keyDown('w');
        controller.keyDown('shift');
        for (let i = 0; i < 100; i++) controller.tick(DT);
        const after = avatarPresenceSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '37. AERIAL_VEHICLE/DRONE remains fully blocked by tick()\'s own supported:false guard — no acceleration state, ramped or otherwise, is ever consulted for it');
        controller.keyUp('w');
        controller.keyUp('shift');

        // Mounting a DRONE (from a WALK-cruising avatar) is still a
        // capability CHANGE — the transient state resets exactly as any
        // other mount would, even though nothing ever reads it while
        // unsupported.
        const { avatarPresenceSession: walkThenDroneSession } = buildAvatarStack(registry, 'accel-j2');
        const walkThenDroneController = new AvatarMovementController(walkThenDroneSession);
        walkThenDroneController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        walkThenDroneController.keyDown('w');
        walkThenDroneController.tick(DT);
        walkThenDroneController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        const zBeforeDrone = walkThenDroneSession.current.position.z;
        for (let i = 0; i < 20; i++) walkThenDroneController.tick(DT);
        assert(walkThenDroneSession.current.position.z === zBeforeDrone,
            '38. mounting DRONE from a WALK-cruising avatar still blocks movement outright — no walking momentum of any kind leaks through the supported:false guard');
        walkThenDroneController.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section K — architectural regression
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        const controllerCodeOnly = controllerSource
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(controllerCodeOnly),
            '39. application/AvatarMovementController.js never references BICYCLE/MOTORCYCLE/CAR/DRONE — it knows only about a resolved capability\'s own generic acceleration.acceleration number');
        assert(!controllerCodeOnly.includes('AvatarMovementAccelerationKind') && !controllerCodeOnly.includes('.kind'),
            '40. application/AvatarMovementController.js never reads AvatarMovementAccelerationCapability\'s own .kind — the bare acceleration rate alone (always exactly 0 for INSTANT, always > 0 for RATE_LIMITED) already carries the distinction');
        assert(!controllerCodeOnly.includes('AvatarMovementAccelerationSimulation') && !controllerCodeOnly.includes('resolveMovementSpeed'),
            '41. application/AvatarMovementController.js never imports core/AvatarMovementAccelerationSimulation.js or calls resolveMovementSpeed() directly — it only ever hands bare numbers to core/AvatarMovementSimulation.js, which is the one place this seam is actually wired in');
        assert(controllerCodeOnly.includes('_resolvedAcceleration') && controllerCodeOnly.includes('_currentMovementSpeed'),
            '42. application/AvatarMovementController.js exposes the _resolvedAcceleration()/_currentMovementSpeed seam this milestone exists to add');
        assert(!/VehicleMovementController/.test(controllerCodeOnly),
            '43. no second, per-vehicle movement controller was introduced — application/AvatarMovementController.js remains the one movement executor');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        assert(simulationSource.includes('AvatarMovementAccelerationSimulation') && simulationSource.includes('resolveMovementSpeed'),
            '44. core/AvatarMovementSimulation.js now imports and calls resolveMovementSpeed() — this is the "future milestone" tests/AvatarMovementAccelerationSimulation.test.js\'s own header originally named as wiring this seam in');

        const capabilitySource = await readFile(new URL('../core/AvatarVehicleMovementCapability.js', import.meta.url), 'utf8');
        assert(!capabilitySource.includes('_currentMovementSpeed') && !capabilitySource.includes('currentSpeed'),
            '45. core/AvatarVehicleMovementCapability.js still carries no transient current-speed state of any kind — the capability remains immutable; the controller alone owns transient simulation state');
    }

    console.log('✅ All Vehicle Acceleration State Integration tests passed.');
}

await runTests();
