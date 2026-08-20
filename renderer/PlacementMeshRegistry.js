// 0.2.91 — World Instance Editing & Placement Management. Maps
// placementId <-> the meshes rendering it, plus mesh uuid -> placementId
// for O(1) picking — the placement-mesh counterpart to MeshRegistry.js,
// deliberately a SEPARATE small registry rather than widening
// MeshRegistry itself.
//
// This is the direct enabling change for "select the whole instance,
// never a constituent brick": renderer/WorldRenderer.js's own 0.2.90
// header explains why a placement's bricks are never registered with
// MeshRegistry (the same Document placed twice would mint the same
// brick ids twice into a registry keyed by brick id alone). Picking a
// placement therefore needs its OWN mesh -> id mapping, keyed by
// placementId (unique per instance, never reused across placements of
// the same Document) rather than brickId.
export class PlacementMeshRegistry {
    constructor() {
        this._meshesByPlacementId = new Map();
        this._placementIdByMeshUuid = new Map();
    }

    set(placementId, meshes) {
        this._meshesByPlacementId.set(placementId, meshes);
        for (const mesh of meshes) {
            this._placementIdByMeshUuid.set(mesh.uuid, placementId);
        }
    }

    getMeshes(placementId) {
        return this._meshesByPlacementId.get(placementId) || [];
    }

    getPlacementId(meshUuid) {
        return this._placementIdByMeshUuid.get(meshUuid) || null;
    }

    getAllMeshes() {
        const all = [];
        for (const meshes of this._meshesByPlacementId.values()) {
            all.push(...meshes);
        }
        return all;
    }

    delete(placementId) {
        const meshes = this._meshesByPlacementId.get(placementId);
        if (meshes) {
            for (const mesh of meshes) {
                this._placementIdByMeshUuid.delete(mesh.uuid);
            }
        }
        this._meshesByPlacementId.delete(placementId);
    }

    clear() {
        this._meshesByPlacementId.clear();
        this._placementIdByMeshUuid.clear();
    }
}
