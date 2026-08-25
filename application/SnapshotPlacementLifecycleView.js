import { SnapshotPlacementResolutionOutcome } from './SnapshotPlacementResolutionOutcome.js';
import { SnapshotPlacementLifecycleState } from './SnapshotPlacementLifecycleState.js';

// 0.8.26 — Snapshot Placement Lifecycle & Stale Availability Semantics.
//
// application/SnapshotPlacementView.js (0.8.20) turns ONE already-
// computed resolution result into a flat display shape. This file
// answers a question that requires more than one: given every resolution
// attempt a replica has made for a single placement so far —
// application/SnapshotPlacementResolutionObservation.js records (0.8.20),
// in the order they happened — what should a person be told about it
// RIGHT NOW? This is the derived "lifecycle view" application/
// SnapshotPlacementResolutionObservation.js's own 0.8.20 header, and
// docs/Roadmap.md's own 0.8.25 "What's left" line, both already named as
// future work, built the same way application/
// PublicationAnchorVerificationLifecycleView.js (0.8.12) already built
// the identical thing one axis over: pure, synchronous, side-effect-free,
// and never itself calling application/SnapshotPlacementResolver.js,
// touching application/LocalPublicationSnapshotPlacementCatalog.js, or
// importing core/PublicationSnapshotPlacement.js's own mutating surface
// (it has none — see that class's own header, "Placements are never
// updated in place"). It only ever reshapes observations a caller
// already collected elsewhere (ordinarily ui/views/
// DecentralizedPublicationsView.js's own `entry.resolutionHistory`).
//
// THE CENTRAL RULE THIS FILE EXISTS TO ENFORCE: `UNAVAILABLE` is never
// displayed as "the placement is invalid" merely because an earlier
// attempt reached `RESOLVED`, and `RESOLVED` earned once is never
// treated as permanent — the CURRENT state always reflects only the MOST
// RECENT observation. What a history of observations adds is exactly one
// extra fact, `everResolved` — whether this placement's bytes were
// independently retrieved at SOME point in this replica's own session —
// carried alongside the current state, never merged into a new state
// name of its own (there is deliberately no
// `PREVIOUSLY_RESOLVED_NOW_UNAVAILABLE` entry in application/
// SnapshotPlacementLifecycleState.js). See docs/Principles.md, "A
// Resolution Result Describes Whether Bytes Can Be Retrieved Now; It
// Does Not Rewrite The Placement Claim (0.8.26)."
export function deriveSnapshotPlacementLifecycle(observations = []) {
    const list = Array.isArray(observations) ? observations : [];
    if (list.length === 0) {
        return {
            state: SnapshotPlacementLifecycleState.NOT_RESOLVED,
            currentOutcome: null,
            currentReason: null,
            everResolved: false,
            observationCount: 0,
            lastObservedAt: null
        };
    }
    const current = list[list.length - 1];
    const everResolved = list.some((observation) => observation.outcome === SnapshotPlacementResolutionOutcome.RESOLVED);
    return {
        state: stateForOutcome(current.outcome),
        currentOutcome: current.outcome,
        currentReason: current.reason,
        everResolved,
        observationCount: list.length,
        lastObservedAt: current.observedAt instanceof Date ? current.observedAt.toISOString() : current.observedAt
    };
}

// STORE_UNAVAILABLE and CONTENT_UNAVAILABLE both derive the SAME
// UNAVAILABLE lifecycle state — see application/
// SnapshotPlacementLifecycleState.js's own header on why that collapse is
// deliberate, and why CONTENT_HASH_MISMATCH is deliberately NOT collapsed
// alongside them.
function stateForOutcome(outcome) {
    switch (outcome) {
        case SnapshotPlacementResolutionOutcome.RESOLVED: return SnapshotPlacementLifecycleState.RESOLVED;
        case SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH: return SnapshotPlacementLifecycleState.HASH_MISMATCH;
        case SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE:
        case SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE:
            return SnapshotPlacementLifecycleState.INVALID_PLACEMENT;
        default: return SnapshotPlacementLifecycleState.UNAVAILABLE;
    }
}

// A single, optional, presentation-only sentence to show ALONGSIDE
// application/SnapshotPlacementView.js's own existing `resolutionLabel`
// — never a replacement for it. `null` in every case except the one this
// milestone was built to surface: the most recent attempt is
// `UNAVAILABLE` and an EARLIER attempt, in this same replica's own
// session, reached `RESOLVED`. Deliberately says "currently
// unavailable," never "invalid," "corrupted," "lost," or "removed" — see
// application/SnapshotPlacementLifecycleState.js's own header on
// `UNAVAILABLE`.
//
// Never shown for `HASH_MISMATCH`, even when an earlier attempt DID
// resolve correctly: a store answering with the WRONG bytes is a
// definite finding, never softened into "temporarily unavailable"
// language just because it once worked — the existing
// resolutionLabel/resolutionReason already say exactly what was found,
// and this function adds nothing on top of a definite finding. Mirrors
// application/PublicationAnchorVerificationLifecycleView.js's own
// identical restraint for `REJECTED`.
export function describeSnapshotPlacementLifecycleNote(lifecycle) {
    if (!lifecycle) return null;
    if (lifecycle.state === SnapshotPlacementLifecycleState.UNAVAILABLE && lifecycle.everResolved) {
        return 'This snapshot was resolved successfully earlier; it is currently unavailable.';
    }
    return null;
}
