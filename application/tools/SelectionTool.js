import { Tool } from './Tool.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';

const DELETE_KEYS = new Set(['Delete', 'Backspace']);

// Pointer down -> select the hit brick (pointerEvent.pickedBrick, already
// computed by InputDispatcher), or clear on a miss. As of 0.1.18 this
// tool no longer calls PickingService itself — the event already carries
// the answer. Escape-to-clear and Delete/Backspace-to-remove both live
// here rather than in EditorView — input handling belongs with the tool
// it belongs to, not the UI shell.
export class SelectionTool extends Tool {
    onPointerDown(pointerEvent) {
        if (pointerEvent.pickedBrick) {
            this.context.selectionUseCase.select(
                pointerEvent.pickedBrick.brickId,
                pointerEvent.pickedBrick.buildingId
            );
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
