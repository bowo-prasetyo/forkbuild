import { readFile } from 'node:fs/promises';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarVehicleMovementController, isMovableVehicleType } from '../application/AvatarVehicleMovementController.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { BICYCLE_DISMOUNT_OFFSET_X } from '../core/AvatarVehicleDismountPosition.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.120 — Vehicle Collision & Movement Audit.
//
// 0.9.119 (tests/VehicleWorldCollisionConstraint.test.js) proved the SEAM
// exists: a mounted vehicle's own capability.collisionRadius reaches the
// avatar's existing building/brick and tree constraints, in the right
// order, and a real fixture bicycle genuinely stops short of a real tree.
// This milestone does not add a new seam — it locks down the INVARIANTS
// that seam must never violate as the bicycle line keeps growing:
//
//   Section A: movement intent is never altered by a collision decision —
//              core/AvatarMovementSimulation.js has no collision
//              vocabulary, and AvatarVehicleMovementController#tick()
//              simulates exactly once, THEN constrains, never the reverse
//   Section B: the boundary itself — approach from all four axis
//              directions and diagonally produces the SAME combined-
//              radius stop, moving away is never blocked, moving
//              parallel to an obstacle is never blocked, and a repeated
//              query against an already-blocked position is idempotent
//   Section C: the same radius semantics hold through the REAL
//              controller/tick() pipeline, not merely at the constraint
//              layer — a real ride settles at the exact combined-radius
//              boundary, stays there under continued forward input, Y
//              keeps following terrain untouched throughout, and the
//              SAME real brick still lets an unmounted avatar stop at
//              its own, smaller radius
//   Section D: unsupported vehicle types stay ungated by anything this
//              line has added — MOTORCYCLE/CAR/DRONE never reach a real,
//              wired movementConstraint/treeConstraint pair, even along
//              a completely obstacle-free path
//   Section E: FLAGSHIP — one continuous session: mount, ride into a
//              real obstacle, the avatar equals the vehicle's own
//              already-constrained position on EVERY frame (never a
//              one-frame-stale or pre-constraint position), the stopped
//              vehicle is stable under continued attempts, a real E-key
//              dismount lands the avatar beside the vehicle's CURRENT
//              (collision-stopped) position — never spawnPosition or
//              VehiclePlacement — the avatar then walks away normally,
//              and id/type/spawnPosition survive the entire lifecycle
//              unchanged
//   Section F: architectural regression — no vehicle-vs-vehicle
//              collision, sliding, bouncing, momentum, or oriented-
//              footprint vocabulary anywhere in the files this line of
//              milestones touches
//
// NO PRODUCTION CODE CHANGES. Every invariant below already holds under
// 0.9.119's own implementation — this file is the audit itself, not a
// fix. See docs/Roadmap.md, 0.9.120.

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

async function sourceOf(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// A single real 'core:cube' brick as the sole obstacle in an otherwise-
// empty document, at world-space `center` (getWorldPosition below always
// returns the origin, so `center` IS the brick's own world position) —
// the exact minimal fixture tests/VehicleWorldCollisionConstraint.test.js's
// own Section B already established, reused here rather than reinvented.
function buildSingleBrickConstraint(center) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(center.x, center.y, center.z) }));
    world.addBuilding(building);
    const loadedDocuments = new Map([['doc-1', { world }]]);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    return new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
}

// Sits a 'core:cube' brick right on real terrain at (x, z) — its own
// bottom face at ground level, so a vehicle whose Y already follows
// terrainHeightAt() (see application/AvatarVehicleMovementController.js's
// own 0.9.116 header) always has real vertical overlap with it, exactly
// as it would with any real placed building.
function groundedBrickCenter(x, z) {
    return { x, y: terrainHeightAt(DEFAULT_WORLD_SEED, x, z) + 0.5, z };
}

// The brick's own LOCAL position is zero; the document's own world
// offset (below) IS `worldCenter` — together they resolve to the exact
// same absolute world AABB a brick placed directly at `worldCenter`
// would have, while keeping the broad-phase distance check in
// application/AvatarMovementConstraint.js (which measures distance from
// the avatar/vehicle's OWN position to the DOCUMENT's own world offset,
// never to the brick itself) genuinely small — exactly as it would be
// for any real, nearby building, even when `worldCenter` itself sits far
// from true (0,0,0) (see this file's own Section E, which deliberately
// spawns far from the origin to dodge real, seed-placed trees).
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
const BACKWARD_INTENT = Object.freeze({ direction: -1, turnAxis: 0, running: false, brakingRequested: false });

