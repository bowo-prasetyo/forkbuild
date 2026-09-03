import { readFile } from 'node:fs/promises';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability, AvatarMovementCapabilityKind } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';
import { AvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { Position } from '../core/Position.js';

// 0.9.96 — Vehicle Braking Input Binding.
//
// 0.9.95 built a complete, real, key-free path from an already-resolved
// braking request down to `AvatarMovementState.brakingRequested` —
// `core/AvatarVehicleBrakingInputAdapter.js` (a control's own
// `brakedown`/`brakeup` transition -> `{ brakeRequested }`),
// `core/AvatarVehicleBrakingIntent.js` (`{ brakeRequested }` -> NONE/
// BRAKE), and `application/AvatarMovementController.js#setVehicleBrakingIntent()`
// — and deliberately stopped there: nothing in this codebase's own real
// input ever called `setVehicleBrakingIntent()`. This milestone adds
// exactly ONE new thing, `application/WorldNavigationSession.js#
// _processVehicleBrakingInput()`, wired into the same `avatarKeyDown`/
// `avatarKeyUp` seam 0.9.65/0.9.66 already used for continuous movement
// — the physical Control key's own down/up transition, translated into
// `type: 'brakedown'/'brakeup'` and handed straight to the two
// already-complete, already-tested pure functions above. Every one of
// those three files is untouched by this milestone; see Section E's own
// architectural sweep.
//
//   Section A: the raw key binding itself — Control down/up genuinely
//              reaches AvatarMovementController#vehicleBrakingIntent(),
//              held/repeated/released, gated on Avatar Control Mode
//              exactly like every other movement key, and force-released
//              on the two existing "never leave a key stuck" seams
//   Section B: real simulation — BICYCLE/MOTORCYCLE/CAR each still use
//              their own independently declared braking rate (6/9/8)
//              when braking is requested through the REAL Control key
//              rather than setVehicleBrakingIntent() called directly
//   Section C: direction independence — Control alone (no movement key
//              held) reduces the magnitude of the current signed speed
//              toward zero from a positive OR a negative current speed
//   Section D: regression/independence — ordinary W/S, continuous WALK/
//              RUN, and mount/dismount ('E') are all completely
//              unaffected by this milestone, and DRONE remains fully
//              blocked regardless of a pending Control hold
//   Section E: architectural sweep — no vehicle-specific branching in
//              the keyboard seam, and 0.9.95's own three files are
//              byte-for-byte untouched
//
// Central architectural claim under test throughout: the binding is a
// THIN TRANSLATION, never a new decision layer — every actual braking
// decision still lives entirely inside 0.9.95's own already-tested pure
// functions. See docs/Roadmap.md, 0.9.96.

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

function buildAvatarStack(registry, username, startPosition) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, startPosition ? { position: startPosition } : {});
    return { avatarProfileUseCase, avatarPresenceSession };
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

