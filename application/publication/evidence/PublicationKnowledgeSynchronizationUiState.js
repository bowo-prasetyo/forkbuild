// 0.8.30 — Explicit Replica Knowledge Synchronization.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Synchronize with
// Peers" click through to a result — the identical "name the difference
// structurally, not by convention" discipline application/
// PublicationEvidenceDiscoveryUiState.js (0.8.16) already established
// for anchor-only discovery, applied here to a synchronize() call that
// spans both anchors and placements at once.
//
//   IDLE            — no synchronization attempt has ever been made for
//                      this publication, in this browsing session.
//   SYNCHRONIZING    — a synchronize() call is currently in flight.
//   SYNCHRONIZED     — the most recent attempt reached at least one peer
//                      and found at least one claim (an anchor, a
//                      placement, or both) this replica did not already
//                      know.
//   NO_NEW_CLAIMS   — the most recent attempt reached at least one peer,
//                      but every claim offered back — anchor and
//                      placement alike — was already known. This is NOT
//                      "no claims exist" — see this file's own
//                      docs/Roadmap.md entry, and application/
//                      PublicationEvidenceDiscoveryUiState.js's own
//                      identical caveat for NO_NEW_EVIDENCE.
//   UNAVAILABLE     — the requested synchronization could not complete:
//                      either there was no authenticated peer to ask, or
//                      the attempt itself failed. This is NEVER a
//                      statement about whether more claims exist —
//                      only that this replica could not presently
//                      establish a synchronization result.
//
// THIS IS UI STATE, NEVER DOMAIN STATE — mirroring application/
// PublicationEvidenceDiscoveryUiState.js's own restraint exactly. No
// value here is ever written onto a core/PublicationAnchor.js or
// core/PublicationSnapshotPlacement.js, stored in either catalog, or
// persisted anywhere; it lives only in whatever ephemeral object a
// caller keeps for the lifetime of the page. Reopening the Publication
// Center always starts back at IDLE.
export const PublicationKnowledgeSynchronizationUiState = Object.freeze({
    IDLE: 'idle',
    SYNCHRONIZING: 'synchronizing',
    SYNCHRONIZED: 'synchronized',
    NO_NEW_CLAIMS: 'no_new_claims',
    UNAVAILABLE: 'unavailable'
});
