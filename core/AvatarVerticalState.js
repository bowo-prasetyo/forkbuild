// 0.3.4 — Vertical World Navigation.
//
// A small, closed vocabulary for the avatar's own vertical motion —
// SUPPORTED / RISING / FALLING — mirroring exactly the restraint
// core/AvatarAnimationState.js and core/WorldSpatialActivity.js already
// apply to their own vocabularies: a NAME for a state, never a second
// place that state is computed or stored.
//
// Deliberately NOT a new physics concept. core/AvatarMovementSimulation.js
// has tracked `grounded` (boolean) and `verticalVelocity` (a signed
// number) since 0.2.36's own jump/gravity kinematics — this file adds no
// third piece of mutable bookkeeping anywhere. `deriveAvatarVerticalState()`
// below is a pure, stateless read of exactly those two existing values,
// the same "derive, never duplicate" discipline core/WorldSpatialActivity.js#
// deriveWorldSpatialActivity() already established for a different
// question. See docs/Principles.md, "Avatar Vertical State Is Derived,
// Never A Second Physics Bookkeeping (0.3.4)."
//
//   SUPPORTED — `grounded` is true: standing on a WalkableSurface
//               (flat ground, real terrain, or a brick's own top/tread/
//               ramp), Y snapped to it every tick, exactly like every
//               milestone through 0.3.3 already behaved.
//   RISING    — airborne (`grounded` false) with a positive
//               `verticalVelocity` — the ascending half of a jump.
//   FALLING   — airborne with a zero-or-negative `verticalVelocity` —
//               gravity is winning, whether that's the descending half
//               of a jump's own arc or the result of walking off an
//               edge with no supporting surface below (see
//               application/AvatarStepConstraint.js's own 0.3.4 header).
//
// Never part of AvatarPresence, never signed, never broadcast — see
// core/AvatarMovementSimulation.js's own header ("AvatarPresence Is The
// Result Of Simulation, Not The Simulation Itself") and this milestone's
// own principle, "Local Physics Is Local; Spatial Presence Is
// Observation (0.3.4)." A remote replica never learns Bob's
// verticalVelocity or which of these three states he is in — only his
// position, once it changes, through the ordinary presence protocol.
export const AvatarVerticalState = Object.freeze({
    SUPPORTED: 'supported',
    RISING: 'rising',
    FALLING: 'falling'
});

export function isValidAvatarVerticalState(value) {
    return Object.values(AvatarVerticalState).includes(value);
}

// `grounded`/`verticalVelocity` — exactly the two fields
// core/AvatarMovementSimulation.js's own result (and
// application/AvatarMovementController.js's own between-tick
// bookkeeping) already carries. A non-finite `verticalVelocity` is
// treated as `0` — a stationary vertical speed, never a thrown error or
// a propagated NaN — matching the "degrade gracefully" posture every
// other pure function in this codebase already follows.
export function deriveAvatarVerticalState({ grounded = true, verticalVelocity = 0 } = {}) {
    if (grounded) return AvatarVerticalState.SUPPORTED;
    const v = Number.isFinite(verticalVelocity) ? verticalVelocity : 0;
    return v > 0 ? AvatarVerticalState.RISING : AvatarVerticalState.FALLING;
}
