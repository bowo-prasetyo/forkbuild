import { deriveAvatarVehicleStoreTransition } from '../core/AvatarVehicleStoreTransition.js';
import { AvatarVehicleStoreIntent } from '../core/AvatarVehicleStoreIntent.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { emptyAvatarInventory, withEntryAdded, createAvatarInventoryEntry, InventoryEntryKind } from '../core/AvatarInventory.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.670 — Avatar Vehicle Store Transition, core/AvatarVehicleStoreTransition.js.
//
//   Section A: the one rule — mounted + STORE + a resolved vehicle stores it
//   Section B: every "nothing happens" branch returns the exact unchanged pair
//   Section C: defensive/malformed input
//   Section D: FLAGSHIP — mount, store, verify inventory contents and
//              mount clearing together

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    const { NONE, STORE } = AvatarVehicleStoreIntent;

    // -------------------------------------------------------------
    // Section A — the one rule
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarVehicleStoreTransition({
            currentMount: mount,
            currentInventory: inventory,
            storeIntent: STORE,
            vehicleId: 'vehicle:1:0,0',
            vehicleType: VehicleType.BICYCLE
        });
        assert(result.mount === null, '1. a store while mounted, with a resolved vehicle, clears the mount');
        assert(result.inventory !== inventory, '2. a new inventory is returned, never the same reference');
        assert(result.inventory.size === 1, '3. exactly one entry was added');
        const entry = result.inventory.mostRecent();
        assert(entry.id === 'vehicle:1:0,0' && entry.kind === InventoryEntryKind.VEHICLE && entry.type === VehicleType.BICYCLE,
            '4. the entry carries the vehicle\'s own id/kind/type');
    }

    // -------------------------------------------------------------
    // Section B — unchanged branches
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarVehicleStoreTransition({
            currentMount: null,
            currentInventory: inventory,
            storeIntent: STORE,
            vehicleId: 'vehicle:1:0,0',
            vehicleType: VehicleType.BICYCLE
        });
        assert(result.mount === null && result.inventory === inventory, '5. not mounted -> unchanged, even with STORE and a resolved vehicle');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarVehicleStoreTransition({
            currentMount: mount,
            currentInventory: inventory,
            storeIntent: NONE,
            vehicleId: 'vehicle:1:0,0',
            vehicleType: VehicleType.BICYCLE
        });
        assert(result.mount === mount && result.inventory === inventory, '6. no STORE intent -> unchanged, exact same references');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarVehicleStoreTransition({
            currentMount: mount,
            currentInventory: inventory,
            storeIntent: STORE,
            vehicleId: null,
            vehicleType: null
        });
        assert(result.mount === mount && result.inventory === inventory, '7. no vehicle resolved (caller could not identify it) -> unchanged');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarVehicleStoreTransition({
            currentMount: mount,
            currentInventory: inventory,
            storeIntent: STORE,
            vehicleId: 'vehicle:1:0,0',
            vehicleType: VehicleType.NONE
        });
        assert(result.mount === mount && result.inventory === inventory, '8. VehicleType.NONE is never a real resolved vehicle -> unchanged');
    }

    // -------------------------------------------------------------
    // Section C — defensive/malformed input
    // -------------------------------------------------------------
    {
        let threw = false;
        try {
            deriveAvatarVehicleStoreTransition({ currentMount: 'not-a-mount', currentInventory: emptyAvatarInventory(), storeIntent: NONE });
        } catch (e) { threw = true; }
        assert(threw, '9. an invalid currentMount throws');
    }
    {
        let threw = false;
        try {
            deriveAvatarVehicleStoreTransition({ currentMount: null, currentInventory: { entries: [] }, storeIntent: NONE });
        } catch (e) { threw = true; }
        assert(threw, '10. a currentInventory that is not a real AvatarInventory throws');
    }
    {
        let threw = false;
        try {
            deriveAvatarVehicleStoreTransition({ currentMount: null, currentInventory: emptyAvatarInventory(), storeIntent: 'garbage' });
        } catch (e) { threw = true; }
        assert(threw, '11. an invalid storeIntent throws');
    }
    {
        let threw = false;
        try {
            deriveAvatarVehicleStoreTransition({
                currentMount: createAvatarVehicleMount('vehicle:1:0,0'),
                currentInventory: emptyAvatarInventory(),
                storeIntent: STORE,
                vehicleId: 'vehicle:1:0,0',
                vehicleType: 'garbage'
            });
        } catch (e) { threw = true; }
        assert(threw, '12. an invalid vehicleType throws');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: an inventory with something already in it
    // gets a second entry appended, mount clears, first entry untouched
    // -------------------------------------------------------------
    {
        const already = withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({
            id: 'vehicle:1:9,9', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR
        }));
        const mount = createAvatarVehicleMount('vehicle:1:0,0');
        const result = deriveAvatarVehicleStoreTransition({
            currentMount: mount,
            currentInventory: already,
            storeIntent: STORE,
            vehicleId: 'vehicle:1:0,0',
            vehicleType: VehicleType.BICYCLE
        });
        assert(result.mount === null, '13. FLAGSHIP: mount clears');
        assert(result.inventory.size === 2, '14. FLAGSHIP: the pre-existing entry survives alongside the new one');
        assert(result.inventory.has('vehicle:1:9,9') && result.inventory.has('vehicle:1:0,0'), '15. FLAGSHIP: both ids present');
        assert(result.inventory.mostRecent().id === 'vehicle:1:0,0', '16. FLAGSHIP: the just-stored vehicle is now most recent');
        assert(already.size === 1, '17. FLAGSHIP: the original inventory passed in is never mutated');
    }

    console.log('✅ All Avatar Vehicle Store Transition tests passed.');
}

runTests();
