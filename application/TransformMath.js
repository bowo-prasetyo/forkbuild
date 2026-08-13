// Shared transform math for every transform gesture — keyboard nudges,
// spatial editing, and (as of 0.1.46) the interactive viewport gizmo.
// One source of truth, deliberately: the gizmo's live drag preview and
// the TransformSelectionCommand that finally commits are BOTH computed
// through these functions, so what you see while dragging is exactly
// what gets committed. A "the gizmo looked slightly different from
// keyboard rotation" class of bug cannot exist by construction.
//
// Lives in application/, and renderer/TransformGizmoController receives
// this module by injection through RenderWorldUseCase /
// RenderWorldViewUseCase — the renderer keeps its renderer -> core
// dependency discipline, and no second copy of the math exists anywhere.
//
// Convention note: calculateTransforms/rotatePointAroundPivotY use the
// same rotation formula SpatialEditingService has used since 0.1.38
// (x' = cos*dx - sin*dz, z' = sin*dx + cos*dz). angleAroundY measures
// atan2(dz, dx), so a positive rotation advances a point's measured
// angle by exactly +degrees — which is precisely what makes the gizmo's
// pointer-angle deltas follow the pointer.
export const TransformMath = Object.freeze({
    translatePoint(point, delta) {
        return {
            x: point.x + (delta ? delta.x || 0 : 0),
            y: point.y + (delta ? delta.y || 0 : 0),
            z: point.z + (delta ? delta.z || 0 : 0)
        };
    },

    rotatePointAroundPivotY(point, pivot, degrees) {
        const radians = (degrees * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const dx = point.x - pivot.x;
        const dz = point.z - pivot.z;
        return {
            x: pivot.x + (cos * dx) - (sin * dz),
            y: point.y,
            z: pivot.z + (sin * dx) + (cos * dz)
        };
    },

    // Measured angle of a point around pivot in the XZ plane, in degrees.
    angleAroundY(point, pivot) {
        return (Math.atan2(point.z - pivot.z, point.x - pivot.x) * 180) / Math.PI;
    },

    // Wraps any angle delta to (-180, 180] so a drag never commands a
    // 350-degree rotation when the pointer crossed the atan2 seam.
    normalizeDegrees(delta) {
        return ((delta % 360) + 540) % 360 - 180;
    },

    // The rotation the gizmo should apply given a drag from startPoint
    // to currentPoint around pivot. Because calculateTransforms advances
    // every point's measured angle by exactly +rotation, feeding this
    // result back into calculateTransforms puts the grabbed point where
    // the pointer is. That is the whole pointer-following guarantee.
    rotationDeltaFromPoints(pivot, startPoint, currentPoint) {
        return TransformMath.normalizeDegrees(
            TransformMath.angleAroundY(currentPoint, pivot)
            - TransformMath.angleAroundY(startPoint, pivot)
        );
    },

    // Constrains the drag from fromPoint to toPoint onto one axis —
    // the translation an axis handle produces. The other two components
    // are exactly zero, which the test suite asserts directly.
    projectDeltaOntoAxis(axis, fromPoint, toPoint) {
        const component = (toPoint[axis] || 0) - (fromPoint[axis] || 0);
        return {
            x: axis === 'x' ? component : 0,
            y: axis === 'y' ? component : 0,
            z: axis === 'z' ? component : 0
        };
    },

    // The single definition of "apply this gesture to these transforms".
    // SpatialEditingService preview/commit and the gizmo drag preview all
    // resolve to this function. gesture: { translation, rotation }.
    calculateTransforms(initialTransforms, pivot, { translation = null, rotation = undefined } = {}) {
        const radians = ((rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        return initialTransforms.map((transform) => {
            let x = transform.position.x;
            let y = transform.position.y;
            let z = transform.position.z;
            if (rotation !== undefined) {
                const dx = x - pivot.x;
                const dz = z - pivot.z;
                x = pivot.x + (cos * dx) - (sin * dz);
                z = pivot.z + (sin * dx) + (cos * dz);
            }
            if (translation) {
                x += translation.x || 0;
                y += translation.y || 0;
                z += translation.z || 0;
            }
            return { ...transform, position: { x, y, z }, rotation: transform.rotation + (rotation || 0) };
        });
    },

    transformPoint(initialTransforms, pivot, { translation = null, rotation = undefined } = {}) {
        return calculateTransforms(initialTransforms, pivot, { translation, rotation });
    }
    
    transformsEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
});
