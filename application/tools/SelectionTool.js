import { Tool } from './Tool.js';

// The first real tool, and intentionally the simplest: pointer down ->
// pick -> select the hit brick, or clear on a miss. Escape-to-clear now
// lives here rather than being hardcoded in EditorView — a concrete
// demonstration of why the framework was worth building: input handling
// that used to live in ui/ now lives with the tool it belongs to.
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
        }
    }
}
