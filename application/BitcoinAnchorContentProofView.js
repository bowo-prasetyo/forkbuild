import { BitcoinAnchorContentProofState } from './BitcoinAnchorContentProofState.js';

// 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI.
//
// application/BitcoinAnchorConfirmationObservationHistoryView.js's own
// `describeBitcoinAnchorConfirmationStateLabel()` (0.8.54/0.8.56) already
// turns `application/BitcoinAnchorConfirmationState.js`'s vocabulary into a
// factual sentence. This file is the identical, missing counterpart for
// `application/BitcoinAnchorContentProofState.js` (0.8.55) — the one small
// piece 0.8.55's own reconciliation view never needed, because nothing
// before this milestone ever put a content-proof state on a screen:
//
//   describeBitcoinAnchorContentProofStateLabel(state)
//     HASH_MATCH    -> "Hash matches OP_RETURN"
//     HASH_MISMATCH -> "Hash does not match OP_RETURN"
//     UNAVAILABLE   -> "Content proof unavailable"
//
//   describeBitcoinAnchorContentProof(contentProof)
//     -> { state, stateLabel, contentHash, reason, observedAt }, every
//        field carried through UNCHANGED from `contentProof` itself
//        (application/BitcoinAnchorProofReconciliationView.js's own
//        `contentProof` shape) except `stateLabel`, which is new.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated one domain over from
// application/BitcoinAnchorConfirmationObservationHistoryView.js's own: the
// vocabulary stays factual. "Hash matches OP_RETURN" and "Hash does not
// match OP_RETURN" each name what `anchoring/BitcoinOpReturnProofVerifier.js`
// reported, and nothing else — never "valid," "trustworthy," "healthy," or
// any wording that reads as a verdict. And, restated from application/
// BitcoinAnchorProofReconciliationView.js's own header: this file NEVER
// reads `application/BitcoinAnchorConfirmationState.js`'s own vocabulary,
// and never combines the two into one label — a caller showing both simply
// calls both describe functions and places their results side by side. See
// docs/Principles.md, "Reconciliation Composes Independent Observations; It
// Does Not Score Them (0.8.55)," held here one layer up, for the screen
// that finally displays it.
//
// Pure and stateless: no constructor, no injected dependency, no network
// access, no caching. Calling either function twice with byte-identical
// arguments returns a byte-identical result.
export function describeBitcoinAnchorContentProofStateLabel(state) {
    switch (state) {
        case BitcoinAnchorContentProofState.HASH_MATCH: return 'Hash matches OP_RETURN';
        case BitcoinAnchorContentProofState.HASH_MISMATCH: return 'Hash does not match OP_RETURN';
        case BitcoinAnchorContentProofState.UNAVAILABLE: return 'Content proof unavailable';
        default: return null;
    }
}

export function describeBitcoinAnchorContentProof(contentProof) {
    if (!contentProof) return null;
    return Object.freeze({
        state: contentProof.state,
        stateLabel: describeBitcoinAnchorContentProofStateLabel(contentProof.state),
        contentHash: contentProof.contentHash,
        reason: contentProof.reason,
        observedAt: contentProof.observedAt
    });
}
