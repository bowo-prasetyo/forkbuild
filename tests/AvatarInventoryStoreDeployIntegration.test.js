import { AvatarVehicleInteractionController } from '../application/avatar/AvatarVehicleInteractionController.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { VehicleRuntimeInstances } from '../application/world/VehicleRuntimeInstances.js';
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
//   Section F: 0.9.671 — Cycle Selection. Carry two real, distinct
//              vehicles, cycle to the OLDER one, and deploy THAT one —
//              never the most recent — through the real '[' / ']' keys
//   Section G: 0.9.700 REGRESSION — store a vehicle, then immediately
//              press E again WITHOUT MOVING: the deterministic query
//              must never re-offer the just-stored vehicle as a mount
//              target, or a second store would crash on a duplicate id

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
// A second real, distinct deterministic vehicle under the same seed —
// only used as a second thing to carry (Section F), never dismounted,
// so its own dismount-destination clearance is irrelevant here.
const SECOND_VEHICLE_ID = 'vehicle:29:-4,-8';

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

    // -------------------------------------------------------------
    // Section F — 0.9.671: Cycle Selection
    // -------------------------------------------------------------
    {
        const secondVehicle = findVehicle(SECOND_VEHICLE_ID);
        const session = buildAvatarPresenceSession(new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z));
        const runtimeInstances = new VehicleRuntimeInstances();
        const c = new AvatarVehicleInteractionController(session, { seed: SEED, vehicleRuntimeInstances: runtimeInstances });

        // Mount and store the first real vehicle (a bicycle).
        c.keyDown('e'); c.tick(); c.keyUp('e');
        assert(c.mount() !== null, '20. mounted the first real vehicle');
        c.keyDown('q'); c.tick(); c.keyUp('q');
        assert(c.inventory().size === 1, '21. stored the first vehicle');

        // Walk to the second real vehicle, mount and store it too.
        const current = session.current;
        session.update({ position: new Position(secondVehicle.position.x - 0.5, 0, secondVehicle.position.z), rotation: current.rotation, animation: current.animation });
        c.keyDown('e'); c.tick(); c.keyUp('e');
        assert(c.mount() !== null && c.mount().vehicleId === SECOND_VEHICLE_ID, '22. mounted the second real vehicle');
        c.keyDown('q'); c.tick(); c.keyUp('q');
        assert(c.inventory().size === 2, '23. now carrying two distinct real vehicles');

        // With no explicit selection, deploy would use the most recently
        // stored one (the second vehicle).
        let state = c.storeInteractionState();
        assert(state.canDeploy === true && state.carriedCount === 2 && state.selectedIndex === 2,
            '24. before cycling, the default selection is the most recent entry (position 2 of 2)');
        assert(state.vehicleType === secondVehicle.type, '25. and its reported type matches the second (most recently stored) vehicle');

        // Cycle one step OLDER, to the first vehicle.
        c.keyDown('['); c.tick(); c.keyUp('[');
        state = c.storeInteractionState();
        assert(state.selectedIndex === 1, '26. cycling previous once moves the selection to position 1 of 2 (the older entry)');
        assert(state.vehicleType === clearVehicle.type, '27. and its reported type now matches the FIRST vehicle stored, not the second');

        // Held-key safety: a single physical press of '[' must move the
        // selection exactly once, even across several ticks while the
        // key stays down — exactly the same discipline already proven
        // for Q in Section E above.
        c.keyDown('['); c.tick();
        let afterFirstTick = c.storeInteractionState().selectedIndex;
        assert(afterFirstTick === 2, '28. a fresh \'[\' press (fresh keyDown) does move the selection — here wrapping from position 1 back to position 2');
        c.tick(); // a second tick with '[' still held (key-repeat)
        assert(c.storeInteractionState().selectedIndex === 2, '29. a second tick with \'[\' STILL held (key-repeat) does not cycle again — one press, one step');
        c.keyUp('[');
        c.keyDown('['); c.tick(); c.keyUp('[');
        assert(c.storeInteractionState().selectedIndex === 1, '29b. releasing and re-pressing \'[\' cycles again — a genuine second press, back to position 1 (the older entry)');

        // Deploy now: it must bring out the OLDER (currently selected)
        // vehicle, never the most recent one, proving selection actually
        // steers deploy() rather than being purely cosmetic.
        c.keyDown('q'); c.tick(); c.keyUp('q');
        const deployedMount = c.mount();
        assert(deployedMount !== null, '30. deploying with a cycled selection still mounts a vehicle');
        const deployedInstance = runtimeInstances.get(deployedMount.vehicleId);
        assert(deployedInstance.type === clearVehicle.type, '31. the DEPLOYED vehicle matches the cycled-to (older, first-stored) one, not the most recent');
        assert(c.inventory().size === 1, '32. exactly one entry remains carried — the second vehicle, never deployed');

        // Selection resets to the default after a deploy — dismount and
        // check that the sole remaining entry (the second vehicle) is
        // now what would deploy next, with no leftover stale selection.
        c.keyDown('e'); c.tick(); c.keyUp('e');
        assert(c.mount() === null, '33. dismounted back to unmounted for this check');
        state = c.storeInteractionState();
        assert(state.canDeploy === true && state.carriedCount === 1 && state.selectedIndex === 1,
            '34. FLAGSHIP: after a deploy, selection resets to the default (most recent of whatever remains) rather than pointing at a now-deployed entry');
        assert(state.vehicleType === secondVehicle.type, '35. FLAGSHIP: and that remaining entry is genuinely the second vehicle, confirming nothing was silently lost or swapped');
    }

    // -------------------------------------------------------------
    // Section G — 0.9.700 REGRESSION: a just-stored vehicle must never
    // be re-offered as a mount target by the deterministic query
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const session = buildAvatarPresenceSession(startPosition);
        const runtimeInstances = new VehicleRuntimeInstances();
        const c = new AvatarVehicleInteractionController(session, { seed: SEED, vehicleRuntimeInstances: runtimeInstances });

        c.keyDown('e'); c.tick(); c.keyUp('e');
        assert(c.mount() !== null, '36. mounted the real bicycle');
        c.keyDown('q'); c.tick(); c.keyUp('q');
        assert(c.mount() === null && c.inventory().size === 1, '37. stored it — mount clears, one entry carried');

        // Standing in EXACTLY the same spot — a naive re-derivation of
        // mount candidates would still find the just-stored bicycle
        // (vehiclePresenceInRegion() has no memory of the store), and
        // pressing E would re-mount the very vehicle already sitting in
        // inventory.
        const state = c.vehicleInteractionState();
        assert(state.targetVehicleId === null, '38. the just-stored vehicle is never offered as a mount target while standing right where it was stored');

        c.keyDown('e'); c.tick(); c.keyUp('e');
        assert(c.mount() === null, '39. pressing E again in place does nothing — there is genuinely nothing left here to mount');
        assert(c.inventory().size === 1, '40. FLAGSHIP: inventory is untouched — a second store attempt was never even possible, so withEntryAdded()\'s own duplicate-id guard is never reached');
    }

    console.log('✅ All Avatar Inventory Store/Deploy Integration tests passed.');
}

runTests();
