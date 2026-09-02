import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTreeConstraint } from '../application/AvatarTreeConstraint.js';
import { VehicleType } from '../core/VehicleType.js';
import {
    AvatarMovementCapabilityKind,
    resolveAvatarVehicleMovementCapability
} from '../core/AvatarVehicleMovementCapability.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { treeCollisionCandidatesForMovement, CANDIDATE_QUERY_MARGIN, MAX_TREE_COLLISION_RADIUS } from '../core/AvatarTreeCollisionQuery.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.88 — Ground Vehicle Collision Footprint Capability.
//
// 0.9.87 (tests/AvatarPerVehicleGroundSpeedIntegration.test.js) proved a
// mounted ground vehicle covers ground at its own, per-vehicle speed —
// but left every vehicle collision-tested at the avatar's own 0.35-radius
// body, regardless of how fast, or how physically large, it actually was.
// This milestone closes that gap: `AvatarVehicleMovementCapability` now
// carries a `collisionRadius` (core/AvatarVehicleMovementCapability.js,
// 0.9.88) that reaches the SAME existing tree-collision pipeline
// (core/AvatarTreeCollisionQuery.js -> core/AvatarTreeMovement.js ->
// application/AvatarTreeConstraint.js -> application/AvatarMovementController.js)
// every other movement capability already reaches — never a second
// collision system, never a rectangular or oriented footprint, never a
// vehicle-specific movement controller.
//
//   Section A: capability values — exact collisionRadius per vehicle,
//              and WALK < BICYCLE < MOTORCYCLE < CAR
//   Section B: existing avatar regression — WALK's own collisionRadius
//              equals AVATAR_COLLISION_RADIUS, and an unmounted avatar's
//              tree-collision outcome is byte-identical whether a
//              capability was ever set at all
//   Section C: bicycle collision — a real tree collides a mounted
//              bicycle at a distance the avatar's own smaller radius
//              would have cleared
//   Section D: motorcycle vs bicycle — a single carefully-chosen
//              approach distance where BICYCLE passes clean and
//              MOTORCYCLE is blocked, proving the radius reaches the
//              collision pipeline, not merely storage
//   Section E: car — a distance where BICYCLE and MOTORCYCLE both pass
//              clean but CAR is blocked, by its own larger footprint
//              alone
//   Section F: candidate-query correctness — a tree just outside the
//              default (WALK-sized) candidate margin, but inside CAR's
//              own larger margin, is found once a car's own radius
//              reaches the query, never missed by a stale margin
//   Section G: switching — WALK -> BICYCLE -> MOTORCYCLE -> CAR -> WALK
//              on the SAME controller changes collision behavior
//              immediately, every tick, with no drift
//   Section H: speed unchanged — 0.9.87's own 3/6/9/12 movementSpeed
//              values are untouched by this milestone
//   Section I: drone — AERIAL_VEHICLE/DRONE remains fully blocked before
//              its own (inert) collisionRadius is ever consulted
//   Section J: architectural regression — no second collision system,
//              no rectangular/oriented footprint, no vehicle-specific
//              controller, anywhere in the files this milestone touches
//
// Central architectural claim under test throughout: PHYSICAL OCCUPANCY,
// like movement speed before it, is a CAPABILITY PARAMETER fed to the
// one existing tree-collision pipeline — never a second pipeline, never
// a per-vehicle collision algorithm. See docs/Roadmap.md, 0.9.88.

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

function buildAvatarStack(registry, username, initialPresence) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, initialPresence);
    return { avatarPresenceSession };
}

