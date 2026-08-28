import { BaseReviewedSigningState } from './BaseReviewedSigningState.js';

const STATE_LABELS = {
    [BaseReviewedSigningState.IDLE]: 'Not yet signed',
    [BaseReviewedSigningState.SIGNING]: 'Waiting for wallet…',
    [BaseReviewedSigningState.SIGNED]: 'Wallet returned a signed transaction',
    [BaseReviewedSigningState.DECLINED]: 'Signing declined',
    [BaseReviewedSigningState.UNAVAILABLE]: 'Wallet unavailable',
    [BaseReviewedSigningState.FAILED]: 'Signing failed'
};

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// The label vocabulary for `application/BaseReviewedSigningState.js`, and
// the projection `application/BaseReviewedSigningCoordinator.js`'s own
// outcome is turned into a screen's worth of facts through — mirroring
// `application/BitcoinAnchorReviewedSigningView.js`'s own header (0.8.62)
// exactly, one chain over.
//
//   describeBaseReviewedSigningStateLabel(state)
//     IDLE        -> "Not yet signed"
//     SIGNING     -> "Waiting for wallet…"
//     SIGNED      -> "Wallet returned a signed transaction"
//     DECLINED    -> "Signing declined"
//     UNAVAILABLE -> "Wallet unavailable"
//     FAILED      -> "Signing failed"
//
//   describeBaseReviewedSigning(outcome)
//     -> { state, stateLabel, reason, hasRawTransaction }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like `application/BaseReviewedSigningCoordinator.js#
// sign()`'s own return value (`{ state, rawTransaction, reason }`) — a
// caller's own reactive mirror of it, copied wholesale after every
// explicit "Sign Reviewed Transaction" click, works identically to the
// real thing.
//
// NEVER THE RAW SIGNED TRANSACTION ITSELF. This view deliberately never
// exposes `outcome.rawTransaction` — the raw signed bytes are held by the
// caller's own reactive state for whatever explicit step comes next
// (0.8.94's own inspection), never rendered as a screen fact here.
// `hasRawTransaction` — whether a signed artifact exists at all, not the
// artifact itself — is this view's own equivalent fact for a SIGNED
// outcome, mirroring `application/BitcoinAnchorReviewedSigningView.js`'s
// own `signedInputCount` restraint one chain over.
//
// NEVER A VERDICT. This view carries no `valid`, `safe`, `verified`,
// `recommended`, or `trusted` field of any kind. A SIGNED result names
// only that a wallet returned SOME rawTransaction for a plan that still
// matched its own review — never that ForkBuild has inspected or
// cryptographically verified it. See `application/
// BaseReviewedSigningState.js`'s own header, "SIGNED IS NOT VERIFIED, AND
// NOT YET EVEN STRUCTURALLY INSPECTED."
//
// Pure and stateless: no constructor, no network access, no history of its
// own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBaseReviewedSigningStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBaseReviewedSigning(outcome) {
    const state = outcome ? outcome.state : BaseReviewedSigningState.IDLE;

    return Object.freeze({
        state,
        stateLabel: describeBaseReviewedSigningStateLabel(state),
        reason: outcome ? outcome.reason : null,
        hasRawTransaction: Boolean(outcome && outcome.rawTransaction)
    });
}
