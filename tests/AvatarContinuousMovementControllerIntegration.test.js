import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { AvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
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

// 0.9.66 — Continuous Movement Controller Integration.
//
//   Section A: application/AvatarMovementController.js — priority rule
//              (ordinary W/S > continuous intent > idle), consumed via
//              setContinuousMovementIntent()/continuousMovementIntent()
//   Section B: application/WorldNavigationSession.js — real Alt +
//              W/S keyboard chords, wired end to end through
//              core/AvatarContinuousMovementInputAdapter.js (0.9.65) and
//              core/AvatarContinuousMovementIntent.js (0.9.64), with NO
//              changes needed to avatarKeyDown/avatarKeyUp's own public
//              shape or to ui/views/WorldView.js
//   Section C: collision/terrain/step/tree preservation — continuous
//              movement runs through the EXACT SAME constraint pipeline
//              ordinary W/S already does
//   Section D: determinism and backward compatibility
//   Section E: FLAGSHIP — a real avatar, Alt + W held then
//              released, walking on with no keys held, straight at a
//              real deterministic tree, through the entire chain
//   Section F: architectural regression — the controller never learns
//              what Alt is
//
// Central architectural claim under test throughout: continuous
// movement is an ADDITIONAL SOURCE of movement intent, never a second
// movement system — see docs/Roadmap.md, 0.9.66. No new pipeline stage
// exists in AvatarMovementController#tick(); a continuously-moving
// avatar produces the exact same AvatarMovementState shape an
// ordinarily-walking one already does.

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
// same way tests/AvatarTreeCollisionIntegration.test.js already finds
// one, so this file never invents a second "how do I find a real tree"
// recipe.
function findRealTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    return wide[0];
}

