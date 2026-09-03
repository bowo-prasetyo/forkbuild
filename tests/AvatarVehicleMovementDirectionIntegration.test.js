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

// 0.9.89 — Vehicle Movement Direction Semantics.
//
// 0.9.84-0.9.88 answered "how fast" and "how much space" a mounted
// vehicle relationship implies, and consumed both through the ONE
// existing AvatarMovementController pipeline. This milestone adds a
// third capability dimension — WHICH directions the avatar's existing
// forward/backward input is currently allowed to produce — and proves
// the ONE new consumer it needs: `AvatarMovementController#
// _resolvedForwardAxis()`'s own new capability-gated guard.
//
//   Section A: WALK regression — ordinary forward AND backward
//              movement (W and S, held and via continuous intent) is
//              byte-for-byte unaffected by this milestone
//   Section B: BICYCLE — forward accepted, backward accepted
//   Section C: MOTORCYCLE — forward accepted, backward accepted
//   Section D: CAR — forward accepted, backward accepted
//   Section E: DRONE — remains fully blocked; movement never leaks
//              through even though its own movementDirections values
//              are both false
//   Section F: vehicle switching — WALK -> BICYCLE -> MOTORCYCLE ->
//              CAR -> WALK produces deterministic forward/backward
//              behavior at every step
//   Section G: a capability that disallows one direction blocks
//              exactly that direction, both for ordinary held keys and
//              for continuous movement intent, while leaving the other
//              direction, turning, running, and animation untouched
//   Section H: existing speed (0.9.86/0.9.87) and collision radius
//              (0.9.88) behavior is completely unaffected by this
//              milestone
//   Section I: determinism — repeated resolution/ticking never drifts
//              the resolved movementDirections
//   Section J: architectural regression — no vehicle-specific
//              branching, no left/right vocabulary, and exactly one
//              movement controller anywhere this milestone touches
//
// Central architectural claim under test throughout: a disallowed
// direction reads as "that key was never pressed" — never a collision,
// never a block flag, never the opposite direction — and every
// currently-defined, SUPPORTED capability (WALK, BICYCLE, MOTORCYCLE,
// CAR) still permits both directions, so this milestone changes no
// observable behavior yet; it only adds the seam a future milestone can
// use to say no. See docs/Roadmap.md, 0.9.89.

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

