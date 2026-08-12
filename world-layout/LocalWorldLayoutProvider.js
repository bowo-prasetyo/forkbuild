import { WorldLayoutProvider } from './WorldLayoutProvider.js';
import { WorldPosition } from '../core/WorldPosition.js';

const GRID_SPACING = 40;

// Deterministic local layout with explicit spatial index override.
// 
// As of 0.2.5, worlds can be explicitly placed in the shared spatial 
// coordinate system via the SpatialIndexProvider. However, to maintain 
// backward compatibility with existing publications that have not been 
// explicitly placed, this provider falls back to a deterministic 2D grid.
export class LocalWorldLayoutProvider extends WorldLayoutProvider {
    constructor(spatialIndexProvider, discoveryProvider) {
        super();
        this._spatialIndexProvider = spatialIndexProvider;
        this._discoveryProvider = discoveryProvider;
    }

    findVisibleDocuments(viewCenter, viewRadius = 100) {
        const visible = new Set();
        
        // 1. Query the explicit spatial index for placed worlds
        if (this._spatialIndexProvider) {
            const placements = this._spatialIndexProvider.discover(viewCenter, viewRadius);
            for (const p of placements) {
                visible.add(p.publicationId);
            }
        }
        
        // 2. Fallback to deterministic grid for unplaced publications
        const publications = this._discoveryProvider.list();
        for (let i = 0; i < publications.length; i++) {
            const pub = publications[i];
            
            // If it has an explicit placement, we already evaluated it above.
            const explicitPlacements = this._spatialIndexProvider 
                ? this._spatialIndexProvider.findByPublicationId(pub.documentId) 
                : [];
            if (explicitPlacements.length > 0) continue;
            
            // Calculate deterministic grid position
            const row = Math.floor(i / 4);
            const col = i % 4;
            const pos = new WorldPosition(
                col * GRID_SPACING,
                0,
                row * GRID_SPACING
            );
            
            const dx = pos.x - viewCenter.x;
            const dy = pos.y - viewCenter.y;
            const dz = pos.z - viewCenter.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= viewRadius) {
                visible.add(pub.documentId);
            }
        }
        
        return Array.from(visible);
    }

    getPosition(documentId) {
        // 1. Check explicit spatial index
        if (this._spatialIndexProvider) {
            const placements = this._spatialIndexProvider.findByPublicationId(documentId);
            if (placements.length > 0) {
                const p = placements[0];
                return new WorldPosition(p.position.x, p.position.y, p.position.z);
            }
        }
        
        // 2. Fallback to deterministic grid
        const publications = this._discoveryProvider.list();
        for (let i = 0; i < publications.length; i++) {
            if (publications[i].documentId === documentId) {
                const row = Math.floor(i / 4);
                const col = i % 4;
                return new WorldPosition(
                    col * GRID_SPACING,
                    0,
                    row * GRID_SPACING
                );
            }
        }
        
        return new WorldPosition(0, 0, 0);
    }
}
