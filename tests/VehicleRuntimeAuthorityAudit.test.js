import { readFile } from 'node:fs/promises';
import { AvatarVehicleInteractionController } from '../application/AvatarVehicleInteractionController.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { BICYCLE_DISMOUNT_OFFSET_X } from '../core/AvatarVehicleDismountPosition.js';
import { Position } from '../core/Position.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.118 — Vehicle Runtime Authority Audit.
//
// The invariant this milestone exists to lock down, established across
// 0.9.114-0.9.117 and now tested as ONE coherent architectural claim:
//
//   VehiclePlacement determines where a vehicle INITIALLY exists;
//   VehicleRuntimeInstances determines where an EXISTING vehicle
//   CURRENTLY is.
//
//   Section A: architectural source audit — every current-position
//              consumer (movement, rendering, dismount) is swept for a
//              stray `.spawnPosition` read or a second, parallel
//              VehicleInstance construction path; only
//              core/VehicleInstance.js/application/NearbyVehicleInstances.js
//              themselves are allowed to mention either
//   Section B: FLAGSHIP — the one gap this audit found: mount TARGET
//              resolution could only ever find a vehicle by its
//              deterministic spawn point, so a vehicle ridden away from
//              spawn and left there could never be mounted again from
//              where it now actually sits. Proves the fix:
//              application/AvatarVehicleInteractionController.js#_nearbyVehicles()
//              now also consults application/VehicleRuntimeInstances.js's
//              own current-position record
//   Section C: FLAGSHIP — cross-pipeline: mount, real 0.9.116 movement,
//              real 0.9.115 render sync, several more reconciliation
//              frames, then a real 0.9.117 dismount, all through one
//              continuous session — proving spawnPosition !== position
//              throughout, and that no single step along the way ever
//              resets position back to spawnPosition
//   Section D: stable identity — id/type/spawnPosition survive the
//              entire discovery -> movement -> rendering -> dismount
//              lifecycle unchanged; only `position` ever moves
//   Section E: architectural regression — the Section B fix is real,
//              minimal wiring (a widened input type on
//              core/AvatarVehicleInteractionTarget.js, one new
//              non-mutating reader on
//              application/VehicleRuntimeInstances.js, one merge at the
//              one existing candidate-list call site) — never a second
//              target-resolution policy, never a new vehicle capability
//
// Central architectural claim under test throughout: after this
// milestone, every runtime-vehicle consumer this codebase has —
// movement, rendering, mount targeting, and dismount alike — reads a
// vehicle's CURRENT position from VehicleRuntimeInstances once that
// vehicle is known to it, and reads VehiclePlacement/VehiclePresence only
// to discover a vehicle for the very first time. See docs/Roadmap.md,
// 0.9.118.

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
    const avatarPresenceSession = new AvatarPresenceSession(profile, { position: startPosition });
    return { avatarProfileUseCase, avatarPresenceSession };
}

