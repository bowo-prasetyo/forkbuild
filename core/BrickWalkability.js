// 0.3.2 — Avatar & Camera Experience.
//
// Pure, Three.js-free step-up geometry — the same "core deals with
// geometry/math, application supplies the data" split
// core/AvatarCollision.js and core/TerrainWalkability.js already
// established, applied here to a THIRD movement question neither of
// those answers: given the avatar is already standing at some height,
// can it step UP (or down) onto a brick's own top surface, rather than
// being blocked by it outright?
//
// Every brick primitive this codebase defines today (see
// core/BrickDefinition.js — width/height/depth only) is a plain,
// flat-topped box, so "the walkable surface at a point" is simply "the
// box's own top face, if that point falls inside its horizontal
// footprint." `walkableTopAt()` is written as the seam a future
// non-box primitive (an actual sloped or stepped shape) would
// specialize, never as a claim that one exists yet — see
// docs/StructureLibrary.md and docs/Roadmap.md's own note on why
// stairs/slopes-as-real-geometry stay out of this milestone.
//
// Deliberately NOT physically simulated — see docs/Principles.md,
// "Step-Up Movement Is A Deterministic Height Constraint, Never A
// Physics Climb (0.3.2)." There is no momentum, no animation curve for
// the hop, no partial climb part-way up a tall obstacle. A step within
// range is simply taken, in full, in one tick; a step beyond range is
// simply not taken at all.

// Roughly one low brick's height — a person can step up onto a curb or
// a single low block without "climbing" it. Expressed in world units,
// the same units every brick dimension and avatar position already use.
export const DEFAULT_MAX_STEP_HEIGHT = 0.6;

// `worldAabb` — a brick's own axis-aligned bounds, ALREADY translated
// into world space (see core/AvatarCollision.js's brickAabb()/
// translateAabb()). Returns the brick's top face height (`worldAabb.max.y`)
// when (x, z) falls within its horizontal footprint (inclusive bounds —
// the same convention core/AvatarCollision.js's own aabbsOverlap() uses),
// or `null` when the point is outside it — "no surface here," not "a
// surface at height zero."
export function walkableTopAt(worldAabb, x, z) {
    if (!worldAabb) return null;
    if (x < worldAabb.min.x || x > worldAabb.max.x || z < worldAabb.min.z || z > worldAabb.max.z) {
        return null;
    }
    return worldAabb.max.y;
}

// Whether a vertical step between two support heights is a STEP, not a
// CLIMB — symmetric (a step down beyond range is exactly as blocked as
// a step up beyond range), matching the same "abs() of the difference"
// convention core/TerrainWalkability.js#isWalkableSlope already
// established for slope, applied here to a flat vertical rise instead
// of a rise/run ratio: a brick top has no horizontal run to measure
// against, only a height difference to compare against a limit.
export function isStepClimbable(fromHeight, toHeight, maxStepHeight = DEFAULT_MAX_STEP_HEIGHT) {
    if (!Number.isFinite(fromHeight) || !Number.isFinite(toHeight)) return false;
    return Math.abs(toHeight - fromHeight) <= maxStepHeight;
}
