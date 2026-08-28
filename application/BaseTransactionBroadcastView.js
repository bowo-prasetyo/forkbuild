import { BaseTransactionBroadcastState } from './BaseTransactionBroadcastState.js';

const STATE_LABELS = {
    [BaseTransactionBroadcastState.IDLE]: 'Not yet broadcast',
    [BaseTransactionBroadcastState.BROADCASTING]: 'Broadcasting transaction…',
    [BaseTransactionBroadcastState.BROADCASTED]: 'Transaction broadcasted',
    [BaseTransactionBroadcastState.REJECTED]: 'Transaction rejected',
    [BaseTransactionBroadcastState.UNAVAILABLE]: 'Broadcast unavailable',
    [BaseTransactionBroadcastState.FAILED]: 'Broadcast failed'
};

// 0.8.95 — Explicit Base Transaction Broadcast.
//
// The label vocabulary for `application/BaseTransactionBroadcastState.js`,
// and the projection `application/BaseTransactionBroadcastCoordinator.js`'s
// own outcome is turned into a screen's worth of facts through — mirroring
// exactly how `application/BitcoinAnchorBroadcastView.js` (0.8.64) turns
// its own vocabulary into a factual sentence, one chain over.
//
//   describeBaseTransactionBroadcastStateLabel(state)
//     IDLE         -> "Not yet broadcast"
//     BROADCASTING -> "Broadcasting transaction…"
//     BROADCASTED  -> "Transaction broadcasted"
//     REJECTED     -> "Transaction rejected"
//     UNAVAILABLE  -> "Broadcast unavailable"
//     FAILED       -> "Broadcast failed"
//
//   describeBaseTransactionBroadcast(outcome)
//     -> { state, stateLabel, reason, txid }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like `application/
// BaseTransactionBroadcastCoordinator.js#broadcast()`'s own return value —
// a caller's own reactive mirror of it, copied wholesale after every
// explicit "Broadcast Transaction" click, works identically to the real
// thing, the same restraint every other `*View.js` file in this codebase
// already holds toward its own injected collaborator's result.
//
// `txid` IS THE NETWORK'S OWN RETURNED HASH, NEVER RE-DERIVED HERE.
// Exactly as `base/BaseTransactionBroadcaster.js`'s own header explains —
// a deliberate difference from the Bitcoin boundary this milestone
// otherwise mirrors — this view exposes only whatever `outcome.txid` the
// coordinator itself already settled on; it computes nothing and
// re-checks nothing.
//
// NEVER BROADCASTED PROMOTED TO CONFIRMED. This view carries no
// `confirmed`, `confirmations`, `blockNumber`, or `blockHash` field of any
// kind — those remain a separate, later concern (docs/Roadmap.md, 0.8.96),
// asked only by a separate, later, explicit confirmation-observation
// action. See `base/BaseTransactionBroadcaster.js`'s own header and
// `application/BaseTransactionBroadcastState.js`'s own header, "THIS IS
// NOT CONFIRMATION," both held here identically.
//
// NO successRate, confidence, trust, health, safe, OR recommended FIELD OF
// ANY KIND. `BROADCASTED` names exactly one fact — the RPC endpoint
// accepted this transaction for broadcast — never a broader judgment
// about it. See `docs/Principles.md`, "The UI Displays Observations; It
// Does Not Turn Them Into A Verdict (0.8.57)."
//
// Pure and stateless: no constructor, no network access, no history of its
// own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBaseTransactionBroadcastStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBaseTransactionBroadcast(outcome) {
    const state = outcome ? outcome.state : BaseTransactionBroadcastState.IDLE;

    return Object.freeze({
        state,
        stateLabel: describeBaseTransactionBroadcastStateLabel(state),
        reason: outcome ? outcome.reason : null,
        txid: outcome ? outcome.txid : null
    });
}
