import { StorageProvider } from '../storage/StorageProvider.js';
import { VehicleRuntimeInstancePersistenceStore } from '../storage/VehicleRuntimeInstancePersistenceStore.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';

// 0.9.701 — World View Persistence, storage/VehicleRuntimeInstancePersistenceStore.js.
//
//   Section A: save()/load() round-trip — instances and excludedIds
//   Section B: absence/malformed data degrades to empty, never throws
//   Section C: a corrupted single entry drops only that entry
//   Section D: seeding a fresh VehicleRuntimeInstances from load()'s
//              result via its own public add()/discard() reproduces the
//              exact runtime state a previous session left off with —
//              including a MOVED vehicle, never just its spawn point
//   Section E: an excluded (stored) vehicle never reappears after
//              seeding, even though its deterministic spawn slot is
//              still there for nearbyVehicleInstances() to find
//   Section F: storage failure propagates out of save()

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

function bicycle(id, position, heading = 0) {
    return new VehicleInstance({ id, type: VehicleType.BICYCLE, spawnPosition: position, position, heading });
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — round-trip.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const store = new VehicleRuntimeInstancePersistenceStore(provider);
        const instance = bicycle('vehicle:1', new Position(10, 0, -5), 90);
        store.save([instance], ['vehicle:discarded']);

        const { instances, excludedIds } = store.load();
        assert(instances.length === 1, '1. one instance round-trips');
        assert(instances[0] instanceof VehicleInstance, '2. load() reconstructs real VehicleInstance objects');
        assert(instances[0].id === 'vehicle:1' && instances[0].position.x === 10 && instances[0].heading === 90, '3. id/position/heading all round-trip exactly');
        assert(excludedIds.length === 1 && excludedIds[0] === 'vehicle:discarded', '4. excludedIds round-trips');

        // Restart semantics: a fresh store instance over the same
        // underlying storage reconstructs the identical snapshot.
        const reloaded = new VehicleRuntimeInstancePersistenceStore(provider).load();
        assert(reloaded.instances.length === 1 && reloaded.excludedIds.length === 1, '5. a fresh store instance over the same storage sees the same snapshot');
    }

    // -------------------------------------------------------------
    // Section B — absence/malformed data.
    // -------------------------------------------------------------
    {
        const empty = new VehicleRuntimeInstancePersistenceStore(new InMemoryStorageProvider()).load();
        assert(Array.isArray(empty.instances) && empty.instances.length === 0, '6. a never-written store returns an empty instances array');
        assert(Array.isArray(empty.excludedIds) && empty.excludedIds.length === 0, '7. ...and an empty excludedIds array — never null, never a thrown error');

        const provider = new InMemoryStorageProvider();
        provider.save('vehicle-runtime-instances', 'not-an-object');
        const malformed = new VehicleRuntimeInstancePersistenceStore(provider).load();
        assert(malformed.instances.length === 0 && malformed.excludedIds.length === 0, '8. a non-object persisted value degrades to empty rather than throwing');
    }

    // -------------------------------------------------------------
    // Section C — one corrupted entry drops only that entry.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        provider.save('vehicle-runtime-instances', {
            instances: [
                bicycle('vehicle:good', new Position(1, 0, 1)).toJSON(),
                { id: 'vehicle:bad', type: 'not-a-real-type' }
            ],
            excludedIds: ['vehicle:x', 42, null]
        });
        const { instances, excludedIds } = new VehicleRuntimeInstancePersistenceStore(provider).load();
        assert(instances.length === 1 && instances[0].id === 'vehicle:good', '9. one corrupted VehicleInstance entry is dropped; the valid one survives');
        assert(excludedIds.length === 1 && excludedIds[0] === 'vehicle:x', '10. non-string excludedIds entries are dropped');
    }

    // -------------------------------------------------------------
    // Section D — seeding a fresh VehicleRuntimeInstances reproduces a
    // MOVED vehicle's own current runtime state, never just its
    // deterministic spawn point.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistenceStore = new VehicleRuntimeInstancePersistenceStore(provider);
        const spawnPosition = new Position(0, 0, 0);
        const movedInstance = new VehicleInstance({
            id: 'vehicle:moved', type: VehicleType.BICYCLE,
            spawnPosition, position: new Position(200, 0, 200), heading: 45
        });
        persistenceStore.save([movedInstance], []);

        const fresh = new VehicleRuntimeInstances();
        const { instances, excludedIds } = persistenceStore.load();
        for (const instance of instances) fresh.add(instance);
        for (const id of excludedIds) fresh.discard(id);

        const seeded = fresh.get('vehicle:moved');
        assert(seeded !== null, '11. the seeded vehicle is tracked');
        assert(seeded.position.x === 200 && seeded.position.z === 200, '12. its CURRENT (moved) position is what survived, not its spawnPosition');
        assert(seeded.heading === 45, '13. its heading survived too');
    }

    // -------------------------------------------------------------
    // Section E — an excluded (stored) vehicle never reappears after
    // seeding.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistenceStore = new VehicleRuntimeInstancePersistenceStore(provider);
        persistenceStore.save([], ['vehicle:stored-away']);

        const fresh = new VehicleRuntimeInstances();
        const { instances, excludedIds } = persistenceStore.load();
        for (const instance of instances) fresh.add(instance);
        for (const id of excludedIds) fresh.discard(id);

        assert(fresh.isExcluded('vehicle:stored-away'), '14. the seeded store honors a previously-excluded id as excluded');
        assert(fresh.get('vehicle:stored-away') === null, '15. it is not tracked as a visible instance');
    }

    // -------------------------------------------------------------
    // Section F — storage failure propagates out of save().
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstancePersistenceStore(new ThrowingStorageProvider());
        let threw = false;
        try {
            store.save([], []);
        } catch {
            threw = true;
        }
        assert(threw, '16. a genuine StorageProvider failure propagates unmodified out of save()');
    }

    console.log('✅ All Vehicle Runtime Instance Persistence Store tests passed.');
}

runTests();
