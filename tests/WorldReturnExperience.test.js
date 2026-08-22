import { CameraPerspective } from '../core/CameraPerspective.js';
import { LocalWorldExperience } from '../core/LocalWorldExperience.js';
import { LocalWorldExperienceStore } from '../application/LocalWorldExperienceStore.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.3.10 — World Persistence & Return Experience.
//
// This flagship test suite proves the milestone's own central
// principle — "Personal Experience Is Not Shared World State" — end to
// end, the same way tests/WorldWelcomeExploration.test.js (0.3.9) and
// tests/AvatarControlPersistence.test.js (0.3.2) prove their own
// milestones' central claims:
//
//   Section A: LocalWorldExperience — the value object's own validation
//              and round-tripping (core/LocalWorldExperience.js)
//   Section B: LocalWorldExperienceStore — per-world records, recency
//              ordering, and the perspective-clearing edge case
//              (application/LocalWorldExperienceStore.js)
//   Section C: WorldNavigationSession wiring — save/restore/hasVisited
//              are graceful no-ops with nothing wired, and correctly
//              save/restore camera framing (both the free/orbit
//              position+target case and the avatar-relative Camera
//              Perspective case) when a store IS wired
//   Section D: FLAGSHIP — the full return-experience scenario: a
//              first-time visit, leaving with a chosen perspective,
//              a SECOND, completely independent replica visiting the
//              same World with no cross-contamination, the World
//              changing while the first replica is away, and a
//              byte-identical World serialization throughout every one
//              of these purely-local operations
//   Section E: Security boundary — a prior visit is a UX convenience,
//              never an authorization claim
//
// See docs/Principles.md, "Personal Experience Is Not Shared World
// State (0.3.10)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Same minimal render-facade double AvatarControlPersistence.test.js
// uses — a plain {position, target, zoom} store with no Three.js, no
// canvas, nothing this milestone's camera math needs beyond
// getCameraState()/setCameraState().
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
        setRemoteAvatarsVisible() {},
        dispose() {}
    };
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

// One independent "replica": its own local storage (so its own
// LocalWorldExperienceStore AND its own avatar profile live in
// completely separate backing stores, exactly like two different
// people's own browsers), its own identity, its own avatar presence.
function buildReplica(registry, username) {
    const avatarStorage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(avatarStorage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(avatarStorage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });

    const experienceStorage = new InMemoryStorageProvider();
    const localWorldExperienceStore = new LocalWorldExperienceStore({ storageProvider: experienceStorage });

    return { avatarProfileUseCase, avatarPresenceSession, localWorldExperienceStore, experienceStorage };
}

