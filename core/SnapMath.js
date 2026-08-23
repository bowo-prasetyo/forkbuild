// Pure grid-snapping math (0.4.9) — deterministic rounding of an
// ABSOLUTE world coordinate to the nearest multiple of a grid size.
//
// Distinct from application/TransformSnap.js, which snaps a GESTURE
// DELTA against a live drag/keyboard origin (that module's own header).
// This module snaps a real position — the primitive
// "land this selection on the construction grid" needs
// (SpatialEditingService#snapSelectionToGrid) and the one
// RepeatSelectionUseCase's own offsets are measured against. Lives in
// core/ rather than application/ because it has zero dependency on
// World/Document/CommandHistory/renderer — the same reason
// core/PlacementValidator.js and core/SelectionTransformValidator.js
// live here. Deliberately does not import TransformSnap despite sharing
// the identical rounding formula: core/ never depends on application/.
//
// gridSize <= 0, falsy, or a non-finite value means "don't snap" —
// value passes through unchanged, the same escape hatch
// TransformSnap.snapValue() already uses for "snapping disabled."
export const SnapMath = Object.freeze({
    snap(value, gridSize) {
        if (!gridSize || gridSize <= 0 || !Number.isFinite(value)) {
            return value;
        }
        const snapped = Math.round(value / gridSize) * gridSize;
        // Avoid a signed zero (-0) leaking into position math downstream.
        return snapped === 0 ? 0 : Number(snapped.toPrecision(12));
    },

    // Ground-plane snap: bricks stack vertically on Y, but the
    // construction GRID this milestone means is the horizontal X/Z
    // lattice a floor plan sits on — the same plane every example in
    // the design conversation (12.03 -> 12, etc.) measures. Y is
    // deliberately untouched here; a caller that also wants Y snapped
    // calls snap() directly for that axis.
    snapPosition(x, z, gridSize) {
        return {
            x: SnapMath.snap(x, gridSize),
            z: SnapMath.snap(z, gridSize)
        };
    }
});
