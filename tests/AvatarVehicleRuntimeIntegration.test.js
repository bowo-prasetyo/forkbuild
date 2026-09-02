import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarVehicleInteractionController } from '../application/AvatarVehicleInteractionController.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { Position } from '../core/Position.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.83 — Avatar-Vehicle Mount/Dismount Runtime Integration,
// application/WorldNavigationSession.js's own wiring of
// application/AvatarVehicleInteractionController.js.
//
//   Section A: keyboard wiring — 'E' reaches the vehicle interaction
//              controller through the exact same avatarKeyDown/
//              avatarKeyUp seam W/A/S/D already use, gated by Avatar
//              Control Mode exactly like they already are
//   Section B: FLAGSHIP — a real avatar, in a real WorldNavigationSession,
//              approaching a real deterministic bicycle, mounting it,
//              then dismounting to a real clear destination — the
//              complete 0.9.73 -> 0.9.83 chain, end to end
//   Section C: regression — ordinary W/A/S/D movement is completely
//              unaffected by this milestone
//   Section D: architectural regression — no vehicle movement, no new
//              policy inside WorldNavigationSession itself
//
// Central architectural claim under test throughout: this milestone
// adds NO new mount/dismount policy inside WorldNavigationSession — it
// only constructs application/AvatarVehicleInteractionController.js
// alongside the existing AvatarMovementController, ticks it on the
// same animation frame, and forwards the 'E' key through the same
// avatarKeyDown/avatarKeyUp methods W/A/S/D already flow through. See
// docs/Roadmap.md, 0.9.83, for the full milestone story.

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

// vehicle:1179337264:-8,-1 — a real bicycle under DEFAULT_WORLD_SEED
// whose dismount destination (vehicle.x + 1, 0, vehicle.z) is clear of
// every real tree nearby. Found the exact same "compute it, don't
// guess" way tests/AvatarTreeCollisionIntegration.test.js already
// finds a real tree.
const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

async function runTests() {
    const registry = buildRegistry();
    const realVehicle = findRealVehicle();

    // -------------------------------------------------------------
    // Section A — keyboard wiring
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'vehicle-a1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);

        // Avatar Control Mode is OFF (the default) — 'E' is never
        // consumed, exactly like W/A/S/D already aren't.
        assert(session.avatarKeyDown('e') === false, '1. E is never consumed while Avatar Control Mode is off');
        assert(session.avatarVehicleMount() === null, '2. no mount can ever happen while Avatar Control Mode is off');

        session.setAvatarControlMode(true);
        assert(session.avatarKeyDown('e') === true, '3. E is recognized and consumed once Avatar Control Mode is on');
        assert(session.avatarKeyUp('e') === true, '4. releasing E is likewise recognized');

        // W is still recognized independently — the two controllers
        // never interfere with each other's own key vocabulary.
        assert(session.avatarKeyDown('w') === true, '5. W is still recognized, exactly as before this milestone');
        session.avatarKeyUp('w');
    }
    {
        // Turning Avatar Control Mode off releases the interaction key
        // without touching `mount` — mirrors AvatarMovementController's
        // own releaseAll() posture exactly.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'vehicle-a2');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session.avatarKeyDown('e');
        session.setAvatarControlMode(false);
        assert(session.avatarVehicleMount() === null, '6. turning Avatar Control Mode off never leaves a stray mount behind when nothing was ever mounted');
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: a real avatar, a real WorldNavigationSession,
    // a real deterministic bicycle — mount, then dismount, through the
    // complete 0.9.73 -> 0.9.83 chain.
    // -------------------------------------------------------------
    {
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'vehicle-flagship', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        assert(session.avatarVehicleMount() === null, '7. FLAGSHIP: starts unmounted, standing right next to a real bicycle');

        // Press E: mount.
        session.avatarKeyDown('e');
        session._avatarVehicleInteractionController.tick();
        const mount = session.avatarVehicleMount();
        assert(mount !== null && mount.vehicleId === REAL_VEHICLE_ID,
            '8. FLAGSHIP: pressing E next to a real, deterministic bicycle mounts it, through the entire target-resolution + mount-transition chain');
        assert(
            avatarPresenceSession.current.position.x === startPosition.x
            && avatarPresenceSession.current.position.z === startPosition.z,
            '9. FLAGSHIP: mounting never moves the avatar'
        );

        // Genuine release + re-press to dismount (see
        // application/AvatarVehicleInteractionController.js's own
        // header for why merely continuing to hold E would not — this
        // is the SAME held-key discipline tests/AvatarVehicleInteractionController.test.js
        // already proves in isolation).
        session.avatarKeyUp('e');
        session.avatarKeyDown('e');
        session._avatarVehicleInteractionController.tick();

        assert(session.avatarVehicleMount() === null,
            '10. FLAGSHIP: pressing E again while mounted dismounts, through the entire destination-resolution + clearance + dismount-transition chain');
        const finalPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalPosition.x - (realVehicle.position.x + 1)) < 1e-9
            && finalPosition.y === 0
            && Math.abs(finalPosition.z - realVehicle.position.z) < 1e-9,
            '11. FLAGSHIP: the avatar lands at the exact resolved dismount destination'
        );

        // The local avatar's own wire shape is untouched — no
        // vehicle-related field ever joins it (mirroring every prior
        // avatar-movement flagship's own non-leakage assertion).
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '12. FLAGSHIP: AvatarPresence\'s own JSON shape is completely unchanged — mount state is never part of it');
    }

    // -------------------------------------------------------------
    // Section C — regression: ordinary movement is unaffected
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'vehicle-c1');
        // A bare AvatarMovementController (no vehicle controller
        // involved at all) still moves the avatar exactly as before —
        // proving this milestone changed nothing about
        // AvatarMovementController's own tick() or pipeline.
        const movementController = new AvatarMovementController(avatarPresenceSession);
        movementController.keyDown('w');
        movementController.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '13. ordinary W movement is completely unaffected by this milestone');
        movementController.keyUp('w');
    }
    {
        // A real WorldNavigationSession: W still moves the avatar even
        // with the vehicle interaction controller wired in alongside
        // it, and E never interferes with W or vice versa.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'vehicle-c2');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '14. WorldNavigationSession: ordinary W movement still works with the vehicle controller wired in');
        assert(session.avatarVehicleMount() === null, '15. ...and W alone never mounts anything, no matter how many ticks pass');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section D — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/WorldNavigationSession.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(codeOnly.includes('AvatarVehicleInteractionController'),
            '16. application/WorldNavigationSession.js does construct application/AvatarVehicleInteractionController.js — the integration this milestone exists to make');
        assert(!/vehicleSpeed|VehicleMovement|vehicleVelocity/.test(codeOnly),
            '17. application/WorldNavigationSession.js never references vehicle speed, vehicle movement, or vehicle velocity — this milestone deliberately never touches vehicle movement');
        // The composition itself stays a one-line construction + a
        // one-line tick() call + a pass-through in avatarKeyDown/
        // avatarKeyUp — never a second copy of the mount/dismount rule
        // inlined into this file.
        assert(!codeOnly.includes('deriveAvatarVehicleMount')
            && !codeOnly.includes('deriveAvatarVehicleDismountTransition')
            && !codeOnly.includes('resolveAvatarVehicleInteractionTarget'),
            '18. WorldNavigationSession.js never calls the 0.9.76/0.9.78/0.9.82 core functions directly — that composition lives entirely inside AvatarVehicleInteractionController, never duplicated here');
    }

    console.log('✅ All Avatar-Vehicle Runtime Integration tests passed.');
}

await runTests();
