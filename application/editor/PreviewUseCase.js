import { PreviewState } from '../editor-state/PreviewState.js';

// The single entry point for changing the placement preview. Tools call
// show()/hide() here rather than touching EditorContext.preview directly
// — same discipline as SelectionUseCase.
export class PreviewUseCase {
    constructor(editorContext) {
        this._editorContext = editorContext;
    }

    show(definitionId, position, rotation = 0, valid = true, color = null, tilt = 0) {
        this._editorContext.setPreview(new PreviewState({
            visible: true,
            definitionId,
            position,
            rotation,
            tilt,
            valid,
            color
        }));
    }

    hide() {
        this._editorContext.setPreview(PreviewState.hidden());
    }
}
