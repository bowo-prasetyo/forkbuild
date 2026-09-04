import { readFile } from 'node:fs/promises';
import { resolveHorizontalMovement, AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { AvatarVehicleMovementController, isMovableVehicleType } from '../application/AvatarVehicleMovementController.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.119 — Vehicle–World Collision Constraint.
//
//   Section A: core/AvatarCollision.js — resolveHorizontalMovement()'s new
//              optional `radius` parameter
//   Section B: application/AvatarMovementConstraint.js — apply()'s new
//              optional `avatarRadius` option, against a REAL brick
//   Section C: application/AvatarVehicleMovementController.js — the
//              actual composition seam: building collision, then tree
//              collision, applied to a vehicle's own simulated position,
//              each handed the vehicle's own capability.collisionRadius
//   Section D: application/WorldNavigationSession.js — end to end, real
//              fixture bicycle, real tree, real dismount, real on-foot
//              avatar sharing the identical constraint instances
//   Section E: architectural regression — no second collision system, no
//              vehicle-vs-vehicle collision, one shared pair of
//              constraint instances
//
// Central architectural claim under test throughout: vehicle-vs-world
// collision REUSES the avatar's own existing building/brick and tree
// collision constraints, parameterized by the vehicle's own
// capability.collisionRadius (core/AvatarVehicleMovementCapability.js,
// 0.9.88) — never a second collision system, never a rectangular or
// oriented footprint, never vehicle-vs-vehicle collision. See
// docs/Roadmap.md, 0.9.119.

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

const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';
function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function mountRealVehicle(session) {
    session.avatarKeyDown('e');
    fireFrame(session, 0.016);
    session.avatarKeyUp('e');
    assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
        'sanity: mounting the real fixture vehicle succeeded');
}

// A real, deterministic, isolated tree under DEFAULT_WORLD_SEED — the
// same "largest nearest-neighbor distance" selection
// tests/AvatarVehicleCollisionFootprintIntegration.test.js's own 0.9.88
// helper already established, reused here (never re-derived
// differently) so a single vehicle is tested against a single tree.
function findIsolatedTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    let mostIsolated = wide[0];
    let largest = -Infinity;
    for (const tree of wide) {
        let nearest = Infinity;
        for (const other of wide) {
            if (other === tree) continue;
            const d = Math.hypot(other.center.x - tree.center.x, other.center.z - tree.center.z);
            if (d < nearest) nearest = d;
        }
        if (nearest > largest) { largest = nearest; mostIsolated = tree; }
    }
    return mostIsolated;
}

// A single real 1x1x1 'core:cube' brick as the sole obstacle in an
// otherwise-empty document/building, plus the loadedDocuments/
// getWorldPosition/brickRegistry trio application/AvatarMovementConstraint.js
// itself expects — the exact same minimal fixture
// tests/AvatarCollision.test.js's own Section A already builds by hand,
// with no publication/spatial-index machinery needed for a pure
// constraint-level test.
function buildBrickObstacleConstraint(brickCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(brickCenter.x, brickCenter.y, brickCenter.z) }));
    world.addBuilding(building);
    const document = { world };
    const loadedDocuments = new Map([['doc-1', document]]);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    return new AvatarMovementConstraint({
        loadedDocuments,
        getWorldPosition: () => ({ x: 0, y: 0, z: 0 }),
        brickRegistry
    });
}

