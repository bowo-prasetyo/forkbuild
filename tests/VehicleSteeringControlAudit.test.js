import { readFile } from 'node:fs/promises';
import { VehicleSteeringIntent } from '../core/VehicleSteeringIntent.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.129 — Vehicle Steering Control & State Audit.
//
// 0.9.128 built the first genuinely stateful piece of the steering
// pipeline: a physical key's own down/up transition, threaded through a
// caller-owned held bit (core/VehicleSteeringInputAdapter.js), into a
// per-tick VehicleSteeringIntent that decays to NONE the instant it is
// consumed (application/WorldNavigationSession.js's own frame loop). Every
// prior steering milestone (0.9.125/0.9.126/0.9.127) was either stateless
// or driven entirely by direct, programmatic calls — this is the first one
// with real TEMPORAL state: held-vs-repeated keys, a hold bit that outlives
// a single call, a per-tick decay, and a mode boundary that resets some of
// that state but not all of it. This is a TEST-ONLY audit of that new
// state — no production file changes.
//
//   physical key -> held-bit -> steering pulse -> steering simulation
//       -> movement -> realized heading
//
// TWO INVARIANTS, AUDITED INDEPENDENTLY:
//
//   1. Each deliberate ArrowLeft/ArrowRight press produces AT MOST ONE
//      steering pulse; the pulse is consumed once, then steering intent
//      returns to an explicit NONE.
//   2. Vehicle heading remains exclusively derived from REALIZED movement
//      — never from the raw steering request, and never invented.
//
//   Section A: one press -> one turn, including real browser-style
//              key-repeat (repeated keydown, no keyup between)
//   Section B: release and re-press — a held key is ignored, a released-
//              then-re-pressed key produces a genuine second pulse
//   Section C: LEFT/RIGHT transitions, plus the ACTUAL (not newly
//              invented) simultaneous-key behavior this codebase already
//              has: independent per-control held bits, last edge wins
//   Section D: intent consumption — a real pulse decays to an explicit
//              NONE after being applied, and NONE never reissues a
//              further, uncommanded turn
//   Section E: mode transitions and stale input — hold bits reset on
//              Avatar Control Mode off/on, matching 0.9.128's own
//              documented reasoning, and a genuine pre-transition pulse
//              still fires exactly once, never zero, never twice
//   Section F: steering vs. heading authority — realized, collision-
//              clipped displacement (never the raw 45-degree transform)
//              is what heading tracks, end to end through real key input
//   Section G: existing controls stay isolated — avatar A/D rotation
//              (the reason arrow keys were chosen in the first place),
//              forward/backward, braking, mount/dismount, and avatar
//              following
//   Section H: structural audit — no steering angle, rate, angular
//              velocity, turning radius, physics, wheel rotation,
//              rendering, persistence, or networking anywhere this
//              milestone's own input path touches; the adapter remains
//              blind to the controller and to heading
//
// See docs/Roadmap.md, 0.9.129.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertClose(actual, expected, message, epsilon = 1e-6) {
    assert(Math.abs(actual - expected) < epsilon, `${message} (expected ${expected}, got ${actual})`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(registry, username, startPosition) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, { position: startPosition, rotation: { y: 0 } });
    return { avatarProfileUseCase, avatarPresenceSession };
}

function spyFacade() {
    const calls = { onAnimationFrameCallbacks: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
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
        syncVehicles() {},
        dispose() {}
    };
}

function buildSession(registry, avatarProfileUseCase, avatarPresenceSession) {
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = spyFacade();
    session._setupLocalAvatar();
    // Needed only by Section G2's own use of the real, deterministic
    // fixture vehicle — this is what actually registers a nearby real
    // vehicle into `_vehicleRuntimeInstances` in the first place. Every
    // other section injects its own synthetic vehicle directly and never
    // needs this; harmless (a no-op sync against the spy facade) either
    // way.
    session._setupVehicleRendering();
    return session;
}

function fireFrame(session, deltaSeconds) {
    for (const callback of session._session.calls.onAnimationFrameCallbacks) {
        callback(deltaSeconds);
    }
}

function groundedBrickCenter(x, z) {
    return { x, y: terrainHeightAt(DEFAULT_WORLD_SEED, x, z) + 0.5, z };
}

