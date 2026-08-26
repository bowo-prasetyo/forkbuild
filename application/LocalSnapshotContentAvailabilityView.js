import { LocalSnapshotContentAvailabilityOutcome } from './LocalSnapshotContentAvailabilityOutcome.js';

// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
//
// application/SnapshotPlacementView.js (0.8.20) turns an already-computed
// resolution result into one flat, UI-ready shape without ever touching
// application/SnapshotPlacementResolver.js itself. This file is the
// identical idea applied to application/
// CheckLocalSnapshotContentAvailabilityUseCase.js#execute()'s own result:
// pure, synchronous, read-only reshaping. This file never imports that
// class and never itself touches a content/ContentStore.js.
//
// `attempt` is `null`/absent (not yet checked), `{ checking: true }` (a
// check is in flight), or `{ outcome, publicationId, contentHash }` —
// application/CheckLocalSnapshotContentAvailabilityUseCase.js#execute()'s
// own resolved shape — once one has completed. Mirrors the identical
// three-state shape application/SnapshotPlacementView.js#
// describeSnapshotPlacement()'s own `resolution` parameter already holds.
export function describeLocalSnapshotContentAvailability(attempt = null) {
    const checking = Boolean(attempt && attempt.checking);
    const checked = Boolean(attempt && !attempt.checking && attempt.outcome);
    return {
        checking,
        checked,
        outcome: checked ? attempt.outcome : null,
        label: checking ? 'Checking…' : (checked ? describeAvailabilityOutcomeLabel(attempt.outcome) : 'Not yet checked'),
        message: checked ? describeAvailabilityOutcomeMessage(attempt.outcome) : null
    };
}

// A short label for a badge — presentation only, mirroring application/
// SnapshotPlacementView.js#describeResolutionOutcome()'s own restraint.
export function describeAvailabilityOutcomeLabel(outcome) {
    switch (outcome) {
        case LocalSnapshotContentAvailabilityOutcome.AVAILABLE: return 'Available';
        case LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE: return 'Not available';
        case LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH: return 'Hash mismatch';
        default: return 'Not yet checked';
    }
}

// The one full sentence this milestone exists to make precise. Deliberately
// never says "verified," "trusted," "authentic," or "confirmed" — this
// class describes a fact about this replica's own local storage, computed
// by recomputing a hash, never a judgment about whether the publication
// itself should be believed. See docs/Principles.md, "Local Content
// Availability Is An Observation, Not A Verdict (0.8.33)."
export function describeAvailabilityOutcomeMessage(outcome) {
    switch (outcome) {
        case LocalSnapshotContentAvailabilityOutcome.AVAILABLE:
            return "Local snapshot is available and matches the publication's content hash.";
        case LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE:
            return 'This replica does not currently hold bytes for this snapshot.';
        case LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH:
            return "This replica holds bytes under this snapshot's hash, but they no longer match it.";
        default:
            return null;
    }
}

// A short label for the button itself — deliberately separate from the
// message above, which describes the RESULT of the most recent check, not
// the action a person is about to take. Mirrors application/
// PublicationKnowledgeSynchronizationView.js#
// describeSynchronizationButtonLabel()'s own shape exactly.
export function describeAvailabilityCheckButtonLabel({ checking = false, checked = false } = {}) {
    if (checking) return 'Checking…';
    return checked ? 'Check Again' : 'Check Local Snapshot';
}
