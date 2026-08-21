// Runtime-only state: the result of inspecting a selected spatial object.
// Carries domain metadata resolved from World/Document, not renderer state.
// Never part of the ForkBuild Protocol.
export class SpatialInspectionState {
    constructor({
        type = null,
        documentId = null,
        buildingId = null,
        brickId = null,
        placementId = null,
        data = null
    } = {}) {
        this._type = type;
        this._documentId = documentId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._placementId = placementId;
        this._data = data;
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

    // 0.2.93 — World View Instance Inspection: the placementId of a
    // resolved StructurePlacement, mirroring buildingId/brickId above.
    get placementId() {
        return this._placementId;
    }

    get data() {
        return this._data;
    }

    get isEmpty() {
        return this._type === null;
    }

    static empty() {
        return new SpatialInspectionState();
    }
}
