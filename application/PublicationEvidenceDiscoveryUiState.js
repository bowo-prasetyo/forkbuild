// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Discover from
// Peers" click through to a result — the identical "name the difference
// structurally, not by convention" discipline application/
// ExternalAnchorCreationUiState.js (0.8.11) already established for
// creation, applied here to discovery.
//
//   IDLE            — no discovery attempt has ever been made for this
//                      publication, in this browsing session.
//   DISCOVERING     — a discover() call is currently in flight.
//   DISCOVERED      — the most recent attempt reached at least one peer
//                      and found at least one anchor this replica did
//                      not already know.
//   NO_NEW_EVIDENCE — the most recent attempt reached at least one peer,
//                      but every anchor offered back was already known.
//                      This is NOT "no evidence exists" — see this
//                      file's own docs/Roadmap.md entry.
//   UNAVAILABLE     — the requested discovery operation could not
//                      complete: either there was no authenticated peer
//                      to ask, or the attempt itself failed. This is
//                      NEVER a statement about whether evidence exists —
//                      only that this replica could not presently
//                      establish a discovery result.
//
// THIS IS UI STATE, NEVER DOMAIN STATE — mirroring application/
// ExternalAnchorCreationUiState.js's own restraint exactly. No value here
// is ever written onto a core/PublicationAnchor.js, stored in
// application/LocalPublicationAnchorCatalog.js, or persisted anywhere;
// it lives only in whatever ephemeral object a caller keeps for the
// lifetime of the page. Reopening the Publication Center always starts
// back at IDLE. See docs/Principles.md, "Discovery Is Not Verification,
// And 'No New Evidence' Is Not 'No Evidence' (0.8.16)."
export const PublicationEvidenceDiscoveryUiState = Object.freeze({
    IDLE: 'idle',
    DISCOVERING: 'discovering',
    DISCOVERED: 'discovered',
    NO_NEW_EVIDENCE: 'no_new_evidence',
    UNAVAILABLE: 'unavailable'
});
