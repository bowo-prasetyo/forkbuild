import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability, AvatarMovementCapabilityKind } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.97 — Vehicle Movement State Observation Boundary.
//
// 0.9.86 through 0.9.96 gave application/AvatarMovementController.js one
// new piece of transient movement state per milestone — signed current
// speed, braking intent, movement capability — each added because the
// SIMULATION needed it, never because anything OUTSIDE the controller
// could read it. This suite proves the new read-only seam,
// `movementState()`, genuinely closes that gap: a caller driven only
// through the controller's own public methods can now observe the exact
// same facts `tick()` already uses internally, without reaching into a
// private field and without the observation ever calculating or
// reinterpreting anything `_currentMovementState()`/`_currentMovementSpeed`
// did not already establish.
//
//   Section 1:  initial state is observable
//   Section 2:  movement speed is observable
//   Section 3:  signed forward/backward speed is preserved
//   Section 4:  acceleration changes observable speed
//   Section 5:  braking request is observable
//   Section 6:  releasing Control clears brakingRequested
//   Section 7:  steering does not corrupt movement speed
//   Section 8:  capability switching updates capability-derived state
//   Section 9:  unsupported drone remains blocked
//   Section 10: returned state cannot mutate controller state
//   Section 11: repeated observation is deterministic
//   Section 12: existing movement behavior is unchanged
//   Section 13: brakingRequested does not imply movementSpeed is
//               currently decreasing — the exact distinction 0.9.95's
//               own "braking never changes the target, only the rate"
//               semantics require
//   Section 14: architectural sweep — movementState() reads existing
//               fields only, never position, never AvatarPresence
//
// Central architectural claim under test throughout: `movementState()`
// is a pure, read-only VIEW of state this class already owns — it adds
// no new state, no second movement pipeline, and no
// `VehicleMovementState` object; capability-only fields (the active
// capability's own movementSpeed/acceleration/braking/steering/
// movementDirections) are deliberately never exposed through it. See
// docs/Roadmap.md, 0.9.97.

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
    return { avatarProfileUseCase, avatarPresenceSession };
}

function spyFacade() {
    return {
        setLocalAvatar() {}, updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame: () => () => {},
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {},
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        selectBricks() {}, hoverBrick() {}, showPreview() {}, hidePreview() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        setRemoteAvatar() {}, updateRemoteAvatarPresence() {}, removeRemoteAvatar() {},
        setRemoteAvatarsVisible() {},
        dispose() {}
    };
}

function buildSession(registry, avatarProfileUseCase, avatarPresenceSession) {
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = spyFacade();
    session._setupLocalAvatar();
    return session;
}

// The exact discrete "never overshoots" recurrence
// core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()
// itself implements — reproduced here, bit-for-bit the same operations
// in the same order, purely to compute EXPECTED per-tick speeds for this
// file's own assertions. Never imported from production code: this file
// tests the OBSERVATION SEAM, not the already-covered
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

// Runs `controller` for `ticks` steps of `dt` seconds each and returns,
// for every tick, both the SIGNED speed inferred from consecutive Z
// deltas (the direct observable proxy every sibling integration suite
// already uses) and what movementState().movementSpeed reports that
// same tick — so a test can assert the two agree without this file ever
// reaching into `_currentMovementSpeed` itself.
function observeSpeedsAndState(controller, avatarPresenceSession, ticks, dt) {
    const rows = [];
    let previousZ = avatarPresenceSession.current.position.z;
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
        const z = avatarPresenceSession.current.position.z;
        rows.push({ inferredSpeed: (z - previousZ) / dt, state: controller.movementState() });
        previousZ = z;
    }
    return rows;
}