async function sourceOf(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — core/AvatarCollision.js: resolveHorizontalMovement()'s
    // new optional `radius`.
    // -------------------------------------------------------------
    {
        const obstacles = [{ min: { x: 4.5, y: 0, z: -10 }, max: { x: 10, y: 2, z: 10 } }];
        const withDefault = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 10, dz: 0, obstacles });
        const withExplicitDefault = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 10, dz: 0, obstacles, radius: AVATAR_COLLISION_RADIUS });
        assert(withDefault.x === withExplicitDefault.x && withDefault.collided === true,
            '1. omitting `radius` reproduces AVATAR_COLLISION_RADIUS exactly, byte for byte — the pre-0.9.119 default');

        const widerRadius = 0.45; // BICYCLE's own collisionRadius (0.9.88)
        const withWiderRadius = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 10, dz: 0, obstacles, radius: widerRadius });
        assert(withWiderRadius.collided === true, '2. a wider radius still collides with the same obstacle');
        assert(withWiderRadius.x < withDefault.x,
            '3. THE SEAM ITSELF: a wider radius stops FARTHER from the obstacle than AVATAR_COLLISION_RADIUS does — the exact same obstacle, the exact same requested step, only the moving body\'s own radius differs');
        assert(Math.abs((obstacles[0].min.x - withWiderRadius.x) - widerRadius) < 1e-3,
            '4. the wider-radius stop sits exactly at the obstacle\'s own face minus THAT radius (minus a small skin epsilon) — never the default AVATAR_COLLISION_RADIUS');
    }

    // -------------------------------------------------------------
    // Section B — application/AvatarMovementConstraint.js: apply()'s new
    // optional `avatarRadius`, against a REAL brick.
    // -------------------------------------------------------------
    {
        const brickCenter = { x: 5, y: 0.5, z: 0 }; // core:cube spans x [4.5, 5.5]
        const constraint = buildBrickObstacleConstraint(brickCenter);
        const position = { x: 0, y: 0.5, z: 0 };
        const desired = { x: 10, y: 0.5, z: 0 };

        const defaultResult = constraint.apply(position, desired);
        const explicitDefaultResult = constraint.apply(position, desired, { avatarRadius: AVATAR_COLLISION_RADIUS });
        assert(defaultResult.collided === true && defaultResult.position.x === explicitDefaultResult.position.x,
            '5. omitting `avatarRadius` reproduces the avatar\'s own existing radius exactly, byte for byte');

        const bicycleRadius = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).collisionRadius;
        const wideResult = constraint.apply(position, desired, { avatarRadius: bicycleRadius });
        assert(wideResult.collided === true, '6. a mounted BICYCLE\'s own wider radius still collides with the same real brick');
        assert(wideResult.position.x < defaultResult.position.x,
            '7. THE SEAM ITSELF, for building/brick collision: BICYCLE\'s own wider collisionRadius stops it farther from the SAME real brick than the walking avatar\'s own smaller radius');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarVehicleMovementController.js: the
    // actual collision-constraint composition seam.
    // -------------------------------------------------------------
    const bicycleCapability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
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
    function bicycle(id, position) {
        return new VehicleInstance({ id, type: VehicleType.BICYCLE, spawnPosition: position, position });
    }
    const FORWARD_INTENT = Object.freeze({ direction: 1, turnAxis: 0, running: false, brakingRequested: false });

    {
        // A fake movementConstraint recording exactly what it was called
        // with, and unconditionally clamping X/Z back to the CURRENT
        // position — a deterministic "always blocked" obstacle, so this
        // section proves the WIRING (order, argument shape, which
        // position gets committed) rather than depending on real
        // terrain height lining up with a synthetic brick's own Y span.
        const calls = [];
        const blockingConstraint = {
            apply(position, desired, options) {
                calls.push({ position, desired, options });
                return { position: { x: position.x, y: desired.y, z: position.z }, collided: true };
            }
        };
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore(bicycle('vehicle:c1', spawn));
        const controller = new AvatarVehicleMovementController(store, blockingConstraint, null);

        const result = controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c1', capability: bicycleCapability,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.5
        });

        assert(calls.length === 1, '8. movementConstraint.apply() was called exactly once per tick');
        assert(calls[0].options.avatarRadius === bicycleCapability.collisionRadius,
            '9. THE SEAM ITSELF: the constraint was handed the vehicle\'s own capability.collisionRadius — never a hardcoded avatar radius, never undefined');
        assert(result.vehicleInstance.position.x === spawn.x && result.vehicleInstance.position.z === spawn.z,
            '10. a movementConstraint reporting collided:true genuinely stops the vehicle at the pre-collision position — the simulated forward step never reaches the store');
        assert(controller.isCollided() === true, '11. isCollided() reports the movementConstraint\'s own collided flag');
        assert(controller.isCollidedWithTree() === false, '12. isCollidedWithTree() stays false — no treeConstraint was even wired for this controller');
        assert(result.vehicleInstance.heading === 0, '12b. 0.9.123 — heading stays at its neutral default: a fully-blocked tick never achieved a different horizontal position');
    }

    {
        // Ordering: movementConstraint (building/brick) runs FIRST, its
        // OWN output position is what treeConstraint (tree) then
        // receives as `desiredPosition` — never the raw, pre-constraint
        // simulated position, and never the other order.
        const seenByTree = [];
        const passthroughBuilding = {
            apply(position, desired) { return { position: { x: desired.x - 1, y: desired.y, z: desired.z }, collided: true }; }
        };
        const recordingTree = {
            apply(position, desired, options) {
                seenByTree.push({ desired, options });
                return { position: desired, collided: false };
            }
        };
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore(bicycle('vehicle:c2', spawn));
        const controller = new AvatarVehicleMovementController(store, passthroughBuilding, recordingTree);
        const result = controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c2', capability: bicycleCapability,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.5
        });
        assert(seenByTree.length === 1, '13. treeConstraint.apply() was also called exactly once');
        assert(seenByTree[0].desired.x === result.vehicleInstance.position.x,
            '14. THE ORDERING SEAM: treeConstraint received building collision\'s OWN already-adjusted position as its desiredPosition — building first, tree last, matching AvatarMovementController\'s own existing pipeline order');
        assert(seenByTree[0].options.avatarRadius === bicycleCapability.collisionRadius,
            '15. treeConstraint was ALSO handed the vehicle\'s own capability.collisionRadius — the identical radius, never two independently-resolved values');
    }

    {
        // No constraints wired at all — the exact positional
        // `new AvatarVehicleMovementController(store)` call every
        // pre-0.9.119 caller (including tests/AvatarVehicleMovementController.test.js
        // itself) already uses — must behave byte-for-byte as it did
        // before this milestone: unobstructed forward movement, no
        // throw, isCollided()/isCollidedWithTree() both stay false.
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore(bicycle('vehicle:c3', spawn));
        const controller = new AvatarVehicleMovementController(store);
        const result = controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c3', capability: bicycleCapability,
            movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.5
        });
        assert(result.vehicleInstance.position.z > spawn.z,
            '16. REGRESSION: a controller built without either constraint (the pre-0.9.119 call shape) still moves forward completely unobstructed');
        assert(controller.isCollided() === false && controller.isCollidedWithTree() === false,
            '17. ...and both new debug flags default to false when no constraint was ever wired');
    }

    {
        // Repeated blocked movement never penetrates — many ticks held
        // against the SAME always-blocking constraint never drift the
        // committed position past what the very first blocked tick
        // already produced.
        const blockingConstraint = { apply(position) { return { position: { x: position.x, y: position.y, z: position.z }, collided: true }; } };
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore(bicycle('vehicle:c4', spawn));
        const controller = new AvatarVehicleMovementController(store, blockingConstraint, null);
        let lastZ = null;
        for (let i = 0; i < 50; i++) {
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c4', capability: bicycleCapability,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            if (lastZ !== null) {
                assert(result.vehicleInstance.position.z === lastZ,
                    `18.${i} repeated blocked movement never advances past the same clamped position — frame ${i}`);
            }
            lastZ = result.vehicleInstance.position.z;
        }
        assert(store._current().spawnPosition.x === spawn.x && store._current().spawnPosition.z === spawn.z,
            '19. spawnPosition is untouched by 50 ticks of collision-blocked movement');
    }

    {
        // Unsupported vehicle types (defense in depth, unaffected by
        // this milestone): even with both constraints wired, a
        // MOTORCYCLE/CAR/DRONE is still never moved at all — canMove()'s
        // own gate runs before either constraint is ever consulted.
        const blockingConstraint = { apply() { throw new Error('must never be called for an unsupported vehicle type'); } };
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            const spawn = { x: 3, y: 0, z: 3 };
            const instance = new VehicleInstance({ id: `vehicle:c5-${type}`, type, spawnPosition: spawn, position: spawn });
            const store = fakeVehicleStore(instance);
            const controller = new AvatarVehicleMovementController(store, blockingConstraint, blockingConstraint);
            const capability = resolveAvatarVehicleMovementCapability(type);
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: instance.id, capability, movementIntent: FORWARD_INTENT,
                currentRotationY: 0, deltaSeconds: 0.5
            });
            assert(result === null, `20.${type} an unsupported vehicle type still returns null — neither constraint is ever reached, let alone called`);
        }
    }

    // -------------------------------------------------------------
    // Section D — application/WorldNavigationSession.js: end to end,
    // real fixture bicycle, real tree, real dismount, real on-foot
    // avatar.
    // -------------------------------------------------------------
    const registry = buildRegistry();
    const realVehicle = findRealVehicle();
    {
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'wcol-d1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        fireFrame(session, 0.016);
        mountRealVehicle(session);

        let everCollidedWithTree = false;
        session.avatarKeyDown('w');
        for (let i = 0; i < 80; i++) {
            fireFrame(session, 0.05);
            if (session._avatarVehicleMovementController.isCollidedWithTree()) everCollidedWithTree = true;
        }
        session.avatarKeyUp('w');

        assert(everCollidedWithTree === true,
            '21. FLAGSHIP: riding the real fixture bicycle straight ahead genuinely collides with a real tree along its path at least once');

        const vehiclePosition = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
        const nearbyTrees = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, vehiclePosition.x - 5, vehiclePosition.z - 5, vehiclePosition.x + 5, vehiclePosition.z + 5);
        const bicycleRadius = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).collisionRadius;
        for (const tree of nearbyTrees) {
            const distance = Math.hypot(vehiclePosition.x - tree.center.x, vehiclePosition.z - tree.center.z);
            assert(distance >= bicycleRadius + tree.radius - 1e-6,
                `22. THE CORE INVARIANT: the bicycle's final position never overlaps real tree at (${tree.center.x.toFixed(2)}, ${tree.center.z.toFixed(2)}) — distance ${distance.toFixed(4)} >= combined radius ${(bicycleRadius + tree.radius).toFixed(4)}`);
        }

        const avatarPosition = avatarPresenceSession.current.position;
        assert(avatarPosition.x === vehiclePosition.x && avatarPosition.z === vehiclePosition.z,
            '23. AVATAR FOLLOWS THE CONSTRAINED POSITION: the avatar never ends up standing anywhere the vehicle itself was not actually allowed to go — no separate, pre-collision position ever reaches AvatarPresence');
    }

    {
        // Clear-path regression: away from every tree, ordinary bicycle
        // movement still covers real, unobstructed ground exactly as
        // 0.9.116 already established — this milestone changes nothing
        // about movement where nothing blocks it.
        const clearId = 'vehicle:test-clear-119';
        const clearSpawn = { x: 50000, y: 0, z: 50000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'wcol-d2', new Position(clearSpawn.x, 0, clearSpawn.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._vehicleRuntimeInstances._instances.set(clearId, new VehicleInstance({ id: clearId, type: VehicleType.BICYCLE, spawnPosition: clearSpawn, position: clearSpawn }));
        session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(clearId);

        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) fireFrame(session, 0.05);
        session.avatarKeyUp('w');

        const finalPosition = session._vehicleRuntimeInstances.get(clearId).position;
        assert(finalPosition.z > clearSpawn.z + 3,
            '24. REGRESSION: unobstructed vehicle movement still covers substantial real ground — collision constraints never slow down or alter a genuinely clear path');
        assert(session._avatarVehicleMovementController.isCollided() === false && session._avatarVehicleMovementController.isCollidedWithTree() === false,
            '25. ...and neither collision flag was ever raised for a clear path');
    }

    {
        // On-foot regression: sharing the SAME movementConstraint/
        // treeConstraint instances between the avatar and the vehicle
        // controller must never change ordinary, unmounted walking —
        // an avatar walking toward the SAME isolated real tree still
        // stops at exactly ITS OWN (smaller, AVATAR_COLLISION_RADIUS)
        // combined radius, never the bicycle's own.
        const isolatedTree = findIsolatedTree();
        const startZ = isolatedTree.center.z - (isolatedTree.radius + AVATAR_COLLISION_RADIUS + 6);
        const start = new Position(isolatedTree.center.x, 0, startZ);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'wcol-d3', start);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        assert(session.avatarVehicleMount() === null, '26. sanity: never mounted — this is ordinary on-foot movement');

        session.avatarKeyDown('w');
        for (let i = 0; i < 300; i++) fireFrame(session, 0.05);
        session.avatarKeyUp('w');

        const finalPosition = avatarPresenceSession.current.position;
        const distanceToTree = Math.hypot(finalPosition.x - isolatedTree.center.x, finalPosition.z - isolatedTree.center.z);
        const expectedCombined = AVATAR_COLLISION_RADIUS + isolatedTree.radius;
        assert(Math.abs(distanceToTree - expectedCombined) < 1e-6,
            '27. REGRESSION: an unmounted, walking avatar still stops at exactly its OWN (AVATAR_COLLISION_RADIUS) combined radius from a real tree — sharing the constraint instance with vehicle movement never leaks a vehicle\'s own wider radius into ordinary on-foot collision');
    }

    // -------------------------------------------------------------
    // Section E — architectural regression.
    // -------------------------------------------------------------
    {
        const forbidden = [
            'VehicleCollisionController', 'VehicleCollisionResolver', 'VehicleTreeCollision',
            'BicycleCollisionController', 'CarCollisionController', 'MotorcycleCollisionController',
            'OrientedBoundingBox', 'RectangularFootprint', 'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'vehicle-vs-vehicle', 'vehicleVsVehicle'
        ];
        for (const path of [
            '../application/AvatarVehicleMovementController.js',
            '../application/AvatarMovementConstraint.js',
            '../core/AvatarCollision.js'
        ]) {
            const codeOnly = await sourceOf(path);
            for (const term of forbidden) {
                assert(!codeOnly.includes(term), `28. ${path} never references "${term}" — one shared collision system, parameterized by radius, never a second one`);
            }
        }

        const controllerSource = await sourceOf('../application/AvatarVehicleMovementController.js');
        assert((controllerSource.match(/capability\.collisionRadius/g) || []).length >= 2,
            '29. AvatarVehicleMovementController.js hands capability.collisionRadius to BOTH constraints — never a hardcoded radius for either');

        const sessionSource = await sourceOf('../application/WorldNavigationSession.js');
        assert(sessionSource.includes('new AvatarVehicleMovementController(') && sessionSource.includes('movementConstraint,') && sessionSource.includes('treeConstraint'),
            '30. WorldNavigationSession.js wires movementConstraint/treeConstraint into AvatarVehicleMovementController — never a second, vehicle-only pair of constraint instances');
    }

    console.log('✅ All Vehicle–World Collision Constraint tests passed.');
}

await runTests();
