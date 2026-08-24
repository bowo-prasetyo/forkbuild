// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// Names every way application/ExternalAnchorVerifier.js#verify() can
// end, in the same order its own pipeline checks them (see that file's
// own header) — the identical "name the difference structurally, not by
// convention" discipline application/PublicationResolutionOutcome.js
// already established in 0.7.1 for a DIFFERENT axis (retrieval
// availability). Here the axis is proof confidence: a caller needs to
// tell apart "this evidence is well-formed and genuinely signed" from
// "and its proof was independently checked against the external system
// it names."
//
//   VALID                    — every check passed, INCLUDING a supplied
//                               proofVerifier confirming the proof
//                               itself against the named external system
//   VALID_PROOF_UNVERIFIED   — the anchor is well-formed and genuinely
//                               signed, and its claimed contentHash/
//                               publicationId match what the caller
//                               expected, but NO proofVerifier was
//                               available for this anchorType — the
//                               proof itself was never independently
//                               checked. NEVER treated as a rejection —
//                               see this file's own header
//   PROOF_UNAVAILABLE        — a proofVerifier FOR this anchorType exists
//                               and was consulted, but could not
//                               PRESENTLY tell whether the proof is good:
//                               the external system was unreachable, the
//                               named record was not found (which may
//                               simply mean "not yet propagated"), or it
//                               exists but is not yet confirmed. Added in
//                               0.8.1, the moment the first anchorType
//                               this codebase can actually check against
//                               a real external system
//                               (anchoring/BitcoinOpReturnProofVerifier.js)
//                               shipped — a real network call can fail in
//                               ways a well-formed-but-unchecked anchor
//                               (VALID_PROOF_UNVERIFIED) never could.
//                               NEVER treated as a rejection either — see
//                               this file's own header
//   INVALID_ENVELOPE         — the PublicationAnchor record itself is
//                               malformed
//   INVALID_SIGNATURE        — the anchor's own signature does not
//                               verify against its claimed anchorIdentity
//   CONTENT_MISMATCH         — the anchor is genuinely signed, but its
//                               contentHash and/or publicationId do not
//                               match what the caller expected it to
//                               anchor
//   INVALID_PROOF            — a supplied proofVerifier reached a
//                               definite answer and rejected the proof:
//                               the named external system was reachable,
//                               and it does NOT back this contentHash
//
// A caller that only wants "is this trustworthy evidence, full stop"
// still treats anything but VALID as incomplete. A caller that merely
// wants "is this at least a genuine, on-topic attestation" accepts
// VALID_PROOF_UNVERIFIED and PROOF_UNAVAILABLE too — both are honest
// "couldn't fully confirm" outcomes, for two DIFFERENT reasons (no
// verifier plugged in at all, vs. a verifier that tried and could not
// presently reach a definite answer). Neither is ever silently promoted
// to VALID, and neither is ever silently downgraded to INVALID_PROOF —
// see docs/Principles.md, "A Proof Verifier Reports 'Cannot Presently
// Verify' Separately From 'Proof Is Wrong' (0.8.1)."
export const AnchorVerificationOutcome = Object.freeze({
    VALID: 'valid',
    VALID_PROOF_UNVERIFIED: 'valid-proof-unverified',
    PROOF_UNAVAILABLE: 'proof-unavailable',
    INVALID_ENVELOPE: 'invalid-envelope',
    INVALID_SIGNATURE: 'invalid-signature',
    CONTENT_MISMATCH: 'content-mismatch',
    INVALID_PROOF: 'invalid-proof'
});
