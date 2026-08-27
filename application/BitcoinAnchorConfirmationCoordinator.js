// 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
//
// anchoring/BitcoinAnchorConfirmationObserver.js (0.8.54) already carries
// EVERY invariant this milestone exists to expose behind an explicit
// button — a fresh, uncached read that answers "what does the network
// report about this txid RIGHT NOW," nothing more. Nothing about that
// class changes here — this coordinator is a deliberately thin wiring on
// top of it, mirroring EXACTLY the shape application/
// BitcoinAnchorBroadcastCoordinator.js (0.8.64) already established one
// stage earlier for anchoring/BitcoinAnchorTransactionBroadcaster.js:
//
//   { broadcasted: true, txid }                    (a real BROADCASTED outcome)
//           │
//           │ explicit "Observe Confirmation" click
//           ▼
//   BitcoinAnchorConfirmationCoordinator.observeConfirmation()   (THIS FILE — new)
//           │
//           ▼
//   anchoring/BitcoinAnchorConfirmationObserver.js#observeConfirmation()   (0.8.54,
//           │                                                               UNCHANGED)
//           ▼
//   { state, observedAt, txid, blockHash, blockHeight, confirmationCount, reason }
//
// NO NEW CONFIRMATION LOGIC BELONGS HERE, AND NONE IS ADDED. This class
// decides nothing about CONFIRMED/NOT_CONFIRMED/UNAVAILABLE — it calls the
// unchanged 0.8.54 observer exactly once per `observeConfirmation()` call
// and returns its result completely unmodified.
//
// THE ONE THING THIS COORDINATOR EXISTS TO REFUSE: observing an arbitrary
// txid merely because it happens to be displayed somewhere on a page.
// Exactly as application/BitcoinAnchorBroadcastCoordinator.js's own
// `broadcast()` requires `finalized === true` before it will ever touch
// `txid`/`rawTransaction` — proof that its caller is handing over a real
// FINALIZED artifact, not a value it invented — `observeConfirmation()`
// below requires `broadcasted === true` before it will ever touch `txid`.
// A caller can only satisfy that by passing through the exact `{
// broadcasted, txid }` a real application/BitcoinAnchorBroadcastCoordinator.js
// BROADCASTED outcome carries — never a txid typed into a form, read from
// an unrelated anchor on the same screen, or otherwise reconstructed. This
// is a caller-contract check, thrown before the injected observer is ever
// consulted, exactly like the broadcast coordinator's own `finalized`
// check — never an observation outcome of its own.
//
// ONE OBSERVATION CALL PER EXPLICIT CLICK — NO RETRY, NO POLLING, NO
// AGGREGATION. A caller that wants a HISTORY of repeated observations
// keeps that history itself — see application/
// BitcoinAnchorConfirmationObservationHistory.js (0.8.56, unchanged),
// which this coordinator neither reads nor writes. This class answers
// "what did the network just report," once, per call, and nothing more.
//
// CONFIRMATION IS NEVER TRIGGERED BY BROADCASTING. Reaching a BROADCASTED
// outcome never calls this coordinator automatically — see application/
// BitcoinAnchorBroadcastState.js's own header, "THIS IS NOT CONFIRMATION."
// Only an explicit "Observe Confirmation" click, at a UI layer, ever calls
// `observeConfirmation()` below.
export class BitcoinAnchorConfirmationCoordinator {
    constructor({ bitcoinAnchorConfirmationObserver } = {}) {
        if (!bitcoinAnchorConfirmationObserver || typeof bitcoinAnchorConfirmationObserver.observeConfirmation !== 'function') {
            throw new Error('BitcoinAnchorConfirmationCoordinator: a BitcoinAnchorConfirmationObserver is required');
        }
        this._observer = bitcoinAnchorConfirmationObserver;
    }

    // Resolves to exactly what anchoring/BitcoinAnchorConfirmationObserver.js#
    // observeConfirmation() itself returns — `{ state, txid, blockHash,
    // blockHeight, confirmationCount, reason, observedAt }` — never
    // re-derived, re-shaped, or aggregated.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // observer is ever consulted — `broadcasted` is not `true`, or `txid`
    // is missing — see this file's own header. Any throw from the injected
    // observer itself never happens: anchoring/BitcoinAnchorConfirmationObserver.js
    // (0.8.54) only ever throws for a malformed `txid`, which by this
    // class's own contract above can only happen if this coordinator's
    // caller passed a non-broadcast artifact through — again a
    // caller-contract violation, not a network outcome.
    async observeConfirmation({ broadcasted, txid } = {}) {
        if (broadcasted !== true) {
            throw new Error('BitcoinAnchorConfirmationCoordinator: broadcasted must be true — broadcast a transaction before ever requesting confirmation observation');
        }
        if (typeof txid !== 'string' || !txid) {
            throw new Error('BitcoinAnchorConfirmationCoordinator: txid is required — pass the exact txid of a BROADCASTED outcome, never an arbitrary displayed value');
        }

        return this._observer.observeConfirmation(txid);
    }
}
