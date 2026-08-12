import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';

// Creates a WorldPlacement and a PlacementRecord for a published document.
//
// As of 0.2.10, this creates BOTH:
//   1. A WorldPlacement in the SpatialIndexProvider (for spatial queries)
//   2. A PlacementRecord in the PlacementRegistry (for decentralized discovery)
//
// The PlacementRecord carries the owner's identity (from the
// IdentityProvider), a revision counter, and a content hash for
// integrity verification.
//
// The publication itself is never mutated. Placement is a spatial
// operation, not a content operation.
export class PlacePublicationUseCase {
    constructor(
        spatialIndexProvider,
        discoveryProvider,
        loadDocumentUseCase,
        brickRegistry,
        placementRegistry = null,
        identityProvider = null
    ) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._discoveryProvider = discoveryProvider;
        this._loadDocumentUseCase = loadDocumentUseCase;
        this._brickRegistry = brickRegistry;
        this._placementRegistry = placementRegistry;
        this._identityProvider = identityProvider;
    }

    execute(publicationId, position, options = {}) {
        const publication = this._discoveryProvider.findById(publicationId);
        if (!publication) {
            throw new Error(`PlacePublicationUseCase: publication ${publicationId} not found`);
        }

        let bounds = options.bounds;
        if (!bounds) {
            try {
                const document = this._loadDocumentUseCase.execute(publicationId);
                bounds = SpatialBounds.fromWorld(document.world, this._brickRegistry);
            } catch (e) {
                bounds = new SpatialBounds({
                    min: { x: -0.5, y: 0, z: -0.5 },
                    max: { x: 0.5, y: 1, z: 0.5 }
                });
            }
        }

        // Create the WorldPlacement (existing behavior, unchanged).
        const placement = new WorldPlacement({
            publicationId,
            position,
            rotation: options.rotation || { x: 0, y: 0, z: 0 },
            scale: options.scale || { x: 1, y: 1, z: 1 },
            bounds
        });
        this._spatialIndexProvider.add(placement);

        // Create the PlacementRecord (new in 0.2.10).
        if (this._placementRegistry) {
            const currentUser = this._identityProvider
                ? this._identityProvider.currentUser()
                : null;
            const owner = currentUser ? currentUser.username : null;

            const record = new PlacementRecord({
                placementId: placement.id,
                publicationId,
                owner,
                position,
                rotation: options.rotation || { x: 0, y: 0, z: 0 },
                scale: options.scale || { x: 1, y: 1, z: 1 },
                bounds,
                revision: 1
            });
            this._placementRegistry.add(record);
        }

        return placement;
    }
}
