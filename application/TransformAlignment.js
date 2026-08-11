// Pure alignment and distribution math (0.1.48).
//
// Alignment and distribution are transform-GENERATION algorithms, not
// new domain operations and not new command types. This module is the
// entire geometry of 0.1.48: it turns captured transforms plus the
// selection bounds into exact ABSOLUTE target transforms, which the
// editing service then submits through the existing
// TransformSelectionCommand — the same command every keyboard nudge and
// gizmo drag produces. Undo, redo, replay, and serialization therefore
// require no architectural changes whatsoever.
//
// Shapes in and out (plain data, nothing else):
//   entry:           { buildingId, brickId,
//                      position: { x, y, z }, rotation,
//                      bounds: { min, center, max } }
//   selectionBounds: { min, center, max } of the WHOLE selection —
//                    the alignment reference. Never the first brick, so
//                    selection order is irrelevant.
//   output:          absolute transforms
//                    [{ buildingId, brickId, position, rotation }],
//                    or null for degenerate inputs.
//
// No World, no Group, no Brick, no renderer, no CommandHistory, no UI
// in here — which is exactly what makes it trivially testable, and what
// guarantees groups stay invisible: a selected group arrives as plain
// resolved entries before this module ever runs.
//
// Snapping: alignment/distribution targets are EXACT. 0.1.47 snapping
// governs user-authored gesture deltas; these algorithms produce
// geometric relationships and must never be re-snapped — snapping a
// computed target can destroy the very relationship being established.
// The service therefore bypasses the gesture transaction's snap step
// entirely when executing these operations.
//
// All axes are WORLD axes (x, y, z), never camera directions: "left"
// is world-X minimum regardless of where the camera happens to orbit.
const AXES = ['x', 'y', 'z'];

const ALIGNMENT_MODES = Object.freeze({
    X_MIN: 'x-min',
    X_CENTER: 'x-center',
    X_MAX: 'x-max',
    Y_MIN: 'y-min',
    Y_CENTER: 'y-center',
    Y_MAX: 'y-max',
    Z_MIN: 'z-min',
    Z_CENTER: 'z-center',
    Z_MAX: 'z-max'
});

// Parses 'x-min' | 'x-center' | 'x-max' (and y/z equivalents) into
// { axis, edge }. Returns null for anything unrecognized — callers treat
// that as a no-op rather than an exception, matching the defensive
// no-op discipline everywhere else in the transform stack.
function parseAlignmentMode(mode) {
    if (typeof mode !== 'string') {
        return null;
    }
    const separator = mode.indexOf('-');
    if (separator === -1) {
        return null;
    }
    const axis = mode.slice(0, separator);
    const edge = mode.slice(separator + 1);
    if (!AXES.includes(axis)) {
        return null;
    }
    if (edge !== 'min' && edge !== 'center' && edge !== 'max') {
        return null;
    }
    return { axis, edge };
}

// Deterministic ordering for distribution: axis coordinate first, then
// buildingId, then brickId — replay-safe even when two bricks occupy
// the same coordinate. Never selection.items order.
function distributionComparator(axis) {
    return (a, b) => {
        const delta = a.bounds.center[axis] - b.bounds.center[axis];
        if (delta !== 0) {
            return delta;
        }
        if (a.buildingId !== b.buildingId) {
            return a.buildingId < b.buildingId ? -1 : 1;
        }
        if (a.brickId !== b.brickId) {
            return a.brickId < b.brickId ? -1 : 1;
        }
        return 0;
    };
}

function cloneTransform(entry, position) {
    return {
        buildingId: entry.buildingId,
        brickId: entry.brickId,
        position: { x: position.x, y: position.y, z: position.z },
        rotation: entry.rotation
    };
}

export const TransformAlignment = Object.freeze({
    ALIGNMENT_MODES,

    // Nine operations, one formula. For each entry, move it along the
    // requested axis so its requested edge/center lands on the selection
    // bounds' corresponding edge/center:
    //
    //   x-min    left edges      x-center   centers   x-max   right edges
    //   y-min    bottom edges    y-center   centers   y-max   top edges
    //   z-min    front edges     z-center   centers   z-max   back edges
    //
    // Only the requested axis changes. Rotation and the other two axes
    // are carried through untouched. Returns null for an unknown mode or
    // empty input; an already-aligned selection returns transforms equal
    // to the input, which the service's no-op check turns into zero
    // history entries.
    calculateAlignmentTransforms(entries, selectionBounds, mode) {
        const parsed = parseAlignmentMode(mode);
        if (!parsed || !entries || entries.length === 0 || !selectionBounds) {
            return null;
        }
        const { axis, edge } = parsed;
        const target = selectionBounds[edge][axis];
        return entries.map((entry) => {
            const delta = target - entry.bounds[edge][axis];
            const position = {
                x: entry.position.x,
                y: entry.position.y,
                z: entry.position.z
            };
            position[axis] += delta;
            return cloneTransform(entry, position);
        });
    },

    // Distribute centers evenly along one world axis. Definition:
    //
    //   sorted by center[axis] (deterministic tie-break)
    //   first / last centers pin the span — endpoints NEVER move
    //   step = (last - first) / (n - 1)
    //   target[i] = first + step * i      (interior members only)
    //
    // Returns null (no-op) for fewer than three entries, a zero span
    // (all centers identical), or an unknown axis. Only the requested
    // axis changes; rotation and the other axes are untouched.
    calculateDistributionTransforms(entries, axis) {
        if (!AXES.includes(axis) || !entries || entries.length < 3) {
            return null;
        }
        const sorted = [...entries].sort(distributionComparator(axis));
        const first = sorted[0].bounds.center[axis];
        const last = sorted[sorted.length - 1].bounds.center[axis];
        const span = last - first;
        if (span === 0) {
            return null;
        }
        const step = span / (sorted.length - 1);
        const targetsByBrick = new Map();
        for (let i = 0; i < sorted.length; i++) {
            let target;
            if (i === 0) {
                target = first;
            } else if (i === sorted.length - 1) {
                target = last;
            } else {
                target = first + step * i;
            }
            targetsByBrick.set(`${sorted[i].buildingId}/${sorted[i].brickId}`, target);
        }
        return entries.map((entry) => {
            const target = targetsByBrick.get(`${entry.buildingId}/${entry.brickId}`);
            const delta = target - entry.bounds.center[axis];
            const position = {
                x: entry.position.x,
                y: entry.position.y,
                z: entry.position.z
            };
            position[axis] += delta;
            return cloneTransform(entry, position);
        });
    }
});
