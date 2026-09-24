import { SelectionState } from '../editor-state/SelectionState.js';
import { ToolId } from '../editor-state/ToolId.js';
import { PASTE_OFFSET as DUPLICATE_OFFSET } from '../editor/PasteClipboardUseCase.js';
import { MoveStructurePlacementCommand } from '../commands/MoveStructurePlacementCommand.js';
import { RotateStructurePlacementCommand } from '../commands/RotateStructurePlacementCommand.js';
import { DuplicateStructurePlacementCommand } from '../commands/DuplicateStructurePlacementCommand.js';
import { StructurePlacementValidator } from '../editor/StructurePlacementValidator.js';
import { SpatialBounds } from '../../core/SpatialBounds.js';
import { Position } from '../../core/Position.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';

// EditorSession transforms: move, rotate, duplicate and repeat the selection,
// the selection summary, and placed-structure moves, which have their own
// commands because SpatialEditingService stays brick/group-shaped.
export const transformMethods = {
    moveSelection(delta, gestureOptions = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (selection.isStructurePlacementSelection) {
            return this._moveStructurePlacement(selection.selectedPlacementId, delta);
        }
        return this._gestureService.moveSelection(selection, delta, gestureOptions);
    },

    rotateSelection(deltaRotation, gestureOptions = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (selection.isStructurePlacementSelection) {
            return this._rotateStructurePlacement(selection.selectedPlacementId, deltaRotation);
        }
        return this._gestureService.rotateSelection(selection, deltaRotation, gestureOptions);
    },

    // For a placement: a new placement of the same document (never a new
    // Document); returns its id or null. For bricks: one PasteBricksCommand with
    // fresh ids.
    duplicateSelection() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return null;
        }
        if (selection.isStructurePlacementSelection) {
            const command = new DuplicateStructurePlacementCommand({
                worldId: document.world.id,
                placementId: selection.selectedPlacementId
            });
            this._commandHistory.execute(command);
            if (command.executedPlacementId && this._selectionUseCase) {
                this._selectionUseCase.selectPlacement(command.executedPlacementId);
            }
            return command.executedPlacementId;
        }
        return this._duplicateBrickSelection(selection, document);
    },

    // A duplicate is a copy pasted at an offset, so this reuses the copy/paste use
    // cases with a throwaway clipboard: the user's real clipboard is never touched.
    // The copy becomes the selection.
    _duplicateBrickSelection(selection, document) {
        if (!this._copySelectionUseCase || !this._pasteClipboardUseCase) {
            return null;
        }
        const clipboard = this._copySelectionUseCase.execute(selection, document);
        if (!clipboard || clipboard.isEmpty) {
            return null;
        }
        const buildingId = selection.buildingId;
        const command = this._pasteClipboardUseCase.execute(clipboard, {
            worldId: document.world.id,
            buildingId,
            position: DUPLICATE_OFFSET
        });
        if (!command) {
            return null;
        }
        this._commandHistory.execute(command);
        if (command.executedBrickIds.length > 0) {
            const items = command.executedBrickIds.map((brickId) => ({ type: 'brick', buildingId, brickId }));
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return command.executedBrickIds[0] || null;
    },

    // options: { count, offset: {x,y,z} }. One history entry with an atomic
    // collision check: null means nothing changed. The new bricks become the
    // selection.
    repeatSelection(options = {}) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!this._repeatSelectionUseCase || selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        const buildingId = selection.buildingId;
        const command = this._repeatSelectionUseCase.execute(selection, document, options);
        if (!command) {
            return false;
        }
        this._commandHistory.execute(command);
        const items = command.commands
            .flatMap((child) => child.executedBrickIds)
            .map((brickId) => ({ type: 'brick', buildingId, brickId }));
        if (items.length > 0) {
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return true;
    },

    // Count and live bounds of a brick selection, for SelectionInspector. Null for
    // no document, an empty selection, or a placement selection (which has
    // getSelectedPlacementInfo(); the two shapes are kept apart so a UI cannot
    // wire placement editing to brick bounds).
    getSelectionSummary() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || selection.isStructurePlacementSelection || !document) {
            return null;
        }
        const bounds = this._boundsService.calculate(selection, document);
        if (!bounds) {
            return null;
        }
        return {
            count: selection.items.length,
            bounds
        };
    },

    // Null when nothing (or a non-placement) is selected, or the document or
    // history is not ready.
    getSelectedPlacementInfo() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!selection.isStructurePlacementSelection || !document) {
            return null;
        }
        const placement = document.world.getStructurePlacement(selection.selectedPlacementId);
        if (!placement) {
            return null;
        }
        let title = placement.documentId;
        if (this._loadDocumentUseCase && typeof this._loadDocumentUseCase.listSavedDocuments === 'function') {
            const entry = this._loadDocumentUseCase.listSavedDocuments()
                .find((doc) => doc.id === placement.documentId);
            if (entry) {
                title = entry.title;
            }
        }
        return {
            placementId: placement.id,
            documentId: placement.documentId,
            title,
            position: placement.position,
            rotation: placement.rotation,
            // Read-only (docs/Principles.md, "A Placement's Elevation Is Never A Gizmo Or
            // Numeric Target"), computed like the renderer does.
            groundY: terrainHeightAt(DEFAULT_WORLD_SEED, placement.position.x, placement.position.z)
        };
    },

    // Numeric targets for the selected placement, turned into the same delta calls
    // as dragging; omitted axes are unchanged and Y is never a target. Returns
    // { moved, blocked, rotated }; `blocked` means X/Z were requested but collide.
    applyPlacementTransform({ x = null, z = null, rotation = null } = {}) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!selection.isStructurePlacementSelection || !document) {
            return { moved: false, blocked: false, rotated: false };
        }
        const placementId = selection.selectedPlacementId;
        const placement = document.world.getStructurePlacement(placementId);
        if (!placement) {
            return { moved: false, blocked: false, rotated: false };
        }

        let moved = false;
        let blocked = false;
        if (x !== null || z !== null) {
            const targetX = x !== null ? Number(x) : placement.position.x;
            const targetZ = z !== null ? Number(z) : placement.position.z;
            const delta = { x: targetX - placement.position.x, y: 0, z: targetZ - placement.position.z };
            if (delta.x !== 0 || delta.z !== 0) {
                moved = this._moveStructurePlacement(placementId, delta);
                blocked = !moved;
            }
        }

        let rotated = false;
        if (rotation !== null) {
            const deltaRotation = Number(rotation) - placement.rotation;
            if (deltaRotation !== 0) {
                rotated = this._rotateStructurePlacement(placementId, deltaRotation);
            }
        }

        return { moved, blocked, rotated };
    },

    // Edits happen by opening the placement's Document, never by modifying the
    // instance.
    editStructurePlacementSource(documentId) {
        if (!documentId) {
            return false;
        }
        this.loadDocument(documentId);
        return true;
    },

    _moveStructurePlacement(placementId, delta) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory) {
            return false;
        }
        const world = document.world;
        const placement = world.getStructurePlacement(placementId);
        if (!placement) {
            return false;
        }
        const candidate = new Position(
            placement.position.x + delta.x,
            placement.position.y + delta.y,
            placement.position.z + delta.z
        );
        if (!this._structurePlacementFits(world, placement, candidate)) {
            return false;
        }
        this._commandHistory.execute(new MoveStructurePlacementCommand({
            worldId: world.id, placementId, delta
        }));
        return true;
    },

    _rotateStructurePlacement(placementId, deltaRotation) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory) {
            return false;
        }
        const world = document.world;
        if (!world.getStructurePlacement(placementId)) {
            return false;
        }
        this._commandHistory.execute(new RotateStructurePlacementCommand({
            worldId: world.id, placementId, deltaRotation
        }));
        return true;
    },

    // Excludes the placement's own id so it never collides with itself. Permissive
    // (true) without a resolver or a resolvable document.
    _structurePlacementFits(world, placement, candidatePosition) {
        if (!this._structureResolver) {
            return true;
        }
        const placedWorld = this._structureResolver.resolve(placement.documentId);
        if (!placedWorld) {
            return true;
        }
        const validator = new StructurePlacementValidator();
        return validator.canPlace(world, this._registry, this._structureResolver, {
            localBounds: SpatialBounds.fromWorld(placedWorld, this._registry),
            position: candidatePosition,
            excludePlacementId: placement.id
        });
    }
};
