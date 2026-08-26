// 0.8.40 — Snapshot Possession Observation Exchange.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Check with Peer"
// click, on one specific selected peer, through to a result — the
// identical "name the difference structurally, not by convention"
// discipline application/SnapshotPeerMaterializationUiState.js (0.8.37)
// already established, applied here to the possession-observation path.
//
//   IDLE           — no "Check with Peer" attempt has ever been made for
//                     THIS publication, in this browsing session.
//   CHECKING       — application/SnapshotPeerPossessionCoordinator.js#
//                     observe() is currently in flight. UI-only; never a
//                     SnapshotPeerPossessionState value, because nothing
//                     has resolved yet.
//   AVAILABLE      — the most recent observation resolved to application/
//                     SnapshotPeerPossessionState.js#AVAILABLE — the
//                     selected peer reports it currently holds bytes for
//                     this contentHash.
//   NOT_AVAILABLE  — the most recent observation resolved to
//                     SnapshotPeerPossessionState.NOT_AVAILABLE — the
//                     selected peer reports it does not.
//   UNAVAILABLE    — the most recent observation resolved to
//                     SnapshotPeerPossessionState.UNAVAILABLE — no answer
//                     arrived before the request timed out. Honestly
//                     inconclusive; checking again, or choosing a
//                     different peer, may succeed.
//   UNAVAILABLE (local) — a caller contract violation (no peer selected)
//                     made application/SnapshotPeerPossessionCoordinator.js#
//                     observe() itself throw. Shares the same UI state as
//                     the transport-level UNAVAILABLE above — to a person
//                     looking at the button, both read identically as "no
//                     answer" — while `message` still carries the specific
//                     local cause.
//
// THIS IS UI STATE, NEVER DOMAIN STATE. No value here is ever written onto
// a publication, persisted, or shared — it lives only in whatever ephemeral
// component state a caller keeps for the lifetime of the page. Reopening
// the Publication Center always starts every entry back at IDLE.
export const SnapshotPeerPossessionUiState = Object.freeze({
    IDLE: 'idle',
    CHECKING: 'checking',
    AVAILABLE: 'available',
    NOT_AVAILABLE: 'not-available',
    UNAVAILABLE: 'unavailable'
});
