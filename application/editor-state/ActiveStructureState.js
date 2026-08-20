// Pure data: which Document is currently "loaded" for structure
// placement — what Toolbar's Recent Documents list (0.2.90) sets via
// EditorSession.placeDocument() and StructurePlacementTool will read.
// null means nothing is selected to place yet. Mirrors
// application/editor-state/ActiveBrickState.js one rung up: a Brick
// palette selection carries a definitionId (a BrickRegistry lookup key);
// a structure placement selection carries a documentId (a storage
// lookup key) plus the title it was picked under, so UI can show
// "Placing: House" without a second storage read.
export class ActiveStructureState {
    constructor(documentId = null, title = null) {
        this._documentId = documentId;
        this._title = title;
    }

    get documentId() {
        return this._documentId;
    }

    get title() {
        return this._title;
    }
}
