import { SpatialIndexProvider } from './SpatialIndexProvider.js';
import { WorldPlacement } from '../core/WorldPlacement.js';

const PLACEMENT_KEY_PREFIX = 'placement:';
const INDEX_KEY = 'spatial-index';

// The V0.1 concrete spatial index: stores WorldPlacement records
// via an injected StorageProvider. Uses a simple array for the index
// to support fast iteration and bounds-based discovery.
//
// Discovery performs sphere-AABB intersection testing against the
// placement's global bounds, not merely origin-distance checks. This
// makes spatial streaming accurate for large worlds whose origins
// might be outside the radius but whose geometry intersects it.
export class LocalSpatialIndexProvider extends SpatialIndexProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    _loadIndex() {
        return this._storageProvider.load(INDEX_KEY) || [];
    }

    _saveIndex(index) {
        this._storageProvider.save(INDEX_KEY, index);
    }

    add(placement) {
        if (!(placement instanceof WorldPlacement)) {
            throw new Error('LocalSpatialIndexProvider: invalid placement');
        }
        this._storageProvider.save(PLACEMENT_KEY_PREFIX + placement.id, placement.toJSON());
        const index = this._loadIndex();
        if (!index.includes(placement.id)) {
            index.push(placement.id);
            this._saveIndex(index);
        }
    }

    update(placement) {
        this._storageProvider.save(PLACEMENT_KEY_PREFIX + placement.id, placement.toJSON());
    }

    remove(placementId) {
        this._storageProvider.remove(PLACEMENT_KEY_PREFIX + placementId);
        const index = this._loadIndex().filter((id) => id !== placementId);
        this._saveIndex(index);
    }

    get(placementId) {
        const json = this._storageProvider.load(PLACEMENT_KEY_PREFIX + placementId);
        return json ? WorldPlacement.fromJSON(json) : null;
    }

    findByPublicationId(publicationId) {
        return this.list().filter((p) => p.publicationId === publicationId);
    }

    list() {
        const index = this._loadIndex();
        const placements = [];
        for (const id of index) {
            const p = this.get(id);
            if (p) placements.push(p);
        }
        return placements;
    }

    discover(center, radius) {
        const placements = this.list();
        const result = [];
        const r2 = radius * radius;

        for (const p of placements) {
            let intersects = false;

            if (p.bounds) {
                // Sphere-AABB intersection test
                const globalBounds = p.bounds.getGlobalBounds(p.position);
                const closestX = Math.max(globalBounds.min.x, Math.min(center.x, globalBounds.max.x));
                const closestY = Math.max(globalBounds.min.y, Math.min(center.y, globalBounds.max.y));
                const closestZ = Math.max(globalBounds.min.z, Math.min(center.z, globalBounds.max.z));

                const dx = center.x - closestX;
                const dy = center.y - closestY;
                const dz = center.z - closestZ;
                intersects = (dx * dx + dy * dy + dz * dz) <= r2;
            } else {
                // Fallback to origin distance if bounds are missing
                const dx = p.position.x - center.x;
                const dy = p.position.y - center.y;
                const dz = p.position.z - center.z;
                intersects = (dx * dx + dy * dy + dz * dz) <= r2;
            }

            if (intersects) {
                result.push(p);
            }
        }

        return result;
    }
}
