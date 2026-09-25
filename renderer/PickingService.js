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
// Bricks are instances in renderer/BrickInstanceRegistry.js's batched
// meshes; a hit is resolved back to its brick through that registry.
//
// pickInRectangle is deliberately a CENTER test — a brick counts when
// its world position projects inside the rectangle. Full
// projected-bounds intersection is future work; center-in-rect is the
// V0.1 simplification and matches how most editors feel at brick scale.
export class PickingService {
    // placementMeshRegistry (0.2.91, optional) — a second, SEPARATE mesh
    // source (renderer/PlacementMeshRegistry.js) for pickPlacement()
    // below. Kept apart from brickInstances rather than merged into it:
    // a placed structure's bricks are deliberately never registered
    // with brickInstances at all (renderer/WorldRenderer.js's own 0.2.90
    // header), so ordinary brick picking is completely unaffected by
    // whether a caller also constructs this with a placement registry.
    constructor(camera, domElement, brickInstances, placementMeshRegistry = null) {
        this._camera = camera;
        this._domElement = domElement;
        this._brickInstances = brickInstances;
        this._placementMeshRegistry = placementMeshRegistry;
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

        const objects = this._brickInstances.pickableObjects();
        const intersections = this._raycaster.intersectObjects(objects, false);
        if (intersections.length === 0) {
            return null;
        }

        const hit = intersections[0];
        const brickId = this._brickInstances.brickIdForIntersection(hit);
        if (!brickId) {
            return null;
        }

        const documentId = this._brickInstances.getDocumentId(brickId);
        const buildingId = this._brickInstances.getBuildingId(brickId);
        const normal = hitNormal(hit);

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

    // 0.2.91 — World Instance Editing & Placement Management. Raycasts
    // against ONLY the placement mesh registry (a completely separate
    // mesh set from brickInstances, see the constructor's own note) and
    // resolves a hit back to the placementId that owns it — never a
    // brickId, matching "select the whole instance" exactly. Returns
    // null when there's no placementMeshRegistry (an older caller, a
    // test harness that never wires one in) or nothing under the
    // cursor — the same graceful-absence shape pick()/pickRich() use.
    pickPlacement(screenX, screenY) {
        if (!this._placementMeshRegistry) {
            return null;
        }
        const ndc = this._toNormalizedDeviceCoordinates(screenX, screenY);
        this._raycaster.setFromCamera(ndc, this._camera);

        const meshes = this._placementMeshRegistry.getAllMeshes();
        const intersections = this._raycaster.intersectObjects(meshes, false);
        if (intersections.length === 0) {
            return null;
        }

        const hit = intersections[0];
        const placementId = this._placementMeshRegistry.getPlacementId(hit.object.uuid);
        if (!placementId) {
            return null;
        }

        // 0.9.611 — the same face-normal extraction pickRich() does:
        // StructurePlacementTool needs a hit face's normal to snap a new
        // structure flush against this one, exactly like PlacementTool
        // already does for bricks via pickedBrick.normal.
        const normal = hitNormal(hit);

        return {
            placementId,
            point: new Position(hit.point.x, hit.point.y, hit.point.z),
            normal,
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
    // coordinates; returns one entry per brick whose world position
    // projects inside the rectangle:
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
        this._brickInstances.forEachPosition((brickId, x, y, z) => {
            projected.set(x, y, z).project(this._camera);
            if (projected.z < -1 || projected.z > 1) {
                return; // behind the camera or beyond the frustum depth
            }
            if (projected.x < ndcMinX || projected.x > ndcMaxX
                || projected.y < ndcMinY || projected.y > ndcMaxY) {
                return;
            }
            hits.push({
                brickId,
                buildingId: this._brickInstances.getBuildingId(brickId),
                documentId: this._brickInstances.getDocumentId(brickId)
            });
        });
        return hits;
    }

    _toNormalizedDeviceCoordinates(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
}

const _hitMatrix = new THREE.Matrix4();
const _instanceMatrix = new THREE.Matrix4();

// The hit face's normal in world space, snapped to the nearest axis
// ({ x: 0, y: 1, z: 0 } when the hit has no face). For an instance of an
// InstancedMesh the instance's own transform (its rotation) applies too.
function hitNormal(hit) {
    if (!hit.face) {
        return { x: 0, y: 1, z: 0 };
    }
    _hitMatrix.copy(hit.object.matrixWorld);
    if (hit.object.isInstancedMesh && Number.isInteger(hit.instanceId)) {
        hit.object.getMatrixAt(hit.instanceId, _instanceMatrix);
        _hitMatrix.multiply(_instanceMatrix);
    }
    const n = hit.face.normal.clone().transformDirection(_hitMatrix);
    return {
        x: Math.abs(n.x) > 0.5 ? Math.sign(n.x) : 0,
        y: Math.abs(n.y) > 0.5 ? Math.sign(n.y) : 0,
        z: Math.abs(n.z) > 0.5 ? Math.sign(n.z) : 0
    };
}
