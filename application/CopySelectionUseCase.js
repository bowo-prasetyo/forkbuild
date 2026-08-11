import { SelectionBoundsService } from './SelectionBoundsService.js';
import { SpatialClipboardState } from './spatial-state/SpatialClipboardState.js';

// Copy is observation, not mutation (0.1.42): reads the selection's
// bricks out of a loaded document and produces clipboard state. It
// never touches CommandHistory — copying changes nothing about the
// document, so it has no place in the undo stack.
//
// Geometry is stored RELATIVE to the selection bounds center (the same
// pivot the transform gizmo uses). Works with SpatialSelectionState
// (World View) and SelectionState (Editor) alike — both expose items[]
// and isEmpty, which is all this use case needs.
//
// Group-aware as of 0.1.43: any flat group whose ENTIRE membership is
// contained in the selection travels with the clipboard as intent
// ({ name, memberIndices } into items) — never ids. A partially
// selected group copies as plain bricks.
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
        const itemIndexByBrickId = new Map();
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (!brick) {
                continue;
            }
            itemIndexByBrickId.set(item.brickId, items.length);
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
        const groups = [];
        for (const group of world.getGroups()) {
            const memberBrickIds = group.brickIds;
            if (memberBrickIds.length === 0) {
                continue;
            }
            const memberIndices = [];
            let fullyCovered = true;
            for (const brickId of memberBrickIds) {
                const index = itemIndexByBrickId.get(brickId);
                if (index === undefined) {
                    fullyCovered = false;
                    break;
                }
                memberIndices.push(index);
            }
            if (fullyCovered) {
                groups.push({ name: group.name, memberIndices });
            }
        }
        return new SpatialClipboardState({
            items,
            groups,
            origin: bounds.center,
            sourceDocumentId: selection.documentId,
            copiedAt: new Date()
        });
    }
}
