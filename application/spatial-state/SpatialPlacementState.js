import { Position } from '../../core/Position.js';

// Runtime-only state: where a brick would be placed if committed.
// Carries document-local position; the renderer adds layout offsets.
//
// `valid` and `blocked` answer two different questions, deliberately
// kept separate (0.2.87): `valid` means "a real ground/stack target was
// resolved at all" (unchanged since 0.2.27 — false means there's
// nothing to show, WorldNavigationSession hides the preview entirely);
// `blocked` means "that target is currently occupied," per
// core/PlacementValidator.js, and only means anything when `valid` is
// already true. The preview stays VISIBLE while blocked (tinted red by
// SpatialPreviewRenderer) rather than hiding — the user is hovering a
// real position, it just can't be placed, and the ghost should say so
// rather than vanishing as if nothing were there.
export class SpatialPlacementState {
    constructor({
        valid = false,
        definitionId = null,
        position = new Position(),
        rotation = 0,
        blocked = false,
        targetDocumentId = null,
        targetBuildingId = null
    } = {}) {
        this._valid = valid;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
        this._blocked = blocked;
        this._targetDocumentId = targetDocumentId;
        this._targetBuildingId = targetBuildingId;
    }

    get valid() { return this._valid; }
    get definitionId() { return this._definitionId; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get blocked() { return this._blocked; }
    get targetDocumentId() { return this._targetDocumentId; }
    get targetBuildingId() { return this._targetBuildingId; }

    static empty() {
        return new SpatialPlacementState();
    }
}