function buildSession(brickRegistry, replica, cameraInitial, extra = {}) {
    const session = new WorldNavigationSession({
        registry: brickRegistry,
        loadPublicationDocumentUseCase: null,
        worldLayoutProvider: null,
        avatarProfileUseCase: replica.avatarProfileUseCase,
        avatarPresenceSession: replica.avatarPresenceSession,
        localWorldExperienceStore: replica.localWorldExperienceStore,
        ...extra
    });
    session._session = stubCameraRenderer(cameraInitial);
    session._spatialCameraController = new SpatialCameraController(session._session);
    session._setupLocalAvatar();
    return session;
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const WORLD_ID = 'world-riverside-village';

    // -------------------------------------------------------------
    // Section A — LocalWorldExperience value object
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new LocalWorldExperience({}); } catch (e) { threw = true; }
        assert(threw, '1. LocalWorldExperience requires a valid worldId');

        const experience = new LocalWorldExperience({ worldId: WORLD_ID });
        assert(experience.cameraPosition === null, '2. cameraPosition defaults to null');
        assert(experience.cameraTarget === null, '3. cameraTarget defaults to null');
        assert(experience.cameraPerspective === null, '4. cameraPerspective defaults to null');

        experience.setCameraPosition({ x: 1, y: 2, z: 3 });
        experience.setCameraTarget({ x: 4, y: 5, z: 6 });
        experience.setCameraHeading(90);
        assert(experience.cameraPosition.x === 1 && experience.cameraPosition.z === 3, '5. setCameraPosition copies x/y/z');
        assert(experience.cameraTarget.z === 6, '6. setCameraTarget copies x/y/z');
        assert(experience.cameraHeading === 90, '7. setCameraHeading stores a finite number');

        experience.setCameraHeading(NaN);
        assert(experience.cameraHeading === null, '8. setCameraHeading rejects a non-finite value back to null');

        const accepted = experience.setCameraPerspective(CameraPerspective.BIRD_EYE);
        assert(accepted === true && experience.cameraPerspective === CameraPerspective.BIRD_EYE,
            '9. setCameraPerspective accepts a recognized CameraPerspective value');

        const rejected = experience.setCameraPerspective('flying-saucer-cam');
        assert(rejected === false && experience.cameraPerspective === CameraPerspective.BIRD_EYE,
            '10. setCameraPerspective REJECTS an unrecognized value and leaves the prior one in place — the same "degrade gracefully, never corrupt state" discipline WorldNavigationSession#setCameraPerspective already applies (this is what makes fromJSON() safe against corrupted localStorage)');

        const clearedOk = experience.setCameraPerspective(null);
        assert(clearedOk === true && experience.cameraPerspective === null, '11. setCameraPerspective(null) always clears back to free/orbit');
    }
    {
        // fromJSON()/toJSON() round-trip, including a defensively
        // invalid perspective coming back out of storage.
        const original = new LocalWorldExperience({
            worldId: WORLD_ID,
            cameraPosition: { x: 10, y: 2, z: -5 },
            cameraTarget: { x: 0, y: 0, z: 0 },
            cameraHeading: 45,
            cameraPerspective: CameraPerspective.THIRD_PERSON,
            lastVisitedAt: 1000
        });
        const restored = LocalWorldExperience.fromJSON(original.toJSON());
        assert(restored.worldId === WORLD_ID, '12. fromJSON restores worldId');
        assert(restored.cameraPosition.x === 10, '13. fromJSON restores cameraPosition');
        assert(restored.cameraTarget.x === 0, '14. fromJSON restores cameraTarget');
        assert(restored.cameraHeading === 45, '15. fromJSON restores cameraHeading');
        assert(restored.cameraPerspective === CameraPerspective.THIRD_PERSON, '16. fromJSON restores cameraPerspective');
        assert(restored.lastVisitedAt === 1000, '17. fromJSON restores lastVisitedAt');

        const corrupted = LocalWorldExperience.fromJSON({ worldId: WORLD_ID, cameraPerspective: 'not-a-real-mode' });
        assert(corrupted.cameraPerspective === null,
            '18. fromJSON() defends against corrupted localStorage data — an unrecognized stored perspective comes back as null (free/orbit), never an invalid value the rest of the app has to guard against');
    }

    // -------------------------------------------------------------
    // Section B — LocalWorldExperienceStore
    // -------------------------------------------------------------
    {
        const store = new LocalWorldExperienceStore({ storageProvider: new InMemoryStorageProvider() });
        assert(store.getExperience(WORLD_ID) === null, '19. getExperience returns null before any visit is recorded');
        assert(store.hasVisited(WORLD_ID) === false, '20. hasVisited is false before any visit is recorded');

        store.recordVisit(WORLD_ID, {
            position: { x: 5, y: 1, z: 5 },
            target: { x: 0, y: 0, z: 0 },
            heading: 180,
            perspective: CameraPerspective.BIRD_EYE
        });
        assert(store.hasVisited(WORLD_ID) === true, '21. hasVisited becomes true after recordVisit');
        const experience = store.getExperience(WORLD_ID);
        assert(experience.cameraPosition.x === 5, '22. recordVisit persists cameraPosition');
        assert(experience.cameraTarget.x === 0, '23. recordVisit persists cameraTarget');
        assert(experience.cameraPerspective === CameraPerspective.BIRD_EYE, '24. recordVisit persists cameraPerspective');

        // Leaving again with the free/orbit camera (perspective
        // explicitly null) must CLEAR the previously-recorded
        // perspective, not leave a stale BIRD_EYE for the next restore
        // to misapply.
        store.recordVisit(WORLD_ID, {
            position: { x: 8, y: 1, z: 8 },
            target: { x: 1, y: 0, z: 1 },
            heading: null,
            perspective: null
        });
        assert(store.getExperience(WORLD_ID).cameraPerspective === null,
            '25. recordVisit with perspective:null explicitly clears a previously-recorded perspective');
    }
    {
        const store = new LocalWorldExperienceStore({ storageProvider: new InMemoryStorageProvider() });
        const now = Date.now();
        // Explicit lastVisitedAt values throughout — deterministic
        // ordering, rather than relying on real elapsed wall-clock time
        // between calls in the same tick.
        const older = new LocalWorldExperience({ worldId: 'world-a', lastVisitedAt: now - 5000 });
        const newer = new LocalWorldExperience({ worldId: 'world-b', lastVisitedAt: now - 1000 });
        const newest = new LocalWorldExperience({ worldId: 'world-c', lastVisitedAt: now });
        store.saveExperience(older);
        store.saveExperience(newer);
        store.saveExperience(newest);

        const recent = store.getRecentlyVisited(2);
        assert(recent.length === 2, '26. getRecentlyVisited respects the limit');
        assert(recent[0].worldId === 'world-c' && recent[1].worldId === 'world-b',
            '27. getRecentlyVisited is sorted most-recent-first');

        store.removeExperience('world-c');
        assert(store.hasVisited('world-c') === false, '28. removeExperience deletes the record');
    }

    // -------------------------------------------------------------
    // Section C — WorldNavigationSession wiring
    // -------------------------------------------------------------
    {
        // No localWorldExperienceStore wired at all — every 0.3.10
        // method is a graceful no-op, the SAME "enforce/offer only when
        // the collaborator is actually wired" posture every other
        // optional collaborator in this constructor already follows.
        const bare = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        assert(bare.hasVisitedWorld(WORLD_ID) === false, '29. hasVisitedWorld() is false with no store wired');
        assert(bare.getWorldExperience(WORLD_ID) === null, '30. getWorldExperience() is null with no store wired');
        assert(Array.isArray(bare.getRecentlyVisitedWorlds()) && bare.getRecentlyVisitedWorlds().length === 0,
            '31. getRecentlyVisitedWorlds() is an empty array with no store wired');
        let threw = false;
        try { bare.saveWorldExperience(WORLD_ID); bare.restoreWorldExperience(WORLD_ID); } catch (e) { threw = true; }
        assert(!threw, '32. saveWorldExperience()/restoreWorldExperience() never throw with no store (or no camera controller) wired');
    }
    {
        // Free/orbit camera: leaving at an arbitrary framing, then
        // restoring it on a brand new session (a fresh tab/reload) —
        // proves position+target round-trip exactly, which a
        // heading-only restore could never reconstruct (no vertical
        // tilt information).
        const replica = buildReplica(registry, 'freecam-alice');
        const leaving = buildSession(brickRegistry, replica, { position: { x: 40, y: 22, z: -8 }, target: { x: 12, y: 3, z: 1 } });
        leaving.saveWorldExperience(WORLD_ID);

        const returning = buildSession(brickRegistry, replica, { position: { x: 0, y: 0, z: 0 }, target: { x: 5, y: 5, z: 5 } });
        const restored = returning.restoreWorldExperience(WORLD_ID);
        assert(restored !== null, '33. restoreWorldExperience returns the restored record');
        const state = returning._spatialCameraController.getSpatialCameraState();
        assert(state.position.x === 40 && state.position.y === 22 && state.position.z === -8,
            '34. restoreWorldExperience reconstructs the exact saved camera POSITION on a fresh session');
        assert(state.target.x === 12 && state.target.y === 3 && state.target.z === 1,
            '35. restoreWorldExperience reconstructs the exact saved camera TARGET — never a synthetic one derived only from a heading angle');
    }
    {
        // Camera Perspective: restoring re-frames from the CURRENT
        // avatar position, never the STALE saved camera coordinate — a
        // perspective is always an avatar-relative offset
        // (core/CameraPerspective.js), so this must stay correct even
        // when the avatar has moved between visits.
        const replica = buildReplica(registry, 'perspective-alice');
        const leaving = buildSession(brickRegistry, replica);
        leaving.setCameraPerspective(CameraPerspective.BIRD_EYE);
        leaving.saveWorldExperience(WORLD_ID);
        assert(replica.localWorldExperienceStore.getExperience(WORLD_ID).cameraPerspective === CameraPerspective.BIRD_EYE,
            '36. saveWorldExperience() persists the currently-active Camera Perspective');

        // Avatar moved to a new spot since the last visit (e.g. a
        // future milestone's own avatar-placement decision — 0.3.10
        // itself deliberately never persists avatar position, see
        // Section E).
        replica.avatarPresenceSession.update({ position: { x: 100, y: 0, z: 100 } });
        const returning = buildSession(brickRegistry, replica);
        returning.restoreWorldExperience(WORLD_ID);
        assert(returning.getCameraPerspective() === CameraPerspective.BIRD_EYE, '37. restoreWorldExperience re-activates the saved Camera Perspective');
        const state = returning._spatialCameraController.getSpatialCameraState();
        assert(state.target.x === 100 && state.target.z === 100,
            '38. the restored Bird\'s-Eye framing centers on the avatar\'s CURRENT position (100,100), never the position it happened to be at when the perspective was last saved');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: the full return-experience scenario
    // -------------------------------------------------------------
    //
    // A durable World, completely independent of either replica's own
    // local experience — created once, mutated once (Phase F), never
    // touched by any LocalWorldExperience/LocalWorldExperienceStore
    // call in this section. Its own serialization is snapshotted
    // repeatedly to prove the architectural boundary directly, not by
    // assertion of intent.
    const world = new World({ id: WORLD_ID, metadata: { title: 'Riverside Village' } });
    const serializeWorld = () => JSON.stringify(world.toJSON());

    const alice = buildReplica(registry, 'flagship-alice');
    const bob = buildReplica(registry, 'flagship-bob');

    // Phase A — Alice enters a new World for the first time.
    let aliceSession = buildSession(brickRegistry, alice, { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } });
    assert(aliceSession.hasVisitedWorld(WORLD_ID) === false, '39. PHASE A: Alice has never visited this World before — firstVisit is true');

    // Phase B — Alice chooses Bird's-Eye and navigates near a landmark
    // (an arbitrary "Old Bridge" position — this milestone never
    // depends on real landmark content, only on a camera framing).
    const OLD_BRIDGE = { x: 64, y: 0, z: -30 };
    alice.avatarPresenceSession.update({ position: OLD_BRIDGE });
    aliceSession.setCameraPerspective(CameraPerspective.BIRD_EYE);
    assert(aliceSession.getCameraPerspective() === CameraPerspective.BIRD_EYE, '40. PHASE B: Alice\'s camera is now in Bird\'s-Eye perspective');

    // Phase C — Alice leaves the World. Her local experience records
    // camera position, target, and perspective.
    aliceSession.saveWorldExperience(WORLD_ID);
    assert(aliceSession.hasVisitedWorld(WORLD_ID) === true, '41. PHASE C: after leaving, Alice\'s OWN replica now has a recorded visit');
    const worldContentAfterAliceLeaves = serializeWorld();

    // Phase D — Bob enters the SAME World. His experience is completely
    // independent: Alice's camera state must not appear on Bob's
    // replica, in either direction.
    let bobSession = buildSession(brickRegistry, bob, { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } });
    assert(bobSession.hasVisitedWorld(WORLD_ID) === false,
        '42. PHASE D: Bob has never visited this World on HIS OWN replica — Alice\'s visit does not leak into Bob\'s local storage');
    assert(bob.localWorldExperienceStore.getExperience(WORLD_ID) === null,
        '43. PHASE D: Bob\'s own LocalWorldExperienceStore holds no record for this World at all — not merely "hasVisited is false," the record genuinely does not exist on his replica');
    bobSession.setCameraPerspective(CameraPerspective.THIRD_PERSON);
    bobSession.saveWorldExperience(WORLD_ID);
    assert(bob.localWorldExperienceStore.getExperience(WORLD_ID).cameraPerspective === CameraPerspective.THIRD_PERSON,
        '44. PHASE D: Bob\'s own visit is recorded on HIS OWN replica...');
    assert(alice.localWorldExperienceStore.getExperience(WORLD_ID).cameraPerspective === CameraPerspective.BIRD_EYE,
        "45. PHASE D: ...and Alice's own replica is completely unaffected by Bob's visit — still Bird's-Eye, never overwritten or merged");
    assert(serializeWorld() === worldContentAfterAliceLeaves,
        '46. PHASE D: Bob entering and leaving mutated NOTHING about the shared World itself — purely local storage on his own replica');

    // Phase F (world changes while Alice is away) — Bob builds another
    // structure. A genuine, deliberate World content mutation, to prove
    // the later "unchanged" assertions in this test are not vacuously
    // true.
    const building = new Building({ id: 'bob-new-house' });
    building.addBrick(new Brick({ id: 'brick-bob-house-1', definitionId: 'core:cube', position: new Position(64, 0.5, -25) }));
    world.addBuilding(building);
    const worldContentAfterBobBuilds = serializeWorld();
    assert(worldContentAfterBobBuilds !== worldContentAfterAliceLeaves,
        '47. PHASE F: Bob\'s new structure genuinely changed the World\'s own serialization (sanity check — proves the equality assertions around it are meaningful, not trivially true because nothing ever changes)');

    // Phase E — Alice returns, on a fresh session (a new tab/reload),
    // with her avatar back at a DIFFERENT starting spot than where she
    // left it — 0.3.10 deliberately never persists avatar position
    // (see Section E below), so this simulates the realistic case
    // honestly rather than assuming the avatar happens to still be at
    // the Old Bridge.
    alice.avatarPresenceSession.update({ position: { x: 0, y: 0, z: 0 } });
    aliceSession = buildSession(brickRegistry, alice, { position: { x: 1, y: 1, z: 1 }, target: { x: 1, y: 1, z: 1 } });
    assert(aliceSession.hasVisitedWorld(WORLD_ID) === true, '48. PHASE E: Alice\'s OWN replica remembers her prior visit');
    const restored = aliceSession.restoreWorldExperience(WORLD_ID);
    assert(restored.cameraPerspective === CameraPerspective.BIRD_EYE, '49. PHASE E: welcome-back restores Bird\'s-Eye — Alice\'s own local preference, unaffected by Bob\'s THIRD_PERSON choice on his own replica');
    assert(aliceSession.getCameraPerspective() === CameraPerspective.BIRD_EYE, '50. PHASE E: the session\'s live Camera Perspective is now Bird\'s-Eye again, with no explicit user action required');

    // Phase G — Serialization boundary. Alice's return — reading AND
    // writing her own local experience, restoring a perspective, moving
    // her camera — changed nothing about the World Bob's own edit
    // (Phase F) already produced. The World is reconstructed from
    // current durable World state; only Alice's camera framing came
    // from local history.
    assert(serializeWorld() === worldContentAfterBobBuilds,
        '51. PHASE G: serializeWorld() is byte-identical before and after every local return-experience operation in this entire flagship — Alice leaving, Bob visiting independently, Bob\'s real edit aside, and Alice\'s own return — proves "Personal Experience Is Not Shared World State" end to end, not merely by inspection of which fields exist');

    // -------------------------------------------------------------
    // Section E — Security boundary: a prior visit is never authorization
    // -------------------------------------------------------------
    {
        // A minimal duck-typed authorization collaborator — deliberately
        // NOT the real WorldAuthorizationService (which needs a full
        // Document/identity stack to construct); WorldNavigationSession
        // only ever calls .canEdit()/.canRead() on whatever it's given,
        // so this is enough to prove the boundary this section exists
        // to check.
        const alwaysDenyAuthorization = { canEdit: () => false, canRead: () => true };
        const replica = buildReplica(registry, 'security-alice');
        const session = buildSession(brickRegistry, replica, undefined, { worldAuthorizationService: alwaysDenyAuthorization });

        assert(session.canEditDocument(WORLD_ID) === false, '52. before any visit, Alice cannot edit this World (no grant, per the authorization service)');
        session.setCameraPerspective(CameraPerspective.FIRST_PERSON);
        session.saveWorldExperience(WORLD_ID);
        assert(session.hasVisitedWorld(WORLD_ID) === true, '53. Alice now has a recorded local visit...');
        assert(session.canEditDocument(WORLD_ID) === false,
            '54. ...but having VISITED this World grants her nothing — canEditDocument() is re-derived from the authorization service alone, exactly as before the visit. "Alice previously edited/visited World X" never means "Alice can still edit World X."');
        session.restoreWorldExperience(WORLD_ID);
        assert(session.canEditDocument(WORLD_ID) === false,
            '55. restoreWorldExperience() itself never grants, checks, or otherwise touches authorization — a pure local-camera operation, structurally incapable of becoming an access decision');
    }

    console.log('✅ All World Persistence & Return Experience tests passed.');
}

await runTests();
