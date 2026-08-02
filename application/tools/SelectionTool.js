import { Tool } from './Tool.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';

const DELETE_KEYS = new Set(['Delete', 'Backspace']);

// Pointer down -> pick -> select the hit brick, or clear on a miss.
// Escape-to-clear and (as of this milestone) Delete/Backspace-to-remove
// both live here rather than in EditorView — input handling belongs with
// the tool it belongs to, not the UI shell.
export class SelectionTool extends Tool {
    onPointerDown(pointerEvent) {
        const result = this.context.pick(pointerEvent.screenX, pointerEvent.screenY);
        if (result) {
            this.context.selectionUseCase.select(result.brickId, result.buildingId);
        } else {
            this.context.selectionUseCase.clear();
        }
    }

    onKeyDown(keyEvent) {
        if (keyEvent.key === 'Escape') {
            this.context.selectionUseCase.clear();
            return;
        }

        if (DELETE_KEYS.has(keyEvent.key)) {
            this._deleteSelected();
        }
    }

    _deleteSelected() {
        const selection = this.context.editorContext.selection;
        if (selection.isEmpty) {
            return;
        }

        const command = new DeleteBrickCommand({
            worldId: this.context.world.id,
            buildingId: selection.buildingId,
            brickId: selection.brickId
        });
        this.context.commandHistory.execute(command);
        this.context.selectionUseCase.clear();
    }
}