// A real, deterministic, genuinely ISOLATED tree under DEFAULT_WORLD_SEED
// — the single tree, among every real tree in a wide region, with the
// LARGEST distance to its own nearest neighboring tree. This world is
// densely planted (see core/NaturalFeatureField.js): most real trees sit
// well within reach of at least one neighbor once CAR's own larger
// collisionRadius (0.80) is added to the candidate-query margin, which
// would let this suite's own multi-tick approaches genuinely graze a
// SECOND tree partway through — real, correct sliding behavior, but a
// confound this suite's own "stops at exactly ITS OWN combined radius"
// assertions need to rule out. Picking the most isolated real tree in
// the region (never a synthetic one — see tests/AvatarTreeCollisionIntegration.test.js's
// own "always find a real tree" precedent) keeps every section below
// testing exactly the one thing it names: a single vehicle against a
// single tree.
function findIsolatedTree() {
    const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
    let mostIsolated = wide[0];
    let largestNearestNeighborDistance = -Infinity;
    for (const tree of wide) {
        let nearestNeighborDistance = Infinity;
        for (const other of wide) {
            if (other === tree) continue;
            const d = Math.hypot(other.center.x - tree.center.x, other.center.z - tree.center.z);
            if (d < nearestNeighborDistance) nearestNeighborDistance = d;
        }
        if (nearestNeighborDistance > largestNearestNeighborDistance) {
            largestNearestNeighborDistance = nearestNeighborDistance;
            mostIsolated = tree;
        }
    }
    return mostIsolated;
}

// Drives a real AvatarMovementController (with a real AvatarTreeConstraint
// wired in) forward (W held, facing +z, no turning) toward `desired`,
// starting from `start`, for `ticks` steps of `dt` seconds each, and
// returns the final resolved position plus whether a tree collision was
// ever reported.
function walkToward(vehicleType, start, dt, ticks) {
    const registry = buildRegistry();
    const { avatarPresenceSession } = buildAvatarStack(registry, `footprint-${vehicleType}-${Math.random()}`, { position: start, rotation: { y: 0 } });
    const treeConstraint = new AvatarTreeConstraint();
    const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
    controller.setMovementCapability(resolveAvatarVehicleMovementCapability(vehicleType));
    controller.keyDown('w');
    let everCollided = false;
    for (let i = 0; i < ticks; i++) {
        controller.tick(dt);
        if (controller.isCollidedWithTree()) everCollided = true;
    }
    controller.keyUp('w');
    const p = avatarPresenceSession.current.position;
    return { position: { x: p.x, y: p.y, z: p.z }, everCollided };
}

