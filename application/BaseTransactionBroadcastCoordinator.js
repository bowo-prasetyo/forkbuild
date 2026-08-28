import { BaseTransactionBroadcastState } from './BaseTransactionBroadcastState.js';

// 0.8.95 — Explicit Base Transaction Broadcast.
//
// `base/BaseTransactionBroadcaster.js` already carries EVERY invariant
// this milestone exists to expose behind an explicit button —
// "broadcasting submits; it does not decide," the network's own returned
// txid exposed unchanged, no retry, no re-sign, no reconstruction.
// Nothing about that class changes here — this coordinator is a
// deliberately thin wiring on top of it, mirroring exactly the shape
// `application/BitcoinAnchorBroadcastCoordinator.js` (0.8.64) already
// established one chain over:
//
//   { finalized: true, finalizedTransaction }
//           │
//           │ explicit "Broadcast Transaction" click
//           ▼
//   BaseTransactionBroadcastCoordinator.broadcast()   (THIS FILE — new)
//           │
//           ▼
//   base/BaseTransactionBroadcaster.js#broadcast()   (THIS MILESTONE,
//           │                                          sibling file,
//           │                                          UNCHANGED by
//           │                                          this class)
//           ▼
//   { broadcasted: true, txid }                          ──► BROADCASTED
// | { broadcasted: false, unavailable: true, reason }     ──► UNAVAILABLE
// | { broadcasted: false, reason }                        ──► REJECTED
//   (a thrown caller-contract violation)                  ──► not caught;
//                                                              see below
//
// NO NEW BASE LOGIC BELONGS HERE, AND NONE IS ADDED. This class encodes
// no transaction, signs nothing, and re-verifies nothing. It calls the
// unchanged 0.8.95 broadcaster exactly once per `broadcast()` call and
// does nothing with the result except translate it into `application/
// BaseTransactionBroadcastState.js`'s own six-value vocabulary.
//
// ACCEPTS ONLY THE OUTPUT OF SUCCESSFUL FINALIZATION — NEVER RECONSTRUCTS,
// RE-SIGNS, RE-FINALIZES, OR CHANGES FEES. `broadcast()` takes exactly the
// shape `application/BaseSignedTransactionFinalizationCoordinator.js#
// finalize()` produces on a FINALIZED outcome — `{ finalized: true,
// finalizedTransaction }` — and hands `finalizedTransaction` to the
// injected broadcaster completely unmodified. A `finalized` flag that is
// not `true`, or a missing `finalizedTransaction`, is a caller-contract
// violation — this class never received a real finalization result — and
// throws immediately, before the injected broadcaster is ever consulted,
// mirroring exactly how `application/BitcoinAnchorBroadcastCoordinator.js`
// itself throws for its own missing `txid`/`rawTransaction`. The actual
// shape validation of `finalizedTransaction` itself stays entirely `base/
// BaseTransactionBroadcaster.js`'s own job — this class never re-implements
// it.
//
// ONE BROADCASTER CALL PER EXPLICIT CLICK — NO RETRY OF ANY KIND. A
// REJECTED or UNAVAILABLE result is the end of this broadcast attempt:
// this class never re-submits, never waits and tries again, and never
// substitutes different bytes. A person clicks "Broadcast Transaction"
// again, explicitly, to make another attempt — see `base/
// BaseTransactionBroadcaster.js`'s own header on why resubmitting the
// identical, already-finalized bytes is always safe when a person chooses
// to.
//
// FAILED IS FOR AN UNACCEPTABLE OR UNVERIFIABLE BROADCASTER RESPONSE,
// NEVER FOR THIS COORDINATOR'S OWN CALLER-CONTRACT VIOLATIONS. Exactly as
// `application/BitcoinAnchorBroadcastCoordinator.js`'s own header already
// draws this line: a missing or malformed finalization artifact is a
// UI-layer bug, refused by throwing, never caught into a FAILED outcome.
// `base/BaseTransactionBroadcaster.js` itself never throws for an
// operational rpcSource failure — it only throws for a malformed
// `finalizedTransaction`, which by this class's own contract above can
// only happen if this coordinator's caller passed a non-finalization
// artifact through, again a caller-contract violation, not a network
// outcome. FAILED therefore stays honestly unreached by this class today
// — kept in the vocabulary, not removed, for the identical reason
// `application/BaseSignedTransactionFinalizationState.js`'s own
// UNAVAILABLE stays honestly unreached: a future rpcSource contract
// change would have a state to report through rather than forcing a false
// REJECTED or UNAVAILABLE.
export class BaseTransactionBroadcastCoordinator {
    constructor({ baseTransactionBroadcaster } = {}) {
        if (!baseTransactionBroadcaster || typeof baseTransactionBroadcaster.broadcast !== 'function') {
            throw new Error('BaseTransactionBroadcastCoordinator: a BaseTransactionBroadcaster is required');
        }
        this._broadcaster = baseTransactionBroadcaster;
    }

    // Resolves to exactly one of:
    //
    //   { state: BROADCASTED, broadcasted: true, txid, reason: null }
    //   { state: UNAVAILABLE, broadcasted: false, txid: null, reason }
    //   { state: REJECTED, broadcasted: false, txid: null, reason }
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // broadcaster is ever consulted — `finalized` is not `true`, or
    // `finalizedTransaction` is missing — see this file's own header. Any
    // throw from the injected broadcaster itself is `base/
    // BaseTransactionBroadcaster.js`'s own documented behavior for a
    // malformed `finalizedTransaction` — propagated, never swallowed into
    // a FAILED outcome, for the identical caller-contract reason.
    async broadcast({ finalized, finalizedTransaction } = {}) {
        if (finalized !== true) {
            throw new Error('BaseTransactionBroadcastCoordinator: finalized must be true — finalize a transaction before ever requesting a broadcast');
        }
        if (!finalizedTransaction || typeof finalizedTransaction !== 'object') {
            throw new Error('BaseTransactionBroadcastCoordinator: finalizedTransaction is required — pass the exact result of a FINALIZED outcome');
        }

        const result = await this._broadcaster.broadcast({ finalizedTransaction });

        if (result.broadcasted === true) {
            return this._outcome(BaseTransactionBroadcastState.BROADCASTED, { broadcasted: true, txid: result.txid });
        }
        const state = result.unavailable
            ? BaseTransactionBroadcastState.UNAVAILABLE
            : BaseTransactionBroadcastState.REJECTED;
        return this._outcome(state, { reason: result.reason });
    }

    _outcome(state, { broadcasted = false, txid = null, reason = null } = {}) {
        return Object.freeze({ state, broadcasted, txid, reason });
    }
}
