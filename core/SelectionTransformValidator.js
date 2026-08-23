// "Would committing this multi-brick transform leave two bricks on the
// same cell?" — the multi-brick counterpart to PlacementValidator.js's
// single-brick check, one rung over rather than one rung up: same
// exact-position model, same building-scoped collision domain, just
// checked for a whole batch of simultaneously-moving bricks instead of
// one candidate. Lives in core/ for the same reason PlacementValidator.js
// does — "is this placement legal" is a World-level invariant, not UI
// convenience, and this needs nothing but the World already in hand.
//
// Deliberately position-based, not AABB — the same conservative posture
// PlacementValidator.js already established for ordinary bricks (as
// opposed to StructurePlacementValidator.js's AABB check one level up,
// where structures rarely sit on the brick grid at all). Unlike
// PlacementValidator.js, "position-based" here means within EPSILON
// rather than PlacementValidator's exact `===`: a rotated selection's
// landing coordinates come out of sin/cos (application/TransformMath.js),
// so a brick conceptually landing exactly on a neighbor's cell arrives
// as 1.9999999999999998, not 2 — real floating-point behavior a
// flagship test caught directly, not a defensive guess. EPSILON is far
// tighter than any real brick spacing, so it only absorbs trig rounding,
// never merges two genuinely distinct cells into one.
export class SelectionTransformValidator {
    // world: the World the transform would apply to.
    // transforms: the FULL final state of every selected brick —
    //   [{ buildingId, brickId, position: {x,y,z}, rotation }], exactly
    //   the shape application/TransformMath.js#calculateTransforms
    //   already produces and TransformSelectionCommand already commits.
    //   Deliberately takes the same plain-data shape rather than Brick/
    //   Position instances, so callers mid-gesture (SpatialEditingService)
    //   never have to round-trip through a Position just to ask "is this
    //   still legal."
    //
    // Checks two things per building touched by the transform:
    //   1. no member's final position matches a NON-member brick already
    //      in that building (the ordinary collision case)
    //   2. no two members land on the same final position as EACH OTHER
    //      (a selection can rotate two of its own bricks onto one cell)
    // A building referenced by `transforms` that no longer exists is
    // conservatively invalid — there is nothing to validate a landing
    // spot against, so the safe answer is "no."
    canApply(world, transforms) {
        if (!world || !transforms || transforms.length === 0) {
            return true;
        }
        const byBuilding = new Map();
        for (const transform of transforms) {
            const list = byBuilding.get(transform.buildingId) || [];
            list.push(transform);
            byBuilding.set(transform.buildingId, list);
        }
        for (const [buildingId, members] of byBuilding) {
            const building = world.getBuilding(buildingId);
            if (!building) {
                return false;
            }
            const memberIds = new Set(members.map((m) => m.brickId));
            const occupied = building.getBricks()
                .filter((brick) => !memberIds.has(brick.id))
                .map((brick) => brick.position);
            for (let i = 0; i < members.length; i++) {
                const position = members[i].position;
                if (occupied.some((other) => positionsEqual(other, position))) {
                    return false;
                }
                for (let j = i + 1; j < members.length; j++) {
                    if (positionsEqual(position, members[j].position)) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
}

const EPSILON = 1e-6;

function positionsEqual(a, b) {
    return Math.abs(a.x - b.x) < EPSILON
        && Math.abs(a.y - b.y) < EPSILON
        && Math.abs(a.z - b.z) < EPSILON;
}
