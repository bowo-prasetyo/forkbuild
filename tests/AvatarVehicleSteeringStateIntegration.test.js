import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.94 — Vehicle Steering State Integration.
//
// 0.9.93 (core/AvatarMovementSteeringCapability.js +
// core/AvatarMovementSteeringSimulation.js) built the steering vocabulary
// and its pure heading math, and deliberately stopped short of ever
// calling it — see that milestone's own closing paragraph, "0.9.94
// connects this milestone's pure heading math to an actual, stateful
// vehicle heading." This is that milestone: core/AvatarMovementSimulation.js
// now closes a held turn direction against resolveMovementHeading() at the
// active capability's own steeringRate, rather than turning the avatar in
// place at the fixed, instantaneous TURN_RATE_DEGREES_PER_SECOND every
// capability has used until now.
//
//   Section A: WALK regression — turning stays byte-for-byte identical to
//              before this milestone
//   Section B: BICYCLE steers gradually at its own rate
//   Section C: MOTORCYCLE steers gradually at its own, independent rate
//   Section D: CAR's own slower steering rate is respected despite its
//              higher movementSpeed
//   Section E: no overshoot — every tick turns by exactly
//              steeringRate * dt, never more
//   Section F: angular wraparound — 350° -> 10° and back take the
//              shortest path, exactly like the pure math's own suite
//   Section G: releasing the turn key stops heading change immediately
//   Section H: a continuously held turn key keeps turning every tick,
//              with no per-tick key re-press required
//   Section I: capability switching preserves the avatar's own physical
//              heading — never resets it, unlike transient speed
//   Section J: steering is independent of movementSpeed/running — a
//              faster or running vehicle does not steer faster
//   Section K: AERIAL_VEHICLE/DRONE remains fully blocked
//   Section L: architectural regression — the integration seam lives
//              exactly where core/AvatarMovementSimulation.js's and
//              application/AvatarMovementController.js's own 0.9.94
//              headers say it does, and no second heading/orientation
//              vocabulary was introduced
//
// Central architectural claim under test throughout: movement CAPABILITY
// (a steering rate), never vehicle IDENTITY, drives how quickly heading
// approaches a requested turn direction — this file reads only
// `avatarPresenceSession.current.rotation.y` and public controller
// methods; it never reaches into a private field. See docs/Roadmap.md,
// 0.9.94.

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

// Drives `controller` by holding `key` (or no key at all, when `key` is
// null) for `ticks` steps of `dt` seconds each, and returns the per-tick
// `rotation.y` (degrees, already normalized into [0, 360) by
// core/AvatarMovementSimulation.js's own normalizeDegrees()) — the direct
// observable proxy for heading, without ever reading a private field.
function tickHeadingsDegrees(controller, avatarPresenceSession, key, ticks, dt) {
    if (key) controller.keyDown(key);
    const headings = [];
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
        headings.push(avatarPresenceSession.current.rotation.y);
    }
    if (key) controller.keyUp(key);
    return headings;
}

