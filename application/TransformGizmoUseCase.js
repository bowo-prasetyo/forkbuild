// Presentation decision for the interactive transform gizmo (0.1.46):
// given a selection, should a gizmo be visible at all, and if so where?
// Pure data in, pure data out — no Three.js, no document mutation, and
// no opinion about how the gizmo looks or how it is dragged. Both
// EditorSession and WorldNavigationSession call resolvePresentation()
// and hand the result to their render session's gizmo surface, so the
// "where does the gizmo go" rule exists exactly once.
//
// Critical 0.1.46 invariant, worth restating where the code lives:
// this use case only ever sees a RESOLVED selection — items[], bounds,
// pivot. It never receives a Group, a Group.id, or group membership.
// A group selection arrives here already flattened to its member bricks,
// so the gizmo cannot behave differently for manually-selected bricks
// and group-selected ones. The gizmo has no idea a Group concept exists.
export class TransformGizmoUseCase {
    constructor(gestureService) {
        this._gestureService = gestureService;
    }

    // Returns { bounds, pivot } or null. pivot is the selection bounds
    // center — for a single brick that is the brick's own center, for a
    // multi-selection the center of the union bounds. The 0.1.44 pivot
    // semantics, made visible; no special "group pivot" concept needed.
    resolvePresentation(selection) {
        if (!selection || selection.isEmpty) {
            return null;
        }
        if (selection.type === 'ground') {
            return null;
        }
        const bounds = this._gestureService.getSelectionBounds(selection);
        if (!bounds) {
            return null;
        }
        return {
            bounds,
            pivot: { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z }
        };
    }
}
