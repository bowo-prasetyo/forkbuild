// Maps brick id <-> mesh, plus brick id -> building id and
// brick id -> document id, so the renderer can go either direction
// in O(1). documentId may be null for single-world editor sessions.
export class MeshRegistry {
    constructor() {
        this._entries = new Map();
        this._brickIdsByMeshUuid = new Map();
    }

    set(brickId, documentId, buildingId, mesh) {
        this._entries.set(brickId, { documentId, buildingId, mesh });
        this._brickIdsByMeshUuid.set(mesh.uuid, brickId);
    }

    getMesh(brickId) {
        return this._entries.get(brickId)?.mesh || null;
    }

    getDocumentId(brickId) {
        return this._entries.get(brickId)?.documentId || null;
    }

    getBuildingId(brickId) {
        return this._entries.get(brickId)?.buildingId || null;
    }

    getBrickId(meshUuid) {
        return this._brickIdsByMeshUuid.get(meshUuid) || null;
    }

    getAllMeshes() {
        return Array.from(this._entries.values()).map((e) => e.mesh);
    }

    delete(brickId) {
        const entry = this._entries.get(brickId);
        if (entry) {
            this._brickIdsByMeshUuid.delete(entry.mesh.uuid);
        }
        this._entries.delete(brickId);
    }

    clear() {
        this._entries.clear();
        this._brickIdsByMeshUuid.clear();
    }
}
