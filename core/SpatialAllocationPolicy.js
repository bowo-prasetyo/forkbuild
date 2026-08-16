// 0.2.25 — vocabulary for "what should happen when a requested
// placement overlaps an existing one." See docs/Principles.md,
// "Overlap Is A Fact; Collision Is A Policy Decision": an overlap
// (core/SpatialOverlap.js) is never, by itself, an error. These names
// describe how much friction to put between a requester and an
// already-occupied coordinate — a policy choice, not a judgment on the
// placements involved.
export const SpatialAllocationPolicy = Object.freeze({
    // Place at the requested position — no friction, no confirmation.
    // Used for automatic initial placement (GridPlacementStrategy via
    // PlacePublicationUseCase): there is no user present to confirm
    // anything, and 0.2.23 already established that placement must
    // never block a publish that otherwise succeeded.
    ALLOW: 'allow',

    // Place at the requested position, but the caller must obtain
    // confirmation before doing so. The default for explicit,
    // interactive placement (WorldNavigationSession.movePlacement's
    // pre-flight check) — see docs/Principles.md for why silently
    // changing a user's explicitly requested coordinate is worse than
    // asking first.
    WARN: 'warn',

    // Refuse the requested position outright. Not wired to any default
    // flow in 0.2.25 — named for a future caller (e.g. a
    // moderation/curation policy) that wants hard exclusivity; nothing
    // in this milestone constructs one.
    REJECT: 'reject',

    // NOT IMPLEMENTED. Silently relocating a placement to a different
    // position than requested requires a globally-reproducible
    // allocation algorithm — one where every replica, working from
    // whatever subset of placements it has locally discovered,
    // computes the exact same resolved position. 0.2.24 established
    // that "same input, same output, everywhere" is hard to get right
    // even for a single unoccupied slot; doing it for occupied-slot
    // resolution, without moving positions that are already published
    // and authoritative (see docs/Principles.md, "A Position, Once
    // Assigned, Is A Fact — Not A Projection," 0.2.23), is deliberately
    // left unbuilt until a real requirement asks for it, rather than
    // shipping an algorithm that only looks reproducible in single-node
    // testing.
    AUTO_OFFSET: 'auto_offset'
});

// A decision about ONE requested position, given a policy and the
// SpatialOverlap already observed there. Pure function: no side
// effects, no knowledge of where the overlap data came from or what
// happens with the decision afterward.
export function evaluateSpatialAllocation(policy, overlap) {
    if (!overlap || overlap.isEmpty) {
        return { policy, overlap: overlap || null, allowed: true, requiresConfirmation: false };
    }
    switch (policy) {
        case SpatialAllocationPolicy.ALLOW:
            return { policy, overlap, allowed: true, requiresConfirmation: false };
        case SpatialAllocationPolicy.WARN:
            return { policy, overlap, allowed: true, requiresConfirmation: true };
        case SpatialAllocationPolicy.REJECT:
            return { policy, overlap, allowed: false, requiresConfirmation: false };
        case SpatialAllocationPolicy.AUTO_OFFSET:
            throw new Error('SpatialAllocationPolicy.AUTO_OFFSET is not implemented — see docs/Principles.md, "Automatic Collision Resolution Is Deferred, Not Solved."');
        default:
            throw new Error(`evaluateSpatialAllocation: unknown policy "${policy}"`);
    }
}
