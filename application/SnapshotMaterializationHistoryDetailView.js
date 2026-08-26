import { describeSnapshotMaterializationHistory } from './SnapshotMaterializationHistoryView.js';
import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';

// 0.8.44 — Explicit Snapshot Acquisition Attempt Inspection.
//
// application/SnapshotMaterializationHistoryView.js (0.8.38) already turns
// application/SnapshotMaterializationHistory.js's own accumulated SEQUENCE
// of attempts into a full per-attempt narration — `sourceLabel`,
// `outcomeLabel`, `observedAt`, `possessed`, `publicationId`,
// `contentHash` — in the exact order they happened. application/
// PublicationSnapshotAcquisitionView.js (0.8.43) composes a plain COUNT
// over that same sequence for the "Snapshot Acquisition" summary. Neither
// file makes the sequence itself INSPECTABLE one attempt at a time — a
// caller wanting that still has to read `describeSnapshotMaterializationHistory()`'s
// own `attempts` array directly. This file is that inspection layer, and
// nothing more: it adds exactly ONE UI-ready convenience on top of the
// SAME narration — a short, one-word `outcomeShortLabel`
// ("Stored"/"Already available"/"Hash mismatch") suited to a condensed,
// chronological row ("Placement → Stored"), sitting alongside the SAME
// full-sentence `outcomeLabel` ("Snapshot stored locally") the composed
// layer beneath this one already narrates, for whichever single row a
// person expands.
//
//   describeSnapshotMaterializationHistoryEntry(attempt)
//     → one attempt's own description, or null for no attempt.
//   describeSnapshotMaterializationHistoryDetails(history)
//     → { count, entries: [...] }, in the SAME order `history` itself
//       holds them — oldest first, exactly as application/
//       SnapshotMaterializationHistoryView.js#describeSnapshotMaterializationHistory()
//       already returns them. Never sorted, grouped, or reordered by
//       source or outcome.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: history records what happened
// during an explicit acquisition attempt; inspection must not reinterpret
// why it happened. Both functions add ZERO new facts — every field either
// one returns already exists, verbatim, on describeSnapshotMaterializationHistory()'s
// own per-attempt result; this file only adds a second, shorter label for
// the SAME outcome an attempt already carries. Neither function performs a
// new content check, resolves a placement, contacts a peer, modifies
// history, or modifies possession — see application/
// CheckLocalSnapshotContentAvailabilityUseCase.js (0.8.33) and application/
// PublicationSnapshotAcquisitionView.js's own headers on why current
// possession stays entirely independent of whatever this inspection
// narrates. And, restated one more time because it is the entire point of
// this file: no source is ever ranked, and NO `confidence`, `trust`,
// `quality`, `preferredSource`, or `bestSource` field is ever added here —
// see docs/Principles.md, "Materialization History Describes Byte
// Acquisition, Not Source Trust (0.8.38)."
//
// NEVER PERSISTED, NEVER SHARED, and introduces no new state of its own —
// the identical restraint every file it composes already holds. Pure and
// stateless: no constructor, no injected dependency, no caching. Calling
// either function twice with byte-identical arguments returns a
// byte-identical result.
export function describeSnapshotMaterializationHistoryDetails(history) {
    const raw = Array.isArray(history) ? history : [];
    const described = describeSnapshotMaterializationHistory(raw).attempts;
    const entries = described.map((entry, index) => Object.freeze({
        ...entry,
        outcomeShortLabel: describeSnapshotMaterializationOutcomeShortLabel(raw[index] && raw[index].outcome)
    }));
    return Object.freeze({ count: entries.length, entries: Object.freeze(entries) });
}

export function describeSnapshotMaterializationHistoryEntry(attempt) {
    if (!attempt) return null;
    return describeSnapshotMaterializationHistoryDetails([attempt]).entries[0] || null;
}

// A condensed counterpart to application/
// SnapshotMaterializationHistoryView.js#describeSnapshotMaterializationOutcomeLabel()'s
// own full sentence — the identical three outcomes, in fewer words, for a
// row that has no room for "Snapshot stored locally." Carries no meaning
// the full sentence does not already carry.
function describeSnapshotMaterializationOutcomeShortLabel(outcome) {
    switch (outcome) {
        case StoreSnapshotContentOutcome.STORED: return 'Stored';
        case StoreSnapshotContentOutcome.ALREADY_AVAILABLE: return 'Already available';
        case StoreSnapshotContentOutcome.HASH_MISMATCH: return 'Hash mismatch';
        default: return null;
    }
}