// Normalizes an expected plain-degree value (which may be negative, or
// past 360) into [0, 360) — a small test-only helper, kept separate from
// core/AvatarMovementSimulation.js's own normalizeDegrees() so this suite
// never imports that file's internals.
function normalizeExpectedDegrees(degrees) {
    const wrapped = degrees % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

// The exact per-tick degrees a RATE_LIMITED capability turns while a turn
// key is continuously held: `steeringRate` (radians/second) * `dt`,
// converted to degrees — the SAME quantity
// core/AvatarMovementSimulation.js's own new heading branch resolves to
// every tick a held turn's "requested heading" is farther away than one
// tick could ever close (see that file's own 0.9.94 header,
// STEERING_TARGET_HEADING_OFFSET_RADIANS). Reproduced here purely to
// compute EXPECTED per-tick headings for this file's own assertions —
// never imported from production code.
function degreesPerHeldTick(steeringRateRadiansPerSecond, dt) {
    return steeringRateRadiansPerSecond * dt * (180 / Math.PI);
}

const DT = 0.05; // world seconds/tick — small enough that no held turn (even MOTORCYCLE's own fastest rate) crosses the 360° wrap within a handful of ticks unless a test deliberately seeds a heading near the boundary

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — WALK regression
    // -------------------------------------------------------------
    {
        // WALK's own resolved steering is INSTANT/0
        // (core/AvatarMovementSteeringCapability.js) — every tick still
        // turns at the existing, fixed TURN_RATE_DEGREES_PER_SECOND, byte-
        // for-byte the same as every milestone before this one. Two
        // otherwise-identical controllers — one that never hears about a
        // capability, one with an EXPLICIT resolved WALK capability
        // re-applied every tick (the real WorldNavigationSession flow) —
        // must cover byte-identical ground, turning included.
        const { avatarPresenceSession: defaultSession } = buildAvatarStack(registry, 'steer-a1-default');
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'steer-a1-walk');
        const defaultController = new AvatarMovementController(defaultSession);
        const walkController = new AvatarMovementController(walkSession);
        const walkCapability = resolveAvatarVehicleMovementCapability(VehicleType.NONE);

        defaultController.keyDown('d');
        walkController.keyDown('d');
        for (let i = 0; i < 40; i++) {
            defaultController.tick(DT);
            walkController.setMovementCapability(walkCapability);
            walkController.tick(DT);
        }
        assert(defaultSession.current.rotation.y === walkSession.current.rotation.y,
            '1. WALK regression: never setting a capability and explicitly re-applying the resolved WALK capability every tick produce byte-identical headings — this milestone changes nothing about WALK\'s own INSTANT turning');
    }
    {
        // The existing fixed rate (150°/second) is exactly what a single
        // WALK tick still turns by.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-a2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        const [firstTickHeading] = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', 1, DT);
        assert(Math.abs(firstTickHeading - 150 * DT) < 1e-9,
            '2. WALK: the very first tick already turns by the existing fixed TURN_RATE_DEGREES_PER_SECOND (150) * dt — this milestone never touches that formula');
    }
    {
        // Releasing D under WALK still stops turning outright, exactly
        // as it always has.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-a3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.keyDown('d');
        controller.tick(DT);
        controller.keyUp('d');
        const headingBeforeRelease = avatarPresenceSession.current.rotation.y;
        controller.tick(DT);
        assert(avatarPresenceSession.current.rotation.y === headingBeforeRelease,
            '3. WALK: releasing D stops turning outright on the very next tick, exactly as before this milestone');
    }

    // -------------------------------------------------------------
    // Section B — BICYCLE steers gradually
    // -------------------------------------------------------------
    {
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-b1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(bicycle);

        const ticks = 10; // well under the ~35.8 ticks a full 360° would take at this rate/dt
        const observed = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', ticks, DT);
        const perTick = degreesPerHeldTick(bicycle.steering.steeringRate, DT);

        for (let i = 0; i < ticks; i++) {
            const expected = normalizeExpectedDegrees(perTick * (i + 1));
            assert(Math.abs(observed[i] - expected) < 1e-6,
                `4.${i} BICYCLE: tick ${i}'s observed heading matches steeringRate (3.5 rad/s) applied exactly, converted to degrees`);
        }
        assert(observed[0] > 0 && Math.abs(observed[0] - perTick) < 1e-6,
            '5. BICYCLE: a single tick already turns by exactly its own steeringRate * dt — genuinely rate-limited (its own rate, in radians/second, not compared against WALK\'s own unrelated degrees/second constant)');
    }

    // -------------------------------------------------------------
    // Section C — MOTORCYCLE steers gradually, at its own rate
    // -------------------------------------------------------------
    {
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-c1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(motorcycle);

        const ticks = 10;
        const observed = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', ticks, DT);
        const perTick = degreesPerHeldTick(motorcycle.steering.steeringRate, DT);

        for (let i = 0; i < ticks; i++) {
            const expected = normalizeExpectedDegrees(perTick * (i + 1));
            assert(Math.abs(observed[i] - expected) < 1e-6,
                `6.${i} MOTORCYCLE: tick ${i}'s observed heading matches its own steeringRate (4.5 rad/s), independent of BICYCLE's`);
        }

        // MOTORCYCLE's own steering (4.5 rad/s) is faster than BICYCLE's
        // (3.5 rad/s) — over the identical hold, it has turned further.
        const { avatarPresenceSession: bicycleSession } = buildAvatarStack(registry, 'steer-c2-bicycle');
        const bicycleController = new AvatarMovementController(bicycleSession);
        bicycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        tickHeadingsDegrees(bicycleController, bicycleSession, 'd', ticks, DT);
        assert(avatarPresenceSession.current.rotation.y > bicycleSession.current.rotation.y,
            '7. MOTORCYCLE (faster steeringRate) turns further than BICYCLE over the identical held duration');
    }

    // -------------------------------------------------------------
    // Section D — CAR's own slower steering rate is respected, despite
    // its own higher movementSpeed
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-d1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        const ticks = 10;
        const observed = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', ticks, DT);
        const perTick = degreesPerHeldTick(car.steering.steeringRate, DT);

        for (let i = 0; i < ticks; i++) {
            const expected = normalizeExpectedDegrees(perTick * (i + 1));
            assert(Math.abs(observed[i] - expected) < 1e-6,
                `8.${i} CAR: tick ${i}'s observed heading matches its own steeringRate (2.5 rad/s)`);
        }

        // CAR's own movementSpeed (12) is the HIGHEST of the three ground
        // vehicles, yet its own steeringRate (2.5) is the LOWEST — turning
        // the SLOWEST of BICYCLE/MOTORCYCLE/CAR despite being the fastest
        // mover. See core/AvatarVehicleMovementCapability.js's own 0.9.93
        // header for why this ordering is deliberate.
        const { avatarPresenceSession: motorcycleSession } = buildAvatarStack(registry, 'steer-d2-motorcycle');
        const motorcycleController = new AvatarMovementController(motorcycleSession);
        motorcycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        tickHeadingsDegrees(motorcycleController, motorcycleSession, 'd', ticks, DT);
        const { avatarPresenceSession: bicycleSession } = buildAvatarStack(registry, 'steer-d3-bicycle');
        const bicycleController = new AvatarMovementController(bicycleSession);
        bicycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        tickHeadingsDegrees(bicycleController, bicycleSession, 'd', ticks, DT);

        assert(avatarPresenceSession.current.rotation.y < bicycleSession.current.rotation.y
            && bicycleSession.current.rotation.y < motorcycleSession.current.rotation.y,
            '9. CAR (highest movementSpeed) turns the LEAST of the three ground vehicles over an identical hold, and BICYCLE turns less than MOTORCYCLE — steeringRate follows no relationship to movementSpeed\'s own WALK < BICYCLE < MOTORCYCLE < CAR ordering');
    }

    // -------------------------------------------------------------
    // Section E — no overshoot: every tick turns by EXACTLY
    // steeringRate * dt, never more
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-e1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        const ticks = 20;
        const observed = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', ticks, DT);
        const perTick = degreesPerHeldTick(car.steering.steeringRate, DT);
        let previous = 0;
        for (let i = 0; i < ticks; i++) {
            const delta = observed[i] - previous;
            assert(Math.abs(delta - perTick) < 1e-6,
                `10.${i} CAR: tick ${i}'s own heading delta is exactly steeringRate * dt, never more — no overshoot of the per-tick rate limit`);
            previous = observed[i];
        }
    }

    // -------------------------------------------------------------
    // Section F — angular wraparound: shortest path preserved
    // -------------------------------------------------------------
    {
        // Seed the avatar facing 350°, then hold D (turning toward
        // increasing degrees) — the heading must cross 350° -> 360°/0° ->
        // upward smoothly, with no jump or reversal at the boundary,
        // exactly like core/AvatarMovementSteeringSimulation.js's own
        // Section B (tests/AvatarMovementSteeringSimulation.test.js).
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-f1');
        avatarPresenceSession.update({ rotation: { y: 350 } });
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(bicycle);

        const ticks = 6; // ~60° of total turn — comfortably crosses the 0/360 boundary
        const observed = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', ticks, DT);
        const perTick = degreesPerHeldTick(bicycle.steering.steeringRate, DT);
        for (let i = 0; i < ticks; i++) {
            const expected = normalizeExpectedDegrees(350 + perTick * (i + 1));
            assert(Math.abs(observed[i] - expected) < 1e-6,
                `11.${i} wraparound: tick ${i}'s heading crosses the 350°->0° boundary exactly as expected, never jumping the long way around`);
        }
        assert(observed.some((h) => h < 10), '12. wraparound: the heading actually lands below 10° at some point, proving it crossed through 0° rather than stalling at 359°');

        // The reverse: seeded near 10°, holding A (decreasing degrees)
        // crosses 10° -> 0°/360° -> downward smoothly.
        const { avatarPresenceSession: reverseSession } = buildAvatarStack(registry, 'steer-f2');
        reverseSession.update({ rotation: { y: 10 } });
        const reverseController = new AvatarMovementController(reverseSession);
        reverseController.setMovementCapability(bicycle);
        const reverseObserved = tickHeadingsDegrees(reverseController, reverseSession, 'a', ticks, DT);
        for (let i = 0; i < ticks; i++) {
            const expected = normalizeExpectedDegrees(10 - perTick * (i + 1));
            assert(Math.abs(reverseObserved[i] - expected) < 1e-6,
                `13.${i} reverse wraparound: tick ${i}'s heading crosses the 10°->0°/360° boundary exactly as expected`);
        }
        assert(reverseObserved.some((h) => h > 350), '14. reverse wraparound: the heading actually lands above 350° at some point, proving it crossed through 0° the short way rather than the long way around');
    }

    // -------------------------------------------------------------
    // Section G — releasing the turn key stops heading change
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-g1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        controller.keyDown('d');
        for (let i = 0; i < 5; i++) controller.tick(DT);
        controller.keyUp('d');
        const headingAfterRelease = avatarPresenceSession.current.rotation.y;

        for (let i = 0; i < 10; i++) controller.tick(DT);
        assert(avatarPresenceSession.current.rotation.y === headingAfterRelease,
            '15. CAR: releasing D stops heading change outright — no residual "coasting" turn of any kind, exactly like an ordinary key release');
    }

    // -------------------------------------------------------------
    // Section H — a continuously held turn key keeps turning every tick
    // -------------------------------------------------------------
    {
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-h1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(motorcycle);

        const ticks = 15;
        const observed = tickHeadingsDegrees(controller, avatarPresenceSession, 'd', ticks, DT);
        for (let i = 1; i < ticks; i++) {
            assert(observed[i] > observed[i - 1],
                `16.${i} MOTORCYCLE: heading strictly increases tick over tick for as long as D stays held — turning genuinely continues, never stalling after the first tick`);
        }
    }

    // -------------------------------------------------------------
    // Section I — capability switching preserves the avatar's own
    // physical heading
    // -------------------------------------------------------------
    {
        // WALK, turned to some non-zero heading, then mounted onto
        // BICYCLE -> MOTORCYCLE -> CAR with no turn input in between —
        // the heading must never jump or reset at any switch, only the
        // RATE at which further turning happens should change.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-i1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.keyDown('d');
        controller.tick(DT); // WALK: turns by the fixed 150°/s rate
        controller.keyUp('d');
        const headingAfterWalk = avatarPresenceSession.current.rotation.y;
        assert(headingAfterWalk > 0, 'pre-17. sanity: WALK turned the avatar to a non-zero heading');

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        controller.tick(DT); // no turn input — heading must not move at all
        assert(Math.abs(avatarPresenceSession.current.rotation.y - headingAfterWalk) < 1e-6,
            '17. mounting BICYCLE while facing a WALK-turned heading preserves that EXACT heading — no reset to 0, no snap to any default facing');

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        controller.tick(DT);
        assert(Math.abs(avatarPresenceSession.current.rotation.y - headingAfterWalk) < 1e-6,
            '18. switching BICYCLE -> MOTORCYCLE (still no turn input) preserves the identical heading again');

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        controller.tick(DT);
        assert(Math.abs(avatarPresenceSession.current.rotation.y - headingAfterWalk) < 1e-6,
            '19. switching MOTORCYCLE -> CAR (still no turn input) preserves the identical heading yet again — heading is spatial state, never capability-relative transient state');

        // Now that CAR is active, turning resumes at CAR's own rate,
        // continuing from the preserved heading rather than from 0.
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        controller.keyDown('d');
        controller.tick(DT);
        controller.keyUp('d');
        const expectedNextHeading = normalizeExpectedDegrees(headingAfterWalk + degreesPerHeldTick(car.steering.steeringRate, DT));
        assert(Math.abs(avatarPresenceSession.current.rotation.y - expectedNextHeading) < 1e-6,
            '20. turning resumes from the PRESERVED heading at CAR\'s own steeringRate — the switch never silently reset the starting point for further turning');
    }
    {
        // Dismounting: CAR (turned to some heading) -> WALK. The very
        // next WALK tick must still preserve that heading and simply
        // resume turning at WALK's own fixed rate.
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-i2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);
        controller.keyDown('d');
        for (let i = 0; i < 5; i++) controller.tick(DT);
        controller.keyUp('d');
        const headingBeforeDismount = avatarPresenceSession.current.rotation.y;

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.tick(DT); // no turn input
        assert(Math.abs(avatarPresenceSession.current.rotation.y - headingBeforeDismount) < 1e-6,
            '21. dismounting CAR preserves the exact heading it had reached — no residual vehicle steering state of any kind leaks into ordinary WALK turning, and no reset to 0 either');
    }

    // -------------------------------------------------------------
    // Section J — steering is independent of movementSpeed/running
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);

        // Turning while running (Shift+D) produces the IDENTICAL heading
        // change as turning while walking (D alone) — running only ever
        // doubles the TARGET forward speed (0.9.86/0.9.91's own domain),
        // never the steering rate.
        const { avatarPresenceSession: walkingSession } = buildAvatarStack(registry, 'steer-j1-walking');
        const { avatarPresenceSession: runningSession } = buildAvatarStack(registry, 'steer-j1-running');
        const walkingController = new AvatarMovementController(walkingSession);
        const runningController = new AvatarMovementController(runningSession);
        walkingController.setMovementCapability(car);
        runningController.setMovementCapability(car);
        runningController.keyDown('shift');
        const ticks = 10;
        const walkingHeadings = tickHeadingsDegrees(walkingController, walkingSession, 'd', ticks, DT);
        const runningHeadings = tickHeadingsDegrees(runningController, runningSession, 'd', ticks, DT);
        runningController.keyUp('shift');
        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(walkingHeadings[i] - runningHeadings[i]) < 1e-9,
                `22.${i} CAR: turning while running produces the IDENTICAL heading to turning while walking — running never alters steeringRate`);
        }

        // Turning simultaneously with forward movement produces the
        // IDENTICAL per-tick heading change as turning alone — steering
        // and longitudinal speed are resolved independently.
        const { avatarPresenceSession: turningAloneSession } = buildAvatarStack(registry, 'steer-j2-alone');
        const { avatarPresenceSession: turningWhileMovingSession } = buildAvatarStack(registry, 'steer-j2-moving');
        const turningAloneController = new AvatarMovementController(turningAloneSession);
        const turningWhileMovingController = new AvatarMovementController(turningWhileMovingSession);
        turningAloneController.setMovementCapability(car);
        turningWhileMovingController.setMovementCapability(car);
        turningAloneController.keyDown('d');
        turningWhileMovingController.keyDown('d');
        turningWhileMovingController.keyDown('w');
        for (let i = 0; i < ticks; i++) {
            turningAloneController.tick(DT);
            turningWhileMovingController.tick(DT);
        }
        turningAloneController.keyUp('d');
        turningWhileMovingController.keyUp('d');
        turningWhileMovingController.keyUp('w');
        assert(Math.abs(turningAloneSession.current.rotation.y - turningWhileMovingSession.current.rotation.y) < 1e-6,
            '23. CAR: turning while also moving forward (accelerating toward movementSpeed) produces the IDENTICAL heading to turning alone — steeringRate is never diminished or boosted by concurrent longitudinal motion');
    }

    // -------------------------------------------------------------
    // Section K — AERIAL_VEHICLE/DRONE remains fully blocked
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'steer-k1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        const before = avatarPresenceSession.current.rotation.y;
        controller.keyDown('d');
        for (let i = 0; i < 50; i++) controller.tick(DT);
        controller.keyUp('d');
        assert(avatarPresenceSession.current.rotation.y === before,
            '24. AERIAL_VEHICLE/DRONE remains fully blocked by tick()\'s own supported:false guard — no steering state, rate-limited or otherwise, is ever consulted for it');
    }

    // -------------------------------------------------------------
    // Section L — architectural regression
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        const controllerCodeOnly = controllerSource
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(controllerCodeOnly),
            '25. application/AvatarMovementController.js never references BICYCLE/MOTORCYCLE/CAR/DRONE — it knows only about a resolved capability\'s own generic steering.steeringRate number');
        assert(!controllerCodeOnly.includes('AvatarMovementSteeringKind') && !/\.kind\b/.test(controllerCodeOnly.replace(/movementKind/g, '')),
            '26. application/AvatarMovementController.js never reads AvatarMovementSteeringCapability\'s own .kind — the bare steeringRate number alone (always exactly 0 for INSTANT, always > 0 for RATE_LIMITED) already carries the distinction');
        assert(!controllerCodeOnly.includes('AvatarMovementSteeringSimulation') && !controllerCodeOnly.includes('resolveMovementHeading'),
            '27. application/AvatarMovementController.js never imports core/AvatarMovementSteeringSimulation.js or calls resolveMovementHeading() directly — it only ever hands a bare number to core/AvatarMovementSimulation.js, which is the one place this seam is actually wired in');
        assert(controllerCodeOnly.includes('_resolvedSteeringRate'),
            '28. application/AvatarMovementController.js exposes the _resolvedSteeringRate() seam this milestone exists to add');
        assert(!controllerCodeOnly.includes('_currentMovementHeading') && !controllerCodeOnly.includes('VehicleOrientation'),
            '29. application/AvatarMovementController.js introduces no new transient heading field, and no second VehicleOrientation vocabulary — the avatar\'s existing rotationY/AvatarPresence.rotation.y IS the stateful heading this milestone connects the pure math to');
        assert(!/VehicleMovementController/.test(controllerCodeOnly),
            '30. no second, per-vehicle movement controller was introduced — application/AvatarMovementController.js remains the one movement executor');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        assert(simulationSource.includes('AvatarMovementSteeringSimulation') && simulationSource.includes('resolveMovementHeading'),
            '31. core/AvatarMovementSimulation.js now imports and calls resolveMovementHeading() — this is the "future milestone" tests/AvatarMovementSteeringSimulation.test.js\'s own header originally named as wiring this seam in');

        const capabilitySource = await readFile(new URL('../core/AvatarVehicleMovementCapability.js', import.meta.url), 'utf8');
        assert(!capabilitySource.includes('_currentMovementHeading') && !capabilitySource.includes('currentHeading'),
            '32. core/AvatarVehicleMovementCapability.js still carries no transient current-heading state of any kind — the capability remains immutable; heading remains AvatarPresence\'s own spatial state');
    }

    console.log('✅ All Vehicle Steering State Integration tests passed.');
}

await runTests();
