// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Materialize
// Snapshot" click, on one specific placement card, through to a result —
// the identical "name the difference structurally, not by convention"
// discipline application/SnapshotContentMaterializationUiState.js (0.8.34)
// already established, applied here to the placement-backed path.
//
//   IDLE               — no materialization attempt has ever been made
//                         for THIS placement, in this browsing session.
//   MATERIALIZING       — application/
//                         SnapshotPlacementMaterializationCoordinator.js#
//                         materialize() is currently in flight. UI-only;
//                         never a SnapshotPlacementMaterializationOutcome
//                         value, because nothing has resolved yet.
//   STORED              — the most recent attempt resolved to
//                         SnapshotPlacementMaterializationOutcome.STORED —
//                         the placement resolved, and its bytes were
//                         newly written to this replica.
//   ALREADY_AVAILABLE   — the most recent attempt resolved to
//                         SnapshotPlacementMaterializationOutcome
//                         .ALREADY_AVAILABLE — verified bytes this
//                         replica already held. Never an error, exactly
//                         as the offline-package path's own
//                         ALREADY_AVAILABLE (0.8.34) already holds one
//                         axis over.
//   UNAVAILABLE         — the most recent attempt resolved to
//                         SnapshotPlacementMaterializationOutcome
//                         .UNAVAILABLE — no store was reachable for this
//                         placement's storage, or the resolved store
//                         could not presently produce bytes. Honestly
//                         inconclusive; a retry later may succeed.
//   HASH_MISMATCH       — the most recent attempt resolved to
//                         SnapshotPlacementMaterializationOutcome
//                         .HASH_MISMATCH — a store answered, but its own
//                         bytes do not hash to this placement's claimed
//                         contentHash. A DEFINITE finding, never
//                         conflated with UNAVAILABLE.
//   INVALID_PLACEMENT   — the most recent attempt resolved to
//                         SnapshotPlacementMaterializationOutcome
//                         .INVALID_PLACEMENT — the placement itself is
//                         not even a well-formed, validly signed claim.
//   UNAVAILABLE (local)  — a caller contract violation (a non-placement
//                         argument) made application/
//                         SnapshotPlacementMaterializationCoordinator.js#
//                         materialize() itself throw. Shares the same
//                         UI state as the resolution-level UNAVAILABLE
//                         above — to a person looking at the button, both
//                         read identically as "nothing was obtained" —
//                         while `message` still carries the specific
//                         local cause. Mirrors application/
//                         SnapshotContentMaterializationUiState.js's own
//                         UNAVAILABLE exactly, one axis over.
//
// THIS IS UI STATE, NEVER DOMAIN STATE. No value here is ever written onto
// a placement, a content/ContentStore.js, or persisted anywhere at all —
// it lives only in whatever ephemeral object a caller keeps in its own
// component state for the lifetime of the page. Reopening the Publication
// Center always starts every placement back at IDLE. See docs/
// Principles.md, "Placement Resolution Observes Present Availability;
// Materialization Turns It Into Possession (0.8.35)."
export const SnapshotPlacementMaterializationUiState = Object.freeze({
    IDLE: 'idle',
    MATERIALIZING: 'materializing',
    STORED: 'stored',
    ALREADY_AVAILABLE: 'already-available',
    UNAVAILABLE: 'unavailable',
    HASH_MISMATCH: 'hash-mismatch',
    INVALID_PLACEMENT: 'invalid-placement'
});
