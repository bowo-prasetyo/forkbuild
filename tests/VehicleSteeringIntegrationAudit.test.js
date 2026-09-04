import { readFile } from 'node:fs/promises';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';
import { resolveVehicleMovementDirectionFromSteering } from '../core/VehicleSteeringSimulation.js';
import { VehicleSteeringIntent } from '../core/VehicleSteeringIntent.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { AvatarVehicleMovementController } from '../application/AvatarVehicleMovementController.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { VehicleRenderer } from '../renderer/VehicleRenderer.js';
import { VehicleFieldRenderer } from '../renderer/VehicleFieldRenderer.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.127 — Vehicle Steering Integration Audit.
//
// 0.9.125 (core/VehicleSteeringIntent.js) named the driver's request.
// 0.9.126 (core/VehicleSteeringSimulation.js) turned that request into a
// pure, stateless ATTEMPTED direction, and deliberately stopped there —
// "no wiring into application/AvatarVehicleMovementController.js or any
// other real controller," per that file's own closing header. This
// milestone is that wiring, plus the audit that proves it stays inside
// its own lane: `application/AvatarVehicleMovementController.js#tick()`
// now accepts an optional `steeringIntent`, and
// `application/WorldNavigationSession.js` now holds one
// (`setVehicleSteeringIntent()`/`vehicleSteeringIntent()`) and passes it
// through, every frame — see both files' own 0.9.127 headers for exactly
// what changed and why every EXISTING caller (every test predating this
// milestone, and a real session until some future input layer starts
// calling that setter) is completely unaffected.
//
// THE CENTRAL INVARIANT UNDER TEST THROUGHOUT:
//
//   VehicleSteeringIntent
//           |
//           v
//   VehicleSteeringSimulation
//           |
//           v
//   attempted direction
//           |
//           v
//   movement simulation (speed/acceleration/braking — untouched)
//           |
//           v
//   world collision constraints
//           |
//           v
//   realized position
//           |
//           v
//   VehicleMovementHeading
//           |
//           v
//   VehicleInstance.heading
//
// Steering modifies ATTEMPTED movement; collision determines REALIZED
// movement; realized movement — and only realized movement — determines
// heading. No step in that chain may be skipped: steering never reaches
// heading, position, or any runtime store directly — only ever through
// "steering -> attempted movement," exactly as before this milestone's
// own wiring was added, one layer deeper.
//
//   Section A: steering reaches the real vehicle controller, without a
//              parallel movement implementation
//   Section B: FLAGSHIP — realized movement determines heading: an
//              unobstructed steered turn realizes its own attempted
//              direction as the new heading; a collision-clipped one
//              realizes something genuinely different instead
//   Section C: fully blocked steering — a steering request whose entire
//              attempted step is absorbed by collision leaves heading
//              completely unchanged, even though the attempt itself
//              genuinely differed from it
//   Section D: the avatar follows the vehicle's own position, never
//              steering directly — rotationY (the avatar's own facing)
//              stays completely independent of vehicle steering
//   Section E: runtime authority — VehicleRuntimeInstances remains the
//              one authoritative runtime store; VehicleInstance gains no
//              steering field of any kind
//   Section F: rendering stays unaware of steering — it observes
//              position/heading exactly as before, never steering itself
//   Section G: FLAGSHIP — a full continuous session: spawn, mount, ride,
//              LEFT steering, RIGHT steering, a real blocked steered
//              turn, dismount, on-foot walking resumes normally
//   Section H: structural exclusion audit — no steering angle, rate,
//              turn radius, angular velocity, wheel rotation, vehicle
//              physics, banking, drifting, persistent steering state, or
//              steering-aware rendering/persistence/networking anywhere
//              this milestone's own integration touches; VehicleMovementHeading
//              remains the ONLY heading-resolution authority
//
// NO NEW PRODUCTION FILES. Every change lives inside the two files this
// milestone's own header names — application/AvatarVehicleMovementController.js
// and application/WorldNavigationSession.js — reusing
// core/VehicleSteeringSimulation.js's pure function VERBATIM. See
// docs/Roadmap.md, 0.9.127.

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
    const calls = { onAnimationFrameCallbacks: [], syncVehicleCalls: [] };
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
        syncVehicles: (instances) => calls.syncVehicleCalls.push(instances),
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
    session._setupVehicleRendering();
    return session;
}

