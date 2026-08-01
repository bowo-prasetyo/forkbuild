// Maps brick id <-> mesh, plus brick id -> building id, so the renderer can
// go either direction in O(1): given a brick id, find its mesh (for
// removal); given a mesh — e.g. a raycast hit from PickingService — find
// which brick, and which building, it belongs to.
export class MeshRegistry {
    constructor() {
        this._meshesByBrickId = new Map();
        this._buildingIdsByBrickId = new Map();
        this._brickIdsByMeshUuid = new Map();
    }

    set(brickId, buildingId, mesh) {
        this._meshesByBrickId.set(brickId, mesh);
        this._buildingIdsByBrickId.set(brickId, buildingId);
        this._brickIdsByMeshUuid.set(mesh.uuid, brickId);
    }

    getMesh(brickId) {
        return this._meshesByBrickId.get(brickId) || null;
    }

    getBuildingId(brickId) {
        return this._buildingIdsByBrickId.get(brickId) || null;
    }

    getBrickId(meshUuid) {
        return this._brickIdsByMeshUuid.get(meshUuid) || null;
    }

    getAllMeshes() {
        return Array.from(this._meshesByBrickId.values());
    }

    delete(brickId) {
        const mesh = this._meshesByBrickId.get(brickId);
        if (mesh) {
            this._brickIdsByMeshUuid.delete(mesh.uuid);
        }
        this._meshesByBrickId.delete(brickId);
        this._buildingIdsByBrickId.delete(brickId);
    }

    clear() {
        this._meshesByBrickId.clear();
        this._buildingIdsByBrickId.clear();
        this._brickIdsByMeshUuid.clear();
    }
}
