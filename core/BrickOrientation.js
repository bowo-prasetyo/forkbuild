// How a brick is oriented: its `rotation`, a turn in degrees about the
// vertical axis (any angle, as it always was), and its `tilt`, a quarter
// turn about its own width axis (local X) that lays it on another side:
// 0 (upright), 90 (its top toward its front, +Z), 180 (upside down) or 270
// (its top toward its back). The tilt is applied first, then the turn, so
// the brick's orientation is Ry(rotation) · Rx(tilt), which Three.js writes
// as an Euler of order 'YXZ'. Every turn and tilt of a brick lying on a
// grid stays on the grid.
//
// A brick tilted by 90 or 270 swaps its height and depth: everything that
// sizes a brick (bounds, collision, stacking, link previews) asks
// orientedSize() instead of reading the definition's height and depth.

export const BRICK_TILTS = Object.freeze([0, 90, 180, 270]);

// The tilt a value stands for: a whole number of quarter turns, 0 to 270.
// Anything else (missing, NaN, 45) is no tilt at all.
export function normalizeTilt(tilt) {
    if (!Number.isFinite(tilt) || tilt % 90 !== 0) return 0;
    return ((tilt % 360) + 360) % 360;
}

export function isValidTilt(tilt) {
    return BRICK_TILTS.includes(tilt);
}

// The tilt after tilting `tilt` one more quarter turn (`direction` -1 the
// other way).
export function nextTilt(tilt, direction = 1) {
    return normalizeTilt(normalizeTilt(tilt) + (direction < 0 ? -90 : 90));
}

// Whether a tilt lays the brick on its front or back, swapping its height
// and depth.
export function tiltSwapsHeight(tilt) {
    return normalizeTilt(tilt) % 180 === 90;
}

// The brick's box before its turn about the vertical: the definition's
// width, height and depth, with height and depth swapped when tilted onto
// its front or back. `definition` may be null (an unknown brick: a unit box).
export function orientedSize(definition, tilt = 0) {
    const width = definition ? definition.width : 1;
    const height = definition ? definition.height : 1;
    const depth = definition ? definition.depth : 1;
    return tiltSwapsHeight(tilt) ? { width, height: depth, depth: height } : { width, height, depth };
}

// The Euler angles, in radians, a renderer sets for a brick: x the tilt, y
// the turn, in order 'YXZ'.
export function brickEuler(rotationDegrees = 0, tilt = 0) {
    return {
        x: normalizeTilt(tilt) * (Math.PI / 180),
        y: (Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * (Math.PI / 180),
        z: 0,
        order: 'YXZ'
    };
}
