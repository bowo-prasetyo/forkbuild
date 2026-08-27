import { BitcoinAnchorReviewedSigningState } from './BitcoinAnchorReviewedSigningState.js';

const STATE_LABELS = {
    [BitcoinAnchorReviewedSigningState.IDLE]: 'Not yet signed',
    [BitcoinAnchorReviewedSigningState.SIGNING]: 'Waiting for wallet…',
    [BitcoinAnchorReviewedSigningState.SIGNED]: 'Wallet returned a signed PSBT',
    [BitcoinAnchorReviewedSigningState.DECLINED]: 'Signing declined',
    [BitcoinAnchorReviewedSigningState.UNAVAILABLE]: 'Wallet unavailable',
    [BitcoinAnchorReviewedSigningState.FAILED]: 'Signing failed'
};

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// The label vocabulary for application/BitcoinAnchorReviewedSigningState.js,
// and the projection application/BitcoinAnchorReviewedSigningCoordinator.js's
// own outcome is turned into a screen's worth of facts through — mirroring
// exactly how application/BitcoinAnchorTransactionConstructionView.js
// (0.8.61) turns application/BitcoinAnchorTransactionConstructionState.js's
// own vocabulary into a factual sentence, one domain later in the pipeline.
//
//   describeBitcoinAnchorReviewedSigningStateLabel(state)
//     IDLE        -> "Not yet signed"
//     SIGNING     -> "Waiting for wallet…"
//     SIGNED      -> "Wallet returned a signed PSBT"
//     DECLINED    -> "Signing declined"
//     UNAVAILABLE -> "Wallet unavailable"
//     FAILED      -> "Signing failed"
//
//   describeBitcoinAnchorReviewedSigning(outcome)
//     -> { state, stateLabel, reason, signedInputCount }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like application/BitcoinAnchorReviewedSigningCoordinator.js#
// sign()'s own return value (`{ state, psbt, signedInputs, reason }`) — a
// caller's own reactive mirror of it, copied wholesale after every explicit
// "Sign Reviewed Transaction" click, works identically to the real thing,
// the same restraint every other `*View.js` file in this codebase already
// holds toward its own injected collaborator's result.
//
// NEVER THE RAW SIGNED PSBT ITSELF. This view deliberately never exposes
// `outcome.psbt` — the raw signed bytes are held by the caller's own
// reactive state for whatever explicit step comes next (inspecting or
// finalizing them), never rendered as a screen fact here, exactly as
// application/BitcoinAnchorTransactionReviewView.js's own `unsignedPsbtHex`
// is the ONE raw-bytes exception this codebase's view layer has ever made,
// and only because a person reviewing a transaction needs to see precisely
// what they are about to authorize. `signedInputCount` — how many inputs
// carry recognized signing material, not the material itself — is this
// view's own equivalent fact for a SIGNED outcome.
//
// NEVER A VERDICT. This view carries no `valid`, `safe`, `verified`,
// `finalized`, `recommended`, or `trusted` field of any kind. A SIGNED
// result names only that a wallet returned something that independently
// inspects as carrying signing material — never that ForkBuild has
// cryptographically verified it, and never a claim that it should be
// finalized or broadcast. See application/
// BitcoinAnchorReviewedSigningState.js's own header, "SIGNED IS NOT
// VERIFIED."
//
// Pure and stateless: no constructor, no network access, no history of its
// own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBitcoinAnchorReviewedSigningStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBitcoinAnchorReviewedSigning(outcome) {
    const state = outcome ? outcome.state : BitcoinAnchorReviewedSigningState.IDLE;
    const signedInputs = outcome ? outcome.signedInputs : null;

    return Object.freeze({
        state,
        stateLabel: describeBitcoinAnchorReviewedSigningStateLabel(state),
        reason: outcome ? outcome.reason : null,
        signedInputCount: signedInputs ? signedInputs.length : null
    });
}
