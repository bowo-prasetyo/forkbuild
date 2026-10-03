import { Position } from '../core/Position.js';
import { VehicleType } from '../core/VehicleType.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { InventoryEntryKind, createAvatarInventoryEntry, withEntryAdded } from '../core/AvatarInventory.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A rider sits still on a moving vehicle. Riding updates the avatar's position
// and heading from the vehicle, so the animation it had when it got on must be
// cleared too: deploying a carried bicycle with Q mid hands-free walk (Alt+W)
// used to keep WALKING for the whole ride, bobbing the body on the saddle.
//
//   Section A: Alt+W walk, Q deploys a carried bicycle -> IDLE while riding
//   Section B: on foot again after dismounting, the walk animates as usual

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

function fireFrame(session, deltaSeconds) {
    for (const callback of session._session.calls.onAnimationFrameCallbacks) {
        callback(deltaSeconds);
    }
}

function runTests() {
    const registry = buildRegistry();
    // Open ground near the origin, away from the fixture vehicles other tests use.
    const startPosition = new Position(3, 0, 3);
    const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'ride-anim', startPosition);
    const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
    session.setAvatarControlMode(true);
    const store = session.avatarInventoryStore();
    store.set(withEntryAdded(store.get(), createAvatarInventoryEntry({ id: 'carried-bicycle', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE })));

    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    session.avatarKeyDown('Alt');
    session.avatarKeyDown('w');
    session.avatarKeyUp('w');
    session.avatarKeyUp('Alt');
    for (let i = 0; i < 5; i++) {
        fireFrame(session, 0.05);
    }
    assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING, '1. sanity: walking hands-free');

    session.avatarKeyDown('q');
    fireFrame(session, 0.05);
    session.avatarKeyUp('q');
    assert(session.avatarVehicleMount() !== null, '2. sanity: Q deployed the carried bicycle and mounted it');

    const before = avatarPresenceSession.current.position;
    for (let i = 0; i < 10; i++) {
        fireFrame(session, 0.05);
    }
    const after = avatarPresenceSession.current.position;
    assert(after.x !== before.x || after.z !== before.z, '3. sanity: the hands-free intent keeps the bicycle moving');
    assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE,
        `4. FLAGSHIP: the rider sits still on the moving bicycle (got ${avatarPresenceSession.current.animation})`);

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    session.avatarKeyDown('w'); // a plain W ends the hands-free ride
    session.avatarKeyUp('w');
    for (let i = 0; i < 40; i++) {
        fireFrame(session, 0.05);
    }
    session.avatarKeyDown('e');
    fireFrame(session, 0.05);
    session.avatarKeyUp('e');
    assert(session.avatarVehicleMount() === null, '5. sanity: dismounted');
    session.avatarKeyDown('w');
    fireFrame(session, 0.05);
    fireFrame(session, 0.05);
    assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING, '6. walking on foot animates again');
    session.avatarKeyUp('w');

    console.log('✅ All Avatar Riding Animation tests passed.');
}

runTests();
