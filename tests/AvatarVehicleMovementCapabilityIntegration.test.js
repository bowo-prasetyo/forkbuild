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

// 0.9.85 — Vehicle Movement Capability Integration.
//
// 0.9.84 (core/AvatarVehicleMovementCapability.js) resolved "which
// AvatarMovementCapabilityKind does the avatar's current vehicle
// relationship imply" as a pure function, and deliberately stopped
// there. This milestone answers the question 0.9.84's own closing
// paragraph named and did not answer: can
// application/AvatarMovementController.js — the ONE existing avatar
// movement pipeline — actually CONSUME a resolved capability, without
// becoming a second movement system, and without gaining a speed
// difference it was never asked to have yet.
//
//   Section A: default regression — no vehicle, no capability ever
//              set, behaves exactly as before this milestone existed
//   Section B: BICYCLE -> GROUND_VEHICLE, at the controller AND through
//              a real WorldNavigationSession mounting a real, placed
//              bicycle
//   Section C: MOTORCYCLE -> GROUND_VEHICLE, at the controller
//   Section D: CAR -> GROUND_VEHICLE, at the controller. Its own
//              WALK/GROUND_VEHICLE pipeline-equivalence check (identical
//              input produces identical output, because THIS milestone
//              added no numeric difference between them) was
//              superseded by 0.9.86 — see tests/
//              AvatarVehicleMovementSpeedIntegration.test.js instead,
//              which now asserts the opposite: GROUND_VEHICLE strictly
//              outpaces WALK for identical input
//   Section E: dismount — a real mount then dismount through
//              WorldNavigationSession, proving the capability update
//              lands on the SAME frame as the mount/dismount
//              transition itself, never one frame late
//   Section F: DRONE -> AERIAL_VEHICLE, unsupported — movement is
//              blocked outright while it is active, and it never
//              silently becomes GROUND_VEHICLE or WALK
//   Section G: existing movement regression — ordinary W/S, running,
//              continuous walking/running, and real tree collision,
//              all run identically whether the current capability is
//              WALK or GROUND_VEHICLE
//   Section H: reference/determinism semantics — 0.9.84's cached,
//              frozen, shared capability instances flow through
//              unchanged across repeated ticks/frames
//   Section I: architectural regression — AvatarMovementController.js
//              never imports VehicleType/AvatarVehicleMount/vehicle
//              placement of any kind; WorldNavigationSession.js never
//              references vehicle speed/acceleration/braking/turning/
//              mass/drag or a parallel per-vehicle movement controller;
//              AvatarVehicleInteractionController.js never imports
//              AvatarMovementController.js
//
// Central architectural claim under test throughout: there remains
// EXACTLY ONE movement controller. GROUND_VEHICLE reuses
// AvatarMovementController's existing walk/run/turn/terrain/tree
// pipeline verbatim; AERIAL_VEHICLE is recognized and blocks movement
// rather than borrowing either WALK's or GROUND_VEHICLE's own numbers.
// See docs/Roadmap.md, 0.9.85.

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
// tests/AvatarVehicleRuntimeIntegration.test.js already anchors on —
// core/VehiclePlacement.js (0.9.72) only ever places BICYCLE so far, so
// this is the one vehicle type an actual WorldNavigationSession can
// mount today. Motorcycle/car/drone are proven at the
// AvatarMovementController level instead (Sections C, D, F) — that
// half of this milestone's own diagram (capability -> controller) is
// entirely vehicle-agnostic and needs no real placed vehicle of every
// type to prove correct.
const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

// A real deterministic tree, found the exact same way
// tests/AvatarContinuousMovementControllerIntegration.test.js's own
// Section E flagship already does.
function findRealTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    return wide[0];
}

