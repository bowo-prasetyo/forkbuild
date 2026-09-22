import {
    AvatarInventory,
    AvatarInventoryEntry,
    InventoryEntryKind,
    createAvatarInventoryEntry,
    isValidAvatarInventoryEntry,
    isValidInventoryEntryKind,
    emptyAvatarInventory,
    isValidAvatarInventory,
    withEntryAdded,
    withEntryRemoved
} from '../core/AvatarInventory.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.670 — Avatar Inventory, core/AvatarInventory.js.
//
//   Section A: InventoryEntryKind vocabulary
//   Section B: AvatarInventoryEntry construction/validation
//   Section C: AvatarInventory construction, has()/mostRecent()
//   Section D: withEntryAdded()/withEntryRemoved() — immutability,
//              unchanged-reference discipline
//   Section E: FLAGSHIP — store two vehicles, deploy them back out in
//              LIFO order

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — InventoryEntryKind vocabulary
    // -------------------------------------------------------------
    {
        assert(InventoryEntryKind.VEHICLE === 'vehicle', '1. InventoryEntryKind.VEHICLE is "vehicle"');
        assert(Object.isFrozen(InventoryEntryKind), '2. InventoryEntryKind is frozen');
        assert(Object.keys(InventoryEntryKind).length === 1, '3. InventoryEntryKind has exactly one value today — no ANIMAL yet');
        assert(isValidInventoryEntryKind(InventoryEntryKind.VEHICLE), '4. VEHICLE is valid');
        assert(!isValidInventoryEntryKind('animal'), '5. an unrelated string is not valid');
        assert(!isValidInventoryEntryKind(undefined), '6. undefined is not valid');
    }

    // -------------------------------------------------------------
    // Section B — AvatarInventoryEntry construction/validation
    // -------------------------------------------------------------
    {
        const entry = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        assert(entry instanceof AvatarInventoryEntry, '7. createAvatarInventoryEntry returns an AvatarInventoryEntry');
        assert(entry.id === 'vehicle:1:0,0' && entry.kind === InventoryEntryKind.VEHICLE && entry.type === VehicleType.BICYCLE,
            '8. fields round-trip exactly');
        assert(Object.isFrozen(entry), '9. an entry is frozen');
        assert(isValidAvatarInventoryEntry(entry), '10. isValidAvatarInventoryEntry accepts a real entry');
        assert(!isValidAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }),
            '11. a plain object, even shaped correctly, is not valid — must be a real instance');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: '', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }); } catch (e) { threw = true; }
        assert(threw, '12. an empty string id throws');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: 'garbage', type: VehicleType.BICYCLE }); } catch (e) { threw = true; }
        assert(threw, '13. an invalid kind throws');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.VEHICLE, type: VehicleType.NONE }); } catch (e) { threw = true; }
        assert(threw, '14. a VEHICLE entry of type NONE throws — "no vehicle" is never a carried item');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.VEHICLE, type: 'garbage' }); } catch (e) { threw = true; }
        assert(threw, '15. a VEHICLE entry with an invalid type throws');
    }
    {
        const entry = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const json = entry.toJSON();
        const restored = AvatarInventoryEntry.fromJSON(json);
        assert(restored.id === entry.id && restored.kind === entry.kind && restored.type === entry.type,
            '16. toJSON()/fromJSON() round-trip an entry exactly');
    }

    // -------------------------------------------------------------
    // Section C — AvatarInventory construction, has()/mostRecent()
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        assert(inventory instanceof AvatarInventory, '17. emptyAvatarInventory() returns an AvatarInventory');
        assert(inventory.size === 0, '18. an empty inventory has size 0');
        assert(inventory.mostRecent() === null, '19. an empty inventory has no most-recent entry');
        assert(!inventory.has('anything'), '20. an empty inventory has() nothing');
        assert(isValidAvatarInventory(inventory), '21. isValidAvatarInventory accepts a real instance');
        assert(!isValidAvatarInventory({ entries: [] }), '22. a plain object is not a valid AvatarInventory');
        assert(Object.isFrozen(inventory), '23. an AvatarInventory is frozen');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const moto = createAvatarInventoryEntry({ id: 'b', kind: InventoryEntryKind.VEHICLE, type: VehicleType.MOTORCYCLE });
        const inventory = new AvatarInventory([bike, moto]);
        assert(inventory.size === 2, '24. a two-entry inventory has size 2');
        assert(inventory.has('a') && inventory.has('b'), '25. has() finds both entries by id');
        assert(inventory.mostRecent() === moto, '26. mostRecent() returns the LAST entry, not the first');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const dupe = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        let threw = false;
        try { new AvatarInventory([bike, dupe]); } catch (e) { threw = true; }
        assert(threw, '27. two entries sharing one id throws — ids must be unique within an inventory');
    }

    // -------------------------------------------------------------
    // Section D — withEntryAdded()/withEntryRemoved()
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        const entry = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const next = withEntryAdded(inventory, entry);
        assert(next !== inventory, '28. withEntryAdded() returns a brand new instance');
        assert(inventory.size === 0, '29. the original inventory is never mutated');
        assert(next.size === 1 && next.has('a'), '30. the new inventory carries the added entry');
    }
    {
        const inventory = withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }));
        let threw = false;
        try {
            withEntryAdded(inventory, createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR }));
        } catch (e) { threw = true; }
        assert(threw, '31. adding a duplicate id throws rather than silently overwriting');
    }
    {
        const inventory = withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }));
        const same = withEntryRemoved(inventory, 'not-present');
        assert(same === inventory, '32. removing an id that is not present returns the exact same reference — unchanged, not a look-alike copy');
    }
    {
        const entry = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), entry);
        const next = withEntryRemoved(inventory, 'a');
        assert(next !== inventory, '33. removing a present id returns a new instance');
        assert(next.size === 0 && !next.has('a'), '34. the entry is actually gone from the new instance');
        assert(inventory.size === 1, '35. the original inventory is never mutated by removal either');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: store two vehicles, deploy in LIFO order
    // -------------------------------------------------------------
    {
        let inventory = emptyAvatarInventory();
        const bike = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const car = createAvatarInventoryEntry({ id: 'vehicle:1:5,5', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });

        inventory = withEntryAdded(inventory, bike);
        assert(inventory.mostRecent() === bike, '36. FLAGSHIP step 1: storing one vehicle makes it the most recent');

        inventory = withEntryAdded(inventory, car);
        assert(inventory.mostRecent() === car, '37. FLAGSHIP step 2: storing a second makes IT the most recent');
        assert(inventory.size === 2, '38. FLAGSHIP step 2b: both are carried');

        inventory = withEntryRemoved(inventory, car.id);
        assert(inventory.mostRecent() === bike, '39. FLAGSHIP step 3: deploying the car falls back to the bike as most recent');
        assert(inventory.size === 1, '40. FLAGSHIP step 3b: only the bike remains carried');

        inventory = withEntryRemoved(inventory, bike.id);
        assert(inventory.mostRecent() === null && inventory.size === 0, '41. FLAGSHIP step 4: deploying the bike empties the inventory');
    }

    console.log('✅ All Avatar Inventory tests passed.');
}

runTests();
