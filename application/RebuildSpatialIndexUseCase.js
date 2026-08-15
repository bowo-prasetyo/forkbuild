// Full rebuild of the decentralized spatial index (0.2.15) from the
// authoritative PlacementRegistry.
//
// The registry is truth; the index is derived. Rebuild is always safe
// and idempotent — SpatialIndexBuilder.build() over unchanged records
// reproduces identical content hashes and simply re-points the root
// pointer at an identical root. Run it after bulk placement changes,
// or whenever an index is suspected to have drifted.
export class RebuildSpatialIndexUseCase {
    constructor(spatialIndexBuilder, placementRegistry) {
        this._spatialIndexBuilder = spatialIndexBuilder;
        this._placementRegistry = placementRegistry;
    }

    execute() {
        const records = this._placementRegistry.list();
        return this._spatialIndexBuilder.build(records);
    }
}
