import { AvatarInteractionKind, isValidInteractionKind } from '../core/AvatarInteractionKind.js';
import { INTERACTION_COOLDOWN_MS, canPerformInteraction } from '../core/AvatarInteractionCooldown.js';
import { computeFacingYawDegrees } from '../core/AvatarFacing.js';
import { getGesturePoseOverride } from '../core/AvatarGesturePoseOffsets.js';
import { AvatarInteractionState } from '../application/spatial-state/AvatarInteractionState.js';
import { AvatarRenderer } from '../renderer/AvatarRenderer.js';
import { AvatarVisual } from '../renderer/AvatarVisual.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.2.44 — Local Avatar Interaction & Social Presence.
//
//   Section A: core/AvatarInteractionKind.js       — closed vocabulary
//   Section B: core/AvatarInteractionCooldown.js    — pure rate-limit predicate
//   Section C: core/AvatarFacing.js                 — pure yaw geometry
//   Section D: core/AvatarGesturePoseOffsets.js      — pure gesture -> pose mapping
//   Section E: AvatarInteractionState                — the extended local state slice
//   Section F: renderer/AvatarVisual.js               — gesture + facing overlays
//   Section G: WorldNavigationSession.performAvatarInteraction()
//   Section H: WorldNavigationSession per-frame integration (gesture expiry + facing)
//
// Central architectural claim under test throughout: a GREET/WAVE/POINT
// gesture is entirely LOCAL — it never touches AvatarPresence, never
// reaches core/AvatarPresenceAdvertisement.js's wire shape, and is
// never rendered on anyone but the LOCAL avatar. See
// docs/Principles.md, "An Interaction Request Is Not Authority Over
// Another Avatar."

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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(registry, username, position) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, position ? { position } : undefined);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

