import { readFile } from 'node:fs/promises';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { Position } from '../core/Position.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.116 — Mounted Vehicle Movement, application/WorldNavigationSession.js's
// own wiring of application/AvatarVehicleMovementController.js +
// application/VehicleRuntimeInstances.js.
//
//   Section A: FLAGSHIP — mount a real bicycle, hold movement, its
//              VehicleInstance's own runtime position actually changes
//   Section B: renderer follows — the SAME moved vehicle's NEW position
//              reaches syncVehicles() on the very next render frame
//   Section C: avatar follows vehicle — after movement,
//              avatarPresenceSession.current.position equals the
//              mounted vehicle's own current position
//   Section D: unmounted avatar movement is completely unchanged — the
//              ordinary on-foot pipeline runs exactly as before, and no
//              vehicle is ever touched by it
//   Section E: mounting does not recreate the vehicle — id and
//              spawnPosition survive, and an ALREADY-moved vehicle's
//              position is never reset back to spawn merely by being
//              mounted
//   Section F: repeated movement — spawnPosition === original
//              spawnPosition after many frames, while position !==
//              spawnPosition
//   Section G: braking — through the real Control-key binding, reduces
//              distance covered exactly like the underlying capability
//              already governs for on-foot movement
//   Section H: unsupported vehicle types (MOTORCYCLE) are never moved
//              by this session's own wiring, even while genuinely
//              mounted on one
//
// Central architectural claim under test throughout: the VEHICLE moves;
// the avatar FOLLOWS. See docs/Roadmap.md, 0.9.116.

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

// Wires both the avatar frame loop (mount/dismount + movement) AND
// vehicle rendering, on the SAME fake facade — the full pipeline this
// milestone connects end to end.
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

const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

// Fires EVERY registered onAnimationFrame listener once, in
// registration order — the avatar frame loop (mount/dismount +
// movement) AND the vehicle-rendering frame loop alike, exactly as a
// real single render loop would call every subscriber once per frame.
// Using only the avatar's own listener (as earlier, narrower vehicle
// tests in this codebase do) would never let `_vehicleRuntimeInstances`
// discover a vehicle at all — see application/WorldNavigationSession.js's
// own `_setupVehicleRendering()`.
function fireFrame(session, deltaSeconds) {
    for (const callback of session._session.calls.onAnimationFrameCallbacks) {
        callback(deltaSeconds);
    }
}

// Mounts REAL_VEHICLE_ID on a freshly-built session: approach, press E,
// fire one frame, release E — the same genuine "hold then release" mount
// sequence every other vehicle test in this codebase already uses.
function mountRealVehicle(session) {
    session.avatarKeyDown('e');
    fireFrame(session, 0.016);
    session.avatarKeyUp('e');
    assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
        'sanity: mounting the real fixture vehicle succeeded');
}

