import * as THREE from 'three';
import { Position } from '../core/Position.js';

// Answers two questions, both from screen coordinates: what brick (if
// any) is under this position (pick), and where would a ray hit the
// ground plane (pickGroundPosition)? Nothing about selection, preview
// state, or UI — those are separate concerns built on top of this.
// Picking does not depend on Selection or Preview; they depend on it.
export class PickingService {
    constructor(camera, domElement, meshRegistry) {
        this._camera = camera;
        this._domElement = domElement;
        this._meshRegistry = meshRegistry;
        this._raycaster = new THREE.Raycaster();
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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

    // Returns a core/Position (never a Three.js type) where the ray from
    // this screen position hits the ground plane (y = 0), or null if the
    // ray doesn't hit it at all (e.g. looking straight up).
    pickGroundPosition(screenX, screenY) {
        const ndc = this._toNormalizedDeviceCoordinates(screenX, screenY);
        this._raycaster.setFromCamera(ndc, this._camera);

        const target = new THREE.Vector3();
        const hit = this._raycaster.ray.intersectPlane(this._groundPlane, target);
        if (!hit) {
            return null;
        }

        return new Position(target.x, target.y, target.z);
    }

    _toNormalizedDeviceCoordinates(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
}