// Drives `controller` in one direction ('w' or 's') for `ticks` steps of
// `dt` seconds each, at rotationY = 0 the whole time, and returns the
// signed Z displacement — positive for forward, negative for backward,
// ~0 when the capability disallows the pressed direction outright.
function drive(controller, avatarPresenceSession, key, ticks, dt) {
    const startZ = avatarPresenceSession.current.position.z;
    controller.keyDown(key);
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
    }
    controller.keyUp(key);
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
        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-a1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        const forwardDistance = drive(controller, avatarPresenceSession, 'w', 20, 0.05);
        assert(forwardDistance > 0, '1. ordinary forward (W) movement, with no capability ever set, still works exactly as before this milestone');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-a2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        const backwardDistance = drive(controller, avatarPresenceSession, 's', 20, 0.05);
        assert(backwardDistance < 0, '2. ordinary backward (S) movement, with no capability ever set, still works exactly as before this milestone');
    }
    {
        // Explicit WALK capability, both directions.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-a3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        const forwardDistance = drive(controller, avatarPresenceSession, 'w', 20, 0.05);
        assert(forwardDistance > 0, '3. forward still works under an explicit WALK capability');
        const backwardDistance = drive(controller, avatarPresenceSession, 's', 20, 0.05);
        assert(backwardDistance < 0, '4. backward still works under an explicit WALK capability');
    }
    {
        // Continuous movement intent, both directions, under WALK.
        const { avatarPresenceSession: forwardSession } = buildAvatarStack(registry, 'dir-a4-forward');
        const { avatarPresenceSession: backwardSession } = buildAvatarStack(registry, 'dir-a4-backward');
        const forwardController = new AvatarMovementController(forwardSession);
        const backwardController = new AvatarMovementController(backwardSession);
        forwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        backwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        forwardController.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        backwardController.setContinuousMovementIntent(AvatarContinuousMovementIntent.BACKWARD);
        forwardController.tick(0.5);
        backwardController.tick(0.5);
        assert(forwardSession.current.position.z > 0, '5. continuous FORWARD intent still works under an explicit WALK capability');
        assert(backwardSession.current.position.z < 0, '6. continuous BACKWARD intent still works under an explicit WALK capability');
    }
    {
        // Real tree collision (0.9.63) untouched.
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-a5');
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
    // Section B — bicycle
    // -------------------------------------------------------------
    {
        // 0.9.91 note: forward and backward are now driven on TWO
        // separate controllers, each starting from rest — BICYCLE is
        // RATE_LIMITED (0.9.90), so a controller that just spent 20
        // ticks accelerating forward still carries real positive
        // `_currentMovementSpeed` residual; reusing it immediately for
        // "backward" would spend the SAME window mostly decelerating
        // that residual back through zero (see the milestone's own
        // "passes through zero, never jumps" design — application/AvatarMovementController.js's
        // own 0.9.91 header) rather than genuinely moving backward. This
        // section's own concern is direction PERMISSION (0.9.89), not
        // deceleration timing — a fresh controller per direction removes
        // that unrelated confound entirely.
        const { avatarPresenceSession: forwardSession } = buildAvatarStack(registry, 'dir-b1-forward');
        const { avatarPresenceSession: backwardSession } = buildAvatarStack(registry, 'dir-b1-backward');
        const forwardController = new AvatarMovementController(forwardSession);
        const backwardController = new AvatarMovementController(backwardSession);
        forwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        backwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        const forwardDistance = drive(forwardController, forwardSession, 'w', 20, 0.05);
        assert(forwardDistance > 0, '8. BICYCLE — forward is accepted');
        const backwardDistance = drive(backwardController, backwardSession, 's', 20, 0.05);
        assert(backwardDistance < 0, '9. BICYCLE — backward is accepted');
    }
    {
        // FLAGSHIP — a real avatar, a real WorldNavigationSession, a
        // real deterministic bicycle: both directions work through the
        // actual frame loop once mounted.
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'dir-b2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];

        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '10. FLAGSHIP: pressing E next to the real bicycle mounts it');
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '11. FLAGSHIP: the movement controller reports GROUND_VEHICLE once mounted');

        session.avatarKeyDown('w');
        const forwardZ0 = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 5; i++) frameCallback(0.02);
        const forwardDistance = avatarPresenceSession.current.position.z - forwardZ0;
        session.avatarKeyUp('w');
        assert(forwardDistance > 0, '12. FLAGSHIP: forward moves the avatar while genuinely mounted on the real bicycle');

        // 0.9.91 note: bumped from 5 frames (0.1s) to 30 (0.6s). BICYCLE
        // is now RATE_LIMITED (0.9.90): the forward burst just above
        // leaves real positive `_currentMovementSpeed` residual, and
        // reversing direction must decelerate THROUGH zero before making
        // genuine backward progress (see application/AvatarMovementController.js's
        // own 0.9.91 header) — a longer window gives it time to actually
        // cross zero and accumulate net negative displacement, not just
        // cancel the forward residual.
        session.avatarKeyDown('s');
        const backwardZ0 = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 30; i++) frameCallback(0.02);
        const backwardDistance = avatarPresenceSession.current.position.z - backwardZ0;
        session.avatarKeyUp('s');
        assert(backwardDistance < 0, '13. FLAGSHIP: backward also moves the avatar while genuinely mounted on the real bicycle');
    }

    // -------------------------------------------------------------
    // Section C — motorcycle
    // -------------------------------------------------------------
    {
        // 0.9.91 note: see Section B's own note above — two fresh
        // controllers avoid the forward-then-backward residual-speed
        // confound now that MOTORCYCLE is RATE_LIMITED (0.9.90).
        const { avatarPresenceSession: forwardSession } = buildAvatarStack(registry, 'dir-c1-forward');
        const { avatarPresenceSession: backwardSession } = buildAvatarStack(registry, 'dir-c1-backward');
        const forwardController = new AvatarMovementController(forwardSession);
        const backwardController = new AvatarMovementController(backwardSession);
        forwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        backwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        const forwardDistance = drive(forwardController, forwardSession, 'w', 20, 0.05);
        assert(forwardDistance > 0, '14. MOTORCYCLE — forward is accepted');
        const backwardDistance = drive(backwardController, backwardSession, 's', 20, 0.05);
        assert(backwardDistance < 0, '15. MOTORCYCLE — backward is accepted');
    }

    // -------------------------------------------------------------
    // Section D — car
    // -------------------------------------------------------------
    {
        // 0.9.91 note: see Section B's own note above — two fresh
        // controllers avoid the forward-then-backward residual-speed
        // confound now that CAR is RATE_LIMITED (0.9.90).
        const { avatarPresenceSession: forwardSession } = buildAvatarStack(registry, 'dir-d1-forward');
        const { avatarPresenceSession: backwardSession } = buildAvatarStack(registry, 'dir-d1-backward');
        const forwardController = new AvatarMovementController(forwardSession);
        const backwardController = new AvatarMovementController(backwardSession);
        forwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        backwardController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        const forwardDistance = drive(forwardController, forwardSession, 'w', 20, 0.05);
        assert(forwardDistance > 0, '16. CAR — forward is accepted');
        const backwardDistance = drive(backwardController, backwardSession, 's', 20, 0.05);
        assert(backwardDistance < 0, '17. CAR — backward is accepted');
    }

    // -------------------------------------------------------------
    // Section E — drone remains fully blocked
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-e1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        assert(capability.movementDirections.forward === false && capability.movementDirections.backward === false,
            '18. DRONE\'s own movementDirections is forward: false, backward: false');

        const beforePos = avatarPresenceSession.current.position;
        const before = { x: beforePos.x, y: beforePos.y, z: beforePos.z };
        controller.keyDown('w');
        controller.keyDown('s');
        for (let i = 0; i < 10; i++) controller.tick(0.05);
        const after = avatarPresenceSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '19. AERIAL_VEHICLE/DRONE remains fully blocked by the tick() guard — its own inert movementDirections is never even reached, let alone consulted');
        controller.keyUp('w');
        controller.keyUp('s');
    }

    // -------------------------------------------------------------
    // Section F — vehicle switching
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-f1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        const sequence = [VehicleType.NONE, VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.NONE];
        for (const vehicleType of sequence) {
            controller.setMovementCapability(resolveAvatarVehicleMovementCapability(vehicleType));
            const forwardDistance = drive(controller, avatarPresenceSession, 'w', 10, 0.05);
            // 0.9.91 note: bumped from 10 ticks (0.5s) to 80 (4s) for the
            // backward phase — see Section B's own note above. Each
            // RATE_LIMITED vehicle's forward burst just above leaves
            // real positive residual speed on this SAME controller (the
            // capability itself only changes at the TOP of this loop, not
            // between the forward/backward calls within one iteration),
            // and reversing must decelerate through zero first.
            const backwardDistance = drive(controller, avatarPresenceSession, 's', 80, 0.05);
            assert(forwardDistance > 0, `20. ${vehicleType} — forward still moves the avatar during WALK -> BICYCLE -> MOTORCYCLE -> CAR -> WALK switching`);
            assert(backwardDistance < 0, `21. ${vehicleType} — backward still moves the avatar during the same switching sequence`);
        }
    }

    // -------------------------------------------------------------
    // Section G — a capability that disallows one direction blocks
    // exactly that direction
    // -------------------------------------------------------------
    {
        // A synthetic capability (this milestone's own seam does not
        // yet feed a real vehicle a restricted value — see
        // core/AvatarVehicleMovementCapability.js's own 0.9.89 header —
        // but the controller-level mechanism must already work for
        // whichever future milestone constructs one).
        const forwardOnly = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const { AvatarVehicleMovementCapability } = await import('../core/AvatarVehicleMovementCapability.js');
        const { AvatarMovementDirectionCapability } = await import('../core/AvatarMovementDirectionCapability.js');
        const forwardOnlyCapability = new AvatarVehicleMovementCapability(
            forwardOnly.movementKind, forwardOnly.vehicleType, forwardOnly.supported,
            forwardOnly.movementSpeed, forwardOnly.collisionRadius,
            new AvatarMovementDirectionCapability(true, false),
            forwardOnly.acceleration,
            forwardOnly.braking
        );

        // 0.9.91 note: forward and the blocked-backward check now use TWO
        // separate controllers. CAR (the capability this synthetic value
        // is built from) is RATE_LIMITED (0.9.90) — a controller that had
        // just spent 20 ticks accelerating forward still carries real
        // positive `_currentMovementSpeed` residual, and a disallowed
        // direction contributes exactly `0` to the target speed (never a
        // negative one — see `_resolvedForwardAxis()`'s own header), so
        // that residual would spend the next window COASTING TO A STOP
        // rather than producing an immediate, exact-zero displacement —
        // genuinely the new intended behavior (this milestone's own
        // brief: "the current speed moves toward zero rather than
        // remaining at cruising speed"), just not what THIS assertion is
        // about. A controller that starts at rest, with backward blocked
        // the whole time, never accumulates any speed to coast on.
        const { avatarPresenceSession: forwardOnlySession } = buildAvatarStack(registry, 'dir-g1-forward');
        const { avatarPresenceSession: blockedSession } = buildAvatarStack(registry, 'dir-g1-blocked');
        const forwardOnlyController = new AvatarMovementController(forwardOnlySession);
        const blockedController = new AvatarMovementController(blockedSession);
        forwardOnlyController.setMovementCapability(forwardOnlyCapability);
        blockedController.setMovementCapability(forwardOnlyCapability);

        const forwardDistance = drive(forwardOnlyController, forwardOnlySession, 'w', 20, 0.05);
        assert(forwardDistance > 0, '22. forward is still accepted when only backward is disallowed');

        const backwardDistance = drive(blockedController, blockedSession, 's', 20, 0.05);
        assert(backwardDistance === 0, '23. backward is fully blocked (exactly 0 displacement) when the active capability disallows it — read as "the key was never pressed," not as a collision or a stall');

        // Holding BOTH W and S with backward disallowed: this is no
        // longer an ordinary cancel-to-zero (S no longer contributes
        // anything at all, gated out before the axis is combined), so
        // the result is pure forward motion — the same outcome as
        // holding W alone, proving forward/backward are gated
        // INDEPENDENTLY, then combined by the SAME existing priority
        // rule, never a special "both held" case.
        const { avatarPresenceSession: bothSession } = buildAvatarStack(registry, 'dir-g2');
        const bothController = new AvatarMovementController(bothSession);
        bothController.setMovementCapability(forwardOnlyCapability);
        bothController.keyDown('w');
        bothController.keyDown('s');
        for (let i = 0; i < 20; i++) bothController.tick(0.05);
        assert(bothSession.current.position.z > 0, '24. W+S held together, with backward disallowed, still moves forward — the disallowed S contributes nothing, exactly as if it were never pressed, so forward alone drives the axis');
        bothController.keyUp('w');
        bothController.keyUp('s');

        // Continuous BACKWARD intent is blocked identically to a held S.
        const { avatarPresenceSession: continuousSession } = buildAvatarStack(registry, 'dir-g3');
        const continuousController = new AvatarMovementController(continuousSession);
        continuousController.setMovementCapability(forwardOnlyCapability);
        continuousController.setContinuousMovementIntent(AvatarContinuousMovementIntent.BACKWARD);
        for (let i = 0; i < 20; i++) continuousController.tick(0.05);
        assert(continuousSession.current.position.z === 0, '25. persistent continuous BACKWARD intent is blocked identically to an ordinary held S key, when the active capability disallows backward');

        // Continuous FORWARD intent still works.
        const { avatarPresenceSession: continuousForwardSession } = buildAvatarStack(registry, 'dir-g4');
        const continuousForwardController = new AvatarMovementController(continuousForwardSession);
        continuousForwardController.setMovementCapability(forwardOnlyCapability);
        continuousForwardController.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        for (let i = 0; i < 20; i++) continuousForwardController.tick(0.05);
        assert(continuousForwardSession.current.position.z > 0, '26. persistent continuous FORWARD intent still works when only backward is disallowed');

        // Turning (A/D) is completely unaffected by a direction
        // restriction — this milestone never touches turnAxis.
        const { avatarPresenceSession: turnSession } = buildAvatarStack(registry, 'dir-g5');
        const turnController = new AvatarMovementController(turnSession);
        turnController.setMovementCapability(forwardOnlyCapability);
        turnController.keyDown('d');
        const beforeRotation = turnSession.current.rotation.y || 0;
        turnController.tick(0.5);
        assert((turnSession.current.rotation.y || 0) !== beforeRotation, '27. turning (A/D) is completely unaffected by a forward-only capability');
        turnController.keyUp('d');

        // Running still works for the still-permitted forward direction.
        const { avatarPresenceSession: runSession } = buildAvatarStack(registry, 'dir-g6');
        const runController = new AvatarMovementController(runSession);
        runController.setMovementCapability(forwardOnlyCapability);
        runController.keyDown('w');
        runController.keyDown('shift');
        runController.tick(0.5);
        assert(runSession.current.animation === AvatarAnimationState.RUNNING, '28. running (Shift+W) still produces RUNNING for the still-permitted forward direction');
        runController.keyUp('w');
        runController.keyUp('shift');

        // A fully-blocked direction still resolves to IDLE animation,
        // never WALKING/RUNNING — from the simulation's own point of
        // view, nothing was ever requested.
        const { avatarPresenceSession: idleSession } = buildAvatarStack(registry, 'dir-g7');
        const idleController = new AvatarMovementController(idleSession);
        idleController.setMovementCapability(forwardOnlyCapability);
        idleController.keyDown('s');
        idleController.tick(0.5);
        assert(idleSession.current.animation === AvatarAnimationState.IDLE, '29. holding a disallowed direction alone produces IDLE, not WALKING/RUNNING — exactly like holding no key at all');
        idleController.keyUp('s');
    }

    // -------------------------------------------------------------
    // Section H — existing speed and collision radius behavior
    // unaffected
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'dir-h1-walk');
        const { avatarPresenceSession: vehicleSession } = buildAvatarStack(registry, 'dir-h1-vehicle');
        const walkController = new AvatarMovementController(walkSession);
        const vehicleController = new AvatarMovementController(vehicleSession);
        walkController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        vehicleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        const walkDistance = drive(walkController, walkSession, 'w', 40, 0.05);
        const vehicleDistance = drive(vehicleController, vehicleSession, 'w', 40, 0.05);
        assert(vehicleDistance > walkDistance, '30. CAR still covers strictly more ground than WALK for identical forward input — 0.9.86/0.9.87\'s own speed differentiation is untouched by this milestone');
    }
    {
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 2);
        const { avatarPresenceSession: bicycleSession } = buildAvatarStack(registry, 'dir-h2-bicycle');
        const { avatarPresenceSession: carSession } = buildAvatarStack(registry, 'dir-h2-car');
        bicycleSession.update({ position: { x: realTree.center.x, y: 0, z: startZ }, rotation: { y: 0 } });
        carSession.update({ position: { x: realTree.center.x, y: 0, z: startZ }, rotation: { y: 0 } });
        const bicycleController = new AvatarMovementController(bicycleSession, null, null, null, new AvatarTreeConstraint());
        const carController = new AvatarMovementController(carSession, null, null, null, new AvatarTreeConstraint());
        bicycleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        carController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        bicycleController.keyDown('w');
        carController.keyDown('w');
        for (let i = 0; i < 60; i++) {
            bicycleController.tick(0.05);
            carController.tick(0.05);
        }
        bicycleController.keyUp('w');
        carController.keyUp('w');
        assert(carSession.current.position.z < bicycleSession.current.position.z,
            '31. CAR\'s own larger collision radius still stops it farther from the tree than BICYCLE\'s own smaller one — 0.9.88\'s own collision footprint differentiation is untouched by this milestone');
    }

    // -------------------------------------------------------------
    // Section I — determinism
    // -------------------------------------------------------------
    {
        const capabilityA = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const capabilityB = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        assert(capabilityA.movementDirections === capabilityB.movementDirections,
            '32. resolving the same VehicleType twice returns the identical (===) movementDirections instance both times');

        const { avatarPresenceSession } = buildAvatarStack(registry, 'dir-i1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        let previousZ = avatarPresenceSession.current.position.z;
        controller.keyDown('w');
        for (let i = 0; i < 30; i++) {
            controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
            controller.tick(0.05);
            const currentZ = avatarPresenceSession.current.position.z;
            assert(currentZ > previousZ, `33.${i} each tick still advances forward position — no stall, no drift, no NaN introduced by repeated re-resolution of movementDirections`);
            previousZ = currentZ;
        }
        controller.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section J — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/AvatarMovementController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\bBICYCLE\b|\bMOTORCYCLE\b|\bCAR\b|\bDRONE\b/.test(codeOnly),
            '34. application/AvatarMovementController.js never references BICYCLE/MOTORCYCLE/CAR/DRONE — it knows only about a resolved capability\'s own movementDirections, never which vehicle produced it');
        assert(!codeOnly.includes('GROUND_VEHICLE') && !codeOnly.includes('AERIAL_VEHICLE'),
            '35. application/AvatarMovementController.js never branches on a specific AvatarMovementCapabilityKind value to decide direction — it only ever reads the generic movementDirections shape');
        assert(!/leftAllowed|rightAllowed|movementDirections\.(left|right)|steering|Steering/i.test(codeOnly),
            '36. application/AvatarMovementController.js introduces no left/right movement-direction CAPABILITY vocabulary (the pre-existing A/D turnAxis keys are unrelated and untouched — see Section G\'s own turning assertion) — this milestone\'s capability gating is forward/backward only');
        assert(codeOnly.includes('_resolvedMovementDirections') && codeOnly.includes('movementDirections'),
            '37. application/AvatarMovementController.js does expose the _resolvedMovementDirections() seam this milestone exists to add');
        assert(!/BicycleMovementController|MotorcycleMovementController|CarMovementController|DroneMovementController|VehicleMovementController/.test(codeOnly),
            '38. application/AvatarMovementController.js contains no per-vehicle movement controller of any kind — there remains exactly one movement controller');
    }
    {
        const sourceUrl = new URL('../core/AvatarVehicleMovementCapability.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('AvatarMovementController') && !codeOnly.includes('AvatarMovementSimulation'),
            '39. core/AvatarVehicleMovementCapability.js still never imports application/AvatarMovementController.js or core/AvatarMovementSimulation.js — the movement-directions seam is a pure capability field, never a cross-module coupling');
    }
    {
        const sourceUrl = new URL('../core/AvatarMovementDirectionCapability.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\bleft\b|\bright\b/.test(codeOnly),
            '40. core/AvatarMovementDirectionCapability.js introduces no left/right field — forward/backward only, exactly as this milestone\'s own brief asks');
    }

    console.log('✅ All Vehicle Movement Direction Semantics Integration tests passed.');
}

await runTests();