function spyFacade() {
    const calls = {
        setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [],
        setLocalAvatarVisible: [], removeLocalAvatar: 0, onAnimationFrameCallbacks: [],
        setLocalAvatarFacing: [], setLocalAvatarGesture: []
    };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        setLocalAvatarFacing: (yaw) => calls.setLocalAvatarFacing.push(yaw),
        setLocalAvatarGesture: (kind) => calls.setLocalAvatarGesture.push(kind),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
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
        pickAvatar() { return null; },
        setControlsEnabled() {},
        setRemoteAvatar() {}, updateRemoteAvatarPresence() {}, removeRemoteAvatar() {},
        setRemoteAvatarsVisible() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const humanoid01 = registry.get('humanoid-01');

    // -------------------------------------------------------------
    // Section A — core/AvatarInteractionKind.js
    // -------------------------------------------------------------
    {
        assert(isValidInteractionKind(AvatarInteractionKind.NONE), '1. NONE is a valid interaction kind');
        assert(isValidInteractionKind(AvatarInteractionKind.GREET), '2. GREET is a valid interaction kind');
        assert(isValidInteractionKind(AvatarInteractionKind.WAVE), '3. WAVE is a valid interaction kind');
        assert(isValidInteractionKind(AvatarInteractionKind.POINT), '4. POINT is a valid interaction kind');
        assert(isValidInteractionKind('dance') === false, '5. an arbitrary string is never a valid interaction kind');
        assert(isValidInteractionKind(undefined) === false, '6. undefined is never a valid interaction kind');
    }

    // -------------------------------------------------------------
    // Section B — core/AvatarInteractionCooldown.js
    // -------------------------------------------------------------
    {
        assert(canPerformInteraction(0, Date.now()) === true, '7. never-yet-performed (0) is always allowed');
        assert(canPerformInteraction(null, Date.now()) === true, '8. null last-performed is always allowed');
        const now = 10000;
        assert(canPerformInteraction(now, now + 1) === false, '9. immediately after performing, another attempt is blocked');
        assert(canPerformInteraction(now, now + INTERACTION_COOLDOWN_MS - 1) === false, '10. still blocked just before the cooldown elapses');
        assert(canPerformInteraction(now, now + INTERACTION_COOLDOWN_MS) === true, '11. allowed the instant the cooldown fully elapses');
        assert(canPerformInteraction(now, now + 50, 100) === false, '12. a custom cooldownMs is honored (still within it)');
        assert(canPerformInteraction(now, now + 150, 100) === true, '13. a custom cooldownMs is honored (past it)');
    }

    // -------------------------------------------------------------
    // Section C — core/AvatarFacing.js
    // -------------------------------------------------------------
    {
        const origin = { x: 0, y: 0, z: 0 };
        assert(Math.abs(computeFacingYawDegrees(origin, { x: 0, y: 0, z: 10 }) - 0) < 1e-9, '14. facing straight +Z is 0 degrees');
        assert(Math.abs(computeFacingYawDegrees(origin, { x: 10, y: 0, z: 0 }) - 90) < 1e-9, '15. facing straight +X is 90 degrees');
        assert(Math.abs(computeFacingYawDegrees(origin, { x: 0, y: 0, z: -10 }) - 180) < 1e-9, '16. facing straight -Z is 180 degrees');
        assert(Math.abs(computeFacingYawDegrees(origin, { x: -10, y: 0, z: 0 }) - 270) < 1e-9, '17. facing straight -X is 270 degrees (always normalized non-negative)');
        assert(computeFacingYawDegrees(origin, { x: 0, y: 0, z: 0 }) === null, '18. coinciding positions -> null, never an arbitrary angle');
        assert(computeFacingYawDegrees(origin, { x: 0, y: 5, z: 0 }) === null, '19. differing only in Y (straight up) -> null, no meaningful horizontal yaw');
        // Y is ignored when X/Z DO differ — facing is purely horizontal.
        const withY = computeFacingYawDegrees({ x: 0, y: 0, z: 0 }, { x: 0, y: 99, z: 10 });
        assert(Math.abs(withY - 0) < 1e-9, '20. facing ignores Y entirely once X/Z differ');
    }

    // -------------------------------------------------------------
    // Section D — core/AvatarGesturePoseOffsets.js
    // -------------------------------------------------------------
    {
        assert(getGesturePoseOverride(AvatarInteractionKind.NONE) === null, '21. NONE -> no pose override');
        assert(getGesturePoseOverride('not-a-real-kind') === null, '22. an unrecognized kind -> no override, never throws');
        assert(getGesturePoseOverride(undefined) === null, '23. undefined -> no override');
    }
    {
        const wave0 = getGesturePoseOverride(AvatarInteractionKind.WAVE, 0);
        assert(wave0.headTiltDegrees === -12 && wave0.bodyTiltDegrees === 0, '24. WAVE at t=0 is its base pose exactly (no visible pop at gesture start)');
        const waveLater = getGesturePoseOverride(AvatarInteractionKind.WAVE, 0.5);
        assert(waveLater.headTiltDegrees !== wave0.headTiltDegrees, '25. WAVE wobbles over elapsed time — a living gesture, not a frozen frame');
    }
    {
        const greetA = getGesturePoseOverride(AvatarInteractionKind.GREET, 0);
        const greetB = getGesturePoseOverride(AvatarInteractionKind.GREET, 3);
        assert(JSON.stringify(greetA) === JSON.stringify(greetB), '26. GREET has no wobble — identical pose regardless of elapsed time');
        assert(greetA.bodyTiltDegrees > 0, '27. GREET tilts the body forward (a bow-like lean)');
    }
    {
        const point = getGesturePoseOverride(AvatarInteractionKind.POINT, 1);
        assert(point.bodyTiltDegrees < 0, '28. POINT tilts distinctly from GREET/WAVE — a genuinely different, recognizable pose');
    }

    // -------------------------------------------------------------
    // Section E — AvatarInteractionState (0.2.44 extension)
    // -------------------------------------------------------------
    {
        const empty = AvatarInteractionState.empty();
        assert(empty.interaction === AvatarInteractionKind.NONE, '29. empty() carries interaction NONE by default');
        assert(empty.interactionStartedAt === null, '30. empty() carries no interactionStartedAt');
        assert(empty.isGesturing === false, '31. empty() is never "gesturing"');
    }
    {
        const targeted = AvatarInteractionState.avatar('bob');
        assert(targeted.interaction === AvatarInteractionKind.NONE, '32. a freshly targeted avatar starts with no gesture in progress');
        const waving = targeted.withInteraction(AvatarInteractionKind.WAVE, 12345);
        assert(waving.avatarId === 'bob', '33. withInteraction() keeps the SAME targeted avatarId');
        assert(waving.interaction === AvatarInteractionKind.WAVE && waving.interactionStartedAt === 12345,
            '34. withInteraction() sets the new gesture and its start time');
        assert(waving.isGesturing === true, '35. isGesturing is true while a real gesture is set');
        assert(targeted.interaction === AvatarInteractionKind.NONE, '36. withInteraction() never mutates the original instance (immutable setter)');
        const stopped = waving.withInteraction(AvatarInteractionKind.NONE, null);
        assert(stopped.avatarId === 'bob' && stopped.isGesturing === false, '37. withInteraction(NONE) clears the gesture but keeps the target');
    }
    {
        // A malformed/unknown interaction value is sanitized to NONE,
        // never thrown on and never stored verbatim — same "closed
        // vocabulary, degrade instead of throw" posture every other
        // small vocabulary in this codebase already follows.
        const bad = new AvatarInteractionState({ avatarId: 'x', interaction: 'not-a-real-gesture' });
        assert(bad.interaction === AvatarInteractionKind.NONE, '38. an invalid interaction value is sanitized to NONE');
    }

    // -------------------------------------------------------------
    // Section F — renderer/AvatarVisual.js: gesture + facing overlays
    // -------------------------------------------------------------
    {
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        visual.setAnimation(AvatarAnimationState.IDLE);
        const idleHeadTilt = visual._poseGroup.userData.avatarParts.head.rotation.x;
        visual.setGesture(AvatarInteractionKind.WAVE);
        const waveHeadTilt = visual._poseGroup.userData.avatarParts.head.rotation.x;
        assert(waveHeadTilt !== idleHeadTilt, '39. setGesture() actually changes the pose (head tilts for WAVE)');
        visual.setGesture(null);
        const clearedHeadTilt = visual._poseGroup.userData.avatarParts.head.rotation.x;
        assert(Math.abs(clearedHeadTilt - idleHeadTilt) < 1e-9, '40. clearing the gesture (null) restores the underlying locomotion pose exactly');
    }
    {
        // Legs (locomotion-only) are untouched by a gesture — a
        // gesture is upper-body-only, layered on top of whatever the
        // legs are already doing.
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        visual.setAnimation(AvatarAnimationState.WALKING);
        const legsBefore = visual._poseGroup.userData.avatarParts.legs.rotation.x;
        visual.setGesture(AvatarInteractionKind.GREET);
        const legsAfter = visual._poseGroup.userData.avatarParts.legs.rotation.x;
        assert(Math.abs(legsBefore - legsAfter) < 1e-9, '41. a gesture never touches leg pose — locomotion keeps playing underneath it');
    }
    {
        // tick() advances the gesture's own elapsed-time wobble clock.
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        visual.setAnimation(AvatarAnimationState.IDLE);
        visual.setGesture(AvatarInteractionKind.WAVE);
        const t0HeadTilt = visual._poseGroup.userData.avatarParts.head.rotation.x;
        visual.tick(0.5);
        const t1HeadTilt = visual._poseGroup.userData.avatarParts.head.rotation.x;
        assert(t0HeadTilt !== t1HeadTilt, '42. tick() advances the gesture wobble over real elapsed time');
    }
    {
        // setFacingOverride: overrides root.rotation.y regardless of
        // what setPose's own rotation says, and clearing it restores
        // the real presence-driven facing WITHOUT a new setPose call.
        const visual = new AvatarVisual(new AvatarRenderer());
        visual.setAppearance(humanoid01, humanoid01.defaultAppearance);
        visual.setPose({ x: 0, y: 0, z: 0 }, { y: 45 });
        assert(Math.abs(visual.root.rotation.y - THREEDegToRad(45)) < 1e-9, '43. setPose alone sets root.rotation.y from the given rotation');
        visual.setFacingOverride(180);
        assert(Math.abs(visual.root.rotation.y - THREEDegToRad(180)) < 1e-9, '44. setFacingOverride overrides root.rotation.y regardless of the last presence rotation');
        visual.setFacingOverride(null);
        assert(Math.abs(visual.root.rotation.y - THREEDegToRad(45)) < 1e-9, '45. clearing the override (null) restores the real presence rotation immediately, no new setPose needed');
    }

    function THREEDegToRad(deg) { return deg * (Math.PI / 180); }

    // -------------------------------------------------------------
    // Section G — WorldNavigationSession.performAvatarInteraction()
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = spyFacade();
        assert(session.performAvatarInteraction(AvatarInteractionKind.WAVE) === false, '46. no current interaction target -> rejected');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-g2', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session.targetAvatar(avatarPresenceSession.current.avatarId);
        assert(session.performAvatarInteraction(AvatarInteractionKind.WAVE) === false, '47. gesturing at YOURSELF is rejected');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-g3', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session._setAvatarInteraction(AvatarInteractionState.avatar('bob'));
        assert(session.performAvatarInteraction('not-a-real-kind') === false, '48. an invalid kind is rejected');
        assert(session.performAvatarInteraction(AvatarInteractionKind.NONE) === false, '49. NONE is never a performable gesture');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-g4', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session._setAvatarInteraction(AvatarInteractionState.avatar('bob'));

        assert(session.performAvatarInteraction(AvatarInteractionKind.WAVE) === true, '50. a valid gesture at a valid remote target succeeds');
        assert(session.getAvatarInteraction().interaction === AvatarInteractionKind.WAVE, '51. the resulting state records the gesture');
        assert(session.getAvatarInteraction().avatarId === 'bob', '52. ...while keeping the same target');
        assert(session.getAvatarInteraction().interactionStartedAt !== null, '53. ...and records when it started');

        // Cooldown: immediately trying again (even a DIFFERENT kind)
        // is rejected.
        assert(session.performAvatarInteraction(AvatarInteractionKind.POINT) === false, '54. an immediate second gesture is blocked by the cooldown, regardless of kind');
        assert(session.getAvatarInteraction().interaction === AvatarInteractionKind.WAVE, '55. ...and the rejected attempt never overwrote the first gesture');

        await wait(INTERACTION_COOLDOWN_MS + 100);
        assert(session.performAvatarInteraction(AvatarInteractionKind.GREET) === true, '56. once the cooldown genuinely elapses, another gesture is accepted');
        assert(session.getAvatarInteraction().interaction === AvatarInteractionKind.GREET, '57. ...and it reflects the NEW gesture');

        session.dispose();
    }

    // -------------------------------------------------------------
    // Section H — WorldNavigationSession per-frame integration
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-h1', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();
        const tick = facade.calls.onAnimationFrameCallbacks[0];

        // No target at all -> every frame pushes "no gesture, no
        // facing override" (both null), never throws.
        tick(0.016);
        assert(facade.calls.setLocalAvatarGesture.at(-1) === null, '58. no target -> no gesture pushed to the renderer');
        assert(facade.calls.setLocalAvatarFacing.at(-1) === null, '59. no target -> no facing override pushed either');

        // A remote target, stubbed directly onto the registry (same
        // "poke session internals directly" pattern
        // tests/WorldEntityInteraction.test.js already uses) so this
        // section stays a focused unit test of the presentation logic
        // itself, not a second copy of 0.2.37's full sync pipeline.
        session._remoteAvatarRegistry = {
            has: () => true,
            currentPosition: () => ({ x: 10, y: 0, z: 0 }),
            dispose() {}
        };
        session._setAvatarInteraction(AvatarInteractionState.avatar('remote-h'));

        tick(0.016);
        const yawWhenStill = facade.calls.setLocalAvatarFacing.at(-1);
        assert(typeof yawWhenStill === 'number' && Math.abs(yawWhenStill - 90) < 1e-6,
            '60. a stationary local avatar with a remote target faces it exactly (target due +X here -> 90 degrees)');

        // Perform a gesture; the very next frame must reflect it.
        assert(session.performAvatarInteraction(AvatarInteractionKind.WAVE) === true, '61. sanity — the gesture is accepted');
        tick(0.016);
        assert(facade.calls.setLocalAvatarGesture.at(-1) === AvatarInteractionKind.WAVE, '62. the frame loop pushes the active gesture to the renderer');

        // Holding a movement key stops the facing override (the
        // player's own input always wins) but does not touch the
        // gesture.
        session._avatarMovementController.keyDown('w');
        tick(0.016);
        assert(facade.calls.setLocalAvatarFacing.at(-1) === null, '63. actively moving clears the facing override, even with a target still set');
        assert(facade.calls.setLocalAvatarGesture.at(-1) === AvatarInteractionKind.WAVE, '64. ...but never interrupts an in-progress gesture');
        session._avatarMovementController.keyUp('w');

        // Real elapsed time past GESTURE_DURATION_MS auto-expires the
        // gesture back to NONE, with no explicit "stop" call needed.
        await wait(1900);
        tick(0.016);
        assert(session.getAvatarInteraction().interaction === AvatarInteractionKind.NONE, '65. the gesture auto-expires back to NONE after its duration elapses');
        assert(facade.calls.setLocalAvatarGesture.at(-1) === null, '66. ...and the renderer is told to clear it');

        session.dispose();
    }
    {
        // Facing a target that IS the local avatar itself never
        // produces an override — targeting yourself is already
        // rejected by performAvatarInteraction, but even a directly
        // self-targeted state (e.g. via targetAvatar(localId), which
        // IS allowed for inspection purposes) must never make the
        // avatar try to face itself.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-h2', { x: 0, y: 0, z: 0 });
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, avatarProfileUseCase, avatarPresenceSession });
        const facade = spyFacade();
        session._session = facade;
        session._setupLocalAvatar();
        session.targetAvatar(avatarPresenceSession.current.avatarId);

        const tick = facade.calls.onAnimationFrameCallbacks[0];
        tick(0.016);
        assert(facade.calls.setLocalAvatarFacing.at(-1) === null, '67. targeting yourself never produces a facing override');

        session.dispose();
    }

    console.log('✅ All Avatar Interaction Gesture tests passed.');
}

await runTests();
