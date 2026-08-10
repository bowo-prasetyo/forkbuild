// Pure data: which brick (if any) is currently selected, and which
// building it belongs to. Deliberately mirrors PickingService's return
// shape ({ brickId, buildingId }) — Selection (0.1.11) is built directly
// on top of Picking, not a separate concept with its own shape.
export class SelectionState {
    constructor({ brickId = null, buildingId = null } = {}) {
        this._brickId = brickId;
        this._buildingId = buildingId;
    }

    get brickId() {
        return this._brickId;
    }

    get buildingId() {
        return this._buildingId;
    }

    get isEmpty() {
        return this._brickId === null;
    }

    equals(other) {
        return other instanceof SelectionState
            && this._brickId === other.brickId
            && this._buildingId === other.buildingId;
    }

    static empty() {
        return new SelectionState();
    }
}
