import { BitcoinAnchorConfirmationState } from './BitcoinAnchorConfirmationState.js';

// 0.8.56 — Bitcoin Anchor Confirmation Observation History & Per-Observation
// Inspection.
//
// application/BitcoinAnchorConfirmationObservationHistory.js turns
// anchoring/BitcoinAnchorConfirmationObserver.js's own repeated, fresh
// `observeConfirmation()` reads into an accumulated SEQUENCE. This file
// turns that sequence into the plain, chronological narration a "Bitcoin
// Anchor Confirmation History" disclosure shows — mirroring application/
// SnapshotMaterializationHistoryView.js (0.8.38)'s own identical shape
// exactly, one domain over:
//
//   describeBitcoinAnchorConfirmationStateLabel(state)
//     CONFIRMED      → "Transaction confirmed"
//     NOT_CONFIRMED  → "Transaction not confirmed"
//     UNAVAILABLE    → "Confirmation status unavailable"
//
//   describeBitcoinAnchorConfirmationObservationHistory(history)
//     → { count, observations: [{ txid, state, stateLabel, blockHash,
//          blockHeight, confirmationCount, reason, observedAt }, ...] }
//     in the SAME order `history` itself holds them — oldest first,
//     exactly the order application/
//     BitcoinAnchorConfirmationObservationHistory.js#appendBitcoinAnchorConfirmationObservationHistoryEntry()
//     already appends in. This function never sorts, groups, or reorders
//     by state or block.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated one domain over from
// application/SnapshotMaterializationHistoryView.js's own: the vocabulary
// stays factual. "Transaction confirmed," "Transaction not confirmed," and
// "Confirmation status unavailable" each name what the network reported,
// and nothing else — never "reliable," "healthy," "trusted," "strong," or
// any wording that reads as a verdict rather than a report. A history
// showing three CONFIRMED entries in a row is not thereby described as
// "well confirmed" or "secure" — the count is a historical fact, never
// evidence this file scores or ranks. See docs/Principles.md,
// "Confirmation Observation Reports What Is; It Does Not Decide What It
// Means (0.8.54)," held here one layer up, for a sequence rather than a
// single reading.
//
// `history`: an application/BitcoinAnchorConfirmationObservationHistory.js
// -shaped array of anchoring/BitcoinAnchorConfirmationObserver.js records
// (or null/empty — no "Check Confirmation" click has completed for this
// entry, in this browsing session). Every field this function returns is
// carried through UNCHANGED from the observation itself — `blockHash`,
// `blockHeight`, `confirmationCount`, `reason`, and `observedAt` are never
// recomputed, re-derived, or filled in; only `stateLabel` is new, and it
// adds a sentence for an existing `state`, never a new fact.
export function describeBitcoinAnchorConfirmationStateLabel(state) {
    switch (state) {
        case BitcoinAnchorConfirmationState.CONFIRMED: return 'Transaction confirmed';
        case BitcoinAnchorConfirmationState.NOT_CONFIRMED: return 'Transaction not confirmed';
        case BitcoinAnchorConfirmationState.UNAVAILABLE: return 'Confirmation status unavailable';
        default: return null;
    }
}

export function describeBitcoinAnchorConfirmationObservationHistory(history) {
    const observations = (Array.isArray(history) ? history : []).map((observation) => ({
        txid: observation.txid,
        state: observation.state,
        stateLabel: describeBitcoinAnchorConfirmationStateLabel(observation.state),
        blockHash: observation.blockHash,
        blockHeight: observation.blockHeight,
        confirmationCount: observation.confirmationCount,
        reason: observation.reason,
        observedAt: observation.observedAt
    }));
    return { count: observations.length, observations };
}
