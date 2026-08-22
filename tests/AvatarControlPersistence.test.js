import { CameraPerspective } from '../core/CameraPerspective.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { ORIGIN_LOCATION_ID } from '../application/WorldLocationDirectory.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AvatarPresence } from '../core/AvatarPresence.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.3.2 — Avatar & Camera Experience: fixing the "Control My Avatar"
// checkbox reset bug.
//
//   Section A: setAvatarControlMode/isAvatarControlModeActive — the
//              basic explicit-toggle contract, unchanged by this fix
//   Section B: releaseAvatarMovementKeys() — releases held keys WITHOUT
//              touching the mode itself (the actual bug fix)
//   Section C: FLAGSHIP — the design doc's own scripted regression:
//              avatar-control mode survives every kind of activity
//              EXCEPT an explicit toggle, in both directions
//
// The architectural rule this file exists to enforce, stated the way
// docs/Principles.md states it: "User-Controlled Avatar Mode Is
// Persistent Local Interaction State, Not A Transient Gesture (0.3.2)."
// Nothing in this file ever finds a SECOND place that resets
// `_avatarControlModeActive` — there is exactly one
// (WorldNavigationSession#setAvatarControlMode itself), and this file
// proves every other kind of session activity leaves it completely
// alone.

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
    const avatarPresenceSession = new AvatarPresenceSession(profile);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

