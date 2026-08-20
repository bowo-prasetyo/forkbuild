import { Position } from '../../core/Position.js';

// Pure data: is a structure-placement preview currently "active," and if
// so which Document, where, at what rotation, and whether the position
// is currently collision-clear. Editor State, not Domain State — never
// becomes a real StructurePlacement until PlaceStructureCommand (0.2.90)
// commits it to World. Mirrors application/editor-state/PreviewState.js
// (the brick ghost) one rung up.
//
// Deliberately NOT a 3D ghost mesh in 0.2.90 — there is no
// StructurePreviewRenderer. `visible`/`valid` exist so a UI surface
// (ui/views/EditorView.js's placement hint) can show text feedback
// ("Placing: House — click to place, R to rotate") and tint it when
// blocked, the same information PreviewState already gives the brick
// ghost, just not yet spent on a full multi-brick 3D preview — see
// docs/Roadmap.md, 0.2.91, for where that visual richness is planned.
export class StructurePreviewState {
    constructor({
        visible = false,
        documentId = null,
        title = null,
        position = new Position(),
        rotation = 0,
        valid = true
    } = {}) {
        this._visible = visible;
        this._documentId = documentId;
        this._title = title;
        this._position = position;
        this._rotation = rotation;
        this._valid = valid;
    }

    get visible() { return this._visible; }
    get documentId() { return this._documentId; }
    get title() { return this._title; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get valid() { return this._valid; }

    static hidden() {
        return new StructurePreviewState();
    }
}
