import { AvatarVehicleInteractionController } from '../application/AvatarVehicleInteractionController.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { Position } from '../core/Position.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.670 — Avatar Inventory (store/deploy) Runtime Integration.
//
// Mirrors tests/AvatarVehicleInteractionController.test.js's own fixture
// discipline exactly (same real, deterministic seed and bicycle) —
// extended here to prove the store/deploy ('q') path end to end against
// a real AvatarPresenceSession and a real VehicleRuntimeInstances store,
// never a mock of either.
//
//   Section A: Store — mount a real bicycle, press Q, verify it lands in
//              inventory, the mount clears, and the vehicle leaves the
//              runtime store
//   Section B: No duplicate on return — walking back near the vehicle's
//              old spawn slot and syncing never rediscovers it
//   Section C: Deploy — walk far away, press Q, verify a brand new
//              VehicleInstance appears at the avatar's own current
//              position, registered in the runtime store, and mounted
//   Section D: Deploy with nothing carried is a harmless no-op
//   Section E: Held-key safety mirrors the existing 'e' discipline

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildAvatarPresenceSession(startPosition) {
    return new AvatarPresenceSession(
        { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
        { position: startPosition }
    );
}

// Same real deterministic fixture tests/AvatarVehicleInteractionController.test.js
// already relies on.
const SEED = 29;
const CLEAR_VEHICLE_ID = 'vehicle:29:-6,-1';

function findVehicle(id) {
    const vehicles = vehiclePresenceInRegion(SEED, -300, -300, 300, 300);
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${id} not found under seed ${SEED} — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function runTests() {
    const clearVehicle = findVehicle(CLEAR_VEHICLE_ID);

    // -------------------------------------------------------------
    // Section A — Store
    // -------------------------------------------------------------
    let controller;
    let avatarPresenceSession;
    let vehicleRuntimeInstances;
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        vehicleRuntimeInstances = new VehicleRuntimeInstances();
        controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances });

        assert(controller.inventory().size === 0, '1. a fresh controller carries nothing');

        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() !== null && controller.mount().vehicleId === CLEAR_VEHICLE_ID, '2. mounted the real bicycle');
        controller.keyUp('e');

        controller.keyDown('q');
        controller.tick();
        assert(controller.mount() === null, '3. pressing Q while mounted clears the mount');
        assert(controller.inventory().size === 1, '4. exactly one entry now carried');
        const entry = controller.inventory().mostRecent();
        assert(entry.id === CLEAR_VEHICLE_ID && entry.type === VehicleType.BICYCLE, '5. the carried entry is the bicycle just mounted');
        controller.keyUp('q');
    }

    // -------------------------------------------------------------
    // Section B — no duplicate on return
    // -------------------------------------------------------------
    {
        // sync() around the vehicle's own old spawn slot — a naive
        // implementation would "rediscover" it here, since
        // vehiclePresenceInRegion() has no memory of anything.
        const instances = vehicleRuntimeInstances.sync(SEED, clearVehicle.position, 5);
        const stillThere = instances.some((instance) => instance.id === CLEAR_VEHICLE_ID);
        assert(!stillThere, '6. a stored vehicle never reappears at its old spawn slot after being picked up');
    }

    // -------------------------------------------------------------
    // Section C — Deploy
    // -------------------------------------------------------------
    {
        const farPosition = new Position(clearVehicle.position.x + 500, 0, clearVehicle.position.z + 500);
        const current = avatarPresenceSession.current;
        avatarPresenceSession.update({ position: farPosition, rotation: current.rotation, animation: current.animation });

        controller.keyDown('q');
        controller.tick();

        const mount = controller.mount();
        assert(mount !== null, '7. deploying while carrying a vehicle mounts a new one');
        assert(mount.vehicleId !== CLEAR_VEHICLE_ID, '8. the deployed vehicle gets a brand new id, never the original deterministic one');
        assert(controller.inventory().size === 0, '9. the deployed entry is removed from inventory');

        const deployed = vehicleRuntimeInstances.get(mount.vehicleId);
        assert(deployed !== null, '10. the new vehicle is registered in the runtime store');
        assert(deployed.type === VehicleType.BICYCLE, '11. the deployed vehicle keeps the carried type');
        assert(deployed.position.x === farPosition.x && deployed.position.z === farPosition.z,
            '12. the deployed vehicle appears exactly at the avatar\'s own current position');
        controller.keyUp('q');
    }

    // -------------------------------------------------------------
    // Section D — deploy with nothing carried is a no-op
    // -------------------------------------------------------------
    {
        // Dismount first so the controller is unmounted again.
        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() === null, '13. dismounted back to unmounted for this section');
        controller.keyUp('e');

        assert(controller.inventory().size === 0, '14. nothing carried at this point');
        controller.keyDown('q');
        controller.tick();
        assert(controller.mount() === null, '15. pressing Q with nothing carried and nothing mounted does nothing');
        controller.keyUp('q');
    }

    // -------------------------------------------------------------
    // Section E — held-key safety mirrors the existing 'e' discipline
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const session = buildAvatarPresenceSession(startPosition);
        const runtimeInstances = new VehicleRuntimeInstances();
        const c = new AvatarVehicleInteractionController(session, { seed: SEED, vehicleRuntimeInstances: runtimeInstances });

        c.keyDown('e');
        c.tick();
        assert(c.mount() !== null, '16. mounted for this section');
        c.keyUp('e');

        c.keyDown('q');
        c.tick();
        assert(c.mount() === null && c.inventory().size === 1, '17. first tick with Q held stores the vehicle');
        c.tick();
        assert(c.inventory().size === 1, '18. a second tick with Q STILL held (key-repeat) does not deploy it right back out — one press, one transition');
        c.keyUp('q');
        c.keyDown('q');
        c.tick();
        assert(c.mount() !== null && c.inventory().size === 0, '19. releasing and re-pressing Q now deploys it — a genuine second press');
    }

    console.log('✅ All Avatar Inventory Store/Deploy Integration tests passed.');
}

runTests();
