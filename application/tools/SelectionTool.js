import { Tool } from './Tool.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';
import { CompositeCommand } from '../commands/CompositeCommand.js';

const DELETE_KEYS = new Set(['Delete', 'Backspace']);
const NUDGE = 1;
// Keyboard transforms mirror World View exactly (0.1.44 parity):
// arrows move X/Z, PageUp/PageDown move Y, R rotates about the
// selection pivot (Shift+R counter-clockwise). All of them route
// through TransformSelectionUseCase — the same single transform path
// World View uses — so the Editor never grows its own transform
// implementation.
const TRANSLATION_KEYS = {
    ArrowUp: { x: 0, y: 0, z: -NUDGE },
    ArrowDown: { x: 0, y: 0, z: NUDGE },
    ArrowLeft: { x: -NUDGE, y: 0, z: 0 },
    ArrowRight: { x: NUDGE, y: 0, z: 0 },
    PageUp: { x: 0, y: NUDGE, z: 0 },
    PageDown: { x: 0, y: -NUDGE, z: 0 }
};

// Pointer down -> select the hit brick (pointerEvent.pickedBrick, already
// computed by InputDispatcher), or clear on a miss. Escape-to-clear and
// Delete/Backspace-to-remove live here rather than in EditorView — input
// handling belongs with the tool it belongs to, not the UI shell.
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
            return;
        }
        if (keyEvent.modifiers.ctrl || keyEvent.modifiers.meta || keyEvent.modifiers.alt) {
            return;
        }
        if (TRANSLATION_KEYS[keyEvent.key]) {
            this._applyTransform({ translation: TRANSLATION_KEYS[keyEvent.key] }, 'Move');
            return;
        }
        if (keyEvent.key.toLowerCase() === 'r') {
            this._applyTransform({ rotation: keyEvent.modifiers.shift ? -90 : 90 }, 'Rotate');
        }
    }

    _applyTransform(transform, verb) {
        const selection = this.context.editorContext.selection;
        if (!selection || selection.isEmpty) {
            return;
        }
        const useCase = this.context.transformSelectionUseCase;
        if (!useCase) {
            return;
        }
        const count = selection.items.length;
        useCase.execute(
            this.context.commandHistory,
            this.context.world,
            selection,
            transform,
            `${verb} ${count} ${count === 1 ? 'Brick' : 'Bricks'}`
        );
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
