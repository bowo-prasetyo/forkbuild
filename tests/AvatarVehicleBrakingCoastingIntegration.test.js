import { readFile } from 'node:fs/promises';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { resolveMovementSpeed } from '../core/AvatarMovementAccelerationSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
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

// 0.9.92 — Vehicle Braking and Coasting Semantics.
//
// 0.9.90/0.9.91 gave a movement capability an opinion about HOW QUICKLY
// it approaches a HIGHER target speed, and wired that into real,
// key-driven movement. Neither ever distinguished RELEASING a movement
// request (coasting) from an EXPLICIT request to slow down faster
// (braking) — both closed a lower target at the exact same
// `acceleration` rate. This suite covers the seam this milestone adds:
// core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()'s
// own new `braking`/`brakingRequested` parameters, threaded through
// core/AvatarMovementSimulation.js#simulateAvatarMovement() and
// application/AvatarMovementController.js's own new `_resolvedBraking()`
// seam — while proving real, key-driven controller behavior is
// completely untouched, since nothing yet sets `brakingRequested` true
// anywhere in that real pipeline.
//
//   Section A: WALK/DRONE — both remain byte-for-byte unaffected by
//              braking, at the controller level
//   Section B: coasting — releasing a movement request (brakingRequested
//              left at its default, false) decays at the ACCELERATION
//              rate, byte-identical to 0.9.91's own behavior
//   Section C: braking rate — an explicit brakingRequested tick decays
//              at the BRAKING rate instead, strictly faster for every
//              ground vehicle (braking > acceleration, per
//              core/AvatarVehicleMovementCapability.js's own 0.9.92
//              header)
//   Section D: no overshoot in either direction
//   Section E: reversal while braking passes through exactly zero,
//              never a direct sign flip
//   Section F: acceleration/braking independence — the two rates never
//              alter each other, or movementSpeed
//   Section G: determinism
//   Section H: vehicle differentiation — movementSpeed/acceleration/
//              collisionRadius/movementDirections are all completely
//              unchanged by this milestone
//   Section I: real, key-driven controller behavior is byte-for-byte
//              unchanged — brakingRequested is never true anywhere in
//              that pipeline, as of 0.9.92
//   Section J: architectural regression — no vehicle-identity branching,
//              no keyboard binding, no second speed-resolution algorithm
//
// Central architectural claim under test throughout: braking is a
// SECOND RATE, resolved by the SAME `resolveMovementSpeed()` algorithm
// acceleration already uses — never a second simulation engine, and
// never reachable through this codebase's real keyboard input, as of
// 0.9.92. See docs/Roadmap.md, 0.9.92.

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

const DT = 0.05; // world seconds/tick — matches tests/AvatarVehicleAccelerationStateIntegration.test.js's own DT

// Drives simulateAvatarMovement() directly (bypassing any controller or
// keyboard concept entirely) for `ticks` steps of `dt` seconds each, at
// rotationY = 0 the whole time (never turning — so stepDistance lands
// straight on Z), returning the per-tick SIGNED currentMovementSpeed
// core/AvatarMovementSimulation.js itself already returns.
function simulateTicks({ movementSpeed, acceleration, braking, forwardAxis, brakingRequested = false, ticks, dt }) {
    let position = { x: 0, y: 0, z: 0 };
    let verticalVelocity = 0;
    let grounded = true;
    let currentMovementSpeed = 0;
    const speeds = [];
    for (let i = 0; i < ticks; i++) {
        const movementState = new AvatarMovementState({ forwardAxis, brakingRequested });
        const result = simulateAvatarMovement({
            position, rotationY: 0, verticalVelocity, grounded, movementState, deltaSeconds: dt,
            movementSpeed, acceleration, braking, currentMovementSpeed
        });
        speeds.push(result.currentMovementSpeed);
        position = result.position;
        verticalVelocity = result.verticalVelocity;
        grounded = result.grounded;
        currentMovementSpeed = result.currentMovementSpeed;
    }
    return speeds;
}

// The discrete "never overshoots" recurrence resolveMovementSpeed()
// itself implements — reproduced here, purely to compute EXPECTED
// per-tick speeds. Never imported from production code.
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

