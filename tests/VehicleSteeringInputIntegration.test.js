import { readFile } from 'node:fs/promises';
import { VehicleSteeringIntent } from '../core/VehicleSteeringIntent.js';
import { deriveVehicleSteeringInputEvent } from '../core/VehicleSteeringInputAdapter.js';
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

// 0.9.128 — Vehicle Steering Input Binding.
//
// 0.9.127 wired VehicleSteeringIntent/VehicleSteeringSimulation into the
// real mounted-vehicle pipeline, entirely through
// `WorldNavigationSession#setVehicleSteeringIntent()` — a plain,
// programmatic seam, deliberately never a key binding (see that
// milestone's own "Recommendation": deciding how A/D, arrow keys, or a
// controller input produce a VehicleSteeringIntent stays this milestone's
// own job). This suite proves the missing half: a real physical input
// genuinely reaches `VehicleSteeringIntent` and, through it, the already-
// tested steering/movement/collision/heading pipeline, without ever
// re-implementing any part of that pipeline itself.
//
//   Keyboard input (ArrowLeft/ArrowRight)
//           |
//           v
//   core/VehicleSteeringInputAdapter.js        <- "what happened"
//           |
//           v
//   VehicleSteeringIntent                      <- "what the driver requests"
//           |
//           v
//   VehicleSteeringSimulation / AvatarVehicleMovementController#tick()
//           |
//           v
//   attempted movement -> collision -> realized position -> heading
//
//   Section A: Left mapping — a real ArrowLeft press reaches
//              setVehicleSteeringIntent() as LEFT, and holding the key
//              (repeated keydown, no keyup between) never compounds a
//              further turn beyond the one discrete pulse
//   Section B: Right mapping — the mirror of A
//   Section C: Neutral mapping — NONE is a real, explicit
//              VehicleSteeringIntent once steering has engaged, never
//              null/undefined; a fresh, never-steered session reports no
//              active request at all (`null`, the pre-0.9.127 default)
//   Section D: existing movement controls (forward/backward, mount/
//              dismount, braking, avatar following) are byte-for-byte
//              unaffected by this milestone
//   Section E: separation — the input adapter and the key-binding seam
//              calculate no heading, no 45 degrees, and never call
//              VehicleSteeringSimulation directly; their only job is
//              input -> VehicleSteeringIntent
//   Section F: FLAGSHIP — the real pipeline, driven by real keys: mount,
//              forward, a real ArrowLeft press realizes a genuine LEFT
//              turn end to end, then the mirror for ArrowRight
//   Section G: blocked steering — a real ArrowLeft press against an
//              already-flush obstacle leaves position AND heading
//              completely unchanged
//   Section H: structural exclusion audit — no steering angle, wheel
//              state, angular velocity, turning radius, vehicle physics,
//              rendering, persistence, or networking anywhere this
//              milestone's own input layer touches
//
// See docs/Roadmap.md, 0.9.128.

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
    const avatarPresenceSession = new AvatarPresenceSession(profile, startPosition ? { position: startPosition, rotation: { y: 0 } } : {});
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

