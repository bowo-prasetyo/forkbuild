import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { License, LicenseId } from '../core/License.js';

// 0.2.36 — Local Avatar Movement & Animation.
//
//   Section A: core/AvatarMovementState             — pure input intent
//   Section B: core/AvatarMovementSimulation         — pure kinematics
//   Section C: application/AvatarMovementController  — key state -> presence
//   Section D: WorldNavigationSession integration (spy facade)
//   Section E: FLAGSHIP — the design doc's own scripted scenario
//
// Same "real logic, fake low-level renderer" convention
// tests/AvatarRendering.test.js already established: Section D bypasses
// WorldNavigationSession.start()'s real Renderer/WebGL entirely by
// wiring a duck-typed spy facade directly onto session._session.

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

function spyFacade() {
    const calls = { setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [], removeLocalAvatar: 0, onAnimationFrameCallbacks: [] };
    let cameraState = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
        getCameraState: () => cameraState,
        setCameraState: (state) => { cameraState = state; },
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        selectBricks() {}, hoverBrick() {}, showPreview() {}, hidePreview() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/AvatarMovementState
    // -------------------------------------------------------------
    {
        const idle = AvatarMovementState.idle();
        assert(idle.forwardAxis === 0 && idle.turnAxis === 0, '1. idle() has no forward/turn intent');
        assert(idle.moving === false, '2. idle() is not "moving"');
        assert(idle.speedMode === 'idle', '3. idle() speedMode is "idle"');
    }
    {
        const walking = new AvatarMovementState({ forwardAxis: 1 });
        assert(walking.moving === true && walking.speedMode === 'walk', '4. forward intent alone is "walk"');
        const running = new AvatarMovementState({ forwardAxis: 1, running: true });
        assert(running.speedMode === 'run', '5. forward + running is "run"');
    }
    {
        const turningOnly = new AvatarMovementState({ turnAxis: -1 });
        assert(turningOnly.moving === true, '6. turning alone still counts as "moving" (rotating in place)');
        assert(turningOnly.speedMode === 'idle', '7. ...but speedMode stays idle — turning alone is not a gait');
    }
    {
        const clamped = new AvatarMovementState({ forwardAxis: 99, turnAxis: -42 });
        assert(clamped.forwardAxis === 1 && clamped.turnAxis === -1, '8. axes are clamped to -1/0/1 regardless of input magnitude');
    }

    // -------------------------------------------------------------
    // Section B — core/AvatarMovementSimulation
    // -------------------------------------------------------------
    {
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: 1 }), deltaSeconds: 1
        });
        assert(result.position.z > 0 && Math.abs(result.position.x) < 1e-9, '9. forward movement at rotationY=0 moves along +Z, not sideways');
    }
    {
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: -1 }), deltaSeconds: 1
        });
        assert(result.position.z < 0, '10. S moves the opposite way from W');
    }
    {
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ turnAxis: 1 }), deltaSeconds: 1
        });
        assert(result.rotationY !== 0, '11. A/D turning changes rotationY');
        assert(result.position.x === 0 && result.position.z === 0, '12. turning alone never moves the avatar');
    }
    {
        const walk = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: 1, running: false }), deltaSeconds: 1
        });
        const run = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: 1, running: true }), deltaSeconds: 1
        });
        assert(run.position.z > walk.position.z, '13. RUNNING covers more ground than WALKING in the same time');
        assert(walk.animation === AvatarAnimationState.WALKING, '14. forward + not running resolves to WALKING');
        assert(run.animation === AvatarAnimationState.RUNNING, '15. forward + running resolves to RUNNING');
    }
    {
        // Frame-rate independence: ten 0.02s ticks cover the same
        // ground as one 0.2s tick — the whole point of driving
        // everything from deltaSeconds instead of a frame count. Both
        // kept well under the function's own per-tick deltaSeconds
        // clamp (0.25s — a single freak huge deltaSeconds is tested
        // separately below) and under MAX_STEP_PER_TICK's distance
        // clamp, so this test is purely about frame-rate independence,
        // not about either defensive clamp.
        let position = { x: 0, y: 0, z: 0 };
        let rotationY = 0;
        for (let i = 0; i < 10; i++) {
            const r = simulateAvatarMovement({
                position, rotationY, verticalVelocity: 0, grounded: true,
                movementState: new AvatarMovementState({ forwardAxis: 1 }), deltaSeconds: 0.02
            });
            position = r.position;
            rotationY = r.rotationY;
        }
        const single = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: 1 }), deltaSeconds: 0.2
        });
        assert(Math.abs(position.z - single.position.z) < 1e-9, '16. ten 0.02s ticks and one 0.2s tick cover identical distance (frame-rate independent)');
    }
    {
        // Space from the ground leaves the ground and, unforced,
        // eventually returns to it — "jump returns to the ground."
        let position = { x: 0, y: 0, z: 0 };
        let verticalVelocity = 0;
        let grounded = true;
        let leftGround = false;
        let returned = false;
        for (let i = 0; i < 60; i++) {
            const movementState = i === 0
                ? new AvatarMovementState({ jumpRequested: true })
                : AvatarMovementState.idle();
            const r = simulateAvatarMovement({ position, rotationY: 0, verticalVelocity, grounded, movementState, deltaSeconds: 0.05 });
            position = r.position; verticalVelocity = r.verticalVelocity; grounded = r.grounded;
            if (!grounded) leftGround = true;
            if (leftGround && grounded) { returned = true; break; }
        }
        assert(leftGround, '17. pressing Space from the ground leaves the ground');
        assert(returned, '18. the avatar returns to the ground on its own (a jump, not permanent flight)');
        assert(position.y === 0, '19. the landed position sits exactly at ground level');
    }
    {
        const airborne = simulateAvatarMovement({
            position: { x: 0, y: 1, z: 0 }, rotationY: 0, verticalVelocity: 3, grounded: false,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.05
        });
        assert(airborne.animation === AvatarAnimationState.JUMPING, '20. airborne always reports JUMPING, even with no movement keys held');
    }
    {
        const idle = simulateAvatarMovement({
            position: { x: 1, y: 0, z: 2 }, rotationY: 45, verticalVelocity: 0, grounded: true,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.5
        });
        assert(idle.animation === AvatarAnimationState.IDLE, '21. no input, grounded => IDLE');
        assert(idle.position.x === 1 && idle.position.z === 2 && idle.rotationY === 45, '22. no input never changes position or rotation');
    }
    {
        const result = simulateAvatarMovement({
            position: { x: NaN, y: Infinity, z: -Infinity }, rotationY: NaN, verticalVelocity: NaN, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: 1 }), deltaSeconds: NaN
        });
        assert(Number.isFinite(result.position.x) && Number.isFinite(result.position.y) && Number.isFinite(result.position.z),
            '23. NaN/Infinity position input never propagates to the result');
        assert(Number.isFinite(result.rotationY), '24. NaN rotationY input never propagates');
    }
    {
        // An extreme deltaSeconds (a backgrounded tab resuming) is
        // clamped, never producing a teleport-sized step.
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: new AvatarMovementState({ forwardAxis: 1, running: true }), deltaSeconds: 100000
        });
        assert(result.position.z < 10, '25. an extreme deltaSeconds never produces a teleport-sized step');
    }
    {
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 1000, grounded: false,
            movementState: AvatarMovementState.idle(), deltaSeconds: 1
        });
        assert(result.position.y >= 0, '26. y never goes below ground level');
        assert(result.position.y < 100, '27. y stays within a reasonable vertical bound even for an extreme vertical velocity');
    }
    {
        // 0.3.2 — `groundHeight`: omitted entirely (every pre-0.3.2
        // caller, and every test above this one), the flat Y=0 plane
        // is exactly what it always was.
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.5
        });
        assert(result.position.y === 0, '27a. omitting groundHeight keeps the original flat Y=0 plane');
    }
    {
        // A non-zero groundHeight is where a GROUNDED avatar snaps to
        // — standing on a brick's own top face, not the absolute
        // world origin.
        const result = simulateAvatarMovement({
            position: { x: 0, y: 3, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.5, groundHeight: 3
        });
        assert(result.position.y === 3, '27b. a grounded avatar snaps to the given groundHeight, never back to Y=0');
    }
    {
        // Falling toward a raised groundHeight lands ON it, not
        // through it to Y=0.
        const result = simulateAvatarMovement({
            position: { x: 0, y: 5, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: false,
            movementState: AvatarMovementState.idle(), deltaSeconds: 1, groundHeight: 3
        });
        assert(result.position.y >= 3, '27c. falling toward a raised groundHeight never overshoots past it toward Y=0');
    }
    {
        // The "reasonable vertical bounds" clamp shifts WITH
        // groundHeight — an extreme upward velocity still clamps to a
        // bound relative to the surface the avatar stands on, not an
        // absolute Y=8 that would sit BELOW a tall groundHeight.
        const result = simulateAvatarMovement({
            position: { x: 0, y: 10, z: 0 }, rotationY: 0, verticalVelocity: 1000, grounded: false,
            movementState: AvatarMovementState.idle(), deltaSeconds: 1, groundHeight: 10
        });
        assert(result.position.y >= 10, '27d. the vertical clamp never pulls the avatar below its own groundHeight');
    }
    {
        // NaN/non-finite groundHeight degrades to the original flat
        // plane rather than propagating NaN through position.y.
        const result = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.5, groundHeight: NaN
        });
        assert(result.position.y === 0, '27e. a non-finite groundHeight degrades gracefully to the flat Y=0 plane, never NaN');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarMovementController
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.keyDown('w') === true, '28. W is recognized');
        assert(controller.keyDown('W') === true, '29. key matching is case-insensitive');
        assert(controller.keyDown('Shift') === true, '30. Shift is recognized');
        assert(controller.keyDown(' ') === true, '31. Space (as " ") is recognized');
        assert(controller.keyDown('ArrowUp') === false, '32. arrow keys are never claimed — they already mean "nudge the selection"');
        assert(controller.keyDown('q') === false, '33. an unrelated key is never claimed');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        const sequenceBefore = avatarPresenceSession.current.sequence;
        const result = controller.tick(0.5);
        assert(result === null, '34. an idle tick (nothing held) returns null — no update published');
        assert(avatarPresenceSession.current.sequence === sequenceBefore, '35. ...and sequence never advances while genuinely idle');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        const sequenceBefore = avatarPresenceSession.current.sequence;
        const positionBefore = avatarPresenceSession.current.position;
        const result = controller.tick(0.5);
        assert(result !== null, '36. a moving tick publishes an update');
        assert(avatarPresenceSession.current.sequence === sequenceBefore + 1, '37. sequence advances by exactly 1 per accepted update');
        assert(avatarPresenceSession.current.position.z > positionBefore.z, '38. the avatar actually moved forward');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING, '39. animation becomes WALKING');
    }
    {
        const walkStack = buildAvatarStack(registry, 'movement-c4-walk');
        const walkController = new AvatarMovementController(walkStack.avatarPresenceSession);
        walkController.keyDown('w');
        walkController.tick(1);
        const walkDistance = walkStack.avatarPresenceSession.current.position.z;

        const runStack = buildAvatarStack(registry, 'movement-c4-run');
        const runController = new AvatarMovementController(runStack.avatarPresenceSession);
        runController.keyDown('w');
        runController.keyDown('shift');
        runController.tick(1);
        const runDistance = runStack.avatarPresenceSession.current.position.z;

        assert(runDistance > walkDistance, '40. Shift+W covers more ground than W alone over the same tick');
        assert(runStack.avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING, '41. animation becomes RUNNING while Shift is held');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c5');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown(' ');
        controller.tick(0.05);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.JUMPING, '42. pressing Space transitions to JUMPING');
        controller.keyUp(' ');
        let landed = false;
        for (let i = 0; i < 80; i++) {
            controller.tick(0.05);
            if (avatarPresenceSession.current.animation === AvatarAnimationState.IDLE) { landed = true; break; }
        }
        assert(landed, '43. the avatar returns to IDLE once it lands and Space is released');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c6');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING, '44. WALKING while W is held');
        controller.keyUp('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE, '45. releasing W settles back to IDLE on the very next tick');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c7');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('d');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.rotation.y !== 0, '46. holding D rotates the avatar');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'movement-c8');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        controller.keyDown('shift');
        controller.releaseAll();
        const sequenceBefore = avatarPresenceSession.current.sequence;
        controller.tick(0.5);
        assert(avatarPresenceSession.current.sequence === sequenceBefore, '47. releaseAll() stops movement — the very next tick is a no-op');
    }
    {
        const controller = new AvatarMovementController(null);
        let threw = false;
        try { controller.tick(0.5); } catch (e) { threw = true; }
        assert(!threw, '48. tick() on a controller with no presence session never throws');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession integration (spy facade)
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-d1');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();

        assert(session.isAvatarControlModeActive() === false, '49. Avatar Control Mode starts off');
        assert(session.avatarKeyDown('w') === false, '50. keys are ignored entirely while control mode is off');
        assert(facade.calls.onAnimationFrameCallbacks.length === 1, '51. movement ticking is wired into the render frame loop on setup');

        session.setAvatarControlMode(true);
        assert(session.isAvatarControlModeActive() === true, '52. setAvatarControlMode(true) turns it on');
        assert(session.avatarKeyDown('w') === true, '53. W is consumed once control mode is on');
        assert(session.avatarKeyDown('q') === false, '54. an unrelated key is never consumed, even while control mode is on');

        // Turning control mode off releases the held key immediately —
        // proven by ticking afterward and seeing no movement at all.
        const sequenceBefore = avatarPresenceSession.current.sequence;
        session.setAvatarControlMode(false);
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.sequence === sequenceBefore,
            '55. disabling control mode releases held keys — a held W never keeps walking after the mode is turned off');

        // avatarKeyUp is always forwarded, regardless of control mode
        // — releasing must never be gate-able (see WorldNavigationSession's
        // own comment on avatarKeyUp).
        assert(typeof session.avatarKeyUp('w') === 'boolean', '56. avatarKeyUp always returns a boolean, never throws, regardless of control mode');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-d2');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = spyFacade();
        session._session = facade;
        session._spatialCameraController = new SpatialCameraController(facade);
        session._setupLocalAvatar();

        assert(session.isFollowingAvatar() === false, '57. Follow Avatar starts off');
        const cameraBefore = facade.getCameraState();
        avatarPresenceSession.update({ position: { x: 10, y: 0, z: 0 } });
        assert(facade.getCameraState().position.x === cameraBefore.position.x,
            '58. the avatar moving never moves the camera while Follow Avatar is off');

        session.setFollowAvatar(true);
        assert(session.isFollowingAvatar() === true, '59. setFollowAvatar(true) turns it on');
        const beforeFollow = facade.getCameraState();
        avatarPresenceSession.update({ position: { x: 20, y: 0, z: 0 } });
        const afterFollow = facade.getCameraState();
        assert(Math.abs((afterFollow.position.x - beforeFollow.position.x) - 10) < 1e-9,
            '60. once Follow Avatar is on, the camera shifts by exactly the avatar\'s own movement delta');
        assert(Math.abs((afterFollow.target.x - beforeFollow.target.x) - 10) < 1e-9,
            '61. the camera TARGET shifts by the same delta — the orbit offset the user set is preserved, not reset');

        // Following the avatar never redefines what the camera is
        // "focused on" or what document is active — see docs/Principles.md.
        assert(session.getFocusedDocumentId() === null, '62. following the avatar never sets a focused document');
        assert(session._activeDocumentId === null, '63. following the avatar never sets an active document');

        session.setFollowAvatar(false);
        const beforeOff = facade.getCameraState();
        avatarPresenceSession.update({ position: { x: 30, y: 0, z: 0 } });
        assert(facade.getCameraState().position.x === beforeOff.position.x,
            '64. disabling Follow Avatar leaves the camera independent again — further avatar movement no longer moves it');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-d3');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();
        const unsubscribe = session._avatarFrameSubscription;
        assert(typeof unsubscribe === 'function', '65. a frame subscription exists before dispose()');
        session.dispose();
        assert(session._avatarMovementController === null, '66. dispose() clears the movement controller');
        assert(session._avatarFrameSubscription === null, '67. dispose() clears the frame subscription');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: the design doc's own scripted scenario
    //   Create world -> create Alice avatar -> place at (0,0,0) ->
    //   press W for 2 seconds -> presence position changes -> avatar
    //   moves visually -> animation becomes WALKING -> world
    //   documents remain completely unchanged.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });

        // A real published document/placement — "world documents
        // remain completely unchanged" needs a real world to check
        // that against, exactly like 0.2.35's own flagship.
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, alice
        );
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice, placePublicationUseCase, new GridPlacementStrategy());

        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube' }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Flagship Castle', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) });
        const publication = publishDocumentUseCase.execute({ document });

        const placementBefore = placementRegistry.findByPublicationId(publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;

        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase, worldLayoutProvider: new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider),
            identityProvider: alice, discoveryProvider, placementRegistry,
            avatarProfileUseCase, avatarPresenceSession
        });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();

        assert(avatarPresenceSession.current.position.x === 0 && avatarPresenceSession.current.position.z === 0,
            '68. FLAGSHIP: Alice starts at (0, 0, 0)');

        // Press W for two seconds, simulated as forty real-elapsed-time
        // 0.05s ticks — frame-rate independence (Section B) is what
        // makes this equivalent to any other tick granularity.
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) {
            session._avatarMovementController.tick(0.05);
        }
        session.avatarKeyUp('w');

        assert(avatarPresenceSession.current.position.z > 0, '69. FLAGSHIP: two seconds of W moves Alice forward');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING, '70. FLAGSHIP: animation became WALKING while moving');
        const lastPresenceCall = facade.calls.updateLocalAvatarPresence.at(-1);
        assert(lastPresenceCall.presence.position.z === avatarPresenceSession.current.position.z,
            '71. FLAGSHIP: the avatar moved visually — the render facade received the final position');

        // Release W — the very next tick settles back to IDLE.
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE, '72. FLAGSHIP: releasing W settles back to IDLE');

        // World documents remain COMPLETELY unchanged.
        const placementAfter = placementRegistry.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            '73. FLAGSHIP: WorldPlacement/PlacementRecord is byte-identical after two seconds of walking');
        assert(document.metadata.title === 'Flagship Castle', '74. FLAGSHIP: DocumentMetadata is untouched');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '75. FLAGSHIP: no document is ever created for the avatar or its movement');
    }

    console.log('✅ All Avatar Movement & Animation tests passed.');
}

// Top-level await — see tests/AvatarRendering.test.js's comment for
// why the usual fire-and-forget `runTests().catch(...)` pattern isn't
// reliably safe even for a file with no real macrotask scheduling.
await runTests();