const DT = 0.05; // world seconds/tick — matches every sibling integration suite's own DT
const { NONE, BRAKE } = AvatarVehicleBrakingIntent;

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section 1 — initial state is observable
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        const state = controller.movementState();

        assert(state.direction === 0, '1. a freshly constructed controller observes direction 0');
        assert(state.turnAxis === 0, '2. a freshly constructed controller observes turnAxis 0');
        assert(state.running === false, '3. a freshly constructed controller observes running false');
        assert(state.jumpRequested === false, '4. a freshly constructed controller observes jumpRequested false');
        assert(state.brakingRequested === false, '5. a freshly constructed controller observes brakingRequested false');
        assert(state.movementSpeed === 0, '6. a freshly constructed controller observes movementSpeed 0');
        assert(state.movementCapability === AvatarMovementCapabilityKind.WALK,
            '7. a freshly constructed controller observes movementCapability WALK, the documented default');
    }

    // -------------------------------------------------------------
    // Section 2 — movement speed is observable
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);
        controller.keyDown('w');

        const rows = observeSpeedsAndState(controller, avatarPresenceSession, 80, DT); // past CAR's own 3s ramp
        for (let i = 0; i < rows.length; i++) {
            assert(Math.abs(rows[i].state.movementSpeed - rows[i].inferredSpeed) < 1e-9,
                `8.${i} movementState().movementSpeed agrees with the actual observable position-delta speed, tick ${i}`);
        }
        assert(Math.abs(rows[rows.length - 1].state.movementSpeed - car.movementSpeed) < 1e-9,
            '9. after enough ticks, movementState().movementSpeed reaches CAR\'s own full movementSpeed');
    }

    // -------------------------------------------------------------
    // Section 3 — signed forward/backward speed is preserved
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);
        controller.keyDown('s');

        const rows = observeSpeedsAndState(controller, avatarPresenceSession, 80, DT);
        assert(rows[rows.length - 1].state.movementSpeed < 0,
            '10. holding backward observes a NEGATIVE movementSpeed, never the positive magnitude');
        assert(Math.abs(rows[rows.length - 1].state.movementSpeed - (-car.movementSpeed)) < 1e-9,
            '11. the observed backward speed reaches exactly -movementSpeed, matching the signed convention used everywhere else in this codebase');
    }

    // -------------------------------------------------------------
    // Section 4 — acceleration changes observable speed
    // -------------------------------------------------------------
    {
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-4');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(bicycle);
        controller.keyDown('w');

        const ticks = 30; // well short of BICYCLE's own 2s/40-tick ramp — still genuinely accelerating
        const expected = expectedRampSpeeds(0, bicycle.movementSpeed, bicycle.acceleration.acceleration, DT, ticks);
        let previous = 0;
        for (let i = 0; i < ticks; i++) {
            controller.tick(DT);
            const observed = controller.movementState().movementSpeed;
            assert(Math.abs(observed - expected[i]) < 1e-9,
                `12.${i} movementState().movementSpeed follows BICYCLE's own acceleration ramp exactly, tick ${i}`);
            assert(observed > previous - 1e-9,
                `13.${i} movementState().movementSpeed strictly increases tick over tick while accelerating from rest, tick ${i}`);
            previous = observed;
        }
    }

    // -------------------------------------------------------------
    // Section 5 — braking request is observable
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-5');
        const controller = new AvatarMovementController(avatarPresenceSession);

        assert(controller.movementState().brakingRequested === false, '14. brakingRequested observes false before any braking intent is set');
        controller.setVehicleBrakingIntent(BRAKE);
        assert(controller.movementState().brakingRequested === true, '15. setVehicleBrakingIntent(BRAKE) is immediately observable as brakingRequested true');
        controller.setVehicleBrakingIntent(NONE);
        assert(controller.movementState().brakingRequested === false, '16. setVehicleBrakingIntent(NONE) is immediately observable as brakingRequested false again');
    }

    // -------------------------------------------------------------
    // Section 6 — releasing Control clears brakingRequested, through
    // the REAL keyboard binding (0.9.96), not setVehicleBrakingIntent()
    // called directly
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'obs-6');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        assert(session._avatarMovementController.movementState().brakingRequested === false,
            '17. brakingRequested observes false before Control is ever pressed');

        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.movementState().brakingRequested === true,
            '18. pressing the real Control key is observable as brakingRequested true');

        session.avatarKeyUp('Control');
        assert(session._avatarMovementController.movementState().brakingRequested === false,
            '19. releasing the real Control key is observable as brakingRequested false again');
    }

    // -------------------------------------------------------------
    // Section 7 — steering does not corrupt movement speed
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession: straightSession } = buildAvatarStack(registry, 'obs-7a');
        const { avatarPresenceSession: turningSession } = buildAvatarStack(registry, 'obs-7b');
        const straightController = new AvatarMovementController(straightSession);
        const turningController = new AvatarMovementController(turningSession);
        straightController.setMovementCapability(car);
        turningController.setMovementCapability(car);

        straightController.keyDown('w');
        turningController.keyDown('w');
        turningController.keyDown('a'); // held the entire time — steadily changes heading

        const ticks = 60;
        for (let i = 0; i < ticks; i++) {
            straightController.tick(DT);
            turningController.tick(DT);
            const straightSpeed = straightController.movementState().movementSpeed;
            const turningSpeed = turningController.movementState().movementSpeed;
            assert(Math.abs(straightSpeed - turningSpeed) < 1e-9,
                `20.${i} movementState().movementSpeed is identical whether or not the avatar is simultaneously turning, tick ${i}`);
        }
        assert(turningController.movementState().turnAxis === -1,
            '21. sanity: the turning controller genuinely observes a nonzero turnAxis while this held');
    }

    // -------------------------------------------------------------
    // Section 8 — capability switching updates capability-derived state
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-8');
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.movementState().movementCapability === AvatarMovementCapabilityKind.WALK,
            '22. before any capability is set, movementState().movementCapability observes WALK');

        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        controller.setMovementCapability(bicycle);
        assert(controller.movementState().movementCapability === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '23. mounting a BICYCLE is immediately observable as movementCapability GROUND_VEHICLE');

        controller.keyDown('w');
        for (let i = 0; i < 40; i++) controller.tick(DT); // build up real, nonzero speed
        assert(controller.movementState().movementSpeed > 0, '24. sanity: the bicycle has built up nonzero observable speed');
        controller.keyUp('w');

        const drone = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        controller.setMovementCapability(drone);
        assert(controller.movementState().movementCapability === AvatarMovementCapabilityKind.AERIAL_VEHICLE,
            '25. dismounting onto a DRONE is immediately observable as movementCapability AERIAL_VEHICLE');
        assert(controller.movementState().movementSpeed === 0,
            '26. a genuine capability switch resets the observable movementSpeed to 0, matching setMovementCapability()\'s own 0.9.91 behavior — a fresh ride starts from rest, observably');
    }

    // -------------------------------------------------------------
    // Section 9 — unsupported drone remains blocked, and the
    // observation seam reflects that rather than fabricating movement
    // -------------------------------------------------------------
    {
        const drone = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-9');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(drone);
        controller.keyDown('w');
        controller.setVehicleBrakingIntent(BRAKE);

        for (let i = 0; i < 20; i++) {
            const result = controller.tick(DT);
            assert(result === null, `27.${i} DRONE: tick() keeps returning null — movement stays fully blocked`);
            const state = controller.movementState();
            assert(state.movementCapability === AvatarMovementCapabilityKind.AERIAL_VEHICLE,
                `28.${i} DRONE: movementState() keeps observing AERIAL_VEHICLE`);
            assert(state.movementSpeed === 0,
                `29.${i} DRONE: movementState().movementSpeed stays exactly 0 — it never advances while tick() is blocked`);
            assert(state.direction === 0,
                `30.${i} DRONE: movementState().direction observes 0 even with W held — AERIAL_VEHICLE's own movementDirections permits neither forward nor backward`);
            assert(state.brakingRequested === true,
                `31.${i} DRONE: brakingRequested is still observable as true — a pending braking intent is a fact about INPUT, independent of whether the current capability is supported`);
        }
    }

    // -------------------------------------------------------------
    // Section 10 — returned state cannot mutate controller state
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-10');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);
        controller.keyDown('w');
        for (let i = 0; i < 10; i++) controller.tick(DT);

        const state = controller.movementState();
        assert(Object.isFrozen(state), '32. movementState() returns a frozen object');

        let threw = false;
        try {
            state.movementSpeed = 999999;
        } catch (error) {
            threw = true;
        }
        assert(threw, '33. attempting to mutate a field on the returned state throws (ES module strict mode + a frozen object)');
        assert(state.movementSpeed !== 999999, '34. the mutation attempt did not actually change the returned snapshot');
        assert(controller.movementState().movementSpeed !== 999999,
            '35. the mutation attempt left the CONTROLLER\'s own subsequent observation completely unaffected');

        const before = controller.movementState().brakingRequested;
        try { state.brakingRequested = !before; } catch (error) { /* expected */ }
        assert(controller.movementState().brakingRequested === before,
            '36. mutating a boolean field on a stale snapshot never leaks back into the controller\'s own real brakingRequested');
    }

    // -------------------------------------------------------------
    // Section 11 — repeated observation is deterministic
    // -------------------------------------------------------------
    {
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-11');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(motorcycle);
        controller.keyDown('w');
        controller.keyDown('d');
        for (let i = 0; i < 15; i++) controller.tick(DT);

        const first = controller.movementState();
        for (let i = 0; i < 5; i++) {
            const again = controller.movementState();
            assert(again.direction === first.direction && again.turnAxis === first.turnAxis
                && again.running === first.running && again.jumpRequested === first.jumpRequested
                && again.brakingRequested === first.brakingRequested && again.movementSpeed === first.movementSpeed
                && again.movementCapability === first.movementCapability,
                `37.${i} calling movementState() repeatedly with no intervening tick()/setter call returns identical field values every time`);
        }
    }

    // -------------------------------------------------------------
    // Section 12 — existing movement behavior is unchanged
    // -------------------------------------------------------------
    {
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);

        const { avatarPresenceSession: quietSession } = buildAvatarStack(registry, 'obs-12a');
        const quietController = new AvatarMovementController(quietSession);
        quietController.setMovementCapability(car);
        quietController.keyDown('w');
        quietController.keyDown('d');
        for (let i = 0; i < 50; i++) quietController.tick(DT); // movementState() never called at all

        const { avatarPresenceSession: observedSession } = buildAvatarStack(registry, 'obs-12b');
        const observedController = new AvatarMovementController(observedSession);
        observedController.setMovementCapability(car);
        observedController.keyDown('w');
        observedController.keyDown('d');
        for (let i = 0; i < 50; i++) {
            observedController.tick(DT);
            observedController.movementState(); // called every tick, result discarded
        }

        const quiet = quietSession.current;
        const observed = observedSession.current;
        assert(Math.abs(quiet.position.x - observed.position.x) < 1e-9
            && Math.abs(quiet.position.y - observed.position.y) < 1e-9
            && Math.abs(quiet.position.z - observed.position.z) < 1e-9,
            '38. calling movementState() every tick never changes the resulting position, compared tick-for-tick against an identical run that never calls it');
        assert(Math.abs(quiet.rotation.y - observed.rotation.y) < 1e-9,
            '39. calling movementState() every tick never changes the resulting rotation either');
        assert(quiet.animation === observed.animation,
            '40. calling movementState() every tick never changes the resulting animation');
    }

    // -------------------------------------------------------------
    // Section 13 — brakingRequested does not imply movementSpeed is
    // currently decreasing
    // -------------------------------------------------------------
    {
        // Start from rest, and request BRAKE from the very first tick
        // while ALSO holding W: per 0.9.95's own "braking never changes
        // the target, only the rate" semantics, the target is still
        // +movementSpeed (W's own existing meaning) — only the RATE
        // switches to CAR's own braking rate. Starting below that
        // target, the observable speed genuinely INCREASES tick over
        // tick even while brakingRequested reads true throughout.
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'obs-13');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(car);
        controller.keyDown('w');
        controller.setVehicleBrakingIntent(BRAKE);

        let previousSpeed = 0;
        let sawIncrease = false;
        const ticks = 20; // well short of the ramp completing
        for (let i = 0; i < ticks; i++) {
            controller.tick(DT);
            const state = controller.movementState();
            assert(state.brakingRequested === true, `41.${i} brakingRequested reads true throughout this scenario`);
            if (state.movementSpeed > previousSpeed + 1e-9) sawIncrease = true;
            assert(state.movementSpeed >= previousSpeed - 1e-9,
                `42.${i} movementSpeed never decreases in this scenario, despite brakingRequested being true the whole time`);
            previousSpeed = state.movementSpeed;
        }
        assert(sawIncrease,
            '43. movementSpeed genuinely INCREASED at least once while brakingRequested was true — proving observation never redefines braking as "speed is decreasing," matching 0.9.95\'s own authoritative semantics');
    }

    // -------------------------------------------------------------
    // Section 14 — architectural sweep
    // -------------------------------------------------------------
    {
        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');

        const methodMatch = controllerSource.match(/movementState\(\)\s*\{([\s\S]*?)\n {4}\}/);
        assert(methodMatch !== null, '44. sanity: movementState() exists and is extractable as a single method body');
        const methodBody = methodMatch[1];

        assert(!/_avatarPresenceSession|\.position\b|\.rotation\b/.test(methodBody),
            '45. movementState() never reads AvatarPresence, position, or rotation — it is built entirely from state this controller already tracks, never a position-delta estimate');
        assert(methodBody.includes('_currentMovementState()'),
            '46. movementState() reuses the SAME _currentMovementState() resolution tick() itself already calls into simulateAvatarMovement() with, rather than a second, parallel re-derivation');
        assert(methodBody.includes('_currentMovementSpeed'),
            '47. movementState() reads _currentMovementSpeed directly for movementSpeed, the same transient signed field 0.9.91 introduced');
        assert(methodBody.includes('Object.freeze'),
            '48. movementState() returns a frozen object, matching Section 10\'s own behavioral proof');

        assert(!/\.acceleration\.acceleration|\.braking\.braking|\.steering\.steeringRate|\.movementDirections\b/.test(methodBody),
            '49. movementState() never reads a CAPABILITY-only field (acceleration/braking/steering rate, movementDirections) — those describe what is PERMITTED, not what is happening right now');

        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!controllerCodeOnly.includes('VehicleMovementState') && !controllerCodeOnly.includes('VehicleTelemetry')
            && !controllerCodeOnly.includes('VehicleDashboardState') && !controllerCodeOnly.includes('VehiclePhysicsState'),
            '50. no second, vehicle-specific state class was introduced — the shipped source never mentions VehicleMovementState/VehicleTelemetry/VehicleDashboardState/VehiclePhysicsState');
    }

    console.log('✅ All Avatar Movement State Observation tests passed.');
}

await runTests();
