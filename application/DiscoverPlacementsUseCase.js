// Richer discovery queries using the PlacementRegistry (0.2.10).
//
// While DiscoverWorldsUseCase queries the SpatialIndexProvider for
// spatial intersection, this use case queries the PlacementRegistry
// for richer queries: by owner, by publication, with integrity
// verification.
export class DiscoverPlacementsUseCase {
    constructor(placementRegistry) {
        this._placementRegistry = placementRegistry;
    }

    // Spatial discovery (delegates to the registry's discover method).
    execute(center, radius) {
        return this._placementRegistry.discover(center, radius);
    }

    // Find all placements for a specific publication.
    findByPublicationId(publicationId) {
        return this._placementRegistry.findByPublicationId(publicationId);
    }

    // Find all placements by a specific owner.
    findByOwner(owner) {
        return this._placementRegistry.findByOwner(owner);
    }

    // List all placement records.
    list() {
        return this._placementRegistry.list();
    }

    // Verify the integrity of a specific placement record.
    verifyIntegrity(placementId) {
        return this._placementRegistry.verifyIntegrity(placementId);
    }
}
