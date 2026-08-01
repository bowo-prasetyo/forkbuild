import { SelectionState } from './editor-state/SelectionState.js';

// The single entry point for changing selection. UI code calls
// select()/clear() here rather than touching EditorContext.selection
// directly — so that later, history, analytics, or multiplayer can hook
// into "a selection happened" in exactly one place without SelectionState
// itself needing to know any of them exist. The state object stays dumb.
export class SelectionUseCase {
    constructor(editorContext) {
        this._editorContext = editorContext;
    }

    select(brickId, buildingId) {
        this._editorContext.setSelection(new SelectionState({ brickId, buildingId }));
    }

    clear() {
        this._editorContext.clearSelection();
    }
}
