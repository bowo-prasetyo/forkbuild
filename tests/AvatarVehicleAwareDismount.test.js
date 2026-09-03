import { readFile } from 'node:fs/promises';
import { AvatarVehicleInteractionController } from '../application/AvatarVehicleInteractionController.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { BICYCLE_DISMOUNT_OFFSET_X } from '../core/AvatarVehicleDismountPosition.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.117 — Vehicle-Aware Dismount.
//
//   Section A: stationary dismount — existing 0.9.83 behavior survives
//              unchanged once a VehicleRuntimeInstances store is wired in
//   Section B: FLAGSHIP — moved-vehicle dismount resolves from the
//              vehicle's CURRENT runtime position, never its spawn point
//   Section C: spawn position is architecturally irrelevant to the
//              result — proven both by value and by a source sweep
//   Section D: the existing 0.9.81 clearance system still governs a
//              MOVED vehicle's dismount candidate exactly as it always
//              has for a stationary one
//   Section E: the vehicle's own runtime identity (id/type/spawnPosition/
//              position) is completely untouched by a dismount
//   Section F: unmounted, on-foot behavior — and a controller built
//              without any runtime store at all — are both completely
//              unaffected by this milestone
//   Section G: FLAGSHIP, end to end — a real WorldNavigationSession,
//              real mounted-vehicle movement (0.9.116), and a real
//              dismount: proves the actual bug this whole line of
//              milestones was motivated by (see docs/Roadmap.md,
//              0.9.114's opening paragraph) is gone — riding a bicycle
//              far from where it spawned no longer leaves the avatar
//              stuck mounted forever, unable to dismount at all
//   Section H: architectural regression — the fix is real wiring, not a
//              second dismount-position implementation
//
// Central architectural claim under test throughout, restated from this
// milestone's own brief: once mounted, the vehicle's CURRENT runtime
// position — never its deterministic spawn position — is the spatial
// authority for dismounting. See docs/Roadmap.md, 0.9.117.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// -------------------------------------------------------------
// Section A-F fixtures — the exact SEED=29 discipline
// tests/AvatarVehicleInteractionController.test.js already established:
// real, deterministically-placed vehicles, found by direct computation.
// -------------------------------------------------------------

const SEED = 29;
// vehicle:29:-6,-1 — a real bicycle whose dismount destination
// (vehicle.x + 1, 0, vehicle.z) is clear of every real tree nearby.
const CLEAR_VEHICLE_ID = 'vehicle:29:-6,-1';
// vehicle:29:-4,-8 — a real bicycle whose dismount destination overlaps
// a real tree's own collision circle.
const BLOCKED_VEHICLE_ID = 'vehicle:29:-4,-8';

