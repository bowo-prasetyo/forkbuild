import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';

// Creates a WorldPlacement for a published document.
//
// Calculates local bounds from the document's bricks if not provided,
// then stores the placement in the spatial index. The publication
// itself is never mutated.
export class PlacePublicationUseCase {
    constructor(spatialIndexProvider, discoveryProvider, loadDocumentUseCase, brickRegistry) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._discoveryProvider = discoveryProvider;
        this._loadDocumentUseCase = loadDocumentUseCase;
        this._brickRegistry = brickRegistry;
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

        const placement = new WorldPlacement({
            publicationId,
            position,
            rotation: options.rotation || { x: 0, y: 0, z: 0 },
            scale: options.scale || { x: 1, y: 1, z: 1 },
            bounds
        });

        this._spatialIndexProvider.add(placement);
        return placement;
    }
}
