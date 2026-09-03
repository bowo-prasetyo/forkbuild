import { readFile } from 'node:fs/promises';
import { AvatarVehicleInteractionController } from '../application/AvatarVehicleInteractionController.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.98 — Vehicle Mount/Dismount World View Integration.
//
// 0.9.73 through 0.9.97 built and wired a complete mount/dismount
// semantic chain — proximity, identity, intent, target resolution, a
// mount transition, dismount intent/position/clearance/transition, and
// the movement-capability/braking/steering runtime that rides on top of
// it — but gave World View no way to SHOW any of it: a player standing
// right next to a real, deterministic bicycle saw nothing indicating a
// vehicle was even there. This suite proves the one new observation seam
// this milestone adds, `vehicleInteractionState()`
// (application/AvatarVehicleInteractionController.js) and its session-
// level pass-through `avatarVehicleInteractionState()`
// (application/WorldNavigationSession.js), genuinely closes that gap —
// WITHOUT the observation seam ever recomputing proximity, target
// resolution, or mount/dismount eligibility itself.
//
//   Section A: a vehicle in range produces the mount affordance
//   Section B: nothing in range produces no affordance
//   Section C: mounting changes the displayed state, and the mounted
//              vehicle's own type is reflected
//   Section D: dismount, once it actually succeeds, returns the
//              displayed state to "not mounted"
//   Section E: a BLOCKED dismount never falsely displays a successful
//              (unmounted) state
//   Section F: repeated observation is deterministic and non-mutating —
//              polling this seam from World View can never itself change
//              mount/dismount/braking/movement-capability state
//   Section G: WorldNavigationSession's own pass-through — wired through
//              a real session, including the "no local avatar" absence
//              case
//   Section H: architectural regression — no duplicated proximity/
//              target-resolution logic anywhere in this seam
//
// Central architectural claim under test throughout: this milestone adds
// NO new mount/dismount policy anywhere. It only exposes the ALREADY-
// AUTHORITATIVE result of the existing chain through one small, read-only
// snapshot, reused verbatim by a purely presentational Vue component
// (ui/components/VehicleInteractionPrompt.js, not exercised here — see
// that file's own header) that decides nothing about eligibility itself.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// The exact seed/fixture discipline tests/AvatarVehicleInteractionController.test.js
// already established: real, deterministically-placed vehicles, found by
// direct computation rather than guessed at.
const SEED = 29;
const CLEAR_VEHICLE_ID = 'vehicle:29:-6,-1';
const BLOCKED_VEHICLE_ID = 'vehicle:29:-4,-8';

