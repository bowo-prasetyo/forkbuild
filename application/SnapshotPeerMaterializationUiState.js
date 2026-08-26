// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Get Snapshot from
// Peer" click, on one specific selected peer, through to a result — the
// identical "name the difference structurally, not by convention"
// discipline application/SnapshotPlacementMaterializationUiState.js (0.8.35)
// already established, applied here to the peer-backed path.
//
//   IDLE               — no "Get Snapshot from Peer" attempt has ever been
//                         made for THIS publication, in this browsing
//                         session.
//   REQUESTING         — application/
//                         SnapshotPeerMaterializationCoordinator.js#
//                         materialize() is currently in flight — the
//                         selected peer has been asked and this replica is
//                         waiting for a verified RESPONSE or a timeout.
//                         UI-only; never a PeerSnapshotMaterializationOutcome
//                         value, because nothing has resolved yet.
//   STORED             — the most recent attempt resolved to
//                         PeerSnapshotMaterializationOutcome.STORED — the
//                         selected peer supplied bytes that verified, and
//                         they were newly written to this replica.
//   ALREADY_AVAILABLE  — the most recent attempt resolved to
//                         PeerSnapshotMaterializationOutcome
//                         .ALREADY_AVAILABLE — verified bytes this replica
//                         already held. Never an error.
//   UNAVAILABLE        — the most recent attempt resolved to
//                         PeerSnapshotMaterializationOutcome.UNAVAILABLE —
//                         the selected peer did not supply verified
//                         content before the request timed out. Honestly
//                         inconclusive; choosing a different peer, or
//                         trying the same one again, may succeed.
//   HASH_MISMATCH      — the most recent attempt resolved to
//                         PeerSnapshotMaterializationOutcome.HASH_MISMATCH
//                         — the selected peer answered, but its own bytes
//                         do not hash to this snapshot's claimed content
//                         hash. A DEFINITE finding, never conflated with
//                         UNAVAILABLE.
//   UNAVAILABLE (local) — a caller contract violation (no peer selected)
//                         made application/
//                         SnapshotPeerMaterializationCoordinator.js#
//                         materialize() itself throw. Shares the same UI
//                         state as the transport-level UNAVAILABLE above —
//                         to a person looking at the button, both read
//                         identically as "nothing was obtained" — while
//                         `message` still carries the specific local
//                         cause.
//
// THIS IS UI STATE, NEVER DOMAIN STATE. No value here is ever written onto
// a publication, a content/ContentStore.js, or persisted anywhere at all —
// it lives only in whatever ephemeral object a caller keeps in its own
// component state for the lifetime of the page. Reopening the Publication
// Center always starts every entry back at IDLE.
export const SnapshotPeerMaterializationUiState = Object.freeze({
    IDLE: 'idle',
    REQUESTING: 'requesting',
    STORED: 'stored',
    ALREADY_AVAILABLE: 'already-available',
    UNAVAILABLE: 'unavailable',
    HASH_MISMATCH: 'hash-mismatch'
});
