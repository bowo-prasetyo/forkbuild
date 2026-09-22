import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { AnimalPresence } from '../core/AnimalPresence.js';

const ANIMAL_RUNTIME_INSTANCE_STORE_KEY = 'animal-runtime-instances';

// World View Placed-Animal Persistence — the direct structural twin of
// storage/VehicleRuntimeInstancePersistenceStore.js for
// application/AnimalRuntimeInstances.js. See that file's own header for
// the full rationale; this one differs only in the value type persisted
// (AnimalPresence, which has no heading/spawnPosition of its own — see
// core/AnimalPresence.js's own header) and in `excludedIds` meaning
// "caught," not "stored."
export class AnimalRuntimeInstancePersistenceStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('AnimalRuntimeInstancePersistenceStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // `instances` — an array of AnimalPresence. `excludedIds` — an array
    // of plain string ids (caught animals). Writes exactly what it is
    // handed, never a caller's own live collection reference.
    save(instances, excludedIds) {
        this._storageProvider.save(ANIMAL_RUNTIME_INSTANCE_STORE_KEY, {
            instances: instances.map((instance) => instance.toJSON()),
            excludedIds: [...excludedIds]
        });
    }

    // Always returns `{ instances: AnimalPresence[], excludedIds: string[] }`
    // — never throws, never returns null.
    load() {
        let raw;
        try {
            raw = this._storageProvider.load(ANIMAL_RUNTIME_INSTANCE_STORE_KEY);
        } catch {
            return { instances: [], excludedIds: [] };
        }
        if (!raw || typeof raw !== 'object') {
            return { instances: [], excludedIds: [] };
        }
        const instances = [];
        for (const json of Array.isArray(raw.instances) ? raw.instances : []) {
            try {
                instances.push(AnimalPresence.fromJSON(json));
            } catch {
                // one corrupted entry never discards the rest
            }
        }
        const excludedIds = (Array.isArray(raw.excludedIds) ? raw.excludedIds : [])
            .filter((id) => typeof id === 'string' && id.length > 0);
        return { instances, excludedIds };
    }
}
