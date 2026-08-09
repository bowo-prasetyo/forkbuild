import { Position } from '../../core/Position.js';

// Runtime-only state: where a brick would be placed if committed.
// Carries document-local position; the renderer adds layout offsets.
export class SpatialPlacementState {
    constructor({
        valid = false,
        definitionId = null,
        position = new Position(),
        rotation = 0,
        targetDocumentId = null,
        targetBuildingId = null
    } = {}) {
        this._valid = valid;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
        this._targetDocumentId = targetDocumentId;
        this._targetBuildingId = targetBuildingId;
    }

    get valid() { return this._valid; }
    get definitionId() { return this._definitionId; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get targetDocumentId() { return this._targetDocumentId; }
    get targetBuildingId() { return this._targetBuildingId; }

    static empty() {
        return new SpatialPlacementState();
    }
}
