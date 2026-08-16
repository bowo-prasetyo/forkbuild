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

    // Hardening (0.2.23): a WorldPlacement/PlacementRecord is keyed by
    // publicationId — Publication's OWN id — never documentId, the
    // underlying World's id (Publication.documentId). Those are two
    // different fields (see publisher/Publication.js: `id` and
    // `documentId` are set independently — `id = createId()`,
    // `documentId = document.world.id`). Every caller in this file
    // used to query the spatial index directly with a documentId,
    // which can never match a real publicationId — meaning an
    // explicit placement could never be found by this provider at
    // all, silently falling through to the deterministic-grid
    // fallback every time, for every document, forever. This resolves
    // the documentId callers actually have to the publicationId
    // placements are actually keyed by.
    _resolvePublicationId(documentId) {
        if (!this._discoveryProvider || typeof this._discoveryProvider.findByDocumentId !== 'function') {
            return null;
        }
        const publications = this._discoveryProvider.findByDocumentId(documentId);
        return publications.length > 0 ? publications[0].id : null;
    }

    findVisibleDocuments(viewCenter, viewRadius = 100) {
        const visible = new Set();

        // 1. Query the explicit spatial index for placed worlds. The
        // index deals exclusively in publicationIds; every hit is
        // resolved back to the documentId callers of this provider
        // actually expect (same bug as getPosition below — `p.
        // publicationId` was being added directly, so an explicitly
        // placed world could never actually stream in either).
        if (this._spatialIndexProvider && this._discoveryProvider) {
            const placements = this._spatialIndexProvider.discover(viewCenter, viewRadius);
            for (const p of placements) {
                const publication = this._discoveryProvider.findById(p.publicationId);
                if (publication) {
                    visible.add(publication.documentId);
                }
            }
        }

        // 2. Fallback to deterministic grid for unplaced publications
        const publications = this._discoveryProvider.list();
        for (let i = 0; i < publications.length; i++) {
            const pub = publications[i];

            // If it has an explicit placement, we already evaluated it above.
            const explicitPlacements = this._spatialIndexProvider
                ? this._spatialIndexProvider.findByPublicationId(pub.id)
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
        // 1. Check explicit spatial index — resolve documentId to its
        // publication first (see _resolvePublicationId above).
        if (this._spatialIndexProvider) {
            const publicationId = this._resolvePublicationId(documentId);
            if (publicationId) {
                const placements = this._spatialIndexProvider.findByPublicationId(publicationId);
                if (placements.length > 0) {
                    // A document may have more than one placement (the
                    // same publication exhibited in several places) —
                    // picking the first is a deliberate simplification
                    // for now (see docs/Architecture.md, 0.2.23);
                    // browsing/choosing among several is future scope.
                    const p = placements[0];
                    return new WorldPosition(p.position.x, p.position.y, p.position.z);
                }
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
