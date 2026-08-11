import { SelectionBoundsService } from './SelectionBoundsService.js';
import { SpatialClipboardState } from './spatial-state/SpatialClipboardState.js';

// Copy is observation, not mutation (0.1.42): reads the selection's
// bricks out of a loaded document and produces clipboard state. It
// never touches CommandHistory — copying changes nothing about the
// document, so it has no place in the undo stack.
//
// Geometry is stored RELATIVE to the selection bounds center — the
// same pivot the transform gizmo uses — so multi-selection structure
// (relative positions, rotations, dimensions via definitionId) survives
// intact and re-anchors with a single paste offset. Source metadata
// (sourceDocumentId, copiedAt) travels with the clipboard; brick ids
// never do.
export class CopySelectionUseCase {
    constructor(brickRegistry) {
        this._boundsService = new SelectionBoundsService(brickRegistry);
    }

    execute(selection, document) {
        if (!selection || selection.isEmpty || selection.type === 'ground' || !document) {
            return SpatialClipboardState.empty();
        }
        const bounds = this._boundsService.calculate(selection, document);
        if (!bounds) {
            return SpatialClipboardState.empty();
        }
        const world = document.world;
        const items = [];
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (!brick) {
                continue;
            }
            items.push({
                definitionId: brick.definitionId,
                position: {
                    x: brick.position.x - bounds.center.x,
                    y: brick.position.y - bounds.center.y,
                    z: brick.position.z - bounds.center.z
                },
                rotation: brick.rotation
            });
        }
        if (items.length === 0) {
            return SpatialClipboardState.empty();
        }
        return new SpatialClipboardState({
            items,
            origin: bounds.center,
            sourceDocumentId: selection.documentId,
            copiedAt: new Date()
        });
    }
}
