import { PlacementRegistry } from './PlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
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

    _loadIndex() {
        return this._storageProvider.load(REGISTRY_INDEX_KEY) || [];
    }

    _saveIndex(index) {
        this._storageProvider.save(REGISTRY_INDEX_KEY, index);
    }

    add(record) {
        if (!(record instanceof PlacementRecord)) {
            throw new Error('LocalPlacementRegistry: invalid record');
        }

        // Compute and set the content hash.
        const hash = record.computeContentHash();
        const recordWithHash = new PlacementRecord({
            ...record.toJSON(),
            contentHash: hash
        });

        // Store the record.
        this._storageProvider.save(
            RECORD_KEY_PREFIX + record.placementId,
            recordWithHash.toJSON()
        );

        // Update the index.
        const index = this._loadIndex();
        if (!index.includes(record.placementId)) {
            index.push(record.placementId);
            this._saveIndex(index);
        }

        // Also write to the SpatialIndexProvider for backward
        // compatibility with DiscoverWorldsUseCase.
        if (this._spatialIndexProvider) {
            const worldPlacement = new WorldPlacement({
                id: record.placementId,
                publicationId: record.publicationId,
                position: record.position,
                rotation: record.rotation,
                scale: record.scale,
                bounds: record.bounds
            });
            this._spatialIndexProvider.add(worldPlacement);
        }

        return recordWithHash;
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

    get(placementId) {
        const json = this._storageProvider.load(RECORD_KEY_PREFIX + placementId);
        return json ? PlacementRecord.fromJSON(json) : null;
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

    list() {
        const index = this._loadIndex();
        const records = [];
        for (const id of index) {
            const record = this.get(id);
            if (record) {
                records.push(record);
            }
        }
        return records;
    }

    verifyIntegrity(placementId) {
        const record = this.get(placementId);
        if (!record) {
            return false;
        }
        return record.verifyIntegrity();
    }
}
