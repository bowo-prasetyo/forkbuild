// Runtime-only transform gizmo state. This is deliberately separate from
// SpatialSelectionState and is never serialized into documents or command
// history. It describes the current UI gesture plus the derived selection
// geometry the gizmo is anchored to.
export class TransformGizmoState {
    constructor({
        mode = null,
        axis = null,
        active = false,
        pivot = null,
        selectionBounds = null,
        initialTransforms = []
    } = {}) {
        this._mode = mode;
        this._axis = axis;
        this._active = active;
        this._pivot = pivot ? { ...pivot } : null;
        this._selectionBounds = selectionBounds ? TransformGizmoState._cloneBounds(selectionBounds) : null;
        this._initialTransforms = initialTransforms.map((transform) => ({
            ...transform,
            position: transform.position ? { ...transform.position } : null
        }));
    }

    get mode() { return this._mode; }
    get axis() { return this._axis; }
    get active() { return this._active; }
    get pivot() { return this._pivot ? { ...this._pivot } : null; }
    get selectionBounds() { return this._selectionBounds ? TransformGizmoState._cloneBounds(this._selectionBounds) : null; }
    get initialTransforms() {
        return this._initialTransforms.map((transform) => ({
            ...transform,
            position: transform.position ? { ...transform.position } : null
        }));
    }

    static idle({ selectionBounds = null, pivot = null } = {}) {
        return new TransformGizmoState({ selectionBounds, pivot });
    }

    static active({ mode, axis = null, pivot, selectionBounds, initialTransforms }) {
        return new TransformGizmoState({ mode, axis, active: true, pivot, selectionBounds, initialTransforms });
    }

    static _cloneBounds(bounds) {
        return {
            min: { ...bounds.min },
            max: { ...bounds.max },
            center: { ...bounds.center },
            size: { ...bounds.size }
        };
    }
}
