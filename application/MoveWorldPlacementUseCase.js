import { PlacementRecord } from '../core/PlacementRecord.js';

// Moves a placement to a new global position.
//
// As of 0.2.10, this creates a new revision of the PlacementRecord.
// The publication content hash remains unchanged. Local brick
// coordinates are never rewritten.
//
// As of 0.2.15, revisions are immutable. The registry remains the
// "latest pointer" for the placement; when an optional
// SpatialIndexBuilder is wired, the new revision is additionally
// published as immutable content and only the affected cell manifests
// advance to new immutable manifest versions. Cells of the OLD
// position keep their reference to the old revision until a rebuild —
// the intended eventual-consistency story: the index is a
// discoverability accelerator, not truth, and discovery resolves the
// stale entry away (newer revision wins + spatial filter).
export class MoveWorldPlacementUseCase {
    constructor(spatialIndexProvider, placementRegistry = null, spatialIndexBuilder = null) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._placementRegistry = placementRegistry;
        this._spatialIndexBuilder = spatialIndexBuilder;
    }

    execute(placementId, newPosition) {
        const placement = this._spatialIndexProvider.get(placementId);
        if (!placement) {
            throw new Error(`MoveWorldPlacementUseCase: placement ${placementId} not found`);
        }

        // Update the WorldPlacement (existing behavior, unchanged).
        const updated = placement.withPosition(newPosition);
        this._spatialIndexProvider.update(updated);

        // Create a new revision of the PlacementRecord (new in 0.2.10).
        if (this._placementRegistry) {
            const existingRecord = this._placementRegistry.get(placementId);
            if (existingRecord) {
                const newRecord = existingRecord.withPosition(newPosition);
                const updatedRecord = this._placementRegistry.update(newRecord);

                // 0.2.15: publish the new immutable revision into the
                // decentralized spatial index, when wired.
                if (this._spatialIndexBuilder) {
                    this._spatialIndexBuilder.addOrUpdatePlacement(updatedRecord);
                }
            }
        }

        return updated;
    }
}
