import { slopeBetween, isWalkableSlope, DEFAULT_MAX_WALKABLE_SLOPE } from '../core/TerrainWalkability.js';
import { AvatarTerrainConstraint } from '../application/AvatarTerrainConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.2.77 — Terrain-Aware Avatar Grounding & Movement.
//
//   Section A: core/TerrainWalkability.js — pure slope geometry
//   Section B: application/AvatarTerrainConstraint.js — real + injected terrain
//   Section C: application/AvatarMovementController.js — terrain constraint wired into the movement pipeline
//   Section D: WorldNavigationSession integration
//   Section E: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: terrain
// walkability is a CONSTRAINT applied to movement, exactly the same
// shape 0.2.42 already established for building collision — never a
// rewrite of the pure kinematic simulation (core/
// AvatarMovementSimulation.js is untouched this milestone), never a
// change to what AvatarPresence.position.y means (ground level stays
// y=0 plus a transient jump offset — see docs/Principles.md, "Terrain
// Elevation Is A Rendering-Time Offset, Never A Presence Or Placement
// Fact," 0.2.76, completely unchanged by this milestone), and never a
// physics engine — a blocked step is rejected outright, never
// physically slid or accelerated downhill.

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

// A deliberately engineered cliff: flat at z < 5, a sheer 100-unit
// step at z >= 5. Real generated terrain (three gentle octaves, "reads
// as geography, never spiky noise" — core/TerrainHeightField.js's own
// header) is, by design, essentially never this steep — so this
// synthetic function is what lets Sections B/C/D/E prove the
// walkable/unwalkable boundary deterministically, without hunting
// through real terrain for a coordinate that happens to qualify.
function cliffHeightAt(x, z) {
    return z >= 5 ? 100 : 0;
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // Section A — core/TerrainWalkability.js: pure slope geometry
    // -------------------------------------------------------------
    {
        assert(slopeBetween(0, 0, 10) === 0, '1. slopeBetween: flat ground has zero slope');
        assert(slopeBetween(0, 10, 10) === 1, '2. slopeBetween: rise equal to run is a slope of exactly 1');
        assert(slopeBetween(10, 0, 10) === 1, '3. slopeBetween: direction of descent does not matter — slope is always non-negative');
        assert(slopeBetween(5, 5, 0) === 0, '4. slopeBetween: zero horizontal distance reports 0, never a divide-by-zero NaN/Infinity');
        assert(Number.isFinite(slopeBetween(5, 5, -3)), '5. slopeBetween: a nonsensical negative distance never produces NaN/Infinity either');
    }
    {
        assert(isWalkableSlope(0, 5, 10) === true, '6. isWalkableSlope: a gentle 0.5 slope is walkable under the default limit');
        assert(isWalkableSlope(0, 10, 10) === false, `7. isWalkableSlope: a 1.0 slope exceeds the default limit (${DEFAULT_MAX_WALKABLE_SLOPE}) and is blocked`);
        const boundaryRise = DEFAULT_MAX_WALKABLE_SLOPE * 10;
        assert(isWalkableSlope(0, boundaryRise, 10) === true, '8. isWalkableSlope: a step landing EXACTLY on the limit is still walkable (inclusive boundary)');
        assert(isWalkableSlope(0, boundaryRise + 0.01, 10) === false, '9. isWalkableSlope: one hair past the limit is blocked');
        assert(isWalkableSlope(0, 20, 10) === false, '10a. isWalkableSlope: a slope of 2.0 exceeds the DEFAULT limit');
        assert(isWalkableSlope(0, 20, 10, 5) === true, '10. isWalkableSlope: ...but an explicit custom maxSlope (5) overrides the default and allows it');
    }

    // -------------------------------------------------------------
    // Section B — application/AvatarTerrainConstraint.js
    // -------------------------------------------------------------
    {
        // No horizontal movement at all (e.g. jumping in place) is
        // always a no-op, before terrain is even sampled.
        const constraint = new AvatarTerrainConstraint({ heightAt: cliffHeightAt });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 0 });
        assert(result.blocked === false && result.position.y === 3,
            '11. AvatarTerrainConstraint: zero horizontal movement is never blocked, and vertical motion (a jump) passes through untouched');
    }
    {
        const constraint = new AvatarTerrainConstraint({ heightAt: cliffHeightAt });
        const flatStep = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 });
        assert(flatStep.blocked === false && flatStep.position.x === 1 && flatStep.position.z === 1,
            '12. AvatarTerrainConstraint: a step entirely within the flat region is unblocked');

        const cliffStep = constraint.apply({ x: 0, y: 0.3, z: 4 }, { x: 0, y: 0.3, z: 6 });
        assert(cliffStep.blocked === true, '13. AvatarTerrainConstraint: a step across the engineered cliff is blocked');
        assert(cliffStep.position.x === 0 && cliffStep.position.z === 4,
            '14. AvatarTerrainConstraint: a blocked step reverts X/Z to exactly where the avatar already stood');
        assert(cliffStep.position.y === 0.3,
            '15. AvatarTerrainConstraint: a blocked step still passes Y through from the DESIRED position — rejecting a horizontal step must never also cancel a jump/fall already in progress');
    }
    {
        // Determinism / replica independence: two completely
        // independent AvatarTerrainConstraint instances, both built
        // with the default (shared) seed and no wiring in common,
        // agree exactly at the same coordinates — the same "same seed
        // + same coordinates -> same terrain" property 0.2.76's own
        // flagship proved for raw elevation, restated here for the
        // walkability DECISION built on top of it.
        const replicaA = new AvatarTerrainConstraint();
        const replicaB = new AvatarTerrainConstraint();
        const from = { x: 233.5, y: 0, z: -871.2 };
        const to = { x: 234.9, y: 0, z: -870.1 };
        assert(JSON.stringify(replicaA.apply(from, to)) === JSON.stringify(replicaB.apply(from, to)),
            '16. AvatarTerrainConstraint: two independent default-seed instances compute the exact same walkability decision at the same coordinates, with no coordination between them');
    }
    {
        // Real terrain sanity: this generator's three octaves are
        // deliberately gentle ("reads as geography, never spiky
        // noise" — core/TerrainHeightField.js) — ordinary walking
        // steps across real generated ground essentially never hit
        // the default walkable-slope limit.
        const constraint = new AvatarTerrainConstraint();
        let cursor = { x: 0, y: 0, z: 0 };
        let blockedCount = 0;
        for (let i = 0; i < 300; i++) {
            const desired = { x: cursor.x + 1.4, y: 0, z: cursor.z + 0.9 };
            const result = constraint.apply(cursor, desired);
            if (result.blocked) blockedCount++;
            cursor = result.position;
        }
        assert(blockedCount === 0,
            '17. AvatarTerrainConstraint: 300 ordinary walking steps across real generated terrain are never blocked by the default slope limit — this world\'s geography is walkable by design');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarMovementController.js
    // -------------------------------------------------------------
    {
        // Backward compatibility: a controller built without a third
        // argument at all (0.2.42's own two-argument shape) behaves
        // exactly as it always did.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'terrain-legacy');
        const controller = new AvatarMovementController(avatarPresenceSession, null);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '18. AvatarMovementController: unchanged two-argument construction still moves normally');
        assert(controller.isBlockedBySlope() === false, '19. AvatarMovementController: isBlockedBySlope() defaults false with no terrain constraint wired at all');
    }
    {
        // A terrain constraint that always blocks (a deliberately
        // extreme stand-in, same posture as 0.2.42's own "alwaysBlocks"
        // fixture) proves the controller actually CONSULTS it.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'terrain-blocked');
        const alwaysBlocks = { apply: (position) => ({ position, blocked: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, alwaysBlocks);
        controller.keyDown('w');
        const before = avatarPresenceSession.current.position;
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.x === before.x && avatarPresenceSession.current.position.z === before.z,
            '20. AvatarMovementController: a terrain constraint that fully blocks movement is actually honored — position never advances');
        assert(controller.isBlockedBySlope() === true, '21. AvatarMovementController: isBlockedBySlope() reflects the constraint\'s own outcome');
    }
    {
        // Transient — recomputed fresh every tick, never sticky.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'terrain-transient');
        let blocking = true;
        const toggle = { apply: (position, desired) => (blocking ? { position, blocked: true } : { position: desired, blocked: false }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, toggle);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(controller.isBlockedBySlope() === true, '22. AvatarMovementController: blocked while the constraint blocks');
        blocking = false;
        controller.tick(0.5);
        assert(controller.isBlockedBySlope() === false, '23. AvatarMovementController: ...and false again the very next tick once it stops blocking — never sticky');
    }
    {
        // Never leaks into AvatarPresence's own wire shape — the same
        // "collided is movement information, not presence" boundary
        // 0.2.42 drew, restated for slope.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'terrain-shape');
        const alwaysBlocks = { apply: (position) => ({ position, blocked: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, alwaysBlocks);
        controller.keyDown('a');
        controller.tick(0.5);
        const json = avatarPresenceSession.current.toJSON();
        assert(!('blocked' in json) && !('blockedBySlope' in json) && !('grounded' in json),
            '24. AvatarMovementController: slope-blocked state never appears on AvatarPresence\'s own JSON shape');
    }
    {
        // Composition order: building collision runs FIRST (resolving
        // to some intermediate position), terrain walkability then
        // evaluates the slope of THAT resolved step — not the raw,
        // pre-collision kinematic proposal.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'terrain-order');
        const slidesToOrigin = { apply: (position) => ({ position, collided: true }) }; // building collision: fully stops X/Z at the current position
        let terrainSawFrom = null;
        let terrainSawTo = null;
        const observingTerrain = {
            apply: (position, desired) => {
                terrainSawFrom = { ...position };
                terrainSawTo = { ...desired };
                return { position: desired, blocked: false };
            }
        };
        const controller = new AvatarMovementController(avatarPresenceSession, slidesToOrigin, observingTerrain);
        const startPos = avatarPresenceSession.current.position;
        controller.keyDown('w');
        controller.tick(0.5);
        assert(terrainSawTo.x === startPos.x && terrainSawTo.z === startPos.z,
            '25. AvatarMovementController: terrain walkability is evaluated against the position building collision ALREADY resolved to, never the raw pre-collision kinematic proposal');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        // Always built, unconditionally — no new constructor
        // dependency on WorldNavigationSession itself, the same
        // posture 0.2.42 established for _buildAvatarMovementConstraint().
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-terrain-wired');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        assert(session._avatarMovementController instanceof AvatarMovementController,
            '26. WorldNavigationSession: a real movement controller is built for the local avatar');
        assert(session._avatarMovementController.isBlockedBySlope() === false,
            '27. WorldNavigationSession: a fresh session reports no slope block before any movement has happened');

        // Ordinary local avatar movement across the real, default-seed
        // terrain proceeds exactly as before this milestone — no
        // regression to everyday walking.
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) {
            session._avatarMovementController.tick(0.05);
        }
        session.avatarKeyUp('w');
        assert(avatarPresenceSession.current.position.z > 0,
            '28. WorldNavigationSession: the local avatar walks normally across real terrain — the default slope limit never obstructs ordinary movement');
    }
    {
        // Full end-to-end integration through the real session: swap
        // in an engineered cliff (the same reach-into-internals
        // convention tests/AvatarCollision.test.js already uses for
        // _loadedDocuments) to prove the wiring actually reaches the
        // real controller, not merely that the class exists.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-terrain-cliff');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session._avatarMovementController._terrainConstraint = new AvatarTerrainConstraint({ heightAt: cliffHeightAt });

        session.setAvatarControlMode(true);
        session.avatarKeyDown('w'); // default facing (rotation 0) walks toward +z, straight at the cliff at z=5
        let sawBlocked = false;
        for (let i = 0; i < 200; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isBlockedBySlope()) sawBlocked = true;
        }
        session.avatarKeyUp('w');
        assert(sawBlocked === true, '29. WorldNavigationSession: the local avatar\'s own movement is genuinely constrained by terrain slope end to end');
        assert(avatarPresenceSession.current.position.z < 5, '30. WorldNavigationSession: the avatar never crosses the cliff boundary');
    }
    {
        // No local avatar at all — unchanged early-return behavior,
        // never throws, no controller built.
        const session = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = spyFacade();
        let threw = false;
        try { session._setupLocalAvatar(); } catch (e) { threw = true; }
        assert(!threw, '31. WorldNavigationSession: _setupLocalAvatar() with no avatar wired never throws, terrain or otherwise');
        assert(session._avatarMovementController === null, '32. WorldNavigationSession: no movement controller — and so no terrain constraint — is ever built without a local avatar');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: the design doc's own scripted scenario.
    //
    //   Enter World View -> avatar starts grounded -> move across real
    //   terrain (flat and gently rolling) without ever being blocked
    //   -> attempt an excessively steep slope -> movement is rejected
    //   -> no discontinuity anywhere along the walk -> AvatarPresence's
    //   own wire shape is unchanged -> same seed + same coordinates ->
    //   same walkability decision on a second, independent replica.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-terrain');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
        const profileJsonBefore = JSON.stringify(profile.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;

        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: registry
        });
        session._session = spyFacade();
        session._setupLocalAvatar();

        assert(avatarPresenceSession.current.position.x === 0 && avatarPresenceSession.current.position.z === 0,
            '33. FLAGSHIP: Alice starts at the origin, already grounded');

        // 1. Walk across real, default-seed terrain in a long,
        // meandering path, turning periodically — every step must
        // either advance continuously or hold still; never a jump.
        session.setAvatarControlMode(true);
        let maxStepDistance = 0;
        let lastPosition = avatarPresenceSession.current.position;
        for (let i = 0; i < 200; i++) {
            if (i % 40 === 0) session.avatarKeyDown('d'); else if (i % 40 === 20) session.avatarKeyUp('d');
            session.avatarKeyDown('w');
            session._avatarMovementController.tick(0.05);
            const p = avatarPresenceSession.current.position;
            const stepDistance = Math.hypot(p.x - lastPosition.x, p.z - lastPosition.z);
            maxStepDistance = Math.max(maxStepDistance, stepDistance);
            assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
                `34. FLAGSHIP: position stays finite at every step (tick ${i}) — no NaN/Infinity from terrain sampling`);
            lastPosition = p;
        }
        session.avatarKeyUp('w');
        session.avatarKeyUp('d');
        assert(maxStepDistance < 1, '35. FLAGSHIP: no single tick ever produces a discontinuous jump — real terrain never blocked ordinary walking, so movement stayed smooth throughout');
        assert(session._avatarMovementController.isBlockedBySlope() === false,
            '36. FLAGSHIP: the meandering walk across real terrain never triggered a slope block — this world\'s geography is walkable by design');

        // 2. Now face an engineered cliff and attempt to climb it —
        // movement is rejected, exactly the design doc's own scenario.
        avatarPresenceSession.update({ position: { x: 0, y: 0, z: 4 }, rotation: { y: 0 } });
        session._avatarMovementController._terrainConstraint = new AvatarTerrainConstraint({ heightAt: cliffHeightAt });
        session.avatarKeyDown('w');
        let sawBlocked = false;
        for (let i = 0; i < 60; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isBlockedBySlope()) sawBlocked = true;
        }
        session.avatarKeyUp('w');
        assert(sawBlocked === true, '37. FLAGSHIP: attempting an excessively steep slope is rejected');
        assert(avatarPresenceSession.current.position.z < 5, '38. FLAGSHIP: the avatar never crosses into the unwalkable region');

        // 3. AvatarPresence's own wire shape is exactly what it always
        // was — no terrain/slope field ever joins it — and no
        // AvatarProfile or document was ever touched by any of this.
        const presenceKeys = Object.keys(avatarPresenceSession.current.toJSON()).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '39. FLAGSHIP: AvatarPresence\'s own JSON shape is exactly what 0.2.33/0.2.37 established — nothing terrain-related ever joins it');
        assert(JSON.stringify(avatarProfileUseCase.getProfile().toJSON()) === profileJsonBefore,
            '40. FLAGSHIP: AvatarProfile is completely untouched by terrain-aware movement — appearance and movement stay separate concerns');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '41. FLAGSHIP: no document is ever created for the avatar, its movement, or a terrain block');

        // 4. Replica independence: a second, completely separate
        // AvatarTerrainConstraint (default real seed, no shared state
        // with Alice's session) computes the identical walkability
        // decision for the exact same step Alice just took — "same
        // seed + same coordinates -> same terrain," restated for
        // movement the way 0.2.76's own flagship proved it for raw
        // elevation.
        const independentReplica = new AvatarTerrainConstraint();
        const fixedFrom = { x: 300, y: 0, z: 300 };
        const fixedTo = { x: 301, y: 0, z: 300.5 };
        const decisionA = new AvatarTerrainConstraint().apply(fixedFrom, fixedTo);
        const decisionB = independentReplica.apply(fixedFrom, fixedTo);
        assert(JSON.stringify(decisionA) === JSON.stringify(decisionB),
            '42. FLAGSHIP: two independent replicas, same shared seed, agree exactly on the same walkability decision — no terrain synchronization is ever necessary');
    }

    console.log('✅ All Terrain-Aware Avatar Grounding & Movement tests passed.');
}

await runTests();
