import * as THREE from 'three';

// Interaction half of the interactive transform gizmo (0.1.46).
// Hit testing, pointer down/move/up, the active handle, gesture state,
// cancellation — nothing else. This class never mutates the World and
// never creates a command. It drives the gesture contract:
//
//   beginTransformGesture(selection, { mode, axis })
//   previewTransformGesture(selection, transform)   x N, no history
//   commitTransformGesture(selection, transform)    ONE command
//   cancelTransformGesture(selection)               no command
//
// implemented by SpatialEditingService today (and by any future
// TransformSelectionUseCase — the contract is the point). The lifecycle
// therefore stays exactly the 0.1.38 discipline:
//
//   pointer down -> begin gesture -> live preview x N -> pointer up
//       -> restore original state -> ONE TransformSelectionCommand
//
// Escape mid-drag cancels; a drag with no effective movement commits
// nothing (commitTransformGesture rejects transform-equal no-ops).
//
// All transform math comes from the injected transformMath module
// (application/TransformMath) — the SAME definitions the keyboard path
// and the final command use, so what you see while dragging is exactly
// what gets committed. This file owns only the raycasting that turns
// pointer positions into points on drag planes.
//
// Exclusivity (generalizing the 0.1.45 marquee rule — an active editing
// gesture temporarily owns the pointer): on drag start the controller
// disables the camera controls via controlsEnabler, so orbit/pan/zoom
// are frozen; selection is frozen because the controller keeps the
// selection object captured at pointer-down and ignores external
// changes until the gesture ends; controls are re-enabled on commit or
// cancel.
const MINIMUM_TRANSLATION = 0.001;
const MINIMUM_ROTATION_DEGREES = 0.1;
const AXIS_VECTORS = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1)
};
const DEGENERATE_EPSILON = 1e-8;

export class TransformGizmoController {
    constructor({ camera, domElement, gizmoRenderer, gestureService, controlsEnabler, transformMath }) {
        this._camera = camera;
        this._domElement = domElement;
        this._gizmoRenderer = gizmoRenderer;
        this._gestureService = gestureService;
        this._controlsEnabler = controlsEnabler;
        this._transformMath = transformMath;
        this._raycaster = new THREE.Raycaster();
        this._plane = new THREE.Plane();
        this._intersection = new THREE.Vector3();
        this._drag = null;
        this._selection = null;
        this._pivot = null;
    }

    get isDragging() {
        return this._drag !== null;
    }

    // ------------------------------------------------------- presentation

    show(pivot, bounds = null) {
        this._pivot = { x: pivot.x, y: pivot.y, z: pivot.z };
        this._gizmoRenderer.show({ pivot: this._pivot, bounds });
    }

    hide() {
        if (this._drag) {
            this.cancelGesture();
        }
        this._pivot = null;
        this._gizmoRenderer.hide();
        this._setCursor('');
    }

    // ------------------------------------------------------ pointer input
    // All three return a consumed flag/shape so sessions can decide
    // whether the rest of the input pipeline (tools, hover, camera)
    // still gets the event.

    onPointerDown(screenX, screenY, selection) {
        if (!this._gestureService || this._drag || !this._gizmoRenderer.visible) {
            return false;
        }
        if (!selection || selection.isEmpty) {
            return false;
        }
        const handleId = this._pickHandle(screenX, screenY);
        if (!handleId) {
            return false;
        }
        const mode = handleId === 'rotate' ? 'rotate' : 'translate';
        const axis = handleId === 'rotate' ? 'y' : (handleId === 'free' ? null : handleId);
        const gestureState = this._gestureService.beginTransformGesture(selection, { mode, axis });
        if (!gestureState) {
            return false;
        }
        const pivot = gestureState.pivot || this._pivot;
        this._selection = selection;
        this._drag = {
            handleId,
            mode,
            axis,
            pivot: { x: pivot.x, y: pivot.y, z: pivot.z },
            startPoint: this._projectDragPoint(screenX, screenY, handleId, pivot),
            moved: false
        };
        if (!this._drag.startPoint) {
            this._drag.startPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
        }
        this._controlsEnabler.setEnabled(false);
        this._gizmoRenderer.setActive(handleId);
        this._setCursor('grabbing');
        return true;
    }

    onPointerMove(screenX, screenY, selection) {
        if (this._drag) {
            const transform = this._calculateDragTransform(screenX, screenY);
            if (transform) {
                this._drag.moved = true;
                this._gestureService.previewTransformGesture(this._selection, transform);
                if (transform.translation) {
                    this._gizmoRenderer.setPivot({
                        x: this._drag.pivot.x + transform.translation.x,
                        y: this._drag.pivot.y + transform.translation.y,
                        z: this._drag.pivot.z + transform.translation.z
                    });
                }
            }
            return { consumed: true, hovered: false };
        }
        if (!this._gestureService || !this._gizmoRenderer.visible || !selection || selection.isEmpty) {
            return { consumed: false, hovered: false };
        }
        const handleId = this._pickHandle(screenX, screenY);
        this._gizmoRenderer.setHover(handleId);
        this._setCursor(handleId ? 'grab' : '');
        return { consumed: false, hovered: handleId !== null };
    }

