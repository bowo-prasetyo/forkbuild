import { SelectionState } from '../editor-state/SelectionState.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';
import { SetBrickColorCommand } from '../commands/SetBrickColorCommand.js';
import { CompositeCommand } from '../commands/CompositeCommand.js';
import { ToolId } from '../editor-state/ToolId.js';
import { Position } from '../../core/Position.js';
import { CameraState } from '../../renderer/CameraState.js';

// EditorSession selection editing: select all or none, marquee selection,
// framing the camera, entry contexts, delete, recolor, and align, distribute
// and numeric transforms.

// Same camera offset as WorldNavigationSession#focusLocation(), so both views
// frame locations the same way.
const ENTRY_CAMERA_OFFSET = { x: 12, y: 12, z: 12 };

export const selectionEditingMethods = {
    selectAll() {
        const document = this._documentManager.document;
        if (!document) {
            return false;
        }
        const items = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                items.push({ type: 'brick', buildingId: building.id, brickId: brick.id });
            }
        }
        if (items.length === 0) {
            return false;
        }
        this._editorContext.setSelection(new SelectionState({ items }));
        return true;
    },

    clearSelection() {
        this._editorContext.clearSelection();
        return true;
    },

    // Frames the camera on `position` (layout position plus a fixed offset,
    // looking at it), so "Edit a Copy" opens on what the viewer was looking at.
    // Returns false before a render session exists or without a position.
    frameCameraOn(position) {
        if (!this._session || !position) {
            return false;
        }
        const { x, y, z } = position;
        this._session.setCameraState(new CameraState({
            position: new Position(x + ENTRY_CAMERA_OFFSET.x, y + ENTRY_CAMERA_OFFSET.y, z + ENTRY_CAMERA_OFFSET.z),
            target: new Position(x, y, z),
            zoom: 1
        }));
        return true;
    },

    // Applies an EditorEntryContext after a fork opens: frames the camera and,
    // only when the opened document is the focused object's own content (a
    // Structure), selects everything. A null context leaves camera and selection
    // as they are.
    applyEntryContext(entryContext) {
        if (!entryContext) {
            return false;
        }
        if (entryContext.focusPosition) {
            this.frameCameraOn(entryContext.focusPosition);
        }
        if (entryContext.selectAllBricks) {
            this.selectAll();
        }
        return true;
    },

    marqueeSelect({ x0, y0, x1, y1 } = {}, { additive = false } = {}) {
        if (!this._session || typeof this._session.pickRectangle !== 'function') {
            return false;
        }
        const hits = this._session.pickRectangle(x0, y0, x1, y1) || [];
        const items = hits
            .filter((hit) => hit && hit.buildingId && hit.brickId)
            .map((hit) => ({
                type: 'brick',
                buildingId: hit.buildingId,
                brickId: hit.brickId
            }));
        const nextSelection = additive
            ? items.reduce(
                (selection, item) => selection.add(item.brickId, item.buildingId),
                this._editorContext.selection
            )
            : new SelectionState({ items });

        this._editorContext.setSelection(nextSelection);
        if (typeof this._session.selectBricks === 'function') {
            this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
        }
        return true;
    },

    // One DeleteBrickCommand per brick in one CompositeCommand (a single undo
    // step). A structure-placement selection removes the placement instead, via
    // the same action.
    deleteSelection() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        if (selection.isStructurePlacementSelection) {
            const removed = this.removeStructurePlacement(selection.selectedPlacementId);
            if (removed) {
                this._editorContext.clearSelection();
            }
            return removed;
        }
        const worldId = document.world.id;
        const commands = selection.items.map((item) => new DeleteBrickCommand({
            worldId,
            buildingId: item.buildingId,
            brickId: item.brickId
        }));
        const command = commands.length === 1
            ? commands[0]
            : commands.reduce((composite, child) => composite.add(child),
                new CompositeCommand({ description: `Delete ${commands.length} Bricks` }));
        this._commandHistory.execute(command);
        this._editorContext.clearSelection();
        return true;
    },

    // One undo step for any number of bricks. Brick selections only: a placement
    // has no single color.
    recolorSelection(color) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        if (selection.isStructurePlacementSelection) {
            return false;
        }
        const worldId = document.world.id;
        const commands = selection.items.map((item) => new SetBrickColorCommand({
            worldId,
            buildingId: item.buildingId,
            brickId: item.brickId,
            color
        }));
        const command = commands.length === 1
            ? commands[0]
            : commands.reduce((composite, child) => composite.add(child),
                new CompositeCommand({ description: `Recolor ${commands.length} Bricks` }));
        this._commandHistory.execute(command);
        return true;
    },

    alignSelection(mode) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.alignSelection(this._editorContext.selection, mode);
    },

    distributeSelection(axis) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.distributeSelection(this._editorContext.selection, axis);
    },

    applyNumericTransform(intent, options = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.applyNumericTransform(this._editorContext.selection, intent, options);
    }
};
