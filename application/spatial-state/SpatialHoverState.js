import { WorldPosition } from '../../core/WorldPosition.js';

// Runtime-only state: what is currently hovered in the spatial world?
// Distinct from SpatialSelectionState — hover is transient observation,
// selection is persistent observation. Not part of the protocol;
// never serialized.
export class SpatialHoverState {
    constructor({
        type = null,
        documentId = null,
        buildingId = null,
        brickId = null,
        position = null
    } = {}) {
        this._type = type;
        this._documentId = documentId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._position = position;
    }

    get type() {
        return this._type;
    }

    get documentId() {
        return this._documentId;
    }

    get buildingId() {
        return this._buildingId;
    }

    get brickId() {
        return this._brickId;
    }

    get position() {
        return this._position;
    }

    get isEmpty() {
        return this._type === null;
    }

    static empty() {
        return new SpatialHoverState();
    }

    static brick({ documentId, buildingId, brickId, point }) {
        return new SpatialHoverState({
            type: 'brick',
            documentId,
            buildingId,
            brickId,
            position: point
        });
    }

    static ground(position) {
        return new SpatialHoverState({
            type: 'ground',
            position
        });
    }
}
