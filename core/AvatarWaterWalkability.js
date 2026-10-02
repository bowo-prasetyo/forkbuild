
// 0.9.634 — pure, Three.js-free shallow-water walking geometry. Direct
// structural twin of core/TerrainWalkability.js: that file answers "is
// this slope still walkable," this file answers "is this water depth
// still walkable, and if so, how much should it slow the avatar down."
// Same split as everywhere else in this codebase — this file knows only
// plain numbers (a depth, a limit), never a seed, a coordinate, or what
// SURFACE_CATEGORY.WATER even is; application/avatar/AvatarWaterConstraint.js
// is the one place that supplies real world data to it, exactly the way
// application/avatar/AvatarTerrainConstraint.js supplies real terrain heights
// to core/TerrainWalkability.js.
//
// tests/AvatarShallowWaterTraversalBoundaryAudit.test.js (0.9.633)
// established two things this file deliberately keeps separate from
// each other:
//
//   1. There is no existing avatar body-segment geometry beyond
//      core/AvatarCollision.js's own AVATAR_COLLISION_HEIGHT (no NECK/
//      TORSO/WAIST/CHEST constant anywhere) — so "how deep can an
//      avatar wade before it should be considered swimming" cannot be
//      DERIVED, only decided. DEFAULT_MAX_WALKING_DEPTH below is neck
//      depth, AVATAR_NECK_HEIGHT, set against AVATAR_COLLISION_HEIGHT
//      (the one whole-body extent this codebase already treats as
//      authoritative) so an avatar stops wading while its head is still
//      above water rather than once it is fully submerged. It follows
//      the proportions of a typical standing figure, not a measurement
//      of the rendered model. It is an ordinary, overridable default,
//      not a hardcoded architectural constant — every consumer below
//      accepts it as a parameter.
//
//   2. The depth-to-speed CURVE itself (linear vs. any other shape) is
//      a separate, genuinely open product decision. waterDepthSpeedFactor()
//      below ships a linear curve as the initial, tunable default — the
//      simplest curve that satisfies the one invariant that actually
//      matters (monotonic, bounded [0, 1], degrades gracefully) — never
//      architecture. Retuning the curve later never requires touching
//      any of this milestone's other files: every caller already treats
//      the RESULT as an opaque [0, 1] multiplier, never the formula that
//      produced it.
//
// See docs/Principles.md, "Terrain Walkability Is A Movement Constraint,
// Never A Physics Slope (0.2.77)" — the identical restraint applies here:
// no swimming, no buoyancy, no water physics. A "too deep" depth simply
// blocks the step outright; this file has no opinion about what happens
// next.

// Where the neck sits on the avatar, in world units above its feet:
// about 83% of AVATAR_COLLISION_HEIGHT (1.8), the proportion of an
// adult's neck to their standing height, leaving the top 0.3 units,
// the head, clear of the water. Exactly 1.5 so a depth computed as
// `surface - (surface - 1.5)` lands on the limit without floating-point
// drift. See this file's own header, point 1.
export const AVATAR_NECK_HEIGHT = 1.5;

// The deepest water an avatar wades into: up to its neck, so it can
// still breathe.
export const DEFAULT_MAX_WALKING_DEPTH = AVATAR_NECK_HEIGHT;

// Whether a water depth stays within `maxWalkingDepth` — `<=` at the
// boundary, the same inclusive convention
// core/TerrainWalkability.js#isWalkableSlope() already uses: a depth
// landing EXACTLY on the limit is still walkable.
export function isWalkableWaterDepth(depth, maxWalkingDepth = DEFAULT_MAX_WALKING_DEPTH) {
    return depth <= maxWalkingDepth;
}

// A plain [0, 1] multiplier — never a specific product-approved curve,
// see this file's own header, point 2. Linear: full speed at zero
// depth, decaying to zero exactly at `maxWalkingDepth` (the same depth
// isWalkableWaterDepth() above would already reject stepping INTO), so
// the two functions agree at their shared boundary rather than
// contradicting one another. Degrades gracefully for any invalid or
// out-of-range input (negative depth, a depth beyond maxWalkingDepth, a
// non-finite maxWalkingDepth, NaN/Infinity) — always finite, always in
// [0, 1], never thrown.
export function waterDepthSpeedFactor(depth, maxWalkingDepth = DEFAULT_MAX_WALKING_DEPTH) {
    if (!Number.isFinite(depth) || !Number.isFinite(maxWalkingDepth) || maxWalkingDepth <= 0) return 1;
    const factor = 1 - depth / maxWalkingDepth;
    return Math.min(1, Math.max(0, factor));
}
