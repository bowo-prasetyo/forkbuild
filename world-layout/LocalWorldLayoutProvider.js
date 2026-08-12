import { WorldLayoutProvider } from './WorldLayoutProvider.js';
import { WorldPosition } from '../core/WorldPosition.js';

// Refactored for 0.2.5: delegates to SpatialIndexProvider instead of
// generating a deterministic grid. The spatial index is now the single
// source of truth for where published worlds exist.
//
// WorldNavigationSession continues to call findVisibleDocuments() and
// getPosition() unchanged, but the answers now come from explicit
// placements rather than a computed layout.
export class LocalWorldLayoutProvider extends WorldLayoutProvider {
    constructor(spatialIndexProvider, discoveryProvider) {
        super();
        this._spatialIndexProvider = spatialIndexProvider;
        this._discoveryProvider = discoveryProvider;
    }

    findVisibleDocuments(viewCenter, viewRadius = 100) {
        const placements = this._spatialIndexProvider.discover(viewCenter, viewRadius);
        // Return publicationIds (documentIds) for backward compatibility
        // with WorldNavigationSession's streaming logic.
        return placements.map((p) => p.publicationId);
    }

    getPosition(documentId) {
        const placements = this._spatialIndexProvider.findByPublicationId(documentId);
        if (placements.length > 0) {
            const p = placements[0];
            return new WorldPosition(p.position.x, p.position.y, p.position.z);
        }
        // Fallback for unplaced documents (e.g., newly published but
        // not yet placed in the spatial index).
        return new WorldPosition(0, 0, 0);
    }
}
