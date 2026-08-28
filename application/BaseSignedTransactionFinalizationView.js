import { BaseSignedTransactionFinalizationState } from './BaseSignedTransactionFinalizationState.js';

const STATE_LABELS = {
    [BaseSignedTransactionFinalizationState.IDLE]: 'Not yet finalized',
    [BaseSignedTransactionFinalizationState.FINALIZING]: 'Verifying signature…',
    [BaseSignedTransactionFinalizationState.FINALIZED]: 'Transaction finalized',
    [BaseSignedTransactionFinalizationState.INVALID_SIGNATURE]: 'Signature did not verify',
    [BaseSignedTransactionFinalizationState.UNAVAILABLE]: 'Finalization unavailable',
    [BaseSignedTransactionFinalizationState.FAILED]: 'Finalization failed'
};

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// The label vocabulary for `application/
// BaseSignedTransactionFinalizationState.js`, and the projection
// `application/BaseSignedTransactionFinalizationCoordinator.js`'s own
// outcome is turned into a screen's worth of facts through — mirroring
// exactly how `application/BitcoinAnchorSignedPsbtFinalizationView.js`
// (0.8.63) turns its own vocabulary into a factual sentence, one chain
// over.
//
//   describeBaseSignedTransactionFinalizationStateLabel(state)
//     IDLE              -> "Not yet finalized"
//     FINALIZING        -> "Verifying signature…"
//     FINALIZED         -> "Transaction finalized"
//     INVALID_SIGNATURE -> "Signature did not verify"
//     UNAVAILABLE       -> "Finalization unavailable"
//     FAILED            -> "Finalization failed"
//
//   describeBaseSignedTransactionFinalization(outcome)
//     -> { state, stateLabel, reason, from, transactionHash, hasFinalizedTransaction }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like `application/
// BaseSignedTransactionFinalizationCoordinator.js#finalize()`'s own return
// value — a caller's own reactive mirror of it, copied wholesale after
// every explicit "Verify & Finalize Transaction" click, works identically
// to the real thing.
//
// "VERIFIED" NAMES A REAL CRYPTOGRAPHIC FACT HERE, NEVER A BROADER
// SECURITY JUDGMENT. Unlike `application/BaseReviewedSigningView.js`'s own
// header, which forbids implying verification because SIGNED alone never
// means it, THIS view's whole reason for existing is the boundary that
// actually performs that verification — so `state === FINALIZED` IS,
// precisely and only, "the signed bytes cryptographically match the
// reviewed plan, signed by the exact account it names." This view still
// carries no `safe`, `secure`, `trusted`, `ready`, or `recommended` field
// of any kind — those would each claim something broader than the one
// narrow cryptographic fact this boundary actually checked. See
// `docs/Principles.md`, "Signing Authorizes The Exact Reviewed Plan; It
// Does Not Reconstruct Or Modify It (0.8.93)," extended here one stage
// later: this view is the fact that finally closes the gap that
// milestone's own SIGNED left open.
//
// `from`/`transactionHash` ARE SHOWN; THE RAW SIGNED/FINALIZED BYTES ARE
// NOT. Mirrors `application/BaseReviewedSigningView.js`'s own restraint
// toward `rawTransaction` (`hasRawTransaction`, never the bytes
// themselves) one stage earlier: `hasFinalizedTransaction` names whether a
// finalized artifact exists at all, never the artifact's own
// `rawTransaction`/`data` bytes. `from` and `transactionHash` are shown
// because they are exactly the two NEW facts this boundary establishes
// that a person could not already see on the review screen — the
// cryptographically recovered signer, and the transaction's own hash —
// never a courtesy re-display of fields the 0.8.92 review already showed.
//
// Pure and stateless: no constructor, no network access, no history of
// its own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBaseSignedTransactionFinalizationStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBaseSignedTransactionFinalization(outcome) {
    const state = outcome ? outcome.state : BaseSignedTransactionFinalizationState.IDLE;
    const finalizedTransaction = outcome ? outcome.finalizedTransaction : null;

    return Object.freeze({
        state,
        stateLabel: describeBaseSignedTransactionFinalizationStateLabel(state),
        reason: outcome ? outcome.reason : null,
        from: finalizedTransaction ? finalizedTransaction.from : null,
        transactionHash: finalizedTransaction ? finalizedTransaction.transactionHash : null,
        hasFinalizedTransaction: Boolean(finalizedTransaction)
    });
}
