// Pure data: which library core/Structure.js (if any) is currently
// being composed into the open Document — 0.4.1's Editor State
// counterpart to editor-state/ActiveStructureState.js one rung over.
//
// Deliberately holds the Structure INSTANCE itself, not an id: unlike
// ActiveStructureState (which names a documentId StructurePlacementTool
// resolves through application/StructureDocumentResolver.js at every
// pointer move), a library Structure is not a Document — there is
// nothing to resolve it FROM at render time, so the only thing to carry
// is the Structure a caller already has in hand (from
// core/StructureRegistry.js). Never mutated in place; a Structure is
// immutable library content (core/Structure.js's own header).
export class ActiveCompositionState {
    constructor(structure = null) {
        this._structure = structure || null;
    }

    get structure() { return this._structure; }
    get isActive() { return this._structure !== null; }

    static none() {
        return new ActiveCompositionState();
    }
}