// The direct structural twin of tests/VehicleSteeringInputIntegration.test.js's
// own helper of the same name.
function installSyntheticBrickObstacle(session, docId, worldCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, worldCenter.y, 0) }));
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x: worldCenter.x, y: 0, z: worldCenter.z });
}

// A wall of adjacent, terrain-grounded bricks along Z at a fixed X — the
// direct structural twin of tests/VehicleSteeringIntegrationAudit.test.js's
// own `buildWallConstraint()`, installed as a real, session-loaded document
// instead of a standalone constraint, so a real key-driven ride picks it up
// through the session's own live `AvatarMovementConstraint` automatically.
// Small, near-zero LOCAL brick coordinates, with the document's own world
// offset carrying the real (large) world position — the same split
// `installSyntheticBrickObstacle()` above already uses (never a document
// whose own bricks sit at raw, large world-scale local coordinates).
function installSyntheticWallObstacle(session, docId, x, zFrom, zTo) {
    const world = new World();
    const building = new Building();
    for (let z = zFrom; z <= zTo; z++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, groundedBrickCenter(x, z).y, z - zFrom) }));
    }
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x, y: 0, z: zFrom });
}

async function sourceOf(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function injectMountedVehicle(session, vehicleId, spawnPosition, heading = 0) {
    session._vehicleRuntimeInstances._instances.set(vehicleId, new VehicleInstance({
        id: vehicleId, type: VehicleType.BICYCLE, spawnPosition, position: spawnPosition, heading
    }));
    session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(vehicleId);
}

const BICYCLE_CAPABILITY = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
const BICYCLE_RADIUS = BICYCLE_CAPABILITY.collisionRadius;
const { BRAKE, NONE: BRAKE_NONE } = AvatarVehicleBrakingIntent;

let vehicleCounter = 0;
function freshVehicleId(label) {
    vehicleCounter += 1;
    return `vehicle:audit129-${label}-${vehicleCounter}`;
}

// Every scenario below gets its own private patch of the deterministic
// world, far from every other scenario in this file — the same "own
// coordinates, never shared" discipline
// tests/VehicleSteeringInputIntegration.test.js already follows. Unlike
// that suite's own arbitrarily-chosen coordinates, this file's own
// multi-turn assertions are precise enough (bit-for-bit heading equality
// after TWO chained steering pulses) to be sensitive to a stray natural
// tree brushing the ride — this codebase's real, deterministic
// `AvatarTreeConstraint` is part of the SAME real session every scenario
// below drives, exactly like a real player would experience. Each name
// below was verified, empirically, to be genuinely clear of any such
// natural obstacle for the specific straight-ride-then-turn path each
// scenario uses.
const SPAWN_COORDINATE = {
    a1: 60000, a2: 60500, a3: 61000,
    b1: 61500, b2: 62000,
    c1: 62500, c2: 63000,
    d1: 63500,
    e1: 64000, e2: 64500, e3: 65000,
    f1: 65500, f2: 66000,
    g1: 66500
};

function freshSpawn(label) {
    const v = SPAWN_COORDINATE[label];
    assert(Number.isFinite(v), `sanity: ${label} has a reserved, pre-verified spawn coordinate`);
    return { x: v, y: 0, z: v };
}

// Mounts a fresh bicycle, holds 'w' long enough for a stable, un-steered
// heading of 0 to be established, and hands back the ready-to-drive
// session plus the vehicle id — the shared setup nearly every section
// below starts from.
function ridingSession(label) {
    const registry = buildRegistry();
    const vehicleId = freshVehicleId(label);
    const spawnPosition = freshSpawn(label);
    const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, `audit129-${label}`, new Position(spawnPosition.x, 0, spawnPosition.z));
    const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
    session.setAvatarControlMode(true);
    injectMountedVehicle(session, vehicleId, spawnPosition);
    session.avatarKeyDown('w');
    for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
    assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 0, `setup(${label}): a stable, un-steered heading of 0 before any steering input`);
    return { session, vehicleId, avatarPresenceSession };
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — one press -> one turn.
    // -------------------------------------------------------------
    {
        // A1 — the flagship shape: ArrowLeft down -> LEFT -> one movement
        // tick -> heading changes exactly once.
        const { session, vehicleId } = ridingSession('a1');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '1. a single ArrowLeft press, consumed by exactly one movement tick, turns the vehicle exactly once');
        session.avatarKeyUp('w');
    }
    {
        // A2 — real browser-style key-repeat: four repeated keydown
        // events, no keyup between them, must not produce four turns.
        const { session, vehicleId } = ridingSession('a2');
        for (let i = 0; i < 4; i++) session.avatarKeyDown('ArrowLeft');
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '2. four repeated ArrowLeft keydown events with no keyup between them still turn the vehicle exactly once, to 315 — never 4x45 further');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }
    {
        // A3 — the mirror for RIGHT.
        const { session, vehicleId } = ridingSession('a3');
        for (let i = 0; i < 4; i++) session.avatarKeyDown('ArrowRight');
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 45, '3. four repeated ArrowRight keydown events likewise turn the vehicle exactly once, to 45 — the mirror of A2');
        session.avatarKeyUp('ArrowRight');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section B — release and re-press: a held key is ignored, a
    // released-then-re-pressed key produces a genuine second pulse.
    // -------------------------------------------------------------
    {
        const { session, vehicleId } = ridingSession('b1');
        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '4. LEFT down -> one pending pulse');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '5. LEFT down again, still held, no keyup between -> ignored (still the same pending LEFT, never a second one queued)');

        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '6. the one pending pulse is realized as exactly one turn');
        assert(session.vehicleSteeringIntent().isNone === true, '7. ...and consumed back to NONE');

        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isNone === true, '8. LEFT up is never itself a signal — no new pulse from a release');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '9. LEFT down again, genuinely re-pressed after a real release -> a second pulse');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, '10. the second pulse realizes a second, independent 45-degree turn (315 -> 270)');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }
    {
        // B2 — the mirror for RIGHT.
        const { session, vehicleId } = ridingSession('b2');
        session.avatarKeyDown('ArrowRight');
        session.avatarKeyDown('ArrowRight');
        assert(session.vehicleSteeringIntent().isRight === true, '11. RIGHT down, then again while still held -> still just the one pending RIGHT pulse');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 45, '12. realized as one turn');

        session.avatarKeyUp('ArrowRight');
        session.avatarKeyDown('ArrowRight');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 90, '13. release then re-press produces a genuine second turn (45 -> 90)');
        session.avatarKeyUp('ArrowRight');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section C — LEFT/RIGHT transitions, and the actual (never newly
    // invented) simultaneous-key behavior this codebase already has.
    // -------------------------------------------------------------
    {
        // C1 — each genuine transition (a down edge) produces exactly one
        // corresponding intent; an up edge never does.
        const { session, vehicleId } = ridingSession('c1');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '14. LEFT down/up -> one LEFT turn (0 -> 315)');

        session.avatarKeyDown('ArrowRight');
        session.avatarKeyUp('ArrowRight');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 0, '15. RIGHT down/up -> one RIGHT turn (315 -> 0)');

        session.avatarKeyDown('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '16. LEFT down again -> one more LEFT turn (0 -> 315) — the third genuine transition, the third turn, no more no less');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }
    {
        // C2 — simultaneous/overlapping keys. This codebase tracks
        // `leftHeld`/`rightHeld` as two entirely INDEPENDENT bits (see
        // core/VehicleSteeringInputAdapter.js's own header) — there is no
        // LEFT+RIGHT exclusivity rule of any kind. This section documents
        // exactly that EXISTING behavior — a fresh keydown edge on either
        // control always overwrites whatever steering intent is currently
        // pending, whether or not the other control is still physically
        // held — rather than inventing a new "simultaneous steering"
        // semantic this milestone was never asked to design.
        const { session, vehicleId } = ridingSession('c2');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '17. LEFT down -> a pending LEFT pulse, not yet consumed by any tick');

        session.avatarKeyDown('ArrowRight');
        assert(session.vehicleSteeringIntent().isRight === true, '18. RIGHT down, while LEFT is STILL physically held (no LEFT up sent) -> a fresh RIGHT edge overwrites the still-pending LEFT pulse entirely');

        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 45, '19. only the RIGHT pulse is ever realized — the overwritten LEFT pulse leaves no trace, no partial turn, no queued second turn');

        session.avatarKeyUp('ArrowRight');
        session.avatarKeyDown('ArrowRight');
        assert(session.vehicleSteeringIntent().isRight === true, '20. releasing and re-pressing RIGHT produces a genuine second RIGHT edge even though LEFT has remained continuously "held" the entire time (its own hold bit is a completely independent fact from RIGHT\'s)');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 90, '21. ...and it realizes its own second turn (45 -> 90) — LEFT being held throughout never once fires, because its own one edge already happened, unconsumed, back at step 17');

        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('ArrowRight');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section D — intent consumption: a real pulse decays to an explicit
    // NONE after being applied, and NONE never reissues a further,
    // uncommanded turn.
    // -------------------------------------------------------------
    {
        const { session, vehicleId } = ridingSession('d1');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        const beforeTick = session.vehicleSteeringIntent();
        assert(beforeTick instanceof VehicleSteeringIntent && beforeTick.isLeft === true, '22. before the tick: a real, pending LEFT VehicleSteeringIntent');

        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '23. steering applied: the vehicle turned');
        const afterTick = session.vehicleSteeringIntent();
        assert(afterTick !== null && afterTick !== undefined, '24. after consumption: never null/undefined');
        assert(afterTick instanceof VehicleSteeringIntent, '25. ...always a real VehicleSteeringIntent instance');
        assert(afterTick.isNone === true, '26. ...specifically an explicit NONE — the pulse was consumed exactly once, this same tick');

        const headingAfterConsumption = session._vehicleRuntimeInstances.get(vehicleId).heading;
        for (let i = 0; i < 15; i++) {
            fireFrame(session, 0.05);
            const intent = session.vehicleSteeringIntent();
            assert(intent instanceof VehicleSteeringIntent && intent.isNone === true, `27.${i} a further tick with no new key press keeps reporting an explicit NONE, never null/undefined, never a lingering LEFT/RIGHT`);
            assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, headingAfterConsumption, `28.${i} NONE produces no additional steering rotation — heading stays bit-for-bit at ${headingAfterConsumption}`);
        }
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section E — mode transitions and stale input.
    // -------------------------------------------------------------
    {
        // E1 — a steer key physically held THROUGH an Avatar Control Mode
        // off/on cycle must neither vanish forever nor double-fire: mode
        // off resets the hold bit (0.9.128's own documented reasoning), so
        // the next keydown once mode returns — the browser's own
        // key-repeat, since the physical key never actually came up — is
        // read as a genuine NEW press, producing exactly one more turn.
        const { session, vehicleId } = ridingSession('e1');

        session.avatarKeyDown('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '29. setup: one ordinary LEFT turn while the mode is on');

        session.setAvatarControlMode(false);
        // The key never actually came up — but keydown is gated on Avatar
        // Control Mode, so this call is dropped entirely; not itself
        // load-bearing, it stands in for the browser continuing to fire
        // key-repeat while the key is held and the mode happens to be off.
        assert(session.avatarKeyDown('ArrowLeft') === false, '30. a steer key\'s own repeat while Avatar Control Mode is off is not consumed at all');

        session.setAvatarControlMode(true);
        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '31. once the mode returns, the SAME still-physically-held key produces a genuine new pulse — its hold bit was reset by the mode toggle, exactly as 0.9.128 documents, so this reads as a fresh press rather than an ignored repeat');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, '32. exactly one further turn (315 -> 270) — never zero (the key was never silently swallowed forever) and never two (no phantom double-fire from the mode cycle itself)');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }
    {
        // E2 — a genuine pulse requested BEFORE a mode toggle, and not yet
        // consumed by any tick, must still fire EXACTLY once once a tick
        // finally runs — never lost, never duplicated by the toggle
        // itself. Unlike the hold bits (reset by setAvatarControlMode(),
        // per E1), `_vehicleSteeringIntent` itself is left completely
        // alone by a mode toggle — this section documents that actual,
        // existing asymmetry directly, contrasting it with braking, whose
        // own intent IS forced back to NONE on mode off (0.9.96).
        const { session, vehicleId } = ridingSession('e2');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '33. a genuine LEFT pulse is pending, not yet consumed by any tick');

        session.setAvatarControlMode(false);
        assert(session.vehicleSteeringIntent().isLeft === true, '34. turning Avatar Control Mode off does NOT clear the already-pending steering intent — only the hold bits are reset, unlike braking (see 35, below)');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE_NONE, '35. contrast: braking intent, by contrast, IS forced back to NONE on the exact same mode-off transition (0.9.96) — steering and braking are deliberately NOT symmetric here');

        session.setAvatarControlMode(true);
        assert(session.vehicleSteeringIntent().isLeft === true, '36. turning the mode back on does not touch the still-pending intent either');

        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '37. the pre-transition pulse still fires, exactly once, the very next real tick — the frame loop itself is never gated on Avatar Control Mode');
        assert(session.vehicleSteeringIntent().isNone === true, '38. ...and decays to NONE immediately after, same as any other pulse');

        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '39. no further, uncommanded turn follows — the mode cycle produced no phantom second pulse');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }
    {
        // E3 — releaseAvatarMovementKeys() (the window-blur seam) resets
        // the steer hold bits the identical way setAvatarControlMode(false)
        // does, WITHOUT itself touching Avatar Control Mode — a key
        // release after that kind of transition still cleanly clears its
        // own hold bit rather than leaving it stale, and the mode itself
        // is left exactly as it was.
        const { session, vehicleId } = ridingSession('e3');

        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '40. setup: one ordinary LEFT turn');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '41. setup: a second LEFT pulse is now pending, unconsumed');

        session.releaseAvatarMovementKeys();
        assert(session.isAvatarControlModeActive() === true, '42. releasing held keys never itself disables Avatar Control Mode');
        assert(session.vehicleSteeringIntent().isLeft === true, '43. ...and, exactly like setAvatarControlMode(false), never touches the already-pending intent itself — only the hold bit');

        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '44. releasing the (now hold-bit-cleared) key produces no further change — an up edge is never a signal');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '45. sanity: the hold bit was genuinely cleared by releaseAvatarMovementKeys() — this reads as a fresh press, not an ignored repeat (were it not cleared, this call would report direction: null and leave the pending LEFT untouched, which is indistinguishable here; Section E1 is the direct proof of the reset itself)');

        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, '46. the pending pulse from before releaseAvatarMovementKeys() still fires exactly once, the same "reset the bit, never the intent" guarantee E2 already established for the mode-off seam');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section F — steering vs. heading authority: realized, collision-
    // clipped displacement is what heading tracks, never the raw
    // 45-degree steering transform — proven end to end through real key
    // input, not a programmatic setVehicleSteeringIntent() call.
    // -------------------------------------------------------------
    {
        // F1 — a real ArrowLeft press attempts 315 (due northwest); a
        // real wall standing in that attempted path clips its own
        // westward component, bending the REALIZED direction back toward
        // due north. Heading must track that realized bend, genuinely
        // different from the raw 315-degree attempt.
        const registry = buildRegistry();
        const vehicleId = freshVehicleId('f1');
        const spawnPosition = freshSpawn('f1');
        const wallX = spawnPosition.x - 3;
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit129-f1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, vehicleId, spawnPosition);
        installSyntheticWallObstacle(session, 'audit129-f1-wall', wallX, spawnPosition.z - 1, spawnPosition.z + 60);

        session.avatarKeyDown('w');
        assert(session.avatarKeyDown('ArrowLeft') === true, '47. a real ArrowLeft press is consumed by the real key binding');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, '48. sanity: the first steered tick realizes the full, unobstructed 315-degree attempt, before the wall is ever reached');

        let previousHeading = session._vehicleRuntimeInstances.get(vehicleId).heading;
        let stableStreak = 0;
        let everCollided = false;
        let stabilizedHeading = null;
        for (let i = 0; i < 400 && stabilizedHeading === null; i++) {
            fireFrame(session, 0.05);
            everCollided = everCollided || session._avatarVehicleMovementController.isCollided();
            const currentHeading = session._vehicleRuntimeInstances.get(vehicleId).heading;
            stableStreak = currentHeading === previousHeading ? stableStreak + 1 : 0;
            previousHeading = currentHeading;
            if (everCollided && stableStreak >= 5) {
                stabilizedHeading = currentHeading;
            }
        }
        assert(stabilizedHeading !== null, '49. sanity: the real, key-driven ride reached the wall and its own heading settled');
        assert(everCollided, '50. sanity: a genuine collision was registered, never a coincidental stop');
        assert(Math.abs(stabilizedHeading - 315) > 20, '51. THE CENTRAL CLAIM: the collision-clipped REALIZED heading is genuinely, substantially different from the raw steering attempt (315) — heading follows what the vehicle actually did, never the 45-degree transform itself');
        session.avatarKeyUp('w');
    }
    {
        // F2 — complete blockage: the entire attempted step is absorbed
        // by a real, already-flush obstacle; zero displacement, and the
        // previous heading is retained exactly.
        const registry = buildRegistry();
        const vehicleId = freshVehicleId('f2');
        const spawn = freshSpawn('f2');
        const brickCenter = groundedBrickCenter(spawn.x, spawn.z + 5);
        const spawnPosition = { x: brickCenter.x, y: brickCenter.y, z: brickCenter.z - 0.5 - BICYCLE_RADIUS };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit129-f2', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, vehicleId, spawnPosition, 45);
        installSyntheticBrickObstacle(session, 'audit129-f2-brick', brickCenter);

        assert(session._vehicleRuntimeInstances.get(vehicleId).heading === 45, '52. sanity: a real, pre-existing heading of 45, never the default 0');
        session.avatarKeyDown('w');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, 'setup: a real LEFT request is pending, attempting due north (0), directly at the flush obstacle');

        const before = session._vehicleRuntimeInstances.get(vehicleId);
        fireFrame(session, 0.05);
        const after = session._vehicleRuntimeInstances.get(vehicleId);
        assert(after.position.x === before.position.x && after.position.z === before.position.z, '53. position unchanged: the entire attempted step, redirected by a real LEFT press, was fully absorbed by collision');
        assert(after.heading === 45, '54. heading unchanged: the blocked steering request never once reaches heading, because it never once reaches realized movement');
        assert(session._avatarVehicleMovementController.isCollided() === true, '55. sanity: a genuine collision, not merely "no movement intent"');
        assert(session.vehicleSteeringIntent().isNone === true, '56. the one-shot LEFT request already decayed to NONE after being consumed this tick, blocked or not');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section G — existing controls stay isolated.
    // -------------------------------------------------------------
    {
        // G1 — avatar A/D rotation, the reason arrow keys were chosen for
        // steering in the first place, is genuinely unaffected: holding
        // 'a' turns the avatar's own rendered facing (rotationY) at its
        // own steady rate regardless of an interleaved steering pulse,
        // and a steering pulse turns the vehicle's own heading by exactly
        // 45 degrees regardless of 'a' being held throughout.
        //
        // Steering is engaged FIRST, with a single throwaway pulse, before
        // 'a' is ever touched: until the very first steering key of a ride
        // is pressed, `_vehicleSteeringIntent` is still `null` and vehicle
        // heading is still resolved from the raw, rotationY-driven legacy
        // path (0.9.127's own documented default) — genuinely coupled to
        // 'a' at that point, by design, exactly like any un-steered ride.
        // Only once steering has genuinely engaged (`_vehicleSteeringIntent`
        // a real, even NONE, VehicleSteeringIntent) does the vehicle's own
        // heading decouple from rotationY, per 0.9.127's own Section D —
        // this section's own central claim is about THAT already-decoupled
        // state, not the pre-steering one.
        const { session, vehicleId, avatarPresenceSession } = ridingSession('g1');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        const headingBeforeA = session._vehicleRuntimeInstances.get(vehicleId).heading;
        assertClose(headingBeforeA, 315, 'setup: steering is now genuinely engaged, decoupling heading from rotationY');

        session.avatarKeyDown('a');
        const rotationsBefore = [];
        for (let i = 0; i < 10; i++) {
            fireFrame(session, 0.05);
            rotationsBefore.push(avatarPresenceSession.current.rotation.y);
            assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, headingBeforeA, `57.${i} holding 'a' never itself changes the vehicle's own heading — it stays exactly ${headingBeforeA} while NONE steering keeps attempting it, unaffected by rotationY`);
        }
        for (let i = 1; i < rotationsBefore.length; i++) {
            assert(rotationsBefore[i] !== rotationsBefore[i - 1], `58.${i} ...while 'a' keeps changing the avatar's own rendered facing every single one of those same frames`);
        }
        const rotationJustBeforeSteer = rotationsBefore[rotationsBefore.length - 1];
        const perFrameRotationDelta = rotationsBefore[1] - rotationsBefore[0];

        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, '59. a real steering pulse still turns the vehicle by exactly 45 degrees further (315 -> 270) while \'a\' is continuously held');
        const rotationJustAfterSteer = avatarPresenceSession.current.rotation.y;
        assertClose(rotationJustAfterSteer - rotationJustBeforeSteer, perFrameRotationDelta, '60. THE CENTRAL CLAIM: the steering pulse changes the avatar\'s own rendered facing by the exact SAME per-frame amount \'a\' alone already produces — the steering pulse itself contributes nothing to rotationY, and never resets or perturbs the avatar\'s own independent A/D turn');

        for (let i = 0; i < 5; i++) fireFrame(session, 0.05);
        const rotationLater = avatarPresenceSession.current.rotation.y;
        assertClose(rotationLater - rotationJustAfterSteer, perFrameRotationDelta * 5, '61. \'a\' keeps rotating the avatar at its own unchanged rate after the steering pulse, too, while vehicle heading stays fixed at 270 the entire time');
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, '62. ...confirmed: vehicle heading itself never moved during those 5 further \'a\'-only frames');
        session.avatarKeyUp('a');
        session.avatarKeyUp('w');
    }
    {
        // G2 — a consolidated real-session flow: mount (the real
        // deterministic fixture vehicle), forward movement, braking,
        // steering, dismount, and on-foot walking, none of it disturbed
        // by this milestone's own steering state. Deeper coverage of each
        // individual control already exists
        // (tests/VehicleSteeringInputIntegration.test.js's own Section D,
        // tests/AvatarVehicleBrakingInputBindingIntegration.test.js) — this
        // is the regression net for this audit's own concern: none of it
        // regresses once real held-bit/decay steering state is in play.
        const registry = buildRegistry();
        const realVehicle = findRealVehicle();
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit129-g2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // Vehicle proximity + mount.
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID, '63. mounting the real fixture vehicle via E still works');
        session.avatarKeyUp('e');

        // Forward movement + avatar-follows-vehicle.
        session.avatarKeyDown('w');
        for (let i = 0; i < 30; i++) {
            fireFrame(session, 0.05);
            const vehiclePosition = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
            const avatarPosition = avatarPresenceSession.current.position;
            assert(avatarPosition.x === vehiclePosition.x && avatarPosition.z === vehiclePosition.z, `64.${i} the avatar's own position exactly mirrors the vehicle's own committed position throughout a real, steering-capable ride`);
        }
        const beforeTurn = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;

        // Steering.
        session.avatarKeyDown('ArrowRight');
        session.avatarKeyUp('ArrowRight');
        fireFrame(session, 0.05);
        const afterTurn = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
        assert(afterTurn.x !== beforeTurn.x || afterTurn.z !== beforeTurn.z, '65. a real steering pulse still genuinely redirects the vehicle\'s own attempted movement');

        // Braking.
        session.avatarKeyUp('w');
        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE, '66. Control still engages braking after a steering request has already been consumed');
        let lastDelta = null;
        for (let i = 0; i < 30; i++) {
            const before = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
            fireFrame(session, 0.05);
            const after = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
            lastDelta = Math.hypot(after.x - before.x, after.z - before.z);
        }
        assert(lastDelta < 0.01, '67. braking through the real Control key still genuinely decelerates the vehicle to a near-stop, unaffected by this milestone\'s own steering state');
        session.avatarKeyUp('Control');

        // Dismount, then ordinary on-foot walking resumes.
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        assert(session.avatarVehicleMount() === null, '68. dismounting via E still works');
        session.avatarKeyUp('e');
        const beforeWalk = { ...avatarPresenceSession.current.position };
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        const afterWalk = avatarPresenceSession.current.position;
        assert(afterWalk.x !== beforeWalk.x || afterWalk.z !== beforeWalk.z, '69. once unmounted, ordinary on-foot walking genuinely moves the avatar again — no steering residue left the movement pipeline stuck');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section H — structural audit.
    // -------------------------------------------------------------
    {
        const adapterCode = await sourceOf('../core/VehicleSteeringInputAdapter.js');
        const forbidden = [
            'steeringAngle', 'SteeringAngle', 'steeringRate', 'SteeringRate',
            'angularVelocity', 'AngularVelocity', 'turnRadius', 'TurnRadius',
            'turningRadius', 'TurningRadius', 'wheelRotation', 'WheelRotation',
            'VehiclePhysics', 'vehiclePhysics', 'banking', 'Banking',
            'drifting', 'Drifting', 'wheelbase', 'Wheelbase',
            'THREE', 'three', 'Scene', 'Mesh', 'Object3D',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket', 'broadcast',
            'heading', 'Heading', '45', 'VehicleSteeringSimulation',
            'resolveVehicleMovementDirectionFromSteering', 'AvatarVehicleMovementController'
        ];
        for (const term of forbidden) {
            assert(!adapterCode.includes(term), `70. core/VehicleSteeringInputAdapter.js never references "${term}" — no steering angle, rate, physics, rendering, persistence, or networking, and no idea a controller or a heading exists`);
        }
        assert(adapterCode.includes('import') && adapterCode.split('import').length - 1 === 1,
            '71. sanity: exactly one import (VehicleSteeringDirection) — the adapter reaches neither the controller nor VehicleMovementHeading.js at all');

        const rawSessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');
        const methodMatch = rawSessionSource.match(/_processVehicleSteeringInput\(key, type\)\s*\{([\s\S]*?)\n {4}\}/);
        assert(methodMatch !== null, '72. sanity: _processVehicleSteeringInput() still exists and is extractable as a single method body');
        const methodBody = methodMatch[1];
        for (const term of ['steeringAngle', 'SteeringAngle', 'angularVelocity', 'AngularVelocity', 'turnRadius', 'TurnRadius', 'wheelRotation', 'WheelRotation', 'resolveVehicleMovementDirectionFromSteering', 'resolveVehicleHeadingFromMovement']) {
            assert(!methodBody.includes(term), `73. _processVehicleSteeringInput() still never references "${term}" — a thin translation, never a decision layer with its own heading or physics math`);
        }

        const controllerCode = await sourceOf('../application/AvatarVehicleMovementController.js');
        assert(!controllerCode.includes('Arrow') && !controllerCode.includes('VehicleSteeringInputAdapter'),
            '74. application/AvatarVehicleMovementController.js still never learns a key exists — steering reaches it only as an already-resolved VehicleSteeringIntent parameter');
        assert(!controllerCode.includes('this._steeringIntent') && !controllerCode.includes('this._steering'),
            '75. the controller still holds no PERSISTENT steering-intent field of its own — steeringIntent is a fresh, per-tick parameter, exactly like movementIntent');

        const intentSource = await sourceOf('../core/VehicleSteeringIntent.js');
        assert(!intentSource.includes('key') && !intentSource.includes('KeyboardEvent') && !intentSource.includes('Arrow'),
            '76. core/VehicleSteeringIntent.js remains completely untouched by this milestone — still no keyboard awareness of any kind');
        const simulationSource = await sourceOf('../core/VehicleSteeringSimulation.js');
        assert(!simulationSource.includes('key') && !simulationSource.includes('KeyboardEvent') && !simulationSource.includes('Arrow'),
            '77. core/VehicleSteeringSimulation.js remains completely untouched too');

        const sessionCodeOnly = rawSessionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!sessionCodeOnly.includes('resolveVehicleMovementDirectionFromSteering') && !sessionCodeOnly.includes('resolveVehicleHeadingFromMovement'),
            '78. application/WorldNavigationSession.js itself still never calls either heading or steering math directly — only ever threads a VehicleSteeringIntent value through to the controller');
    }
    {
        // The architectural claim, checked directly: the adapter's own
        // exports are exactly the one pure function this milestone's own
        // header names — no class, no hidden singleton, no second entry
        // point that could smuggle controller or heading awareness in.
        const adapterCode = await sourceOf('../core/VehicleSteeringInputAdapter.js');
        assert(adapterCode.split('export function').length - 1 === 1 && !adapterCode.includes('export class'),
            '79. core/VehicleSteeringInputAdapter.js exports exactly one function, no class — VehicleSteeringInputAdapter -> VehicleSteeringIntent, and nothing else');
        assert(!adapterCode.includes('let ') && !adapterCode.includes('var '),
            '80. no mutable module-level state either — every call is independently pure, still true of this milestone\'s own held-bit input');
    }

    console.log('✅ All Vehicle Steering Control Audit tests passed.');
}

await runTests();
