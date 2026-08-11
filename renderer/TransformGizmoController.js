import * as THREE from 'three';

// Interaction half of the interactive transform gizmo (0.1.46; updated
// 0.1.47). Hit testing, pointer down/move/up, the active handle, gesture
// state, and cancellation — nothing else. This class never mutates the
// World, never creates commands, and — as of 0.1.47 — never interprets
// snapping either.
//
// The 0.1.47 division of labor, stated where the code lives:
//
//   TransformGizmoController  — "the user produced approximately 13.7
//                                degrees of rotation, and Shift is held"
//   SpatialEditingService     — "that gesture, under the current
//                                TransformSettings, is a 15-degree
//                                rotation" (or 1.5-degree precision, or
//                                unsnapped — the controller neither knows
//                                nor cares)
//
// Concretely, the controller forwards raw gesture transforms AND the
// current modifier state through the gesture contract:
//
//   beginTransformGesture(selection, { mode, axis })
//   previewTransformGesture(selection, transform, { modifiers })  x N
//   commitTransformGesture(selection, transform, { modifiers })
//   cancelTransformGesture(selection)
//
// and reads the service's getGestureFeedback() after each frame, passing
// that opaque blob straight back to the caller for the transient
// overlay. Exactly one TransformSelectionCommand per completed gesture,
// no commands during preview, Escape cancels, no-movement commits
// nothing — all unchanged since 0.1.38/0.1.46, now with snapped deltas
// computed centrally in the application layer.
//
// Exclusivity is unchanged: on drag start the controller disables the
// camera controls via controlsEnabler, keeps the selection captured at
// pointer-down, and restores everything on commit or cancel.
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
    // modifiers ({ ctrl, shift, alt, meta }) travel with move/up so the
    // gesture transaction can apply precision mode per frame. The
    // controller attaches no meaning to them beyond forwarding.

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

    onPointerMove(screenX, screenY, selection, modifiers = null) {
        if (this._drag) {
            const transform = this._calculateDragTransform(screenX, screenY);
            if (transform) {
                this._drag.moved = true;
                this._gestureService.previewTransformGesture(this._selection, transform, { modifiers });
                if (transform.translation) {
                    // The gizmo follows the RAW pointer delta; the bricks
                    // follow the snapped delta. Watching the handle track
                    // the pointer while bricks step between snap positions
                    // is the standard affordance (Blender, Unity) and it
                    // keeps the pivot honest.
                    this._gizmoRenderer.setPivot({
                        x: this._drag.pivot.x + transform.translation.x,
                        y: this._drag.pivot.y + transform.translation.y,
                        z: this._drag.pivot.z + transform.translation.z
                    });
                }
            }
            return { consumed: true, hovered: false, feedback: this._readGestureFeedback() };
        }
        if (!this._gestureService || !this._gizmoRenderer.visible || !selection || selection.isEmpty) {
            return { consumed: false, hovered: false, feedback: null };
        }
        const handleId = this._pickHandle(screenX, screenY);
        this._gizmoRenderer.setHover(handleId);
        this._setCursor(handleId ? 'grab' : '');
        return { consumed: false, hovered: handleId !== null, feedback: null };
    }

    // Returns null when nothing was dragged (not consumed), otherwise
    // { consumed: true, committed, feedback: null } — feedback is null on
    // purpose: the gesture is over, and the views clear their overlay.
    onPointerUp(screenX, screenY, selection, modifiers = null) {
        if (!this._drag) {
            return null;
        }
        const transform = this._calculateDragTransform(screenX, screenY)
            || (this._drag.mode === 'rotate'
                ? { rotation: 0 }
                : { translation: { x: 0, y: 0, z: 0 } });
        const committed = this._gestureService.commitTransformGesture(this._selection, transform, { modifiers });
        this._endDrag();
        return { consumed: true, committed: committed === true, feedback: null };
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

    // Raw drag transform — deliberately UNSNAPPED. Axis constraint
    // happens here (it is geometry: which plane/line the handle drags
    // in); snapping happens in the gesture transaction (it is gesture
    // interpretation). Sub-threshold jitter collapses to an exact zero
    // delta so a click-release cannot produce a command.
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

    // Opaque pass-through: the service builds the feedback blob (snapped
    // transform, effective increments, precision flag); the controller
    // merely hands it upward without reading its contents.
    _readGestureFeedback() {
        if (this._gestureService && typeof this._gestureService.getGestureFeedback === 'function') {
            return this._gestureService.getGestureFeedback();
        }
        return null;
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
