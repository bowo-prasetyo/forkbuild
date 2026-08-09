import { Position } from '../core/Position.js';

// Shared placement logic used by both PlacementTool (EditorView) and
// SpatialPlacementService (WorldView). Calculates document-local positions
// from ground hits or brick surface hits, using actual brick dimensions.
export class PlacementPositionService {
    constructor(registry) {
        this._registry = registry;
    }

    calculateGround(worldPosition, definitionId, settings = {}) {
        const def = this._registry.get(definitionId);
        if (!def) return null;

        const snapEnabled = settings.gridSnapEnabled !== false;
        const snapSize = settings.gridSnapSize || 1;

        const snappedX = snapEnabled ? Math.round(worldPosition.x / snapSize) * snapSize : worldPosition.x;
        const snappedZ = snapEnabled ? Math.round(worldPosition.z / snapSize) * snapSize : worldPosition.z;
        const y = def.height / 2;

        return new Position(snappedX, y, snappedZ);
    }

    calculateStack(existingBrick, normal, definitionId, settings = {}) {
        const existingDef = this._registry.get(existingBrick.definitionId);
        const newDef = this._registry.get(definitionId);
        if (!existingDef || !newDef) return null;

        const snapEnabled = settings.gridSnapEnabled !== false;
        const snapSize = settings.gridSnapSize || 1;

        let dx = 0, dy = 0, dz = 0;

        if (Math.abs(normal.x) > 0.5) {
            dx = Math.sign(normal.x) * (existingDef.width / 2 + newDef.width / 2);
        } else if (Math.abs(normal.y) > 0.5) {
            dy = Math.sign(normal.y) * (existingDef.height / 2 + newDef.height / 2);
        } else if (Math.abs(normal.z) > 0.5) {
            dz = Math.sign(normal.z) * (existingDef.depth / 2 + newDef.depth / 2);
        }

        let newX = existingBrick.position.x + dx;
        let newY = existingBrick.position.y + dy;
        let newZ = existingBrick.position.z + dz;

        if (snapEnabled) {
            newX = Math.round(newX / snapSize) * snapSize;
            newZ = Math.round(newZ / snapSize) * snapSize;
            if (Math.abs(normal.y) < 0.5) {
                newY = Math.round(newY / snapSize) * snapSize;
            }
        }

        return new Position(newX, newY, newZ);
    }
}
