import { StructurePreviewState } from './editor-state/StructurePreviewState.js';

// The single entry point for changing the structure-placement preview.
// StructurePlacementTool calls show()/hide() here rather than touching
// EditorContext.structurePreview directly — same discipline
// application/PreviewUseCase.js already established for the brick ghost.
export class StructurePreviewUseCase {
    constructor(editorContext) {
        this._editorContext = editorContext;
    }

    show(documentId, title, position, rotation = 0, valid = true) {
        this._editorContext.setStructurePreview(new StructurePreviewState({
            visible: true,
            documentId,
            title,
            position,
            rotation,
            valid
        }));
    }

    hide() {
        this._editorContext.setStructurePreview(StructurePreviewState.hidden());
    }
}
