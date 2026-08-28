import { BaseTransactionInclusionObservationState } from './BaseTransactionInclusionObservationState.js';

// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// The label vocabulary for `application/
// BaseTransactionInclusionObservationState.js`, and the projection a
// single observation (`base/BaseTransactionInclusionObserver.js#observeInclusion()`,
// via `application/BaseTransactionInclusionObservationCoordinator.js`) or
// an accumulated sequence of them (`application/
// BaseTransactionInclusionObservationHistory.js`) is turned into a
// screen's worth of facts through — mirroring exactly how `application/
// BitcoinAnchorConfirmationObservationHistoryView.js` and `application/
// BitcoinAnchorConfirmationObservationHistoryDetailView.js` (0.8.56) turn
// their own identical vocabulary into a factual sentence, one chain over:
//
//   describeBaseTransactionInclusionStateLabel(state)
//     INCLUDED      -> "Transaction included"
//     NOT_INCLUDED  -> "Transaction not included"
//     UNAVAILABLE   -> "Inclusion status unavailable"
//
//   describeBaseTransactionInclusionStateShortLabel(state)
//     INCLUDED      -> "Included"
//     NOT_INCLUDED  -> "Not included"
//     UNAVAILABLE   -> "Unavailable"
//
//   describeBaseTransactionInclusionObservation(observation)
//     -> { txid, state, stateLabel, stateShortLabel, blockHash,
//          blockNumber, transactionIndex, confirmationCount, reason,
//          observedAt }
//        or `null` for a `null`/absent observation — no "Observe
//        Transaction" click has completed yet.
//
//   describeBaseTransactionInclusionObservationHistory(history)
//     -> { count, observations: [...] }, in the SAME order `history`
//        itself holds them — oldest first, exactly the order
//        `application/BaseTransactionInclusionObservationHistory.js#
//        appendBaseTransactionInclusionObservationHistoryEntry()` already
//        appends in. Never sorted, grouped, or reordered by state or
//        block.
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. Every field these
// functions return is carried through UNCHANGED from the observation
// itself — `txid`, `blockHash`, `blockNumber`, `transactionIndex`,
// `confirmationCount`, `reason`, and `observedAt` are never recomputed,
// re-derived, or filled in; `stateLabel`/`stateShortLabel` are the only
// new fields, and each adds a sentence for an existing `state`, never a
// new fact. Calling either function twice with byte-identical arguments
// returns a byte-identical result.
//
// AN OBSERVATION DESCRIBES THE NETWORK AT THE TIME IT WAS MADE, NOT THE
// CURRENT STATE OF THE TRANSACTION — inspection must not reinterpret an
// earlier observation in light of a later one, and must not turn "what
// was reported at 10:10" into "what is true now." No observation is ever
// ranked against another, and no `confidence`, `reliability`, `strength`,
// `security`, `mostRecent` (as a label ABOUT an entry, distinct from
// `application/BaseTransactionInclusionObservationHistory.js`'s own
// separate `latestBaseTransactionInclusionObservation()` query), or
// `reorganization`/`REORG_DETECTED` field is ever added here — comparing
// observations against one another is real, separately sized future work.
//
// NEVER INCLUDED PROMOTED TO CONFIRMED/SAFE/TRUSTED, AND NO successRate,
// confidence, trust, health, safe, OR recommended FIELD OF ANY KIND.
// `INCLUDED` names exactly one fact — Base's own network currently
// reports this transaction as part of a specific block, with this many
// confirmations — never a broader judgment about it. See `docs/
// Principles.md`, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict (0.8.57)."
//
// Pure and stateless: no constructor, no injected dependency, no network
// access, no caching, no history of its own.
export function describeBaseTransactionInclusionStateLabel(state) {
    switch (state) {
        case BaseTransactionInclusionObservationState.INCLUDED: return 'Transaction included';
        case BaseTransactionInclusionObservationState.NOT_INCLUDED: return 'Transaction not included';
        case BaseTransactionInclusionObservationState.UNAVAILABLE: return 'Inclusion status unavailable';
        default: return null;
    }
}

// A condensed counterpart to `describeBaseTransactionInclusionStateLabel()`'s
// own full sentence — the identical three states, in fewer words, for a
// row that has no room for "Inclusion status unavailable." Carries no
// meaning the full sentence does not already carry.
export function describeBaseTransactionInclusionStateShortLabel(state) {
    switch (state) {
        case BaseTransactionInclusionObservationState.INCLUDED: return 'Included';
        case BaseTransactionInclusionObservationState.NOT_INCLUDED: return 'Not included';
        case BaseTransactionInclusionObservationState.UNAVAILABLE: return 'Unavailable';
        default: return null;
    }
}

export function describeBaseTransactionInclusionObservation(observation) {
    if (!observation) return null;
    return Object.freeze({
        txid: observation.txid,
        state: observation.state,
        stateLabel: describeBaseTransactionInclusionStateLabel(observation.state),
        stateShortLabel: describeBaseTransactionInclusionStateShortLabel(observation.state),
        blockHash: observation.blockHash,
        blockNumber: observation.blockNumber,
        transactionIndex: observation.transactionIndex,
        confirmationCount: observation.confirmationCount,
        reason: observation.reason,
        observedAt: observation.observedAt
    });
}

export function describeBaseTransactionInclusionObservationHistory(history) {
    const raw = Array.isArray(history) ? history : [];
    const observations = raw.map((observation) => describeBaseTransactionInclusionObservation(observation)).filter(Boolean);
    return Object.freeze({ count: observations.length, observations: Object.freeze(observations) });
}
