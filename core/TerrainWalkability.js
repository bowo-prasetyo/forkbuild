// 0.2.77 — pure, Three.js-free terrain-slope geometry. See
// core/AvatarCollision.js's own header for why none of this lives in
// application/: the exact same "core deals with geometry/math,
// application supplies the data" split 0.2.42 established for
// avatar/brick collision applies here, one level removed — this file
// has no idea what a world seed, a coordinate, or a TerrainHeightField
// even is. It knows only two numbers (a height at the start of a step
// and a height at its end) and a horizontal distance, which is exactly
// what lets tests prove the exact walkable/unwalkable boundary with
// synthetic heights, without needing to go hunting through real
// generated terrain for a spot steep enough to exercise it.
//
// Deliberately NOT physically simulated — see docs/Principles.md,
// "Terrain Walkability Is A Movement Constraint, Never A Physics
// Slope (0.2.77)." There is no sliding, no downhill acceleration, no
// force. A step whose slope exceeds the limit is simply not taken;
// this file has no opinion about what happens next, only about
// whether one candidate step is allowed at all.

// ~37 degrees (rise/run), a common "steep hillside, no longer
// walkable" threshold in outdoor 3D games (Source/Unreal/Unity all
// default their own walkable-slope limits somewhere in the 35-45
// degree range). Expressed as a plain ratio, not degrees, because
// every caller already has heights and a horizontal distance on hand
// — no trig needed at the call site.
export const DEFAULT_MAX_WALKABLE_SLOPE = 0.75;

// The rise/run ratio of a single step between two sampled heights. A
// zero or negative horizontal distance (the avatar isn't actually
// moving anywhere horizontally — e.g. jumping in place) has no slope
// to speak of, so it reports exactly 0 rather than dividing by zero.
export function slopeBetween(fromHeight, toHeight, horizontalDistance) {
    if (!(horizontalDistance > 0)) return 0;
    return Math.abs(toHeight - fromHeight) / horizontalDistance;
}

// Whether a step between two heights, over a known horizontal
// distance, stays within `maxSlope`. `<=` at the boundary — a step
// landing EXACTLY on the limit is still walkable, the same
// inclusive-boundary convention core/AvatarCollision.js's own AABB
// overlap tests use.
export function isWalkableSlope(fromHeight, toHeight, horizontalDistance, maxSlope = DEFAULT_MAX_WALKABLE_SLOPE) {
    return slopeBetween(fromHeight, toHeight, horizontalDistance) <= maxSlope;
}
