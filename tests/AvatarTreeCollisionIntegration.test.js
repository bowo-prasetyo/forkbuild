import { readFile } from 'node:fs/promises';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.63 — Avatar Movement Collision Integration,
// application/AvatarTreeConstraint.js.
//
//   Section A: application/AvatarTreeConstraint.js — real + synthetic trees
//   Section B: application/AvatarMovementController.js — tree constraint wired into the movement pipeline
//   Section C: WorldNavigationSession integration
//   Section D: FLAGSHIP — a real avatar walking straight at a real,
//              deterministic tree through the entire chain
//   Section E: architectural regression — no new collision mathematics,
//              no new status vocabulary, no terrain coupling
//
// Central architectural claim under test throughout: this milestone adds
// NO new collision mathematics of its own. It only connects the already
// complete, already independently tested geometric pipeline —
// core/TreeCollisionGeometry.js (0.9.59), core/AvatarTreeCollision.js
// (0.9.60), core/AvatarTreeMovement.js (0.9.61), and
// core/AvatarTreeCollisionQuery.js (0.9.62) — to the same
// application/AvatarMovementController.js pipeline
// application/AvatarMovementConstraint.js (buildings, 0.2.42) and
// application/AvatarTerrainConstraint.js (terrain slope, 0.2.77) already
// plug into. See docs/Roadmap.md, 0.9.63, for the full milestone story.

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
// same way tests/AvatarTreeCollisionQuery.test.js already finds one, so
// this file never invents a second "how do I find a real tree" recipe.
function findRealTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    return wide[0];
}

