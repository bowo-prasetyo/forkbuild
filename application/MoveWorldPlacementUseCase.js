import { PlacementRecord } from '../core/PlacementRecord.js';

// Moves a placement to a new global position.
//
// As of 0.2.10, this creates a new revision of the PlacementRecord.
// The publication content hash remains unchanged. Local brick
// coordinates are never rewritten.
export class MoveWorldPlacementUseCase {
    constructor(spatialIndexProvider, placementRegistry = null) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._placementRegistry = placementRegistry;
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
                this._placementRegistry.update(newRecord);
            }
        }

        return updated;
    }
}
