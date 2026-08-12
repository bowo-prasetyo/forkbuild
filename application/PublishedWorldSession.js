import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';

// A runtime projection of a Publication (0.2.4).
//
// The critical architectural invariant: a PublishedWorldSession has NO
// mutation pathway to its loaded Document. It exposes selection and
// inspection capabilities, but deliberately omits every editing,
// history, and persistence method.
//
// Read-only-ness is enforced by the session's shape and the explicit
// `capabilities` object, which the EditorActionRegistry reads to
// formally disable mutation actions in the UI.
export class PublishedWorldSession {
    constructor({ document, publication }) {
        this._document = document;
        this._publication = publication;
        this._spatialSelection = SpatialSelectionState.empty();
        
        // Explicit descriptive capability boundary.
        this.capabilities = Object.freeze({
            canEdit: false,
            canNavigate: true,
            canSelect: true,
            canSave: false,
            canPublish: false,
            canUndo: false,
            canRedo: false
        });
    }

    getDocument() {
        return this._document;
    }

    getWorld() {
        return this._document.world;
    }

    getPublication() {
        return this._publication;
    }

    // --- Inspection / Selection (Zero History) -------------------------

    getSpatialSelection() {
        return this._spatialSelection;
    }

    getSelectionCount() {
        return this._spatialSelection.isEmpty ? 0 : this._spatialSelection.items.length;
    }

    selectBrick(brickId, buildingId) {
        this._spatialSelection = SpatialSelectionState.brick({
            documentId: this._document.world.id,
            buildingId,
            brickId
        });
    }

    selectItems(items) {
        this._spatialSelection = SpatialSelectionState.bricks({
            documentId: this._document.world.id,
            items
        });
    }

    clearSelection() {
        this._spatialSelection = SpatialSelectionState.empty();
    }
    
    // Context queries for EditorActionContext.capture()
    // These return inert defaults, ensuring the palette never throws.
    getGroups() { return []; }
    getSelectedGroupId() { return null; }
    getClipboardCount() { return 0; }
    isGestureActive() { return false; }
}
