import { PreviewState } from './editor-state/PreviewState.js';

// The single entry point for changing the placement preview. Tools call
// show()/hide() here rather than touching EditorContext.preview directly
// — same discipline as SelectionUseCase.
export class PreviewUseCase {
    constructor(editorContext) {
        this._editorContext = editorContext;
    }

    show(definitionId, position, rotation = 0, valid = true) {
        this._editorContext.setPreview(new PreviewState({
            visible: true,
            definitionId,
            position,
            rotation,
            valid
        }));
    }

    hide() {
        this._editorContext.setPreview(PreviewState.hidden());
    }
}
