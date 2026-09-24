// 0.2.94 — World View Location & Navigation.
//
// A pure, stateless interpolation: given a starting and ending camera
// framing ({ position: {x,y,z}, target: {x,y,z} }) and a duration, what
// framing should the camera show at some elapsed time? No Three.js, no
// wall-clock reads, no session state — this is the SAME "pure function
// of its inputs" posture core/TerrainHeightField.js established for
// terrain: `stateAt(0)` always equals `from`, `stateAt(durationMs)` (or
// later) always equals `to`, and the same (from, to, durationMs,
// elapsed) always produces the same intermediate framing, on any
// replica, forever. WorldNavigationSession owns the ONLY clock (Date.now(),
// read once per animation frame) and the ONLY renderer write; this
// class never touches either.
//
// This is what makes "smooth" mean something more specific than
// "eventually gets there": the camera passes through a continuous path
// of intermediate positions between `from` and `to` rather than jumping
// in a single frame — see docs/Principles.md, "A Camera Focus Never
// Jumps; It Interpolates Through A Deterministic Path (0.2.94)." It is
// NOT collision-aware (the path is a straight-line/eased lerp, not a
// navmesh route around terrain or buildings) — true camera collision
// avoidance is exactly the kind of physics-shaped complexity the design
// conversation named and deliberately postponed; this class only
// guarantees the camera never TELEPORTS, not that its path never
// clips geometry.
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpPoint(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

// A gentle ease-in-ease-out curve — the camera starts and finishes each
// focus gradually rather than at a constant, mechanical speed. Purely
// cosmetic; the animator's determinism guarantee holds for any easing
// function, this one included.
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraFocusAnimator {
    constructor({ from, to, durationMs }) {
        this._from = { position: { ...from.position }, target: { ...from.target } };
        this._to = { position: { ...to.position }, target: { ...to.target } };
        this._durationMs = Math.max(0, durationMs || 0);
    }

    get durationMs() { return this._durationMs; }
    get from() { return this._from; }
    get to() { return this._to; }

    // `elapsedMs` may be any number, including negative or past
    // `durationMs` — clamped to [0, durationMs] before use, so a caller
    // never has to guard the call itself. `complete` is true once the
    // clamped fraction reaches 1, telling WorldNavigationSession's frame
    // tick when it can stop calling stateAt() and drop the animation.
    stateAt(elapsedMs) {
        const t = this._durationMs === 0
            ? 1
            : Math.min(1, Math.max(0, elapsedMs / this._durationMs));
        const eased = easeInOutCubic(t);
        return {
            position: lerpPoint(this._from.position, this._to.position, eased),
            target: lerpPoint(this._from.target, this._to.target, eased),
            complete: t >= 1
        };
    }
}
