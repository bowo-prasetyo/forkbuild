import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { AvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
import { AvatarContinuousMovementMode } from '../core/AvatarContinuousMovementMode.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.69 — Continuous Movement Direction + Mode Integration.
//
//   Section A: application/AvatarMovementController.js — the new
//              running priority rule (ordinary Shift+W/S > continuous
//              mode > idle), mirroring 0.9.66's own forwardAxis
//              priority rule exactly, consumed via
//              setContinuousMovementMode()/continuousMovementMode()
//   Section B: application/WorldNavigationSession.js — real Alt +
//              Shift + W/S keyboard chords, wired end to end through
//              core/AvatarContinuousMovementInputAdapter.js (0.9.68),
//              core/AvatarContinuousMovementIntent.js (0.9.64), and
//              core/AvatarContinuousMovementMode.js (0.9.67), with NO
//              changes needed to avatarKeyDown/avatarKeyUp's own public
//              shape or to ui/views/WorldView.js
//   Section C: the five flagship cancellation/independence cases the
//              milestone brief calls out by name
//   Section D: collision preservation — continuous RUN runs through the
//              EXACT SAME tree constraint ordinary Shift+W already does
//              (reusing the real 0.9.63 tree constraint, nothing new)
//   Section E: determinism and backward compatibility
//   Section F: architectural regression — the controller never learns
//              what Shift/Alt are; no new continuous-run physics
//
// Central architectural claim under test throughout: direction and mode
// are two independent dimensions that converge, before simulation, into
// the exact same AvatarMovementState shape ordinary W/S/Shift already
// produce — continuous RUN is never a second movement system, only
// another source of the same `running` boolean. See docs/Roadmap.md,
// 0.9.69.

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

// A real, deterministic tree under DEFAULT_WORLD_SEED — found the exact
// same way tests/AvatarContinuousMovementControllerIntegration.test.js
// (0.9.66) already finds one, so this file never invents a second "how
// do I find a real tree" recipe.
function findRealTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    return wide[0];
}

function newControlledSession(registry, username) {
    const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, username);
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = spyFacade();
    session._setupLocalAvatar();
    session.setAvatarControlMode(true);
    return { session, avatarPresenceSession };
}

