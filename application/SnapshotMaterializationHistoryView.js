import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { describeSnapshotMaterializationSourceLabel } from './SnapshotMaterializationView.js';

// 0.8.38 — Snapshot Materialization History & Source Inspection.
//
// application/SnapshotMaterializationView.js (0.8.36) turns ONE attempt
// into the "Local Snapshot" summary's own "Source: …" line. This file
// turns application/SnapshotMaterializationHistory.js's own accumulated
// SEQUENCE of attempts into the plain, chronological narration a
// "Materialization History" disclosure shows — never a verdict on which
// attempt mattered most.
//
//   describeSnapshotMaterializationOutcomeLabel(outcome)
//     STORED             → "Snapshot stored locally"
//     ALREADY_AVAILABLE  → "Snapshot was already available"
//     HASH_MISMATCH      → "Content hash mismatch"
//
//   describeSnapshotMaterializationHistory(history)
//     → { count, attempts: [{ sourceLabel, outcomeLabel, observedAt,
//          possessed, publicationId, contentHash }, ...] }
//     in the SAME order `history` itself holds them — oldest first,
//     exactly the order application/
//     SnapshotMaterializationHistory.js#appendSnapshotMaterializationHistoryEntry()
//     already appends in. This function never sorts, groups, or
//     reorders by source or outcome.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated one layer over
// application/SnapshotMaterializationView.js's own: the vocabulary stays
// factual. "Snapshot stored locally," "Snapshot was already available,"
// and "Content hash mismatch" each name what happened, and nothing else
// — never "trusted source," "best source," "verified source," "reliable
// peer," "preferred source," or "canonical copy." A publication whose
// history shows one PACKAGE attempt and two PEER attempts is not thereby
// described as "peer-preferred" — the count is a historical fact, never
// evidence about which mechanism is better. See docs/Principles.md,
// "Materialization History Describes Byte Acquisition, Not Source Trust
// (0.8.38)."
export function describeSnapshotMaterializationOutcomeLabel(outcome) {
    switch (outcome) {
        case StoreSnapshotContentOutcome.STORED: return 'Snapshot stored locally';
        case StoreSnapshotContentOutcome.ALREADY_AVAILABLE: return 'Snapshot was already available';
        case StoreSnapshotContentOutcome.HASH_MISMATCH: return 'Content hash mismatch';
        default: return null;
    }
}

// `history`: an application/SnapshotMaterializationHistory.js-shaped
// array of application/SnapshotMaterializationAttempt.js records (or
// null/empty — no attempt has completed for this entry, in this browsing
// session). Deliberately does NOT itself decide whether bytes are
// CURRENTLY available — that remains application/
// CheckLocalSnapshotContentAvailabilityUseCase.js's own job (0.8.33),
// entirely unaffected by whatever this history narrates; a HASH_MISMATCH
// entry sitting in the history changes nothing about a fresh local
// availability check run afterward, exactly the same independence
// application/SnapshotMaterializationView.js's own header already
// establishes for a single attempt.
export function describeSnapshotMaterializationHistory(history) {
    const attempts = (Array.isArray(history) ? history : []).map((attempt) => ({
        sourceLabel: describeSnapshotMaterializationSourceLabel(attempt.source.kind),
        outcomeLabel: describeSnapshotMaterializationOutcomeLabel(attempt.outcome),
        observedAt: attempt.observedAt,
        possessed: attempt.outcome === StoreSnapshotContentOutcome.STORED || attempt.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE,
        publicationId: attempt.publicationId,
        contentHash: attempt.contentHash
    }));
    return { count: attempts.length, attempts };
}
