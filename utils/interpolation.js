// Pure interpolation helpers shared by terrain, wildlife and camera code.

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// 3t^2 - 2t^3 for t in [0, 1] (callers clamp t). Its slope is zero at both
// ends, so neighboring noise lattice cells blend without a visible crease.
export function smoothstep(t) {
    return t * t * (3 - 2 * t);
}
