import { Position } from '../../core/Position.js';

// Pure data: is a Structure-composition preview currently active, and
// if so which Structure, where, at what rotation, and whether that
// position is currently collision-clear. 0.4.1's Editor State
// counterpart to editor-state/StructurePreviewState.js one rung over —
// same shape, same "never becomes real World state until a command
// commits it" contract, applied to composing a library Structure into
// the CURRENT document instead of placing a StructurePlacement
// reference.
//
// Carries the Structure instance itself (never just a documentId): see
// ActiveCompositionState's own header on why a library Structure has
// nothing to resolve a reference FROM. That is also what
// renderer/CompositionPreviewRenderer.js reads to build its ghost
// meshes — structure.bricks are already right there, no
// StructureDocumentResolver round-trip needed the way
// StructurePreviewState's documentId requires one.
export class CompositionPreviewState {
    constructor({
        visible = false,
        structure = null,
        position = new Position(),
        rotation = 0,
        valid = true
    } = {}) {
        this._visible = visible;
        this._structure = structure;
        this._position = position;
        this._rotation = rotation;
        this._valid = valid;
    }

    get visible() { return this._visible; }
    get structure() { return this._structure; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get valid() { return this._valid; }

    static hidden() {
        return new CompositionPreviewState();
    }
}
