import { LocalSnapshotContentAvailabilityOutcome } from './LocalSnapshotContentAvailabilityOutcome.js';
import { message } from '../../../core/Message.js';

// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
//
// application/snapshot/placement/SnapshotPlacementView.js (0.8.20) turns an already-computed
// resolution result into one flat, UI-ready shape without ever touching
// application/snapshot/placement/SnapshotPlacementResolver.js itself. This file is the
// identical idea applied to application/
// CheckLocalSnapshotContentAvailabilityUseCase.js#execute()'s own result:
// pure, synchronous, read-only reshaping. This file never imports that
// class and never itself touches a content/ContentStore.js.
//
// `attempt` is `null`/absent (not yet checked), `{ checking: true }` (a
// check is in flight), or `{ outcome, publicationId, contentHash }` —
// application/snapshot/materialization/CheckLocalSnapshotContentAvailabilityUseCase.js#execute()'s
// own resolved shape — once one has completed. Mirrors the identical
// three-state shape application/snapshot/placement/SnapshotPlacementView.js#
// describeSnapshotPlacement()'s own `resolution` parameter already holds.
export function describeLocalSnapshotContentAvailability(attempt = null) {
    const checking = Boolean(attempt && attempt.checking);
    const checked = Boolean(attempt && !attempt.checking && attempt.outcome);
    return {
        checking,
        checked,
        outcome: checked ? attempt.outcome : null,
        label: checking ? message('localSnapshotContentAvailability.checking') : (checked ? describeAvailabilityOutcomeLabel(attempt.outcome) : message('localSnapshotContentAvailability.notYetChecked')),
        message: checked ? describeAvailabilityOutcomeMessage(attempt.outcome) : null
    };
}

// A short label for a badge — presentation only, mirroring application/
// SnapshotPlacementView.js#describeResolutionOutcome()'s own restraint.
export function describeAvailabilityOutcomeLabel(outcome) {
    switch (outcome) {
        case LocalSnapshotContentAvailabilityOutcome.AVAILABLE: return message('localSnapshotContentAvailability.available');
        case LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE: return message('localSnapshotContentAvailability.notAvailable');
        case LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH: return message('localSnapshotContentAvailability.hashMismatch');
        default: return message('localSnapshotContentAvailability.notYetChecked');
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
            return message('localSnapshotContentAvailability.localSnapshotIsAvailableAnd');
        case LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE:
            return message('localSnapshotContentAvailability.thisReplicaDoesNotCurrently');
        case LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH:
            return message('localSnapshotContentAvailability.thisReplicaHoldsBytesUnder');
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
    if (checking) return message('localSnapshotContentAvailability.checking');
    return checked ? message('localSnapshotContentAvailability.checkAgain') : message('localSnapshotContentAvailability.checkLocalSnapshot');
}
