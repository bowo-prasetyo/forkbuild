import * as THREE from 'three';

// Answers exactly one question: what brick (if any) is under this screen
// position? Nothing about selection, highlighting, or UI state — those are
// separate concerns (Selection Service, 0.1.10+) built on top of this.
// Picking does not depend on Selection; Selection will depend on Picking.
export class PickingService {
    constructor(camera, domElement, meshRegistry) {
        this._camera = camera;
        this._domElement = domElement;
        this._meshRegistry = meshRegistry;
        this._raycaster = new THREE.Raycaster();
    }

    // Returns null, or { brickId, buildingId }.
    pick(screenX, screenY) {
        const ndc = this._toNormalizedDeviceCoordinates(screenX, screenY);
        this._raycaster.setFromCamera(ndc, this._camera);

        const meshes = this._meshRegistry.getAllMeshes();
        const intersections = this._raycaster.intersectObjects(meshes, false);

        if (intersections.length === 0) {
            return null;
        }

        const hitMesh = intersections[0].object;
        const brickId = this._meshRegistry.getBrickId(hitMesh.uuid);
        if (!brickId) {
            return null;
        }

        const buildingId = this._meshRegistry.getBuildingId(brickId);
        return { brickId, buildingId };
    }

    _toNormalizedDeviceCoordinates(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
}
