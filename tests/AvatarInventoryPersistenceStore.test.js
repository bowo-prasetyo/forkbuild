import { StorageProvider } from '../storage/StorageProvider.js';
import { AvatarInventoryPersistenceStore } from '../storage/AvatarInventoryPersistenceStore.js';
import { AvatarInventoryStore } from '../application/avatar/AvatarInventoryStore.js';
import {
    AvatarInventory,
    AvatarInventoryEntry,
    InventoryEntryKind,
    emptyAvatarInventory,
    withEntryAdded
} from '../core/AvatarInventory.js';
import { VehicleType } from '../core/VehicleType.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';

// 0.9.701 — World View Persistence, storage/AvatarInventoryPersistenceStore.js.
//
//   Section A: round-trip — save() then load() preserves every entry
//   Section B: absence — a never-written store degrades to an empty
//              inventory, never a thrown error
//   Section C: malformed data degrades to an empty inventory
//   Section D: storage failure propagates out of save(), never swallowed
//   Section E: AvatarInventoryStore integration — a persistenceStore
//              wired at construction rehydrates; every set() persists;
//              a store built with none behaves exactly as it always did

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

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('storage is unavailable'); }
    load() { throw new Error('storage is unavailable'); }
    remove() {}
    list() { return []; }
}

function bicycleEntry(id) {
    return new AvatarInventoryEntry({ id, kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
}

function deerEntry(id) {
    return new AvatarInventoryEntry({ id, kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.DEER });
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — round-trip.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const store = new AvatarInventoryPersistenceStore(provider);
        const inventory = withEntryAdded(withEntryAdded(emptyAvatarInventory(), bicycleEntry('v1')), deerEntry('a1'));
        store.save(inventory);

        const loaded = store.load();
        assert(loaded instanceof AvatarInventory, '1. load() returns a real AvatarInventory');
        assert(loaded.size === 2, '2. both entries round-trip');
        assert(loaded.get('v1').kind === InventoryEntryKind.VEHICLE && loaded.get('v1').type === VehicleType.BICYCLE, '3. the vehicle entry round-trips its kind/type');
        assert(loaded.get('a1').kind === InventoryEntryKind.ANIMAL && loaded.get('a1').type === ANIMAL_SPECIES.DEER, '4. the animal entry round-trips its kind/type');

        // A fresh store instance over the same underlying storage
        // reconstructs the identical inventory — restart semantics.
        const reloaded = new AvatarInventoryPersistenceStore(provider).load();
        assert(reloaded.size === 2, '5. a fresh store instance over the same storage sees the same inventory');
    }

    // -------------------------------------------------------------
    // Section B — absence.
    // -------------------------------------------------------------
    {
        const store = new AvatarInventoryPersistenceStore(new InMemoryStorageProvider());
        const loaded = store.load();
        assert(loaded instanceof AvatarInventory && loaded.size === 0, '6. a never-written store degrades to an empty AvatarInventory, never null and never a thrown error');
    }

    // -------------------------------------------------------------
    // Section C — malformed data.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        provider.save('avatar-inventory', { entries: 'not-an-array' });
        const loaded = new AvatarInventoryPersistenceStore(provider).load();
        assert(loaded instanceof AvatarInventory && loaded.size === 0, '7. malformed persisted data degrades to an empty inventory rather than throwing');

        const provider2 = new InMemoryStorageProvider();
        provider2.save('avatar-inventory', 'not-even-an-object');
        const loaded2 = new AvatarInventoryPersistenceStore(provider2).load();
        assert(loaded2 instanceof AvatarInventory && loaded2.size === 0, '8. a non-object persisted value degrades to an empty inventory too');
    }

    // -------------------------------------------------------------
    // Section D — storage failure propagates.
    // -------------------------------------------------------------
    {
        const store = new AvatarInventoryPersistenceStore(new ThrowingStorageProvider());
        let threw = false;
        try {
            store.save(emptyAvatarInventory());
        } catch {
            threw = true;
        }
        assert(threw, '9. a genuine StorageProvider failure propagates unmodified out of save()');

        // load() itself still degrades gracefully even when the
        // underlying provider throws — see this store's own header.
        const loaded = store.load();
        assert(loaded instanceof AvatarInventory && loaded.size === 0, '10. load() degrades to an empty inventory even when the provider throws');
    }

    // -------------------------------------------------------------
    // Section E — AvatarInventoryStore integration.
    // -------------------------------------------------------------
    {
        // No persistenceStore supplied: exactly the pre-0.9.701 behavior.
        const bare = new AvatarInventoryStore();
        assert(bare.get().size === 0, '11. a bare AvatarInventoryStore still starts empty, unchanged');
        bare.set(withEntryAdded(emptyAvatarInventory(), bicycleEntry('v2')));
        assert(bare.get().size === 1, '12. set() still works with no persistence wired');

        // Wired: construction rehydrates from whatever was last saved.
        const provider = new InMemoryStorageProvider();
        const persistenceStore = new AvatarInventoryPersistenceStore(provider);
        persistenceStore.save(withEntryAdded(emptyAvatarInventory(), deerEntry('a2')));
        const rehydrated = new AvatarInventoryStore(persistenceStore);
        assert(rehydrated.get().size === 1 && rehydrated.get().has('a2'), '13. a wired AvatarInventoryStore rehydrates from persisted state at construction');

        // set() persists immediately.
        rehydrated.set(withEntryAdded(rehydrated.get(), bicycleEntry('v3')));
        const freshRead = persistenceStore.load();
        assert(freshRead.size === 2 && freshRead.has('v3'), '14. set() immediately persists the new inventory — a second, independent read sees it');

        // A brand new AvatarInventoryStore over the SAME persistence
        // store rehydrates to the latest saved state — reload semantics.
        const afterReload = new AvatarInventoryStore(persistenceStore);
        assert(afterReload.get().size === 2 && afterReload.get().has('a2') && afterReload.get().has('v3'), '15. a fresh AvatarInventoryStore over the same persistence store reconstructs exactly what the previous one last saved — the reload scenario this milestone exists for');
    }

    console.log('✅ All Avatar Inventory Persistence Store tests passed.');
}

runTests();
