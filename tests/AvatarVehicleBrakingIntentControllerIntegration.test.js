import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.95 — Vehicle Braking Intent, controller integration.
//
// core/AvatarVehicleBrakingIntent.js (NONE/BRAKE) and
// core/AvatarVehicleBrakingInputAdapter.js (a raw control fact ->
// { brakeRequested }) are both pure and, on their own, prove nothing
// about REAL movement — see each file's own test suite for that half.
// This suite proves the other half: that
// application/AvatarMovementController.js's own new
// `setVehicleBrakingIntent()`/`_resolvedBrakingRequested()` seam
// (0.9.95) genuinely closes the gap `AvatarMovementState.brakingRequested`
// left open since 0.9.92 — a real `AvatarMovementController`, driven only
// through its own public methods, can now make `brakingRequested` true,
// and `core/AvatarMovementSimulation.js`'s own existing braking-rate
// selection (unchanged since 0.9.92) genuinely uses it.
//
//   Section A: controller integration — setVehicleBrakingIntent(BRAKE)
//              genuinely reaches brakingRequested and the braking RATE
//              is used instead of the acceleration rate
//   Section B: BICYCLE/MOTORCYCLE/CAR — each vehicle's own independently
//              declared braking rate (6/9/8) is actually observable
//              through the real controller, not just the acceleration
//              rate reused
//   Section C: direction independence — braking alone (no movement key
//              held) reduces the MAGNITUDE of the current signed speed
//              toward zero, from a positive OR a negative current speed
//              alike, never treating one sign specially
//   Section D: reversal — braking never redefines the TARGET; a held
//              opposite-direction key plus a simultaneous brake request
//              still passes through EXACTLY zero on the way to the
//              reversed target, at the braking rate, never a direct
//              +N -> -N jump
//   Section E: coasting regression — releasing a movement request
//              without ever requesting braking still decays at the
//              ACCELERATION rate, byte-identical to 0.9.91/0.9.92's own
//              controller-level behavior
//   Section F: WALK — instantaneous behavior is completely unchanged,
//              braking requested or not
//   Section G: AERIAL_VEHICLE/DRONE — remains fully blocked regardless
//              of any braking intent
//   Section H: architecture — the controller resolves only the generic
//              brakingRequested fact, never a vehicle identity or
//              mount-state question; the default intent is NONE; no
//              keyboard key was ever bound to it
//
// Central architectural claim under test throughout: BRAKE intent plus
// the ACTIVE CAPABILITY'S OWN braking rate is all that changes how
// quickly the existing, generic movement simulation closes the gap
// toward whatever target movement intent already asked for — never a
// second, vehicle-specific movement pipeline, never a redefinition of
// that target. See docs/Roadmap.md, 0.9.95.

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

// The exact discrete "never overshoots" recurrence
// core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()
// itself implements — reproduced here, bit-for-bit the same operations
// in the same order, purely to compute EXPECTED per-tick speeds for this
// file's own assertions. Never imported from production code: this file
// tests the CONTROLLER INTEGRATION, not the already-covered
// (tests/AvatarMovementAccelerationSimulation.test.js) math itself.
function expectedRampSpeeds(startSpeed, target, rate, dt, ticks) {
    let current = startSpeed;
    const speeds = [];
    for (let i = 0; i < ticks; i++) {
        const maxDelta = rate * dt;
        if (current < target) current = Math.min(current + maxDelta, target);
        else if (current > target) current = Math.max(current - maxDelta, target);
        speeds.push(current);
    }
    return speeds;
}

