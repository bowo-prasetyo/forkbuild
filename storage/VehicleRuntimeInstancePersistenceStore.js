import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { VehicleInstance } from '../core/VehicleInstance.js';

const VEHICLE_RUNTIME_INSTANCE_STORE_KEY = 'vehicle-runtime-instances';

// World View Placed-Vehicle Persistence.
//
// application/world/VehicleRuntimeInstances.js stays exactly what its own
// header already declares it to be — a session-local reconciliation
// store, unaware of persistence or serialization. This file is a
// separate, optional durable backing for it: a plain data mapper, the
// same shape storage/AvatarInventoryPersistenceStore.js and every other
// *Store in this directory already use.
//
// WHAT IS PERSISTED, AND WHY IT IS ENOUGH. `nearbyVehicleInstances()`
// (application/world/NearbyVehicleInstances.js) reconstructs every STATIONARY
// vehicle deterministically from nothing but the world seed — nothing
// about those needs to be written down. The two facts that formula has
// no way to reproduce are exactly what this store persists:
//
//   instances   — every currently-tracked VehicleInstance, full state
//                 (id/type/spawnPosition/position/heading). A vehicle
//                 that was never moved round-trips to the exact same
//                 values the deterministic query would have produced
//                 anyway; a moved or deployed one round-trips to where
//                 it actually is.
//   excludedIds — ids permanently excluded from rediscovery (see
//                 VehicleRuntimeInstances#discard()'s own header) — a
//                 stored vehicle must not reappear at its old spawn slot
//                 after a reload just because nothing remembered it was
//                 picked up.
//
// A CALLER SEEDS A FRESH VehicleRuntimeInstances FROM load()'s RESULT
// USING ITS OWN PUBLIC add()/discard() — never by reaching into its
// private fields, and never from this file, which has no reference to
// any VehicleRuntimeInstances instance at all. See
// application/world/WorldNavigationSession.js's own constructor for the one
// call site.
//
// CORRUPTED OR MISSING STORAGE DEGRADES TO EMPTY, never a thrown error —
// one malformed VehicleInstance entry drops only that entry, mirroring
// storage/NotificationEventStore.js's own per-entry restraint. A genuine
// StorageProvider failure still propagates unmodified out of save().
export class VehicleRuntimeInstancePersistenceStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('VehicleRuntimeInstancePersistenceStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // `instances` — an array of VehicleInstance. `excludedIds` — an
    // array of plain string ids. Writes exactly what it is handed,
    // never a caller's own live collection reference.
    save(instances, excludedIds) {
        this._storageProvider.save(VEHICLE_RUNTIME_INSTANCE_STORE_KEY, {
            instances: instances.map((instance) => instance.toJSON()),
            excludedIds: [...excludedIds]
        });
    }

    // Always returns `{ instances: VehicleInstance[], excludedIds: string[] }`
    // — never throws, never returns null.
    load() {
        let raw;
        try {
            raw = this._storageProvider.load(VEHICLE_RUNTIME_INSTANCE_STORE_KEY);
        } catch {
            return { instances: [], excludedIds: [] };
        }
        if (!raw || typeof raw !== 'object') {
            return { instances: [], excludedIds: [] };
        }
        const instances = [];
        for (const json of Array.isArray(raw.instances) ? raw.instances : []) {
            try {
                instances.push(VehicleInstance.fromJSON(json));
            } catch {
                // one corrupted entry never discards the rest
            }
        }
        const excludedIds = (Array.isArray(raw.excludedIds) ? raw.excludedIds : [])
            .filter((id) => typeof id === 'string' && id.length > 0);
        return { instances, excludedIds };
    }
}
