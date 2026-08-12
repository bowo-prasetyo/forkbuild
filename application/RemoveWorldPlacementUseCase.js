// === FILE: application/RemoveWorldPlacementUseCase.js ===
// Removes a placement from the spatial index.
//
// Crucially, this does NOT unpublish the document. The publication
// remains in the discovery catalog; it simply no longer occupies
// this specific location in shared space.
export class RemoveWorldPlacementUseCase {
    constructor(spatialIndexProvider) {
        this._spatialIndexProvider = spatialIndexProvider;
    }

    execute(placementId) {
        this._spatialIndexProvider.remove(placementId);
    }
}