// Runs `controller` for `ticks` steps of `dt` seconds each, at
// rotationY = 0 the whole time (never turning), and returns the per-tick
// SIGNED speed inferred from consecutive Z deltas (delta / dt) — the
// direct observable proxy for the controller's own internal
// `_currentMovementSpeed`, without ever reading a private field.
// Deliberately does not itself touch keys or braking intent — callers
// drive those explicitly, so a single scenario can freely change either
// mid-sequence (e.g. "cruise, then release and brake").
function observeSpeeds(controller, avatarPresenceSession, ticks, dt) {
    const speeds = [];
    let previousZ = avatarPresenceSession.current.position.z;
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
        const z = avatarPresenceSession.current.position.z;
        speeds.push((z - previousZ) / dt);
        previousZ = z;
    }
    return speeds;
}

const DT = 0.05; // world seconds/tick — matches every sibling integration suite's own DT
const { NONE, BRAKE } = AvatarVehicleBrakingIntent;

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — controller integration: setVehicleBrakingIntent(BRAKE)
    // genuinely reaches brakingRequested, and the braking RATE is used
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-a1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        assert(controller.vehicleBrakingIntent() === NONE,
            '1. a freshly constructed controller starts with vehicleBrakingIntent() === NONE — braking is never engaged by default');

        // Warm up to full cruise speed under ordinary W input, no braking
        // requested at all.
        controller.keyDown('w');
        observeSpeeds(controller, avatarPresenceSession, 70, DT); // 3.5s, past CAR's own 3s ramp (movementSpeed 12 / acceleration 4)
        controller.keyUp('w');

        // Now request braking, with no movement key held — target
        // becomes 0 (exactly as coasting already would), but the RATE
        // switches from CAR's own acceleration (4) to CAR's own braking
        // (8) the instant setVehicleBrakingIntent(BRAKE) is called.
        const cruiseSpeed = car.movementSpeed;
        controller.setVehicleBrakingIntent(BRAKE);
        assert(controller.vehicleBrakingIntent() === BRAKE,
            '2. setVehicleBrakingIntent(BRAKE) is reflected back by vehicleBrakingIntent() immediately');

        const ticks = 40; // 2s — enough to fully decay at either rate
        const observed = observeSpeeds(controller, avatarPresenceSession, ticks, DT);
        const expectedBraking = expectedRampSpeeds(cruiseSpeed, 0, car.braking.braking, DT, ticks);
        const expectedCoasting = expectedRampSpeeds(cruiseSpeed, 0, car.acceleration.acceleration, DT, ticks);

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expectedBraking[i]) < 1e-9,
                `3.${i} CAR: with braking requested, the real controller decays at CAR's own braking rate (8), tick ${i}`);
        }
        assert(observed[0] < expectedCoasting[0],
            '4. CAR: the very first braked tick already decays FASTER than plain coasting would have (braking rate 8 > acceleration rate 4) — this is not merely "released input," it is a genuinely different, faster rate');
        assert(Math.abs(observed[ticks - 1]) < 1e-9,
            '5. CAR: braking eventually reaches exactly 0 and stays there, never overshooting into reverse');
    }

    // -------------------------------------------------------------
    // Section B — BICYCLE/MOTORCYCLE/CAR: each vehicle's own
    // independently declared braking rate is actually observable
    // -------------------------------------------------------------
    for (const [label, vehicleType, index] of [['BICYCLE', VehicleType.BICYCLE, 'b1'], ['MOTORCYCLE', VehicleType.MOTORCYCLE, 'b2'], ['CAR', VehicleType.CAR, 'b3']]) {
        const capability = resolveAvatarVehicleMovementCapability(vehicleType);
        const { avatarPresenceSession } = buildAvatarStack(registry, `brakeint-${index}`);
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(capability);

        controller.keyDown('w');
        const rampTicks = Math.ceil((capability.movementSpeed / capability.acceleration.acceleration) / DT) + 20;
        observeSpeeds(controller, avatarPresenceSession, rampTicks, DT);
        controller.keyUp('w');

        controller.setVehicleBrakingIntent(BRAKE);
        const brakeTicks = Math.ceil((capability.movementSpeed / capability.braking.braking) / DT) + 10;
        const observed = observeSpeeds(controller, avatarPresenceSession, brakeTicks, DT);
        const expected = expectedRampSpeeds(capability.movementSpeed, 0, capability.braking.braking, DT, brakeTicks);

        for (let i = 0; i < brakeTicks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `6.${label}.${i} ${label}: braking decays at exactly its own independently declared braking rate (${capability.braking.braking}), never another vehicle's`);
        }
    }
    {
        // The three braking rates (6/9/8) are mutually distinct, and
        // follow no simple ordering relative to movementSpeed (MOTORCYCLE
        // brakes hardest despite CAR's own higher movementSpeed) — the
        // exact independence core/AvatarVehicleMovementCapability.js's
        // own 0.9.92 header establishes.
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(bicycle.braking.braking === 6 && motorcycle.braking.braking === 9 && car.braking.braking === 8,
            '7. BICYCLE/MOTORCYCLE/CAR braking rates are exactly 6/9/8, matching core/AvatarVehicleMovementCapability.js — MOTORCYCLE brakes hardest despite CAR having the highest movementSpeed');
    }

    // -------------------------------------------------------------
    // Section C — direction independence: braking alone reduces the
    // MAGNITUDE of the current signed speed toward zero, from a positive
    // OR a negative current speed alike
    // -------------------------------------------------------------
    {
        // +10-ish cruise, then brake alone (no key held) -> approaches 0
        // from ABOVE.
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-c1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        controller.keyDown('w');
        observeSpeeds(controller, avatarPresenceSession, 70, DT);
        controller.keyUp('w');
        controller.setVehicleBrakingIntent(BRAKE);
        const observed = observeSpeeds(controller, avatarPresenceSession, 40, DT);
        for (let i = 1; i < observed.length; i++) {
            assert(observed[i] <= observed[i - 1] + 1e-9,
                `8.${i} forward + brake: speed never INCREASES tick over tick while approaching 0 from above`);
        }
        assert(observed.every((speed) => speed >= -1e-9),
            '9. forward + brake: speed never goes negative — it approaches zero, never overshoots into reverse');
        assert(Math.abs(observed[observed.length - 1]) < 1e-9, '10. forward + brake: eventually reaches exactly 0');
    }
    {
        // -10-ish cruise (backward, via S), then brake alone -> approaches
        // 0 from BELOW — the direct mirror image, proving braking is not
        // secretly hard-coded to only ever close a POSITIVE gap.
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-c2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        controller.keyDown('s');
        observeSpeeds(controller, avatarPresenceSession, 70, DT);
        controller.keyUp('s');
        controller.setVehicleBrakingIntent(BRAKE);
        const observed = observeSpeeds(controller, avatarPresenceSession, 40, DT);
        for (let i = 1; i < observed.length; i++) {
            assert(observed[i] >= observed[i - 1] - 1e-9,
                `11.${i} backward + brake: speed never DECREASES tick over tick while approaching 0 from below`);
        }
        assert(observed.every((speed) => speed <= 1e-9),
            '12. backward + brake: speed never goes positive — it approaches zero, never overshoots into forward');
        assert(Math.abs(observed[observed.length - 1]) < 1e-9, '13. backward + brake: eventually reaches exactly 0');
    }

    // -------------------------------------------------------------
    // Section D — reversal: braking never redefines the TARGET; a held
    // opposite-direction key plus a simultaneous brake request still
    // passes through EXACTLY zero, at the braking rate, never a direct
    // +N -> -N jump and never "target = -movementSpeed" on its own
    // -------------------------------------------------------------
    {
        // BICYCLE: movementSpeed 6, braking 6 — chosen so
        // movementSpeed/braking (2s = 40 ticks at this DT) divides
        // evenly by braking*DT (0.3), landing on an EXACT zero tick,
        // mirroring tests/AvatarVehicleAccelerationStateIntegration.test.js's
        // own Section G divisibility choice.
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-d1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(bicycle);

        controller.keyDown('w');
        observeSpeeds(controller, avatarPresenceSession, 60, DT); // 3s, past BICYCLE's own 2s ramp
        controller.keyUp('w');

        // Press S (backward) AND request braking at the same time: the
        // TARGET becomes -movementSpeed (S's own existing meaning, per
        // core/AvatarMovementSimulation.js's own forwardAxis * speed —
        // completely untouched by this milestone), while the RATE
        // switches to BICYCLE's own braking (6), not left at acceleration
        // (3).
        controller.keyDown('s');
        controller.setVehicleBrakingIntent(BRAKE);
        const ticks = 50; // 2.5s — reaches the full -movementSpeed target
        const observed = observeSpeeds(controller, avatarPresenceSession, ticks, DT);
        const expected = expectedRampSpeeds(bicycle.movementSpeed, -bicycle.movementSpeed, bicycle.braking.braking, DT, ticks);

        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `14.${i} BICYCLE reversal+brake: follows the braking-rate recurrence toward -movementSpeed, tick ${i}`);
        }
        assert(observed[0] > 0, '15. BICYCLE reversal+brake: the tick right after pressing S+brake is STILL positive — no instant sign flip');
        const zeroCrossingIndex = observed.findIndex((speed) => Math.abs(speed) < 1e-9);
        assert(zeroCrossingIndex > 0 && zeroCrossingIndex < ticks - 1,
            '16. BICYCLE reversal+brake: the sequence hits EXACTLY 0 at some tick strictly between the first and the last — it genuinely passes through zero, never "BRAKE -> target = -maximum speed" skipping over it');
        assert(observed[zeroCrossingIndex - 1] > 0 && observed[zeroCrossingIndex + 1] < 0,
            '17. BICYCLE reversal+brake: forward, zero, and backward are all actually visited in order around the crossing');
        assert(Math.abs(observed[ticks - 1] - (-bicycle.movementSpeed)) < 1e-9,
            '18. BICYCLE reversal+brake: given enough time, reaches EXACTLY -movementSpeed (BICYCLE\'s own target, from held S) and never overshoots past it');

        // And the braking RATE genuinely differs from what plain
        // acceleration-driven reversal (no brake) would have produced —
        // proving this scenario is not secretly identical to 0.9.91's own
        // reversal behavior.
        const expectedWithoutBrake = expectedRampSpeeds(bicycle.movementSpeed, -bicycle.movementSpeed, bicycle.acceleration.acceleration, DT, ticks);
        assert(Math.abs(observed[5] - expectedWithoutBrake[5]) > 1e-6,
            '19. BICYCLE reversal+brake: at tick 5, the braked reversal has already diverged from what an un-braked (acceleration-rate) reversal would show — braking genuinely changes the closing RATE during a reversal, not just when releasing to 0');
    }

    // -------------------------------------------------------------
    // Section E — coasting regression: releasing a movement request
    // without ever requesting braking still decays at the ACCELERATION
    // rate, byte-identical to 0.9.91/0.9.92's own controller-level
    // behavior
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-e1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        controller.keyDown('w');
        observeSpeeds(controller, avatarPresenceSession, 70, DT);
        controller.keyUp('w');
        // setVehicleBrakingIntent() is deliberately never called at all
        // in this scenario — vehicleBrakingIntent() must still read NONE.
        assert(controller.vehicleBrakingIntent() === NONE,
            '20. coasting regression: vehicleBrakingIntent() stays NONE when setVehicleBrakingIntent() is never called');

        const ticks = 40;
        const observed = observeSpeeds(controller, avatarPresenceSession, ticks, DT);
        const expectedCoasting = expectedRampSpeeds(car.movementSpeed, 0, car.acceleration.acceleration, DT, ticks);
        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expectedCoasting[i]) < 1e-9,
                `21.${i} coasting regression: decays at CAR's own ACCELERATION rate (4), exactly as 0.9.91/0.9.92 already established, tick ${i}`);
        }
    }
    {
        // The identical scenario, but with vehicleBrakingIntent()
        // EXPLICITLY set back to NONE after having been BRAKE earlier —
        // proving release, not merely "never touched," also coasts.
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-e2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);

        controller.setVehicleBrakingIntent(BRAKE);
        assert(controller.vehicleBrakingIntent() === BRAKE, '22. sanity: BRAKE is set');
        controller.setVehicleBrakingIntent(NONE);
        assert(controller.vehicleBrakingIntent() === NONE, '23. explicitly releasing braking intent reads back NONE immediately');

        controller.keyDown('w');
        const ticks = 40;
        const observed = observeSpeeds(controller, avatarPresenceSession, ticks, DT);
        const expected = expectedRampSpeeds(0, car.movementSpeed, car.acceleration.acceleration, DT, ticks);
        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `24.${i} explicit NONE: ramps up at the ACCELERATION rate exactly as if braking had never been requested, tick ${i}`);
        }
    }

    // -------------------------------------------------------------
    // Section F — WALK: instantaneous behavior is completely unchanged,
    // braking requested or not
    // -------------------------------------------------------------
    {
        const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        const { avatarPresenceSession: withoutBrakeSession } = buildAvatarStack(registry, 'brakeint-f1');
        const { avatarPresenceSession: withBrakeSession } = buildAvatarStack(registry, 'brakeint-f2');
        const withoutBrakeController = new AvatarMovementController(withoutBrakeSession);
        const withBrakeController = new AvatarMovementController(withBrakeSession);
        withoutBrakeController.setMovementCapability(walk);
        withBrakeController.setMovementCapability(walk);
        withBrakeController.setVehicleBrakingIntent(BRAKE);

        withoutBrakeController.keyDown('w');
        withBrakeController.keyDown('w');
        const withoutBrake = observeSpeeds(withoutBrakeController, withoutBrakeSession, 5, DT);
        const withBrake = observeSpeeds(withBrakeController, withBrakeSession, 5, DT);
        for (let i = 0; i < 5; i++) {
            assert(Math.abs(withoutBrake[i] - withBrake[i]) < 1e-9,
                `25.${i} WALK: braking requested or not produces byte-identical speed — WALK's own INSTANT braking (rate 0) degrades to the same instant snap-to-target acceleration already used`);
            assert(Math.abs(withBrake[i] - walk.movementSpeed) < 1e-9,
                `26.${i} WALK: still reaches its own full movementSpeed the very same tick, exactly as every milestone before this one`);
        }
    }

    // -------------------------------------------------------------
    // Section G — AERIAL_VEHICLE/DRONE: remains fully blocked regardless
    // of any braking intent
    // -------------------------------------------------------------
    {
        const drone = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-g1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(drone);
        controller.setVehicleBrakingIntent(BRAKE);
        controller.keyDown('w');

        const start = avatarPresenceSession.current.position;
        const startPosition = { x: start.x, y: start.y, z: start.z };
        for (let i = 0; i < 20; i++) {
            const result = controller.tick(DT);
            assert(result === null, `27.${i} DRONE: tick() returns null — movement remains fully blocked regardless of a pending BRAKE intent`);
        }
        const endPosition = avatarPresenceSession.current.position;
        assert(startPosition.x === endPosition.x && startPosition.y === endPosition.y && startPosition.z === endPosition.z,
            '28. DRONE: position never changes, braking intent notwithstanding');
    }

    // -------------------------------------------------------------
    // Section H — architecture: the controller resolves only the
    // generic brakingRequested fact, never a vehicle identity or
    // mount-state question; the default intent is NONE; no keyboard key
    // was ever bound to it
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brakeint-h1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.vehicleBrakingIntent() === NONE,
            '29. a controller that has never had setMovementCapability() OR setVehicleBrakingIntent() called still reports NONE, never crashing or defaulting to BRAKE');

        controller.setVehicleBrakingIntent('garbage');
        assert(controller.vehicleBrakingIntent() === NONE,
            '30. an invalid value passed to setVehicleBrakingIntent() degrades to NONE, the same "degrade gracefully" posture every other pure vocabulary setter in this codebase follows');
        controller.setVehicleBrakingIntent(null);
        assert(controller.vehicleBrakingIntent() === NONE, '31. null degrades to NONE as well');
    }
    {
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');

        // The method body of _resolvedBrakingRequested() itself must
        // read only `_vehicleBrakingIntent` — never `_movementCapability`,
        // never a vehicle type, never a mount-state question — matching
        // the milestone brief's own explicit "should NOT ask isMounted(),
        // vehicleType(), isCar()."
        const methodMatch = controllerSource.match(/_resolvedBrakingRequested\(\)\s*\{([\s\S]*?)\n\s*\}/);
        assert(methodMatch !== null, '32. sanity: _resolvedBrakingRequested() exists and is extractable as a single method body');
        const methodBody = methodMatch[1];
        assert(!methodBody.includes('_movementCapability') && !/isMounted|vehicleType|isCar|VehicleType|VehiclePresence|AvatarVehicleMount/.test(methodBody),
            '33. _resolvedBrakingRequested() reads only _vehicleBrakingIntent — it never asks the active capability, a vehicle type, or a mount-state question');

        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/case\s+'[^']*':\s*this\._keys\.brak/i.test(controllerCodeOnly),
            '34. no key is bound to braking in _setKey() — W/A/S/D/Shift/Space remain the only recognized keys, unchanged by 0.9.95');
        assert(!controllerCodeOnly.includes('setBrakingRequested'),
            '35. no keyboard-facing setBrakingRequested()-style method exists — setVehicleBrakingIntent() takes an already-resolved AvatarVehicleBrakingIntent value, never a raw key or boolean');
        assert(controllerCodeOnly.includes('setVehicleBrakingIntent') && controllerCodeOnly.includes('_resolvedBrakingRequested'),
            '36. sanity: this milestone\'s own two new methods are genuinely present in the shipped source');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        const simulationCodeOnly = simulationSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(simulationCodeOnly),
            '37. core/AvatarMovementSimulation.js still never references BICYCLE/MOTORCYCLE/CAR/DRONE — braking remains vehicle-identity-free, exactly as 0.9.92 established and 0.9.95 leaves untouched');

        // Comments legitimately name these terms when explaining what
        // was deliberately left out (see each file's own "Deliberately
        // excluded" paragraph) — the architectural claim under test is
        // that the CODE never depends on them, matching the "codeOnly"
        // convention tests/AvatarVehicleBrakingIntent.test.js's own
        // Section F and tests/AvatarVehicleBrakingInputAdapter.test.js's
        // own Section G already establish for these two files.
        const intentSource = await readFile(new URL('../core/AvatarVehicleBrakingIntent.js', import.meta.url), 'utf8');
        const intentCodeOnly = intentSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/VehicleType|VehiclePresence|AvatarVehicleMount/.test(intentCodeOnly),
            '38. core/AvatarVehicleBrakingIntent.js\'s own CODE never references VehicleType, VehiclePresence, or AvatarVehicleMount');

        const adapterSource = await readFile(new URL('../core/AvatarVehicleBrakingInputAdapter.js', import.meta.url), 'utf8');
        const adapterCodeOnly = adapterSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/VehicleType|VehiclePresence|AvatarVehicleMount/.test(adapterCodeOnly),
            '39. core/AvatarVehicleBrakingInputAdapter.js\'s own CODE never references VehicleType, VehiclePresence, or AvatarVehicleMount either');
    }

    console.log('✅ All Vehicle Braking Intent Controller Integration tests passed.');
}

await runTests();
