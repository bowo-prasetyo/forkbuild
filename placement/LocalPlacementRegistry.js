import { PlacementRegistry } from './PlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ConflictSet } from '../core/ConflictSet.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { computeContentHash } from '../serializer/contentHash.js';

const RECORD_KEY_PREFIX = 'placement-record:';
const REGISTRY_INDEX_KEY = 'placement-registry-index';

// The V0.1 concrete placement registry: stores PlacementRecords via an
// injected StorageProvider. Also writes to the SpatialIndexProvider for
// backward compatibility with the existing DiscoverWorldsUseCase.
//
// Storage model:
//   placement-record:{placementId}  — the full PlacementRecord JSON
//   placement-registry-index        — array of all placement IDs
//
// The SpatialIndexProvider continues to store WorldPlacement objects
// at placement:{id} for spatial queries. The LocalPlacementRegistry
// writes to both, so the existing DiscoverWorldsUseCase works unchanged.
export class LocalPlacementRegistry extends PlacementRegistry {
    constructor(storageProvider, spatialIndexProvider = null) {
        super();
        this._storageProvider = storageProvider;
        this._spatialIndexProvider = spatialIndexProvider;
    }

    add(record) {
	    let recordToStore = record;
	    if (!recordToStore.contentHash) {
	        const hash = recordToStore.computeContentHash();
	        recordToStore = new PlacementRecord({ ...recordToStore.toJSON(), contentHash: hash });
	    }
        const historyKey = `placement-history:${record.placementId}`;
        const history = this._storageProvider.load(historyKey) || [];
        const exists = history.some(h => h.hash === record.contentHash);
        
        if (!exists) {
            history.push({ 
                revision: record.revision, 
                hash: record.contentHash, 
                timestamp: record.updatedAt.toISOString() 
	        });
            this._storageProvider.save(historyKey, history);
        }
	    return recordToStore; // <--- FIX: Must return the record
    }

    get(placementId) {
        const json = this._storageProvider.load(`placement-latest:${placementId}`);
        return json ? PlacementRecord.fromJSON(json) : null;
    }

    list() {
        const keys = this._storageProvider.list();
        const latestKeys = keys.filter(k => k.startsWith('placement-latest:'));
        return latestKeys.map(k => PlacementRecord.fromJSON(this._storageProvider.load(k)));
    }
    
    setLatest(placementId, record) {
        this._storageProvider.save(`placement-latest:${placementId}`, record.toJSON());
        this._updateSpatialIndex(record);
    }
    
    getHistory(placementId) {
        return this._storageProvider.load(`placement-history:${placementId}`) || [];
    }
    
    setConflictSet(placementId, conflictSet) {
        this._storageProvider.save(`placement-conflict:${placementId}`, conflictSet.toJSON());
    }
    
    getConflictSet(placementId) {
        const json = this._storageProvider.load(`placement-conflict:${placementId}`);
        return json ? ConflictSet.fromJSON(json) : null;
    }
    
    remove(placementId) {
        this._storageProvider.remove(`placement-latest:${placementId}`);
        this._storageProvider.remove(`placement-history:${placementId}`);
        this._storageProvider.remove(`placement-conflict:${placementId}`);
        const existing = this._spatialIndexProvider.get(placementId);
        if (existing) this._spatialIndexProvider.remove(placementId);
    }
    
    _updateSpatialIndex(record) {
        const placement = new WorldPlacement({
            id: record.placementId,
            publicationId: record.publicationId,
            position: record.position,
            rotation: record.rotation,
            scale: record.scale,
            bounds: record.bounds
        });
        const existing = this._spatialIndexProvider.get(record.placementId);
        if (existing) {
            this._spatialIndexProvider.update(placement);
        } else {
            this._spatialIndexProvider.add(placement);
        }
    }
    
    update(record) {
        if (!(record instanceof PlacementRecord)) {
            throw new Error('LocalPlacementRegistry: invalid record');
        }

        // Compute and set the content hash.
        const hash = record.computeContentHash();
        const recordWithHash = new PlacementRecord({
            ...record.toJSON(),
            contentHash: hash
        });

        // Overwrite the record.
        this._storageProvider.save(
            RECORD_KEY_PREFIX + record.placementId,
            recordWithHash.toJSON()
        );

        // Update the SpatialIndexProvider.
        if (this._spatialIndexProvider) {
            const worldPlacement = new WorldPlacement({
                id: record.placementId,
                publicationId: record.publicationId,
                position: record.position,
                rotation: record.rotation,
                scale: record.scale,
                bounds: record.bounds
            });
            this._spatialIndexProvider.update(worldPlacement);
        }

        return recordWithHash;
    }

    remove(placementId) {
        this._storageProvider.remove(RECORD_KEY_PREFIX + placementId);
        const index = this._loadIndex().filter((id) => id !== placementId);
        this._saveIndex(index);

        // Also remove from the SpatialIndexProvider.
        if (this._spatialIndexProvider) {
            this._spatialIndexProvider.remove(placementId);
        }
    }

    findByPublicationId(publicationId) {
        return this.list().filter((r) => r.publicationId === publicationId);
    }

    findByOwner(owner) {
        return this.list().filter((r) => r.owner === owner);
    }

    discover(center, radius) {
        // Delegate to the SpatialIndexProvider for spatial queries.
        if (this._spatialIndexProvider) {
            return this._spatialIndexProvider.discover(center, radius);
        }
        // Fallback: brute-force distance check.
        const r2 = radius * radius;
        return this.list().filter((record) => {
            const dx = record.position.x - center.x;
            const dy = record.position.y - center.y;
            const dz = record.position.z - center.z;
            return (dx * dx + dy * dy + dz * dz) <= r2;
        });
    }

    verifyIntegrity(placementId) {
        const record = this.get(placementId);
        if (!record) {
            return false;
        }
        return record.verifyIntegrity();
    }

    _loadIndex() {
        return this._storageProvider.load(REGISTRY_INDEX_KEY) || [];
    }

    _saveIndex(index) {
        this._storageProvider.save(REGISTRY_INDEX_KEY, index);
    }
}
