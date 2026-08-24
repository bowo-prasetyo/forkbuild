// 0.8.6 — Multi-Evidence Convergence & Evidence Relationship Derivation.
//
// Names the one structural relationship application/
// PublicationEvidenceConvergence.js can derive between a single anchor's
// own `contentHash` and an EXPECTED content hash a caller already knows
// (ordinarily a locally resolved publication's own
// `contentReference.hash` — see core/DecentralizedPublication.js). This is
// a purely structural comparison of two strings; it is never a
// verification outcome (see application/AnchorVerificationOutcome.js,
// which answers an entirely different question: "does this anchor's
// signature/proof hold up?") and it is never a verdict about which side
// of a mismatch is correct — see application/
// PublicationEvidenceConvergence.js's own header for why.
//
//   MATCHES_EXPECTED       — the anchor's own contentHash equals the
//                             expectedContentHash the caller supplied
//   DIFFERS_FROM_EXPECTED  — they differ. NEVER read as "this anchor is
//                             wrong" or "this anchor is malicious" — see
//                             core/PublicationAnchor.js's own header on
//                             why an anchor is always self-contained,
//                             independently checkable evidence, never
//                             something this codebase reconciles against
//                             a single "true" value
//   NOT_COMPARED            — the caller supplied no expectedContentHash
//                             at all (e.g. it has no locally resolved
//                             publication to compare against yet) — never
//                             collapsed into either of the above, since
//                             "no comparison was possible" is a different
//                             fact from "the comparison found a mismatch"
export const ContentBindingRelationship = Object.freeze({
    MATCHES_EXPECTED: 'matches-expected',
    DIFFERS_FROM_EXPECTED: 'differs-from-expected',
    NOT_COMPARED: 'not-compared'
});
