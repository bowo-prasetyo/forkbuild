// 0.8.55 — Bitcoin Anchor Proof Reconciliation.
//
// application/BitcoinAnchorConfirmationState.js (0.8.54) names what the
// Bitcoin network currently reports about a transaction's own inclusion
// in the chain. This file names the SEPARATE question anchoring/
// BitcoinOpReturnProofVerifier.js has answered since 0.8.1, but which
// this codebase has, until now, only ever expressed as a generic
// `{ valid, unavailable, reason }` shape — never a named vocabulary of
// its own. The identical "name the difference structurally, not by
// convention" discipline held here, one domain over, for the single
// question this milestone's reconciliation needs distinguished on its
// own terms:
//
//   HASH_MATCH    — the named transaction was reachable, and some
//                   OP_RETURN output of it carries the anchor's own
//                   claimed contentHash, as raw hex.
//   HASH_MISMATCH — the named transaction (or the proof naming it) was
//                   reachable and DEFINITELY does not back the claim:
//                   a structurally invalid proof (missing/malformed
//                   txid, a network mismatch), or a confirmed
//                   transaction whose OP_RETURN outputs simply do not
//                   carry the claimed hash. A REAL, definite rejection —
//                   never conflated with UNAVAILABLE below.
//   UNAVAILABLE   — this observation cannot PRESENTLY tell whether the
//                   proof holds: the block explorer was unreachable, the
//                   transaction was not found (which may simply mean it
//                   has not yet propagated), or it exists but is not yet
//                   confirmed. Retrying later may reach a different,
//                   more informative answer.
//
// NEVER A SCORE, A CONFIDENCE PERCENTAGE, OR A "STRENGTH" RATING, and
// NEVER MERGED WITH application/BitcoinAnchorConfirmationState.js's own
// vocabulary. A transaction can be CONFIRMED and simultaneously
// HASH_MISMATCH — that combination is not an error this vocabulary
// collapses away, it is exactly the fact application/
// BitcoinAnchorProofReconciliationView.js exists to surface honestly. See
// docs/Roadmap.md, "0.8.55 — Bitcoin Anchor Proof Reconciliation."
export const BitcoinAnchorContentProofState = Object.freeze({
    HASH_MATCH: 'hash-match',
    HASH_MISMATCH: 'hash-mismatch',
    UNAVAILABLE: 'unavailable'
});

export function isValidBitcoinAnchorContentProofState(value) {
    return Object.values(BitcoinAnchorContentProofState).includes(value);
}
