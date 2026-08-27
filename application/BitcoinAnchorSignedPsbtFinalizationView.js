import { BitcoinAnchorSignedPsbtFinalizationState } from './BitcoinAnchorSignedPsbtFinalizationState.js';

const STATE_LABELS = {
    [BitcoinAnchorSignedPsbtFinalizationState.IDLE]: 'Not yet finalized',
    [BitcoinAnchorSignedPsbtFinalizationState.FINALIZING]: 'Verifying signature…',
    [BitcoinAnchorSignedPsbtFinalizationState.FINALIZED]: 'Transaction finalized',
    [BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE]: 'Signature did not verify',
    [BitcoinAnchorSignedPsbtFinalizationState.UNAVAILABLE]: 'Finalization unavailable',
    [BitcoinAnchorSignedPsbtFinalizationState.FAILED]: 'Finalization failed'
};

// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
//
// The label vocabulary for application/
// BitcoinAnchorSignedPsbtFinalizationState.js, and the projection
// application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js's own
// outcome is turned into a screen's worth of facts through — mirroring
// exactly how application/BitcoinAnchorReviewedSigningView.js (0.8.62)
// turns application/BitcoinAnchorReviewedSigningState.js's own vocabulary
// into a factual sentence, one domain later in the same pipeline.
//
//   describeBitcoinAnchorSignedPsbtFinalizationStateLabel(state)
//     IDLE              -> "Not yet finalized"
//     FINALIZING        -> "Verifying signature…"
//     FINALIZED         -> "Transaction finalized"
//     INVALID_SIGNATURE -> "Signature did not verify"
//     UNAVAILABLE       -> "Finalization unavailable"
//     FAILED            -> "Finalization failed"
//
//   describeBitcoinAnchorSignedPsbtFinalization(outcome)
//     -> { state, stateLabel, reason, verifiedInputCount, txid, rawTransactionHex }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js#finalize()'s own return
// value — a caller's own reactive mirror of it, copied wholesale after
// every explicit "Verify & Finalize Transaction" click, works identically
// to the real thing, the same restraint every other `*View.js` file in
// this codebase already holds toward its own injected collaborator's
// result.
//
// "VERIFIED" NAMES A REAL CRYPTOGRAPHIC FACT HERE, NEVER A BROADER
// SECURITY JUDGMENT. Unlike application/BitcoinAnchorReviewedSigningView.js's
// own header, which forbids a `verified` field because SIGNED alone never
// implies it, THIS view's whole reason for existing is the boundary that
// actually performs that verification — so `state === FINALIZED` IS,
// precisely and only, "the signature verified." This view still carries
// no `safe`, `secure`, `trusted`, or `recommended` field of any kind —
// those would each claim something broader than the one narrow
// cryptographic fact this boundary actually checked. See docs/
// Principles.md, "Signing Material Is Not Yet A Signature Until It
// Verifies (0.8.51)," and application/BitcoinAnchorReviewedSigningState.js's
// own header, "SIGNED IS NOT VERIFIED" — this view is the fact that
// finally closes that gap, and nothing more.
//
// Pure and stateless: no constructor, no network access, no history of its
// own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBitcoinAnchorSignedPsbtFinalizationStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBitcoinAnchorSignedPsbtFinalization(outcome) {
    const state = outcome ? outcome.state : BitcoinAnchorSignedPsbtFinalizationState.IDLE;

    return Object.freeze({
        state,
        stateLabel: describeBitcoinAnchorSignedPsbtFinalizationStateLabel(state),
        reason: outcome ? outcome.reason : null,
        verifiedInputCount: outcome ? outcome.verifiedInputCount : null,
        txid: outcome ? outcome.txid : null,
        rawTransactionHex: outcome && outcome.rawTransaction ? outcome.rawTransaction.hex : null
    });
}