function fireFrame(session, deltaSeconds) {
    for (const callback of session._session.calls.onAnimationFrameCallbacks) {
        callback(deltaSeconds);
    }
}

async function sourceOf(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function buildSingleBrickConstraint(center) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(center.x, center.y, center.z) }));
    world.addBuilding(building);
    const loadedDocuments = new Map([['doc-1', { world }]]);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    return new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
}

function groundedBrickCenter(x, z) {
    return { x, y: terrainHeightAt(DEFAULT_WORLD_SEED, x, z) + 0.5, z };
}

// A wall of adjacent bricks along Z at a fixed X — the direct structural
// twin of tests/VehicleOrientationAudit.test.js's own Section B helper,
// which already proved this shape clips only ONE axis of a diagonal
// ride, bending its realized direction back toward the unblocked axis
// rather than fully stopping it. Used here for the exact same purpose,
// one layer up: clipping a STEERED attempted direction instead of a raw
// movement-intent one.
//
// EACH BRICK SITS AT ITS OWN REAL TERRAIN HEIGHT, never a flat, made-up
// Y — core/AvatarCollision.js's own `resolveAxis()` requires genuine
// VERTICAL overlap between the moving body's own AVATAR_COLLISION_HEIGHT
// band and an obstacle's own Y range before that obstacle can block
// anything at all (see that function's own "no vertical overlap at all"
// check). A REAL, terrain-grounded controller ride (this milestone's own
// integration, unlike tests/VehicleOrientationAudit.test.js's own
// Section B2, which drove `apply()` directly against a flat, made-up Y)
// keeps the vehicle's own Y snapped to genuine terrain height every
// tick — so a wall built at a flat Y unrelated to that terrain would
// silently never register as an obstacle at all, not because the
// horizontal geometry was wrong, but because it would sit entirely
// underground (or entirely in the air) relative to where the vehicle
// actually rides.
function buildWallConstraint(x, zFrom, zTo) {
    const world = new World();
    const building = new Building();
    for (let z = zFrom; z <= zTo; z++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, groundedBrickCenter(x, z).y, z) }));
    }
    world.addBuilding(building);
    const loadedDocuments = new Map([['doc-1', { world }]]);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    return new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
}

function installSyntheticBrickObstacle(session, docId, worldCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, worldCenter.y, 0) }));
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x: worldCenter.x, y: 0, z: worldCenter.z });
}

const BICYCLE_CAPABILITY = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
const BICYCLE_RADIUS = BICYCLE_CAPABILITY.collisionRadius;
const FORWARD_INTENT = Object.freeze({ direction: 1, turnAxis: 0, running: false, brakingRequested: false });
const IDLE_INTENT = Object.freeze({ direction: 0, turnAxis: 0, running: false, brakingRequested: false });

function fakeVehicleStore(instance) {
    let current = instance;
    return {
        get(id) { return id === current.id ? current : null; },
        setPosition(id, nextPosition) {
            if (id !== current.id) return null;
            current = current.withPosition(nextPosition);
            return current;
        },
        setHeading(id, nextHeading) {
            if (id !== current.id) return null;
            current = current.withHeading(nextHeading);
            return current;
        },
        _current: () => current
    };
}

function bicycle(id, position, heading) {
    return new VehicleInstance({ id, type: VehicleType.BICYCLE, spawnPosition: position, position, heading });
}

function degreesToRadians(degrees) { return degrees * (Math.PI / 180); }