    // Returns null when nothing was dragged (not consumed), otherwise
    // { consumed: true, committed } — committed is whether the gesture
    // produced a history entry (false for exact no-op drags).
    onPointerUp(screenX, screenY, selection) {
        if (!this._drag) {
            return null;
        }
        const transform = this._calculateDragTransform(screenX, screenY)
            || (this._drag.mode === 'rotate'
                ? { rotation: 0 }
                : { translation: { x: 0, y: 0, z: 0 } });
        const committed = this._gestureService.commitTransformGesture(this._selection, transform);
        this._endDrag();
        return { consumed: true, committed: committed === true };
    }

    onKeyDown(keyEvent, selection) {
        if (this._drag && keyEvent.key === 'Escape') {
            this.cancelGesture();
            return true;
        }
        return false;
    }

    cancelGesture() {
        if (!this._drag) {
            return false;
        }
        this._gestureService.cancelTransformGesture(this._selection);
        this._endDrag();
        return true;
    }

    dispose() {
        this.hide();
    }

    // ----------------------------------------------------------- internal

    _endDrag() {
        this._drag = null;
        this._selection = null;
        this._controlsEnabler.setEnabled(true);
        this._gizmoRenderer.setActive(null);
        this._setCursor('');
    }

    // Turns the current pointer position into the gesture transform for
    // the active handle. All math goes through transformMath — the same
    // module the keyboard path uses. Sub-threshold jitter collapses to
    // an exact zero delta so a click-release cannot produce a command.
    _calculateDragTransform(screenX, screenY) {
        if (!this._drag) {
            return null;
        }
        const { handleId, pivot, startPoint } = this._drag;
        const point = this._projectDragPoint(screenX, screenY, handleId, pivot);
        if (!point) {
            return null;
        }
        if (handleId === 'rotate') {
            let rotation = this._transformMath.rotationDeltaFromPoints(pivot, startPoint, point);
            if (Math.abs(rotation) < MINIMUM_ROTATION_DEGREES) {
                rotation = 0;
            }
            return { rotation };
        }
        const translation = handleId === 'free'
            ? { x: point.x - startPoint.x, y: 0, z: point.z - startPoint.z }
            : this._transformMath.projectDeltaOntoAxis(handleId, startPoint, point);
        const magnitude = Math.hypot(translation.x, translation.y, translation.z);
        if (magnitude < MINIMUM_TRANSLATION) {
            return { translation: { x: 0, y: 0, z: 0 } };
        }
        return { translation };
    }

    _pickHandle(screenX, screenY) {
        this._raycaster.setFromCamera(this._toNdc(screenX, screenY), this._camera);
        const intersections = this._raycaster.intersectObjects(this._gizmoRenderer.getHandleMeshes(), false);
        if (intersections.length === 0) {
            return null;
        }
        return intersections[0].object.userData.handleId || null;
    }

    // Intersects the pointer ray with the plane this handle drags in:
    //   axis handles  — the camera-facing plane containing that axis
    //   free handle   — the horizontal plane through the pivot
    //   rotate handle — the horizontal plane through the pivot
    // For axis handles the returned point is then projected onto the
    // axis by transformMath at the caller, which is what constrains the
    // movement to the axis.
    _projectDragPoint(screenX, screenY, handleId, pivot) {
        this._raycaster.setFromCamera(this._toNdc(screenX, screenY), this._camera);
        const pivotVector = new THREE.Vector3(pivot.x, pivot.y, pivot.z);
        if (handleId === 'rotate' || handleId === 'free') {
            this._plane.setFromNormalAndCoplanarPoint(AXIS_VECTORS.y, pivotVector);
        } else {
            const axis = AXIS_VECTORS[handleId];
            const viewDirection = this._raycaster.ray.direction;
            let normal = new THREE.Vector3().crossVectors(axis, viewDirection);
            if (normal.lengthSq() < DEGENERATE_EPSILON) {
                // Camera looking along the drag axis — any perpendicular
                // plane is as good as any other in this degenerate case.
                normal = Math.abs(axis.y) < 0.9
                    ? new THREE.Vector3().crossVectors(axis, AXIS_VECTORS.y)
                    : new THREE.Vector3().crossVectors(axis, AXIS_VECTORS.x);
            }
            normal = new THREE.Vector3().crossVectors(normal, axis).normalize();
            this._plane.setFromNormalAndCoplanarPoint(normal, pivotVector);
        }
        const hit = this._raycaster.ray.intersectPlane(this._plane, this._intersection);
        if (!hit) {
            return null;
        }
        return { x: hit.x, y: hit.y, z: hit.z };
    }

    _toNdc(screenX, screenY) {
        const rect = this._domElement.getBoundingClientRect();
        return new THREE.Vector2(
            ((screenX - rect.left) / rect.width) * 2 - 1,
            -((screenY - rect.top) / rect.height) * 2 + 1
        );
    }

    _setCursor(cursor) {
        this._domElement.style.cursor = cursor;
    }
}
