// Queries the spatial index for placements intersecting a sphere.
//
// Returns WorldPlacement objects, not mutable Documents. The caller
// decides which placements to load into PublishedWorldSessions.
export class DiscoverWorldsUseCase {
    constructor(spatialIndexProvider) {
        this._spatialIndexProvider = spatialIndexProvider;
    }

    execute(center, radius) {
        return this._spatialIndexProvider.discover(center, radius);
    }
}
