import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { AvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
import { AvatarContinuousMovementMode } from '../core/AvatarContinuousMovementMode.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { VehicleType } from '../core/VehicleType.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import {
    AvatarMovementCapabilityKind,
    resolveAvatarVehicleMovementCapability
} from '../core/AvatarVehicleMovementCapability.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { Position } from '../core/Position.js';

// 0.9.86 — Ground Vehicle Movement Speed Capability.
//
// 0.9.85 (this same file's own predecessor,
// tests/AvatarVehicleMovementCapabilityIntegration.test.js) proved that
// application/AvatarMovementController.js could CONSUME a resolved
// AvatarVehicleMovementCapability, while deliberately keeping
// GROUND_VEHICLE numerically identical to WALK. This milestone makes
// the numeric difference 0.9.85 explicitly deferred: GROUND_VEHICLE now
// moves FASTER than WALK, through the exact same movement pipeline,
// with zero vehicle-specific branching anywhere in the controller.
//
//   Section A: WALK regression — ordinary avatar movement (W/S,
//              running, continuous walk/run, turning, tree collision)
//              is byte-for-byte unaffected by this milestone
//   Section B: GROUND_VEHICLE speed > WALK speed, for identical input
//   Section C: BICYCLE/MOTORCYCLE/CAR all resolve to the exact same
//              GROUND_VEHICLE movement kind, but (0.9.87) now cover
//              strictly increasing ground for identical input —
//              BICYCLE < MOTORCYCLE < CAR
//   Section D: capability switching (WALK -> GROUND_VEHICLE -> WALK)
//              immediately restores the original speed, with no
//              controller reconstruction
//   Section E: running interacts with vehicle speed exactly as it
//              already does with WALK's own speed — the SAME
//              multiplier, never a second "vehicle running" concept
//   Section F: AERIAL_VEHICLE/DRONE remains fully blocked — no speed
//              value, vehicle or otherwise, ever leaks through
//   Section G: determinism — repeated resolution/ticking never drifts
//              the resolved movementSpeed
//   Section H: architectural regression — zero vehicle-specific
//              branching (VehicleType.BICYCLE/MOTORCYCLE/CAR/DRONE, or
//              a movementKind-branched speed multiplier) anywhere in
//              application/AvatarMovementController.js or
//              core/AvatarMovementSimulation.js
//
// Central architectural claim under test throughout: movement
// CAPABILITY, never vehicle IDENTITY, controls movement behavior.
// application/AvatarMovementController.js reads exactly one new number
// off a resolved capability (`movementSpeed`) and hands it to the ONE
// existing simulation function; it still has no idea a bicycle, a
// motorcycle, a car, or a drone exists. See docs/Roadmap.md, 0.9.86.
//
// 0.9.87 note: Section C below now asserts BICYCLE < MOTORCYCLE < CAR
// (core/AvatarVehicleMovementCapability.js now hands each its own
// `movementSpeed`), superseding this file's own original "all three
// produce byte-identical positions" assertion. Section H's own
// architectural regression sweep is otherwise unchanged and still
// passes unmodified — 0.9.87 changed zero lines in
// application/AvatarMovementController.js or
// core/AvatarMovementSimulation.js, exactly as this milestone's own
// brief requires. See docs/Roadmap.md, 0.9.87.

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

function buildAvatarStack(registry, username, startPosition) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, startPosition ? { position: startPosition } : {});
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

function spyFacade() {
    const calls = { updateLocalAvatarPresence: [], onAnimationFrameCallbacks: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
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

// The same real, deterministic bicycle
// tests/AvatarVehicleRuntimeIntegration.test.js and
// tests/AvatarVehicleMovementCapabilityIntegration.test.js already
// anchor on.
const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function findRealTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    return wide[0];
}

// Drives `controller` forward (W held) for `ticks` steps of `dt` seconds
// each, at rotationY = 0 the whole time (no turning), and returns the
// total +Z distance covered — a simple, deterministic "how far did it
// go in this much simulated time" measurement used throughout this file.
function forwardDistance(controller, avatarPresenceSession, ticks, dt) {
    const startZ = avatarPresenceSession.current.position.z;
    controller.keyDown('w');
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
    }
    controller.keyUp('w');
    return avatarPresenceSession.current.position.z - startZ;
}

