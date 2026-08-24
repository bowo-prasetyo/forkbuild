// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// Base adapter for anchorType-specific proof verification — the same
// "one small interface, several real backends" seam content/
// ContentStore.js already established for content RETRIEVAL (see its own
// header: "Future implementations: IPFSContentStore, ArweaveContentStore,
// HttpContentStore"), extended here to a different axis: checking a
// PublicationAnchor's `proof` against whatever real external system its
// `anchorType` names. Nothing in this file, or anything that extends it,
// ever imports core/PublicationAnchor.js or application/
// ExternalAnchorVerifier.js — a proofVerifier only ever sees the plain
// `proof` value and the caller-supplied context, never the anchor
// envelope itself.
//
// verify(proof, { publicationId, contentHash, locator }) resolves (sync
// return or Promise — application/ExternalAnchorVerifier.js always
// awaits it) to exactly one of:
//
//   { valid: true }
//
//   { valid: false, reason }
//       — a DEFINITE no: the named external system was reachable, and
//         it does NOT back this contentHash. Reported as
//         AnchorVerificationOutcome.INVALID_PROOF.
//
//   { valid: false, unavailable: true, reason }
//       — cannot PRESENTLY tell: the external system is unreachable, the
//         named record was not found (which may simply mean "not yet
//         propagated"), or it exists but is not yet confirmed. Reported
//         as AnchorVerificationOutcome.PROOF_UNAVAILABLE — NEVER treated
//         as a rejection. See docs/Principles.md, "A Proof Verifier
//         Reports 'Cannot Presently Verify' Separately From 'Proof Is
//         Wrong' (0.8.1)."
//
// Throwing is tolerated as a last resort — application/
// ExternalAnchorVerifier.js catches it and reports PROOF_UNAVAILABLE,
// never INVALID_PROOF — but every implementation in this codebase
// prefers returning the `unavailable` form explicitly wherever it can
// tell the difference itself. See anchoring/
// BitcoinOpReturnProofVerifier.js for the one concrete example.
export class ProofVerifier {
    // A short, stable string identifying which anchorType this plugin
    // checks — never invented by a caller, never a second key that could
    // drift from what the plugin actually verifies (see application/
    // ExternalProofVerifierRegistry.js#register()).
    get anchorType() { throw new Error('ProofVerifier.anchorType not implemented'); }

    verify(proof, context) { throw new Error('ProofVerifier.verify() not implemented'); }
}