async function runTests() {
    const registry = buildRegistry();
    const realTree = findRealTree();

    // -------------------------------------------------------------
    // Section A — application/AvatarMovementController.js: priority
    // -------------------------------------------------------------
    {
        // A — no continuous intent at all: existing behavior unchanged.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a1');
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '1. a fresh controller starts with NO continuous movement intent');
        const result = controller.tick(0.5);
        assert(result === null, '2. no continuous intent + no keys held stays a true no-op tick');
    }
    {
        // B — Forward continuous movement: activate, release nothing was
        // ever held, advance ticks, verify the avatar continues moving.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '3. setContinuousMovementIntent(FORWARD) is reflected by continuousMovementIntent()');
        const before = avatarPresenceSession.current.position.z;
        controller.tick(0.5);
        const afterOne = avatarPresenceSession.current.position.z;
        assert(afterOne > before, '4. a single tick under continuous FORWARD, with no keys held at all, moves the avatar forward');
        controller.tick(0.5);
        const afterTwo = avatarPresenceSession.current.position.z;
        assert(afterTwo > afterOne, '5. continuous FORWARD keeps moving the avatar forward tick after tick, indefinitely, with no key ever pressed');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING,
            '6. continuous movement produces the exact same WALKING animation ordinary W already does');
    }
    {
        // C — Backward continuous movement.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a3');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.BACKWARD);
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z < 0, '7. continuous BACKWARD moves the avatar backward with no keys held');
    }
    {
        // D — Ordinary movement overrides continuous movement: continuous
        // FORWARD + S physically held -> BACKWARD movement wins outright.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a4');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.keyDown('s');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z < 0,
            '8. ordinary S, physically held, overrides a continuous FORWARD intent outright — the avatar moves backward');
        // The continuous intent itself is untouched by setContinuousMovementIntent
        // callers alone holding an ordinary key — only the KEYBOARD
        // adapter path (Section B) is responsible for cancelling it via
        // an ordinary press. Calling the raw setter directly, as this
        // section does, never goes through that cancellation at all.
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '9. setContinuousMovementIntent() itself never auto-cancels — only the keyboard adapter path (0.9.65) decides cancellation, per 0.9.64\'s own transition rule');
    }
    {
        // Same idea, ordinary W physically held: continuous BACKWARD is
        // overridden by ordinary FORWARD.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a5');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.BACKWARD);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '10. ordinary W overrides a continuous BACKWARD intent outright');
    }
    {
        // Both W and S physically held at once (they cancel to a net
        // zero ordinary axis) still counts as "ordinary input active" —
        // continuous intent stays silent, the avatar does not move.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a6');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.keyDown('w');
        controller.keyDown('s');
        const result = controller.tick(0.5);
        assert(result === null || avatarPresenceSession.current.position.z === 0,
            '11. W and S both physically held cancel to zero movement — continuous intent never sneaks in to break the tie');
    }
    {
        // Turning alone (A/D) never suppresses continuous forward/backward
        // movement — only W/S count as "ordinary input" for this priority
        // rule, exactly like AvatarMovementState's own forwardAxis/turnAxis
        // separation.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a7');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.keyDown('d');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z !== 0, '12. turning (D) alone never overrides continuous forward movement');
        assert(avatarPresenceSession.current.rotation.y !== 0, '13. ...and the turn itself still happens, exactly as it would for ordinary W+D');
    }
    {
        // Defensive: an invalid intent value degrades to NONE, never
        // throws, never leaves a malformed value readable back.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-a8');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent('sideways');
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '14. an invalid continuous movement intent value degrades to NONE');
        controller.setContinuousMovementIntent(undefined);
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '15. an undefined continuous movement intent value degrades to NONE');
    }

    // -------------------------------------------------------------
    // Section B — application/WorldNavigationSession.js: real Alt +
    // W/S keyboard chords, end to end
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b1');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session.setAvatarControlMode(true);

        // Alt held, then W pressed: activates continuous FORWARD.
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '16. WorldNavigationSession: a real Alt + W chord activates continuous FORWARD, with zero changes to avatarKeyDown\'s own public shape');

        // Releasing W (and Alt) does not cancel it — key-up is
        // never a signal (0.9.64).
        session.avatarKeyUp('w');
        session.avatarKeyUp('Alt');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '17. WorldNavigationSession: releasing W and Alt leaves the continuous intent untouched');

        // The avatar keeps moving, tick after tick, with NO key held at
        // all — the actual point of the entire milestone.
        const startZ = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 5; i++) {
            session._avatarMovementController.tick(0.1);
        }
        assert(avatarPresenceSession.current.position.z > startZ,
            '18. WorldNavigationSession: the avatar keeps walking forward, tick after tick, with no key physically held — the flagship behavior this milestone exists to deliver');

        // A later plain W tap (Alt no longer held) cancels it.
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '19. WorldNavigationSession: an ordinary W tap (no Alt) cancels the continuous intent, per 0.9.64\'s own transition rule');
        session.avatarKeyUp('w');
        const afterCancelZ = avatarPresenceSession.current.position.z;
        session._avatarMovementController.tick(0.1);
        assert(avatarPresenceSession.current.position.z === afterCancelZ,
            '20. WorldNavigationSession: once cancelled and released, the avatar genuinely stops — no residual movement');
    }
    {
        // Alt + S from rest activates BACKWARD; a plain W
        // afterward (the OPPOSITE ordinary key, Alt no longer
        // held) cancels it too — the "obvious escape hatch."
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b2');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session.setAvatarControlMode(true);

        session.avatarKeyDown('Alt');
        session.avatarKeyDown('s');
        session.avatarKeyUp('s');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.BACKWARD,
            '21. WorldNavigationSession: Alt + S activates continuous BACKWARD');
        session.avatarKeyUp('Alt');

        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '22. WorldNavigationSession: a plain W (the opposite ordinary key) cancels continuous BACKWARD too — the escape hatch');
        session.avatarKeyUp('w');
    }
    {
        // Continuous movement can never be armed while Avatar Control
        // Mode is off — matching ordinary W/S's own gating exactly.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b3');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        // Avatar Control Mode is OFF (the default).
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '23. WorldNavigationSession: an Alt + W chord while Avatar Control Mode is off never arms continuous movement');
    }
    {
        // Turning Avatar Control Mode off cancels the physical Alt
        // hold-tracking (so a later re-enable starts clean) but
        // never touches the continuous intent value itself.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-b4');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session.setAvatarControlMode(true);
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '24. WorldNavigationSession setup: continuous FORWARD is active before turning control mode off');
        session.setAvatarControlMode(false);
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '25. WorldNavigationSession: turning Avatar Control Mode off never cancels an already-active continuous intent');
        // Ordinary keys were released by releaseAll() — the avatar still
        // keeps walking via the surviving continuous intent alone.
        const before = avatarPresenceSession.current.position.z;
        session._avatarMovementController.tick(0.5);
        assert(avatarPresenceSession.current.position.z > before,
            '26. WorldNavigationSession: the avatar keeps walking via the surviving continuous intent even after Avatar Control Mode is switched off');
    }

    // -------------------------------------------------------------
    // Section C — collision/terrain/step/tree preservation: continuous
    // movement runs through the EXACT SAME constraint pipeline
    // -------------------------------------------------------------
    {
        // H/I — building collision: a fake constraint that fully holds
        // the avatar in place is honored for continuous movement exactly
        // as it already is for ordinary W.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-c1');
        const before = avatarPresenceSession.current.position;
        const alwaysBlocks = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, alwaysBlocks);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.x === before.x && avatarPresenceSession.current.position.z === before.z,
            '27. Section C: existing building collision fully holds continuous movement in place, exactly like ordinary W');
        assert(controller.isCollided() === true, '28. Section C: isCollided() reflects the collision caused by a continuous step, exactly like ordinary W');
    }
    {
        // Terrain slope: a fake terrain constraint that always blocks
        // proves continuous movement is actually run through it.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-c2');
        const before = avatarPresenceSession.current.position;
        const alwaysBlocksSlope = { apply: (position) => ({ position, blocked: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, alwaysBlocksSlope);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z === before.z, '29. Section C: terrain slope blocking is honored for continuous movement');
        assert(controller.isBlockedBySlope() === true, '30. Section C: isBlockedBySlope() reflects it');
    }
    {
        // Step height: an observing fake step constraint proves it is
        // actually consulted (supportHeightAt + apply) for a continuous
        // step, not merely for ordinary W.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-c3');
        let supportHeightCalls = 0;
        let applyCalls = 0;
        const observingStep = {
            supportHeightAt() { supportHeightCalls++; return 0; },
            apply(position, desired) { applyCalls++; return { position: desired, blocked: false, falling: false }; }
        };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, observingStep);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.tick(0.5);
        assert(supportHeightCalls === 1 && applyCalls === 1,
            '31. Section C: the step constraint\'s own supportHeightAt()/apply() are both consulted for a continuous-driven tick, exactly once, exactly like ordinary W');
    }
    {
        // G — Tree collision, with REAL geometry: continuous FORWARD
        // walking straight at a real, deterministic tree still stops at
        // its own collision boundary.
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-c4');
        avatarPresenceSession.update({ position: { x: realTree.center.x, y: 0, z: startZ }, rotation: { y: 0 } });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        let everCollided = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.05);
            if (controller.isCollidedWithTree()) everCollided = true;
        }
        assert(everCollided === true, '32. Section C/G: continuous movement, with NO key ever held, is genuinely stopped by a real tree — the same collision pipeline ordinary W already goes through');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realTree.center.x,
            avatarPresenceSession.current.position.z - realTree.center.z
        );
        assert(finalDistance >= realTree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '33. Section C/G: the avatar never penetrates the real tree\'s own collision circle under continuous movement');
        // The intent itself survives the collision — the world merely
        // prevents further progress, it never edits the player's intent.
        assert(controller.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '34. Section C/G: a tree collision never clears the continuous movement intent — "the world currently prevents further progress" and "the avatar still wants to keep going" both hold at once');
    }
    {
        // J — Y preservation: a jump requested while continuous FORWARD
        // is active still rises/falls exactly as it would for ordinary
        // W — continuous horizontal intent never interferes with
        // vertical positioning.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-c5');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
        controller.keyDown(' ');
        controller.tick(0.05);
        assert(avatarPresenceSession.current.position.y > 0, '35. Section C/J: a jump still rises normally while continuous FORWARD drives horizontal movement');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.JUMPING, '36. Section C/J: JUMPING still wins over WALKING while airborne, continuous movement or not');
        controller.keyUp(' ');
        let landed = false;
        let horizontalProgressed = false;
        const zBeforeLanding = avatarPresenceSession.current.position.z;
        for (let i = 0; i < 80; i++) {
            controller.tick(0.05);
            if (avatarPresenceSession.current.position.z > zBeforeLanding) horizontalProgressed = true;
            if (avatarPresenceSession.current.position.y === 0) { landed = true; break; }
        }
        assert(landed, '37. Section C/J: the avatar lands normally');
        assert(horizontalProgressed, '38. Section C/J: continuous FORWARD movement kept progressing horizontally the whole time the avatar was airborne');
    }

    // -------------------------------------------------------------
    // Section D — determinism and backward compatibility
    // -------------------------------------------------------------
    {
        // K — Determinism: identical starting state + identical
        // intent/tick sequence -> identical resulting positions, on two
        // completely independent controllers.
        const stackA = buildAvatarStack(registry, 'ctrl-d1-a');
        const stackB = buildAvatarStack(registry, 'ctrl-d1-b');
        const controllerA = new AvatarMovementController(stackA.avatarPresenceSession);
        const controllerB = new AvatarMovementController(stackB.avatarPresenceSession);
        for (const controller of [controllerA, controllerB]) {
            controller.setContinuousMovementIntent(AvatarContinuousMovementIntent.FORWARD);
            for (let i = 0; i < 10; i++) controller.tick(0.05);
            controller.keyDown('d');
            for (let i = 0; i < 5; i++) controller.tick(0.05);
            controller.keyUp('d');
            for (let i = 0; i < 10; i++) controller.tick(0.05);
        }
        assert(JSON.stringify(stackA.avatarPresenceSession.current.position) === JSON.stringify(stackB.avatarPresenceSession.current.position),
            '39. Section D/K: identical initial state + identical intent/tick script -> byte-identical resulting positions on two independent controllers');
        assert(stackA.avatarPresenceSession.current.rotation.y === stackB.avatarPresenceSession.current.rotation.y,
            '40. Section D/K: ...and identical resulting rotation too');
    }
    {
        // L — Backward compatibility: a controller that never once
        // touches continuous movement (setContinuousMovementIntent()
        // never called, no Alt chord ever run through
        // WorldNavigationSession) behaves EXACTLY as it did before this
        // milestone — replaying the exact assertions
        // tests/AvatarMovement.test.js's own Section C already makes.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'ctrl-d2');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '41. Section D/L: plain W still moves the avatar forward, unchanged');
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.WALKING, '42. Section D/L: animation still becomes WALKING, unchanged');
        controller.keyUp('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.animation === AvatarAnimationState.IDLE,
            '43. Section D/L: releasing W without ever having touched continuous movement still settles back to IDLE on the very next tick, unchanged — no accidental persistent intent is ever introduced by simply using the controller normally');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: Alt + W held then released, the
    // avatar keeps walking with NO key held, straight at a real
    // deterministic tree, through the entire chain — Keyboard ->
    // core/AvatarContinuousMovementInputAdapter.js (0.9.65) ->
    // core/AvatarContinuousMovementIntent.js (0.9.64) ->
    // application/AvatarMovementController.js (0.9.66) -> building/
    // terrain/step/tree constraints -> avatar position.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-continuous');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: realTree.center.x, y: 0, z: startZ } });
        const profileJsonBefore = JSON.stringify(profile.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;

        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: registry
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session.setAvatarControlMode(true);

        // Alt + W: activate continuous FORWARD, then release BOTH
        // keys immediately — the avatar must keep walking with nothing
        // held down at all.
        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Alt');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '44. FLAGSHIP: Alt + W activates continuous FORWARD and survives releasing both keys');

        let everCollided = false;
        let maxStepDistance = 0;
        let lastPosition = avatarPresenceSession.current.position;
        for (let i = 0; i < 400; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isCollidedWithTree()) everCollided = true;
            const p = avatarPresenceSession.current.position;
            assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
                `45. FLAGSHIP: position stays finite at every tick (tick ${i}), no key held, approaching a real tree`);
            const stepDistance = Math.hypot(p.x - lastPosition.x, p.z - lastPosition.z);
            maxStepDistance = Math.max(maxStepDistance, stepDistance);
            lastPosition = p;
        }

        assert(everCollided === true, '46. FLAGSHIP: the local avatar\'s continuous movement is genuinely constrained by a real tree, end to end, with no key ever held during the approach');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realTree.center.x,
            avatarPresenceSession.current.position.z - realTree.center.z
        );
        assert(finalDistance >= realTree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '47. FLAGSHIP: the avatar never penetrates the real tree\'s own collision circle under continuous movement');
        assert(maxStepDistance < 1, '48. FLAGSHIP: no single tick ever produces a discontinuous jump through the tree');

        // AvatarPresence's own wire shape, AvatarProfile, and document
        // storage are all completely untouched by continuous movement —
        // same non-leakage every prior avatar-movement flagship already
        // proved.
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '49. FLAGSHIP: AvatarPresence\'s own JSON shape is unchanged — nothing continuous-movement-related ever joins it');
        assert(JSON.stringify(avatarProfileUseCase.getProfile().toJSON()) === profileJsonBefore,
            '50. FLAGSHIP: AvatarProfile is completely untouched by continuous movement');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '51. FLAGSHIP: no document is ever created for the avatar, its movement, or an Alt chord');

        // Now cancel with a plain ordinary key and confirm the avatar
        // genuinely stops.
        session.avatarKeyDown('a');
        session.avatarKeyUp('a');
        // 'a' is a turn key, never touches continuous intent — confirm
        // it is STILL active, then cancel with the real escape hatch (S,
        // the opposite ordinary key).
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '52. FLAGSHIP: an unrelated key (A) never cancels continuous movement');
        session.avatarKeyDown('s');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '53. FLAGSHIP: the opposite ordinary key (S) cancels continuous FORWARD, per 0.9.64\'s own escape hatch');
        session.avatarKeyUp('s');
        const stoppedZ = avatarPresenceSession.current.position.z;
        session._avatarMovementController.tick(0.1);
        assert(avatarPresenceSession.current.position.z === stoppedZ,
            '54. FLAGSHIP: once cancelled and released, the avatar genuinely stops — the continuous movement feature has a real, reachable off switch');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: the controller never
    // learns what Alt is
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/AvatarMovementController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!/\balt\b/i.test(codeOnly) && !codeOnly.includes('Alt'),
            '55. application/AvatarMovementController.js\'s own CODE (comments excluded) never references Alt in any form — this class has no idea it exists');
        assert(!codeOnly.includes('getModifierState'),
            '56. application/AvatarMovementController.js never reads a raw keyboard modifier state directly');
        assert(!codeOnly.includes('AvatarContinuousMovementInputAdapter'),
            '57. application/AvatarMovementController.js never imports the keyboard input adapter — that translation lives one layer up, in WorldNavigationSession');
        assert(!codeOnly.includes('deriveAvatarContinuousMovementIntent'),
            '58. application/AvatarMovementController.js never calls the 0.9.64 transition function itself — it only ever CONSUMES an already-resolved intent value via setContinuousMovementIntent()');
        const forbidden = ['THREE', 'from \'three\'', 'Renderer', 'Math.random', 'localStorage', 'fetch(', 'WebSocket', 'setTimeout', 'setInterval', 'requestAnimationFrame'];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `59. application/AvatarMovementController.js's own code never references "${term}" — no new timers, no engine dependency, no persistence introduced by this milestone`);
        }
    }
    {
        const sourceUrl = new URL('../application/WorldNavigationSession.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        assert(codeOnly.includes('deriveAvatarContinuousMovementInputEvent'),
            '60. application/WorldNavigationSession.js does consume core/AvatarContinuousMovementInputAdapter.js\'s own deliberate 0.9.65 entry point — the keyboard-facing seam lives here, not in the controller');
        assert(codeOnly.includes('deriveAvatarContinuousMovementIntent'),
            '61. application/WorldNavigationSession.js does consume core/AvatarContinuousMovementIntent.js\'s own deliberate 0.9.64 transition function');
        assert(codeOnly.includes('setContinuousMovementIntent'),
            '62. application/WorldNavigationSession.js feeds the resolved intent into AvatarMovementController through its own public setter, never by reaching into a private field');
    }

    console.log('✅ All Avatar Continuous Movement Controller Integration tests passed.');
}

await runTests();
