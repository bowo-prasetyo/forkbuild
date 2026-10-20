// Finite-number checks for untrusted positions (peer descriptors, stored
// state) before any distance or placement math uses them.

export function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

export function isFiniteXZPosition(position) {
    return position !== null
        && typeof position === 'object'
        && isFiniteCoordinate(position.x)
        && isFiniteCoordinate(position.z);
}
