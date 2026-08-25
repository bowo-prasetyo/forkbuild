// 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics.
//
// Names every state application/PublicationAnchorVerificationLifecycleView
// .js#deriveAnchorVerificationLifecycle() can return, for the same reason
// application/AnchorVerificationOutcome.js (0.8.1) and application/
// ExternalAnchorCreationUiState.js (0.8.11) each name their own axis
// structurally rather than by convention. This is deliberately a FOURTH,
// narrower axis than either: not "what did the proof verifier conclude"
// (AnchorVerificationOutcome), not "what should one Create-anchor button
// show" (ExternalAnchorCreationUiState), but "given every verification
// attempt this replica has made for one anchor so far, what should a
// person be told RIGHT NOW about whether it holds up." This value is
// never stored on core/PublicationAnchor.js, never persisted, and never
// treated as a new kind of domain truth — see this file's own
// deliberately un-domain-sounding names below, and docs/Principles.md,
// "A Verification Result Describes What Can Be Established Now; It Does
// Not Rewrite The Historical Claim Being Verified (0.8.12)."
//
//   NOT_VERIFIED     — no verification has ever been attempted for this
//                       anchor, in this replica's own session. Identical
//                       to application/PublicationEvidenceView.js's own
//                       existing "Not yet verified" case — this file adds
//                       no new meaning here, only a shared name for it.
//   VERIFIED         — the MOST RECENT attempt reached
//                       AnchorVerificationOutcome.VALID.
//   UNVERIFIED_PROOF — the MOST RECENT attempt reached
//                       AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED —
//                       genuinely signed evidence, its proof never
//                       independently checked (no proofVerifier for this
//                       anchorType was ever supplied).
//   UNAVAILABLE      — the MOST RECENT attempt reached
//                       AnchorVerificationOutcome.PROOF_UNAVAILABLE — the
//                       external system could not presently be reached,
//                       or has no definite answer yet. Deliberately the
//                       SAME state regardless of what any EARLIER attempt
//                       concluded — see this file's own `everValid` field
//                       below for why "was once VALID" is carried as a
//                       separate fact, never folded into a different
//                       state name of its own. Section 3 of this
//                       milestone's own design conversation is explicit
//                       that "verification unavailable" must never read
//                       as "invalid" or "revoked," no matter how it got
//                       there.
//   REJECTED         — the MOST RECENT attempt reached a DEFINITE
//                       negative: AnchorVerificationOutcome.INVALID_PROOF,
//                       CONTENT_MISMATCH, INVALID_SIGNATURE, or
//                       INVALID_ENVELOPE. These four remain individually
//                       distinguishable through the untouched `outcome`
//                       this state is always paired with (see
//                       application/
//                       PublicationAnchorVerificationLifecycleView.js) —
//                       REJECTED groups them only for the purpose of
//                       choosing a lifecycle state, never for display.
export const AnchorVerificationLifecycleState = Object.freeze({
    NOT_VERIFIED: 'not-verified',
    VERIFIED: 'verified',
    UNVERIFIED_PROOF: 'unverified-proof',
    UNAVAILABLE: 'unavailable',
    REJECTED: 'rejected'
});
