import * as THREE from 'three';

// 0.2.39 — answers exactly one question: which avatar (if any) is
// under this screen position? Deliberately a SEPARATE class from
// renderer/PickingService.js, raycasting against a completely
// different object set (avatar `AvatarVisual.root` groups, never
// brick meshes) — see docs/Principles.md, "Avatars Are Never Document
// Selection": keeping the two raycasts structurally apart, at the
// renderer layer, is the first of several layers that make an avatar
// hit physically incapable of ever being mistaken for a brick hit.
//
// Only avatars CURRENTLY VISIBLE (already added to the scene) are
// ever passed in — see application/RenderWorldViewUseCase.js's
// pickAvatar(), which builds the candidate map fresh from whichever
// visuals are actually on screen right now. Raycasting against a
// hidden avatar's root would still technically work in Three.js (it
// only needs an Object3D reference, not scene membership), which is
// exactly the "what's on screen is what's clickable" expectation this
// class must never violate.
export class AvatarPickingService {
    constructor(camera, domElement) {
        this._camera = camera;
        this._domElement = domElement;
        this._raycaster = new THREE.Raycaster();
    }

    // avatarRoots: Map<avatarId, THREE.Object3D> — only visible
    // avatars. Returns { avatarId, distance } for the NEAREST hit
    // avatar, or null. `distance` is exposed so a caller comparing
    // this against a simultaneous brick pick (renderer/PickingService.js's
    // own `distance`) can resolve "avatar standing in front of a wall"
    // correctly — whichever is actually closer to the camera wins,
    // never "bricks always win" regardless of depth.
    pick(screenX, screenY, avatarRoots) {
        if (!avatarRoots || avatarRoots.size === 0) {
            return null;
        }
        const ndc = this._toNormalizedDeviceCoordinates(screenX, screenY);
        this._raycaster.setFromCamera(ndc, this._camera);

        const roots = Array.from(avatarRoots.values());
        const intersections = this._raycaster.intersectObjects(roots, true);
        if (intersections.length === 0) {
            return null;
        }

        const hitObject = intersections[0].object;
        for (const [avatarId, root] of avatarRoots) {
            if (root === hitObject || this._isDescendantOf(hitObject, root)) {
                return { avatarId, distance: intersections[0].distance };
            }
        }
        return null;
    }

    _isDescendantOf(object, ancestor) {
        let current = object.parent;
        while (current) {
            if (current === ancestor) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    _toNormalizedDeviceCoordinates(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }
}
