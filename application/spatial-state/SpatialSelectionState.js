import { Position } from '../../core/Position.js';

// Runtime-only state: what is currently selected in the spatial world?
// Not part of the ForkBuild Protocol; never serialized. Immutable:
// factories return new instances rather than mutating.
export class SpatialSelectionState {
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
        return new SpatialSelectionState();
    }

    static brick({ documentId, buildingId, brickId, point }) {
        return new SpatialSelectionState({
            type: 'brick',
            documentId,
            buildingId,
            brickId,
            position: point
        });
    }

    static ground(position) {
        return new SpatialSelectionState({
            type: 'ground',
            position
        });
    }
}