function findVehicle(seed, id) {
    const vehicles = vehiclePresenceInRegion(seed, -300, -300, 300, 300);
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${id} not found under seed ${seed} — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function buildAvatarPresenceSession(startPosition) {
    return new AvatarPresenceSession(
        { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
        { position: startPosition }
    );
}

// Discovers `vehicle` into a fresh runtime store at its own spawn-equal
// position — the same discovery `_setupVehicleRendering()`'s own
// sync() would have already performed, well before an avatar could
// mount it, in a real session.
function runtimeStoreTracking(vehicle) {
    const store = new VehicleRuntimeInstances();
    store.sync(SEED, vehicle.position, 10);
    return store;
}

function mountVehicle(controller) {
    controller.keyDown('e');
    controller.tick();
    controller.keyUp('e');
}

// A genuine release + re-press — see
// application/AvatarVehicleInteractionController.js's own header for
// why merely continuing to hold the key would not trigger a second
// transition.
function attemptDismount(controller) {
    controller.keyDown('e');
    controller.tick();
    controller.keyUp('e');
}

async function runTests() {
    const clearVehicle = findVehicle(SEED, CLEAR_VEHICLE_ID);
    const blockedVehicle = findVehicle(SEED, BLOCKED_VEHICLE_ID);

    // -------------------------------------------------------------
    // Section A — stationary dismount: existing behavior survives.
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const vehicleRuntimeInstances = runtimeStoreTracking(clearVehicle);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances });

        mountVehicle(controller);
        assert(controller.mount() !== null && controller.mount().vehicleId === CLEAR_VEHICLE_ID, '1. setup: mounted the real, tracked bicycle');

        attemptDismount(controller);
        assert(controller.mount() === null, '2. a stationary vehicle still dismounts successfully with a runtime store wired in');

        const finalPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalPosition.x - (clearVehicle.position.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-9
            && finalPosition.y === 0
            && Math.abs(finalPosition.z - clearVehicle.position.z) < 1e-9,
            '3. STATIONARY REGRESSION: the resolved dismount position is unchanged from the pre-0.9.117 result — (vehicle.x + 1, 0, vehicle.z)'
        );
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: moved-vehicle dismount resolves from the
    // CURRENT runtime position, deliberately isolated from the avatar's
    // own position — proving the fix is IDENTITY-driven, never merely
    // "the avatar happens to be standing near the vehicle."
    // -------------------------------------------------------------
    let movedVehicleState;
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const vehicleRuntimeInstances = runtimeStoreTracking(clearVehicle);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances });

        mountVehicle(controller);
        assert(controller.mount() !== null, '4. setup: mounted');

        // Simulate "this vehicle has been ridden far away" — exactly
        // what application/AvatarVehicleMovementController.js's own
        // setPosition() call does over many real frames (0.9.116) —
        // WITHOUT touching the avatar's own AvatarPresenceSession
        // position at all. The old spawn-anchored dismount path could
        // never have gotten this right even by accident: the avatar
        // itself never moved.
        const movedPosition = new Position(clearVehicle.position.x + 30, 0, clearVehicle.position.z + 5);
        vehicleRuntimeInstances.setPosition(CLEAR_VEHICLE_ID, movedPosition);

        attemptDismount(controller);
        assert(controller.mount() === null, '5. FLAGSHIP: dismounting a vehicle ridden 30+ units from its spawn point still succeeds');

        const finalPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalPosition.x - (movedPosition.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-9
            && finalPosition.y === 0
            && Math.abs(finalPosition.z - movedPosition.z) < 1e-9,
            '6. FLAGSHIP: the resolved dismount position is offset from the vehicle\'s CURRENT (moved) position, never its spawn point'
        );
        movedVehicleState = { vehicleRuntimeInstances, movedPosition }; // reused by Section E
    }

    // -------------------------------------------------------------
    // Section C — spawn position is architecturally irrelevant.
    // -------------------------------------------------------------
    {
        const finalX = clearVehicle.position.x + 30 + BICYCLE_DISMOUNT_OFFSET_X;
        const spawnAnchoredX = clearVehicle.position.x + BICYCLE_DISMOUNT_OFFSET_X;
        assert(finalX !== spawnAnchoredX, '7. sanity: a spawn-anchored resolution and the actual Section B result are numerically distinct');

        const controllerSourceUrl = new URL('../application/AvatarVehicleInteractionController.js', import.meta.url);
        const controllerSource = await readFile(controllerSourceUrl, 'utf8');
        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!controllerCodeOnly.includes('spawnPosition'),
            '8. ARCHITECTURAL: application/AvatarVehicleInteractionController.js\'s own code never reads `.spawnPosition` — the dismount path has no way to even reach for it');

        const dismountPositionSourceUrl = new URL('../core/AvatarVehicleDismountPosition.js', import.meta.url);
        const dismountPositionSource = await readFile(dismountPositionSourceUrl, 'utf8');
        const dismountPositionCodeOnly = dismountPositionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!dismountPositionCodeOnly.includes('spawnPosition'),
            '9. ARCHITECTURAL: core/AvatarVehicleDismountPosition.js\'s own code never reads `.spawnPosition` either — only `.position` and `.type`, on both a VehiclePresence and a VehicleInstance alike');
    }

    // -------------------------------------------------------------
    // Section D — clearance still applies to the MOVED position.
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const vehicleRuntimeInstances = runtimeStoreTracking(clearVehicle);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances });

        mountVehicle(controller);
        const mount = controller.mount();
        assert(mount !== null, '10. setup: mounted the (otherwise clear-dismounting) bicycle');

        // Relocate the SAME mounted vehicle's runtime position onto the
        // real, deterministic BLOCKED_VEHICLE_ID's own spawn point — the
        // exact geometry tests/AvatarVehicleInteractionController.test.js
        // already proves is blocked by a real tree. This is not the
        // BLOCKED_VEHICLE_ID vehicle; it is the CLEAR one, simply ridden
        // to a position that happens to be blocked — proving clearance is
        // evaluated against wherever the vehicle CURRENTLY is, not
        // against some property of the vehicle's own identity.
        vehicleRuntimeInstances.setPosition(CLEAR_VEHICLE_ID, blockedVehicle.position);

        attemptDismount(controller);
        assert(controller.mount() === mount, '11. CLEARANCE STILL APPLIES: a moved vehicle whose CURRENT dismount candidate overlaps a real tree leaves the avatar mounted — same mount, unchanged');
        assert(
            avatarPresenceSession.current.position.x === startPosition.x
            && avatarPresenceSession.current.position.z === startPosition.z,
            '12. a blocked destination leaves the avatar\'s own position completely unchanged'
        );
    }

    // -------------------------------------------------------------
    // Section E — runtime identity is completely untouched by dismount.
    // -------------------------------------------------------------
    {
        const { vehicleRuntimeInstances, movedPosition } = movedVehicleState;
        const vehicle = vehicleRuntimeInstances.get(CLEAR_VEHICLE_ID);
        assert(vehicle.id === CLEAR_VEHICLE_ID, '13. id unchanged after the Section B dismount');
        assert(vehicle.type === VehicleType.BICYCLE, '14. type unchanged after dismount');
        assert(
            vehicle.spawnPosition.x === clearVehicle.position.x && vehicle.spawnPosition.z === clearVehicle.position.z,
            '15. spawnPosition unchanged after dismount — still the original deterministic point'
        );
        assert(
            vehicle.position.x === movedPosition.x && vehicle.position.z === movedPosition.z,
            '16. THE VEHICLE REMAINS WHERE THE PLAYER LEFT IT: position after dismount is exactly where movement left it, never reset and never touched by the act of dismounting'
        );
    }

    // -------------------------------------------------------------
    // Section F — unmounted / no-runtime-store regression.
    // -------------------------------------------------------------
    {
        // On foot, never mounted: completely unaffected by this
        // milestone, exactly as before.
        const avatarPresenceSession = buildAvatarPresenceSession(new Position(0, 0, 0));
        const vehicleRuntimeInstances = new VehicleRuntimeInstances();
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances });
        controller.keyDown('e');
        controller.tick();
        controller.tick();
        assert(controller.mount() === null, '17. pressing E with no vehicle anywhere nearby never mounts anything, runtime store wired or not');
    }
    {
        // No runtime store wired at all — the exact pre-0.9.117
        // construction every existing caller already used — still works,
        // via the deterministic fallback.
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        mountVehicle(controller);
        assert(controller.mount() !== null, '18. setup: mounted, with no vehicleRuntimeInstances wired at all');
        attemptDismount(controller);
        assert(controller.mount() === null, '19. NO-RUNTIME-STORE FALLBACK: a controller built without any VehicleRuntimeInstances still dismounts a stationary vehicle correctly, via the deterministic fallback');
        const finalPosition = avatarPresenceSession.current.position;
        assert(Math.abs(finalPosition.x - (clearVehicle.position.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-9,
            '20. ...at the exact same resolved position as always');
    }

    // -------------------------------------------------------------
    // Section G — FLAGSHIP, end to end: a real WorldNavigationSession,
    // real mounted-vehicle movement, and a real dismount.
    // -------------------------------------------------------------
    {
        class InMemoryStorageProvider extends StorageProvider {
            constructor() { super(); this._data = new Map(); }
            save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
            load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
            remove(name) { this._data.delete(name); }
            list() { return Array.from(this._data.keys()); }
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
            const avatarPresenceSession = new AvatarPresenceSession(profile, { position: startPosition });
            return { avatarProfileUseCase, avatarPresenceSession };
        }

        function spyFacade() {
            const calls = { onAnimationFrameCallbacks: [], syncVehicleCalls: [] };
            return {
                calls,
                setLocalAvatar() {}, updateLocalAvatarAppearance() {},
                updateLocalAvatarPresence() {},
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
                syncVehicles: (instances) => calls.syncVehicleCalls.push(instances),
                dispose() {}
            };
        }

        // Wires both the avatar frame loop (mount/dismount + movement)
        // AND vehicle rendering — the same full pipeline
        // tests/AvatarVehicleMovementControllerIntegration.test.js's own
        // buildSession() already establishes, required so
        // `_vehicleRuntimeInstances` actually discovers the vehicle.
        function buildSession(registry, avatarProfileUseCase, avatarPresenceSession) {
            const session = new WorldNavigationSession({
                registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
                avatarProfileUseCase, avatarPresenceSession
            });
            session._session = spyFacade();
            session._setupLocalAvatar();
            session._setupVehicleRendering();
            return session;
        }

        function fireFrame(session, deltaSeconds) {
            for (const callback of session._session.calls.onAnimationFrameCallbacks) {
                callback(deltaSeconds);
            }
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

        const registry = buildRegistry();
        const realVehicle = findRealVehicle();
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'dismount-g1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // Discover the vehicle into the runtime store, then mount it —
        // the same "approach, then press E" sequence every other real
        // mount test in this codebase already uses.
        fireFrame(session, 0.016);
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '21. setup: mounted the real fixture vehicle');

        // Ride forward for real, real distance — through the actual
        // 0.9.116 movement pipeline, no shortcuts.
        session.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) {
            fireFrame(session, 0.05);
        }
        session.avatarKeyUp('w');

        const riddenVehiclePosition = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
        const riddenDistance = Math.hypot(
            riddenVehiclePosition.x - realVehicle.position.x,
            riddenVehiclePosition.z - realVehicle.position.z
        );
        assert(riddenDistance > 5,
            '22. sanity: the vehicle actually rode a real, substantial distance from its own spawn point (proves this is not a same-position no-op test)');

        // THE ACTUAL BUG THIS ENTIRE LINE OF MILESTONES WAS MOTIVATED
        // BY: pressing E now must genuinely dismount, not silently
        // leave the avatar stuck mounted forever because the old,
        // spawn-anchored lookup no longer finds the vehicle at all.
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');

        assert(session.avatarVehicleMount() === null,
            '23. FLAGSHIP: pressing E after riding far from spawn actually dismounts — the avatar is no longer stuck mounted forever');

        const finalAvatarPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalAvatarPosition.x - (riddenVehiclePosition.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-6
            && Math.abs(finalAvatarPosition.z - riddenVehiclePosition.z) < 1e-6,
            '24. FLAGSHIP: the avatar lands next to where the bicycle actually IS after being ridden, never where it originally spawned'
        );

        const spawnDistance = Math.hypot(
            finalAvatarPosition.x - realVehicle.position.x,
            finalAvatarPosition.z - realVehicle.position.z
        );
        assert(spawnDistance > 5,
            '25. ...and that landing spot is genuinely far from the vehicle\'s own original spawn point, not merely coincidentally close to it');
    }

    // -------------------------------------------------------------
    // Section H — architectural regression: a real wiring fix, not a
    // second dismount-position implementation.
    // -------------------------------------------------------------
    {
        const controllerSourceUrl = new URL('../application/AvatarVehicleInteractionController.js', import.meta.url);
        const controllerSource = await readFile(controllerSourceUrl, 'utf8');
        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        // resolveAvatarVehicleDismountPosition is still called from
        // exactly one place — the fix changes WHAT is handed to it,
        // never how many times it is called or reimplemented.
        const resolveCallSites = controllerCodeOnly.split('resolveAvatarVehicleDismountPosition(').length - 1;
        assert(resolveCallSites === 1,
            '26. resolveAvatarVehicleDismountPosition is still called from exactly one place — the fix is in what is handed to it, never a second, divergent implementation');

        assert(controllerCodeOnly.includes('_vehicleRuntimeInstances') && controllerCodeOnly.includes('_currentMountedVehicle'),
            '27. the fix is real: application/AvatarVehicleInteractionController.js actually references its own vehicleRuntimeInstances collaborator and the new identity-first lookup');

        const dismountPositionSourceUrl = new URL('../core/AvatarVehicleDismountPosition.js', import.meta.url);
        const dismountPositionSource = await readFile(dismountPositionSourceUrl, 'utf8');
        const dismountPositionCodeOnly = dismountPositionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const exportedNames = Object.keys(await import('../core/AvatarVehicleDismountPosition.js')).sort();
        assert(
            JSON.stringify(exportedNames) === JSON.stringify(['BICYCLE_DISMOUNT_OFFSET_X', 'resolveAvatarVehicleDismountPosition']),
            '28. core/AvatarVehicleDismountPosition.js still exports exactly the offset constant and the one resolver function — the 0.9.117 fix widened its INPUT type, never its public surface'
        );
        assert(dismountPositionCodeOnly.includes('VehicleInstance'),
            '29. core/AvatarVehicleDismountPosition.js\'s own code does now reference VehicleInstance — the one real change this milestone makes there'
        );
    }

    console.log('✅ All Vehicle-Aware Dismount tests passed.');
}

await runTests();
