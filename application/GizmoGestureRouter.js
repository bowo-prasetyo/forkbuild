// 0.2.92 — World Instance Transform UX. Dispatches the interactive
// transform gizmo's own narrow contract — the exact 5 methods
// renderer/TransformGizmoController.js calls
// (begin/preview/commit/cancelTransformGesture + getGestureFeedback) —
// between the brick/group gesture kernel (application/
// SpatialEditingService.js, 0.1.46's own) and the structure-placement
// one (application/StructurePlacementGestureService.js, 0.2.92's).
//
// This exists because TransformGizmoController holds exactly ONE
// `gestureService` reference for its entire lifetime (it is constructed
// once per render session in application/RenderWorldUseCase.js), but the
// SAME shared gizmo visuals (renderer/TransformGizmoRenderer.js — arrows,
// free-move pad, rotation ring) now anchor to either kind of selection.
// Routing happens PER CALL, keyed off whatever selection the controller
// hands back at that moment — never decided once at gizmo-show time —
// because the controller itself is selection-agnostic and simply forwards
// whatever `application/EditorSession.js` last gave it.
//
// Deliberately NOT a merge of the two services into one, and deliberately
// NOT a widening of SpatialEditingService to also understand a
// StructurePlacement — see StructurePlacementGestureService's own header.
// Neither wrapped service is modified, and neither knows the other or
// this router exists. Pure dispatch, zero new gesture semantics.
export class GizmoGestureRouter {
    constructor(brickGestureService, placementGestureService) {
        this._brick = brickGestureService;
        this._placement = placementGestureService;
    }

    beginTransformGesture(selection, options) {
        return this._target(selection).beginTransformGesture(selection, options);
    }

    previewTransformGesture(selection, transform, gestureOptions) {
        return this._target(selection).previewTransformGesture(selection, transform, gestureOptions);
    }

    commitTransformGesture(selection, transform, gestureOptions) {
        return this._target(selection).commitTransformGesture(selection, transform, gestureOptions);
    }

    // Escape mid-drag: the controller passes back whatever selection it
    // captured at drag-start (its own `this._selection`), so this still
    // routes to the service that actually has an active gesture even if
    // the live editor selection has since changed underneath it.
    cancelTransformGesture(selection) {
        return this._target(selection).cancelTransformGesture(selection);
    }

    // Only one of the two services can be mid-gesture at a time — the
    // controller only ever drives one drag — so whichever reports active
    // owns the feedback. Falls back to the brick service (whose feedback
    // is null when idle) so a stray call before any gesture ever begins
    // still returns a well-defined null rather than throwing.
    getGestureFeedback() {
        if (this._placement.transformGizmoState.active) {
            return this._placement.getGestureFeedback();
        }
        return this._brick.getGestureFeedback();
    }

    _target(selection) {
        return (selection && selection.isStructurePlacementSelection) ? this._placement : this._brick;
    }
}