async function runTests() {
    const registry = buildRegistry();
    const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
    const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
    const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);

    // -------------------------------------------------------------
    // Section A — WALK/DRONE, at the controller level, unaffected
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brake-a1-walk');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(walk);
        controller.keyDown('w');
        controller.tick(DT);
        const zAfterFirstTick = avatarPresenceSession.current.position.z;
        assert(Math.abs((zAfterFirstTick / DT) - 3) < 1e-9,
            '1. WALK: the first tick already moves at the full WALK_SPEED (3) — INSTANT means instant, braking or not (WALK\'s own braking is INSTANT/0 too, per core/AvatarVehicleMovementCapability.js\'s own 0.9.92 header)');
        controller.keyUp('w');
        controller.tick(DT);
        assert(avatarPresenceSession.current.position.z === zAfterFirstTick,
            '2. WALK: releasing W still stops movement outright on the very next tick — no residual coasting, exactly as before this milestone');

        const { avatarPresenceSession: droneSession } = buildAvatarStack(registry, 'brake-a2-drone');
        const droneController = new AvatarMovementController(droneSession);
        droneController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        const beforePosition = droneSession.current.position;
        const before = { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z };
        droneController.keyDown('w');
        for (let i = 0; i < 20; i++) droneController.tick(DT);
        const after = droneSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '3. DRONE: remains fully blocked by tick()\'s own supported:false guard — no braking state, resolved or otherwise, is ever consulted for it');
        droneController.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section B — coasting decays at the ACCELERATION rate
    // -------------------------------------------------------------
    {
        // Warm up CAR to full cruise, then release forward input
        // entirely (brakingRequested left at its default, false) — the
        // resulting decay must be byte-identical to 0.9.91's own
        // acceleration-only recurrence.
        const warmup = simulateTicks({ movementSpeed: car.movementSpeed, acceleration: car.acceleration.acceleration, braking: car.braking.braking, forwardAxis: 1, ticks: 80, dt: DT });
        assert(Math.abs(warmup[warmup.length - 1] - car.movementSpeed) < 1e-9, 'pre-4. sanity: CAR reaches full cruise speed after warmup');

        // Continue from cruise, forwardAxis 0, brakingRequested omitted.
        let position = { x: 0, y: 0, z: 0 };
        let verticalVelocity = 0;
        let grounded = true;
        let currentMovementSpeed = car.movementSpeed;
        const coastSpeeds = [];
        const ticks = 80;
        for (let i = 0; i < ticks; i++) {
            const result = simulateAvatarMovement({
                position, rotationY: 0, verticalVelocity, grounded,
                movementState: new AvatarMovementState({ forwardAxis: 0 }),
                deltaSeconds: DT, movementSpeed: car.movementSpeed,
                acceleration: car.acceleration.acceleration, braking: car.braking.braking,
                currentMovementSpeed
            });
            coastSpeeds.push(result.currentMovementSpeed);
            position = result.position; verticalVelocity = result.verticalVelocity;
            grounded = result.grounded; currentMovementSpeed = result.currentMovementSpeed;
        }
        const expected = expectedRampSpeeds(car.movementSpeed, 0, car.acceleration.acceleration, DT, ticks);
        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(coastSpeeds[i] - expected[i]) < 1e-9,
                `4.${i} CAR: coasting (no brakingRequested) decays at the ACCELERATION rate — byte-identical to 0.9.91's own recurrence, tick ${i}`);
        }
        assert(Math.abs(coastSpeeds[ticks - 1]) < 1e-9, '5. CAR: coasting reaches exactly 0, never negative, merely from releasing forward input');
    }

    // -------------------------------------------------------------
    // Section C — an explicit brake request decays at the BRAKING rate
    // -------------------------------------------------------------
    {
        let position = { x: 0, y: 0, z: 0 };
        let verticalVelocity = 0;
        let grounded = true;
        let currentMovementSpeed = car.movementSpeed; // start from cruise, as if already warmed up
        const brakeSpeeds = [];
        const ticks = 80;
        for (let i = 0; i < ticks; i++) {
            const result = simulateAvatarMovement({
                position, rotationY: 0, verticalVelocity, grounded,
                movementState: new AvatarMovementState({ forwardAxis: 0, brakingRequested: true }),
                deltaSeconds: DT, movementSpeed: car.movementSpeed,
                acceleration: car.acceleration.acceleration, braking: car.braking.braking,
                currentMovementSpeed
            });
            brakeSpeeds.push(result.currentMovementSpeed);
            position = result.position; verticalVelocity = result.verticalVelocity;
            grounded = result.grounded; currentMovementSpeed = result.currentMovementSpeed;
        }
        const expected = expectedRampSpeeds(car.movementSpeed, 0, car.braking.braking, DT, ticks);
        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(brakeSpeeds[i] - expected[i]) < 1e-9,
                `6.${i} CAR: an explicit brake request decays at the BRAKING rate, tick ${i}`);
        }
        assert(Math.abs(brakeSpeeds[ticks - 1]) < 1e-9, '7. CAR: braking reaches exactly 0, never negative or oscillating past it');

        // CAR's own braking (8) is strictly greater than its own
        // acceleration (4) — braking must reach 0 in STRICTLY FEWER
        // ticks than coasting does from the identical starting speed.
        const coastTicksToStop = expectedRampSpeeds(car.movementSpeed, 0, car.acceleration.acceleration, DT, ticks).findIndex((s) => s === 0);
        const brakeTicksToStop = brakeSpeeds.findIndex((s) => s === 0);
        assert(brakeTicksToStop >= 0 && coastTicksToStop >= 0 && brakeTicksToStop < coastTicksToStop,
            '8. CAR: braking (rate 8) reaches a full stop in strictly fewer ticks than coasting (rate 4) from the same starting speed — braking genuinely sheds speed faster');
    }

    // -------------------------------------------------------------
    // Section D — no overshoot, either direction
    // -------------------------------------------------------------
    {
        assert(resolveMovementSpeed({ currentSpeed: 2, targetSpeed: 0, acceleration: 4, braking: 100, brakingRequested: true, deltaTime: 1 }) === 0,
            '9. a very large braking rate lands exactly at 0, never a negative speed');
        assert(resolveMovementSpeed({ currentSpeed: -2, targetSpeed: 0, acceleration: 4, braking: 100, brakingRequested: true, deltaTime: 1 }) === 0,
            '10. a very large braking rate closing a gap from BELOW zero also lands exactly at 0, never overshooting positive');
    }

    // -------------------------------------------------------------
    // Section E — reversal while braking passes through exactly zero
    // -------------------------------------------------------------
    {
        const speeds = simulateTicks({
            movementSpeed: bicycle.movementSpeed, acceleration: bicycle.acceleration.acceleration, braking: bicycle.braking.braking,
            forwardAxis: -1, brakingRequested: true, ticks: 40, dt: DT
        });
        // Starting from rest (currentMovementSpeed=0 at tick 0), the
        // target is -movementSpeed the whole time, braking requested
        // throughout — never a jump straight from a positive value to a
        // negative one (there is none here to reverse FROM, but the
        // sequence itself must still cross zero exactly, never skip it).
        assert(speeds[0] < 0 && speeds[0] > -bicycle.movementSpeed, '11. BICYCLE: the first braking tick toward reverse is a genuine partial step, never an instant jump to full reverse');
        assert(Math.abs(speeds[speeds.length - 1] - (-bicycle.movementSpeed)) < 1e-9, '12. BICYCLE: given enough time, reaches exactly -movementSpeed and never overshoots past it');

        // Now cruise forward first, THEN reverse while braking — proves
        // the reversal genuinely passes through zero, never a direct
        // sign flip, exactly like the pure-math coverage in
        // tests/AvatarMovementAccelerationSimulation.test.js's own
        // Section I, now observed through the real simulation function.
        let position = { x: 0, y: 0, z: 0 };
        let verticalVelocity = 0;
        let grounded = true;
        let currentMovementSpeed = 0;
        for (let i = 0; i < 60; i++) { // warm up to +cruise
            const result = simulateAvatarMovement({
                position, rotationY: 0, verticalVelocity, grounded,
                movementState: new AvatarMovementState({ forwardAxis: 1 }),
                deltaSeconds: DT, movementSpeed: bicycle.movementSpeed,
                acceleration: bicycle.acceleration.acceleration, braking: bicycle.braking.braking,
                currentMovementSpeed
            });
            position = result.position; verticalVelocity = result.verticalVelocity;
            grounded = result.grounded; currentMovementSpeed = result.currentMovementSpeed;
        }
        assert(Math.abs(currentMovementSpeed - bicycle.movementSpeed) < 1e-9, 'pre-13. sanity: BICYCLE reached full +cruise speed');

        const reversalSpeeds = [];
        for (let i = 0; i < 40; i++) {
            const result = simulateAvatarMovement({
                position, rotationY: 0, verticalVelocity, grounded,
                movementState: new AvatarMovementState({ forwardAxis: -1, brakingRequested: true }),
                deltaSeconds: DT, movementSpeed: bicycle.movementSpeed,
                acceleration: bicycle.acceleration.acceleration, braking: bicycle.braking.braking,
                currentMovementSpeed
            });
            reversalSpeeds.push(result.currentMovementSpeed);
            position = result.position; verticalVelocity = result.verticalVelocity;
            grounded = result.grounded; currentMovementSpeed = result.currentMovementSpeed;
        }
        assert(reversalSpeeds[0] > 0, '13. BICYCLE: the tick right after requesting reverse-while-braking is STILL positive — momentum does not vanish instantly');
        const zeroCrossingIndex = reversalSpeeds.findIndex((s) => Math.abs(s) < 1e-9);
        assert(zeroCrossingIndex > 0 && zeroCrossingIndex < reversalSpeeds.length - 1,
            '14. BICYCLE: the sequence hits EXACTLY 0 at some tick strictly between the first and the last — genuinely passing through zero, never skipping over it');
        for (let i = 1; i < reversalSpeeds.length; i++) {
            const wasPositive = reversalSpeeds[i - 1] > 0;
            const isNegative = reversalSpeeds[i] < 0;
            if (wasPositive && isNegative) {
                assert(Math.abs(reversalSpeeds[i - 1]) < 1e-9 || Math.abs(reversalSpeeds[i]) < 1e-9,
                    `15.${i} BICYCLE: no tick jumps directly from positive to negative without visiting (approximately) exactly 0, even under braking`);
            }
        }
    }

    // -------------------------------------------------------------
    // Section F — acceleration/braking independence
    // -------------------------------------------------------------
    {
        assert(car.braking.braking > car.acceleration.acceleration, '16. CAR: braking is strictly greater than acceleration');
        assert(bicycle.braking.braking > bicycle.acceleration.acceleration, '17. BICYCLE: braking is strictly greater than acceleration');
        // Changing which rate is used this tick never alters the OTHER
        // rate's own value, or movementSpeed — the three remain
        // completely independent, read-only capability fields.
        assert(car.movementSpeed === 12 && car.acceleration.acceleration === 4 && car.braking.braking === 8,
            '18. CAR: movementSpeed/acceleration/braking are three independent numbers, none derived from the others at read time');
    }

    // -------------------------------------------------------------
    // Section G — determinism
    // -------------------------------------------------------------
    {
        for (let i = 0; i < 5; i++) {
            const speeds = simulateTicks({ movementSpeed: car.movementSpeed, acceleration: car.acceleration.acceleration, braking: car.braking.braking, forwardAxis: 0, brakingRequested: true, ticks: 3, dt: DT });
            // currentMovementSpeed starts at 0 every fresh call, so
            // braking toward a target of 0 (also 0) is an exact no-op
            // every tick — the identical result every single run.
            assert(JSON.stringify(speeds) === JSON.stringify([0, 0, 0]), `19.${i} identical inputs always produce the identical result`);
        }
    }

    // -------------------------------------------------------------
    // Section H — vehicle differentiation is unchanged by this milestone
    // -------------------------------------------------------------
    {
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const drone = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        assert(walk.movementSpeed === 3 && bicycle.movementSpeed === 6 && motorcycle.movementSpeed === 9 && car.movementSpeed === 12,
            '20. movementSpeed values are exactly what 0.9.87 established, untouched by this milestone');
        assert(walk.acceleration.acceleration === 0 && bicycle.acceleration.acceleration === 3 && motorcycle.acceleration.acceleration === 5 && car.acceleration.acceleration === 4,
            '21. acceleration values are exactly what 0.9.90 established, untouched by this milestone');
        assert(walk.collisionRadius === 0.35 && bicycle.collisionRadius === 0.45 && motorcycle.collisionRadius === 0.55 && car.collisionRadius === 0.80,
            '22. collisionRadius values are exactly what 0.9.88 established, untouched by this milestone');
        assert(walk.movementDirections.forward === true && walk.movementDirections.backward === true && drone.movementDirections.forward === false && drone.movementDirections.backward === false,
            '23. movementDirections values are exactly what 0.9.89 established, untouched by this milestone');
        assert(drone.supported === false, '24. DRONE remains unsupported, untouched by this milestone');
    }

    // -------------------------------------------------------------
    // Section I — real, key-driven controller behavior is unchanged
    //
    // 0.9.95 UPDATE: as of 0.9.92, this section's own title was true for
    // a stronger reason than it is now — `_currentMovementState()` had
    // no source for `brakingRequested` at all, so it was UNCONDITIONALLY
    // false. 0.9.95 (core/AvatarVehicleBrakingIntent.js +
    // application/AvatarMovementController.js's own new
    // `setVehicleBrakingIntent()`/`_resolvedBrakingRequested()`) gives it
    // a real source — but that source is a dedicated method call, never
    // a keyboard key. The scenario below calls ONLY `keyDown('w')`/
    // `keyUp('w')`, exactly as it always has, and never calls
    // `setVehicleBrakingIntent()` — so `_vehicleBrakingIntent` stays at
    // its own default, `AvatarVehicleBrakingIntent.NONE`, and
    // `brakingRequested` resolves `false` throughout, exactly as before
    // 0.9.95 existed. This section's title, and every assertion below,
    // therefore remains true — see
    // tests/AvatarVehicleBrakingIntentControllerIntegration.test.js
    // (0.9.95's own new suite) for the scenarios where
    // `setVehicleBrakingIntent()` genuinely IS called.
    // -------------------------------------------------------------
    {
        // The exact CAR ramp scenario tests/AvatarVehicleAccelerationStateIntegration.test.js's
        // own Section D already proves — reproduced here through a
        // controller built AFTER this milestone's own changes, to prove
        // 0.9.92 changed nothing about it: braking is fully wired, but
        // brakingRequested is never true anywhere `_currentMovementState()`
        // produces (as of 0.9.95: because `setVehicleBrakingIntent()` is
        // never called in this scenario — see the 0.9.95 update above),
        // so every tick still resolves through the ACCELERATION branch
        // exactly as before.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'brake-i1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);
        controller.keyDown('w');
        const ticks = 80;
        let previousZ = 0;
        const observed = [];
        for (let i = 0; i < ticks; i++) {
            controller.tick(DT);
            const z = avatarPresenceSession.current.position.z;
            observed.push((z - previousZ) / DT);
            previousZ = z;
        }
        controller.keyUp('w');
        const expected = expectedRampSpeeds(0, car.movementSpeed, car.acceleration.acceleration, DT, ticks);
        for (let i = 0; i < ticks; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-9,
                `25.${i} CAR, real controller: still ramps at the ACCELERATION rate exactly as 0.9.91 established — braking is wired but never engages through real key input`);
        }
    }

    // -------------------------------------------------------------
    // Section J — architectural regression
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(controllerCodeOnly),
            '26. application/AvatarMovementController.js never references BICYCLE/MOTORCYCLE/CAR/DRONE — it knows only about a resolved capability\'s own generic braking.braking number');
        assert(!controllerCodeOnly.includes('AvatarMovementBrakingKind') && !/\bbraking\.kind\b/.test(controllerCodeOnly),
            '27. application/AvatarMovementController.js never reads AvatarMovementBrakingCapability\'s own .kind — the bare braking rate alone already carries the distinction');
        assert(controllerCodeOnly.includes('_resolvedBraking'),
            '28. application/AvatarMovementController.js exposes the _resolvedBraking() seam this milestone adds');
        // 29. AS OF 0.9.92, `application/AvatarMovementController.js`
        // never set `movementState.brakingRequested` anywhere — this
        // exact assertion (`!controllerCodeOnly.includes('brakingRequested')`)
        // was this suite's own proof of that. 0.9.95
        // (core/AvatarVehicleBrakingIntent.js's own controller
        // integration) deliberately makes that literal string appear —
        // `_currentMovementState()` now builds `brakingRequested:
        // this._resolvedBrakingRequested()` — so the ORIGINAL assertion
        // would now be a false claim about the current architecture, not
        // a true regression check. Updated in place, matching this
        // codebase's own precedent (see docs/Roadmap.md, 0.9.94, Section
        // H "now proves the OPPOSITE of its 0.9.93 claim"): the new
        // regression check the milestone brief actually cares about
        // going forward is the one 30/31 already establish below — no
        // KEYBOARD key drives braking — which stays completely true
        // after 0.9.95.
        assert(controllerCodeOnly.includes('_resolvedBrakingRequested') && controllerCodeOnly.includes('setVehicleBrakingIntent'),
            '29. application/AvatarMovementController.js gained a genuine brakingRequested source in 0.9.95 (_resolvedBrakingRequested()/setVehicleBrakingIntent()) — see tests/AvatarVehicleBrakingIntentControllerIntegration.test.js for full coverage of that seam');
        assert(!/setBrakingRequested/.test(controllerCodeOnly),
            '30. no keyboard-facing setter literally named setBrakingRequested was added — 0.9.95\'s own setVehicleBrakingIntent() takes an already-resolved AvatarVehicleBrakingIntent value, never a raw key or boolean');
        assert(!/case\s+'[^']*':\s*this\._keys\.brak/i.test(controllerCodeOnly),
            '31. no key is bound to braking in _setKey() — W/A/S/D/Shift/Space remain the only recognized keys, unchanged by 0.9.95');

        const simulationSource = await readFile(new URL('../core/AvatarMovementSimulation.js', import.meta.url), 'utf8');
        const simulationCodeOnly = simulationSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(simulationCodeOnly),
            '32. core/AvatarMovementSimulation.js never references BICYCLE/MOTORCYCLE/CAR/DRONE either — braking, like acceleration before it, is vehicle-identity-free');
        assert(simulationCodeOnly.includes('braking') && simulationCodeOnly.includes('brakingRequested'),
            '33. core/AvatarMovementSimulation.js is the ONE place braking is actually threaded into resolveMovementSpeed(), exactly where acceleration already is');

        const mathSource = await readFile(new URL('../core/AvatarMovementAccelerationSimulation.js', import.meta.url), 'utf8');
        const mathExports = Object.keys(await import('../core/AvatarMovementAccelerationSimulation.js')).sort();
        assert(JSON.stringify(mathExports) === JSON.stringify(['resolveMovementSpeed']),
            '34. braking was folded into the SAME resolveMovementSpeed() function — no second "resolveMovementSpeedWithBraking" or parallel braking-simulation engine exists (this milestone\'s own "ONE speed-resolution algorithm" brief)');
        assert(mathSource.includes('brakingRequested'), '35. sanity: the pure math file genuinely carries the new parameter');

        const capabilitySource = await readFile(new URL('../core/AvatarVehicleMovementCapability.js', import.meta.url), 'utf8');
        const capabilityCodeOnly = capabilitySource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!capabilityCodeOnly.includes('_currentMovementSpeed') && !capabilityCodeOnly.includes('currentSpeed') && !capabilityCodeOnly.includes('brakingRequested'),
            '36. core/AvatarVehicleMovementCapability.js still carries no transient current-speed or brakingRequested state of any kind (comments aside — this is a CODE-only sweep) — the capability remains immutable and stateless');
    }

    console.log('✅ All Vehicle Braking and Coasting Integration tests passed.');
}

await runTests();