// The exact "real logic, fake low-level renderer" spy facade
// tests/AvatarVehicleAwareDismount.test.js's own Section G already
// established — a real WorldNavigationSession runs unmodified; only the
// render facade is a duck-typed stand-in, its syncVehicles() calls
// captured for direct inspection.
function spyFacade() {
    const calls = { onAnimationFrameCallbacks: [], syncVehicleCalls: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence() {},
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

// vehicle:1179337264:-8,-1 — the same real, deterministic bicycle fixture
// tests/AvatarVehicleRuntimeIntegration.test.js and
// tests/AvatarVehicleAwareDismount.test.js's own Section G already use,
// found the exact same "compute it, don't guess" way.
const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

async function sourceOf(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    const realVehicle = findRealVehicle();

    // -------------------------------------------------------------
    // Section A — architectural source audit: `.spawnPosition` is read
    // ONLY where the invariant says it should be — never by a consumer
    // that needs a vehicle's CURRENT position.
    // -------------------------------------------------------------
    {
        const currentPositionConsumers = [
            '../application/AvatarVehicleMovementController.js',
            '../renderer/VehicleFieldRenderer.js',
            '../application/RenderWorldViewUseCase.js',
            '../application/WorldNavigationSession.js',
            '../application/VehicleRuntimeInstances.js'
        ];
        for (const path of currentPositionConsumers) {
            const codeOnly = await sourceOf(path);
            assert(!codeOnly.includes('.spawnPosition'),
                `1. ${path} never reads .spawnPosition — every current-position consumer reads .position (runtime), never the frozen spawn fact`);
        }

        // core/AvatarVehicleDismountPosition.js is the one file that
        // KNOWINGLY accepts either a VehiclePresence (spawn-anchored) or
        // a VehicleInstance (current) — its own 0.9.117 header already
        // proves it reads only `.position` off of whichever shape it is
        // handed, never `.spawnPosition`. Reconfirmed here as part of
        // this milestone's own sweep, not merely inherited from 0.9.117.
        const dismountPositionCode = await sourceOf('../core/AvatarVehicleDismountPosition.js');
        assert(!dismountPositionCode.includes('.spawnPosition'),
            '2. core/AvatarVehicleDismountPosition.js never reads .spawnPosition, even though it accepts a VehicleInstance');

        // `vehicleInstanceFromPresence()` — the ONE bridge from
        // deterministic placement into runtime state — is called from
        // exactly one production call site: the discovery bridge itself.
        // No consumer of an ALREADY-DISCOVERED vehicle is allowed to
        // reconstruct a fresh VehicleInstance of its own from a
        // VehiclePresence, which would silently discard whatever runtime
        // position movement had already produced.
        const bridgeCallSites = [];
        for (const path of [
            '../application/NearbyVehicleInstances.js',
            '../application/VehicleRuntimeInstances.js',
            '../application/AvatarVehicleMovementController.js',
            '../application/AvatarVehicleInteractionController.js',
            '../application/WorldNavigationSession.js',
            '../renderer/VehicleFieldRenderer.js'
        ]) {
            const codeOnly = await sourceOf(path);
            const nonImportLines = codeOnly.split('\n').filter((line) => !line.trim().startsWith('import '));
            const count = (nonImportLines.join('\n').match(/\bvehicleInstanceFromPresence\b/g) || []).length;
            if (count > 0) bridgeCallSites.push({ path, count });
        }
        assert(bridgeCallSites.length === 1 && bridgeCallSites[0].path === '../application/NearbyVehicleInstances.js' && bridgeCallSites[0].count === 1,
            `3. vehicleInstanceFromPresence() is referenced (as a call, not merely imported) from exactly one production call site (application/NearbyVehicleInstances.js) — got ${JSON.stringify(bridgeCallSites)}`);

        // application/VehicleRuntimeInstances.js is the only writer of a
        // VehicleInstance's own current position (via
        // VehicleInstance#withPosition()) reachable from application-layer
        // wiring — movement writes through its own setPosition(), and
        // nothing else in application/ or renderer/ calls
        // `.withPosition(` directly.
        for (const path of [
            '../application/AvatarVehicleMovementController.js',
            '../application/AvatarVehicleInteractionController.js',
            '../application/WorldNavigationSession.js',
            '../application/NearbyVehicleInstances.js',
            '../renderer/VehicleFieldRenderer.js'
        ]) {
            const codeOnly = await sourceOf(path);
            assert(!codeOnly.includes('.withPosition('),
                `4. ${path} never calls VehicleInstance#withPosition() directly — application/VehicleRuntimeInstances.js#setPosition() is the one place a tracked vehicle's position ever changes`);
        }
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: mount target resolution now honors a
    // vehicle's CURRENT position, the one gap this audit found.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-b1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // Discover, then mount, the real fixture vehicle.
        fireFrame(session, 0.016);
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '5. setup: mounted the real fixture vehicle');

        // Ride it a genuine, substantial distance from its own spawn
        // point, through the real 0.9.116 movement pipeline.
        session.avatarKeyDown('w');
        for (let i = 0; i < 80; i++) {
            fireFrame(session, 0.05);
        }
        session.avatarKeyUp('w');
        const riddenPosition = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
        const riddenDistance = Math.hypot(riddenPosition.x - realVehicle.position.x, riddenPosition.z - realVehicle.position.z);
        assert(riddenDistance > 5, '6. sanity: the vehicle actually rode a real, substantial distance from its own spawn point');

        // Sanity/negative-control: the deterministic query ALONE, centered
        // on the vehicle's new location, does not find this vehicle —
        // proving any subsequent successful mount is not incidental.
        const deterministicNearRiddenSpot = vehiclePresenceInRegion(
            DEFAULT_WORLD_SEED,
            riddenPosition.x - 1.5, riddenPosition.z - 1.5,
            riddenPosition.x + 1.5, riddenPosition.z + 1.5
        );
        assert(!deterministicNearRiddenSpot.some((v) => v.id === REAL_VEHICLE_ID),
            '7. negative control: the deterministic placement query alone does NOT find this vehicle at its current, ridden-to location — confirms the scenario actually exercises the fix');

        // Dismount right there.
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() === null, '8. setup: dismounted next to the vehicle\'s current, ridden-to position');

        // Walk away — but deliberately still within
        // application/NearbyVehicleInstances.js's own VEHICLE_RENDER_RADIUS
        // (50) of the vehicle's current position, so the render loop's own
        // sync() never evicts it from the runtime store; eviction-on-
        // walk-away is a real, separate, and correct behavior this test
        // is not exercising — only mount-target resolution's own choice
        // of WHICH position an already-tracked vehicle is found at.
        // — then all the way back to the vehicle's CURRENT (moved,
        // far-from-its-own-spawn) location, and press E again.
        avatarPresenceSession.update({
            position: new Position(riddenPosition.x + 15, 0, riddenPosition.z - 15),
            rotation: avatarPresenceSession.current.rotation,
            animation: avatarPresenceSession.current.animation
        });
        fireFrame(session, 0.016);
        avatarPresenceSession.update({
            position: new Position(riddenPosition.x - 0.5, 0, riddenPosition.z),
            rotation: avatarPresenceSession.current.rotation,
            animation: avatarPresenceSession.current.animation
        });
        fireFrame(session, 0.016);

        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');

        const remount = session.avatarVehicleMount();
        assert(remount !== null && remount.vehicleId === REAL_VEHICLE_ID,
            `9. FLAGSHIP: the avatar can mount the vehicle again by walking up to its CURRENT (moved) position — before this milestone's own fix this failed, because mount targeting only ever searched near the vehicle's long-vacated deterministic spawn point. Got: ${JSON.stringify(remount)}`);
    }

    // -------------------------------------------------------------
    // Section C — FLAGSHIP: cross-pipeline. Mount, real movement, real
    // render sync, repeated reconciliation, then a real dismount — one
    // continuous session, exercising movement, rendering, and
    // interaction/dismount authority together.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-c1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        // Discovery: the first frame's render sync discovers the vehicle
        // with position === spawnPosition, exactly as
        // application/NearbyVehicleInstances.js's own bridge always
        // produces for a never-moved vehicle.
        fireFrame(session, 0.016);
        const discovered = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(discovered !== null, '10. sanity: the fixture vehicle is discovered into the runtime store on the first frame');
        assert(discovered.position.x === discovered.spawnPosition.x && discovered.position.z === discovered.spawnPosition.z,
            '11. sanity: a never-moved vehicle starts with position === spawnPosition');
        const originalSpawnPosition = discovered.spawnPosition;

        // Mount it.
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '12. setup: mounted the real fixture vehicle');

        // Movement + rendering, together, one frame at a time: ride
        // forward, and on EVERY one of these frames the render facade's
        // own syncVehicles() also runs (application/WorldNavigationSession.js
        // wires both loops independently — see this file's own header).
        session.avatarKeyDown('w');
        const RIDE_FRAMES = 60;
        for (let i = 0; i < RIDE_FRAMES; i++) {
            fireFrame(session, 0.05);
        }
        session.avatarKeyUp('w');

        const movedInstance = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(movedInstance.position.x !== originalSpawnPosition.x || movedInstance.position.z !== originalSpawnPosition.z,
            '13. THE CENTRAL CLAIM: after real movement, position !== spawnPosition');
        assert(movedInstance.spawnPosition.x === originalSpawnPosition.x && movedInstance.spawnPosition.z === originalSpawnPosition.z,
            '14. ...while spawnPosition itself never changed');

        // RENDERING AUTHORITY: the LAST syncVehicles() call from the ride
        // reflects the vehicle's CURRENT position, never its spawn point.
        const syncCalls = session._session.calls.syncVehicleCalls;
        assert(syncCalls.length >= RIDE_FRAMES, '15. sanity: one syncVehicles() call fired per render frame during the ride');
        const lastSynced = syncCalls[syncCalls.length - 1].find((v) => v.id === REAL_VEHICLE_ID);
        assert(lastSynced !== undefined, '16. the moved vehicle is still among the rendered set');
        assert(
            Math.abs(lastSynced.position.x - movedInstance.position.x) < 1e-9
            && Math.abs(lastSynced.position.z - movedInstance.position.z) < 1e-9,
            '17. RENDERER FOLLOWS: syncVehicles() received the vehicle at its CURRENT post-movement position'
        );
        assert(
            lastSynced.position.x !== lastSynced.spawnPosition.x || lastSynced.position.z !== lastSynced.spawnPosition.z,
            '18. ...and that rendered instance itself has position !== spawnPosition — rendering never quietly re-derives the spawn-anchored one'
        );

        // INTERACTION + DISMOUNT AUTHORITY: dismounting resolves from the
        // vehicle's CURRENT position, landing the avatar beside where it
        // actually is now, never where it started. Dismounted BEFORE the
        // reconciliation loop below, deliberately: once mounted and
        // movable, every frame also runs vehicle movement (coasting/
        // braking toward zero speed even with no key held), which would
        // itself keep changing `position` for reasons that have nothing
        // to do with reconciliation — the claim this loop exists to prove
        // is specifically about a vehicle NO ONE is currently riding.
        const finalVehiclePosition = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID).position;
        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() === null, '19. dismounted');

        // RECONCILIATION NEVER RESETS MOVEMENT: several more idle frames,
        // now genuinely unmounted, each re-run
        // application/VehicleRuntimeInstances.js's own sync(), which
        // re-derives a fresh, spawn-equal CANDIDATE from
        // application/NearbyVehicleInstances.js every single time — the
        // moved, already-tracked, now-riderless vehicle must survive
        // every one of them at its ridden-to position, never snapping
        // back toward spawnPosition.
        for (let i = 0; i < 10; i++) {
            fireFrame(session, 0.05);
            const stillTracked = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
            assert(stillTracked !== null, `20.${i} the vehicle is still tracked after a reconciliation-only frame`);
            assert(
                Math.abs(stillTracked.position.x - finalVehiclePosition.x) < 1e-9
                && Math.abs(stillTracked.position.z - finalVehiclePosition.z) < 1e-9,
                `21.${i} reconciliation never resets the dismounted vehicle's position back toward spawnPosition`
            );
        }

        const finalAvatarPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalAvatarPosition.x - (finalVehiclePosition.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-6
            && Math.abs(finalAvatarPosition.z - finalVehiclePosition.z) < 1e-6,
            '22. FLAGSHIP: the avatar lands beside the vehicle\'s CURRENT position'
        );
        assert(
            Math.hypot(finalAvatarPosition.x - originalSpawnPosition.x, finalAvatarPosition.z - originalSpawnPosition.z) > 5,
            '23. ...genuinely far from the vehicle\'s original spawn point — none of mounting, movement, rendering, reconciliation, or dismount ever pulled the avatar back toward spawnPosition'
        );

        // The vehicle's own runtime record is untouched by dismounting —
        // dismounting changes the AVATAR's position, never the vehicle's.
        const afterDismountInstance = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(
            afterDismountInstance.position.x === finalVehiclePosition.x && afterDismountInstance.position.z === finalVehiclePosition.z,
            '24. dismounting never moves the vehicle itself — it stays exactly where the player left it'
        );
    }

    // -------------------------------------------------------------
    // Section D — stable identity across the entire lifecycle: id, type,
    // and spawnPosition survive discovery -> movement -> rendering ->
    // dismount completely unchanged; only position ever changes.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-d1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        fireFrame(session, 0.016);
        const atDiscovery = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        const { id, type, spawnPosition } = atDiscovery;

        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');

        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) fireFrame(session, 0.05);
        session.avatarKeyUp('w');

        const afterRide = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(afterRide.id === id, '25. id survives movement unchanged');
        assert(afterRide.type === type, '26. type survives movement unchanged');
        assert(afterRide.spawnPosition.x === spawnPosition.x && afterRide.spawnPosition.z === spawnPosition.z,
            '27. spawnPosition survives movement unchanged');
        assert(afterRide.position.x !== spawnPosition.x || afterRide.position.z !== spawnPosition.z,
            '28. ...while position genuinely changed');

        const lastRenderedForVehicle = session._session.calls.syncVehicleCalls
            .at(-1)
            .find((v) => v.id === REAL_VEHICLE_ID);
        assert(lastRenderedForVehicle.id === id && lastRenderedForVehicle.type === type,
            '29. the SAME id/type reach the renderer — rendering never rebinds a moved vehicle to a new identity');

        session.avatarKeyDown('e');
        fireFrame(session, 0.016);
        session.avatarKeyUp('e');
        assert(session.avatarVehicleMount() === null, '30. setup: dismounted');

        const afterDismount = session._vehicleRuntimeInstances.get(REAL_VEHICLE_ID);
        assert(afterDismount.id === id && afterDismount.type === type,
            '31. id/type survive dismount unchanged');
        assert(afterDismount.spawnPosition.x === spawnPosition.x && afterDismount.spawnPosition.z === spawnPosition.z,
            '32. spawnPosition survives dismount unchanged — the deterministic fact is frozen for the vehicle\'s entire lifetime');
    }

    // -------------------------------------------------------------
    // Section E — architectural regression: Section B's fix is real,
    // minimal wiring — a widened input type, one new non-mutating
    // reader, one merge at one call site — never a second policy and
    // never a new vehicle capability.
    // -------------------------------------------------------------
    {
        const targetCode = await sourceOf('../core/AvatarVehicleInteractionTarget.js');
        assert(targetCode.includes('VehicleInstance'),
            '33. core/AvatarVehicleInteractionTarget.js now references VehicleInstance — the widened input type this milestone adds');
        const exportedTargetNames = Object.keys(await import('../core/AvatarVehicleInteractionTarget.js')).sort();
        assert(JSON.stringify(exportedTargetNames) === JSON.stringify(['resolveAvatarVehicleInteractionTarget']),
            '34. core/AvatarVehicleInteractionTarget.js still exports exactly its one resolver — the fix widened its INPUT type, never its public surface');

        const runtimeInstancesCode = await sourceOf('../application/VehicleRuntimeInstances.js');
        assert(runtimeInstancesCode.includes('nearby('),
            '35. application/VehicleRuntimeInstances.js exposes the new nearby() reader');
        // nearby() must never call sync(), and must never mutate
        // `_instances` — see that method's own header for exactly why
        // (a second, differently-radius'd sync() call would evict a
        // vehicle the render loop's own larger-radius sync still wants
        // tracked).
        const nearbyBody = runtimeInstancesCode.slice(runtimeInstancesCode.indexOf('nearby(centerPosition, radius) {'));
        const nearbyMethodSource = nearbyBody.slice(0, nearbyBody.indexOf('\n    }'));
        assert(!nearbyMethodSource.includes('this._instances.set') && !nearbyMethodSource.includes('this._instances.delete') && !nearbyMethodSource.includes('sync('),
            '36. nearby() never mutates the store and never calls sync() — a pure, non-evicting read');

        const controllerCode = await sourceOf('../application/AvatarVehicleInteractionController.js');
        const nearbyCallSites = controllerCode.split('_vehicleRuntimeInstances.nearby(').length - 1;
        assert(nearbyCallSites === 1,
            '37. application/AvatarVehicleInteractionController.js calls vehicleRuntimeInstances.nearby() from exactly one place — the one _nearbyVehicles() merge, never duplicated');
        assert(!controllerCode.includes('_vehicleRuntimeInstances.sync('),
            '38. application/AvatarVehicleInteractionController.js never calls sync() itself — discovery/eviction stays entirely application/WorldNavigationSession.js\'s own _setupVehicleRendering() job');

        // No new vehicle capability of any kind was introduced by this
        // audit milestone — matching its own brief precisely.
        for (const path of [
            '../application/AvatarVehicleInteractionController.js',
            '../application/VehicleRuntimeInstances.js',
            '../core/AvatarVehicleInteractionTarget.js'
        ]) {
            const codeOnly = await sourceOf(path);
            assert(!/persist|Persist|network|Network|multiplayer|Multiplayer|MOTORCYCLE|CAR\b|DRONE/.test(codeOnly),
                `39. ${path} introduces no persistence, networking, or a new movable vehicle type — this milestone is strictly an audit plus its one wiring fix`);
        }
    }

    console.log('✅ All Vehicle Runtime Authority Audit tests passed.');
}

await runTests();
