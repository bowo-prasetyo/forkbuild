// Pure snapping math for transform gestures (0.1.47).
//
// Snapping is transform mathematics, not document state. Nothing in this
// module reads or writes World/Building/Brick/Group, and no increment it
// uses is ever serialized into the ForkBuild Protocol — snap settings are
// editor/session preferences (TransformSettings), never protocol data.
//
// Design invariants, in the order they matter:
//
// 1. Snap the GESTURE DELTA, never absolute brick positions. A brick at
//    x = 2.37 dragged by raw +0.2 with a 1-unit increment stays at 2.37 —
//    snapping is a gesture increment, not a re-alignment of the world to
//    a global grid. Snapping absolute positions would unexpectedly drag
//    the brick to 2.0 the moment a gesture starts.
//
// 2. Snap once, from the gesture origin, on every frame. Never snap an
//    already-snapped value. The gesture transaction always recomputes
//    transforms from the captured initial state (0.1.38 discipline), and
//    TransformSnap is a pure function of (raw delta, increment), so the
//    same pointer position always produces exactly the same transform:
//    no cumulative rounding error, and pointer movement is reversible
//    (start -> A -> B -> A lands exactly back on A's transform).
//
// 3. One snapped delta for the whole selection. The snapped delta is
//    applied identically to every member by TransformMath.
//    calculateTransforms, so the relative arrangement of a
//    multi-selection — or a group-resolved selection, which arrives as
//    plain items[] — is preserved exactly. There is no per-brick
//    snapping and no group-specific snapping.
//
// 4. Snapping happens AFTER axis-constraint resolution and BEFORE
//    TransformMath, identically for keyboard and gizmo, because both
//    flow through the same gesture transaction in SpatialEditingService.
//    The TransformGizmoController never snaps anything: it reports raw
//    gesture values ("approximately 13.7 degrees"), and the application
//    layer decides how that gesture is interpreted.
export const TransformSnap = Object.freeze({
    // Rounds value to the nearest multiple of increment. Invalid or
    // non-positive increments pass the value through untouched, which is
    // how "snapping disabled" works everywhere downstream.
    snapValue(value, increment) {
        if (!increment || increment <= 0 || !Number.isFinite(value)) {
            return value;
        }
        const snapped = Math.round(value / increment) * increment;
        if (snapped === 0) {
            return 0;
        }
        // Floating-point hygiene: 7 * 0.1 must read 0.7, not
        // 0.7000000000000001. These values flow into committed commands,
        // replay comparisons, and the on-screen feedback readout, so
        // they are normalized to a stable decimal representation.
        return Number(snapped.toPrecision(12));
    },

    // Snaps each component of a translation DELTA independently. The
    // caller is responsible for having resolved axis constraints first —
    // an X-handle drag arrives here as { x: d, y: 0, z: 0 }, so snapping
    // the zero components is a no-op by construction.
    snapTranslation(translation, increment) {
        if (!translation) {
            return translation;
        }
        return {
            x: TransformSnap.snapValue(translation.x || 0, increment),
            y: TransformSnap.snapValue(translation.y || 0, increment),
            z: TransformSnap.snapValue(translation.z || 0, increment)
        };
    },

    // Snaps a GESTURE ROTATION (a delta in degrees measured from the
    // gesture's start angle), never a brick's absolute orientation.
    snapRotation(degrees, increment) {
        return TransformSnap.snapValue(degrees, increment);
    },

    // Precision mode scales the increment DOWN by the precision
    // multiplier — never up, and never to zero. A multiplier outside
    // (0, 1) is treated as "no precision effect" rather than guessed at.
    effectiveIncrement(increment, precise, precisionMultiplier) {
        if (!increment || increment <= 0) {
            return increment;
        }
        if (!precise || !precisionMultiplier || precisionMultiplier <= 0 || precisionMultiplier >= 1) {
            return increment;
        }
        return Number((increment * precisionMultiplier).toPrecision(12));
    }
});
