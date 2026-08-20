import { SelectionState } from './editor-state/SelectionState.js';

// The single entry point for changing selection. UI code calls
// select()/toggle()/add()/clear() here rather than touching
// EditorContext.selection directly — so that later, history, analytics,
// or multiplayer can hook into "a selection happened" in exactly one
// place without SelectionState itself needing to know any of them exist.
// The state object stays dumb.
//
// Selection operations are session state only — none of these methods
// ever produces a history entry (0.1.45 contract).
export class SelectionUseCase {
    constructor(editorContext) {
        this._editorContext = editorContext;
    }

    select(brickId, buildingId) {
        this._editorContext.setSelection(new SelectionState({ brickId, buildingId }));
    }

    toggle(brickId, buildingId) {
        this._editorContext.setSelection(
            this._editorContext.selection.toggle(brickId, buildingId)
        );
    }

    add(brickId, buildingId) {
        this._editorContext.setSelection(
            this._editorContext.selection.add(brickId, buildingId)
        );
    }

    selectItems(items) {
        this._editorContext.setSelection(new SelectionState({ items }));
    }

    // 0.2.91 — World Instance Editing & Placement Management. Replaces
    // the selection with exactly one structure-placement item — a
    // placement selection is always whole-instance and exclusive, never
    // additive with a brick selection (see SelectionState's own header).
    selectPlacement(placementId) {
        this._editorContext.setSelection(
            new SelectionState({ items: [{ type: 'structure-placement', placementId }] })
        );
    }

    clear() {
        this._editorContext.clearSelection();
    }
}
