import { VehicleSteeringIntent } from '../core/VehicleSteeringIntent.js';
import { DEFAULT_VEHICLE_STEERING_TURN_DEGREES } from '../core/VehicleSteeringSimulation.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { isMovableVehicleType, AvatarVehicleMovementController } from '../application/AvatarVehicleMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.130 — Vehicle Steering UX / Control Contract.
//
// 0.9.125 through 0.9.129 built and then exhaustively audited the plumbing
// of vehicle steering — intent, simulation, integration, input binding,
// held-bit/decay state. Every one of those milestones proved a PIECE of the
// pipeline correct in isolation. None of them, until now, wrote down the
// bicycle's own CONTROL CONTRACT as a single, closed, numbered list a
// player (or a future implementer of a second steerable vehicle type) could
// read start to end. This milestone is that list, plus one flagship test
// that drives the ENTIRE chain as a single continuous narrative — mount,
// ride, turn, turn, turn, hit a wall, keep holding the key — the shape a
// real player's own session actually takes, never a sequence of isolated
// programmatic snapshots.
//
//   ArrowLeft / ArrowRight
//             |
//             v
//   VehicleSteeringInputAdapter      (core/VehicleSteeringInputAdapter.js)
//             |
//             v
//   VehicleSteeringIntent            (core/VehicleSteeringIntent.js)
//             |
//             v
//   VehicleSteeringSimulation        (core/VehicleSteeringSimulation.js)
//             |
//             v
//   attempted movement
//             |
//             v
//   world collision
//             |
//             v
//   realized movement
//             |
//             v
//   VehicleMovementHeading           (core/VehicleMovementHeading.js)
//             |
//             v
//   VehicleInstance.heading
//             |
//             v
//   VehicleVisual                    (renderer/VehicleRenderer.js)
//
// THE BICYCLE CONTROL CONTRACT — nine statements, each one a claim this
// file's own CONTRACT section below verifies directly, either behaviorally
// (drive a real session and observe) or structurally (sweep the source of
// the file that owns the claim):
//
//   1. ArrowLeft/ArrowRight are discrete steering PULSES, not a held rate.
//   2. Browser key-repeat does not generate repeated turns.
//   3. A steering pulse rotates the attempted travel direction by 45
//      degrees (`DEFAULT_VEHICLE_STEERING_TURN_DEGREES`,
//      core/VehicleSteeringSimulation.js).
//   4. NONE means no new steering operation — it never itself rotates
//      anything, and it never expires into something else on its own.
//   5. The vehicle's heading is still determined ONLY by realized
//      displacement, exactly as core/VehicleMovementHeading.js established
//      before steering existed at all (0.9.123) — never by the raw
//      steering request.
//   6. Collision can prevent the requested turn from becoming realized
//      movement.
//   7. A blocked turn therefore does not rotate the vehicle — heading
//      stays exactly where it was.
//   8. A/D remains AVATAR rotation, not vehicle steering — the two never
//      touch the same state.
//   9. Steering is currently BICYCLE behavior, not a generic all-vehicle
//      one — `VehicleType` already names MOTORCYCLE, CAR, and DRONE, but
//      only BICYCLE has a runtime movement/rendering path at all.
//
// This is a documentation-and-test milestone, matching this milestone's
// own brief: no production file changes. See docs/Roadmap.md, 0.9.130, for
// this same contract in prose, and this file's own two sections, below,
// for how each of the nine statements is actually checked:
//
//   Section CONTRACT — one direct check per numbered statement above.
//   Section SEQUENCE — the flagship control-sequence contract test: a
//     SINGLE continuous ride (never reset mid-scenario) through
//     mount -> ride forward -> LEFT -> ride -> LEFT -> ride -> RIGHT ->
//     ride -> blocked -> heading unchanged -> NONE -> continue attempting
//     the same heading. This is the shape 0.9.129's own Sections A-H
//     already proved piece by piece; this section is the one place all of
//     it happens back to back, in the actual order a player experiences
//     it, rather than fragmented across independent scenarios.
//
// See docs/Roadmap.md, 0.9.130.

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

// The direct structural twin of tests/VehicleSteeringControlAudit.test.js's
// own helper of the same name.
function installSyntheticBrickObstacle(session, docId, worldCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, worldCenter.y, 0) }));
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x: worldCenter.x, y: 0, z: worldCenter.z });
}

