// 0.8.34 — Explicit Snapshot Materialization UX.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Import Snapshot"
// click through to a result — the identical "name the difference
// structurally, not by convention" discipline application/
// ExternalAnchorCreationUiState.js (0.8.11) and application/
// SnapshotPlacementCreationUiState.js (0.8.25) already established, applied
// here to the third explicit creation-shaped action this codebase now
// offers: not "what happened to the bytes" (that's still application/
// SnapshotContentTransferOutcome.js's own job — STORED/ALREADY_STORED/
// CONTENT_HASH_MISMATCH), but "what should this one button/panel show
// right now."
//
//   IDLE               — no import attempt has ever been made for this
//                         entry, in this browsing session.
//   IMPORTING          — application/
//                         SnapshotContentMaterializationCoordinator.js#
//                         import() is currently in flight. UI-only; never
//                         a SnapshotContentTransferOutcome value, because
//                         nothing has resolved yet.
//   IMPORTED           — the most recent attempt resolved to
//                         SnapshotContentTransferOutcome.STORED — bytes
//                         verified against the package's own claimed hash
//                         and newly written to this replica.
//   ALREADY_AVAILABLE  — the most recent attempt resolved to
//                         SnapshotContentTransferOutcome.ALREADY_STORED —
//                         verified bytes this replica already held. Never
//                         an error, exactly as that outcome's own header
//                         already states; a person sees a distinct,
//                         equally calm label from IMPORTED, never a
//                         warning.
//   UNAVAILABLE        — the supplied input was not even a well-formed
//                         Publication Snapshot Transfer Package (invalid
//                         JSON, wrong `kind`, a missing field — application/
//                         PublicationSnapshotTransferPackageValidator.js's
//                         own PublicationSnapshotTransferPackageError), OR
//                         application/
//                         SnapshotContentMaterializationCoordinator.js#
//                         import() itself threw for some other local
//                         reason. No transfer was ever attempted either
//                         way — the identical "a local precondition
//                         failure reads exactly like nothing external was
//                         reached" posture application/
//                         ExternalAnchorCreationUiState.js's own UNAVAILABLE
//                         already holds one axis over.
//   REJECTED           — the most recent attempt resolved to
//                         SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH
//                         — the package WAS well-formed, but its own
//                         `content` does not hash to its own claimed
//                         `contentHash`. A DEFINITE negative finding,
//                         never conflated with UNAVAILABLE: the package
//                         was read; it demonstrably did not verify.
//
// THIS IS UI STATE, NEVER DOMAIN STATE. No value here is ever written onto
// a publication, a content/ContentStore.js, or persisted anywhere at all —
// it lives only in whatever ephemeral object a caller (ui/views/
// DecentralizedPublicationsView.js) keeps in its own component state for
// the lifetime of the page, exactly as application/
// ExternalAnchorCreationUiState.js's own header already states for anchor
// creation attempts. Reopening the Publication Center always starts every
// entry back at IDLE. See docs/Principles.md, "Snapshot Materialization
// Is An Explicit User Action, Distinct From Every Other Way A Replica
// Learns About Content (0.8.34)."
export const SnapshotContentMaterializationUiState = Object.freeze({
    IDLE: 'idle',
    IMPORTING: 'importing',
    IMPORTED: 'imported',
    ALREADY_AVAILABLE: 'already-available',
    UNAVAILABLE: 'unavailable',
    REJECTED: 'rejected'
});
