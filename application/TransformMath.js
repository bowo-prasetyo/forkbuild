// Pure transformation math shared by every transform path (0.1.44):
// keyboard nudges, pivot rotations, and gizmo gestures all use these
// formulas, so every path agrees on what a transform means. Stateless
// throughout; positions are plain {x,y,z} data — the shape used by
// TransformSelectionCommand and TransformGizmoState.
//
// Rotation is about the pivot on the Y axis, in degrees, matching the
// domain convention: degrees everywhere, radians only at the Three.js
// boundary. Order is rotation-then-translation, the same order the 0.1.38
// gizmo always used.

export function transformPoint(point, pivot, { translation = null, rotation = undefined } = {}) {
    let x = point.x;
    let y = point.y;
    let z = point.z;
    if (rotation !== undefined && rotation !== 0) {
        const radians = (rotation * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const dx = x - pivot.x;
        const dz = z - pivot.z;
        x = pivot.x + cos * dx - sin * dz;
        z = pivot.z + sin * dx + cos * dz;
    }
    if (translation) {
        x += translation.x || 0;
        y += translation.y || 0;
        z += translation.z || 0;
    }
    return { x, y, z };
}

export function applyTransformToRotation(currentRotation, { rotation = undefined } = {}) {
    return currentRotation + (rotation || 0);
}

// Maps a list of captured transforms ({ buildingId, brickId, position,
// rotation }) through a gesture, preserving order.
export function calculateTransforms(initialTransforms, pivot, transform) {
    return initialTransforms.map((t) => ({
        buildingId: t.buildingId,
        brickId: t.brickId,
        position: transformPoint(t.position, pivot, transform),
        rotation: applyTransformToRotation(t.rotation, transform)
    }));
}

export function transformsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