async function runTests() {
    const registry = buildRegistry();
    const realVehicle = findRealVehicle();
    const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);

    // -------------------------------------------------------------
    // Section A — FLAGSHIP: mount, hold movement, the vehicle's own
    // runtime position changes.
    // -------------------------------------------------------------
    let flagshipSession;
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'move-a1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // Discover the vehicle into the runtime store BEFORE mounting —
        // exactly as a real session would (many render frames pass
        // while the player walks up), and required for
        // _vehicleRuntimeInstances.get(mount.vehicleId) to find it the
        // very first mounted frame.
        fireFrame(session, 0.016);
        mountRealVehicle(session);

        const beforeMove = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(beforeMove !== null, '1. the mounted vehicle is tracked by the runtime store');
        assert(beforeMove.position.x === realVehicle.position.x && beforeMove.position.z === realVehicle.position.z,
            '2. sanity: still at its spawn point immediately after mounting, before any movement');

        session.avatarKeyDown('w');
        for (let i = 0; i < 30; i++) {
            fireFrame(session, 0.05);
        }
        session.avatarKeyUp('w');

        const afterMove = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(afterMove !== null, '3. still tracked after movement');
        const movedDistanceSq = (afterMove.position.x - beforeMove.position.x) ** 2
            + (afterMove.position.z - beforeMove.position.z) ** 2;
        assert(movedDistanceSq > 0.01,
            '4. THE FLAGSHIP CLAIM: holding movement while mounted actually changed the VehicleInstance\'s own runtime position — the bicycle itself moved, not merely the avatar');
        flagshipSession = session; // reused by Section B
    }

    // -------------------------------------------------------------
    // Section B — renderer follows: the moved vehicle's NEW position
    // reaches syncVehicles() on the very next render frame.
    // -------------------------------------------------------------
    {
        const session = flagshipSession;
        assert(session._session.calls.onAnimationFrameCallbacks.length === 2,
            '5. sanity: both the avatar frame loop and the vehicle-rendering frame loop are registered on this session');
        session._session.calls.syncVehicleCalls.length = 0;
        fireFrame(session, 0.016);

        assert(session._session.calls.syncVehicleCalls.length === 1, '6. one render frame produced exactly one syncVehicles() call');
        const synced = session._session.calls.syncVehicleCalls[0].find((v) => v.id === REAL_VEHICLE_ID);
        assert(synced !== undefined, '7. the moved vehicle is still among the rendered set');
        const runtimeInstance = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(synced.position.x === runtimeInstance.position.x && synced.position.z === runtimeInstance.position.z,
            '8. RENDERER FOLLOWS: syncVehicles() received the vehicle at its CURRENT, post-movement position, never its spawnPosition — the same stable VehicleVisual (renderer/VehicleFieldRenderer.js, keyed by id) simply receives a new position');
        assert(synced.position.x !== synced.spawnPosition.x || synced.position.z !== synced.spawnPosition.z,
            '9. ...and that position is genuinely different from its own spawnPosition');
    }

    // -------------------------------------------------------------
    // Section C — avatar follows vehicle.
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'move-c1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        fireFrame(session, 0.016);
        mountRealVehicle(session);
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) {
            fireFrame(session, 0.05);
        }
        session.avatarKeyUp('w');

        const vehiclePosition = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
        const avatarPosition = avatarPresenceSession.current.position;
        assert(avatarPosition.x === vehiclePosition.x && avatarPosition.y === vehiclePosition.y && avatarPosition.z === vehiclePosition.z,
            '10. AVATAR FOLLOWS VEHICLE: after movement, the avatar\'s own position exactly equals the mounted vehicle\'s current position');
    }

    // -------------------------------------------------------------
    // Section D — unmounted avatar movement is completely unchanged;
    // no vehicle is ever touched by it.
    // -------------------------------------------------------------
    {
        // Deliberately far from the fixture vehicle, so it never falls
        // within mount/render range at all.
        const farPosition = new Position(realVehicle.position.x + 5000, 0, realVehicle.position.z + 5000);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'move-d1', farPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        assert(session.avatarVehicleMount() === null, '11. sanity: never mounted');
        const before = avatarPresenceSession.current.position.z;
        session.avatarKeyDown('w');
        fireFrame(session, 0.5);
        session.avatarKeyUp('w');
        const after = avatarPresenceSession.current.position.z;
        assert(after > before, '12. UNMOUNTED REGRESSION: ordinary W movement still moves the avatar exactly as before this milestone — the on-foot pipeline is untouched');
        assert(session.avatarVehicleMount() === null, '13. ...and never silently mounts anything');
    }
    {
        // A directly-injected, tracked-but-unmounted vehicle must never
        // move merely because SOME avatar, somewhere, is walking.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'move-d2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        fireFrame(session, 0.016); // discovers the real vehicle into the store

        const before = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        session.avatarKeyDown('w');
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        session.avatarKeyUp('w');
        const after = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(after.position.x === before.position.x && after.position.z === before.position.z,
            '14. an unmounted vehicle never moves just because the avatar walked nearby — only the AVATAR moved, on foot');
    }

    // -------------------------------------------------------------
    // Section E — mounting does not recreate the vehicle.
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'move-e1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        fireFrame(session, 0.016); // discovers the real vehicle

        // Simulate "this vehicle already has a runtime position that
        // differs from its spawn point" BEFORE this avatar ever mounts
        // it — architecturally legitimate: the runtime store's own
        // authority over `position` has nothing to do with mounting.
        const alreadyMoved = { x: realVehicle.position.x + 12, y: realVehicle.position.y, z: realVehicle.position.z + 7 };
        session._vehicleRuntimeInstances.setPosition(REAL_VEHICLE_ID, alreadyMoved);

        mountRealVehicle(session);

        const afterMount = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(afterMount.id === REAL_VEHICLE_ID, '15. id unchanged');
        assert(afterMount.spawnPosition.x === realVehicle.position.x && afterMount.spawnPosition.z === realVehicle.position.z,
            '16. spawnPosition unchanged — still the deterministic point');
        assert(afterMount.position.x === alreadyMoved.x && afterMount.position.z === alreadyMoved.z,
            '17. MOUNTING DID NOT RECREATE THE VEHICLE: position begins from its EXISTING runtime position, never reset back to spawnPosition by the act of mounting');
    }

    // -------------------------------------------------------------
    // Section F — repeated movement.
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'move-f1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        fireFrame(session, 0.016);
        mountRealVehicle(session);

        session.avatarKeyDown('w');
        for (let i = 0; i < 200; i++) {
            fireFrame(session, 0.05);
        }
        session.avatarKeyUp('w');

        const final = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(final.spawnPosition.x === realVehicle.position.x && final.spawnPosition.z === realVehicle.position.z,
            '18. spawnPosition === original spawnPosition after 200 frames of movement');
        assert(final.position.x !== final.spawnPosition.x || final.position.z !== final.spawnPosition.z,
            '19. position !== spawnPosition after movement');
    }

    // -------------------------------------------------------------
    // Section G — braking, through the real Control-key binding.
    // -------------------------------------------------------------
    {
        const coastStack = buildAvatarStack(registry, 'move-g1', startPosition);
        const coastSession = buildSession(registry, coastStack.avatarProfileUseCase, coastStack.avatarPresenceSession);
        coastSession.setAvatarControlMode(true);
        fireFrame(coastSession, 0.016);
        mountRealVehicle(coastSession);

        const brakeStack = buildAvatarStack(registry, 'move-g2', startPosition);
        const brakeSession = buildSession(registry, brakeStack.avatarProfileUseCase, brakeStack.avatarPresenceSession);
        brakeSession.setAvatarControlMode(true);
        fireFrame(brakeSession, 0.016);
        mountRealVehicle(brakeSession);

        // Identical cruise phase.
        coastSession.avatarKeyDown('w');
        brakeSession.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) {
            fireFrame(coastSession, 0.05);
            fireFrame(brakeSession, 0.05);
        }
        const cruiseCoastZ = coastSession._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position.z;
        const cruiseBrakeZ = brakeSession._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position.z;

        // Diverge: one just releases W (coasting); the other holds
        // Control (the real vehicle-braking key binding — see
        // VEHICLE_BRAKE_KEY) while also releasing W.
        coastSession.avatarKeyUp('w');
        brakeSession.avatarKeyUp('w');
        brakeSession.avatarKeyDown('control');
        for (let i = 0; i < 10; i++) {
            fireFrame(coastSession, 0.05);
            fireFrame(brakeSession, 0.05);
        }
        brakeSession.avatarKeyUp('control');

        const coastZ = coastSession._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position.z;
        const brakeZ = brakeSession._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position.z;
        assert((brakeZ - cruiseBrakeZ) < (coastZ - cruiseCoastZ),
            '20. BRAKING: holding the real Control-key binding covers strictly less ground than plain coasting over the same window — the existing braking capability (core/AvatarVehicleBrakingIntent.js + core/AvatarVehicleMovementCapability.js), connected here, never a new vehicle-specific implementation');
    }

    // -------------------------------------------------------------
    // Section H — unsupported vehicle types are never moved by this
    // session's own wiring, even while genuinely mounted on one.
    // -------------------------------------------------------------
    {
        const motorcyclePosition = { x: realVehicle.position.x + 900, y: realVehicle.position.y, z: realVehicle.position.z + 900 };
        const motorcycleId = 'vehicle:test-motorcycle';
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(
            registry, 'move-h1', new Position(motorcyclePosition.x, 0, motorcyclePosition.z)
        );
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // This codebase's own deterministic placement never produces a
        // MOTORCYCLE (core/VehiclePlacement.js places BICYCLE only) — so
        // reaching this state requires directly injecting one into the
        // runtime store and the mount relationship, exactly the
        // scenario Section H of this milestone's own brief describes:
        // "don't accidentally make MOTORCYCLE ... movable merely because
        // the generic runtime now supports VehicleInstance."
        const motorcycle = new VehicleInstance({
            id: motorcycleId, type: VehicleType.MOTORCYCLE,
            spawnPosition: motorcyclePosition, position: motorcyclePosition
        });
        // Seed the store the same way sync() would (there is no public
        // "inject" method — this store only ever adds what
        // nearbyVehicleInstances() itself discovers — so this test
        // reaches into the store's own internals deliberately, exactly
        // to prove the GATING happens one layer up, in
        // AvatarVehicleMovementController#canMove(), never in the store
        // itself).
        session._vehicleRuntimeInstances._instances.set(motorcycleId, motorcycle);
        session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(motorcycleId);

        session.avatarKeyDown('w');
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        session.avatarKeyUp('w');

        const after = session._vehicleRuntimeInstances.get(motorcycleId);
        assert(after.position.x === motorcyclePosition.x && after.position.z === motorcyclePosition.z,
            '21. UNSUPPORTED VEHICLE TYPE: a mounted MOTORCYCLE\'s own position is never touched by this session\'s frame loop, even while genuinely "mounted" on it and holding W');
    }

    console.log('✅ All Avatar-Vehicle Movement Controller (World View) Integration tests passed.');
}

await runTests();
