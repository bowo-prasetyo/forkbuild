import { BitcoinAnchorBroadcastState } from './BitcoinAnchorBroadcastState.js';

const STATE_LABELS = {
    [BitcoinAnchorBroadcastState.IDLE]: 'Not yet broadcast',
    [BitcoinAnchorBroadcastState.BROADCASTING]: 'Broadcasting transaction…',
    [BitcoinAnchorBroadcastState.BROADCASTED]: 'Transaction broadcasted',
    [BitcoinAnchorBroadcastState.REJECTED]: 'Transaction rejected',
    [BitcoinAnchorBroadcastState.UNAVAILABLE]: 'Broadcast unavailable',
    [BitcoinAnchorBroadcastState.FAILED]: 'Broadcast failed'
};

// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
//
// The label vocabulary for application/BitcoinAnchorBroadcastState.js, and
// the projection application/BitcoinAnchorBroadcastCoordinator.js's own
// outcome is turned into a screen's worth of facts through — mirroring
// exactly how application/BitcoinAnchorSignedPsbtFinalizationView.js
// (0.8.63) turns application/BitcoinAnchorSignedPsbtFinalizationState.js's
// own vocabulary into a factual sentence, one domain later in the same
// pipeline.
//
//   describeBitcoinAnchorBroadcastStateLabel(state)
//     IDLE         -> "Not yet broadcast"
//     BROADCASTING -> "Broadcasting transaction…"
//     BROADCASTED  -> "Transaction broadcasted"
//     REJECTED     -> "Transaction rejected"
//     UNAVAILABLE  -> "Broadcast unavailable"
//     FAILED       -> "Broadcast failed"
//
//   describeBitcoinAnchorBroadcast(outcome)
//     -> { state, stateLabel, reason, txid }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like application/BitcoinAnchorBroadcastCoordinator.js#
// broadcast()'s own return value — a caller's own reactive mirror of it,
// copied wholesale after every explicit "Broadcast Transaction" click,
// works identically to the real thing, the same restraint every other
// `*View.js` file in this codebase already holds toward its own injected
// collaborator's result.
//
// `txid` IS NEVER RE-DERIVED HERE. Exactly as anchoring/
// BitcoinAnchorTransactionBroadcaster.js's own header requires — "the
// reported txid is never taken from the broadcaster's own response" — this
// view exposes only whatever `outcome.txid` the coordinator itself already
// settled on; it computes nothing and re-checks nothing.
//
// NEVER BROADCASTED PROMOTED TO CONFIRMED. This view carries no
// `confirmed`, `confirmations`, `blockHeight`, or `blockHash` field of any
// kind — those remain application/BitcoinAnchorConfirmationState.js's own,
// separate concern (0.8.54), asked only by a separate, later, explicit
// "Observe Confirmation" action. See anchoring/
// BitcoinAnchorTransactionBroadcaster.js's own header and application/
// BitcoinAnchorPublicationLifecycleState.js's own header, "THIS IS NOT
// CONFIRMATION," both unchanged and held here identically.
//
// NO successRate, confidence, trust, health, safe, OR recommended FIELD OF
// ANY KIND. `BROADCASTED` names exactly one fact — the broadcaster
// accepted this transaction for broadcast — never a broader judgment about
// it. See docs/Principles.md, "The UI Displays Observations; It Does Not
// Turn Them Into A Verdict (0.8.57)."
//
// Pure and stateless: no constructor, no network access, no history of its
// own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBitcoinAnchorBroadcastStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBitcoinAnchorBroadcast(outcome) {
    const state = outcome ? outcome.state : BitcoinAnchorBroadcastState.IDLE;

    return Object.freeze({
        state,
        stateLabel: describeBitcoinAnchorBroadcastStateLabel(state),
        reason: outcome ? outcome.reason : null,
        txid: outcome ? outcome.txid : null
    });
}
