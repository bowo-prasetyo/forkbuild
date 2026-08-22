import { walkableTopAt, isStepClimbable, DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { brickAabb, translateAabb } from '../core/AvatarCollision.js';
import { AvatarStepConstraint } from '../application/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.3.2 — Step-Up Movement.
//
//   Section A: core/BrickWalkability.js — pure step-height geometry
//   Section B: application/AvatarStepConstraint.js — real loaded-brick support height
//   Section C: application/AvatarMovementConstraint.js — a climbable brick is excluded from collision
//   Section D: application/AvatarMovementController.js — the full three-stage pipeline
//   Section E: WorldNavigationSession integration
//   Section F: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: stepping onto a
// brick is a DETERMINISTIC HEIGHT CONSTRAINT applied to movement, the
// same shape 0.2.42 (building collision) and 0.2.77 (terrain slope)
// already established — never a physics engine, never a rewrite of
// core/AvatarMovementSimulation.js's own pure kinematics (only its
// flat-plane ASSUMPTION becomes an injectable `groundHeight`, still a
// plain number with no idea what a brick even is), and never something
// that requires a wired stepConstraint at all — every controller/
// constraint built without one behaves exactly as it did before this
// milestone.

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

// A minimal, duck-typed "loaded document" — application/AvatarMovementConstraint.js
// and application/AvatarStepConstraint.js only ever read `document.world.getBuildings()`,
// so a real Document/publication pipeline (tests/AvatarCollision.test.js's own
// publishWallDocument()) is unnecessary plumbing for a test that's
// entirely about the step-height decision, not about publishing itself.
function documentWithBricks(bricks) {
    const world = new World();
    const building = new Building({ creator: 'step-test' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return { world };
}

function spyFacade() {
    const calls = { onAnimationFrameCallbacks: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence() {}, setLocalAvatarVisible() {}, removeLocalAvatar() {},
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

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A — core/BrickWalkability.js: pure step-height geometry
    // -------------------------------------------------------------
    {
        const aabb = { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 0.4, z: 0.5 } };
        assert(walkableTopAt(aabb, 0, 0) === 0.4, '1. walkableTopAt: a point inside the footprint returns the brick\'s own top face');
        assert(walkableTopAt(aabb, 0.5, 0.5) === 0.4, '2. walkableTopAt: the footprint\'s own edge is inclusive');
        assert(walkableTopAt(aabb, 10, 10) === null, '3. walkableTopAt: a point outside the footprint returns null, not a height of zero');
        assert(walkableTopAt(null, 0, 0) === null, '4. walkableTopAt: a missing AABB degrades to null, never throws');
    }
    {
        assert(isStepClimbable(0, 0.3, DEFAULT_MAX_STEP_HEIGHT) === true, '5. isStepClimbable: a small rise within the default limit is climbable');
        assert(isStepClimbable(0, DEFAULT_MAX_STEP_HEIGHT, DEFAULT_MAX_STEP_HEIGHT) === true, '6. isStepClimbable: a step landing EXACTLY on the limit is still climbable (inclusive boundary)');
        assert(isStepClimbable(0, DEFAULT_MAX_STEP_HEIGHT + 0.01, DEFAULT_MAX_STEP_HEIGHT) === false, '7. isStepClimbable: one hair past the limit is not');
        assert(isStepClimbable(2, 0, DEFAULT_MAX_STEP_HEIGHT) === false, '8. isStepClimbable: a big step DOWN is exactly as blocked as a big step up — symmetric, matching TerrainWalkability\'s own convention');
        assert(isStepClimbable(NaN, 1) === false, '9. isStepClimbable: a non-finite height never climbs, never throws');
    }

    // -------------------------------------------------------------
    // Section B — application/AvatarStepConstraint.js
    // -------------------------------------------------------------
    {
        const constraint = new AvatarStepConstraint({});
        assert(constraint.supportHeightAt(0, 0) === 0, '10. AvatarStepConstraint: with no loaded documents at all, support height is the flat Y=0 plane');
    }
    {
        // A single low brick (core:plate_2x4 — a thin, low platform)
        // sitting on the ground at (0,0) — support height rises to its
        // top exactly within its footprint, and stays flat everywhere
        // else.
        const definition = brickRegistry.get('core:plate_2x4');
        const brickY = definition.height / 2;
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, brickY, 0) })
        ]);
        const worldAabb = translateAabb(brickAabb({ x: 0, y: brickY, z: 0 }, definition), { x: 0, y: 0, z: 0 });
        const loadedDocuments = new Map([['doc-1', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        assert(constraint.supportHeightAt(0, 0) === worldAabb.max.y, '11. AvatarStepConstraint: standing over the brick\'s own footprint reports its top face as the support height');
        assert(constraint.supportHeightAt(50, 50) === 0, '12. AvatarStepConstraint: far outside the brick\'s footprint, support height is the flat plane');
    }
    {
        // Two bricks stacked (a 1-tall core:cube base, a thin
        // core:plate_2x4 step on top) — supportHeightAt reports the
        // TOPMOST surface, never the base.
        const base = brickRegistry.get('core:cube');
        const step = brickRegistry.get('core:plate_2x4');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, base.height / 2, 0) }),
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, base.height + step.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-stack', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const expectedTop = base.height + step.height;
        assert(Math.abs(constraint.supportHeightAt(0, 0) - expectedTop) < 1e-9,
            '13. AvatarStepConstraint: standing over a stack reports the TOPMOST brick\'s surface, never the one underneath it');
    }
    {
        // apply(): a climbable step is taken in full — X/Z advance to
        // the desired position, Y snaps onto the new support height.
        const definition = brickRegistry.get('core:plate_2x4');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(1, definition.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-2', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { grounded: true });
        assert(result.blocked === false, '14. AvatarStepConstraint: a step within maxStepHeight is never blocked');
        assert(result.position.x === 1 && result.position.z === 0, '15. AvatarStepConstraint: X/Z advance to the desired position');
        assert(Math.abs(result.position.y - definition.height) < 1e-9, '16. AvatarStepConstraint: Y snaps onto the brick\'s own top face');
    }
    {
        // A step too tall to climb is blocked outright — X/Z revert,
        // Y still passes through untouched (never cancels a jump).
        const tall = brickRegistry.get('core:cube');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(1, tall.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-3', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 0.7, z: 0 }, { x: 1, y: 0.7, z: 0 }, { grounded: true });
        assert(tall.height > DEFAULT_MAX_STEP_HEIGHT, 'sanity: core:cube is taller than the default step limit');
        assert(result.blocked === true, '17. AvatarStepConstraint: a step taller than maxStepHeight is blocked');
        assert(result.position.x === 0 && result.position.z === 0, '18. AvatarStepConstraint: a blocked step reverts X/Z to exactly where the avatar already stood');
        assert(result.position.y === 0.7, '19. AvatarStepConstraint: a blocked step still passes Y through from the desired position unchanged');
    }
    {
        // Airborne (mid-jump/fall) passes straight through, unmodified
        // — a step decision only ever applies while grounded.
        const tall = brickRegistry.get('core:cube');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(1, tall.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-4', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 2, z: 0 }, { x: 1, y: 1.9, z: 0 }, { grounded: false });
        assert(result.blocked === false && result.position.x === 1 && result.position.y === 1.9,
            '20. AvatarStepConstraint: an airborne tick passes through completely unmodified, even toward a too-tall brick');
    }
    {
        // Missing loadedDocuments/getWorldPosition degrades to the
        // flat plane, never throws.
        const constraint = new AvatarStepConstraint({});
        let threw = false;
        let result;
        try { result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { grounded: true }); } catch (e) { threw = true; }
        assert(!threw, '21. AvatarStepConstraint: missing geometry collaborators never throw');
        assert(result.blocked === false && result.position.y === 0, '22. AvatarStepConstraint: ...and simply report the flat plane throughout');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarMovementConstraint.js: 0.3.2
    // step-up obstacle exclusion
    // -------------------------------------------------------------
    {
        // Backward compatibility: omitting maxStepHeight/supportHeight
        // entirely (every pre-0.3.2 call) excludes nothing — a low
        // brick still blocks exactly like before this milestone.
        const low = brickRegistry.get('core:plate_2x4');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(1, low.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-5', document]]);
        const constraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
        assert(result.collided === true, '23. AvatarMovementConstraint: with no maxStepHeight wired, even a low brick still blocks horizontal passage — unchanged pre-0.3.2 behavior');
    }
    {
        // With maxStepHeight + a matching supportHeight, a LOW brick
        // (within reach) is excluded from the obstacle list entirely —
        // horizontal movement passes straight through its footprint.
        const low = brickRegistry.get('core:plate_2x4');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(1, low.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-6', document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
        });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { supportHeight: 0 });
        assert(result.collided === false && result.position.x === 2,
            '24. AvatarMovementConstraint: a brick within maxStepHeight of the avatar\'s own supportHeight is excluded from collision — never blocks passage');
    }
    {
        // A TALL brick (beyond maxStepHeight) still blocks, even with
        // stepping enabled — stepping only ever excuses a SHORT rise.
        const tall = brickRegistry.get('core:cube');
        assert(tall.height > DEFAULT_MAX_STEP_HEIGHT, 'sanity: core:cube is taller than the default step limit');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(1, tall.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-7', document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
        });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { supportHeight: 0 });
        assert(result.collided === true, '25. AvatarMovementConstraint: a brick TALLER than maxStepHeight still blocks passage — stepping never excuses a real wall');
    }

    // -------------------------------------------------------------
    // Section D — application/AvatarMovementController.js: the full
    // three-stage pipeline (collision -> terrain slope -> step-up)
    // -------------------------------------------------------------
    {
        // Backward compatibility: a controller built without a fourth
        // argument at all behaves exactly as it did before this
        // milestone.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'step-legacy');
        const controller = new AvatarMovementController(avatarPresenceSession, null, null);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '26. AvatarMovementController: unchanged three-argument construction still moves normally');
        assert(controller.isBlockedByStepHeight() === false, '27. AvatarMovementController: isBlockedByStepHeight() defaults false with no step constraint wired at all');
    }
    {
        // End-to-end: a low brick directly ahead is neither an
        // impassable wall (movementConstraint excludes it, given the
        // matching maxStepHeight) nor invisible (stepConstraint snaps
        // Y onto its top once the avatar reaches it).
        const { avatarPresenceSession } = buildAvatarStack(registry, 'step-climb');
        const low = brickRegistry.get('core:plate_2x4');
        // default facing (rotation 0) walks toward +z — see
        // core/AvatarMovementSimulation.js's own angle convention, the
        // same one every other movement test in this codebase already
        // relies on (tests/AvatarTerrainWalkability.test.js included).
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, low.height / 2, 1.5) })
        ]);
        const loadedDocuments = new Map([['doc-8', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);
        controller.keyDown('w');
        let steppedOnto = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.05);
            if (Math.abs(avatarPresenceSession.current.position.y - low.height) < 1e-6) steppedOnto = true;
        }
        controller.keyUp('w');
        assert(steppedOnto, '28. AvatarMovementController: the avatar\'s Y actually rises onto the low brick\'s own top face once it reaches it');
        assert(controller.isBlockedByStepHeight() === false, '29. AvatarMovementController: a successfully climbed step reports no block');
    }
    {
        // A brick too tall to climb is genuinely blocked end to end —
        // the avatar never crosses it, and isBlockedByStepHeight()
        // reflects that.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'step-blocked');
        const tall = brickRegistry.get('core:cube');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, tall.height / 2, 1.5) })
        ]);
        const loadedDocuments = new Map([['doc-9', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);
        controller.keyDown('w'); // default facing walks toward +z, straight at the tall brick
        let sawBlocked = false;
        for (let i = 0; i < 200; i++) {
            controller.tick(0.05);
            if (controller.isBlockedByStepHeight() || controller.isCollided()) sawBlocked = true;
        }
        controller.keyUp('w');
        assert(sawBlocked, '30. AvatarMovementController: a too-tall brick genuinely obstructs the avatar end to end');
        assert(avatarPresenceSession.current.position.y < DEFAULT_MAX_STEP_HEIGHT + 0.01,
            '31. AvatarMovementController: the avatar never climbs a brick taller than maxStepHeight');
    }
    {
        // Standing still (no keys held) is a true no-op even with
        // every constraint wired — no drift, no sequence advance.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'step-idle');
        const stepConstraint = new AvatarStepConstraint({});
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, stepConstraint);
        const sequenceBefore = avatarPresenceSession.current.sequence;
        controller.tick(0.5);
        assert(avatarPresenceSession.current.sequence === sequenceBefore, '32. AvatarMovementController: an idle avatar with a step constraint wired is still an exact no-op');
    }

    // -------------------------------------------------------------
    // Section E — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-step-wired');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        assert(session._avatarMovementController instanceof AvatarMovementController,
            '33. WorldNavigationSession: a real movement controller is built for the local avatar');
        assert(session._avatarMovementController.isBlockedByStepHeight() === false,
            '34. WorldNavigationSession: a fresh session reports no step block before any movement has happened');

        // Ordinary local avatar movement with nothing loaded proceeds
        // exactly as before this milestone.
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) {
            session._avatarMovementController.tick(0.05);
        }
        session.avatarKeyUp('w');
        assert(avatarPresenceSession.current.position.z > 0,
            '35. WorldNavigationSession: the local avatar walks normally with no loaded geometry — no regression to everyday walking');
        assert(avatarPresenceSession.current.position.y === 0,
            '36. WorldNavigationSession: with nothing loaded, the avatar stays on the flat Y=0 plane, exactly as before this milestone');
    }
    {
        // Full end-to-end integration through the real session,
        // reaching into _loadedDocuments the same way
        // tests/AvatarCollision.test.js's own Section D already does —
        // proves the wiring reaches the real controller, not merely
        // that the classes exist in isolation.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-step-climb');
        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();

        const low = brickRegistry.get('core:plate_2x4');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, low.height / 2, 1.5) })
        ]);
        session._loadedDocuments.set('step-doc', document);
        session._getWorldPosition = () => ({ x: 0, y: 0, z: 0 });

        session.setAvatarControlMode(true);
        session.avatarKeyDown('w'); // default facing walks toward +z, straight at the low brick
        let steppedOnto = false;
        for (let i = 0; i < 400; i++) {
            session._avatarMovementController.tick(0.05);
            if (Math.abs(avatarPresenceSession.current.position.y - low.height) < 1e-6) steppedOnto = true;
        }
        session.avatarKeyUp('w');
        assert(steppedOnto, '37. WorldNavigationSession: the local avatar\'s own movement genuinely climbs a real, loaded low brick end to end');
    }
    {
        // No local avatar at all — unchanged early-return behavior,
        // never throws, no controller (and so no step constraint)
        // built.
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = spyFacade();
        let threw = false;
        try { session._setupLocalAvatar(); } catch (e) { threw = true; }
        assert(!threw, '38. WorldNavigationSession: _setupLocalAvatar() with no avatar wired never throws, step-up or otherwise');
        assert(session._avatarMovementController === null, '39. WorldNavigationSession: no movement controller — and so no step constraint — is ever built without a local avatar');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: the design doc's own scripted scenario.
    //
    //   Avatar walks toward a low brick -> steps onto it without being
    //   treated as a wall -> Y visibly rises onto its top face ->
    //   avatar then walks toward a TALL brick -> genuinely blocked,
    //   never climbed -> AvatarPresence's own wire shape is unchanged
    //   throughout -> no document/profile ever touched.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-stepup');
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
        session._session = spyFacade();
        session._setupLocalAvatar();

        const low = brickRegistry.get('core:plate_2x4');
        const tall = brickRegistry.get('core:cube');
        assert(tall.height > DEFAULT_MAX_STEP_HEIGHT, 'sanity: core:cube is taller than the default step limit');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, low.height / 2, 1.5) }),
            new Brick({ definitionId: 'core:cube', position: new Position(0, tall.height / 2, 6) })
        ]);
        session._loadedDocuments.set('flagship-doc', document);
        session._getWorldPosition = () => ({ x: 0, y: 0, z: 0 });

        // 1. Walk toward the low brick and step onto it.
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        let steppedOnto = false;
        for (let i = 0; i < 200; i++) {
            session._avatarMovementController.tick(0.05);
            const p = avatarPresenceSession.current.position;
            assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
                `40. FLAGSHIP: position stays finite at every step (tick ${i}) — no NaN/Infinity from step-height sampling`);
            if (Math.abs(p.y - low.height) < 1e-6) steppedOnto = true;
        }
        assert(steppedOnto, '41. FLAGSHIP: Alice steps onto the low brick without it ever acting as a wall');
        assert(avatarPresenceSession.current.position.z > 1.5, '42. FLAGSHIP: Alice actually crosses past the low brick\'s own position — it was climbed, not merely tolerated in place');

        // 2. Continue toward the tall brick — genuinely blocked.
        let sawBlocked = false;
        for (let i = 0; i < 200; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isBlockedByStepHeight() || session._avatarMovementController.isCollided()) sawBlocked = true;
        }
        session.avatarKeyUp('w');
        assert(sawBlocked, '43. FLAGSHIP: the tall brick genuinely blocks Alice — never treated as a step');
        assert(avatarPresenceSession.current.position.z < 6, '44. FLAGSHIP: Alice never crosses into the tall brick\'s own footprint');

        // 3. AvatarPresence's own wire shape is exactly what it always
        // was, and no AvatarProfile or document was ever touched.
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '45. FLAGSHIP: AvatarPresence\'s own JSON shape is exactly what 0.2.33/0.2.37 established — nothing step-related ever joins it');
        assert(JSON.stringify(avatarProfileUseCase.getProfile().toJSON()) === profileJsonBefore,
            '46. FLAGSHIP: AvatarProfile is completely untouched by step-up movement');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '47. FLAGSHIP: no document is ever created for the avatar, its movement, or a step block');
    }

    console.log('✅ All Step-Up Movement tests passed.');
}

await runTests();