// The direct structural twin of tests/VehicleSteeringIntegrationAudit.test.js's
// own helper of the same name — installs a real, single-brick obstacle that
// the SESSION's own internal, live-read `AvatarMovementConstraint` (built
// from `_loadedDocuments`/`_localPositions`) picks up automatically, so a
// real key-driven ride can genuinely collide with it.
function installSyntheticBrickObstacle(session, docId, worldCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, worldCenter.y, 0) }));
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x: worldCenter.x, y: 0, z: worldCenter.z });
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
const { BRAKE } = AvatarVehicleBrakingIntent;

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Left mapping.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-a1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        assert(session.vehicleSteeringIntent() === null, '1. a fresh session reports no active steering request before any steer key is ever pressed');

        const consumed = session.avatarKeyDown('ArrowLeft');
        assert(consumed === true, '2. avatarKeyDown("ArrowLeft") reports the event as consumed while Avatar Control Mode is on');
        const intent = session.vehicleSteeringIntent();
        assert(intent !== null && intent !== undefined, '3. pressing ArrowLeft genuinely reaches setVehicleSteeringIntent() — no longer null/undefined');
        assert(intent instanceof VehicleSteeringIntent, '4. ...and it is a real VehicleSteeringIntent instance, never a bare string');
        assert(intent.isLeft === true, '5. ...specifically LEFT');

        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '6. releasing ArrowLeft is never itself a signal — the held request survives a key-up untouched, matching every other transition in this codebase');
    }
    {
        // Case-insensitivity, matching every other raw-key comparison
        // already in this codebase (core/AvatarContinuousMovementInputAdapter.js,
        // application/AvatarMovementController.js#_setKey, and 0.9.96's own
        // brake-key binding).
        const registry = buildRegistry();
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-a2');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session.avatarKeyDown('arrowleft');
        assert(session.vehicleSteeringIntent().isLeft === true, '7. lowercase "arrowleft" engages LEFT steering too');
    }
    {
        // A3 — THE CENTRAL SEMANTIC CLAIM this milestone exists to prove:
        // holding ArrowLeft down — a real browser's own key-repeat firing
        // keydown('ArrowLeft') over and over with no keyup in between —
        // turns the vehicle exactly ONCE, never a further compounding turn
        // on every repeated keydown. See
        // core/VehicleSteeringInputAdapter.js's own header for exactly why
        // the held bit that makes this possible exists at all.
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:steer-a3-hold';
        const spawnPosition = { x: 90000, y: 0, z: 90000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-a3', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, VEHICLE_ID, spawnPosition);

        session.avatarKeyDown('w');
        for (let i = 0; i < 5; i++) session.avatarKeyDown('ArrowLeft');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        const headingAfterHold = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingAfterHold, 315, '8. holding ArrowLeft (5 repeated keydown events, no keyup between them) turns exactly once, to 315 — never 5x45 degrees further');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section B — Right mapping (the mirror of Section A).
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-b1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        const consumed = session.avatarKeyDown('ArrowRight');
        assert(consumed === true, '9. avatarKeyDown("ArrowRight") reports the event as consumed');
        const intent = session.vehicleSteeringIntent();
        assert(intent instanceof VehicleSteeringIntent && intent.isRight === true, '10. pressing ArrowRight genuinely reaches setVehicleSteeringIntent() as RIGHT');

        session.avatarKeyUp('ArrowRight');
        assert(session.vehicleSteeringIntent().isRight === true, '11. releasing ArrowRight does not itself alter the held request');
    }
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:steer-b2-hold';
        const spawnPosition = { x: 90500, y: 0, z: 90500 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-b2', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, VEHICLE_ID, spawnPosition);

        session.avatarKeyDown('w');
        for (let i = 0; i < 5; i++) session.avatarKeyDown('ArrowRight');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        const headingAfterHold = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingAfterHold, 45, '12. holding ArrowRight turns exactly once, to 45 — the mirror of Section A3');
        session.avatarKeyUp('ArrowRight');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section C — Neutral mapping. NONE is a real, explicit
    // VehicleSteeringIntent once steering has engaged, never null/
    // undefined; a session that has never steered at all reports no
    // active request (`null`, the pre-0.9.127 default this milestone
    // never changes — see application/WorldNavigationSession.js's own
    // `setVehicleSteeringIntent()` header for exactly why that
    // distinction matters).
    // -------------------------------------------------------------
    {
        const none = VehicleSteeringIntent.none();
        assert(none !== null && none !== undefined, '13. sanity: VehicleSteeringIntent.none() is a real object, never null/undefined');
        assert(none.isNone === true, '14. ...and reports isNone');
    }
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:steer-c1';
        const spawnPosition = { x: 91000, y: 0, z: 91000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-c1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, VEHICLE_ID, spawnPosition);

        session.avatarKeyDown('w');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, 'setup: a real LEFT request is pending before the first tick consumes it');

        for (let i = 0; i < 10; i++) {
            fireFrame(session, 0.05);
            const intent = session.vehicleSteeringIntent();
            assert(intent !== null && intent !== undefined, `15.${i} never null/undefined once steering has genuinely engaged`);
            assert(intent instanceof VehicleSteeringIntent, `16.${i} always a real VehicleSteeringIntent`);
            assert(intent.isNone === true, `17.${i} no new steer-key edge since the one LEFT press -> an explicit NONE ("neither direction currently requested"), consumed within the SAME tick that used it — never a lingering LEFT/RIGHT, never null`);
        }
        session.avatarKeyUp('w');
    }
    {
        // The raw per-event adapter fact for an unrelated key, or a
        // key-up, is `null` — a deliberately different, lower-level
        // contract than the SESSION's own `VehicleSteeringIntent` (which
        // is never null once engaged, per above): `null` here means "this
        // event implies no NEW edge," not "no direction requested."
        const { direction: unrelated } = deriveVehicleSteeringInputEvent({ type: 'keydown-of-something-else' });
        assert(unrelated === null, '18. an unrelated control transition reports direction: null — "no new edge," the caller\'s job to interpret, never this file\'s own VehicleSteeringIntent value');
    }

    // -------------------------------------------------------------
    // Section D — existing movement controls are byte-for-byte
    // unaffected by this milestone.
    // -------------------------------------------------------------
    {
        // D1 — ordinary on-foot forward movement, arrow keys never
        // touched at all.
        const registry = buildRegistry();
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-d1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        assert(avatarPresenceSession.current.position.z > 0, '19. ordinary on-foot W movement works exactly as before this milestone');
        session.avatarKeyUp('w');
    }
    {
        // D2 — mount/dismount ('E') against the real, deterministic
        // fixture vehicle, unaffected by a steering request armed before
        // ever mounting.
        const registry = buildRegistry();
        const realVehicle = findRealVehicle();
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-d2', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];

        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, 'setup: a steering request can be armed even while unmounted, same as braking (0.9.96)');

        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '20. mounting via E still works with a steering request already pending');
        session.avatarKeyUp('e');

        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() === null, '21. dismounting via E still works too, unaffected by this milestone');
        session.avatarKeyUp('e');
    }
    {
        // D3 — braking (Control) still decelerates normally, and composes
        // cleanly with an active steering request; the avatar's own
        // position also continues to exactly mirror the vehicle's own
        // committed position throughout a real, key-driven steered ride.
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:steer-d3';
        const spawnPosition = { x: 92000, y: 0, z: 92000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-d3', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._avatarMovementController.setMovementCapability(BICYCLE_CAPABILITY);
        injectMountedVehicle(session, VEHICLE_ID, spawnPosition);

        session.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) fireFrame(session, 0.05);
        const beforeTurn = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;

        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        const afterTurn = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
        const cruiseDelta = Math.hypot(afterTurn.x - beforeTurn.x, afterTurn.z - beforeTurn.z);

        // Release the forward key before braking — matching this
        // codebase's own established braking semantics
        // (tests/AvatarVehicleBrakingInputBindingIntegration.test.js's own
        // Section C: Control decelerates the CURRENT speed toward
        // whatever target the movement key is currently requesting; with
        // 'w' still held, that target stays full speed and there is
        // nothing for braking to do).
        session.avatarKeyUp('w');
        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE, '22. Control still engages braking while a steering request has already been consumed');
        let lastDelta = cruiseDelta;
        for (let i = 0; i < 40; i++) {
            const before = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            fireFrame(session, 0.05);
            const after = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            const avatarPosition = avatarPresenceSession.current.position;
            assert(avatarPosition.x === after.x && avatarPosition.z === after.z, `23.${i} the avatar's own position exactly mirrors the vehicle's own committed position throughout this steered, braked ride`);
            lastDelta = Math.hypot(after.x - before.x, after.z - before.z);
        }
        assert(lastDelta < cruiseDelta, '24. braking through the real Control key genuinely decelerates the vehicle even with an already-consumed steering request behind it');
        session.avatarKeyUp('Control');
    }

    // -------------------------------------------------------------
    // Section E — separation: the input layer calculates no heading, no
    // 45 degrees, and never calls VehicleSteeringSimulation directly.
    // -------------------------------------------------------------
    {
        const adapterCode = await sourceOf('../core/VehicleSteeringInputAdapter.js');
        const forbidden = ['heading', 'Heading', '45', 'VehicleSteeringSimulation', 'resolveVehicleMovementDirectionFromSteering', 'VehicleInstance', 'THREE', 'three', 'position', 'Position', 'collision', 'Collision'];
        for (const term of forbidden) {
            assert(!adapterCode.includes(term), `25. core/VehicleSteeringInputAdapter.js never references "${term}" — its only job is input -> VehicleSteeringIntent`);
        }
        assert(adapterCode.includes('import') && adapterCode.split('import').length - 1 === 1,
            '26. sanity: exactly one import (VehicleSteeringDirection) — no Three.js, no heading math, no vehicle runtime access');

        const rawSessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');
        const methodMatch = rawSessionSource.match(/_processVehicleSteeringInput\(key, type\)\s*\{([\s\S]*?)\n {4}\}/);
        assert(methodMatch !== null, '27. sanity: _processVehicleSteeringInput() exists and is extractable as a single method body');
        const methodBody = methodMatch[1];
        for (const term of forbidden) {
            assert(!methodBody.includes(term), `28. _processVehicleSteeringInput() never references "${term}" either — a thin translation, never a new decision layer`);
        }
        assert(methodBody.includes('VEHICLE_STEER_LEFT_KEY') && methodBody.includes('VEHICLE_STEER_RIGHT_KEY')
            && methodBody.includes('deriveVehicleSteeringInputEvent') && methodBody.includes('createVehicleSteeringIntent') && methodBody.includes('setVehicleSteeringIntent'),
            '29. sanity: the method genuinely calls through this milestone\'s own adapter into setVehicleSteeringIntent()');
        assert(!/VehicleType|VehiclePresence|AvatarVehicleMount|BICYCLE|MOTORCYCLE|\bCAR\b|DRONE|movementCapability|isMounted|avatarVehicleMount\(\)|GROUND_VEHICLE|AERIAL_VEHICLE/.test(methodBody),
            '30. _processVehicleSteeringInput() introduces no vehicle-specific branching whatsoever — it reads only the key/type it was given');

        const sessionCodeOnly = rawSessionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!sessionCodeOnly.includes('resolveVehicleMovementDirectionFromSteering') && !sessionCodeOnly.includes('resolveVehicleHeadingFromMovement'),
            '31. application/WorldNavigationSession.js itself never calls either heading or steering math directly, this milestone included — it only ever threads a VehicleSteeringIntent value through to the controller');

        // Exactly the two arrow keys, no other existing movement/
        // interaction key repurposed for steering.
        assert(/const VEHICLE_STEER_LEFT_KEY = 'arrowleft';/.test(rawSessionSource) && /const VEHICLE_STEER_RIGHT_KEY = 'arrowright';/.test(rawSessionSource),
            '32. sanity: exactly two physical keys, ArrowLeft/ArrowRight, are bound to steering');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: the real pipeline, driven by real keys.
    // mount -> forward -> left input -> LEFT intent -> steering
    // simulation -> movement -> collision -> realized heading, then the
    // mirror for RIGHT.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:steer-f-flagship';
        const spawnPosition = { x: 93000, y: 0, z: 93000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-f1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, VEHICLE_ID, spawnPosition);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === VEHICLE_ID, 'setup: genuinely mounted');

        // forward
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        const headingBeforeTurn = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingBeforeTurn, 0, '33. sanity: a straight, un-steered ride north before any steering input at all');

        // left input -> LEFT intent -> steering simulation -> movement ->
        // collision -> realized heading
        assert(session.avatarKeyDown('ArrowLeft') === true, '34. ArrowLeft is consumed by the real key binding');
        assert(session.vehicleSteeringIntent().isLeft === true, '35. the real key press reached setVehicleSteeringIntent() as LEFT');
        session.avatarKeyUp('ArrowLeft');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        const headingAfterLeft = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingAfterLeft, 315, '36. FLAGSHIP: a single real ArrowLeft press, through the real key binding, realizes a genuine LEFT turn end to end through the real controller and real collision constraints');

        // ...then the mirror for RIGHT, from the vehicle's own new heading.
        assert(session.avatarKeyDown('ArrowRight') === true, '37. ArrowRight is consumed by the real key binding too');
        assert(session.vehicleSteeringIntent().isRight === true, '38. the real key press reached setVehicleSteeringIntent() as RIGHT');
        session.avatarKeyUp('ArrowRight');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        const headingAfterRight = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingAfterRight, 0, '39. a single real ArrowRight press turns the vehicle back, the mirror of the LEFT turn above');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section G — blocked steering: a real ArrowLeft press against an
    // already-flush obstacle leaves position AND heading completely
    // unchanged.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:steer-g-blocked';
        // Pre-existing heading 45 — LEFT from 45 attempts due north (0),
        // directly at a brick placed EXACTLY `0.5 + BICYCLE_RADIUS` north
        // of spawn (the identical "already flush against the obstacle"
        // technique tests/VehicleSteeringIntegrationAudit.test.js's own
        // Section C uses), so the very FIRST steered tick already
        // realizes zero net horizontal movement — no approach phase
        // required, and no risk of the vehicle drifting off the flush
        // line before steering is ever applied.
        const brickCenter = groundedBrickCenter(95000, 95005);
        const spawnPosition = { x: brickCenter.x, y: brickCenter.y, z: brickCenter.z - 0.5 - BICYCLE_RADIUS };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'steer-g1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, VEHICLE_ID, spawnPosition, 45);
        installSyntheticBrickObstacle(session, 'steer-g-doc', brickCenter);

        assert(session._vehicleRuntimeInstances.get(VEHICLE_ID).heading === 45, '40. sanity: the vehicle starts at a real, pre-existing heading of 45, never the default 0');

        session.avatarKeyDown('w');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, 'setup: a real LEFT request is pending — attempts due north, directly at the flush obstacle');

        const before = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        fireFrame(session, 0.05);
        const after = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        assert(after.position.x === before.position.x && after.position.z === before.position.z,
            '41. position unchanged: the entire attempted step, redirected by a real LEFT press, was fully absorbed by collision');
        assert(after.heading === 45,
            '42. heading unchanged: the blocked steering request never once reaches heading, because it never once reaches realized movement');
        assert(session._avatarVehicleMovementController.isCollided() === true,
            '43. sanity: this was genuinely registered as a real collision, not merely "no movement intent"');
        assert(session.vehicleSteeringIntent().isNone === true,
            '44. the one-shot LEFT request already decayed to NONE after being consumed this tick — blocked or not, it is never reissued');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section H — structural exclusion audit.
    // -------------------------------------------------------------
    {
        const adapterCode = await sourceOf('../core/VehicleSteeringInputAdapter.js');
        const rawSessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');
        const methodMatch = rawSessionSource.match(/_processVehicleSteeringInput\(key, type\)\s*\{([\s\S]*?)\n {4}\}/);
        const methodBody = methodMatch[1];

        const forbidden = [
            'steeringAngle', 'SteeringAngle', 'wheelRotation', 'WheelRotation',
            'angularVelocity', 'AngularVelocity', 'turnRadius', 'TurnRadius',
            'turningRadius', 'TurningRadius', 'VehiclePhysics', 'vehiclePhysics',
            'banking', 'Banking', 'drifting', 'Drifting', 'wheelbase', 'Wheelbase',
            'THREE', 'three', 'Scene', 'Mesh', 'Object3D',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket', 'broadcast'
        ];
        for (const term of forbidden) {
            assert(!adapterCode.includes(term), `45. core/VehicleSteeringInputAdapter.js never references "${term}"`);
            assert(!methodBody.includes(term), `46. _processVehicleSteeringInput() never references "${term}" either`);
        }

        // No PERSISTENT steering state of its own: the adapter carries no
        // module-level mutable state — `leftHeld`/`rightHeld` are plain
        // function parameters, fed back in by the caller every time, never
        // a variable this module remembers between calls itself.
        assert(!adapterCode.includes('let ') && !adapterCode.includes('var ') && !/^\s*class\s/m.test(adapterCode),
            '47. core/VehicleSteeringInputAdapter.js declares no mutable module-level state and no class of its own — every call is independently pure');
        assert(adapterCode.split('export function').length - 1 === 1,
            '48. core/VehicleSteeringInputAdapter.js exports exactly one function — no class, no hidden singleton, no second entry point');

        // core/VehicleSteeringIntent.js and core/VehicleSteeringSimulation.js
        // remain exactly as 0.9.126/0.9.127 left them — untouched by this
        // milestone's own input layer.
        const intentSource = await sourceOf('../core/VehicleSteeringIntent.js');
        assert(!intentSource.includes('key') && !intentSource.includes('KeyboardEvent') && !intentSource.includes('Arrow'),
            '49. core/VehicleSteeringIntent.js remains completely untouched by this milestone — still no keyboard awareness of any kind');
        const simulationSource = await sourceOf('../core/VehicleSteeringSimulation.js');
        assert(!simulationSource.includes('key') && !simulationSource.includes('KeyboardEvent') && !simulationSource.includes('Arrow'),
            '50. core/VehicleSteeringSimulation.js remains completely untouched too');
        const controllerCodeOnly = await sourceOf('../application/AvatarVehicleMovementController.js');
        assert(!controllerCodeOnly.includes('Arrow') && !controllerCodeOnly.includes('VehicleSteeringInputAdapter'),
            '51. application/AvatarVehicleMovementController.js never learns a key exists — steering still reaches it only as an already-resolved VehicleSteeringIntent parameter');
    }

    console.log('✅ All Vehicle Steering Input Integration tests passed.');
}

await runTests();