async function runTests() {
    const realTree = findIsolatedTree();

    // -------------------------------------------------------------
    // Section A — capability values
    // -------------------------------------------------------------
    {
        const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(walk.collisionRadius === 0.35, '1. WALK collisionRadius is exactly 0.35');
        assert(bicycle.collisionRadius === 0.45, '2. BICYCLE collisionRadius is exactly 0.45');
        assert(motorcycle.collisionRadius === 0.55, '3. MOTORCYCLE collisionRadius is exactly 0.55');
        assert(car.collisionRadius === 0.80, '4. CAR collisionRadius is exactly 0.80');
        assert(walk.collisionRadius < bicycle.collisionRadius
            && bicycle.collisionRadius < motorcycle.collisionRadius
            && motorcycle.collisionRadius < car.collisionRadius,
            '5. WALK < BICYCLE < MOTORCYCLE < CAR — the exact ordering this milestone exists to establish for physical occupancy');
    }

    // -------------------------------------------------------------
    // Section B — existing avatar regression
    // -------------------------------------------------------------
    {
        const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        assert(walk.collisionRadius === AVATAR_COLLISION_RADIUS,
            '6. WALK\'s own collisionRadius equals core/AvatarCollision.js\'s own AVATAR_COLLISION_RADIUS exactly — the avatar\'s own existing hitbox, byte for byte');
    }
    {
        // A controller that never had setMovementCapability() called at
        // all must resolve tree collision IDENTICALLY to a controller
        // explicitly given the WALK capability — the documented default.
        const startZ = realTree.center.z - (realTree.radius + AVATAR_COLLISION_RADIUS + 8);
        const start = { x: realTree.center.x, y: 0, z: startZ };

        const registryA = buildRegistry();
        const { avatarPresenceSession: sessionNoCapability } = buildAvatarStack(registryA, 'footprint-b1-none', { position: start, rotation: { y: 0 } });
        const controllerNoCapability = new AvatarMovementController(sessionNoCapability, null, null, null, new AvatarTreeConstraint());
        controllerNoCapability.keyDown('w');
        for (let i = 0; i < 300; i++) controllerNoCapability.tick(0.05);
        controllerNoCapability.keyUp('w');

        const registryB = buildRegistry();
        const { avatarPresenceSession: sessionWalk } = buildAvatarStack(registryB, 'footprint-b2-walk', { position: start, rotation: { y: 0 } });
        const controllerWalk = new AvatarMovementController(sessionWalk, null, null, null, new AvatarTreeConstraint());
        controllerWalk.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.NONE));
        controllerWalk.keyDown('w');
        for (let i = 0; i < 300; i++) controllerWalk.tick(0.05);
        controllerWalk.keyUp('w');

        assert(JSON.stringify(sessionNoCapability.current.position) === JSON.stringify(sessionWalk.current.position),
            '7. an unmounted avatar (no capability ever set) resolves a real tree approach to the exact byte-identical position as one explicitly holding the WALK capability — this milestone changes nothing about ordinary walking');
    }

    // -------------------------------------------------------------
    // Section C — bicycle collision
    // -------------------------------------------------------------
    {
        const bicycleRadius = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).collisionRadius;
        const start = { x: realTree.center.x, y: 0, z: realTree.center.z - (realTree.radius + bicycleRadius + 5) };
        const { position, everCollided } = walkToward(VehicleType.BICYCLE, start, 0.05, 300);
        assert(everCollided === true, '8. a mounted BICYCLE walking straight at a real tree is detected as a tree collision');
        const distToCenter = Math.hypot(position.x - realTree.center.x, position.z - realTree.center.z);
        const combined = bicycleRadius + realTree.radius;
        assert(distToCenter >= combined - 1e-6 && distToCenter < combined + 1e-2,
            '9. the bicycle stops at its OWN combined radius (bicycleRadius + tree.radius) from the tree\'s own center, never the avatar\'s own smaller 0.35 radius');
    }

    // -------------------------------------------------------------
    // Section D — motorcycle vs bicycle
    // -------------------------------------------------------------
    {
        const bicycleRadius = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).collisionRadius;
        const motorcycleRadius = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE).collisionRadius;
        const bicycleCombined = bicycleRadius + realTree.radius;
        const motorcycleCombined = motorcycleRadius + realTree.radius;
        // A single destination distance from the tree's own center,
        // strictly between the two combined radii: outside BICYCLE's own
        // combined radius (clears it) and inside MOTORCYCLE's own larger
        // combined radius (blocked by it).
        const gapDistance = (bicycleCombined + motorcycleCombined) / 2;
        assert(gapDistance > bicycleCombined && gapDistance < motorcycleCombined,
            '10. setup: the chosen approach distance sits strictly outside BICYCLE\'s own combined radius and strictly inside MOTORCYCLE\'s own larger combined radius');

        const approachStartZ = realTree.center.z - (realTree.radius + motorcycleCombined + 5);
        const start = { x: realTree.center.x, y: 0, z: approachStartZ };
        const desiredStopZ = realTree.center.z - gapDistance;

        // Drive each vehicle only as far as the shared gap point (never
        // all the way to the tree's own center) — BICYCLE must reach it
        // completely unobstructed; MOTORCYCLE must be stopped short of
        // it by its own larger footprint.
        const bicycleRun = walkToward(VehicleType.BICYCLE, start, 0.05, 400);
        const motorcycleRun = walkToward(VehicleType.MOTORCYCLE, start, 0.05, 400);

        assert(bicycleRun.position.z > desiredStopZ - 1e-6,
            '11. BICYCLE clears the gap point entirely — its own smaller footprint fits where MOTORCYCLE\'s own larger one does not');
        assert(motorcycleRun.everCollided === true, '12. MOTORCYCLE is genuinely blocked before reaching the same gap point');
        const motorcycleDist = Math.hypot(motorcycleRun.position.x - realTree.center.x, motorcycleRun.position.z - realTree.center.z);
        assert(motorcycleDist >= motorcycleCombined - 1e-6,
            '13. MOTORCYCLE stops at its OWN combined radius, never penetrating past it despite BICYCLE\'s own identical starting point and identical input');
        assert(motorcycleDist < bicycleCombined || motorcycleRun.position.z < bicycleRun.position.z,
            '14. MOTORCYCLE genuinely stops short of where BICYCLE was able to reach — this proves collisionRadius reaches the collision pipeline itself, not merely stored inertly on the capability object');
    }

    // -------------------------------------------------------------
    // Section E — car
    // -------------------------------------------------------------
    {
        const motorcycleRadius = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE).collisionRadius;
        const carRadius = resolveAvatarVehicleMovementCapability(VehicleType.CAR).collisionRadius;
        const motorcycleCombined = motorcycleRadius + realTree.radius;
        const carCombined = carRadius + realTree.radius;
        const gapDistance = (motorcycleCombined + carCombined) / 2;
        assert(gapDistance > motorcycleCombined && gapDistance < carCombined,
            '15. setup: the chosen approach distance sits strictly outside MOTORCYCLE\'s own combined radius and strictly inside CAR\'s own larger combined radius');

        const start = { x: realTree.center.x, y: 0, z: realTree.center.z - (realTree.radius + carCombined + 5) };
        const desiredStopZ = realTree.center.z - gapDistance;

        const motorcycleRun = walkToward(VehicleType.MOTORCYCLE, start, 0.05, 400);
        const carRun = walkToward(VehicleType.CAR, start, 0.05, 400);

        assert(motorcycleRun.position.z > desiredStopZ - 1e-6,
            '16. MOTORCYCLE clears the gap point entirely — this same point was reachable by the smaller vehicle');
        assert(carRun.everCollided === true, '17. CAR is genuinely blocked before reaching the same gap point — its own, largest footprint matters here specifically');
        const carDist = Math.hypot(carRun.position.x - realTree.center.x, carRun.position.z - realTree.center.z);
        assert(carDist >= carCombined - 1e-6, '18. CAR stops at its OWN combined radius, the largest of all four capabilities');
    }

    // -------------------------------------------------------------
    // Section F — candidate-query correctness
    // -------------------------------------------------------------
    {
        // A tree positioned strictly outside the default (WALK-sized)
        // CANDIDATE_QUERY_MARGIN, but strictly inside CAR's own larger
        // margin — the exact query/resolver mismatch scenario the
        // milestone's own brief names as its single most important
        // technical detail.
        const carRadius = resolveAvatarVehicleMovementCapability(VehicleType.CAR).collisionRadius;
        const carMargin = carRadius + MAX_TREE_COLLISION_RADIUS;
        const gapDistance = (CANDIDATE_QUERY_MARGIN + carMargin) / 2;
        assert(gapDistance > CANDIDATE_QUERY_MARGIN && gapDistance < carMargin,
            '19. setup: the chosen query point sits strictly outside the default candidate margin and strictly inside CAR\'s own larger margin');

        const queryPoint = { x: realTree.center.x - gapDistance, y: 0, z: realTree.center.z };

        // Direct core-level proof: the raw candidate query itself finds
        // the tree only once given CAR's own radius.
        const defaultCandidates = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: queryPoint, requestedPosition: queryPoint });
        const carCandidates = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: queryPoint, requestedPosition: queryPoint, avatarRadius: carRadius });
        assert(!defaultCandidates.some((c) => c.center.x === realTree.center.x && c.center.z === realTree.center.z),
            '20. with the default (WALK-sized) margin, this tree is correctly excluded from the candidate set');
        assert(carCandidates.some((c) => c.center.x === realTree.center.x && c.center.z === realTree.center.z),
            '21. with CAR\'s own larger margin, the SAME tree is found — the candidate query itself grows with the active capability\'s own collisionRadius');

        // End-to-end proof, through the real AvatarTreeConstraint: a car
        // approaching this exact query point genuinely collides with a
        // tree a default-radius approach would never even have queried
        // for, let alone detected.
        const approach = { x: queryPoint.x - 3, y: 0, z: queryPoint.z };
        const walkResult = new AvatarTreeConstraint().apply(approach, queryPoint);
        const carResult = new AvatarTreeConstraint().apply(approach, queryPoint, { avatarRadius: carRadius });
        assert(walkResult.collided === false, '22. AvatarTreeConstraint: the default (WALK-sized) approach to this exact point never collides — the tree is outside its own candidate margin entirely');
        assert(carResult.collided === true, '23. AvatarTreeConstraint: the identical approach, with CAR\'s own radius, genuinely collides — proving the candidate query and the resolver were extended together, never just one of the two');
    }

    // -------------------------------------------------------------
    // Section G — switching
    // -------------------------------------------------------------
    {
        // ONE controller instance, never reconstructed, driven through
        // WALK -> BICYCLE -> MOTORCYCLE -> CAR -> WALK. Between each
        // phase the avatar is repositioned back to the SAME far starting
        // point (never a new controller, never a new tree constraint) —
        // isolating "does switching capability change the boundary
        // immediately" from the separate, already-covered "what happens
        // if you grow the radius while already resting at a smaller
        // vehicle's own boundary" question core/AvatarTreeMovement.js's
        // own "already touching" rule (0.9.60/0.9.61) governs, which
        // this section is not testing.
        const registry = buildRegistry();
        const farStart = { x: realTree.center.x, y: 0, z: realTree.center.z - (realTree.radius + 0.80 + 20) };
        const { avatarPresenceSession } = buildAvatarStack(registry, 'footprint-g1', { position: farStart, rotation: { y: 0 } });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);

        function distanceToTreeCenter() {
            const p = avatarPresenceSession.current.position;
            return Math.hypot(p.x - realTree.center.x, p.z - realTree.center.z);
        }

        for (const vehicleType of [VehicleType.NONE, VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.NONE]) {
            avatarPresenceSession.update({ position: farStart, rotation: { y: 0 } });
            controller.setMovementCapability(resolveAvatarVehicleMovementCapability(vehicleType));
            controller.keyDown('w');
            for (let i = 0; i < 300; i++) controller.tick(0.05);
            controller.keyUp('w');
            const expectedCombined = resolveAvatarVehicleMovementCapability(vehicleType).collisionRadius + realTree.radius;
            const actualDist = distanceToTreeCenter();
            assert(Math.abs(actualDist - expectedCombined) < 1e-6,
                `24. switching to ${vehicleType}, on the SAME controller instance, stops the approach at exactly ITS OWN combined radius on the very next drive — no residual influence from whichever vehicle was previously active`);
        }
    }

    // -------------------------------------------------------------
    // Section H — speed unchanged
    // -------------------------------------------------------------
    {
        const walk = resolveAvatarVehicleMovementCapability(VehicleType.NONE);
        const bicycle = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const motorcycle = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const car = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        assert(walk.movementSpeed === 3, '27. WALK movementSpeed is still exactly 3 — unaffected by this milestone');
        assert(bicycle.movementSpeed === 6, '28. BICYCLE movementSpeed is still exactly 6 — unaffected by this milestone');
        assert(motorcycle.movementSpeed === 9, '29. MOTORCYCLE movementSpeed is still exactly 9 — unaffected by this milestone');
        assert(car.movementSpeed === 12, '30. CAR movementSpeed is still exactly 12 — unaffected by this milestone');
    }

    // -------------------------------------------------------------
    // Section I — drone
    // -------------------------------------------------------------
    {
        const drone = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        assert(drone.movementKind === AvatarMovementCapabilityKind.AERIAL_VEHICLE, '31. DRONE still resolves to its own AERIAL_VEHICLE movement kind');
        assert(drone.supported === false, '32. DRONE is still explicitly unsupported');
        assert(drone.collisionRadius === 0, '33. DRONE\'s own collisionRadius is 0 — inert, for the identical reason movementSpeed\'s own 0 already is');

        const registry = buildRegistry();
        const { avatarPresenceSession } = buildAvatarStack(registry, 'footprint-i1', { position: { x: realTree.center.x, y: 0, z: realTree.center.z - 5 }, rotation: { y: 0 } });
        const treeConstraint = new AvatarTreeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, treeConstraint);
        controller.setMovementCapability(drone);
        const beforePos = avatarPresenceSession.current.position;
        const before = { x: beforePos.x, y: beforePos.y, z: beforePos.z };
        controller.keyDown('w');
        for (let i = 0; i < 50; i++) controller.tick(0.05);
        controller.keyUp('w');
        const after = avatarPresenceSession.current.position;
        assert(before.x === after.x && before.y === after.y && before.z === after.z,
            '34. AERIAL_VEHICLE/DRONE remains fully blocked by AvatarMovementController\'s own tick() guard — it never even reaches the tree constraint, ground collision footprint included');
        assert(controller.isCollidedWithTree() === false,
            '35. a fully-blocked DRONE never reports a tree collision either — the tree constraint is never consulted at all for an unsupported capability');
    }

    // -------------------------------------------------------------
    // Section J — architectural regression: no second collision
    // system, no rectangular/oriented footprint, no vehicle-specific
    // controller
    // -------------------------------------------------------------
    {
        const filesToCheck = [
            '../core/AvatarVehicleMovementCapability.js',
            '../core/AvatarTreeCollisionQuery.js',
            '../core/AvatarTreeMovement.js',
            '../application/AvatarTreeConstraint.js',
            '../application/AvatarMovementController.js'
        ];
        const forbidden = [
            'BicycleCollisionController', 'CarCollisionController', 'MotorcycleCollisionController',
            'VehicleTreeCollision', 'VehicleCollisionResolver',
            'OrientedBoundingBox', 'RectangularFootprint',
            'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex'
        ];
        for (const relativePath of filesToCheck) {
            const sourceUrl = new URL(relativePath, import.meta.url);
            const source = await readFile(sourceUrl, 'utf8');
            const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            for (const term of forbidden) {
                assert(!codeOnly.includes(term), `36. ${relativePath} never references "${term}" — one movement controller, one tree collision system, a circular footprint only`);
            }
        }

        // The capability class itself carries exactly the fields this
        // milestone's own progression establishes — no shape/orientation
        // vocabulary has crept in. 0.9.89 note: this now includes
        // `movementDirections` (core/AvatarMovementDirectionCapability.js)
        // — a forward/backward permission pair, still not a shape,
        // orientation, or dimension field — superseding this assertion's
        // own original four-field list. 0.9.90 note: this now also
        // includes `acceleration` (core/AvatarMovementAccelerationCapability.js)
        // — a kind/rate pair, still not a shape, orientation, or
        // dimension field.
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        const jsonKeys = Object.keys(capability.toJSON()).sort();
        assert(JSON.stringify(jsonKeys) === JSON.stringify(['acceleration', 'collisionRadius', 'movementDirections', 'movementKind', 'movementSpeed', 'supported', 'vehicleType']),
            '37. AvatarVehicleMovementCapability.toJSON() carries exactly movementKind/vehicleType/supported/movementSpeed/collisionRadius/movementDirections/acceleration (0.9.90) — no shape, orientation, or dimension field beyond the one radius');
    }

    console.log('✅ All Ground Vehicle Collision Footprint Capability tests passed.');
}

await runTests();