async function runTests() {
    const registry = buildRegistry();
    const realVehicle = findRealVehicle();
    const realTree = findRealTree();

    // -------------------------------------------------------------
    // Section A — WALK regression
    // -------------------------------------------------------------
    {
        // Two otherwise-identical controllers, one with no capability
        // ever set (the pre-0.9.85 world), one with an EXPLICIT resolved
        // WALK capability applied every tick (the real
        // WorldNavigationSession flow, which resolves and re-applies a
        // capability every animation frame — see that file's own 0.9.85
        // header). Both must cover byte-identical ground.
        const { avatarPresenceSession: defaultSession } = buildAvatarStack(registry, 'speed-a1-default');
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'speed-a1-walk');
        const defaultController = new AvatarMovementController(defaultSession);
        const walkController = new AvatarMovementController(walkSession);
        const walkCapability = resolveAvatarVehicleMovementCapability(VehicleType.NONE);

        defaultController.keyDown('w');
        walkController.keyDown('w');
        for (let i = 0; i < 40; i++) {
            defaultController.tick(0.05);
            walkController.setMovementCapability(walkCapability);
            walkController.tick(0.05);
        }
        assert(Math.abs(defaultSession.current.position.z - walkSession.current.position.z) < 1e-9,
            '1. never setting a capability and explicitly re-applying the resolved WALK capability every tick produce byte-identical positions — this milestone changes nothing about WALK\'s own speed');
    }
    {
        // Ordinary running (Shift+W) still produces exactly RUN_SPEED
        // worth of ground per second under WALK — replaying
        // tests/AvatarMovement.test.js's own flagship comparison, this
        // time through the controller with an explicit WALK capability.
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'speed-a2-walk');
        const { avatarPresenceSession: runSession } = buildAvatarStack(registry, 'speed-a2-run');
        const walkController = new AvatarMovementController(walkSession);
        const runController = new AvatarMovementController(runSession);
        walkController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        runController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        runController.keyDown('shift');

        const walkDistance = forwardDistance(walkController, walkSession, 40, 0.05);
        const runDistance = forwardDistance(runController, runSession, 40, 0.05);
        assert(runDistance > walkDistance, '2. running still covers more ground than walking under an explicit WALK capability');
        assert(Math.abs(runDistance / walkDistance - 2) < 1e-9, '3. running still covers EXACTLY twice the ground walking does — the existing run multiplier, byte-for-byte unchanged');
    }
    {
        // Continuous walk/run (0.9.66/0.9.69), turning, and real tree
        // collision (0.9.63) — all replayed under an explicit WALK
        // capability, exactly as they behaved before this milestone.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'speed-a3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
        const beforeZ = avatarPresenceSession.current.position.z;
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > beforeZ, '4. continuous FORWARD movement still works under an explicit WALK capability');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING, '5. continuous RUN mode still produces RUNNING under an explicit WALK capability');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'speed-a4');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.keyDown('d');
        const beforeRotation = avatarPresenceSession.current.rotation.y || 0;
        controller.tick(0.5);
        assert((avatarPresenceSession.current.rotation.y || 0) !== beforeRotation, '6. turning (A/D) still works under an explicit WALK capability');
        controller.keyUp('d');
    }
    {
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'speed-a5');
        avatarPresenceSession.update({ position: { x: realTree.center.x, y: 0, z: startZ }, rotation: { y: 0 } });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.keyDown('w');
        let everCollided = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.05);
            if (controller.isCollidedWithTree()) everCollided = true;
        }
        assert(everCollided === true, '7. a real deterministic tree still stops the avatar under an explicit WALK capability — this milestone touches nothing about the tree constraint');
        controller.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section B — GROUND_VEHICLE speed > WALK speed
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'speed-b1-walk');
        const { avatarPresenceSession: vehicleSession } = buildAvatarStack(registry, 'speed-b1-vehicle');
        const walkController = new AvatarMovementController(walkSession);
        const vehicleController = new AvatarMovementController(vehicleSession);
        walkController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        vehicleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));

        const walkDistance = forwardDistance(walkController, walkSession, 40, 0.05);
        const vehicleDistance = forwardDistance(vehicleController, vehicleSession, 40, 0.05);
        assert(vehicleDistance > walkDistance, '8. GROUND_VEHICLE (via BICYCLE) covers strictly more ground than WALK for identical input over identical elapsed time');
    }
    {
        // FLAGSHIP — a real avatar, a real WorldNavigationSession, a
        // real deterministic bicycle: mounting it measurably speeds
        // movement up through the actual frame loop, not a synthetic
        // setMovementCapability() call.
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'speed-b2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];

        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '9. FLAGSHIP: pressing E next to the real bicycle mounts it');
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '10. FLAGSHIP: the movement controller reports GROUND_VEHICLE once mounted');

        // A SHORT burst only — dismounting below relies on
        // `AvatarVehicleInteractionController#_findMountedVehicle()`
        // still finding the mounted vehicle within
        // core/AvatarVehicleProximity.js's own VEHICLE_INTERACTION_RADIUS
        // (1.5 world units) of the avatar's CURRENT position (see that
        // controller's own "known boundary" header) — riding far enough
        // away first would make the next dismount attempt a legitimate
        // no-op, unrelated to anything this milestone changes.
        session.avatarKeyDown('w');
        const mountedZ0 = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 5; i++) frameCallback(0.02);
        const mountedDistance = avatarPresenceSession.current.position.z - mountedZ0;
        session.avatarKeyUp('w');

        // Dismount (release + re-press E), then walk the same script.
        session.avatarKeyUp('e');
        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() === null, '11. FLAGSHIP: dismounted again');
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '12. FLAGSHIP: the movement controller reports WALK again once dismounted');

        session.avatarKeyDown('w');
        const walkZ0 = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 5; i++) frameCallback(0.02);
        const walkDistance = avatarPresenceSession.current.position.z - walkZ0;
        session.avatarKeyUp('w');

        // 0.9.91 note: this used to assert `mountedDistance > walkDistance`
        // — true when GROUND_VEHICLE reached its own movementSpeed the
        // instant W was pressed (0.9.86-0.9.90's own world). BICYCLE is
        // now RATE_LIMITED (core/AvatarVehicleMovementCapability.js,
        // 0.9.90): starting from rest, it only overtakes WALK's own
        // already-at-full-speed pace after ramping for a couple of
        // seconds — far longer than the SHORT burst this block is
        // deliberately limited to above (staying within
        // VEHICLE_INTERACTION_RADIUS so the very next dismount attempt
        // still succeeds). That comparison is not this FLAGSHIP's own
        // job to re-prove in the first place — Section B's very first
        // block above (an unconstrained, non-proximity-limited burst)
        // already establishes "GROUND_VEHICLE eventually covers more
        // ground than WALK" directly. What THIS block exists to prove —
        // that a real, mounted `WorldNavigationSession` genuinely moves
        // the avatar through the real frame loop, not a synthetic
        // `setMovementCapability()` call — still holds unchanged.
        assert(mountedDistance > 0,
            '13. FLAGSHIP: the SAME real session, real frame loop, genuinely moves the avatar forward while mounted on the real bicycle');
    }

    // -------------------------------------------------------------
    // Section C — BICYCLE < MOTORCYCLE < CAR (0.9.87)
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession: bicycleSession } = buildAvatarStack(registry, 'speed-c1-bicycle');
        const { avatarPresenceSession: motorcycleSession } = buildAvatarStack(registry, 'speed-c1-motorcycle');
        const { avatarPresenceSession: carSession } = buildAvatarStack(registry, 'speed-c1-car');
        const bicycleController = new AvatarMovementController(bicycleSession);
        const motorcycleController = new AvatarMovementController(motorcycleSession);
        const carController = new AvatarMovementController(carSession);
        bicycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        motorcycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        carController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        assert(
            bicycleController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE
            && motorcycleController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE
            && carController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '14. BICYCLE, MOTORCYCLE, and CAR still all report the exact same GROUND_VEHICLE movement kind through the real movement pipeline — capability and vehicle identity are two different dimensions'
        );

        for (const controller of [bicycleController, motorcycleController, carController]) {
            controller.keyDown('w');
        }
        // 0.9.91 note: bumped from 40 ticks (2s) to 200 (10s). Each
        // GROUND_VEHICLE is now RATE_LIMITED (0.9.90) at its own
        // acceleration — BICYCLE/MOTORCYCLE/CAR reach their own
        // 6/9/12 unit/second movementSpeed after ramping for 2/1.8/3
        // seconds respectively. Over a SHORT window (this assertion's
        // original 2s), MOTORCYCLE's own faster acceleration can
        // legitimately put it ahead of CAR despite CAR's higher eventual
        // top speed — see core/AvatarVehicleMovementCapability.js's own
        // 0.9.90 header ("acceleration is an independent dimension from
        // movementSpeed") and
        // tests/AvatarVehicleAccelerationStateIntegration.test.js's own
        // dedicated coverage of exactly that relationship. This
        // assertion's own claim was always about the EVENTUAL,
        // fully-accelerated ordering (BICYCLE < MOTORCYCLE < CAR, per
        // their own strictly increasing movementSpeed — 0.9.87's own
        // ordering) — a long enough window (10s comfortably outlasts
        // every one of the three ramp times above) is what actually
        // proves that claim now that reaching cruise speed is no longer
        // instantaneous.
        for (let i = 0; i < 200; i++) {
            bicycleController.tick(0.05);
            motorcycleController.tick(0.05);
            carController.tick(0.05);
        }
        const bicycleDistance = bicycleSession.current.position.z;
        const motorcycleDistance = motorcycleSession.current.position.z;
        const carDistance = carSession.current.position.z;
        assert(bicycleDistance < motorcycleDistance && motorcycleDistance < carDistance,
            '14a. as of 0.9.87, BICYCLE < MOTORCYCLE < CAR: for identical input over identical elapsed time, driven through the real movement pipeline (simulateAvatarMovement()), not just by inspecting capability objects — superseding 0.9.86\'s own "all three produce byte-identical positions" behavior');
    }

    // -------------------------------------------------------------
    // Section D — capability switching restores speed immediately
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'speed-d1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        const walkCapability = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        const vehicleCapability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);

        // 0.9.91 note: bumped from 20 ticks (1s) to 60 (3s) per phase.
        // CAR is now RATE_LIMITED (0.9.90), reaching its own 12 unit/
        // second movementSpeed only after ramping at 4 units/second^2 for
        // 3 seconds — a 1s burst from rest still trails WALK's own
        // already-at-3-units/second INSTANT pace. See this file's own
        // Section C note above for the identical reasoning.
        controller.setMovementCapability(walkCapability);
        const walkDistanceBefore = forwardDistance(controller, avatarPresenceSession, 60, 0.05);

        controller.setMovementCapability(vehicleCapability);
        const vehicleDistance = forwardDistance(controller, avatarPresenceSession, 60, 0.05);

        controller.setMovementCapability(walkCapability);
        const walkDistanceAfter = forwardDistance(controller, avatarPresenceSession, 60, 0.05);

        assert(vehicleDistance > walkDistanceBefore, '15. switching WALK -> GROUND_VEHICLE (on the SAME controller instance, no reconstruction) immediately covers more ground');
        assert(Math.abs(walkDistanceAfter - walkDistanceBefore) < 1e-9,
            '16. switching GROUND_VEHICLE -> WALK immediately restores the EXACT original WALK speed — no drift, no residual vehicle influence, no controller reconstruction');
    }

    // -------------------------------------------------------------
    // Section E — running interacts with vehicle speed exactly as it
    // already does with WALK's own speed
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession: walkWalking } = buildAvatarStack(registry, 'speed-e1-walk-walking');
        const { avatarPresenceSession: walkRunning } = buildAvatarStack(registry, 'speed-e1-walk-running');
        const { avatarPresenceSession: vehicleWalking } = buildAvatarStack(registry, 'speed-e1-vehicle-walking');
        const { avatarPresenceSession: vehicleRunning } = buildAvatarStack(registry, 'speed-e1-vehicle-running');

        const walkWalkingController = new AvatarMovementController(walkWalking);
        const walkRunningController = new AvatarMovementController(walkRunning);
        const vehicleWalkingController = new AvatarMovementController(vehicleWalking);
        const vehicleRunningController = new AvatarMovementController(vehicleRunning);

        walkWalkingController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        walkRunningController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        vehicleWalkingController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        vehicleRunningController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));

        walkRunningController.keyDown('shift');
        vehicleRunningController.keyDown('shift');

        // 0.9.91 note: this used to compare TOTAL distance over a single
        // 40-tick (2s) burst from rest. MOTORCYCLE is now RATE_LIMITED
        // (0.9.90): running's own target speed (18 units/second — double
        // the walking target, 9) takes twice as long to actually ramp up
        // to (3.6s) as the walking target does (1.8s), so a from-rest
        // burst's TOTAL distance no longer ratios to an exact 2 — the
        // ramp-up itself contributes a "deficit" that shrinks the
        // observed ratio below 2, exactly the same way Section C's own
        // note above explains for BICYCLE/MOTORCYCLE/CAR. Comparing
        // INCREMENTAL distance AFTER both have already reached their own
        // cruise speed (a warm-up phase, discarded, followed by a
        // measured burst) sidesteps that deficit entirely — once
        // cruising, resolveMovementSpeed() is an exact no-op every tick
        // (currentSpeed === targetSpeed, see
        // core/AvatarMovementAccelerationSimulation.js's own header), so
        // the measured distance is exactly `targetSpeed * measureTime`
        // for both, and the ratio between them is exactly the ratio of
        // their own target speeds — RUN_SPEED_MULTIPLIER, 2, verbatim.
        // WALK's own comparison needs no such warm-up (it has always
        // reached its target the instant a key is pressed), but is
        // driven through the identical warm-up+measure shape below for a
        // true apples-to-apples comparison.
        function warmedUpDistance(controller, session, warmupTicks, measureTicks, dt) {
            controller.keyDown('w');
            for (let i = 0; i < warmupTicks; i++) controller.tick(dt);
            const startZ = session.current.position.z;
            for (let i = 0; i < measureTicks; i++) controller.tick(dt);
            const distance = session.current.position.z - startZ;
            controller.keyUp('w');
            return distance;
        }

        const WARMUP_TICKS = 100; // 5s — comfortably past MOTORCYCLE running's own 3.6s ramp-to-18 time
        const MEASURE_TICKS = 40; // 2s of pure cruise, once warmed up

        const walkWalkingDistance = warmedUpDistance(walkWalkingController, walkWalking, WARMUP_TICKS, MEASURE_TICKS, 0.05);
        const walkRunningDistance = warmedUpDistance(walkRunningController, walkRunning, WARMUP_TICKS, MEASURE_TICKS, 0.05);
        const vehicleWalkingDistance = warmedUpDistance(vehicleWalkingController, vehicleWalking, WARMUP_TICKS, MEASURE_TICKS, 0.05);
        const vehicleRunningDistance = warmedUpDistance(vehicleRunningController, vehicleRunning, WARMUP_TICKS, MEASURE_TICKS, 0.05);

        assert(vehicleRunningDistance > vehicleWalkingDistance, '17. running a mounted ground vehicle still covers more ground than not running it');

        const walkRunMultiplier = walkRunningDistance / walkWalkingDistance;
        const vehicleRunMultiplier = vehicleRunningDistance / vehicleWalkingDistance;
        assert(Math.abs(walkRunMultiplier - vehicleRunMultiplier) < 1e-9,
            '18. running multiplies GROUND_VEHICLE\'s own base speed by the EXACT SAME factor it already multiplies WALK\'s — deterministic, and never a second, independent "vehicle running" concept');

        // And running a vehicle is still governed by the SAME
        // AvatarMovementState.running boolean and the SAME
        // _resolvedRunning() priority rule 0.9.69 already established —
        // continuous RUN mode works identically under GROUND_VEHICLE.
        const { avatarPresenceSession: continuousSession } = buildAvatarStack(registry, 'speed-e2');
        const continuousController = new AvatarMovementController(continuousSession);
        continuousController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        continuousController.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        continuousController.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
        continuousController.tick(0.5);
        assert(continuousSession.current.animation === AvatarAnimationState.RUNNING, '19. continuous RUN mode still resolves to RUNNING under a GROUND_VEHICLE capability');
    }

    // -------------------------------------------------------------
    // Section F — AERIAL_VEHICLE/DRONE remains fully blocked
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'speed-f1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        controller.keyDown('w');
        controller.keyDown('shift');
        const beforePosition = avatarPresenceSession.current.position;
        const before = { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z };
        for (let i = 0; i < 20; i++) controller.tick(0.05);
        const after = avatarPresenceSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '20. AERIAL_VEHICLE/DRONE still blocks movement entirely — no ground-vehicle speed, and no running-doubled ground-vehicle speed, ever leaks through to a supposedly-unsupported capability');
        controller.keyUp('w');
        controller.keyUp('shift');
    }

    // -------------------------------------------------------------
    // Section G — determinism
    // -------------------------------------------------------------
    {
        const capabilityA = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const capabilityB = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(capabilityA === capabilityB && capabilityA.movementSpeed === capabilityB.movementSpeed,
            '21. resolving the same VehicleType twice returns the identical (===) instance, movementSpeed included');

        const { avatarPresenceSession } = buildAvatarStack(registry, 'speed-g1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        let previousZ = avatarPresenceSession.current.position.z;
        controller.keyDown('w');
        for (let i = 0; i < 50; i++) {
            controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
            controller.tick(0.05);
            const currentZ = avatarPresenceSession.current.position.z;
            assert(currentZ > previousZ, `22.${i} each tick still advances position — no stall, no drift, no NaN introduced by repeated re-resolution`);
            previousZ = currentZ;
        }
        controller.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section H — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/AvatarMovementController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(codeOnly),
            '23. application/AvatarMovementController.js never references BICYCLE/MOTORCYCLE/CAR/DRONE — it knows only about a resolved capability\'s own movementSpeed, never which vehicle produced it');
        assert(!codeOnly.includes('GROUND_VEHICLE') && !codeOnly.includes('AERIAL_VEHICLE'),
            '24. application/AvatarMovementController.js never branches on a specific AvatarMovementCapabilityKind value to decide speed — it only ever reads the generic .movementSpeed number');
        assert(!codeOnly.includes('RUN_SPEED') && !codeOnly.includes('WALK_SPEED'),
            '25. application/AvatarMovementController.js still defines no speed constant of its own');
        assert(codeOnly.includes('_resolvedMovementSpeed') && codeOnly.includes('movementSpeed'),
            '26. application/AvatarMovementController.js does expose the _resolvedMovementSpeed() seam this milestone exists to add');
        assert(!/\*\s*2\b|\*=\s*2\b/.test(codeOnly),
            '27. application/AvatarMovementController.js contains no hardcoded "double the speed" arithmetic of its own — running\'s own multiplier still lives entirely in core/AvatarMovementSimulation.js');
    }
    {
        const sourceUrl = new URL('../core/AvatarMovementSimulation.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/VehicleType|BICYCLE|MOTORCYCLE|\bCAR\b|DRONE|GROUND_VEHICLE|AERIAL_VEHICLE/.test(codeOnly),
            '28. core/AvatarMovementSimulation.js never references a vehicle or a capability kind of any kind — it only ever receives a plain movementSpeed number, exactly as it already receives every other parameter');
        assert(codeOnly.includes('movementSpeed'),
            '29. core/AvatarMovementSimulation.js does expose the movementSpeed parameter this milestone adds');
    }
    {
        const sourceUrl = new URL('../core/AvatarVehicleMovementCapability.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('AvatarMovementSimulation') && !codeOnly.includes('AvatarMovementController'),
            '30. core/AvatarVehicleMovementCapability.js still never imports core/AvatarMovementSimulation.js or application/AvatarMovementController.js — the base WALK speed it carries is a documented, independent constant, never a cross-module coupling');
    }

    console.log('✅ All Ground Vehicle Movement Speed Capability Integration tests passed.');
}

await runTests();
