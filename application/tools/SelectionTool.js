=== FILE: ./application/tools/SelectionTool.js ===
import { Tool } from './Tool.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';
import { CompositeCommand } from '../commands/CompositeCommand.js';
import { SelectionState } from '../editor-state/SelectionState.js';

const DELETE_KEYS = new Set(['Delete', 'Backspace']);

// Pointer down -> select the hit brick (pointerEvent.pickedBrick, already
// computed by InputDispatcher), or clear on a miss. As of 0.1.18 this
// tool no longer calls PickingService itself — the event already carries
// the answer. Escape-to-clear and Delete/Backspace-to-remove both live
// here rather than in EditorView — input handling belongs with the tool
// it belongs to, not the UI shell.
export class SelectionTool extends Tool {
    onPointerDown(pointerEvent) {
        const isToggle = pointerEvent.modifiers.ctrl || pointerEvent.modifiers.meta;
        const current = this.context.editorContext.selection;

        if (pointerEvent.pickedBrick) {
            const { brickId, buildingId } = pointerEvent.pickedBrick;
            
            if (isToggle) {
                const isSelected = current.contains(brickId);
                const newItems = isSelected
                    ? current.items.filter(i => i.brickId !== brickId)
                    : [...current.items, { brickId, buildingId }];
                this.context.selectionUseCase.setSelection(new SelectionState(newItems));
            } else {
                this.context.selectionUseCase.select(brickId, buildingId);
            }
        } else if (!isToggle) {
            this.context.selectionUseCase.clear();
        }
    }

    onKeyDown(keyEvent) {
        if (keyEvent.key === 'Escape') {
            this.context.selectionUseCase.clear();
            return;
        }

        if (keyEvent.key === 'Delete' || keyEvent.key === 'Backspace') {
            this._deleteSelected();
        }
    }

    _deleteSelected() {
        const selection = this.context.editorContext.selection;
        if (selection.isEmpty) return;

        const composite = new CompositeCommand();
        for (const item of selection.items) {
            composite.add(new DeleteBrickCommand({
                worldId: this.context.world.id,
                buildingId: item.buildingId,
                brickId: item.brickId
            }));
        }

        this.context.commandHistory.execute(composite);
        this.context.selectionUseCase.clear();
    }
}
