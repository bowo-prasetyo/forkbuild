import { CameraPerspective, isValidCameraPerspective, computeCameraFraming } from '../core/CameraPerspective.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.3.2 — Avatar & Camera Experience: Camera Perspective.
//
//   Section A: core/CameraPerspective.js — pure offset derivation
//   Section B: WorldNavigationSession — getCameraPerspective/setCameraPerspective
//   Section C: a set perspective re-frames on every avatar presence update
//   Section D: turning a perspective OFF never snaps the camera anywhere
//   Section E: focusCollaborator() honors the current perspective
//   Section F: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: a Camera
// Perspective determines an OFFSET; it never replaces the camera
// machinery — every perspective framing still reaches the renderer
// through the SAME SpatialCameraController#applyFraming() every other
// camera-focus caller in this codebase already uses (application/
// CameraFocusAnimator.js's own glide, application/WorldNavigationSession.js#
// focusLocation()/focusCollaborator()) — no second camera-movement
// mechanism. And a perspective is purely LOCAL UI/navigation state:
// never persisted, never signed, never broadcast to any collaborator.

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

// A stateful camera render-facade stub — same shape
// tests/WorldViewLocationNavigation.test.js's own stubCameraRenderer()
// already establishes: it actually remembers what was set, so a
// perspective's framing can be read back and asserted on.
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

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A — core/CameraPerspective.js: pure offset derivation
    // -------------------------------------------------------------
    {
        assert(isValidCameraPerspective(CameraPerspective.FIRST_PERSON) === true, '1. FIRST_PERSON is a valid perspective');
        assert(isValidCameraPerspective(CameraPerspective.THIRD_PERSON) === true, '2. THIRD_PERSON is a valid perspective');
        assert(isValidCameraPerspective(CameraPerspective.BIRD_EYE) === true, '3. BIRD_EYE is a valid perspective');
        assert(isValidCameraPerspective('orbit') === false, '4. an un-shipped perspective name is not valid — ORBIT/FREE is null, not a fourth string');
        assert(isValidCameraPerspective(null) === false, '5. null itself is not a "valid perspective" — it is the absence of one, checked separately by callers');
    }
    {
        const framing = computeCameraFraming(CameraPerspective.FIRST_PERSON, { x: 0, y: 0, z: 0 }, 0);
        assert(Math.abs(framing.position.x) < 1e-9 && Math.abs(framing.position.z) < 1e-9,
            '6. FIRST_PERSON: camera position stays horizontally at the avatar\'s own position');
        assert(framing.position.y > 0, '7. FIRST_PERSON: camera sits at eye height, above the avatar\'s feet');
        assert(framing.target.z > framing.position.z, '8. FIRST_PERSON facing 0 (toward +Z): the look target is ahead of the camera along +Z');
    }
    {
        const framing = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: 0, y: 0, z: 0 }, 0);
        assert(framing.position.z < 0, '9. THIRD_PERSON facing 0 (toward +Z): the camera sits BEHIND the avatar, on -Z');
        assert(framing.position.y > 0, '10. THIRD_PERSON: the camera sits above ground level');
        assert(Math.abs(framing.target.x) < 1e-9 && Math.abs(framing.target.z) < 1e-9,
            '11. THIRD_PERSON: the look target stays horizontally centered on the avatar itself');
    }
    {
        const framing = computeCameraFraming(CameraPerspective.BIRD_EYE, { x: 5, y: 0, z: 7 }, 0);
        assert(framing.position.x === 5 && framing.position.z === 7, '12. BIRD_EYE: camera sits directly overhead, same X/Z as the avatar');
        assert(framing.position.y > 10, '13. BIRD_EYE: camera sits well above the avatar');
        assert(framing.target.x === 5 && framing.target.y === 0 && framing.target.z === 7,
            '14. BIRD_EYE: looks straight down at the avatar\'s own position');

        // Deliberately heading-independent — never spins with the
        // avatar's own turning.
        const facingEast = computeCameraFraming(CameraPerspective.BIRD_EYE, { x: 5, y: 0, z: 7 }, 90);
        assert(JSON.stringify(facingEast) === JSON.stringify(framing),
            '15. BIRD_EYE: heading has no effect at all on the framing — it never rotates with the avatar');
    }
    {
        // A null/missing heading degrades to facing +Z (0 degrees)
        // rather than throwing or producing NaN.
        const framing = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: 0, y: 0, z: 0 }, null);
        assert(Number.isFinite(framing.position.x) && Number.isFinite(framing.position.z),
            '16. a null heading degrades gracefully (treated as facing +Z), never NaN');
    }
    {
        assert(computeCameraFraming('not-a-real-perspective', { x: 0, y: 0, z: 0 }, 0) === null,
            '17. an unrecognized perspective string returns null rather than a fabricated framing');
    }
    {
        // Determinism: the same inputs always produce the same output
        // — the same guarantee every other pure geometry module in
        // this codebase already provides.
        const a = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: 12, y: 0, z: -4 }, 33);
        const b = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: 12, y: 0, z: -4 }, 33);
        assert(JSON.stringify(a) === JSON.stringify(b), '18. computeCameraFraming is a pure, deterministic function of its inputs');
    }

    // -------------------------------------------------------------
    // Section B — WorldNavigationSession: getCameraPerspective/setCameraPerspective
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-b1');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);

        assert(session.getCameraPerspective() === null, '19. Camera Perspective starts off (null — the free/orbit camera)');
        assert(session.setCameraPerspective(CameraPerspective.THIRD_PERSON) === true, '20. setCameraPerspective accepts a real perspective');
        assert(session.getCameraPerspective() === CameraPerspective.THIRD_PERSON, '21. getCameraPerspective reflects what was just set');
        assert(session.setCameraPerspective('not-a-real-perspective') === false, '22. an unrecognized value is rejected outright');
        assert(session.getCameraPerspective() === CameraPerspective.THIRD_PERSON, '23. a rejected setCameraPerspective() call changes nothing — still the previous perspective');
        assert(session.setCameraPerspective(null) === true, '24. null is always an accepted value — clears back to free/orbit');
        assert(session.getCameraPerspective() === null, '25. getCameraPerspective reflects the clear');
    }
    {
        // Turning a perspective ON immediately re-frames toward the
        // avatar's CURRENT position — never waits for the next
        // movement tick.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-b2');
        avatarPresenceSession.update({ position: { x: 3, y: 0, z: 4 } });
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);

        session.setCameraPerspective(CameraPerspective.BIRD_EYE);
        const cameraState = session._session.getCameraState();
        assert(cameraState.target.x === 3 && cameraState.target.z === 4,
            '26. setCameraPerspective() re-frames immediately toward the avatar\'s CURRENT position, without waiting for a movement tick');
    }
    {
        // No local avatar at all — never throws, simply has nothing
        // to frame toward yet.
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        let threw = false;
        try { session.setCameraPerspective(CameraPerspective.FIRST_PERSON); } catch (e) { threw = true; }
        assert(!threw, '27. setCameraPerspective() with no local avatar wired never throws');
        assert(session.getCameraPerspective() === CameraPerspective.FIRST_PERSON, '28. ...and still records the chosen perspective for whenever an avatar does exist');
    }

    // -------------------------------------------------------------
    // Section C — a set perspective re-frames on every avatar
    // presence update
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-c1');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();

        session.setCameraPerspective(CameraPerspective.THIRD_PERSON);
        avatarPresenceSession.update({ position: { x: 10, y: 0, z: 0 }, rotation: { y: 90 } });
        const expected = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: 10, y: 0, z: 0 }, 90);
        const cameraState = session._session.getCameraState();
        assert(Math.abs(cameraState.position.x - expected.position.x) < 1e-9
            && Math.abs(cameraState.position.z - expected.position.z) < 1e-9,
            '29. every avatar presence update re-frames the camera using the CURRENT perspective\'s own offset, not a preserved arbitrary orbit offset');
        assert(Math.abs(cameraState.target.x - expected.target.x) < 1e-9,
            '30. the look target also matches the perspective\'s own derivation exactly');
    }
    {
        // A set perspective takes over regardless of "Follow Avatar" —
        // selecting a perspective is a stronger, always-on form of
        // following your own avatar.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-c2');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();

        assert(session.isFollowingAvatar() === false, 'sanity: Follow Avatar starts off');
        session.setCameraPerspective(CameraPerspective.FIRST_PERSON);
        const before = session._session.getCameraState();
        avatarPresenceSession.update({ position: { x: 1, y: 0, z: 1 } });
        const after = session._session.getCameraState();
        assert(JSON.stringify(before) !== JSON.stringify(after),
            '31. a set perspective moves the camera on avatar movement even while Follow Avatar itself is off');
    }

    // -------------------------------------------------------------
    // Section D — turning a perspective OFF never snaps the camera
    // anywhere
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-d1');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();

        session.setCameraPerspective(CameraPerspective.BIRD_EYE);
        avatarPresenceSession.update({ position: { x: 8, y: 0, z: 2 } });
        const beforeClear = session._session.getCameraState();
        session.setCameraPerspective(null);
        const afterClear = session._session.getCameraState();
        assert(JSON.stringify(beforeClear) === JSON.stringify(afterClear),
            '32. clearing back to "Free" never moves the camera — the free/orbit camera simply resumes from wherever the perspective last left it');

        // And further avatar movement, with the perspective now off,
        // no longer re-frames the camera at all (Follow Avatar is
        // still off too).
        avatarPresenceSession.update({ position: { x: 20, y: 0, z: 20 } });
        const afterMove = session._session.getCameraState();
        assert(JSON.stringify(afterClear) === JSON.stringify(afterMove),
            '33. with the perspective cleared and Follow Avatar off, further avatar movement no longer touches the camera');
    }

    // -------------------------------------------------------------
    // Section E — focusCollaborator() honors the current perspective
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-e1');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();

        // Reach into the same internal roster surface
        // tests/CollaborativeSpatialAwareness.test.js's own Section C
        // exercises through real peer convergence — stubbed directly
        // here since this test is entirely about the FRAMING
        // focusCollaborator() picks, not about how a roster converges.
        session._presentSpatialWorldDocumentIds = new Set(['doc-bob']);
        session.getWorldSpatialPresenceRoster = (documentId) => {
            if (documentId !== 'doc-bob') return [];
            return [{ devices: [{ deviceId: 'bob-device', position: { x: 15, y: 0, z: 9 }, heading: 45 }] }];
        };

        // No perspective selected: the original fixed LOCATION_FOCUS_OFFSET
        // box framing, exactly as 0.3.1 always produced.
        assert(session.focusCollaborator('bob-device') === true, '34. focusCollaborator finds the device and returns true');
        const plainFocus = session._session.getCameraState();
        assert(plainFocus.target.x === 15 && plainFocus.target.z === 9,
            '35. with no perspective selected, focusCollaborator targets Bob\'s own position exactly as before this milestone');

        // With a perspective selected, the SAME call now uses that
        // perspective's own offset instead.
        session.setCameraPerspective(CameraPerspective.THIRD_PERSON);
        session.focusCollaborator('bob-device');
        const perspectiveFocus = session._session.getCameraState();
        assert(JSON.stringify(perspectiveFocus) !== JSON.stringify(plainFocus),
            '36. with a perspective selected, focusCollaborator produces a DIFFERENT framing — the perspective\'s own offset, not the fixed LOCATION_FOCUS_OFFSET box');
    }
    {
        // A deviceId with no known position is still a no-op (false),
        // regardless of whether a perspective is selected.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'camera-e2');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();
        session.setCameraPerspective(CameraPerspective.FIRST_PERSON);
        session._presentSpatialWorldDocumentIds = new Set();
        assert(session.focusCollaborator('nobody') === false, '37. focusCollaborator remains a clean no-op for an unknown device, perspective selected or not');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: the design doc's own scripted scenario.
    //
    //   Enter World View -> select Third Person -> camera immediately
    //   reframes behind the avatar -> avatar walks -> camera tracks
    //   continuously with the SAME fixed offset -> switch to Bird's-
    //   Eye -> camera jumps straight overhead -> clear back to Free ->
    //   camera stays exactly where Bird's-Eye left it -> nothing here
    //   ever touches AvatarPresence, AvatarProfile, or any document.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-camera');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
        const profileJsonBefore = JSON.stringify(profile.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;

        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: registry
        });
        session._session = stubCameraRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        session._setupLocalAvatar();

        // 1. Select Third Person — immediate reframe, no waiting.
        session.setCameraPerspective(CameraPerspective.THIRD_PERSON);
        let expected = computeCameraFraming(CameraPerspective.THIRD_PERSON, { x: 0, y: 0, z: 0 }, 0);
        let cameraState = session._session.getCameraState();
        assert(Math.abs(cameraState.position.z - expected.position.z) < 1e-9,
            '38. FLAGSHIP: selecting Third Person immediately places the camera behind Alice');

        // 2. Alice walks — the camera keeps tracking with the SAME
        // fixed offset on every step, never drifting to an arbitrary
        // orbit position.
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) {
            session._avatarMovementController.tick(0.05);
        }
        session.avatarKeyUp('w');
        const midPosition = avatarPresenceSession.current.position;
        assert(midPosition.z > 0, 'sanity: Alice actually walked forward');
        expected = computeCameraFraming(CameraPerspective.THIRD_PERSON, midPosition, avatarPresenceSession.current.rotation.y);
        cameraState = session._session.getCameraState();
        assert(Math.abs(cameraState.position.x - expected.position.x) < 1e-6
            && Math.abs(cameraState.position.z - expected.position.z) < 1e-6,
            '39. FLAGSHIP: the camera keeps tracking Alice with Third Person\'s own fixed offset throughout her walk');

        // 3. Switch to Bird's-Eye — an immediate, different framing.
        session.setCameraPerspective(CameraPerspective.BIRD_EYE);
        cameraState = session._session.getCameraState();
        assert(cameraState.target.x === midPosition.x && cameraState.target.z === midPosition.z,
            '40. FLAGSHIP: switching to Bird\'s-Eye immediately looks straight down at Alice\'s current position');
        assert(cameraState.position.y > 10, '41. FLAGSHIP: Bird\'s-Eye sits well above her');

        // 4. Clear back to Free — the camera stays exactly where
        // Bird's-Eye left it; nothing snaps anywhere.
        const beforeClear = session._session.getCameraState();
        session.setCameraPerspective(null);
        const afterClear = session._session.getCameraState();
        assert(JSON.stringify(beforeClear) === JSON.stringify(afterClear),
            '42. FLAGSHIP: clearing back to Free never snaps the camera — it simply resumes exactly where Bird\'s-Eye left it');

        // 5. Nothing here ever touched AvatarPresence's own wire
        // shape, AvatarProfile, or any document — a Camera Perspective
        // is purely local UI/navigation state.
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '43. FLAGSHIP: AvatarPresence\'s own JSON shape is exactly what 0.2.33/0.2.37 established — no perspective field ever joins it');
        assert(JSON.stringify(avatarProfileUseCase.getProfile().toJSON()) === profileJsonBefore,
            '44. FLAGSHIP: AvatarProfile is completely untouched by Camera Perspective');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '45. FLAGSHIP: no document is ever created by selecting or changing a Camera Perspective');
    }

    console.log('✅ All Camera Perspective tests passed.');
}

await runTests();