async function runTests() {
    const registry = buildRegistry();
    const realTree = findRealTree();

    // -------------------------------------------------------------
    // Section A — application/AvatarTreeConstraint.js
    // -------------------------------------------------------------
    {
        // A — Free movement: no candidate trees at all -> the requested
        // position is preserved exactly.
        const constraint = new AvatarTreeConstraint();
        const far = { x: 1000, y: 0, z: 1000 };
        const desired = { x: 1001, y: 0, z: 1000 };
        const result = constraint.apply(far, desired);
        assert(result.position.x === desired.x && result.position.y === desired.y && result.position.z === desired.z,
            '1. AvatarTreeConstraint: free movement far from any tree passes the requested position through unchanged');
        assert(result.collided === false, '2. AvatarTreeConstraint: free movement never reports a collision');
    }
    {
        // B — Direct tree approach: the avatar actually stops at the
        // tree's own collision boundary, walking straight at a real tree.
        const constraint = new AvatarTreeConstraint();
        const approachStart = { x: realTree.center.x, y: 1.7, z: realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 5) };
        const desired = { x: realTree.center.x, y: 1.7, z: realTree.center.z };
        const result = constraint.apply(approachStart, desired);
        assert(result.collided === true, '3. AvatarTreeConstraint: walking straight into a real tree is detected as a collision');
        const distToCenter = Math.hypot(result.position.x - realTree.center.x, result.position.z - realTree.center.z);
        const combinedRadius = realTree.radius + AVATAR_COLLISION_RADIUS;
        assert(distToCenter >= combinedRadius - 1e-6, '4. AvatarTreeConstraint: the resolved position never penetrates the tree\'s own combined collision radius');
        assert(distToCenter < combinedRadius + 1e-6, '5. AvatarTreeConstraint: the avatar actually stops AT the boundary, not short of it or arbitrarily far away');
    }
    {
        // C — Diagonal approach: the already-tested 0.9.61 sliding
        // behavior is exercised end to end, not merely a hard stop.
        const constraint = new AvatarTreeConstraint();
        const start = { x: realTree.center.x - (realTree.radius + AVATAR_COLLISION_RADIUS + 3), y: 0, z: realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 3) };
        const desired = { x: realTree.center.x + 3, y: 0, z: realTree.center.z + 3 };
        const result = constraint.apply(start, desired);
        assert(result.collided === true, '6. AvatarTreeConstraint: a diagonal approach through a real tree is detected');
        assert(!(result.position.x === start.x && result.position.z === start.z),
            '7. AvatarTreeConstraint: a diagonal approach SLIDES around the tree — it never freezes the avatar dead at its starting point');
    }
    {
        // D — Moving away: the avatar is never permanently attached to a
        // tree it starts touching.
        // A short step, deliberately: this real, densely-planted world
        // can have a second tree not far past this one, so "moving
        // away" is verified just past the boundary, never assumed clear
        // for an arbitrary distance.
        const constraint = new AvatarTreeConstraint();
        const touching = { x: realTree.center.x + (realTree.radius + AVATAR_COLLISION_RADIUS), y: 0, z: realTree.center.z };
        const movingAway = { x: touching.x + 0.05, y: 0, z: touching.z };
        const result = constraint.apply(touching, movingAway);
        assert(result.position.x === movingAway.x && result.position.z === movingAway.z,
            '8. AvatarTreeConstraint: walking directly away from a tree the avatar starts touching is completely unobstructed');
    }
    {
        // G — Y preservation: tree integration never changes vertical
        // position, whether or not a collision occurred.
        const constraint = new AvatarTreeConstraint();
        const collidingResult = constraint.apply(
            { x: realTree.center.x, y: 3.5, z: realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 2) },
            { x: realTree.center.x, y: 3.5, z: realTree.center.z }
        );
        assert(collidingResult.position.y === 3.5, '9. AvatarTreeConstraint: Y is preserved exactly even when the step collided with a tree');
        const freeResult = constraint.apply({ x: 500, y: -2.25, z: 500 }, { x: 501, y: -2.25, z: 500 });
        assert(freeResult.position.y === -2.25, '10. AvatarTreeConstraint: Y is preserved exactly for a free (non-colliding) step too');
    }
    {
        // I — Determinism: same seed + same positions -> same resolved
        // position, across two completely independent instances.
        const from = { x: realTree.center.x - 2, y: 0, z: realTree.center.z - 2 };
        const to = { x: realTree.center.x + 2, y: 0, z: realTree.center.z + 2 };
        const a = new AvatarTreeConstraint().apply(from, to);
        const b = new AvatarTreeConstraint().apply(from, to);
        assert(JSON.stringify(a) === JSON.stringify(b),
            '11. AvatarTreeConstraint: two independent default-seed instances resolve the identical movement identically');
    }
    {
        // 0.9.88 — avatarRadius passthrough: a caller-supplied radius
        // (a mounted vehicle's own, larger collisionRadius) reaches BOTH
        // the candidate query and the resolution step, stopping strictly
        // further from a real tree than the default (walking-avatar)
        // radius does — this is the exact end-to-end proof the
        // milestone's own brief calls out as its single most important
        // technical detail: the candidate query and the resolver must
        // never disagree about which radius is active.
        const carRadius = 0.80; // matches CAR_COLLISION_RADIUS, core/AvatarVehicleMovementCapability.js
        const approachStart = { x: realTree.center.x, y: 0, z: realTree.center.z - (realTree.radius + carRadius + 5) };
        const desired = { x: realTree.center.x, y: 0, z: realTree.center.z };

        const walkResult = new AvatarTreeConstraint().apply(approachStart, desired);
        const carResult = new AvatarTreeConstraint().apply(approachStart, desired, { avatarRadius: carRadius });

        const walkDistToCenter = Math.hypot(walkResult.position.x - realTree.center.x, walkResult.position.z - realTree.center.z);
        const carDistToCenter = Math.hypot(carResult.position.x - realTree.center.x, carResult.position.z - realTree.center.z);
        assert(carResult.collided === true, '11a. AvatarTreeConstraint: a car-sized avatarRadius still detects the real tree as a collision');
        assert(carDistToCenter > walkDistToCenter,
            '11b. AvatarTreeConstraint: a car-sized avatarRadius stops strictly further from the real tree\'s own center than the default (walking) radius does');
        assert(Math.abs(carDistToCenter - (carRadius + realTree.radius)) < 1e-6,
            '11c. AvatarTreeConstraint: the car-sized resolution stops exactly at carRadius + tree.radius — the SAME radius reached both the candidate query and the resolver, never a mismatched pair');

        // Omitting avatarRadius entirely reproduces the exact default
        // (walking-avatar) result, byte for byte.
        const explicitWalkRadius = new AvatarTreeConstraint().apply(approachStart, desired, { avatarRadius: AVATAR_COLLISION_RADIUS });
        assert(JSON.stringify(walkResult) === JSON.stringify(explicitWalkRadius),
            '11d. AvatarTreeConstraint: omitting the options argument entirely produces the exact same result as explicitly passing { avatarRadius: AVATAR_COLLISION_RADIUS }');
    }

    // -------------------------------------------------------------
    // Section B — application/AvatarMovementController.js
    // -------------------------------------------------------------
    {
        // H — Existing movement regression: a controller built WITHOUT a
        // treeConstraint at all behaves exactly as before this milestone.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-legacy');
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '12. AvatarMovementController: a controller built without a 5th argument still moves normally');
        assert(controller.isCollidedWithTree() === false, '13. AvatarMovementController: isCollidedWithTree() defaults false with no tree constraint wired at all');
    }
    {
        // A tree constraint that always reports a collision (the same
        // "alwaysBlocks" stand-in posture 0.2.42/0.2.77 already used)
        // proves the controller actually consults it.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-collides');
        const before = avatarPresenceSession.current.position;
        const alwaysCollides = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, alwaysCollides);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.x === before.x && avatarPresenceSession.current.position.z === before.z,
            '14. AvatarMovementController: a tree constraint that fully holds the avatar in place is actually honored');
        assert(controller.isCollidedWithTree() === true, '15. AvatarMovementController: isCollidedWithTree() reflects the constraint\'s own outcome');
    }
    {
        // Transient — recomputed fresh every tick, never sticky.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-transient');
        let colliding = true;
        const toggle = { apply: (position, desired) => (colliding ? { position, collided: true } : { position: desired, collided: false }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, toggle);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(controller.isCollidedWithTree() === true, '16. AvatarMovementController: collided while the tree constraint collides');
        colliding = false;
        controller.tick(0.5);
        assert(controller.isCollidedWithTree() === false, '17. AvatarMovementController: ...and false again the very next tick once it stops colliding — never sticky');
    }
    {
        // J — never leaks into AvatarPresence's own wire shape.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-shape');
        const alwaysCollides = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, alwaysCollides);
        controller.keyDown('a');
        controller.tick(0.5);
        const json = avatarPresenceSession.current.toJSON();
        assert(!('collided' in json) && !('collidedWithTree' in json) && !('blocked' in json),
            '18. AvatarMovementController: tree-collision state never appears on AvatarPresence\'s own JSON shape');
    }
    {
        // Composition order: building collision, terrain, and step
        // height ALL run first; tree collision runs on whatever position
        // they already produced, and never rewrites the Y they already
        // settled.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-order');
        const slidesToOrigin = { apply: (position) => ({ position, collided: true }) };
        let treeSawFrom = null;
        let treeSawTo = null;
        const observingTree = {
            apply: (position, desired) => {
                treeSawFrom = { ...position };
                treeSawTo = { ...desired };
                return { position: desired, collided: false };
            }
        };
        const controller = new AvatarMovementController(avatarPresenceSession, slidesToOrigin, null, null, observingTree);
        const startPos = avatarPresenceSession.current.position;
        controller.keyDown('w');
        controller.tick(0.5);
        assert(treeSawTo.x === startPos.x && treeSawTo.z === startPos.z,
            '19. AvatarMovementController: tree collision is evaluated against the position building collision ALREADY resolved to, never the raw pre-collision kinematic proposal');
    }
    {
        // 0.9.88 — the ONE new wire this milestone adds: whatever the
        // ACTIVE movement capability's own collisionRadius currently is
        // reaches the tree constraint's own `avatarRadius` option, every
        // tick, tracking capability changes with no drift.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-radius-wire');
        let treeSawOptions = null;
        const observingTree = {
            apply: (position, desired, options) => {
                treeSawOptions = options;
                return { position: desired, collided: false };
            }
        };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, observingTree);

        // No capability ever set — the documented default degrades to
        // `undefined`, letting the tree constraint's own downstream
        // default (AVATAR_COLLISION_RADIUS) take over.
        controller.keyDown('w');
        controller.tick(0.5);
        assert(treeSawOptions.avatarRadius === undefined,
            '19a. AvatarMovementController: with no movement capability ever set, the tree constraint\'s own avatarRadius option is undefined — the documented "never set means WALK\'s own existing radius" default');

        // Switching to CAR immediately changes the radius the very next
        // tick — no drift, no residual WALK influence.
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        controller.tick(0.5);
        assert(treeSawOptions.avatarRadius === 0.80,
            '19b. AvatarMovementController: setting CAR movement capability immediately feeds its own collisionRadius (0.80) to the tree constraint on the very next tick');

        // Switching back to WALK (VehicleType.NONE) immediately restores
        // the avatar's own existing radius.
        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controller.tick(0.5);
        assert(treeSawOptions.avatarRadius === 0.35,
            '19c. AvatarMovementController: switching back to WALK immediately restores the 0.35 avatar radius on the very next tick, with no residual CAR influence');
        controller.keyUp('w');
    }
    {
        // F — Swept-path detection: a single, fast tick straight through
        // a real tree is still stopped — the starting point alone is
        // never the only thing tested.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'tree-swept');
        avatarPresenceSession.update({
            position: { x: realTree.center.x, y: 0, z: realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 10) },
            rotation: { y: 0 }
        });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
        controller.keyDown('w');
        // A single large tick that would, unconstrained, cross straight
        // through the tree's own footprint in one step.
        controller.tick(20);
        controller.keyUp('w');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realTree.center.x,
            avatarPresenceSession.current.position.z - realTree.center.z
        );
        assert(finalDistance >= realTree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '20. AvatarMovementController: a single fast tick cannot jump clean through a tree — the full swept segment is tested, not merely the tick\'s starting point');
    }

    // -------------------------------------------------------------
    // Section C — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        // Always built, unconditionally — no new constructor dependency
        // on WorldNavigationSession itself, the same posture 0.2.42/
        // 0.2.77 already established.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-tree-wired');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        assert(session._avatarMovementController._treeConstraint instanceof AvatarTreeConstraint,
            '21. WorldNavigationSession: a real AvatarTreeConstraint is built and wired for the local avatar');
        assert(session._avatarMovementController.isCollidedWithTree() === false,
            '22. WorldNavigationSession: a fresh session reports no tree collision before any movement has happened');
    }
    {
        // No local avatar at all — unchanged early-return behavior,
        // never throws, no controller (and so no tree constraint) built.
        const session = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = spyFacade();
        let threw = false;
        try { session._setupLocalAvatar(); } catch (e) { threw = true; }
        assert(!threw, '23. WorldNavigationSession: _setupLocalAvatar() with no avatar wired never throws, tree collision or otherwise');
        assert(session._avatarMovementController === null, '24. WorldNavigationSession: no movement controller — and so no tree constraint — is ever built without a local avatar');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: a real avatar walking straight at a real,
    // deterministic tree, through the ENTIRE chain —
    // NaturalFeatureField -> TreeCollisionGeometry ->
    // AvatarTreeCollisionQuery -> AvatarTreeCollision -> AvatarTreeMovement
    // -> AvatarTreeConstraint -> AvatarMovementController -> avatar position.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-tree');
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

        // Walking straight at the real tree (default facing, rotation
        // 0, walks toward +z) must eventually stop the avatar's approach
        // — it never passes through — and the position stays finite and
        // continuous at every single tick.
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        let everCollided = false;
        let maxStepDistance = 0;
        let lastPosition = avatarPresenceSession.current.position;
        for (let i = 0; i < 400; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isCollidedWithTree()) everCollided = true;
            const p = avatarPresenceSession.current.position;
            assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
                `25. FLAGSHIP: position stays finite at every tick (tick ${i}) approaching a real tree`);
            const stepDistance = Math.hypot(p.x - lastPosition.x, p.z - lastPosition.z);
            maxStepDistance = Math.max(maxStepDistance, stepDistance);
            lastPosition = p;
        }
        session.avatarKeyUp('w');

        assert(everCollided === true, '26. FLAGSHIP: the local avatar\'s own movement is genuinely constrained by a real tree, end to end');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realTree.center.x,
            avatarPresenceSession.current.position.z - realTree.center.z
        );
        assert(finalDistance >= realTree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '27. FLAGSHIP: the avatar never penetrates the real tree\'s own collision circle');
        assert(maxStepDistance < 1, '28. FLAGSHIP: no single tick ever produces a discontinuous jump through the tree');

        // E — Multiple trees: a wide region genuinely contains more than
        // one tree, and resolving against all of them (supplied order)
        // never throws and always keeps the avatar out of every one of
        // them it actually approaches.
        const manyTrees = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, realTree.center.x - 30, realTree.center.z - 30, realTree.center.x + 30, realTree.center.z + 30);
        assert(manyTrees.length > 1, '29. FLAGSHIP setup: a real 60x60 region around this tree contains multiple trees');
        const treeConstraint = new AvatarTreeConstraint();
        for (const tree of manyTrees) {
            const approach = { x: tree.center.x - (tree.radius + AVATAR_COLLISION_RADIUS + 3), y: 0, z: tree.center.z };
            const result = treeConstraint.apply(approach, { x: tree.center.x, y: 0, z: tree.center.z });
            const distToThisTree = Math.hypot(result.position.x - tree.center.x, result.position.z - tree.center.z);
            assert(distToThisTree >= tree.radius + AVATAR_COLLISION_RADIUS - 1e-6,
                '30. FLAGSHIP: every real tree in a multi-tree region genuinely blocks a direct approach into it');
        }

        // 3. AvatarPresence's own wire shape, AvatarProfile, and document
        // storage are all completely untouched by tree-aware movement —
        // exactly the same non-leakage 0.2.77's own flagship already
        // proved for terrain.
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '31. FLAGSHIP: AvatarPresence\'s own JSON shape is exactly what 0.2.33/0.2.37 established — nothing tree-related ever joins it');
        assert(JSON.stringify(avatarProfileUseCase.getProfile().toJSON()) === profileJsonBefore,
            '32. FLAGSHIP: AvatarProfile is completely untouched by tree-aware movement — appearance and movement stay separate concerns');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '33. FLAGSHIP: no document is ever created for the avatar, its movement, or a tree collision');

        // I — Determinism, replayed end to end: a second, completely
        // independent session, seeded identically and driven with the
        // identical input script, arrives at the identical final position.
        const storage2 = new InMemoryStorageProvider();
        const bob = new LocalIdentityProvider(storage2);
        bob.login('bob-tree-replica');
        const avatarProfileUseCase2 = new AvatarProfileUseCase(storage2, bob, registry);
        avatarProfileUseCase2.updateProfile({ templateId: 'humanoid-01', displayName: 'Bob' });
        const avatarPresenceSession2 = new AvatarPresenceSession(avatarProfileUseCase2.getProfile(), { position: { x: realTree.center.x, y: 0, z: startZ } });
        const session2 = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: bob, avatarProfileUseCase: avatarProfileUseCase2, avatarPresenceSession: avatarPresenceSession2, avatarTemplateRegistry: registry
        });
        session2._session = spyFacade();
        session2._setupLocalAvatar();
        session2.setAvatarControlMode(true);
        session2.avatarKeyDown('w');
        for (let i = 0; i < 400; i++) {
            session2._avatarMovementController.tick(0.05);
        }
        session2.avatarKeyUp('w');
        assert(JSON.stringify(avatarPresenceSession.current.position) === JSON.stringify(avatarPresenceSession2.current.position),
            '34. FLAGSHIP: same seed + same starting position + same input script -> the identical resulting position on a completely independent replica');
    }

    // -------------------------------------------------------------
    // Section E — architectural regression: no new collision
    // mathematics, no new status vocabulary, no terrain coupling
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/AvatarTreeConstraint.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'circlesIntersect', 'avatarCollisionCircleAt', 'treeCollisionCircleFor',
            'treeCollisionGeometryInRegion', 'naturalFeaturesInRegion',
            'AvatarTerrainConstraint', 'AvatarMovementConstraint', 'AvatarStepConstraint',
            'terrainHeightAt', 'isWalkableSlope',
            'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'CollisionEvent', 'velocity', 'acceleration', 'mass'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `35. application/AvatarTreeConstraint.js's own code never references "${term}" — a thin adapter only, never a second collision algorithm, never terrain coupling, never a physics engine, never a new event vocabulary`);
        }
        assert(codeOnly.includes('treeCollisionCandidatesForMovement'),
            '36. application/AvatarTreeConstraint.js does consume treeCollisionCandidatesForMovement() from core/AvatarTreeCollisionQuery.js — the one deliberate 0.9.62 entry point, never a second one it invents itself');
        assert(codeOnly.includes('resolveAvatarTreeMovement'),
            '37. application/AvatarTreeConstraint.js does consume resolveAvatarTreeMovement() from core/AvatarTreeMovement.js — the one deliberate 0.9.61 entry point');
    }
    {
        const exportsModule = await import('../application/AvatarTreeConstraint.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarTreeConstraint']),
            '38. application/AvatarTreeConstraint.js exports exactly the AvatarTreeConstraint class — nothing else');
    }

    console.log('✅ All Avatar Movement Collision Integration tests passed.');
}

await runTests();
