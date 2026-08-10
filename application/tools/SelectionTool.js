import { Tool } from './Tool.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';
import { CompositeCommand } from '../commands/CompositeCommand.js';

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
            const toggle = pointerEvent.modifiers.ctrl || pointerEvent.modifiers.meta || pointerEvent.modifiers.shift;
            if (toggle) {
                this.context.selectionUseCase.toggle(
                    pointerEvent.pickedBrick.brickId,
                    pointerEvent.pickedBrick.buildingId
                );
            } else {
                this.context.selectionUseCase.select(
                    pointerEvent.pickedBrick.brickId,
                    pointerEvent.pickedBrick.buildingId
                );
            }
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

        const commands = selection.items.map((item) => new DeleteBrickCommand({
            worldId: this.context.world.id,
            buildingId: item.buildingId,
            brickId: item.brickId
        }));
        const command = commands.length === 1
            ? commands[0]
            : commands.reduce((composite, child) => composite.add(child), new CompositeCommand({ description: `Delete ${commands.length} Bricks` }));
        this.context.commandHistory.execute(command);
        this.context.selectionUseCase.clear();
    }
}