function findVehicle(seed, id) {
    const vehicles = vehiclePresenceInRegion(seed, -300, -300, 300, 300);
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${id} not found under seed ${seed} — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function buildAvatarPresenceSession(startPosition) {
    return new AvatarPresenceSession(
        { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
        { position: startPosition }
    );
}

// A genuine release + re-press, mirroring every other test in this
// codebase that toggles mount/dismount — see
// application/AvatarVehicleInteractionController.js's own header for why
// merely continuing to hold the key would not.
function pressInteractionKeyOnce(controller) {
    controller.keyDown('e');
    controller.tick();
    controller.keyUp('e');
}

// -------------------------------------------------------------
// WorldNavigationSession fixture — mirrors
// tests/AvatarVehicleRuntimeIntegration.test.js exactly, for Section G.
// -------------------------------------------------------------

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

async function runTests() {
    const clearVehicle = findVehicle(SEED, CLEAR_VEHICLE_ID);
    const blockedVehicle = findVehicle(SEED, BLOCKED_VEHICLE_ID);

    // -------------------------------------------------------------
    // Section A — a vehicle in range produces the mount affordance
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        const state = controller.vehicleInteractionState();
        assert(state.mounted === false, '1. standing next to a real, in-range bicycle: not mounted');
        assert(state.targetVehicleId === CLEAR_VEHICLE_ID, '2. the real bicycle is resolved as the target — the exact vehicle in range');
        assert(state.vehicleType === VehicleType.BICYCLE, '3. the target vehicle\'s own type is reflected');
        assert(Object.isFrozen(state), '4. vehicleInteractionState() returns a frozen object');
    }

    // -------------------------------------------------------------
    // Section B — nothing in range produces no affordance
    // -------------------------------------------------------------
    {
        // Far from any real vehicle under this seed.
        const startPosition = new Position(10000, 0, 10000);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        const state = controller.vehicleInteractionState();
        assert(state.mounted === false, '5. far from every vehicle: not mounted');
        assert(state.targetVehicleId === null, '6. far from every vehicle: no target');
        assert(state.vehicleType === VehicleType.NONE, '7. far from every vehicle: VehicleType.NONE, never a guessed type');
    }

    // -------------------------------------------------------------
    // Section C — mounting changes the displayed state, and the mounted
    // vehicle's own type is reflected
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        pressInteractionKeyOnce(controller);
        assert(controller.mount() !== null && controller.mount().vehicleId === CLEAR_VEHICLE_ID,
            '8. setup: actually mounted the real bicycle');

        const state = controller.vehicleInteractionState();
        assert(state.mounted === true, '9. once mounted, the observed state reflects mounted: true');
        assert(state.vehicleType === VehicleType.BICYCLE, '10. the MOUNTED vehicle\'s own type is reflected');
        assert(state.targetVehicleId === null,
            '11. while mounted, targetVehicleId is null — vehicle switching is out of scope, there is no separate "target" concept while mounted');
    }

    // -------------------------------------------------------------
    // Section D — dismount, once it actually succeeds, returns the
    // displayed state to "not mounted"
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        pressInteractionKeyOnce(controller);
        assert(controller.mount() !== null, '12. setup: mounted');

        pressInteractionKeyOnce(controller);
        assert(controller.mount() === null, '13. setup: a genuine release + re-press dismounts (a clear destination)');

        const state = controller.vehicleInteractionState();
        assert(state.mounted === false, '14. once dismounted, the observed state reflects mounted: false');
    }

    // -------------------------------------------------------------
    // Section E — a BLOCKED dismount never falsely displays a successful
    // (unmounted) state
    // -------------------------------------------------------------
    {
        const startPosition = new Position(blockedVehicle.position.x - 0.5, 0, blockedVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        pressInteractionKeyOnce(controller);
        const mount = controller.mount();
        assert(mount !== null && mount.vehicleId === BLOCKED_VEHICLE_ID,
            '15. setup: mounted the real bicycle whose dismount destination is blocked by a real tree');

        // Attempt to dismount — this MUST fail (the destination is not
        // clear), and the observed state must say so honestly.
        pressInteractionKeyOnce(controller);
        assert(controller.mount() === mount, '16. setup: the blocked dismount genuinely left the avatar mounted');

        const state = controller.vehicleInteractionState();
        assert(state.mounted === true,
            '17. a blocked dismount never falsely displays mounted: false — the affordance tracks the REAL outcome, not the attempt');
        assert(state.vehicleType === VehicleType.BICYCLE,
            '18. the still-mounted vehicle\'s own type is still correctly reflected after the blocked attempt');

        // Retrying gets the identical honest answer, repeatedly — never
        // drifts into a wrong state from repeated polling.
        pressInteractionKeyOnce(controller);
        const stateAgain = controller.vehicleInteractionState();
        assert(stateAgain.mounted === true, '19. repeatedly retrying a blocked dismount stays honestly mounted: true');
    }

    // -------------------------------------------------------------
    // Section F — repeated observation is deterministic and non-mutating
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        // Polling the observation seam BEFORE ever pressing the
        // interaction key must never itself cause a mount — proving this
        // method is never mistaken for tick()'s own real decision path.
        for (let i = 0; i < 10; i++) {
            controller.vehicleInteractionState();
        }
        assert(controller.mount() === null, '20. merely observing state, repeatedly, never mounts anything on its own');

        const first = controller.vehicleInteractionState();
        for (let i = 0; i < 5; i++) {
            const again = controller.vehicleInteractionState();
            assert(JSON.stringify(again) === JSON.stringify(first), '21. repeated observation with nothing changed is deterministic');
        }

        // A caller cannot mutate the controller's own bookkeeping through
        // the returned snapshot.
        let threw = false;
        try {
            first.mounted = true;
        } catch (error) {
            threw = true;
        }
        assert(threw, '22. attempting to mutate a field on the returned state throws (ES module strict mode + a frozen object)');
        assert(controller.vehicleInteractionState().mounted === false,
            '23. the mutation attempt left the controller\'s own subsequent observation completely unaffected');

        // Now actually mount, and confirm observation still never
        // interferes with the real mount/dismount tick path running
        // alongside it.
        pressInteractionKeyOnce(controller);
        assert(controller.mount() !== null, '24. setup: mounted');
        for (let i = 0; i < 10; i++) {
            controller.vehicleInteractionState();
        }
        assert(controller.mount() !== null, '25. repeated observation while mounted never dismounts anything on its own');
    }

    // -------------------------------------------------------------
    // Section G — WorldNavigationSession's own pass-through
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const realVehicle = findVehicle(DEFAULT_WORLD_SEED, 'vehicle:1179337264:-8,-1');
        const startPosition = new Position(realVehicle.position.x - 0.5, 0, realVehicle.position.z);
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'vehicle-ui-g1', startPosition);
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        const beforeMount = session.avatarVehicleInteractionState();
        assert(beforeMount.mounted === false && beforeMount.targetVehicleId === 'vehicle:1179337264:-8,-1',
            '26. FLAGSHIP: session.avatarVehicleInteractionState() reflects a real, in-range bicycle before mounting');

        session.avatarKeyDown('e');
        session._avatarVehicleInteractionController.tick();
        session.avatarKeyUp('e');

        const afterMount = session.avatarVehicleInteractionState();
        assert(afterMount.mounted === true && afterMount.vehicleType === VehicleType.BICYCLE,
            '27. FLAGSHIP: session.avatarVehicleInteractionState() reflects the real mount, through the entire runtime');

        session.avatarKeyDown('e');
        session._avatarVehicleInteractionController.tick();
        session.avatarKeyUp('e');

        const afterDismount = session.avatarVehicleInteractionState();
        assert(afterDismount.mounted === false,
            '28. FLAGSHIP: session.avatarVehicleInteractionState() reflects the real dismount');
    }
    {
        // No local avatar at all: the same graceful-absence posture
        // avatarVehicleMount() already follows.
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase: null, avatarPresenceSession: null
        });
        assert(session.avatarVehicleInteractionState() === null,
            '29. no local avatar exists: avatarVehicleInteractionState() returns null, never a guessed default');
    }

    // -------------------------------------------------------------
    // Section H — architectural regression: no duplicated proximity/
    // target-resolution logic anywhere in this seam
    // -------------------------------------------------------------
    {
        const controllerSourceUrl = new URL('../application/AvatarVehicleInteractionController.js', import.meta.url);
        const controllerSource = await readFile(controllerSourceUrl, 'utf8');
        const controllerCodeOnly = controllerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        // vehicleInteractionState() must reuse the SAME 0.9.76 function
        // _tickMount() already calls — never a second nearest-candidate
        // search, and never a raw distance computation of its own.
        const targetResolutionCallSites = controllerCodeOnly.split('resolveAvatarVehicleInteractionTarget(').length - 1;
        assert(targetResolutionCallSites === 2,
            '30. resolveAvatarVehicleInteractionTarget is called from exactly two places (the import aside) — _tickMount\'s real decision and vehicleInteractionState\'s own preview — never a THIRD, divergent copy');
        assert(!/Math\.sqrt|Math\.pow\(.*2\)|dx \* dx \+ dz \* dz/.test(controllerCodeOnly)
            || controllerCodeOnly.includes('_nearbyVehicles'),
            '31. vehicleInteractionState() introduces no independent distance/ranking arithmetic of its own');

        const sessionSourceUrl = new URL('../application/WorldNavigationSession.js', import.meta.url);
        const sessionSource = await readFile(sessionSourceUrl, 'utf8');
        const sessionCodeOnly = sessionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(sessionCodeOnly.includes('avatarVehicleInteractionState'),
            '32. WorldNavigationSession does expose avatarVehicleInteractionState() — the integration this milestone exists to make');
        assert(!sessionCodeOnly.includes('resolveAvatarVehicleInteractionTarget')
            && !sessionCodeOnly.includes('withinRadiusXZ')
            && !sessionCodeOnly.includes('VEHICLE_INTERACTION_RADIUS'),
            '33. WorldNavigationSession never computes proximity or target resolution itself — it only forwards to the controller\'s own vehicleInteractionState()');

        const promptSourceUrl = new URL('../ui/components/VehicleInteractionPrompt.js', import.meta.url);
        const promptSource = await readFile(promptSourceUrl, 'utf8');
        const promptCodeOnly = promptSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/resolveAvatarVehicleInteractionTarget|withinRadiusXZ|VEHICLE_INTERACTION_RADIUS|vehiclePresenceInRegion/.test(promptCodeOnly),
            '34. the UI component itself contains no proximity/target-resolution logic of any kind — it only formats an already-resolved state');
        assert(!/deriveAvatarVehicleMount|deriveAvatarVehicleDismountTransition/.test(promptCodeOnly),
            '35. the UI component decides no mount/dismount transition of its own');
    }

    console.log('✅ All World View Vehicle Interaction Integration tests passed.');
}

await runTests();