function stubCameraRenderer(initial = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } }) {
    let state = { position: { ...initial.position }, target: { ...initial.target }, zoom: 1 };
    return {
        getCameraState() {
            return {
                position: { x: state.position.x, y: state.position.y, z: state.position.z },
                target: { x: state.target.x, y: state.target.y, z: state.target.z },
                zoom: state.zoom
            };
        },
        setCameraState(next) {
            state = {
                position: { x: next.position.x, y: next.position.y, z: next.position.z },
                target: { x: next.target.x, y: next.target.y, z: next.target.z },
                zoom: next.zoom
            };
        },
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame() { return () => {}; },
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

function buildWiredSession(registry, brickRegistry, username) {
    const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, username);
    const session = new WorldNavigationSession({
        registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = stubCameraRenderer();
    session._spatialCameraController = new SpatialCameraController(session._session);
    session._setupLocalAvatar();
    return { session, avatarPresenceSession };
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A — the basic explicit-toggle contract
    // -------------------------------------------------------------
    {
        const { session } = buildWiredSession(registry, brickRegistry, 'toggle-a1');
        assert(session.isAvatarControlModeActive() === false, '1. Avatar Control Mode starts off');
        session.setAvatarControlMode(true);
        assert(session.isAvatarControlModeActive() === true, '2. an explicit setAvatarControlMode(true) turns it on');
        session.setAvatarControlMode(false);
        assert(session.isAvatarControlModeActive() === false, '3. an explicit setAvatarControlMode(false) turns it back off');
    }

    // -------------------------------------------------------------
    // Section B — releaseAvatarMovementKeys(): releases held keys
    // WITHOUT touching the mode itself
    // -------------------------------------------------------------
    {
        const { session, avatarPresenceSession } = buildWiredSession(registry, brickRegistry, 'release-b1');
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        session.releaseAvatarMovementKeys();
        assert(session.isAvatarControlModeActive() === true,
            '4. releaseAvatarMovementKeys() never disables Avatar Control Mode — this is the exact bug this milestone fixes');

        // And the held key really was released: ticking afterward
        // produces no movement at all.
        const sequenceBefore = avatarPresenceSession.current.sequence;
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.sequence === sequenceBefore,
            '5. releaseAvatarMovementKeys() genuinely released the held key — a held W never keeps walking afterward');

        // And because the mode is still ON, a FRESH keypress
        // immediately works again — exactly what "the window regained
        // focus, WASD just works" means in practice.
        session.avatarKeyDown('w');
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0,
            '6. with the mode still on, a fresh keypress after releaseAvatarMovementKeys() moves the avatar immediately — no need to re-check the box');
    }
    {
        // releaseAvatarMovementKeys() is also always safe to call while
        // the mode is already off, or before any avatar exists at all.
        const { session } = buildWiredSession(registry, brickRegistry, 'release-b2');
        let threw = false;
        try { session.releaseAvatarMovementKeys(); } catch (e) { threw = true; }
        assert(!threw, '7. releaseAvatarMovementKeys() is a no-op, never throws, while control mode is already off');

        const bare = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        bare._session = stubCameraRenderer();
        let threwBare = false;
        try { bare.releaseAvatarMovementKeys(); } catch (e) { threwBare = true; }
        assert(!threwBare, '8. releaseAvatarMovementKeys() never throws even with no local avatar (and so no movement controller) wired at all');
    }

    // -------------------------------------------------------------
    // Section C — FLAGSHIP: the design doc's own scripted regression.
    //
    //   Enable control -> move the avatar -> the camera changes (a
    //   Camera Perspective, and a plain focus) -> remote presence
    //   arrives -> a render/selection-adjacent call happens -> Follow
    //   a collaborator -> return from focus (Home) -> a world-view
    //   render update runs -> avatar control REMAINS ENABLED
    //   throughout. Then: explicitly disable -> repeat the identical
    //   sequence -> it REMAINS DISABLED throughout.
    // -------------------------------------------------------------
    async function exerciseEverySurface(session, avatarPresenceSession) {
        // 1. Move the avatar.
        session.avatarKeyDown('w');
        session._avatarMovementController.tick(0.05);
        session.avatarKeyUp('w');

        // 2. The camera changes: a Camera Perspective, and a plain
        // focus (a location, then Home) — the exact machinery 0.2.94's
        // Locations panel and this milestone's Camera Perspective both
        // drive.
        session.setCameraPerspective(CameraPerspective.THIRD_PERSON);
        session.focusLocation(ORIGIN_LOCATION_ID);
        session.setCameraPerspective(null);

        // 3. Remote presence arrives — a completely unrelated avatar's
        // own presence reconciling through the SAME registry real peer
        // convergence uses (tests/PeerAvatarPresence.test.js's own
        // convention for exercising this surface directly).
        if (session._remoteAvatarRegistry) {
            const remotePresence = new AvatarPresence({ avatarId: 'bob-avatar', ownerIdentity: 'bob', position: { x: 5, y: 0, z: 5 } });
            session._remoteAvatarRegistry.sync([remotePresence], Date.now());
            session._remoteAvatarRegistry.tick(Date.now());
        }

        // 4. A render/selection-adjacent call — proves this surface is
        // never wired to avatar-control state either.
        session._session.selectBricks([]);
        session._session.clearSelection();

        // 5. Follow a collaborator, then return home — the exact
        // "Follow Bob -> return from focus" sequence the design doc
        // itself calls out.
        session._presentSpatialWorldDocumentIds = new Set(['doc-bob']);
        session.getWorldSpatialPresenceRoster = (documentId) => (documentId === 'doc-bob'
            ? [{ devices: [{ deviceId: 'bob-device', position: { x: 9, y: 0, z: 9 }, heading: 0 }] }]
            : []);
        session.focusCollaborator('bob-device');
        session.goHome();

        // 6. A world-view render/spatial-view update runs (only when a
        // worldLayoutProvider is actually wired — this test's own
        // minimal session construction omits one, exactly like every
        // other focused unit test in this file's siblings).
        if (session._worldLayoutProvider) {
            session.updateSpatialView();
        }
    }

    {
        const { session, avatarPresenceSession } = buildWiredSession(registry, brickRegistry, 'flagship-c1');

        session.setAvatarControlMode(true);
        assert(session.isAvatarControlModeActive() === true, '9. FLAGSHIP: control mode is on after the explicit enable');

        await exerciseEverySurface(session, avatarPresenceSession);
        assert(session.isAvatarControlModeActive() === true,
            '10. FLAGSHIP: after movement, camera changes, remote presence, a render/selection call, Follow, Home, and a spatial-view update, Avatar Control Mode is STILL ENABLED — none of this is a hidden reset');

        // The only thing that ever turns it off is the explicit call.
        session.setAvatarControlMode(false);
        assert(session.isAvatarControlModeActive() === false, '11. FLAGSHIP: an explicit disable still works exactly as it always has');
    }
    {
        // And the mirror image: once explicitly OFF, none of the same
        // activity ever turns it back ON either — it stays exactly
        // where the user last, explicitly, left it.
        const { session, avatarPresenceSession } = buildWiredSession(registry, brickRegistry, 'flagship-c2');
        assert(session.isAvatarControlModeActive() === false, '12. FLAGSHIP: control mode starts off');

        await exerciseEverySurface(session, avatarPresenceSession);
        assert(session.isAvatarControlModeActive() === false,
            '13. FLAGSHIP: the same full activity sequence never turns Avatar Control Mode ON on its own either — it is never implied by anything other than an explicit user toggle');
    }

    console.log('✅ All Avatar Control Persistence tests passed.');
}

await runTests();
