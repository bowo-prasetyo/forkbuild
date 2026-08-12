// Moves a placement to a new global position.
//
// The publication content hash remains unchanged. Local brick
// coordinates are never rewritten.
export class MoveWorldPlacementUseCase {
    constructor(spatialIndexProvider) {
        this._spatialIndexProvider = spatialIndexProvider;
    }

    execute(placementId, newPosition) {
        const placement = this._spatialIndexProvider.get(placementId);
        if (!placement) {
            throw new Error(`MoveWorldPlacementUseCase: placement ${placementId} not found`);
        }
        const updated = placement.withPosition(newPosition);
        this._spatialIndexProvider.update(updated);
        return updated;
    }
}
