import { StorageProvider } from '../storage/StorageProvider.js';
import { AnimalRuntimeInstancePersistenceStore } from '../storage/AnimalRuntimeInstancePersistenceStore.js';
import { AnimalRuntimeInstances } from '../application/AnimalRuntimeInstances.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { Position } from '../core/Position.js';

// 0.9.701 — World View Persistence, storage/AnimalRuntimeInstancePersistenceStore.js.
// The direct structural twin of tests/VehicleRuntimeInstancePersistenceStore.test.js
// — see that file's own header for the full section rationale. Differs
// only where AnimalPresence itself differs from VehicleInstance (no
// heading/spawnPosition to round-trip), and Section D here proves
// excludeId() specifically — the position-less exclusion seam
// discard()'s own required `position` argument made necessary for
// seeding, never queuing a drainRecentlyCaught() notification for an
// animal nothing this session ever rendered in the first place.

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

function deer(id, position) {
    return new AnimalPresence({ id, species: ANIMAL_SPECIES.DEER, position });
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — round-trip.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const store = new AnimalRuntimeInstancePersistenceStore(provider);
        const instance = deer('animal:1', new Position(3, 0, 4));
        store.save([instance], ['animal:caught']);

        const { instances, excludedIds } = store.load();
        assert(instances.length === 1 && instances[0] instanceof AnimalPresence, '1. one instance round-trips as a real AnimalPresence');
        assert(instances[0].id === 'animal:1' && instances[0].species === ANIMAL_SPECIES.DEER && instances[0].position.x === 3, '2. id/species/position all round-trip exactly');
        assert(excludedIds.length === 1 && excludedIds[0] === 'animal:caught', '3. excludedIds round-trips');

        const reloaded = new AnimalRuntimeInstancePersistenceStore(provider).load();
        assert(reloaded.instances.length === 1 && reloaded.excludedIds.length === 1, '4. a fresh store instance over the same storage sees the same snapshot');
    }

    // -------------------------------------------------------------
    // Section B — absence/malformed data.
    // -------------------------------------------------------------
    {
        const empty = new AnimalRuntimeInstancePersistenceStore(new InMemoryStorageProvider()).load();
        assert(empty.instances.length === 0 && empty.excludedIds.length === 0, '5. a never-written store degrades to empty, never null and never a thrown error');

        const provider = new InMemoryStorageProvider();
        provider.save('animal-runtime-instances', 42);
        const malformed = new AnimalRuntimeInstancePersistenceStore(provider).load();
        assert(malformed.instances.length === 0 && malformed.excludedIds.length === 0, '6. a non-object persisted value degrades to empty rather than throwing');
    }

    // -------------------------------------------------------------
    // Section C — one corrupted entry drops only that entry.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        provider.save('animal-runtime-instances', {
            instances: [
                deer('animal:good', new Position(1, 0, 1)).toJSON(),
                { id: 'animal:bad', species: 'not-a-real-species' }
            ],
            excludedIds: ['animal:x', {}, '']
        });
        const { instances, excludedIds } = new AnimalRuntimeInstancePersistenceStore(provider).load();
        assert(instances.length === 1 && instances[0].id === 'animal:good', '7. one corrupted AnimalPresence entry is dropped; the valid one survives');
        assert(excludedIds.length === 1 && excludedIds[0] === 'animal:x', '8. non-string/empty excludedIds entries are dropped');
    }

    // -------------------------------------------------------------
    // Section D — seeding a fresh AnimalRuntimeInstances via
    // add()/excludeId() reproduces the exact runtime state, and
    // excludeId() queues no drainRecentlyCaught() notification.
    // -------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistenceStore = new AnimalRuntimeInstancePersistenceStore(provider);
        persistenceStore.save([deer('animal:released', new Position(50, 0, 60))], ['animal:caught-last-session']);

        const fresh = new AnimalRuntimeInstances();
        const { instances, excludedIds } = persistenceStore.load();
        for (const instance of instances) fresh.add(instance);
        for (const id of excludedIds) fresh.excludeId(id);

        const seeded = fresh.get('animal:released');
        assert(seeded !== null && seeded.position.x === 50 && seeded.position.z === 60, '9. the seeded, previously-released animal is tracked at its saved position');
        assert(fresh.isExcluded('animal:caught-last-session'), '10. the seeded store honors a previously-caught id as excluded');
        assert(fresh.get('animal:caught-last-session') === null, '11. it is not tracked as a visible instance');
        assert(fresh.drainRecentlyCaught().length === 0, '12. excludeId() queues no drainRecentlyCaught() notification — nothing this session ever rendered needs to be told to stop rendering it');
    }

    // -------------------------------------------------------------
    // Section E — storage failure propagates out of save().
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstancePersistenceStore(new ThrowingStorageProvider());
        let threw = false;
        try {
            store.save([], []);
        } catch {
            threw = true;
        }
        assert(threw, '13. a genuine StorageProvider failure propagates unmodified out of save()');
    }

    console.log('✅ All Animal Runtime Instance Persistence Store tests passed.');
}

runTests();
