import { Position } from '../core/Position.js';
import { SpatialPlacementState } from './spatial-state/SpatialPlacementState.js';
import { PlacementPositionService } from './PlacementPositionService.js';

// Spatial placement logic: translates world-space pick results into
// document-local placement positions, accounting for layout offsets.
export class SpatialPlacementService {
    constructor(registry) {
        this._registry = registry;
        this._positionService = new PlacementPositionService(registry);
    }

    calculateFromHit(hitResult, definitionId, existingBrick, layoutOffset, settings = {}) {
        if (!definitionId) return SpatialPlacementState.empty();

        if (hitResult.type === 'ground') {
            const localPos = new Position(
                hitResult.position.x - (layoutOffset?.x || 0),
                hitResult.position.y - (layoutOffset?.y || 0),
                hitResult.position.z - (layoutOffset?.z || 0)
            );
            const position = this._positionService.calculateGround(localPos, definitionId, settings);
            return new SpatialPlacementState({
                valid: true,
                definitionId,
                position,
                rotation: 0
            });
        }

        if (hitResult.type === 'brick' && existingBrick && hitResult.normal) {
            const position = this._positionService.calculateStack(
                existingBrick, hitResult.normal, definitionId, settings
            );
            return new SpatialPlacementState({
                valid: true,
                definitionId,
                position,
                rotation: 0,
                targetDocumentId: hitResult.documentId,
                targetBuildingId: hitResult.buildingId
            });
        }

        return SpatialPlacementState.empty();
    }
}