async function runTests() {
    const registry = buildRegistry();
    const realVehicle = findRealVehicle();
    const realTree = findRealTree();

    // -------------------------------------------------------------
    // Section A — default regression
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-a1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '1. a fresh controller, with setMovementCapability() never called, reports WALK — the documented default');

        controller.keyDown('w');
        const before = avatarPresenceSession.current.position.z;
        controller.tick(0.5);
        const after = avatarPresenceSession.current.position.z;
        assert(after > before, '2. ordinary W movement, with no capability ever set, is completely unaffected by this milestone');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING,
            '3. the WALKING animation is produced exactly as before');
        controller.keyUp('w');
    }
    {
        // Explicitly setting WALK back (the resolved "not mounted"
        // capability) behaves identically to never having set one.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-a2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '4. resolveAvatarVehicleMovementCapability(VehicleType.NONE) applied through setMovementCapability() also reports WALK');
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '5. movement still works exactly as before with an explicit WALK capability applied');
        controller.keyUp('w');
    }
    {
        // Invalid input degrades gracefully to WALK, the same posture
        // setContinuousMovementIntent()/setContinuousMovementMode()
        // already establish — never throws, never leaves a malformed
        // value sitting in the controller.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-a3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability({ movementKind: 'ground_vehicle', vehicleType: 'car', supported: true });
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '6. a plain object shaped like a capability (not an actual AvatarVehicleMovementCapability instance) degrades to WALK, never throws');
        controller.setMovementCapability(null);
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '7. setMovementCapability(null) also degrades to WALK');
        controller.setMovementCapability(undefined);
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '8. setMovementCapability() with no argument at all also degrades to WALK');
    }

    // -------------------------------------------------------------
    // Section B — bicycle
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-b1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '9. a resolved BICYCLE capability is reflected by movementCapability() as GROUND_VEHICLE');
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '10. ordinary W movement still moves the avatar with a GROUND_VEHICLE capability applied — recognized, not yet numerically different');
        controller.keyUp('w');
    }
    {
        // FLAGSHIP — a real avatar, a real WorldNavigationSession, a
        // real deterministic bicycle: mounting it is reflected in the
        // movement controller's own capability through the actual
        // frame loop, not a synthetic call.
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'cap-b2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '11. FLAGSHIP: before mounting anything, the real session\'s own movement controller reports WALK');

        session.avatarKeyDown('e');
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];
        frameCallback(0.016);

        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '12. FLAGSHIP: pressing E next to the real bicycle mounts it, exactly as tests/AvatarVehicleRuntimeIntegration.test.js already proves');
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '13. FLAGSHIP: the SAME animation frame that mounts the bicycle also updates the movement controller\'s own capability to GROUND_VEHICLE — read straight off the real session, never a synthetic setMovementCapability() call');
    }

    // -------------------------------------------------------------
    // Section C — motorcycle
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-c1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE));
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '14. a resolved MOTORCYCLE capability is also reflected as GROUND_VEHICLE — the same kind bicycle resolves to');
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '15. ordinary W movement still works under a MOTORCYCLE-derived capability');
        controller.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section D — car, and WALK/GROUND_VEHICLE pipeline equivalence
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-d1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '16. a resolved CAR capability is also reflected as GROUND_VEHICLE');
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '17. ordinary W movement still works under a CAR-derived capability');
        controller.keyUp('w');
    }
    {
        // Two otherwise-identical controllers, one left at the default
        // WALK, one set to GROUND_VEHICLE (via CAR).
        //
        // 0.9.86 note: this used to assert BYTE-IDENTICAL output — the
        // exact claim 0.9.85 existed to make ("no numeric difference
        // between them yet"). 0.9.86 (Ground Vehicle Movement Speed
        // Capability) deliberately supersedes that claim: GROUND_VEHICLE
        // now runs faster. What this section still proves, and what
        // remains true, is the part 0.9.85 actually cared about — BOTH
        // controllers go through the exact same simulation/constraint
        // PIPELINE (same turning, same animation-state resolution), just
        // parameterized by a different base speed now. See
        // tests/AvatarVehicleMovementSpeedIntegration.test.js for the
        // full 0.9.86 suite this milestone adds.
        const { avatarPresenceSession: walkSession } = buildAvatarStack(registry, 'cap-d2-walk');
        const { avatarPresenceSession: vehicleSession } = buildAvatarStack(registry, 'cap-d2-vehicle');
        const walkController = new AvatarMovementController(walkSession);
        const vehicleController = new AvatarMovementController(vehicleSession);
        vehicleController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        for (const controller of [walkController, vehicleController]) {
            controller.keyDown('w');
            controller.keyDown('shift');
        }
        // 0.9.91 note: bumped from 30 ticks (1.5s) to 150 (7.5s). CAR is
        // now RATE_LIMITED (core/AvatarVehicleMovementCapability.js,
        // 0.9.90) and only reaches its own (running-doubled) 24 units/
        // second target after ramping at 4 units/second^2 for 6 seconds
        // — over a short window it can still trail WALK's own INSTANT,
        // already-at-12-units/second pace. A long enough window is still
        // exactly what this section's own claim needs: CAR strictly
        // exceeds WALK once it has had time to accelerate, which this
        // window comfortably provides. See
        // tests/AvatarVehicleAccelerationStateIntegration.test.js for
        // the dedicated coverage of the acceleration ramp itself.
        for (let i = 0; i < 150; i++) {
            walkController.tick(0.05);
            vehicleController.tick(0.05);
        }
        assert(vehicleSession.current.position.z > walkSession.current.position.z,
            '18. as of 0.9.86, GROUND_VEHICLE (via CAR) covers strictly more ground than WALK for identical input and identical elapsed time — the numeric difference this milestone exists to add');
        assert(walkSession.current.animation === vehicleSession.current.animation,
            '19. ...while still producing identical animation state — the same RUNNING resolution, just faster underneath'
        );
    }

    // -------------------------------------------------------------
    // Section E — dismount, and same-frame capability synchronization
    // -------------------------------------------------------------
    {
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'cap-e1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];

        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '20. mounted: the real session\'s movement controller reports GROUND_VEHICLE');

        // Genuine release + re-press to dismount — the same held-key
        // discipline tests/AvatarVehicleRuntimeIntegration.test.js's own
        // Section B flagship already establishes.
        session.avatarKeyUp('e');
        session.avatarKeyDown('e');
        frameCallback(0.016);

        assert(session.avatarVehicleMount() === null, '21. dismounted: mount() is null again');
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.WALK,
            '22. dismounted: the SAME frame that clears the mount also restores the movement controller\'s own capability to WALK — never one frame stale');
    }

    // -------------------------------------------------------------
    // Section F — drone, unsupported
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-f1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.AERIAL_VEHICLE,
            '23. a resolved DRONE capability is reflected by movementCapability() as AERIAL_VEHICLE');

        const currentPosition = avatarPresenceSession.current.position;
        const before = { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z };
        controller.keyDown('w');
        const result = controller.tick(0.5);
        assert(result === null, '24. tick() while an unsupported capability is active returns null — a genuine no-op, exactly like an idle avatar with no keys held');
        const after = avatarPresenceSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '25. movement is fully blocked while AERIAL_VEHICLE/DRONE is active — holding W does not move the avatar even one unit');
        controller.keyUp('w');

        // Critically: still AERIAL_VEHICLE, never silently GROUND_VEHICLE
        // or WALK, across further ticks too.
        for (let i = 0; i < 5; i++) controller.tick(0.5);
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.AERIAL_VEHICLE,
            '26. the capability itself never silently reverts to GROUND_VEHICLE or WALK just because movement is blocked — blocking is a MOVEMENT outcome, not a capability change');
        assert(
            avatarPresenceSession.current.position.x === before.x
            && avatarPresenceSession.current.position.z === before.z,
            '27. ...and the avatar genuinely never moved across any of those ticks either'
        );
    }
    {
        // Switching FROM an unsupported capability back to something
        // supported immediately un-blocks movement — the guard is
        // re-evaluated fresh every tick, never latched.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-f2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z === 0, '28. blocked while unsupported...');
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '29. ...and moves normally again the very next tick once the capability changes back to something supported');
        controller.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section G — existing movement regression
    // -------------------------------------------------------------
    {
        // Ordinary running (Shift+W).
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-g1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        controller.keyDown('w');
        controller.keyDown('shift');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING,
            '30. ordinary running (Shift+W) still produces RUNNING under a GROUND_VEHICLE capability');
        controller.keyUp('w');
        controller.keyUp('shift');
    }
    {
        // Continuous walking/running (0.9.66/0.9.69), with a
        // GROUND_VEHICLE capability applied.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-g2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
        const before = avatarPresenceSession.current.position.z;
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > before,
            '31. continuous FORWARD movement, with no key ever held, still works under a GROUND_VEHICLE capability');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING,
            '32. continuous RUN mode still produces RUNNING under a GROUND_VEHICLE capability');
    }
    {
        // Real tree collision (0.9.63), unchanged: this milestone
        // deliberately keeps the existing tree constraint exactly as it
        // is, for GROUND_VEHICLE exactly as for WALK.
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-g3');
        avatarPresenceSession.update({ position: { x: realTree.center.x, y: 0, z: startZ }, rotation: { y: 0 } });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE));
        controller.keyDown('w');
        let everCollided = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.05);
            if (controller.isCollidedWithTree()) everCollided = true;
        }
        assert(everCollided === true, '33. a real deterministic tree still stops the avatar under a GROUND_VEHICLE capability — the exact same collision pipeline WALK already goes through, untouched by this milestone');
        controller.keyUp('w');
    }

    // -------------------------------------------------------------
    // Section H — reference/determinism semantics
    // -------------------------------------------------------------
    {
        // 0.9.84's own cached, frozen, shared instance per VehicleType
        // flows straight through setMovementCapability()/movementCapability()
        // with no copying, no replacement, no drift across repeated
        // application.
        const capabilityA = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const capabilityB = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        assert(capabilityA === capabilityB, '34. resolving the same VehicleType twice still returns the identical (===) 0.9.84 instance');

        const { avatarPresenceSession } = buildAvatarStack(registry, 'cap-h1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setMovementCapability(capabilityA);
        const kindAfterFirst = controller.movementCapability();
        for (let i = 0; i < 50; i++) {
            controller.setMovementCapability(capabilityB);
            controller.tick(0.016);
        }
        assert(controller.movementCapability() === kindAfterFirst,
            '35. applying the identical shared instance repeatedly across many ticks never drifts the reported capability kind');
        assert(controller.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '36. ...and it is still the correct GROUND_VEHICLE kind after all of that');
    }
    {
        // Through a real WorldNavigationSession: many frames mounted on
        // the same real bicycle never replaces the capability with a
        // field-different-but-equivalent one each frame — the exact
        // same 0.9.84 instance is re-resolved and re-applied every
        // single frame.
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'cap-h2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];

        session.avatarKeyDown('e');
        frameCallback(0.016);
        session.avatarKeyUp('e');
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
            '37. mounted once, GROUND_VEHICLE as expected');
        for (let i = 0; i < 20; i++) {
            frameCallback(0.016);
            assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.GROUND_VEHICLE,
                `38.${i} repeated per-frame re-resolution while mounted stays GROUND_VEHICLE every single frame, never flickering`);
        }
    }

    // -------------------------------------------------------------
    // Section I — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/AvatarMovementController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('VehicleType'),
            '39. application/AvatarMovementController.js never references VehicleType — it knows only about a resolved AvatarVehicleMovementCapability, never which vehicle produced it');
        assert(!codeOnly.includes('AvatarVehicleMount'),
            '40. application/AvatarMovementController.js never references AvatarVehicleMount');
        assert(!codeOnly.includes('VehiclePresence') && !codeOnly.includes('VehiclePlacement') && !codeOnly.includes('vehiclePresenceInRegion'),
            '41. application/AvatarMovementController.js never references VehiclePresence, VehiclePlacement, or a vehicle lookup of any kind — vehicle lookup is exclusively application/AvatarVehicleInteractionController.js\'s job, composed one layer up');
        assert(!/BicycleMovementController|MotorcycleMovementController|CarMovementController|DroneMovementController|VehicleMovementController/.test(codeOnly),
            '42. application/AvatarMovementController.js contains no per-vehicle movement controller of any kind — there remains exactly one movement controller');
        assert(codeOnly.includes('setMovementCapability') && codeOnly.includes('movementCapability'),
            '43. application/AvatarMovementController.js does expose the setMovementCapability()/movementCapability() integration seam this milestone exists to add');
    }
    {
        const sourceUrl = new URL('../application/WorldNavigationSession.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        // 0.9.96 note: application/WorldNavigationSession.js now
        // legitimately binds a real Control key to
        // core/AvatarVehicleBrakingIntent.js's own NONE/BRAKE
        // vocabulary and core/AvatarVehicleBrakingInputAdapter.js (see
        // that milestone's own header) — every identifier that seam
        // needs (setVehicleBrakingIntent, _processVehicleBrakingInput,
        // AvatarVehicleBrakingIntent, ...) contains "VehicleBraking" as
        // part of an INTENT/INPUT type or method name, never a numeric
        // physics quantity. Whole tokens containing that substring are
        // stripped here before the check below runs — never individual
        // identifiers named one by one, so this stays correct as this
        // vocabulary's own call sites grow — the same "this milestone
        // deliberately makes an old string appear; the assertion is
        // updated to the claim it actually cares about" precedent
        // 0.9.95 itself already set for
        // tests/AvatarVehicleBrakingCoastingIntegration.test.js's own
        // Section I.
        const codeOnlyWithoutBrakingVocabulary = codeOnly.replace(/[A-Za-z_]*[Vv]ehicleBraking[A-Za-z]*/g, '');
        assert(!/vehicleSpeed|vehicleAcceleration|vehicleBraking|vehicleTurning|vehicleMass|vehicleDrag|vehicleVelocity/i.test(codeOnlyWithoutBrakingVocabulary),
            '44. application/WorldNavigationSession.js never references any numeric vehicle physics quantity — this milestone integrates a capability KIND, never a speed');
        // 0.9.116 note: application/WorldNavigationSession.js now
        // legitimately constructs application/AvatarVehicleMovementController.js
        // — a single, GENERIC vehicle movement controller (see that
        // file's own header) that actually connects this capability
        // layer to a moving VehicleInstance, exactly as 0.9.84's own
        // closing paragraph named as future scope. What THIS assertion
        // still forbids, unchanged since 0.9.85, is a PER-VEHICLE-TYPE
        // parallel system — a BicycleMovementController,
        // MotorcycleMovementController, CarMovementController, or
        // DroneMovementController, each duplicating the same math for
        // one vehicle kind — which 0.9.116 does not introduce either
        // (see that file's own header, "no second movement system").
        // The bare "VehicleMovementController" substring is therefore
        // no longer itself forbidden; only a per-vehicle-type spelling
        // of it is. The same "an old string legitimately reappears; the
        // assertion is updated to the claim it actually cares about"
        // precedent 0.9.95/0.9.96 already set is applied here.
        assert(!/BicycleMovementController|MotorcycleMovementController|CarMovementController|DroneMovementController/.test(codeOnly),
            '45. application/WorldNavigationSession.js constructs no PER-VEHICLE-TYPE movement controller of any kind — 0.9.116\'s own generic AvatarVehicleMovementController is the one legitimate exception, reusing this exact same capability/simulation layer rather than forking it per vehicle type');
        assert(codeOnly.includes('resolveAvatarVehicleMovementCapability') && codeOnly.includes('setMovementCapability') && codeOnly.includes('mountedVehicleType'),
            '46. application/WorldNavigationSession.js does compose mountedVehicleType() -> resolveAvatarVehicleMovementCapability() -> setMovementCapability() — the integration this milestone exists to make');
        assert(codeOnly.includes('AvatarVehicleMovementController') && codeOnly.includes('VehicleRuntimeInstances'),
            '47. 0.9.116 note: application/WorldNavigationSession.js does compose the mounted-vehicle-movement integration — application/AvatarVehicleMovementController.js reading from and writing to application/VehicleRuntimeInstances.js — the follow-on integration that connects this capability KIND to an actual moving VehicleInstance; see tests/AvatarVehicleMovementControllerIntegration.test.js for that integration\'s own dedicated coverage');
    }
    {
        const sourceUrl = new URL('../application/AvatarVehicleInteractionController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('AvatarMovementController'),
            '47. application/AvatarVehicleInteractionController.js never imports or references AvatarMovementController — the coupling between mount state and movement capability lives entirely in application/WorldNavigationSession.js, never here');
        assert(codeOnly.includes('mountedVehicleType'),
            '48. application/AvatarVehicleInteractionController.js does expose mountedVehicleType() — the one new read 0.9.85 adds to this controller\'s own already-existing vehicle lookup');
    }

    console.log('✅ All Avatar-Vehicle Movement Capability Integration tests passed.');
}

await runTests();
