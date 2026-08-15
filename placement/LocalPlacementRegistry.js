import { PlacementRegistry } from './PlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ConflictSet } from '../core/ConflictSet.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { computeContentHash } from '../serializer/contentHash.js';

const RECORD_KEY_PREFIX = 'placement-record:';
const HISTORY_KEY_PREFIX = 'placement-history:';
const CONFLICT_KEY_PREFIX = 'placement-conflict:';

// The V0.1 concrete placement registry: stores PlacementRecords via an
// injected StorageProvider. Also writes to the SpatialIndexProvider for
// backward compatibility with the existing DiscoverWorldsUseCase.
//
// Storage model:
//   placement-record:{placementId}   — the full PlacementRecord JSON
//   placement-history:{placementId}  — array of revision history
//   placement-conflict:{placementId} — conflict set JSON
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
        if (!(record instanceof PlacementRecord)) {
            throw new Error('LocalPlacementRegistry: invalid record');
        }

        let recordToStore = record;
        if (!recordToStore.contentHash) {
            const hash = recordToStore.computeContentHash();
            recordToStore = new PlacementRecord({ ...recordToStore.toJSON(), contentHash: hash });
        }

        // Save the latest record
        this._storageProvider.save(RECORD_KEY_PREFIX + record.placementId, recordToStore.toJSON());
        
        // Update history
        const historyKey = HISTORY_KEY_PREFIX + record.placementId;
        const history = this._storageProvider.load(historyKey) || [];
        const exists = history.some(h => h.hash === recordToStore.contentHash);
        
        if (!exists) {
            history.push({ 
                revision: recordToStore.revision, 
                hash: recordToStore.contentHash, 
                timestamp: recordToStore.updatedAt.toISOString() 
            });
            this._storageProvider.save(historyKey, history);
        }

        // Update spatial index
        this._updateSpatialIndex(recordToStore);

        return recordToStore;
    }

    get(placementId) {
        const json = this._storageProvider.load(RECORD_KEY_PREFIX + placementId);
        return json ? PlacementRecord.fromJSON(json) : null;
    }

    list() {
        const keys = this._storageProvider.list();
        const recordKeys = keys.filter(k => k.startsWith(RECORD_KEY_PREFIX));
        return recordKeys.map(k => PlacementRecord.fromJSON(this._storageProvider.load(k)));
    }
    
    getHistory(placementId) {
        return this._storageProvider.load(HISTORY_KEY_PREFIX + placementId) || [];
    }
    
    setConflictSet(placementId, conflictSet) {
        this._storageProvider.save(CONFLICT_KEY_PREFIX + placementId, conflictSet.toJSON());
    }
    
    getConflictSet(placementId) {
        const json = this._storageProvider.load(CONFLICT_KEY_PREFIX + placementId);
        return json ? ConflictSet.fromJSON(json) : null;
    }
    
    update(record) {
        if (!(record instanceof PlacementRecord)) {
            throw new Error('LocalPlacementRegistry: invalid record');
        }

        let recordToStore = record;
        if (!recordToStore.contentHash) {
            const hash = recordToStore.computeContentHash();
            recordToStore = new PlacementRecord({ ...recordToStore.toJSON(), contentHash: hash });
        }

        // Overwrite the record
        this._storageProvider.save(RECORD_KEY_PREFIX + record.placementId, recordToStore.toJSON());

        // Update history
        const historyKey = HISTORY_KEY_PREFIX + record.placementId;
        const history = this._storageProvider.load(historyKey) || [];
        const exists = history.some(h => h.hash === recordToStore.contentHash);
        
        if (!exists) {
            history.push({ 
                revision: recordToStore.revision, 
                hash: recordToStore.contentHash, 
                timestamp: recordToStore.updatedAt.toISOString() 
            });
            this._storageProvider.save(historyKey, history);
        }

        // Update the SpatialIndexProvider
        this._updateSpatialIndex(recordToStore);

        return recordToStore;
    }

    remove(placementId) {
        this._storageProvider.remove(RECORD_KEY_PREFIX + placementId);
        this._storageProvider.remove(HISTORY_KEY_PREFIX + placementId);
        this._storageProvider.remove(CONFLICT_KEY_PREFIX + placementId);
        
        if (this._spatialIndexProvider) {
            const existing = this._spatialIndexProvider.get(placementId);
            if (existing) {
                this._spatialIndexProvider.remove(placementId);
            }
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
            const placements = this._spatialIndexProvider.discover(center, radius);
            // Map WorldPlacements back to PlacementRecords to maintain a consistent return type
            return placements
                .map(p => this.get(p.id))
                .filter(r => r !== null);
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

    _updateSpatialIndex(record) {
        if (!this._spatialIndexProvider) return;

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
}