async function runTests() {
    const registry = buildRegistry();
    const realTree = findRealTree();

    // -------------------------------------------------------------
    // Section A — application/AvatarMovementController.js: the new
    // running priority rule
    // -------------------------------------------------------------
    {
        // A fresh controller starts with NO continuous mode.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.continuousMovementMode() === AvatarContinuousMovementMode.NONE,
            '1. a fresh controller starts with NO continuous movement mode');
    }
    {
        // Continuous FORWARD + WALK moves at walking speed, not running.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.setContinuousMovementMode(AvatarContinuousMovementMode.WALK);
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING,
            '2. continuous FORWARD + WALK produces WALKING animation, with no keys held at all');
    }
    {
        // Continuous FORWARD + RUN moves the avatar further per tick
        // than continuous FORWARD + WALK, and produces RUNNING
        // animation — proving the mode dimension actually changes speed.
        const walkStack = buildAvatarStack(registry, 'ctrl-a3-walk');
        const walkController = new AvatarMovementController(walkStack.avatarPresenceSession);
        walkController.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        walkController.setContinuousMovementMode(AvatarContinuousMovementMode.WALK);
        walkController.tick(0.5);
        const walkedZ = walkStack.avatarPresenceSession.current.position.z;

        const runStack = buildAvatarStack(registry, 'ctrl-a3-run');
        const runController = new AvatarMovementController(runStack.avatarPresenceSession);
        runController.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        runController.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
        runController.tick(0.5);
        const ranZ = runStack.avatarPresenceSession.current.position.z;

        assert(ranZ > walkedZ, '3. continuous FORWARD + RUN covers more ground in one tick than continuous FORWARD + WALK');
        assert(runStack.avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING,
            '4. continuous FORWARD + RUN produces the exact same RUNNING animation ordinary Shift+W already does');
    }
    {
        // Ordinary movement input has priority over BOTH persistent
        // dimensions at once: ordinary S, physically held, overrides a
        // continuous FORWARD + RUN outright — the avatar walks/runs
        // backward per the ORDINARY Shift key, not the continuous mode.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a4');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
        controller.keyDown('s');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z < 0,
            '5. ordinary S, physically held, overrides continuous FORWARD + RUN outright — the avatar moves backward');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING,
            '6. ...and moves at ordinary WALKING speed, because ordinary Shift was never held — continuous RUN never leaks into ordinary input');
        // Both persistent dimensions themselves are untouched by holding
        // an ordinary key directly on the controller — only the
        // keyboard adapter path (Section B) is responsible for
        // cancelling them.
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '7. setContinuousMovementIntent() itself never auto-cancels');
        assert(controller.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '8. setContinuousMovementMode() itself never auto-cancels');
    }
    {
        // Ordinary Shift+W (no continuous state at all) still produces
        // running exactly as it always has — the new _resolvedRunning()
        // path is a strict superset of the old direct _keys.running
        // read, never a replacement of it.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a5');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        controller.keyDown('shift');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING,
            '9. ordinary Shift+W still produces RUNNING, completely unaffected by continuous mode ever existing');
    }
    {
        // Defensive: an invalid mode value degrades to NONE, never
        // throws, never leaves a malformed value readable back.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a6');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementMode('sprint');
        assert(controller.continuousMovementMode() === AvatarContinuousMovementMode.NONE,
            '10. an invalid continuous movement mode value degrades to NONE');
        controller.setContinuousMovementMode(undefined);
        assert(controller.continuousMovementMode() === AvatarContinuousMovementMode.NONE,
            '11. an undefined continuous movement mode value degrades to NONE');
    }

    // -------------------------------------------------------------
    // Section B — application/WorldNavigationSession.js: real Caps
    // Lock + Shift + W/S keyboard chords, end to end
    // -------------------------------------------------------------
    {
        const { session, avatarPresenceSession } = newControlledSession(registry, 'session-b1');

        // Alt + Shift + W: activates continuous FORWARD + RUN.
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '12. WorldNavigationSession: Alt+Shift+W activates continuous FORWARD');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '13. WorldNavigationSession: Alt+Shift+W activates continuous RUN, with zero changes to avatarKeyDown\'s own public shape');

        // Releasing every key does not cancel either dimension.
        session.avatarKeyUp('w');
        session.avatarKeyUp('Shift');
        session.avatarKeyUp('Alt');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '14. WorldNavigationSession: releasing every key leaves continuous FORWARD untouched');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '15. WorldNavigationSession: releasing every key leaves continuous RUN untouched — the whole point of persistent mode');

        // The avatar keeps running, tick after tick, with NO key held.
        const startZ = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 5; i++) {
            session._avatarMovementController.tick(0.1);
        }
        assert(avatarPresenceSession.current.position.z > startZ,
            '16. WorldNavigationSession: the avatar keeps running, tick after tick, with no key physically held');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING,
            '17. WorldNavigationSession: the animation is RUNNING throughout, driven entirely by persistent state');
    }
    {
        // Alt + W (no Shift) activates WALK, not RUN.
        const { session } = newControlledSession(registry, 'session-b2');
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.WALK,
            '18. WorldNavigationSession: Alt+W (Shift not held) activates continuous WALK, not RUN');
    }
    {
        // Continuous mode can never be armed while Avatar Control Mode
        // is off — matching ordinary Shift's own gating exactly.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b3');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        // Avatar Control Mode is OFF (the default).
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.NONE,
            '19. WorldNavigationSession: a Alt+Shift+W chord while Avatar Control Mode is off never arms continuous mode');
    }
    {
        // Turning Avatar Control Mode off never cancels an already
        // active continuous mode, the direct mode-dimension twin of
        // 0.9.66's own direction assertion.
        const { session, avatarPresenceSession } = newControlledSession(registry, 'session-b4');
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '20. WorldNavigationSession setup: continuous RUN is active before turning control mode off');
        session.setAvatarControlMode(false);
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '21. WorldNavigationSession: turning Avatar Control Mode off never cancels an already-active continuous mode');
        const before = avatarPresenceSession.current.position.z;
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.position.z > before,
            '22. WorldNavigationSession: the avatar keeps running via the surviving continuous state even after Avatar Control Mode is switched off');
    }

    // -------------------------------------------------------------
    // Section C — the five flagship cancellation/independence cases
    // the milestone brief calls out by name
    // -------------------------------------------------------------
    {
        // 1. Continuous walk -> continuous run, no need to stop first.
        const { session } = newControlledSession(registry, 'session-c1');
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD
            && session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.WALK,
            '23. Flagship 1: Alt+W -> FORWARD + WALK');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD
            && session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '24. Flagship 1: Alt+Shift+W (Alt still held) -> FORWARD + RUN, no stop required');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Shift');
        session.avatarKeyUp('Alt');
    }
    {
        // 2. Continuous run -> continuous walk — proves mode is
        // genuinely independent of direction.
        const { session } = newControlledSession(registry, 'session-c2');
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '25. Flagship 2: Alt+Shift+W -> RUN');
        session.avatarKeyUp('Shift');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '26. Flagship 2: Alt+W (Shift released, Alt still held) -> direction stays FORWARD');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.WALK,
            '27. Flagship 2: ...and mode switches RUN -> WALK, proving mode is a genuinely independent dimension');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Alt');
    }
    {
        // 3. Forward run -> backward run.
        const { session } = newControlledSession(registry, 'session-c3');
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD
            && session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '28. Flagship 3: Alt+Shift+W -> FORWARD + RUN');
        session.avatarKeyDown('s');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.BACKWARD
            && session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '29. Flagship 3: Alt+Shift+S (Alt/Shift still held) -> BACKWARD + RUN');
        session.avatarKeyUp('s');
        session.avatarKeyUp('Shift');
        session.avatarKeyUp('Alt');
    }
    {
        // 4. Running cancellation: an ordinary W tap clears BOTH
        // dimensions to NONE + NONE.
        const { session } = newControlledSession(registry, 'session-c4');
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Shift');
        session.avatarKeyUp('Alt');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD
            && session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '30. Flagship 4: Alt+Shift+W, then release everything -> FORWARD + RUN survives');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '31. Flagship 4: an ordinary W tap (no Alt) cancels the continuous direction to NONE');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.NONE,
            '32. Flagship 4: ...and cancels the continuous mode to NONE at the same time, from the same key event');
        session.avatarKeyUp('w');
    }
    {
        // 5. Ordinary running never activates persistence.
        const { session, avatarPresenceSession } = newControlledSession(registry, 'session-c5');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '33. Flagship 5: ordinary Shift+W (no Alt) never activates continuous direction');
        assert(session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.NONE,
            '34. Flagship 5: ordinary Shift+W (no Alt) never activates continuous mode');
        session._avatarMovementController.tick(0.1);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING,
            '35. Flagship 5: ...even though the avatar IS ordinarily running right now');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Shift');
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE,
            '36. Flagship 5: releasing W settles back to IDLE — there is no persistent FORWARD + RUN left behind');
    }

    // -------------------------------------------------------------
    // Section D — collision preservation: continuous RUN runs through
    // the EXACT SAME tree constraint ordinary Shift+W already does
    // -------------------------------------------------------------
    {
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 12);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-d1');
        avatarPresenceSession.update({ position: { x: realTree.center.x, y: 0, z: startZ }, rotation: { y: 0 } });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
        let everCollided = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.05);
            if (controller.isCollidedWithTree()) everCollided = true;
        }
        assert(everCollided === true, '37. Section D: continuous RUNNING, with NO key ever held, is genuinely stopped by a real tree — the same collision pipeline ordinary Shift+W already goes through');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realTree.center.x,
            avatarPresenceSession.current.position.z - realTree.center.z
        );
        assert(finalDistance >= realTree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '38. Section D: the running avatar never penetrates the real tree\'s own collision circle under continuous movement');
        // Both persistent dimensions survive the collision — the world
        // merely prevents further progress, it never edits the
        // player's intent or mode.
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '39. Section D: a tree collision never clears the continuous movement intent');
        assert(controller.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '40. Section D: a tree collision never clears the continuous movement mode either');
    }
    {
        // FLAGSHIP REGRESSION: Alt+Shift+W -> release every key ->
        // avatar continues running -> encounters the real deterministic
        // tree -> the existing tree collision constraint stops it,
        // exactly as it already stops an ordinary running avatar. Run
        // end to end through WorldNavigationSession, the real keyboard
        // adapter, both transition functions, and the real tree
        // geometry — proving the feature is actually INTEGRATED, not
        // merely stored.
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-continuous-run');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 12);
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: realTree.center.x, y: 0, z: startZ } });

        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: registry
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session.setAvatarControlMode(true);

        session.avatarKeyDown('Alt');
        session.avatarKeyDown('Shift');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Shift');
        session.avatarKeyUp('Alt');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD
            && session._avatarMovementController.continuousMovementMode() === AvatarContinuousMovementMode.RUN,
            '41. FLAGSHIP REGRESSION: Alt+Shift+W activates FORWARD + RUN and survives releasing every key');

        let everCollided = false;
        let sawRunningAnimation = false;
        for (let i = 0; i < 400; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isCollidedWithTree()) everCollided = true;
            if (avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING) sawRunningAnimation = true;
        }
        assert(sawRunningAnimation, '42. FLAGSHIP REGRESSION: the avatar genuinely runs (RUNNING animation) the whole approach, with no key ever held');
        assert(everCollided, '43. FLAGSHIP REGRESSION: the running avatar cannot penetrate the real deterministic tree — the existing 0.9.63 collision constraint, completely untouched by this milestone');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realTree.center.x,
            avatarPresenceSession.current.position.z - realTree.center.z
        );
        assert(finalDistance >= realTree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '44. FLAGSHIP REGRESSION: the running avatar never penetrates the tree\'s own collision circle');
    }

    // -------------------------------------------------------------
    // Section E — determinism and backward compatibility
    // -------------------------------------------------------------
    {
        const stackA = buildAvatarStack(registry, 'ctrl-e1-a');
        const stackB = buildAvatarStack(registry, 'ctrl-e1-b');
        const controllerA = new AvatarMovementController(stackA.avatarPresenceSession);
        const controllerB = new AvatarMovementController(stackB.avatarPresenceSession);
        for (const controller of [controllerA, controllerB]) {
            controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
            controller.setContinuousMovementMode(AvatarContinuousMovementMode.RUN);
            for (let i = 0; i < 10; i++) controller.tick(0.05);
            controller.setContinuousMovementMode(AvatarContinuousMovementMode.WALK);
            for (let i = 0; i < 5; i++) controller.tick(0.05);
            controller.keyDown('d');
            for (let i = 0; i < 5; i++) controller.tick(0.05);
            controller.keyUp('d');
            for (let i = 0; i < 10; i++) controller.tick(0.05);
        }
        assert(JSON.stringify(stackA.avatarPresenceSession.current.position) === JSON.stringify(stackB.avatarPresenceSession.current.position),
            '45. Section E: identical initial state + identical intent/mode/tick script -> byte-identical resulting positions on two independent controllers');
        assert(stackA.avatarPresenceSession.current.animation === stackB.avatarPresenceSession.current.animation,
            '46. Section E: ...and identical resulting animation too');
    }
    {
        // Backward compatibility: a controller that never once touches
        // continuous mode behaves exactly as it did before this
        // milestone — replaying tests/AvatarMovement.test.js's own
        // Shift+W assertion.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-e2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        controller.keyDown('shift');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.RUNNING, '47. Section E: plain Shift+W still produces RUNNING, unchanged');
        controller.keyUp('w');
        controller.keyUp('shift');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE,
            '48. Section E: releasing both without ever having touched continuous mode still settles back to IDLE, unchanged');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/AvatarMovementController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\balt\b/i.test(codeOnly) && !codeOnly.includes('Alt'),
            '49. application/AvatarMovementController.js\'s own CODE (comments excluded) never references Alt in any form');
        assert(!codeOnly.includes('shiftDown'),
            '50. application/AvatarMovementController.js\'s own CODE never tracks a physical Shift hold-state — that stays one layer up, in WorldNavigationSession');
        assert(!codeOnly.includes('getModifierState'),
            '51. application/AvatarMovementController.js never reads a raw keyboard modifier state directly');
        assert(!codeOnly.includes('AvatarContinuousMovementInputAdapter'),
            '52. application/AvatarMovementController.js never imports the keyboard input adapter');
        assert(!codeOnly.includes('deriveAvatarContinuousMovementMode'),
            '53. application/AvatarMovementController.js never calls the 0.9.67 transition function itself — it only ever CONSUMES an already-resolved mode value via setContinuousMovementMode()');
        assert(!codeOnly.includes('RUN_SPEED') && !codeOnly.includes('WALK_SPEED'),
            '54. application/AvatarMovementController.js defines no new continuous-running speed constant of its own — speed still lives entirely in core/AvatarMovementSimulation.js');
        const forbidden = ['THREE', 'from \'three\'', 'Renderer', 'Math.random', 'localStorage', 'fetch(', 'WebSocket', 'setTimeout', 'setInterval', 'requestAnimationFrame'];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `55. application/AvatarMovementController.js's own code never references "${term}" — no new timers, no engine dependency, no persistence introduced by this milestone`);
        }
    }
    {
        const sourceUrl = new URL('../application/WorldNavigationSession.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        assert(codeOnly.includes('deriveAvatarContinuousMovementMode'),
            '56. application/WorldNavigationSession.js does consume core/AvatarContinuousMovementMode.js\'s own 0.9.67 transition function');
        assert(codeOnly.includes('setContinuousMovementMode'),
            '57. application/WorldNavigationSession.js feeds the resolved mode into AvatarMovementController through its own public setter, never by reaching into a private field');
        assert(codeOnly.includes('this._shiftDown'),
            '58. application/WorldNavigationSession.js tracks its own Shift hold-state, the direct structural twin of _altDown');
    }

    console.log('✅ All Avatar Continuous Movement Direction + Mode Integration tests passed.');
}

await runTests();
