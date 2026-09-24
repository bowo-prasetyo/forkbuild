import { AvatarVehicleInteractionController } from '../application/avatar/AvatarVehicleInteractionController.js';
import { AvatarAnimalInteractionController } from '../application/avatar/AvatarAnimalInteractionController.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarInventoryStore } from '../application/avatar/AvatarInventoryStore.js';
import { VehicleRuntimeInstances } from '../application/world/VehicleRuntimeInstances.js';
import { AnimalRuntimeInstances } from '../application/world/AnimalRuntimeInstances.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { animalPresenceInRegion } from '../core/AnimalPlacement.js';
import { Position } from '../core/Position.js';
import { InventoryEntryKind } from '../core/AvatarInventory.js';

// 0.9.700 — Mixed Vehicle/Animal Shared Inventory Integration.
//
// core/AvatarInventory.js's own header is explicit: "one avatar carries
// one backpack, vehicles and animals together." This is the ONE test
// that actually proves it, end to end, through TWO real, independent
// controllers sharing the SAME AvatarInventoryStore — never each
// controller's own isolated fixture. Every prior test (vehicle-only,
// animal-only) could pass even if a shared inventory quietly let one
// kind corrupt the other; this is the test that would catch it.
//
//   Section A: store a vehicle, catch an animal — both land in the SAME
//              inventory, each controller's own carriedCount/
//              selectedIndex stays scoped to its own kind
//   Section B: cycling the VEHICLE selection never lands on the animal
//   Section C: deploying the vehicle never touches the carried animal,
//              and vice versa for releasing the animal
//   Section D: FLAGSHIP — after both are gone, both controllers agree
//              the shared inventory is empty

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildAvatarPresenceSession(startPosition) {
    return new AvatarPresenceSession(
        { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
        { position: startPosition }
    );
}

const SEED = 29;
const VEHICLE_ID = 'vehicle:29:-6,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(SEED, -300, -300, 300, 300);
    const vehicle = vehicles.find((v) => v.id === VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${VEHICLE_ID} not found under seed ${SEED}`);
    }
    return vehicle;
}

function findRealAnimal() {
    const animals = animalPresenceInRegion(SEED, -300, -300, 300, 300);
    if (animals.length === 0) {
        throw new Error(`No animals found under seed ${SEED}`);
    }
    return animals[0];
}

function runTests() {
    const vehicle = findRealVehicle();
    const animal = findRealAnimal();

    const inventoryStore = new AvatarInventoryStore();
    const vehicleRuntimeInstances = new VehicleRuntimeInstances();
    const animalRuntimeInstances = new AnimalRuntimeInstances();
    const session = buildAvatarPresenceSession(new Position(vehicle.position.x - 0.5, 0, vehicle.position.z));

    const vehicleController = new AvatarVehicleInteractionController(session, {
        seed: SEED,
        vehicleRuntimeInstances,
        avatarInventoryStore: inventoryStore
    });
    const animalController = new AvatarAnimalInteractionController(session, {
        seed: SEED,
        animalRuntimeInstances,
        avatarInventoryStore: inventoryStore
    });

    assert(vehicleController.inventory() === animalController.inventory(), '1. both controllers read the exact same shared AvatarInventory reference');

    // -------------------------------------------------------------
    // Section A — store a vehicle, then catch an animal
    // -------------------------------------------------------------
    vehicleController.keyDown('e'); vehicleController.tick(); vehicleController.keyUp('e');
    assert(vehicleController.mount() !== null, '2. mounted the real vehicle');
    vehicleController.keyDown('q'); vehicleController.tick(); vehicleController.keyUp('q');
    assert(vehicleController.inventory().size === 1, '3. stored it — one entry in the SHARED inventory');

    {
        const current = session.current;
        session.update({ position: new Position(animal.position.x - 0.5, 0, animal.position.z), rotation: current.rotation, animation: current.animation });
    }
    animalController.keyDown('f'); animalController.tick(); animalController.keyUp('f');
    assert(animalController.inventory().size === 2, '4. catching the animal grows the SAME shared inventory to two entries');
    assert(vehicleController.inventory().size === 2, '5. and the vehicle controller sees that same growth — one inventory, not two');

    {
        const vState = vehicleController.storeInteractionState();
        assert(vState.carriedCount === 1, '6. the vehicle controller\'s own carriedCount is scoped to VEHICLE only — 1, never 2');
        assert(vState.vehicleType === vehicle.type, '7. and reports the real vehicle\'s own type');
        const aState = animalController.catchInteractionState();
        assert(aState.carriedCount === 1, '8. the animal controller\'s own carriedCount is likewise scoped to ANIMAL only — 1, never 2');
        assert(aState.species === animal.species, '9. and reports the real animal\'s own species');
    }
    assert(vehicleController.inventory().entriesOf(InventoryEntryKind.VEHICLE).length === 1
        && vehicleController.inventory().entriesOf(InventoryEntryKind.ANIMAL).length === 1,
        '10. the shared inventory itself holds exactly one of each kind');

    // -------------------------------------------------------------
    // Section B — cycling VEHICLE selection never lands on the animal
    // -------------------------------------------------------------
    vehicleController.keyDown('['); vehicleController.tick(); vehicleController.keyUp('[');
    {
        const vState = vehicleController.storeInteractionState();
        assert(vState.vehicleType === vehicle.type && vState.carriedCount === 1 && vState.selectedIndex === 1,
            '11. cycling with only one carried vehicle stays on that same vehicle — never wraps into the carried animal');
    }

    // -------------------------------------------------------------
    // Section C — deploying the vehicle never touches the animal
    // -------------------------------------------------------------
    vehicleController.keyDown('q'); vehicleController.tick(); vehicleController.keyUp('q');
    assert(vehicleController.mount() !== null, '12. deployed — mounted a (freshly-minted-id) vehicle');
    assert(vehicleController.inventory().size === 1, '13. exactly one entry remains in the shared inventory — the animal');
    assert(vehicleController.inventory().entriesOf(InventoryEntryKind.ANIMAL).length === 1
        && vehicleController.inventory().entriesOf(InventoryEntryKind.VEHICLE).length === 0,
        '14. and it is genuinely the animal, not a leftover vehicle');

    // Move far away from the deployed vehicle and the animal's own
    // current spot so F unambiguously means "release," not "catch."
    {
        const current = session.current;
        session.update({ position: new Position(current.position.x + 1000, 0, current.position.z + 1000), rotation: current.rotation, animation: current.animation });
    }
    animalController.keyDown('f'); animalController.tick(); animalController.keyUp('f');
    assert(animalController.inventory().size === 0, '15. releasing the animal empties the shared inventory');

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: both controllers agree it's empty
    // -------------------------------------------------------------
    assert(vehicleController.inventory().size === 0, '16. FLAGSHIP: the vehicle controller sees the same empty shared inventory');
    assert(vehicleController.storeInteractionState().canDeploy === false, '17. FLAGSHIP: vehicle deploy is no longer offered');
    assert(animalController.catchInteractionState().canRelease === false, '18. FLAGSHIP: animal release is no longer offered');

    console.log('✅ All Mixed Vehicle/Animal Shared Inventory Integration tests passed.');
}

runTests();
