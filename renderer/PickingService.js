import * as THREE from 'three';
import { Position } from '../core/Position.js';
import { WorldPosition } from '../core/WorldPosition.js';

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

    // Legacy shape for EditorView: { brickId, buildingId } | null.
    pick(screenX, screenY) {
        const result = this.pickRich(screenX, screenY);
        if (!result || result.type !== 'brick') {
            return null;
        }
        return {
            brickId: result.brickId,
            buildingId: result.buildingId,
            normal: result.normal
        };
    }

    // Rich shape for World View: { type, documentId, buildingId, brickId, point } | null.
    pickRich(screenX, screenY) {
        const ndc = this._toNormalizedDeviceCoordinates(screenX, screenY);
        this._raycaster.setFromCamera(ndc, this._camera);

        const meshes = this._meshRegistry.getAllMeshes();
        const intersections = this._raycaster.intersectObjects(meshes, false);

        if (intersections.length === 0) {
            return null;
        }

        const hit = intersections[0];
        const hitMesh = hit.object;
        const brickId = this._meshRegistry.getBrickId(hitMesh.uuid);
        if (!brickId) {
            return null;
        }

        const documentId = this._meshRegistry.getDocumentId(brickId);
        const buildingId = this._meshRegistry.getBuildingId(brickId);

        let normal = { x: 0, y: 1, z: 0 };
        if (hit.face) {
            const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            const nx = Math.abs(n.x) > 0.5 ? Math.sign(n.x) : 0;
            const ny = Math.abs(n.y) > 0.5 ? Math.sign(n.y) : 0;
            const nz = Math.abs(n.z) > 0.5 ? Math.sign(n.z) : 0;
            normal = { x: nx, y: ny, z: nz };
        }

        return {
            type: 'brick',
            documentId,
            buildingId,
            brickId,
            point: new Position(hit.point.x, hit.point.y, hit.point.z),
            normal
        };
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

        return new WorldPosition(target.x, target.y, target.z);
    }

    _toNormalizedDeviceCoordinates(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
}