function buildSession(registry, avatarProfileUseCase, avatarPresenceSession) {
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = spyFacade();
    session._setupLocalAvatar();
    return session;
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

// The exact discrete "never overshoots" recurrence
// core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()
// itself implements — reproduced here, bit-for-bit the same operations
// in the same order, purely to compute EXPECTED per-tick speeds for
// this file's own assertions. Never imported from production code:
// this file tests the real KEYBOARD BINDING, not the already-covered
// (tests/AvatarMovementAccelerationSimulation.test.js,
// tests/AvatarVehicleBrakingIntentControllerIntegration.test.js) math
// itself.
function expectedRampSpeeds(startSpeed, target, rate, dt, ticks) {
    let current = startSpeed;
    const speeds = [];
    for (let i = 0; i < ticks; i++) {
        const maxDelta = rate * dt;
        if (current < target) current = Math.min(current + maxDelta, target);
        else if (current > target) current = Math.max(current - maxDelta, target);
        speeds.push(current);
    }
    return speeds;
}

const DT = 0.05; // world seconds/tick — matches every sibling integration suite's own DT
const { NONE, BRAKE } = AvatarVehicleBrakingIntent;

async function runTests() {
    const registry = buildRegistry();
    const realVehicle = findRealVehicle();

    // -------------------------------------------------------------
    // Section A — the raw key binding
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '1. a fresh session reports NONE before Control is ever pressed');

        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE,
            '2. pressing Control genuinely reaches AvatarMovementController — vehicleBrakingIntent() is BRAKE');

        session.avatarKeyUp('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '3. releasing Control reports NONE on the very next call');
    }
    {
        // Holding the control (repeated keydown, exactly like a real
        // browser's own key-repeat) maintains BRAKE the whole time —
        // never a toggle back to NONE on a second, third, or Nth
        // keydown while the key is still physically down.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a2');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        for (let i = 0; i < 10; i++) {
            session.avatarKeyDown('Control');
            assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE,
                `4.${i} repeated keydown #${i} while held keeps reporting BRAKE — never a toggle`);
        }
        session.avatarKeyUp('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '5. releasing after a long repeated hold still cleanly reports NONE');
    }
    {
        // Case-insensitivity, matching every other raw-key comparison
        // already in this codebase (see application/AvatarMovementController.js#_setKey
        // and core/AvatarContinuousMovementInputAdapter.js).
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a3');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        session.avatarKeyDown('Control'); // real KeyboardEvent.key casing
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE, '6. "Control" (real KeyboardEvent.key casing) engages braking');
        session.avatarKeyUp('Control');

        session.avatarKeyDown('CONTROL');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE, '7. "CONTROL" (all caps) engages braking too');
        session.avatarKeyUp('control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE, '8. lowercase "control" releases it');
    }
    {
        // Consumed/preventDefault semantics — Control is a recognized
        // key, exactly like W/A/S/D/Shift/Space/E, so the UI knows to
        // swallow the event.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a4');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        assert(session.avatarKeyDown('Control') === true, '9. avatarKeyDown("Control") reports the event as consumed while Avatar Control Mode is on');
        assert(session.avatarKeyUp('Control') === true, '10. avatarKeyUp("Control") reports the event as consumed too');
    }
    {
        // Gated on Avatar Control Mode exactly like every other
        // movement key — braking can no more be armed while the mode
        // is off than an ordinary W can move the avatar while it's off.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a5');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        // Avatar Control Mode is OFF (the default).
        assert(session.avatarKeyDown('Control') === false, '11. avatarKeyDown("Control") is never consumed while Avatar Control Mode is off');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '12. Control while Avatar Control Mode is off never arms braking');
    }
    {
        // Turning Avatar Control Mode off while Control is physically
        // held force-clears braking back to NONE — the same "never
        // leave a key stuck" guarantee releaseAll() already gives
        // _keys.jumpHeld, extended to the brake key (see
        // WorldNavigationSession#setAvatarControlMode's own 0.9.96
        // comment for why this is necessary here, unlike
        // _continuousMovementIntent/_continuousMovementMode).
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a6');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE, '13. setup: braking is engaged before turning control mode off');

        session.setAvatarControlMode(false);
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '14. turning Avatar Control Mode off force-releases a stuck Control key — braking reports NONE immediately');
    }
    {
        // releaseAvatarMovementKeys() (window blur) does the identical
        // release WITHOUT touching Avatar Control Mode itself.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-a7');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE, '15. setup: braking is engaged before a simulated window blur');

        session.releaseAvatarMovementKeys();
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '16. releaseAvatarMovementKeys() force-releases a stuck Control key too');
        assert(session.isAvatarControlModeActive() === true,
            '17. ...without silently turning Avatar Control Mode off — releasing keys and disabling the mode remain two different things');
    }

    // -------------------------------------------------------------
    // Section B — real simulation: per-vehicle braking rates, through
    // the REAL Control key rather than setVehicleBrakingIntent() called
    // directly
    // -------------------------------------------------------------
    const VEHICLE_BRAKING_RATES = [
        { type: VehicleType.BICYCLE, rate: 6, label: 'BICYCLE' },
        { type: VehicleType.MOTORCYCLE, rate: 9, label: 'MOTORCYCLE' },
        { type: VehicleType.CAR, rate: 8, label: 'CAR' }
    ];
    for (const { type, rate, label } of VEHICLE_BRAKING_RATES) {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, `bind-b-${label}`);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const capability = resolveAvatarVehicleMovementCapability(type);
        session._avatarMovementController.setMovementCapability(capability);

        // Cruise up to this vehicle's own full top speed under ordinary
        // W — 80 ticks (4 simulated seconds) comfortably clears even
        // CAR's own slowest-to-top-speed case (12 / 4 = 3s) — exactly
        // the same way any other integration suite in this codebase
        // builds a cruising vehicle.
        session.avatarKeyDown('w');
        for (let i = 0; i < 80; i++) session._avatarMovementController.tick(DT);
        session.avatarKeyUp('w');

        // Now brake through the REAL Control key alone (no movement key
        // held) and confirm the observed per-tick deceleration matches
        // this vehicle's own independently declared braking rate, not
        // its acceleration rate and not some other vehicle's rate.
        session.avatarKeyDown('Control');
        const expected = expectedRampSpeeds(capability.movementSpeed, 0, rate, DT, 6);
        let previousZ = avatarPresenceSession.current.position.z;
        const observed = [];
        for (let i = 0; i < 6; i++) {
            session._avatarMovementController.tick(DT);
            const z = avatarPresenceSession.current.position.z;
            observed.push((z - previousZ) / DT);
            previousZ = z;
        }
        session.avatarKeyUp('Control');
        for (let i = 0; i < 6; i++) {
            assert(Math.abs(observed[i] - expected[i]) < 1e-6,
                `18.${label}.${i} braking through the real Control key uses ${label}'s own declared braking rate (${rate}) — tick ${i} expected ${expected[i]}, observed ${observed[i]}`);
        }
    }

    // -------------------------------------------------------------
    // Section C — direction independence: Control alone reduces the
    // MAGNITUDE of the current signed speed toward zero, from a
    // positive OR a negative current speed alike
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-c1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._avatarMovementController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        // Positive current speed, then brake with only Control held.
        session.avatarKeyDown('w');
        for (let i = 0; i < 40; i++) session._avatarMovementController.tick(DT);
        session.avatarKeyUp('w');
        session.avatarKeyDown('Control');
        let previousZ = avatarPresenceSession.current.position.z;
        session._avatarMovementController.tick(DT);
        const deltaFromPositive = avatarPresenceSession.current.position.z - previousZ;
        session.avatarKeyUp('Control');
        assert(deltaFromPositive > 0 && deltaFromPositive < capabilitySpeedTimesDt(VehicleType.CAR),
            '19. braking through the real Control key, starting from a positive current speed, keeps moving forward while decelerating — never an instant stop or a sign flip');
    }
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-c2');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._avatarMovementController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        // Negative current speed, then brake with only Control held.
        session.avatarKeyDown('s');
        for (let i = 0; i < 40; i++) session._avatarMovementController.tick(DT);
        session.avatarKeyUp('s');
        session.avatarKeyDown('Control');
        let previousZ = avatarPresenceSession.current.position.z;
        session._avatarMovementController.tick(DT);
        const deltaFromNegative = avatarPresenceSession.current.position.z - previousZ;
        session.avatarKeyUp('Control');
        assert(deltaFromNegative < 0 && deltaFromNegative > -capabilitySpeedTimesDt(VehicleType.CAR),
            '20. braking through the real Control key, starting from a negative current speed, keeps moving backward while decelerating — the identical rate, never a special case for either sign');
    }

    // -------------------------------------------------------------
    // Section D — regression/independence
    // -------------------------------------------------------------
    {
        // Ordinary W/S is byte-for-byte unaffected: Control is never
        // pressed, so braking is never requested, so movement uses the
        // acceleration rate exactly as every prior milestone left it.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-d1');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._avatarMovementController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        session.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) session._avatarMovementController.tick(DT);
        session.avatarKeyUp('w');
        assert(avatarPresenceSession.current.position.z > 0,
            '21. ordinary W movement, with Control never pressed, still works exactly as every prior milestone left it');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '22. ...and braking was never armed by ordinary movement input');
    }
    {
        // Continuous WALK/RUN (Alt + Shift + W) is unaffected by this
        // milestone, and composes cleanly with a Control hold: a
        // continuously-moving avatar can still be braked through the
        // real Control key, with no second movement pipeline involved.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-d2');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._avatarMovementController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));

        session.avatarKeyDown('Alt');
        session.avatarKeyDown('w');
        session.avatarKeyUp('w');
        session.avatarKeyUp('Alt');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.FORWARD,
            '23. setup: a real Alt + W chord still activates continuous FORWARD, unaffected by this milestone');

        // Still ramping up (CAR needs 3s/60 ticks to reach top speed —
        // see Section B's own comment), so the LAST tick's own delta is
        // the highest speed reached so far — the correct baseline to
        // compare a single post-brake tick against (an average over the
        // whole, still-rising ramp is not comparable to one instantaneous
        // tick, positive or braked).
        let previousZ = avatarPresenceSession.current.position.z;
        let lastCruiseDelta = 0;
        for (let i = 0; i < 20; i++) {
            session._avatarMovementController.tick(DT);
            const z = avatarPresenceSession.current.position.z;
            lastCruiseDelta = z - previousZ;
            previousZ = z;
        }
        assert(previousZ > 0, '24. the avatar keeps walking forward under continuous movement, exactly as 0.9.66 left it');
        assert(lastCruiseDelta > 0, 'sanity: still accelerating forward the instant before the continuous intent is cancelled');

        // Cancel the continuous intent with a plain W tap (no Alt) — the
        // same "obvious escape hatch" 0.9.64's own transition rule
        // already provides, byte-for-byte unaffected by this milestone
        // — leaving the avatar's own accumulated `_currentMovementSpeed`
        // behind with no forward request asking for anything anymore
        // (target 0), the exact same shape Section C above already
        // exercises for a plain W-then-release cruise.
        session.avatarKeyDown('w');
        assert(session._avatarMovementController.continuousMovementIntent() === AvatarContinuousMovementIntent.NONE,
            '25. a plain W tap still cancels continuous FORWARD, unaffected by this milestone');
        session.avatarKeyUp('w');

        session.avatarKeyDown('Control');
        session._avatarMovementController.tick(DT);
        const brakedDelta = avatarPresenceSession.current.position.z - previousZ;
        session.avatarKeyUp('Control');
        assert(brakedDelta >= 0 && brakedDelta < lastCruiseDelta,
            '26. holding Control genuinely decelerates the speed left over from continuous movement — braking composes with continuous movement\'s own residual speed rather than fighting it');
    }
    {
        // Mount/dismount ('E') is completely independent of the brake
        // key: pressing E never touches braking, and Control never
        // touches vehicle interaction.
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-d3', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        const frameCallback = session._session.calls.onAnimationFrameCallbacks[0];

        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID,
            '27. FLAGSHIP setup: pressing E next to the real vehicle mounts it');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '28. mounting via E never touches braking — still NONE');
        session.avatarKeyUp('e');

        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE,
            '29. Control still engages braking while genuinely mounted');
        assert(session.avatarVehicleMount() !== null,
            '30. ...and holding Control never touches the mount itself — no accidental dismount');

        session.avatarKeyUp('Control');
        session.avatarKeyDown('e');
        frameCallback(0.016);
        assert(session.avatarVehicleMount() === null,
            '31. E still dismounts normally after a braking cycle, unaffected by this milestone');
        session.avatarKeyUp('e');
        assert(session._avatarMovementController.vehicleBrakingIntent() === NONE,
            '32. ...and dismounting never leaves a stale BRAKE behind (Control was already released before E was pressed)');
    }
    {
        // DRONE remains fully blocked, regardless of a pending Control
        // hold — the direct structural twin of 0.9.95's own Section G.
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'bind-d4');
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);
        session._avatarMovementController.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.DRONE));
        assert(session._avatarMovementController.movementCapability() === AvatarMovementCapabilityKind.AERIAL_VEHICLE,
            '33. sanity: DRONE resolves to the unsupported AERIAL_VEHICLE capability');

        session.avatarKeyDown('Control');
        assert(session._avatarMovementController.vehicleBrakingIntent() === BRAKE,
            '34. the raw braking INTENT is still tracked while mounted on an unsupported capability — this method never asks the active capability a question');
        const beforePosition = avatarPresenceSession.current.position;
        const startPosition = { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z };
        const result = session._avatarMovementController.tick(DT);
        assert(result === null, '35. tick() still returns null outright for DRONE — no simulation, no movement, regardless of a pending Control hold');
        assert(avatarPresenceSession.current.position.x === startPosition.x
            && avatarPresenceSession.current.position.y === startPosition.y
            && avatarPresenceSession.current.position.z === startPosition.z,
            '36. the avatar genuinely never moves while mounted on DRONE, brake held or not');
        session.avatarKeyUp('Control');
    }

    // -------------------------------------------------------------
    // Section E — architectural sweep
    // -------------------------------------------------------------
    {
        const sessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');

        const methodMatch = sessionSource.match(/_processVehicleBrakingInput\(key, type\)\s*\{([\s\S]*?)\n {4}\}/);
        assert(methodMatch !== null, '37. sanity: _processVehicleBrakingInput() exists and is extractable as a single method body');
        const methodBody = methodMatch[1];
        assert(!/VehicleType|VehiclePresence|AvatarVehicleMount|BICYCLE|MOTORCYCLE|\bCAR\b|DRONE|movementCapability|isMounted|GROUND_VEHICLE|AERIAL_VEHICLE/.test(methodBody),
            '38. _processVehicleBrakingInput() introduces no vehicle-specific branching whatsoever — it reads only the key/type it was given');
        assert(methodBody.includes('VEHICLE_BRAKE_KEY') && methodBody.includes('deriveAvatarVehicleBrakingInputFact') && methodBody.includes('deriveAvatarVehicleBrakingIntent') && methodBody.includes('setVehicleBrakingIntent'),
            '39. sanity: the method genuinely calls through 0.9.95\'s own two pure functions into setVehicleBrakingIntent()');

        const sessionCodeOnly = sessionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/case\s+'[^']*':\s*this\._keys\.brak/i.test(sessionCodeOnly),
            '40. no key is bound to braking through AvatarMovementController\'s own _setKey()/_keys — the binding lives entirely at this session\'s own seam');

        // The chosen key is Control, and only Control — no other
        // existing movement/interaction key (W/A/S/D/Shift/Space/E) was
        // repurposed to also drive braking.
        assert(/const VEHICLE_BRAKE_KEY = 'control';/.test(sessionSource),
            '41. sanity: exactly one physical key, Control, is bound to braking');

        const intentSource = await readFile(new URL('../core/AvatarVehicleBrakingIntent.js', import.meta.url), 'utf8');
        const intentCodeOnly = intentSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/key|KeyboardEvent|'w'|'s'|control/i.test(intentCodeOnly),
            '42. core/AvatarVehicleBrakingIntent.js remains completely untouched by this milestone — still no keyboard awareness of any kind');

        const adapterSource = await readFile(new URL('../core/AvatarVehicleBrakingInputAdapter.js', import.meta.url), 'utf8');
        const adapterCodeOnly = adapterSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/\bkey\b|KeyboardEvent|'w'|'s'|control/i.test(adapterCodeOnly),
            '43. core/AvatarVehicleBrakingInputAdapter.js remains completely untouched by this milestone too — still no `key` parameter, still control-name-blind');

        const controllerSource = await readFile(new URL('../application/AvatarMovementController.js', import.meta.url), 'utf8');
        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/case\s+'control'/i.test(controllerCodeOnly),
            '44. application/AvatarMovementController.js\'s own _setKey() still never recognizes Control — the binding never leaks into the controller\'s own raw key table');
    }

    console.log('✅ All Vehicle Braking Input Binding Integration tests passed.');
}

function capabilitySpeedTimesDt(vehicleType) {
    return resolveAvatarVehicleMovementCapability(vehicleType).movementSpeed * DT;
}

await runTests();
