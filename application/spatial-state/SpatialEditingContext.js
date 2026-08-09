// Runtime-only state: what is currently editable in the spatial world.
// Carries capability flags so the UI never assumes what can be done.
// No Three.js objects, no domain mutations — pure intent description.
export class SpatialEditingContext {
    constructor({
        type = null,
        documentId = null,
        buildingId = null,
        brickId = null,
        capabilities = {}
    } = {}) {
        this._type = type;
        this._documentId = documentId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._capabilities = capabilities;
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

    get capabilities() {
        return this._capabilities;
    }

    get isEmpty() {
        return this._type === null;
    }

    can(capability) {
        return !!this._capabilities[capability];
    }

    static empty() {
        return new SpatialEditingContext();
    }
}
