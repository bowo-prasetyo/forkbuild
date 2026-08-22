import { CompositionPreviewState } from './editor-state/CompositionPreviewState.js';

// The single entry point for changing the structure-composition
// preview — 0.4.1's counterpart to application/StructurePreviewUseCase.js
// one rung over. application/tools/StructureCompositionTool.js calls
// show()/hide() here rather than touching EditorContext.compositionPreview
// directly, the same discipline every other preview use case in this
// codebase already follows.
export class CompositionPreviewUseCase {
    constructor(editorContext) {
        this._editorContext = editorContext;
    }

    show(structure, position, rotation = 0, valid = true) {
        this._editorContext.setCompositionPreview(new CompositionPreviewState({
            visible: true,
            structure,
            position,
            rotation,
            valid
        }));
    }

    hide() {
        this._editorContext.setCompositionPreview(CompositionPreviewState.hidden());
    }
}