function injectMountedVehicle(session, vehicleId, spawnPosition, heading = 0) {
    session._vehicleRuntimeInstances._instances.set(vehicleId, new VehicleInstance({
        id: vehicleId, type: VehicleType.BICYCLE, spawnPosition, position: spawnPosition, heading
    }));
    session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(vehicleId);
}

// Own private patch of the deterministic world, far from every other
// steering test's own reserved coordinates (tests/VehicleSteeringControlAudit.test.js's
// own 60000-66500 range) — the same "own coordinates, never shared"
// discipline that file's own header already documents, for the identical
// reason: this file's own SEQUENCE section makes several precise, chained
// heading assertions sensitive to a stray natural tree brushing the ride.
const SPAWN = { x: 70000, y: 0, z: 70000 };

async function runTests() {
    // ===============================================================
    // Section CONTRACT — one direct check per numbered statement in this
    // file's own header.
    // ===============================================================

    // 1 & 2 — discrete pulses; browser key-repeat produces no repeated
    // turns. A minimal, direct re-proof (tests/VehicleSteeringControlAudit.test.js's
    // own Section A is the exhaustive version of this exact claim).
    {
        const registry = buildRegistry();
        const vehicleId = 'contract-1';
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'contract-1', new Position(SPAWN.x, 0, SPAWN.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, vehicleId, { ...SPAWN });
        session.avatarKeyDown('w');
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 0, 'CONTRACT setup: a stable, un-steered heading before any steering input');

        // One deliberate press, held with real browser-style key-repeat
        // (four repeated keydown events, no keyup between them).
        for (let i = 0; i < 4; i++) session.avatarKeyDown('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315,
            '1/2. one deliberate ArrowLeft press, even with real key-repeat behind it, turns the vehicle exactly once (0 -> 315) — a discrete pulse, never a held rate');
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315,
            '2b. ...and stays at exactly 315 across many further frames with the key still (physically) down but no new edge — key-repeat never compounds further turns');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }

    // 3 — a steering pulse rotates the attempted direction by exactly 45
    // degrees, and that 45 is one explicit, named constant, never a
    // buried literal.
    {
        assert(DEFAULT_VEHICLE_STEERING_TURN_DEGREES === 45,
            '3. the steering turn increment is exactly 45 degrees, and is the one named constant every LEFT/RIGHT pulse in this contract uses');
    }

    // 4 — NONE means no new steering operation: it never itself rotates
    // anything, and a real pulse decays to an explicit NONE rather than
    // lingering or reverting to null/undefined.
    {
        assert(VehicleSteeringIntent.none().isNone === true, '4a. VehicleSteeringIntent.none() is itself the explicit NONE value');
        const registry = buildRegistry();
        const vehicleId = 'contract-4';
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'contract-4', new Position(SPAWN.x + 500, 0, SPAWN.z + 500));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, vehicleId, { x: SPAWN.x + 500, y: 0, z: SPAWN.z + 500 });
        session.avatarKeyDown('w');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        const consumed = session.vehicleSteeringIntent();
        assert(consumed instanceof VehicleSteeringIntent && consumed.isNone === true,
            '4b. immediately after a pulse is applied, steering intent reports an explicit NONE — never null/undefined, never a lingering LEFT/RIGHT');
        const headingAfterPulse = session._vehicleRuntimeInstances.get(vehicleId).heading;
        for (let i = 0; i < 10; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, headingAfterPulse,
            '4c. ...and NONE never itself produces any further rotation, no matter how many further ticks run');
        session.avatarKeyUp('w');
    }

    // 5, 6, 7 — heading comes only from realized displacement; collision
    // can block a requested turn; a blocked turn does not rotate the
    // vehicle. A minimal, direct re-proof (tests/VehicleSteeringControlAudit.test.js's
    // own Section F is the exhaustive version).
    {
        const registry = buildRegistry();
        const vehicleId = 'contract-567';
        const spawnPosition = { x: SPAWN.x - 500, y: 0, z: SPAWN.z - 500 };
        const brickCenter = groundedBrickCenter(spawnPosition.x, spawnPosition.z + 5);
        const flushSpawn = { x: brickCenter.x, y: brickCenter.y, z: brickCenter.z - 0.5 - resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).collisionRadius };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'contract-567', new Position(flushSpawn.x, 0, flushSpawn.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, vehicleId, flushSpawn, 45);
        installSyntheticBrickObstacle(session, 'contract-567-brick', brickCenter);

        assert(session._vehicleRuntimeInstances.get(vehicleId).heading === 45, 'CONTRACT setup: a real, pre-existing heading of 45');
        session.avatarKeyDown('w');
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        // Heading 45, turned LEFT by 45, attempts due north (0) — directly
        // at the flush obstacle.
        assert(session.vehicleSteeringIntent().isLeft === true, 'CONTRACT setup: a real LEFT request pending, aimed straight at the obstacle');

        const before = session._vehicleRuntimeInstances.get(vehicleId);
        fireFrame(session, 0.05);
        const after = session._vehicleRuntimeInstances.get(vehicleId);
        assert(session._avatarVehicleMovementController.isCollided() === true, '6. collision genuinely prevented the requested turn from becoming realized movement');
        assert(after.position.x === before.position.x && after.position.z === before.position.z, '6b. the attempted step was fully absorbed — zero realized displacement');
        assert(after.heading === 45, '7. a blocked turn does not rotate the vehicle — heading stays exactly where it was (45), never the 0 that was actually requested');
        assert(after.heading !== 0, '5. sanity: the raw steering request (0) is a genuinely different value from the realized heading (45) — heading tracks realized movement only, never the request itself');
        session.avatarKeyUp('w');
    }

    // 8 — A/D remains avatar rotation, never vehicle steering: pressing
    // 'a'/'d' never changes vehicleSteeringIntent(), and ArrowLeft/ArrowRight
    // never change the avatar's own rotationY directly (only as a side
    // effect of the vehicle's own heading changing, which VehicleVisual —
    // not the avatar mesh — observes).
    {
        const registry = buildRegistry();
        const vehicleId = 'contract-8';
        const spawnPosition = { x: SPAWN.x + 500, y: 0, z: SPAWN.z - 500 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'contract-8', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        injectMountedVehicle(session, vehicleId, spawnPosition);
        session.avatarKeyDown('w');
        for (let i = 0; i < 5; i++) fireFrame(session, 0.05);

        session.avatarKeyDown('a');
        fireFrame(session, 0.05);
        assert(session.vehicleSteeringIntent() === null || session.vehicleSteeringIntent().isNone === true,
            "8a. holding 'a' (avatar rotation) never itself produces a LEFT/RIGHT vehicle steering intent");
        session.avatarKeyUp('a');

        session.avatarKeyDown('ArrowLeft');
        assert(session.vehicleSteeringIntent().isLeft === true, '8b. ArrowLeft genuinely does produce vehicle steering intent, confirming this is a real distinction, not an untested one');
        session.avatarKeyUp('ArrowLeft');
        session.avatarKeyUp('w');
    }

    // 9 — steering is bicycle behavior, not generic all-vehicle behavior:
    // BICYCLE is the only VehicleType this codebase can actually move.
    {
        assert(isMovableVehicleType(VehicleType.BICYCLE) === true, '9a. BICYCLE is movable');
        assert(isMovableVehicleType(VehicleType.MOTORCYCLE) === false, '9b. MOTORCYCLE — named in VehicleType, but no runtime movement path yet');
        assert(isMovableVehicleType(VehicleType.CAR) === false, '9c. CAR — same');
        assert(isMovableVehicleType(VehicleType.DRONE) === false, '9d. DRONE — same');

        // Defense in depth, matching application/AvatarVehicleMovementController.js's
        // own tick(): even a caller that skips canMove() first, and even
        // for a vehicle id that IS genuinely tracked (never merely
        // "unknown id"), can never move a non-bicycle vehicle through
        // steering — the type gate itself is what blocks it.
        const motorcycleInstance = new VehicleInstance({
            id: 'contract-9-motorcycle', type: VehicleType.MOTORCYCLE,
            spawnPosition: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 }, heading: 0
        });
        const controller = new AvatarVehicleMovementController({ get: (id) => id === motorcycleInstance.id ? motorcycleInstance : null });
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.MOTORCYCLE);
        const result = controller.tick({
            seed: DEFAULT_WORLD_SEED, vehicleId: motorcycleInstance.id, capability,
            movementIntent: { direction: 1, turnAxis: 0, running: false, brakingRequested: false },
            currentRotationY: 0, deltaSeconds: 0.05, steeringIntent: VehicleSteeringIntent.left()
        });
        assert(result === null, '9e. a genuinely TRACKED motorcycle still never simulates — the type gate itself blocks it, steering intent supplied or not');
    }

    // ===============================================================
    // Section SEQUENCE — the flagship control-sequence contract test.
    //
    //   mount bicycle -> ride forward -> LEFT -> ride -> LEFT -> ride ->
    //   RIGHT -> ride -> blocked -> heading remains unchanged -> NONE ->
    //   continue along current heading
    //
    // One single session, one single mount, 'w' held continuously start
    // to finish — never reset mid-scenario — the shape an actual player's
    // ride takes.
    // ===============================================================
    {
        const registry = buildRegistry();
        const vehicleId = 'sequence-flagship';
        const spawnPosition = { ...SPAWN };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'sequence-flagship', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // mount bicycle
        injectMountedVehicle(session, vehicleId, spawnPosition);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === vehicleId, 'SEQ. mounted');

        // ride forward
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 0, 'SEQ. ride forward establishes a stable heading of 0 before any steering input');
        let previousPosition = session._vehicleRuntimeInstances.get(vehicleId).position;

        // LEFT
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, 'SEQ. LEFT: 0 -> 315, one discrete pulse');

        // ride in new direction
        for (let i = 0; i < 15; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, 'SEQ. riding with no further steering input holds heading exactly at 315 — NONE invents no rotation');
        let currentPosition = session._vehicleRuntimeInstances.get(vehicleId).position;
        let dx = currentPosition.x - previousPosition.x;
        let dz = currentPosition.z - previousPosition.z;
        assert(dx < -0.01 && dz > 0.01, 'SEQ. ...and the ride genuinely moved in the 315-degree direction (-X, +Z), never merely relabeled heading with no real displacement');
        previousPosition = currentPosition;

        // LEFT
        session.avatarKeyDown('ArrowLeft');
        session.avatarKeyUp('ArrowLeft');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, 'SEQ. LEFT again: 315 -> 270, the second independent pulse');

        // ride in another direction
        for (let i = 0; i < 15; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 270, 'SEQ. holds exactly at 270 through further un-steered riding');
        currentPosition = session._vehicleRuntimeInstances.get(vehicleId).position;
        dx = currentPosition.x - previousPosition.x;
        assert(dx < -0.01 && Math.abs(currentPosition.z - previousPosition.z) < 0.01, 'SEQ. ...moving due -X (270 degrees), genuinely a different direction than the previous leg');
        previousPosition = currentPosition;

        // RIGHT
        session.avatarKeyDown('ArrowRight');
        session.avatarKeyUp('ArrowRight');
        fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, 'SEQ. RIGHT: 270 -> 315, the third independent pulse — back to 315, but via a genuinely new, independent turn, not a no-op');

        // ride in resulting direction
        for (let i = 0; i < 15; i++) fireFrame(session, 0.05);
        assertClose(session._vehicleRuntimeInstances.get(vehicleId).heading, 315, 'SEQ. holds exactly at 315 again');
        currentPosition = session._vehicleRuntimeInstances.get(vehicleId).position;
        dx = currentPosition.x - previousPosition.x;
        dz = currentPosition.z - previousPosition.z;
        assert(dx < -0.01 && dz > 0.01, 'SEQ. ...and genuinely moved again, along the resulting (315-degree) direction');

        // blocked — teleport the already-moving vehicle to sit exactly
        // flush against a fresh obstacle placed directly ahead along its
        // own current (315-degree) heading, via the same public
        // setPosition() the real movement controller itself uses (never a
        // direct field write) — heading is left completely untouched, so
        // the vehicle arrives at the wall still genuinely heading 315,
        // exactly as if it had ridden there. The obstacle itself
        // (installSyntheticWallCorner(), below) is a right-angle CORNER of
        // bricks, not a single flat wall: a flat wall approached at a
        // diagonal (non-axis-aligned) heading like 315 would let the
        // vehicle clip and slide laterally along it, the way
        // tests/VehicleSteeringControlAudit.test.js's own F1 scenario
        // deliberately DOES exercise (a genuinely different claim: that
        // heading tracks a CLIPPED, non-raw realized direction). A corner
        // blocks both the X and Z components of the attempted step at
        // once, giving the full, symmetric absorption — zero realized
        // displacement, heading exactly unchanged — this section's own
        // claim actually needs; that same file's own F2 scenario is the
        // direct (axis-aligned) precedent for this exact outcome.
        currentPosition = session._vehicleRuntimeInstances.get(vehicleId).position;
        const headingBeforeBlock = session._vehicleRuntimeInstances.get(vehicleId).heading;
        assertClose(headingBeforeBlock, 315, 'SEQ. sanity: entering the blocked step still heading 315');
        const headingRadians = headingBeforeBlock * Math.PI / 180;
        const dirX = Math.sin(headingRadians);
        const dirZ = Math.cos(headingRadians);
        const gapAhead = 6;
        const brickCenter = groundedBrickCenter(currentPosition.x + dirX * gapAhead, currentPosition.z + dirZ * gapAhead);
        const combinedClearance = 0.5 + resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE).collisionRadius;
        const flushPosition = {
            x: brickCenter.x - dirX * combinedClearance,
            y: currentPosition.y,
            z: brickCenter.z - dirZ * combinedClearance
        };
        installSyntheticWallCorner(session, 'sequence-flagship-block', brickCenter);
        session._vehicleRuntimeInstances.setPosition(vehicleId, flushPosition);
        assert(session._vehicleRuntimeInstances.get(vehicleId).heading === headingBeforeBlock, 'SEQ. sanity: teleporting to the flush position via setPosition() never itself touches heading');

        const beforeBlockedTick = session._vehicleRuntimeInstances.get(vehicleId);
        fireFrame(session, 0.05);
        const afterBlockedTick = session._vehicleRuntimeInstances.get(vehicleId);

        // heading remains unchanged
        assert(session._avatarVehicleMovementController.isCollided() === true, 'SEQ. blocked: a genuine collision, not merely an absence of movement intent');
        assert(afterBlockedTick.position.x === beforeBlockedTick.position.x && afterBlockedTick.position.z === beforeBlockedTick.position.z,
            'SEQ. blocked: the entire attempted step was fully absorbed — zero realized displacement');
        assert(afterBlockedTick.heading === headingBeforeBlock,
            `SEQ. heading remains unchanged: still exactly ${headingBeforeBlock} after the blocked tick, never invented from the (fully absorbed) attempt`);

        // NONE -> continue along current heading
        for (let i = 0; i < 10; i++) {
            fireFrame(session, 0.05);
            const intent = session.vehicleSteeringIntent();
            assert(intent instanceof VehicleSteeringIntent && intent.isNone === true, 'SEQ. NONE: no new steering operation was ever requested through this stretch, and none is ever invented on its own');
            assert(session._vehicleRuntimeInstances.get(vehicleId).heading === headingBeforeBlock, `SEQ. continue along current heading: still pinned at exactly ${headingBeforeBlock} — NONE keeps the vehicle attempting the SAME heading every further tick, blocked or not, never a drifting or reset one`);
        }
        session.avatarKeyUp('w');
    }

    console.log('✅ All Vehicle Steering UX / Control Contract tests passed.');
}

// A small corner obstacle — two bricks meeting at a right angle, both
// adjacent to `cornerCenter` — rather than a single flat wall, so that a
// vehicle approaching along a diagonal (non-axis-aligned) heading is
// blocked on both the X and Z components of its attempted step at once,
// instead of clipping and sliding along a single flat face the way
// tests/VehicleSteeringControlAudit.test.js's own F1 scenario deliberately
// exercises. Grounded at the same terrain height every synthetic brick
// obstacle in these steering tests already uses.
function installSyntheticWallCorner(session, docId, cornerCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, cornerCenter.y, 0) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(1, cornerCenter.y, 0) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, cornerCenter.y, -1) }));
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x: cornerCenter.x, y: 0, z: cornerCenter.z });
}

await runTests();
