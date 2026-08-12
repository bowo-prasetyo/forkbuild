// Removes a placement from the spatial index and the placement registry.
//
// Crucially, this does NOT unpublish the document. The publication
// remains in the discovery catalog; it simply no longer occupies
// this specific location in shared space.
export class RemoveWorldPlacementUseCase {
    constructor(spatialIndexProvider, placementRegistry = null) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._placementRegistry = placementRegistry;
    }

    execute(placementId) {
        this._spatialIndexProvider.remove(placementId);

        // Also remove from the PlacementRegistry (new in 0.2.10).
        if (this._placementRegistry) {
            this._placementRegistry.remove(placementId);
        }
    }
}