async function runTests() {
    const { NONE, LEFT, RIGHT } = VehicleSteeringIntent;

    // -------------------------------------------------------------
    // Section A — steering reaches the real vehicle controller, without
    // a parallel movement implementation.
    // -------------------------------------------------------------
    {
        // A1 — NONE, explicitly supplied, reproduces the SAME single-tick
        // result as no steering at all (`steeringIntent: null`), for a
        // vehicle riding straight with no turn key held (rotationY stays
        // at the vehicle's own current heading throughout). This is the
        // literal regression proof for "NONE -> existing forward
        // behavior": once a real steering intent enters the pipeline,
        // requesting NO turn changes nothing about what a caller who
        // never mentions steering at all already gets.
        const legacyStore = fakeVehicleStore(bicycle('vehicle:a1-legacy', { x: 0, y: 0, z: 0 }, 0));
        const legacyController = new AvatarVehicleMovementController(legacyStore, null, null);
        legacyController.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:a1-legacy', capability: BICYCLE_CAPABILITY,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.1
        });

        const steeredStore = fakeVehicleStore(bicycle('vehicle:a1-steered', { x: 0, y: 0, z: 0 }, 0));
        const steeredController = new AvatarVehicleMovementController(steeredStore, null, null);
        steeredController.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:a1-steered', capability: BICYCLE_CAPABILITY,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.1, steeringIntent: VehicleSteeringIntent.none()
        });

        assertClose(steeredStore._current().position.x, legacyStore._current().position.x, '1. NONE steering, explicitly supplied, reproduces the exact same X as no steering at all');
        assertClose(steeredStore._current().position.z, legacyStore._current().position.z, '2. ...and the same Z');
        assertClose(steeredStore._current().heading, legacyStore._current().heading, '3. ...and the same resulting heading — THE REGRESSION PROOF: NONE means existing forward behavior');
    }
    {
        // A2/A3 — LEFT and RIGHT, by contrast, genuinely alter this
        // tick's attempted direction: the realized single-tick
        // displacement points along resolveVehicleMovementDirectionFromSteering()'s
        // own output, not along the un-steered rotationY-driven direction
        // A1 just proved NONE reproduces.
        for (const [intent, expectedDirection, label] of [[VehicleSteeringIntent.left(), 315, 'LEFT'], [VehicleSteeringIntent.right(), 45, 'RIGHT']]) {
            const store = fakeVehicleStore(bicycle(`vehicle:a2-${label}`, { x: 0, y: 0, z: 0 }, 0));
            const controller = new AvatarVehicleMovementController(store, null, null);
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: `vehicle:a2-${label}`, capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.1, steeringIntent: intent
            });
            const moved = store._current();
            assert(moved.position.x !== 0 || moved.position.z !== 0, `4.${label} sanity: the vehicle genuinely moved`);
            const realizedDirection = resolveVehicleHeadingFromMovement({ dx: moved.position.x, dz: moved.position.z, previousHeading: 999 });
            assertClose(realizedDirection, expectedDirection, `5.${label} the realized single-tick displacement points along the STEERED attempted direction (${expectedDirection}), not the un-steered one (0)`);
            assertClose(moved.heading, expectedDirection, `6.${label} heading itself resolves to the exact same altered direction`);
        }
    }
    {
        // A4 — structural: no parallel movement implementation. This
        // milestone's own wiring reuses core/AvatarMovementSimulation.js's
        // existing kinematics and core/VehicleSteeringSimulation.js's
        // existing pure transformation VERBATIM — exactly ONE call site
        // each — rather than growing a second position/speed formula of
        // its own inside the controller.
        const codeOnly = await sourceOf('../application/AvatarVehicleMovementController.js');
        const countOf = (needle) => codeOnly.split(needle).length - 1;
        assert(countOf('simulateAvatarMovement(') === 1, '7. exactly ONE call site for the existing movement kinematics — no second copy');
        assert(countOf('resolveVehicleMovementDirectionFromSteering(') === 1, '8. exactly ONE call site for the existing steering transformation — no second copy');
        assert(countOf('.setPosition(') === 1 && countOf('.setHeading(') === 1, '9. exactly ONE commit path each for position and heading — steering opened no second write path to VehicleRuntimeInstances');
        for (const term of ['WALK_SPEED', 'RUN_SPEED', 'GRAVITY', 'JUMP_IMPULSE']) {
            assert(!codeOnly.includes(term), `10. the controller never redefines ${term} — speed/gravity/jump constants stay core/AvatarMovementSimulation.js's own, sole property`);
        }
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: realized movement determines heading.
    // -------------------------------------------------------------
    {
        // B1 — open path: heading 0, LEFT steering, nothing in the way.
        // The vehicle's own attempted direction (315) is fully realized,
        // and heading resolves to exactly that.
        const store = fakeVehicleStore(bicycle('vehicle:b1', { x: 0, y: 0, z: 0 }, 0));
        const controller = new AvatarVehicleMovementController(store, null, null);
        const expectedAttempted = resolveVehicleMovementDirectionFromSteering({ previousHeading: 0, steeringIntent: VehicleSteeringIntent.left() });
        assertClose(expectedAttempted, 315, '11. sanity: LEFT from heading 0 attempts 315, exactly as core/VehicleSteeringSimulation.js\'s own suite already proves in isolation');

        controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b1', capability: BICYCLE_CAPABILITY,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.1, steeringIntent: VehicleSteeringIntent.left()
        });
        assertClose(store._current().heading, 315, '12. FLAGSHIP: an unobstructed LEFT turn realizes the attempted direction (315) as the new heading, through the REAL controller');
    }
    {
        // B2 — the collision-clipped counterpart: the identical LEFT
        // steering request, but a real wall now stands in the attempted
        // direction's own path. The vehicle keeps attempting 315 every
        // tick (steering held once, then explicitly released to NONE —
        // "continue whatever direction I've already turned to," never a
        // second, compounding turn every tick), but the WALL clips its
        // own westward (-X) component, bending the REALIZED direction
        // back toward due north — genuinely different from 315, and
        // heading tracks THAT, never the attempt.
        const start = groundedBrickCenter(0, 0);
        const wall = buildWallConstraint(-3, -1, 40);
        const store = fakeVehicleStore(bicycle('vehicle:b2', start, 0));
        const controller = new AvatarVehicleMovementController(store, wall, null);

        // Tick 1 — the single discrete LEFT steering event: turns the
        // vehicle's own attempted (and, since nothing yet blocks it,
        // realized) direction from 0 to 315.
        controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b2', capability: BICYCLE_CAPABILITY,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05, steeringIntent: VehicleSteeringIntent.left()
        });
        assertClose(store._current().heading, 315, '13. sanity: the first steered tick realizes 315 exactly like B1, before the wall is ever reached');

        // Subsequent ticks — steering mode stays ACTIVE (a real,
        // explicit NONE, never `null`) so the vehicle keeps attempting
        // "continue along my current heading," letting it travel far
        // enough to actually reach the wall, without re-issuing a fresh
        // 45-degree turn every tick.
        let previousHeading = store._current().heading;
        let stableStreak = 0;
        let stabilizedHeading = null;
        let everCollided = false;
        for (let i = 0; i < 400 && stabilizedHeading === null; i++) {
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b2', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05, steeringIntent: VehicleSteeringIntent.none()
            });
            everCollided = everCollided || controller.isCollided();
            const currentHeading = store._current().heading;
            stableStreak = currentHeading === previousHeading ? stableStreak + 1 : 0;
            previousHeading = currentHeading;
            // Gated on `everCollided` (a collision seen at ANY point so
            // far), never on THIS tick's own `isCollided()`: once the
            // wall has bent the vehicle's own realized direction back
            // toward due north, it no longer attempts any further X
            // movement at all (NONE steering continues along the
            // now-settled heading), so a LATER tick's own collision flag
            // legitimately reads false again — the same "isCollided()
            // first turning true does not itself mean heading has
            // settled" caution tests/VehicleOrientationAudit.test.js's
            // own Section G header already documents, one direction
            // further: here it can go true, then false again, once
            // redirected PARALLEL to the wall rather than fully stopped
            // by it. `everCollided` is required too so a heading that
            // simply never changed yet (the long straight run BEFORE the
            // wall is ever reached) is never mistaken for "settled."
            if (everCollided && stableStreak >= 5) {
                stabilizedHeading = currentHeading;
            }
        }
        assert(stabilizedHeading !== null, '14. sanity: the ride actually reached the wall and its own heading settled to a stable value');
        assert(everCollided, '14b. sanity: a real collision was registered at some point along the way, never a coincidental stop');
        assert(store._current().position.x > -3, '15. sanity: the vehicle was genuinely stopped short of the wall\'s own X, never passed through it');
        assert(store._current().position.z > 1, '16. sanity: the vehicle made real northward progress before/while being clipped — the wall never blocked Z');
        assert(Math.abs(stabilizedHeading - 315) > 20, '17. THE FLAGSHIP CLAIM: the collision-clipped REALIZED heading is genuinely, substantially different from the STEERED ATTEMPT (315) — heading tracks what the vehicle actually did, never what steering asked for');
    }

    // -------------------------------------------------------------
    // Section C — fully blocked steering: the entire attempted step is
    // absorbed by collision, and heading survives completely unchanged.
    // -------------------------------------------------------------
    {
        // heading 45, LEFT steering attempts 0 (due north) — an
        // axis-aligned attempt, so a single brick placed EXACTLY
        // `0.5 + BICYCLE_RADIUS` north of the spawn point (the identical
        // "already flush against the obstacle" technique
        // tests/VehicleOrientationAudit.test.js's own Section C1 uses)
        // guarantees the very FIRST steered tick already realizes zero
        // net horizontal movement — no approach phase required.
        const brickCenter = groundedBrickCenter(0, 5);
        const constraint = buildSingleBrickConstraint(brickCenter);
        const spawn = { x: brickCenter.x, y: brickCenter.y, z: brickCenter.z - 0.5 - BICYCLE_RADIUS };
        const store = fakeVehicleStore(bicycle('vehicle:c1', spawn, 45));
        const controller = new AvatarVehicleMovementController(store, constraint, null);

        assert(store._current().heading === 45, '18. sanity: the vehicle starts at a real, pre-existing heading of 45 — never the default 0');
        const attempted = resolveVehicleMovementDirectionFromSteering({ previousHeading: 45, steeringIntent: VehicleSteeringIntent.left() });
        assertClose(attempted, 0, '19. sanity: LEFT from heading 45 attempts due north (0), directly toward the flush-adjacent brick');

        for (let i = 0; i < 30; i++) {
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c1', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05, steeringIntent: VehicleSteeringIntent.left()
            });
            assert(store._current().position.x === spawn.x && store._current().position.z === spawn.z,
                `20.${i} position stays EXACTLY at spawn under continued held LEFT steering against the real, flush obstacle — the entire attempted step is absorbed, every single tick`);
            assert(store._current().heading === 45,
                `21.${i} THE FLAGSHIP CLAIM: heading stays EXACTLY 45 — the vehicle's own steering request (attempting 0) never once reaches heading, because it never once reaches realized movement`);
        }
        assert(controller.isCollided() === true, '22. sanity: the constraint pipeline genuinely registered this as a collision, not merely "no movement intent"');
    }

    // -------------------------------------------------------------
    // Section D — the avatar follows the vehicle's own position, never
    // steering directly; rotationY (the avatar's own facing) stays
    // completely independent of vehicle steering.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:audit-d';
        const spawnPosition = { x: 88000, y: 0, z: 88000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-d1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._vehicleRuntimeInstances._instances.set(VEHICLE_ID, new VehicleInstance({ id: VEHICLE_ID, type: VehicleType.BICYCLE, spawnPosition, position: spawnPosition }));
        session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(VEHICLE_ID);

        session.avatarKeyDown('w');
        // Deliberately no A/D turn key held throughout — rotationY's own
        // ONLY driver (movementIntent.turnAxis) stays at 0 the entire
        // time, even while steering is actively turning the vehicle. A
        // single discrete LEFT steering event (one frame), then released
        // to an explicit NONE — the same "turn once, then continue" shape
        // Section B2/G already establish, never a continuously held turn
        // (which would keep compounding a further 45 degrees every
        // single frame).
        session.setVehicleSteeringIntent(VehicleSteeringIntent.left());
        fireFrame(session, 0.05);
        session.setVehicleSteeringIntent(VehicleSteeringIntent.none());
        let lastRotationY = null;
        for (let i = 0; i < 40; i++) {
            fireFrame(session, 0.05);
            const vehiclePosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            const avatarPosition = avatarPresenceSession.current.position;
            assert(avatarPosition.x === vehiclePosition.x && avatarPosition.z === vehiclePosition.z,
                `23.${i} the avatar's own position exactly equals the vehicle's own already-committed position, on every single steered frame`);
            lastRotationY = avatarPresenceSession.current.rotation.y;
        }
        const finalVehicle = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        assert(Math.abs(finalVehicle.heading - 0) > 30, '24. sanity: the vehicle\'s own heading genuinely changed under held steering');
        assertClose(lastRotationY, 0, '25. THE FLAGSHIP CLAIM: the avatar\'s own rotationY (its rendered facing) stayed at 0 throughout — completely independent of the vehicle\'s own steering-driven heading change');
    }

    // -------------------------------------------------------------
    // Section E — runtime authority: VehicleRuntimeInstances remains the
    // one authoritative store; VehicleInstance gains no steering field.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const original = bicycle('vehicle:e1', { x: 0, y: 0, z: 0 }, 10);
        store._instances.set('vehicle:e1', original);
        const controller = new AvatarVehicleMovementController(store, null, null);
        controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:e1', capability: BICYCLE_CAPABILITY,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.1, steeringIntent: VehicleSteeringIntent.right()
        });
        assert(store.get('vehicle:e1').heading !== 10, '26. the SAME VehicleRuntimeInstances store this codebase has always used reflects the steering-driven heading change — no second, parallel store was introduced');
    }
    {
        const orientationFiles = ['../core/VehicleInstance.js', '../application/VehicleRuntimeInstances.js'];
        const forbidden = ['steering', 'Steering', 'SteeringIntent', 'steeringAngle', 'SteeringAngle', 'steeringRate', 'SteeringRate'];
        for (const path of orientationFiles) {
            const codeOnly = await sourceOf(path);
            for (const term of forbidden) {
                assert(!codeOnly.includes(term), `27. ${path} never references "${term}" in its own code — 0.9.125's own exclusion ("no steering field on VehicleInstance, no steering field on VehicleRuntimeInstances") still holds after this milestone's own integration`);
            }
        }
    }
    {
        // VehicleInstance's own constructor still recognizes only its
        // pre-0.9.127 fields — an unknown extra `steering` property
        // handed to the constructor is silently ignored, never adopted.
        const instance = new VehicleInstance({ id: 'vehicle:e2', type: VehicleType.BICYCLE, spawnPosition: { x: 0, y: 0, z: 0 }, steering: 'left' });
        assert(instance.steering === undefined, '28. VehicleInstance exposes no `.steering` getter of any kind, even when a caller mistakenly hands one to the constructor');
    }

    // -------------------------------------------------------------
    // Section F — rendering stays unaware of steering.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        store._instances.set('vehicle:f1', bicycle('vehicle:f1', { x: 0, y: 0, z: 0 }, 0));
        const controller = new AvatarVehicleMovementController(store, null, null);
        const field = new VehicleFieldRenderer();

        const before = field.setVehicle(store.get('vehicle:f1'));
        const rotationBefore = before.rotation.y;

        controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:f1', capability: BICYCLE_CAPABILITY,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.1, steeringIntent: VehicleSteeringIntent.left()
        });
        const after = field.setVehicle(store.get('vehicle:f1'));
        assert(after === before, '29. sanity: still the SAME tracked Object3D — a steering-driven heading change never rebuilds it, exactly like an un-steered one');
        assert(after.rotation.y !== rotationBefore, '30. the renderer picks up the steering-driven heading change through the exact same position/heading observation path it has always used');
    }
    {
        const fieldSource = await sourceOf('../renderer/VehicleFieldRenderer.js');
        const visualSource = await sourceOf('../renderer/VehicleVisual.js');
        const forbidden = ['VehicleSteeringIntent', 'VehicleSteeringSimulation', 'resolveVehicleMovementDirectionFromSteering', 'steeringIntent'];
        for (const term of forbidden) {
            assert(!fieldSource.includes(term), `31. renderer/VehicleFieldRenderer.js never references "${term}" — it observes position/heading only, exactly as before this milestone`);
            assert(!visualSource.includes(term), `32. renderer/VehicleVisual.js never references "${term}" either`);
        }
    }

    // -------------------------------------------------------------
    // Section G — FLAGSHIP: a full continuous session. Spawn, mount,
    // ride, LEFT steering, RIGHT steering, a real blocked steered turn,
    // dismount, on-foot walking resumes normally.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:audit-g-flagship';
        const spawnPosition = { x: 97000, y: 0, z: 97000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-g1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._vehicleRuntimeInstances._instances.set(VEHICLE_ID, new VehicleInstance({ id: VEHICLE_ID, type: VehicleType.BICYCLE, spawnPosition, position: spawnPosition }));
        session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(VEHICLE_ID);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === VEHICLE_ID, '33. setup: mounted');
        assert(session.vehicleSteeringIntent() === null, '34. setup: a freshly built session has no active steering request — the real default, exactly like every session before this milestone');

        function assertAvatarFollowsVehicle(label, i) {
            const vehiclePosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            const avatarPosition = avatarPresenceSession.current.position;
            assert(avatarPosition.x === vehiclePosition.x && avatarPosition.z === vehiclePosition.z,
                `35.${label}.${i} the avatar's position exactly equals the vehicle's own already-committed position`);
        }

        // Phase 1 — ride straight ahead, no steering active at all
        // (`_vehicleSteeringIntent` still `null`) — the ordinary,
        // pre-0.9.127 pipeline, byte-for-byte.
        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase1', i);
        }
        const headingA = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingA, 0, '36. phase 1: heading A resolves to 0 (north), the ordinary un-steered ride');

        // Phase 2 — LEFT steering: one discrete steering event, then
        // released to an explicit NONE ("keep going the way I just
        // turned"), never re-issued every frame — see Section B2's own
        // header for why holding LEFT itself would compound instead.
        session.setVehicleSteeringIntent(VehicleSteeringIntent.left());
        fireFrame(session, 0.05);
        assertAvatarFollowsVehicle('phase2-turn', 0);
        session.setVehicleSteeringIntent(VehicleSteeringIntent.none());
        for (let i = 0; i < 30; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase2-continue', i);
        }
        const headingB = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingB, 315, '37. phase 2: THE SECOND REALIZED DIRECTION — heading B is 315, a genuine LEFT turn away from heading A (0)');

        // Phase 3 — RIGHT steering: the mirror of phase 2, from B's own
        // new heading.
        session.setVehicleSteeringIntent(VehicleSteeringIntent.right());
        fireFrame(session, 0.05);
        assertAvatarFollowsVehicle('phase3-turn', 0);
        session.setVehicleSteeringIntent(VehicleSteeringIntent.none());
        for (let i = 0; i < 30; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase3-continue', i);
        }
        const headingC = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        assertClose(headingC, 0, '38. phase 3: THE THIRD REALIZED DIRECTION — heading C is back to 0, a genuine RIGHT turn away from heading B (315)');
        assert(headingC !== headingA || session._vehicleRuntimeInstances.get(VEHICLE_ID).position.x !== spawnPosition.x,
            '39. sanity: even though heading C numerically matches heading A, the vehicle itself is at a genuinely different, further-traveled position — this was a real ride, not a no-op');

        // Phase 4 — a REAL collision block, directly ahead along heading
        // C's own current direction of travel, with steering still
        // ACTIVE (explicit NONE — "keep going straight") the whole time.
        const beforeBlock = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
        const headingCRadians = degreesToRadians(headingC);
        installSyntheticBrickObstacle(session, 'flagship-g-doc', {
            x: beforeBlock.x + Math.sin(headingCRadians) * 4,
            y: terrainHeightAt(session.getWorldSeed(), beforeBlock.x, beforeBlock.z) + 0.5,
            z: beforeBlock.z + Math.cos(headingCRadians) * 4
        });
        let firstBlockedHeading = null;
        let previousHeading = headingC;
        let stableStreak = 0;
        for (let i = 0; i < 100 && firstBlockedHeading === null; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase4', i);
            const current = session._vehicleRuntimeInstances.get(VEHICLE_ID);
            stableStreak = current.heading === previousHeading ? stableStreak + 1 : 0;
            previousHeading = current.heading;
            if (session._avatarVehicleMovementController.isCollided() && stableStreak >= 5) {
                firstBlockedHeading = current.heading;
            }
        }
        assert(firstBlockedHeading !== null, '40. sanity: the steered ride collided with the real, freshly-installed obstacle and its own heading settled');

        const blockedPosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
        for (let i = 0; i < 20; i++) {
            fireFrame(session, 0.05);
            const current = session._vehicleRuntimeInstances.get(VEHICLE_ID);
            assert(current.heading === firstBlockedHeading,
                `41.${i} THE FLAGSHIP CLAIM: heading C (as clipped by this real collision) stays exactly ${firstBlockedHeading} under continued STEERED forward input against the obstacle — never drifts, never resets, regardless of the still-active steering request`);
            assert(current.position.x === blockedPosition.x && current.position.z === blockedPosition.z,
                `42.${i} ...and position stays bit-exact too — the vehicle genuinely never moves again once fully blocked`);
        }
        session.avatarKeyUp('w');

        // Phase 5 — dismount: release steering entirely, drop the mount
        // directly (the identical simplification this milestone's own
        // Section D setup, and tests/VehicleOrientationAudit.test.js's
        // own Section G, already use for MOUNTING — dismount-destination
        // resolution itself is tests/AvatarVehicleRuntimeIntegration.test.js's
        // own, already-covered concern, not this audit's), and confirm
        // ordinary on-foot walking resumes with no steering residue.
        session.setVehicleSteeringIntent(null);
        session._avatarVehicleInteractionController._mount = null;
        const beforeWalk = { ...avatarPresenceSession.current.position };
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) {
            fireFrame(session, 0.05);
        }
        const afterWalk = avatarPresenceSession.current.position;
        assert(afterWalk.x !== beforeWalk.x || afterWalk.z !== beforeWalk.z,
            '43. THE DISMOUNT CLAIM: once unmounted, ordinary on-foot walking genuinely moves the avatar again — no steering state left the avatar or the movement pipeline stuck');
        session.avatarKeyUp('w');
    }

    // -------------------------------------------------------------
    // Section H — structural exclusion audit.
    // -------------------------------------------------------------
    {
        const integrationFiles = [
            '../application/AvatarVehicleMovementController.js',
            '../application/WorldNavigationSession.js',
            '../core/VehicleInstance.js',
            '../application/VehicleRuntimeInstances.js',
            '../renderer/VehicleVisual.js',
            '../renderer/VehicleFieldRenderer.js'
        ];
        // Specific, camelCase/PascalCase identifiers a genuine steering-
        // physics or persistence feature would actually introduce — never
        // generic English words a 310KB, many-subsystem file like
        // WorldNavigationSession.js could otherwise legitimately contain
        // for entirely unrelated reasons (camera framing, gizmos,
        // transform tools, and so on).
        const forbidden = [
            // Deliberately NOT 'steeringRate'/'SteeringRate': the avatar's
            // own PRE-EXISTING, 0.9.94 `capability.steering.steeringRate`
            // (its held-turn-key facing rate) legitimately still appears
            // in application/AvatarVehicleMovementController.js — see
            // this milestone's own header, "0.9.127 — Vehicle Steering
            // Integration Audit," for why that stays untouched, and
            // Section A's own structural check for what DID change there.
            'steeringAngle', 'SteeringAngle',
            'turnRadius', 'TurnRadius', 'turningRadius', 'TurningRadius',
            'angularVelocity', 'AngularVelocity', 'wheelRotation', 'WheelRotation',
            'VehiclePhysics', 'vehiclePhysics', 'banking', 'Banking',
            'drifting', 'Drifting', 'wheelbase', 'Wheelbase'
        ];
        for (const path of integrationFiles) {
            const codeOnly = await sourceOf(path);
            for (const term of forbidden) {
                assert(!codeOnly.includes(term), `44. ${path} never references "${term}" in its own code — no vehicle physics or persistent steering state leaked into this milestone's own integration`);
            }
        }
    }
    {
        // No PERSISTENT steering state: `AvatarVehicleMovementController`
        // holds no field remembering a steering intent between ticks —
        // `steeringIntent` is a fresh, per-call parameter (the direct
        // structural twin of `movementIntent` itself), never assigned to
        // `this.` anywhere.
        const codeOnly = await sourceOf('../application/AvatarVehicleMovementController.js');
        assert(!codeOnly.includes('this._steeringIntent') && !codeOnly.includes('this._steering'),
            '45. AvatarVehicleMovementController holds no persistent steering-intent field of its own — steering is a fresh, per-tick parameter, exactly like movementIntent');
    }
    {
        // VehicleMovementHeading.js remains the ONLY heading-resolution
        // authority: `resolveVehicleHeadingFromMovement()`'s own module
        // has exactly one caller across this milestone's own touched
        // files, and `core/VehicleSteeringSimulation.js` — reused for
        // this milestone's integration — still never calls it itself
        // (0.9.126's own boundary, unchanged).
        const controllerCode = await sourceOf('../application/AvatarVehicleMovementController.js');
        assert(controllerCode.split('resolveVehicleHeadingFromMovement(').length - 1 === 1,
            '46. exactly one call to resolveVehicleHeadingFromMovement() in the real controller — heading resolution was never duplicated for the steered path');
        const steeringSimCode = await sourceOf('../core/VehicleSteeringSimulation.js');
        assert(!steeringSimCode.includes('resolveVehicleHeadingFromMovement'),
            '47. core/VehicleSteeringSimulation.js still never calls resolveVehicleHeadingFromMovement() itself — this milestone\'s own integration reused it at the CONTROLLER layer, never inside the pure steering-simulation file');
        const sessionCode = await sourceOf('../application/WorldNavigationSession.js');
        assert(!sessionCode.includes('resolveVehicleHeadingFromMovement') && !sessionCode.includes('resolveVehicleMovementDirectionFromSteering'),
            '48. application/WorldNavigationSession.js itself never calls either heading or steering math directly — it only ever threads a VehicleSteeringIntent value through to the controller, exactly like it already does for movementIntent');
    }

    console.log('✅ All Vehicle Steering Integration Audit tests passed.');
}

await runTests();
