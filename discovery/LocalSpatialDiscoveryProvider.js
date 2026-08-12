import { SpatialDiscoveryProvider } from './SpatialDiscoveryProvider.js';
import { PlacementRecord } from '../core/PlacementRecord.js';

// The V0.1 concrete spatial discovery provider: delegates spatial
// queries to the SpatialIndexProvider and enriches results with
// PlacementRecord details from the PlacementRegistry.
//
// This exercises the exact interface a future IPFS spatial index or
// Arweave index will use. No networking, no content-addressing — just
// a straightforward delegation that proves the adapter shape works.
export class LocalSpatialDiscoveryProvider extends SpatialDiscoveryProvider {
    constructor(spatialIndexProvider, placementRegistry = null) {
        super();
        this._spatialIndexProvider = spatialIndexProvider;
        this._placementRegistry = placementRegistry;
    }

    discover(center, radius) {
        // Spatial filtering via the SpatialIndexProvider.
        const placements = this._spatialIndexProvider.discover(center, radius);
        return placements.map((p) => this._toPlacementRecord(p));
    }

    findByPublicationId(publicationId) {
        // Prefer the PlacementRegistry (has full record details).
        if (this._placementRegistry) {
            const records = this._placementRegistry.findByPublicationId(publicationId);
            if (records.length > 0) {
                return records;
            }
        }
        // Fallback: query the spatial index.
        const placements = this._spatialIndexProvider.findByPublicationId(publicationId);
        return placements.map((p) => this._toPlacementRecord(p));
    }

    // Converts a WorldPlacement to a PlacementRecord. If a full
    // PlacementRecord exists in the registry, use it; otherwise,
    // create a minimal record from the WorldPlacement.
    _toPlacementRecord(worldPlacement) {
        if (this._placementRegistry) {
            const record = this._placementRegistry.get(worldPlacement.id);
            if (record) {
                return record;
            }
        }
        // Minimal record for placements created before 0.2.10.
        return new PlacementRecord({
            placementId: worldPlacement.id,
            publicationId: worldPlacement.publicationId,
            position: worldPlacement.position,
            bounds: worldPlacement.bounds
        });
    }
}
