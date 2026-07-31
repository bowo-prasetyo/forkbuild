// Maps brick id -> mesh. This is what makes incremental rendering
// (BrickAdded -> create one mesh, BrickRemoved -> delete one mesh) possible
// without ever searching the scene graph to find the mesh that belongs to
// a given brick.
export class MeshRegistry {
    constructor() {
        this._meshesByBrickId = new Map();
    }

    set(brickId, mesh) {
        this._meshesByBrickId.set(brickId, mesh);
    }

    get(brickId) {
        return this._meshesByBrickId.get(brickId) || null;
    }

    delete(brickId) {
        this._meshesByBrickId.delete(brickId);
    }

    getAll() {
        return Array.from(this._meshesByBrickId.values());
    }

    clear() {
        this._meshesByBrickId.clear();
    }
}
