// 0.8.38 — Snapshot Materialization History & Source Inspection.
//
// application/SnapshotMaterializationAttempt.js (0.8.36/0.8.38) names ONE
// completed materialization attempt. This file is the append-only
// SEQUENCE of every such attempt a single ui/views/
// DecentralizedPublicationsView.js entry has seen THIS SESSION, from ANY
// of the three explicit actions that can produce one — "Import Snapshot"
// (PACKAGE), "Materialize Snapshot" (PLACEMENT), or "Get Snapshot from
// Peer" (PEER):
//
//   []
//     │  appendSnapshotMaterializationHistoryEntry(history, attempt)
//     ▼
//   [attempt1]
//     │  appendSnapshotMaterializationHistoryEntry(history, attempt2)
//     ▼
//   [attempt1, attempt2]
//     │ ...
//     ▼
//   [attempt1, attempt2, attempt3, ...]
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: a history is APPENDED TO,
// NEVER OVERWRITTEN, and never reordered, deduplicated, or filtered down
// to "the best one" — every explicit click that reached application/
// StoreSnapshotContentUseCase.js gets its own entry, in the order it
// happened, including a rejected HASH_MISMATCH attempt. This is a
// deliberately different restraint from `entry.lastMaterializationAttempt`
// (0.8.36), which still holds only the single most recent SUCCESSFUL
// attempt for the "Source: …" summary line — this file's own history
// exists precisely so earlier attempts, and rejected ones, are not
// silently lost the moment a later one succeeds.
//
// `appendSnapshotMaterializationHistoryEntry()` never mutates the
// `history` array it was given — exactly the same "always a new frozen
// array" discipline every other accumulating record in this codebase
// already holds (see application/LocalPlacementKnowledgeStore.js and
// application/LocalAnchorKnowledgeStore.js's own append semantics, one
// axis over). A caller keeps whatever this function returns as the
// entry's new history; the old array is left untouched.
//
// NEVER PERSISTED, NEVER SHARED — the identical restraint application/
// SnapshotMaterializationAttempt.js's own header already holds for each
// individual entry, now extended to the sequence as a whole. This history
// is never written onto a core/DecentralizedPublication.js, a core/
// PublicationSnapshotPlacement.js, a catalog, or a package — it lives only
// in ui/views/DecentralizedPublicationsView.js's own ephemeral
// `entry.materializationHistory`, reset to empty the moment the
// Publication Center is reopened. Two replicas that materialize the
// identical bytes through the identical sequence of sources each hold
// their own, entirely separate history — there is no notion of a shared
// or canonical history, exactly as there is no notion of a canonical
// individual attempt. See docs/Principles.md, "Materialization History
// Describes Byte Acquisition, Not Source Trust (0.8.38)."
export function appendSnapshotMaterializationHistoryEntry(history, attempt) {
    const existing = Array.isArray(history) ? history : [];
    if (!attempt) return Object.freeze(existing.slice());
    return Object.freeze([...existing, attempt]);
}

// A plain, non-judgmental tally of how many recorded attempts named each
// application/SnapshotMaterializationSourceKind.js value — "1 via
// transfer package, 1 via placement, 2 via peer" — mirroring application/
// PublicationReplicaKnowledgeDetailView.js#describeAcquisitionBreakdown()'s
// own shape (0.8.31) exactly, one axis over. Counts EVERY recorded
// attempt, regardless of outcome — a rejected HASH_MISMATCH attempt still
// counts as "one attempt through this source," because this function
// answers "how many times did each mechanism get explicitly tried,"
// never "how many times did each mechanism succeed." THE ONE RULE THIS
// FUNCTION EXISTS TO ENFORCE: it returns a count, never a ranking — there
// is no "preferredSource," no "sourceScore," and nothing here ever picks
// a highest count out and calls it best.
export function describeSnapshotMaterializationSourceCounts(history) {
    const counts = { package: 0, placement: 0, peer: 0 };
    for (const attempt of (Array.isArray(history) ? history : [])) {
        const kind = attempt && attempt.source && attempt.source.kind;
        if (kind && Object.prototype.hasOwnProperty.call(counts, kind)) {
            counts[kind] += 1;
        }
    }
    return counts;
}
