// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
//
// Names every way application/ExternalAnchorVerifier.js#verify() can
// end, in the same order its own pipeline checks them (see that file's
// own header) — the identical "name the difference structurally, not by
// convention" discipline application/PublicationResolutionOutcome.js
// already established in 0.7.1 for a DIFFERENT axis (retrieval
// availability). Here the axis is proof confidence: a caller needs to
// tell apart "this evidence is well-formed and genuinely signed" from
// "and its proof was independently checked against the external system
// it names," because 0.8.0 ships no anchorType this codebase can
// actually check a proof against yet (see docs/Roadmap.md).
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
//   INVALID_ENVELOPE         — the PublicationAnchor record itself is
//                               malformed
//   INVALID_SIGNATURE        — the anchor's own signature does not
//                               verify against its claimed anchorIdentity
//   CONTENT_MISMATCH         — the anchor is genuinely signed, but its
//                               contentHash and/or publicationId do not
//                               match what the caller expected it to
//                               anchor
//   INVALID_PROOF            — a supplied proofVerifier rejected the
//                               proof outright
//
// A caller that only wants "is this trustworthy evidence, full stop"
// still treats anything but VALID as incomplete. A caller that merely
// wants "is this at least a genuine, on-topic attestation" — the only
// question 0.8.0 can actually answer, with no anchorType-specific
// proof-checking backend yet built — accepts VALID_PROOF_UNVERIFIED too.
// Neither is ever silently promoted to the other.
export const AnchorVerificationOutcome = Object.freeze({
    VALID: 'valid',
    VALID_PROOF_UNVERIFIED: 'valid-proof-unverified',
    INVALID_ENVELOPE: 'invalid-envelope',
    INVALID_SIGNATURE: 'invalid-signature',
    CONTENT_MISMATCH: 'content-mismatch',
    INVALID_PROOF: 'invalid-proof'
});
