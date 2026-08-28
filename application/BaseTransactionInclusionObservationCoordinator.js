// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// `base/BaseTransactionInclusionObserver.js` already carries EVERY
// invariant this milestone exists to expose behind an explicit button — a
// fresh, uncached read that answers "does Base's own network report this
// txid as included RIGHT NOW," nothing more. Nothing about that class
// changes here — this coordinator is a deliberately thin wiring on top of
// it, mirroring EXACTLY the shape `application/
// BitcoinAnchorConfirmationCoordinator.js` (0.8.65) already established
// one chain over:
//
//   { broadcasted: true, txid }                    (a real BROADCASTED outcome)
//           │
//           │ explicit "Observe Transaction" click
//           ▼
//   BaseTransactionInclusionObservationCoordinator.observeInclusion()   (THIS FILE — new)
//           │
//           ▼
//   base/BaseTransactionInclusionObserver.js#observeInclusion()   (THIS
//           │                                                       MILESTONE,
//           │                                                       sibling
//           │                                                       file,
//           │                                                       UNCHANGED
//           │                                                       by this
//           │                                                       class)
//           ▼
//   { state, txid, blockHash, blockNumber, transactionIndex,
//     confirmationCount, reason, observedAt }
//
// NO NEW INCLUSION LOGIC BELONGS HERE, AND NONE IS ADDED. This class
// decides nothing about INCLUDED/NOT_INCLUDED/UNAVAILABLE — it calls the
// unchanged 0.8.96 observer exactly once per `observeInclusion()` call and
// returns its result completely unmodified.
//
// THE ONE THING THIS COORDINATOR EXISTS TO REFUSE: observing an arbitrary
// txid merely because it happens to be displayed somewhere on a page.
// Exactly as `application/BaseTransactionBroadcastCoordinator.js`'s own
// `broadcast()` requires `finalized === true` before it will ever touch
// `finalizedTransaction` — proof that its caller is handing over a real
// finalized artifact, not a value it invented — `observeInclusion()` below
// requires `broadcasted === true` before it will ever touch `txid`. A
// caller can only satisfy that by passing through the exact `{
// broadcasted, txid }` a real `application/
// BaseTransactionBroadcastCoordinator.js` BROADCASTED outcome carries —
// never a txid typed into a form, read from an unrelated transaction on
// the same screen, or otherwise reconstructed. This is a caller-contract
// check, thrown before the injected observer is ever consulted, exactly
// like the broadcast coordinator's own `finalized` check — never an
// observation outcome of its own.
//
// ONE OBSERVATION CALL PER EXPLICIT CLICK — NO RETRY, NO POLLING, NO
// AGGREGATION. A caller that wants a HISTORY of repeated observations
// keeps that history itself — see `application/
// BaseTransactionInclusionObservationHistory.js`, which this coordinator
// neither reads nor writes. This class answers "what did the network just
// report," once, per call, and nothing more.
//
// INCLUSION OBSERVATION IS NEVER TRIGGERED BY BROADCASTING. Reaching a
// BROADCASTED outcome never calls this coordinator automatically — see
// `application/BaseTransactionBroadcastState.js`'s own header, "THIS IS
// NOT CONFIRMATION." Only an explicit "Observe Transaction" click, at a UI
// layer, ever calls `observeInclusion()` below.
export class BaseTransactionInclusionObservationCoordinator {
    constructor({ baseTransactionInclusionObserver } = {}) {
        if (!baseTransactionInclusionObserver || typeof baseTransactionInclusionObserver.observeInclusion !== 'function') {
            throw new Error('BaseTransactionInclusionObservationCoordinator: a BaseTransactionInclusionObserver is required');
        }
        this._observer = baseTransactionInclusionObserver;
    }

    // Resolves to exactly what `base/BaseTransactionInclusionObserver.js#
    // observeInclusion()` itself returns — `{ state, txid, blockHash,
    // blockNumber, transactionIndex, confirmationCount, reason,
    // observedAt }` — never re-derived, re-shaped, or aggregated.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // observer is ever consulted — `broadcasted` is not `true`, or `txid`
    // is missing — see this file's own header. Any throw from the injected
    // observer itself never happens: `base/BaseTransactionInclusionObserver.js`
    // only ever throws for a malformed `txid`, which by this class's own
    // contract above can only happen if this coordinator's caller passed a
    // non-broadcast artifact through — again a caller-contract violation,
    // not a network outcome.
    async observeInclusion({ broadcasted, txid } = {}) {
        if (broadcasted !== true) {
            throw new Error('BaseTransactionInclusionObservationCoordinator: broadcasted must be true — broadcast a transaction before ever requesting inclusion observation');
        }
        if (typeof txid !== 'string' || !txid) {
            throw new Error('BaseTransactionInclusionObservationCoordinator: txid is required — pass the exact txid of a BROADCASTED outcome, never an arbitrary displayed value');
        }

        return this._observer.observeInclusion(txid);
    }
}
