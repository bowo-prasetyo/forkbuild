import * as THREE from 'three';
import { Position } from '../core/Position.js';
import { WorldPosition } from '../core/WorldPosition.js';

// Answers three questions, all from screen coordinates: what brick (if
// any) is under this position (pick), where would a ray hit the ground
// plane (pickGroundPosition), and which bricks' centers project inside a
// screen rectangle (pickInRectangle, added 0.1.45 for marquee
// selection)? Nothing about selection, preview state, or UI — those are
// separate concerns built on top of this. Picking does not depend on
// Selection or Preview; they depend on it.
//
// pickInRectangle is deliberately a CENTER test — a brick counts when
// its mesh's world position projects inside the rectangle. Full
// projected-bounds intersection is future work; center-in-rect is the
// V0.1 simplification and matches how most editors feel at brick scale.
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
            normal,
            // 0.2.39 — the raycaster's own hit distance, exposed so a
            // caller comparing this against a simultaneous avatar pick
            // (renderer/AvatarPickingService.js) can resolve which is
            // actually NEARER the camera, rather than always
            // preferring one category over the other regardless of
            // depth. Every existing caller of pick()/pickRich() reads
            // named fields and simply ignores this one.
            distance: hit.distance
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

    // Marquee containment (0.1.45). Screen rectangle in CLIENT
    // coordinates; returns one entry per registered mesh whose world
    // position projects inside the rectangle:
    //   [{ brickId, buildingId, documentId }]
    // documentId is null for meshes loaded through the event-driven
    // (single-world Editor) path — callers in that surface ignore it.
    pickInRectangle(screenX0, screenY0, screenX1, screenY1) {
        const rect = this._domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return [];
        }
        const toNdcX = (clientX) => ((clientX - rect.left) / rect.width) * 2 - 1;
        const toNdcY = (clientY) => -(((clientY - rect.top) / rect.height) * 2 - 1);

        const ndcMinX = Math.min(toNdcX(screenX0), toNdcX(screenX1));
        const ndcMaxX = Math.max(toNdcX(screenX0), toNdcX(screenX1));
        const ndcMinY = Math.min(toNdcY(screenY0), toNdcY(screenY1));
        const ndcMaxY = Math.max(toNdcY(screenY0), toNdcY(screenY1));

        const hits = [];
        const projected = new THREE.Vector3();
        for (const mesh of this._meshRegistry.getAllMeshes()) {
            projected.setFromMatrixPosition(mesh.matrixWorld).project(this._camera);
            if (projected.z < -1 || projected.z > 1) {
                continue; // behind the camera or beyond the frustum depth
            }
            if (projected.x < ndcMinX || projected.x > ndcMaxX
                || projected.y < ndcMinY || projected.y > ndcMaxY) {
                continue;
            }
            const brickId = this._meshRegistry.getBrickId(mesh.uuid);
            if (!brickId) {
                continue;
            }
            hits.push({
                brickId,
                buildingId: this._meshRegistry.getBuildingId(brickId),
                documentId: this._meshRegistry.getDocumentId(brickId)
            });
        }
        return hits;
    }

    _toNormalizedDeviceCoordinates(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
}