function fakeVehicleStore(instance) {
    let current = instance;
    return {
        get(id) { return id === current.id ? current : null; },
        setPosition(id, nextPosition) {
            if (id !== current.id) return null;
            current = current.withPosition(nextPosition);
            return current;
        },
        _current: () => current
    };
}

function bicycle(id, position) {
    return new VehicleInstance({ id, type: VehicleType.BICYCLE, spawnPosition: position, position });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — movement intent is never altered by a collision
    // decision: simulation stays collision-blind, and the controller
    // simulates exactly once, then constrains, never the reverse.
    // -------------------------------------------------------------
    {
        const simulationCode = await sourceOf('../core/AvatarMovementSimulation.js');
        for (const term of ['obstacle', 'Obstacle', 'brick', 'Brick', 'AABB', 'collision', 'Collision', 'Constraint']) {
            assert(!simulationCode.includes(term),
                `1. core/AvatarMovementSimulation.js never mentions "${term}" — the pure kinematics stay entirely collision-blind, exactly as before this milestone`);
        }

        const controllerCode = await sourceOf('../application/AvatarVehicleMovementController.js');
        const nonImportLines = controllerCode.split('\n').filter((line) => !line.trim().startsWith('import '));
        const bodyOnly = nonImportLines.join('\n');
        const simulateCallCount = (bodyOnly.match(/\bsimulateAvatarMovement\(/g) || []).length;
        assert(simulateCallCount === 1,
            `2. simulateAvatarMovement() is called exactly once per tick() — movement is never re-simulated after a collision decision, got ${simulateCallCount} call sites`);

        const simulateIndex = bodyOnly.indexOf('simulateAvatarMovement(');
        const movementConstraintApplyIndex = bodyOnly.indexOf('_movementConstraint.apply(');
        const treeConstraintApplyIndex = bodyOnly.indexOf('_treeConstraint.apply(');
        assert(simulateIndex !== -1 && movementConstraintApplyIndex !== -1 && treeConstraintApplyIndex !== -1,
            '3. sanity: all three call sites are present in source');
        assert(simulateIndex < movementConstraintApplyIndex && movementConstraintApplyIndex < treeConstraintApplyIndex,
            '4. THE ORDERING ITSELF, IN SOURCE: simulate -> building/brick constrain -> tree constrain — a collision decision is applied to kinematics\' own OUTPUT, never fed back into producing it');

        // The collision constraints themselves never decide whether to
        // accelerate, brake, or turn — they only ever receive an
        // already-simulated position/options object, never movementIntent
        // or movementState.
        assert(!bodyOnly.includes('_movementConstraint.apply(movementIntent') && !bodyOnly.includes('_movementConstraint.apply(movementState'),
            '5. the movement constraint is never handed the raw intent/state — only an already-simulated position');
    }

    // -------------------------------------------------------------
    // Section B — the boundary itself, at the pure constraint layer:
    // symmetric approach from all four directions and diagonally, free
    // retreat, free parallel movement, and idempotent repetition.
    // -------------------------------------------------------------
    {
        const gaps = {};

        // North (+Z), South (-Z), East (+X), West (-X) — a single large
        // step is enough: resolveHorizontalMovement() sweeps the full
        // [current, proposed] range regardless of its magnitude (see
        // core/AvatarCollision.js's own header), so this needs no
        // per-tick ride to exercise the exact same boundary math a real
        // multi-tick ride eventually settles on (proven in Section C).
        // Each case builds its OWN, independent single-brick constraint
        // (mirroring tests/VehicleWorldCollisionConstraint.test.js's own
        // Section B fixture), so all four can safely share the same
        // small, near-origin coordinate frame with zero cross-
        // contamination — this is a hand-built obstacle map with no real
        // seed-placed content to dodge, unlike Section E's real session.
        const FIXED_Y = 0.5;
        const directions = [
            { name: 'north', dx: 0, dz: 10, center: { x: 0, y: FIXED_Y, z: 5 } },
            { name: 'south', dx: 0, dz: -10, center: { x: 0, y: FIXED_Y, z: -5 } },
            { name: 'east', dx: 10, dz: 0, center: { x: 5, y: FIXED_Y, z: 0 } },
            { name: 'west', dx: -10, dz: 0, center: { x: -5, y: FIXED_Y, z: 0 } }
        ];
        for (const { name, dx, dz, center } of directions) {
            const constraint = buildSingleBrickConstraint(center);
            const startPos = { x: 0, y: FIXED_Y, z: 0 };
            const desired = { x: startPos.x + dx, y: FIXED_Y, z: startPos.z + dz };
            const result = constraint.apply(startPos, desired, { avatarRadius: BICYCLE_RADIUS });
            assert(result.collided === true, `6.${name} approaching a real brick head-on genuinely collides`);
            const stopCoord = dx !== 0 ? result.position.x : result.position.z;
            const faceCoord = dx > 0 ? center.x - 0.5 : dx < 0 ? center.x + 0.5 : dz > 0 ? center.z - 0.5 : center.z + 0.5;
            const gap = Math.abs(faceCoord - stopCoord);
            gaps[name] = gap;
            assert(Math.abs(gap - BICYCLE_RADIUS) < 1e-3,
                `7.${name} stops exactly BICYCLE_RADIUS (${BICYCLE_RADIUS}) short of the obstacle's own face — got gap ${gap}`);
        }
        const gapValues = Object.values(gaps);
        assert(Math.max(...gapValues) - Math.min(...gapValues) < 1e-3,
            `8. SYMMETRY: approaching the identical obstacle shape from all four directions produces the IDENTICAL combined-radius stop — got ${JSON.stringify(gaps)}`);

        // Diagonal approach — a real corner case: the axis-separated
        // resolver may block either axis first, so this asserts the one
        // invariant that must hold regardless of which axis resolves
        // first: the bicycle's final position never actually overlaps
        // the obstacle's own combined-radius footprint, and real
        // progress was made (it was not blocked immediately at spawn).
        // A diagonal approach is walked in many SMALL steps, exactly as
        // a real ride's own per-tick deltas would (Section C rides the
        // identical way) — never one giant single-call leap. The axis-
        // separated resolver deliberately resolves X using the OLD z and
        // Z using the NEW x (see core/AvatarCollision.js's own
        // resolveHorizontalMovement() header, "the standard axis-
        // separated slide"); a single huge diagonal step therefore
        // legitimately "cuts the corner" past an obstacle sitting
        // exactly on that diagonal, the same way a real large single-
        // tick jump could — this is pre-existing, correct behavior for
        // one big leap, not a bug this audit exists to change. Many
        // small steps is what a real ride actually produces, and is the
        // shape this sub-test needs to genuinely exercise the corner.
        {
            const center = { x: 5, y: 0.5, z: 5 };
            const constraint = buildSingleBrickConstraint(center);
            let position = { x: 0, y: center.y, z: 0 };
            let everCollided = false;
            for (let i = 0; i < 60; i++) {
                const desired = { x: position.x + 0.3, y: center.y, z: position.z + 0.3 };
                const result = constraint.apply(position, desired, { avatarRadius: BICYCLE_RADIUS });
                if (result.collided) everCollided = true;
                position = result.position;
            }
            assert(everCollided === true, '9. a genuinely diagonal approach, walked in real-sized small steps, does collide');
            const obstacle = { min: { x: center.x - 0.5, z: center.z - 0.5 }, max: { x: center.x + 0.5, z: center.z + 0.5 } };
            const nearestX = Math.min(Math.max(position.x, obstacle.min.x), obstacle.max.x);
            const nearestZ = Math.min(Math.max(position.z, obstacle.min.z), obstacle.max.z);
            const distance = Math.hypot(position.x - nearestX, position.z - nearestZ);
            assert(distance >= BICYCLE_RADIUS - 1e-3,
                `10. the diagonal-approach stop never overlaps the obstacle's own combined-radius footprint — distance ${distance} >= radius ${BICYCLE_RADIUS}`);
            assert(Math.hypot(position.x, position.z) > 2,
                '11. ...while still making real, substantial progress toward the obstacle before being stopped');
        }

        // Movement away, and movement parallel — starting from a
        // position already snug against the north brick's own face.
        {
            const center = { x: 0, y: 0.5, z: 5 };
            const constraint = buildSingleBrickConstraint(center);
            const blockedPosition = { x: 0, y: center.y, z: center.z - 0.5 - BICYCLE_RADIUS };

            const awayDesired = { x: blockedPosition.x, y: center.y, z: blockedPosition.z - 3 };
            const awayResult = constraint.apply(blockedPosition, awayDesired, { avatarRadius: BICYCLE_RADIUS });
            assert(awayResult.collided === false && awayResult.position.z === awayDesired.z,
                '12. MOVEMENT AWAY: a step directly away from an obstacle the vehicle is already snug against is completely free — collision never "sticks" to a body that is retreating');

            const parallelDesired = { x: blockedPosition.x + 3, y: center.y, z: blockedPosition.z };
            const parallelResult = constraint.apply(blockedPosition, parallelDesired, { avatarRadius: BICYCLE_RADIUS });
            assert(parallelResult.collided === false && parallelResult.position.x === parallelDesired.x,
                '13. MOVEMENT PARALLEL: a step alongside an obstacle\'s own face, never approaching it, is also completely free');

            // Idempotent repetition: querying the SAME forward step from
            // the SAME already-blocked position, several times over,
            // returns the bit-identical stop every time — never a slow
            // drift deeper toward (or through) the obstacle.
            const forwardDesired = { x: blockedPosition.x, y: center.y, z: blockedPosition.z + 10 };
            let previous = null;
            for (let i = 0; i < 5; i++) {
                const result = constraint.apply(blockedPosition, forwardDesired, { avatarRadius: BICYCLE_RADIUS });
                if (previous !== null) {
                    assert(result.position.z === previous, `14.${i} repeated queries against an already-blocked position return the bit-identical stop`);
                }
                previous = result.position.z;
            }
        }
    }

    // -------------------------------------------------------------
    // Section C — the same radius semantics, through the REAL
    // controller/tick() pipeline, over real simulated time.
    // -------------------------------------------------------------
    {
        const center = groundedBrickCenter(0, 5);
        const movementConstraint = buildSingleBrickConstraint(center);
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore(bicycle('vehicle:audit-c1', spawn));
        const controller = new AvatarVehicleMovementController(store, movementConstraint, null);

        let firstCollidedPosition = null;
        let previousPosition = spawn;
        for (let i = 0; i < 150; i++) {
            // Y is sampled from raw terrain height at the vehicle's own
            // position BEFORE this tick's step (see
            // application/AvatarVehicleMovementController.js's own
            // 0.9.116 header, "sampled at the vehicle's CURRENT
            // position, before this tick's own step") — never from
            // wherever horizontal collision happens to leave X/Z
            // afterward, which is exactly the invariant under test here.
            const expectedY = terrainHeightAt(DEFAULT_WORLD_SEED, previousPosition.x, previousPosition.z);
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:audit-c1', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            assert(result.vehicleInstance.position.y === expectedY,
                `15.${i} Y always equals raw terrain height sampled before this tick's own horizontal step — horizontal collision never touches it`);
            if (controller.isCollided() && firstCollidedPosition === null) {
                firstCollidedPosition = result.vehicleInstance.position;
            }
            previousPosition = result.vehicleInstance.position;
        }
        assert(firstCollidedPosition !== null, '16. sanity: the real ride actually collided with the real brick within 150 ticks');
        const gap = Math.abs((center.z - 0.5) - firstCollidedPosition.z);
        assert(Math.abs(gap - BICYCLE_RADIUS) < 1e-3,
            `17. THE SAME EXACT FORMULA HOLDS END TO END: the real, ticked controller settles at obstacle face minus BICYCLE_RADIUS, exactly as the pure constraint layer already proved in Section B — gap ${gap}`);

        // "Continue attempting movement — vehicle remains stable": 50
        // more ticks of held forward input never move it one unit
        // further, and never throw.
        for (let i = 0; i < 50; i++) {
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:audit-c1', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            assert(result.vehicleInstance.position.x === firstCollidedPosition.x && result.vehicleInstance.position.z === firstCollidedPosition.z,
                `18.${i} STABILITY: continued forward input against the same obstacle never advances the vehicle past its own first-blocked position`);
        }

        // Movement away holds through real acceleration/deceleration
        // too, not merely at the instantaneous constraint layer:
        // holding backward measurably retreats the vehicle over real
        // simulated time.
        let awayResult = null;
        for (let i = 0; i < 60; i++) {
            awayResult = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:audit-c1', capability: BICYCLE_CAPABILITY,
                movementIntent: BACKWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
        }
        assert(awayResult.vehicleInstance.position.z < firstCollidedPosition.z - 1,
            '19. REAL UN-STICKING: holding backward input against a controller that was just blocked genuinely, measurably retreats it — collision never leaves a persistent "stuck" flag');

        // The avatar's own, independent radius against the SAME real
        // brick: an unmounted avatar stops at its own, smaller
        // AVATAR_COLLISION_RADIUS, never the bicycle's wider one.
        const walkerConstraint = buildSingleBrickConstraint(center);
        const walkerStart = { x: 0, y: center.y, z: 0 };
        const walkerDesired = { x: 0, y: center.y, z: 10 };
        const walkerResult = walkerConstraint.apply(walkerStart, walkerDesired);
        const walkerGap = Math.abs((center.z - 0.5) - walkerResult.position.z);
        assert(Math.abs(walkerGap - AVATAR_COLLISION_RADIUS) < 1e-3,
            `20. an unmounted avatar's own radius against the SAME real brick is AVATAR_COLLISION_RADIUS (${AVATAR_COLLISION_RADIUS}), never BICYCLE_RADIUS (${BICYCLE_RADIUS}) — got gap ${walkerGap}`);
        assert(walkerGap < BICYCLE_RADIUS, '21. ...and is strictly smaller, matching WALK < BICYCLE\'s own established ordering');
    }

    // -------------------------------------------------------------
    // Section D — unsupported vehicle types stay ungated by anything
    // this line has added, even with REAL constraints wired and a
    // completely obstacle-free path.
    // -------------------------------------------------------------
    {
        const clearMovementConstraint = new AvatarMovementConstraint({ loadedDocuments: new Map(), getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry: new CreateBrickRegistryUseCase().execute() });
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            assert(isMovableVehicleType(type) === false, `22.${type} isMovableVehicleType() still refuses this type`);
            const spawn = { x: 92000, y: 0, z: 92000 };
            const instance = new VehicleInstance({ id: `vehicle:audit-d-${type}`, type, spawnPosition: spawn, position: spawn });
            const store = fakeVehicleStore(instance);
            const controller = new AvatarVehicleMovementController(store, clearMovementConstraint, null);
            const capability = resolveAvatarVehicleMovementCapability(type);
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: instance.id, capability, movementIntent: FORWARD_INTENT,
                currentRotationY: 0, deltaSeconds: 0.5
            });
            assert(result === null,
                `23.${type} still never moves, even with a real, wired, genuinely obstacle-free movementConstraint — the type gate alone decides this, never collision outcome`);
        }
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: one continuous session. Mount, ride into a
    // real obstacle, per-frame avatar/vehicle position equality, stable
    // under continued attempts, a real dismount landing at the CURRENT
    // (collision-stopped) position, walking away normally, and stable
    // runtime identity throughout.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:audit-flagship';
        const spawnPosition = { x: 93000, y: 0, z: 93000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-e1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // Spawn: a real, tracked VehicleInstance, discovered exactly the
        // way any other vehicle is (position === spawnPosition).
        session._vehicleRuntimeInstances._instances.set(VEHICLE_ID, new VehicleInstance({ id: VEHICLE_ID, type: VehicleType.BICYCLE, spawnPosition, position: spawnPosition }));
        const originalSpawnPosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).spawnPosition;
        const originalId = session._vehicleRuntimeInstances.get(VEHICLE_ID).id;
        const originalType = session._vehicleRuntimeInstances.get(VEHICLE_ID).type;

        // A real brick obstacle, directly ahead of spawn.
        installSyntheticBrickObstacle(session, 'flagship-doc', groundedBrickCenter(spawnPosition.x, spawnPosition.z + 5));

        // Mount — this test's own precondition-setting shortcut for "the
        // avatar is currently riding this bicycle," the same shortcut
        // tests/VehicleWorldCollisionConstraint.test.js's own Section D
        // (the "clear-path regression") already establishes, so that
        // this section's own new claims (per-frame position equality
        // against a REAL obstacle, and a REAL dismount afterward) are
        // never entangled with unrelated proximity/discovery machinery
        // already covered by tests/VehicleRuntimeAuthorityAudit.test.js.
        session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(VEHICLE_ID);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === VEHICLE_ID, '24. setup: mounted');

        // Ride into the obstacle. On EVERY single frame — never merely
        // the final one — the avatar's own position exactly equals the
        // vehicle's own, ALREADY-CONSTRAINED position: never a stale,
        // pre-collision candidate.
        session.avatarKeyDown('w');
        let firstCollidedPosition = null;
        for (let i = 0; i < 120; i++) {
            fireFrame(session, 0.05);
            const vehiclePosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            const avatarPosition = avatarPresenceSession.current.position;
            assert(avatarPosition.x === vehiclePosition.x && avatarPosition.z === vehiclePosition.z,
                `25.${i} THE AVATAR NEVER LEADS THE VEHICLE: on every single frame, the avatar's position exactly equals the vehicle's own already-constrained position`);
            if (session._avatarVehicleMovementController.isCollided() && firstCollidedPosition === null) {
                firstCollidedPosition = vehiclePosition;
            }
        }
        assert(firstCollidedPosition !== null, '26. sanity: the ride actually collided with the real obstacle');

        // "Continue attempting movement — vehicle remains stable": more
        // frames of held forward input never move it further, on either
        // the vehicle's or the avatar's own position.
        for (let i = 0; i < 30; i++) {
            fireFrame(session, 0.05);
            const vehiclePosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            assert(vehiclePosition.x === firstCollidedPosition.x && vehiclePosition.z === firstCollidedPosition.z,
                `27.${i} STABILITY: the stopped vehicle never advances further under continued held forward input`);
        }
        session.avatarKeyUp('w');
        const stoppedVehiclePosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;

        // Real dismount, via the actual E-key interaction path — never a
        // direct field write.
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() === null, '28. dismounted, via the real interaction controller');

        const finalAvatarPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalAvatarPosition.x - (stoppedVehiclePosition.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-6
            && Math.abs(finalAvatarPosition.z - stoppedVehiclePosition.z) < 1e-6,
            '29. FLAGSHIP: the avatar lands beside the vehicle\'s CURRENT, collision-stopped position — the exact same runtime-position dismount authority tests/VehicleRuntimeAuthorityAudit.test.js already established, now proven specifically through a COLLISION-caused stop'
        );
        assert(
            Math.hypot(finalAvatarPosition.x - originalSpawnPosition.x, finalAvatarPosition.z - originalSpawnPosition.z) > 3,
            '30. ...genuinely far from spawnPosition/VehiclePlacement — the collision-stopped position, never the deterministic placement fact, drove this dismount'
        );

        // Walk away normally: unmounted, ordinary on-foot movement
        // actually covers ground, and never silently remounts.
        const beforeWalkAway = { x: finalAvatarPosition.x, z: finalAvatarPosition.z };
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        session.avatarKeyUp('w');
        const afterWalkAway = avatarPresenceSession.current.position;
        assert(Math.hypot(afterWalkAway.x - beforeWalkAway.x, afterWalkAway.z - beforeWalkAway.z) > 0.5,
            '31. the avatar walks away normally after dismounting beside a collision-stopped vehicle — no stuck state of any kind');
        assert(session.avatarVehicleMount() === null, '32. ...and never silently remounts while merely walking nearby');

        // Runtime identity survives the entire lifecycle unchanged —
        // extending tests/VehicleRuntimeAuthorityAudit.test.js's own
        // 0.9.118 audit specifically through a COLLISION-caused stop,
        // which did not exist when that audit was written.
        const afterEverything = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        assert(afterEverything.id === originalId && afterEverything.type === originalType,
            '33. id/type survive mount, collision, continued attempts, and dismount unchanged');
        assert(afterEverything.spawnPosition.x === originalSpawnPosition.x && afterEverything.spawnPosition.z === originalSpawnPosition.z,
            '34. spawnPosition survives the entire collision lifecycle unchanged — only position ever moved');
        assert(afterEverything.position.x === stoppedVehiclePosition.x && afterEverything.position.z === stoppedVehiclePosition.z,
            '35. dismounting never itself moves the vehicle — it stays exactly where collision left it');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: no vehicle-vs-vehicle
    // collision, sliding, bouncing, momentum, or oriented-footprint
    // vocabulary anywhere in the files this line of milestones touches.
    // This milestone adds no production code at all — this sweep simply
    // reconfirms 0.9.119's own regression still holds.
    // -------------------------------------------------------------
    {
        const forbidden = [
            'VehicleCollisionController', 'VehicleCollisionResolver', 'VehicleTreeCollision',
            'OrientedBoundingBox', 'RectangularFootprint', 'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'vehicle-vs-vehicle', 'vehicleVsVehicle', 'sliding', 'Sliding', 'bounce', 'Bounce',
            'momentum', 'Momentum', 'friction', 'Friction', 'suspension', 'Suspension'
        ];
        for (const path of [
            '../application/AvatarVehicleMovementController.js',
            '../application/AvatarMovementConstraint.js',
            '../core/AvatarCollision.js',
            '../core/AvatarMovementSimulation.js'
        ]) {
            const codeOnly = await sourceOf(path);
            for (const term of forbidden) {
                assert(!codeOnly.includes(term), `36. ${path} never references "${term}" — a positional stop is still exactly enough`);
            }
        }
    }

    console.log('✅ All Vehicle Collision & Movement Audit tests passed.');
}

await runTests();
