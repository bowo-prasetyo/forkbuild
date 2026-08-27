import { BitcoinAnchorBroadcastState } from './BitcoinAnchorBroadcastState.js';

// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
//
// anchoring/BitcoinAnchorTransactionBroadcaster.js (0.8.52) already carries
// EVERY invariant this milestone exists to expose behind an explicit
// button — "broadcasting submits; it does not decide," the caller's own
// txid stays authoritative regardless of what the network claims, no
// retry, no re-sign, no reconstruction. Nothing about that class changes
// here — this coordinator is a deliberately thin wiring on top of it,
// mirroring EXACTLY the shape application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js (0.8.63) already
// established one stage earlier for anchoring/BitcoinAnchorSignedPsbtFinalizer.js:
//
//   { finalized: true, txid, rawTransaction }
//           │
//           │ explicit "Broadcast Transaction" click
//           ▼
//   BitcoinAnchorBroadcastCoordinator.broadcast()   (THIS FILE — new)
//           │
//           ▼
//   anchoring/BitcoinAnchorTransactionBroadcaster.js#broadcast()   (0.8.52,
//           │                                                       UNCHANGED)
//           ▼
//   { broadcasted: true, txid }                          ──► BROADCASTED
// | { broadcasted: false, unavailable: true, reason }     ──► UNAVAILABLE
// | { broadcasted: false, reason }                        ──► REJECTED
//   (a thrown caller-contract violation)                  ──► not caught;
//                                                              see below
//
// NO NEW BITCOIN LOGIC BELONGS HERE, AND NONE IS ADDED. This class selects
// no UTXO, builds no PSBT, checks no signature, and re-implements no part
// of the broadcast protocol. It calls the unchanged 0.8.52 broadcaster
// exactly once per `broadcast()` call and does nothing with the result
// except translate it into application/BitcoinAnchorBroadcastState.js's
// own six-value vocabulary.
//
// ACCEPTS ONLY THE OUTPUT OF SUCCESSFUL FINALIZATION — NEVER RECONSTRUCTS,
// RE-SIGNS, RE-FINALIZES, OR CHANGES FEES. `broadcast()` takes exactly the
// shape application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js#
// finalize() produces on a FINALIZED outcome — `{ finalized: true, txid,
// rawTransaction }` — and hands `txid`/`rawTransaction` to the injected
// broadcaster completely unmodified. A `finalized` flag that is not
// `true`, or a missing `txid`/`rawTransaction`, is a caller-contract
// violation — this class never received a real finalization result — and
// throws immediately, before the injected broadcaster is ever consulted,
// mirroring exactly how application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js#finalize() itself
// throws for its own missing `description`/`signedPsbt`. The actual shape
// validation of `txid`/`rawTransaction` themselves stays entirely
// anchoring/BitcoinAnchorTransactionBroadcaster.js's own job — this class
// never re-implements it.
//
// ONE BROADCASTER CALL PER EXPLICIT CLICK — NO RETRY OF ANY KIND. A
// REJECTED or UNAVAILABLE result is the end of this broadcast attempt:
// this class never re-submits, never waits and tries again, and never
// substitutes different bytes. A person clicks "Broadcast Transaction"
// again, explicitly, to make another attempt — see anchoring/
// BitcoinAnchorTransactionBroadcaster.js's own header, "duplicate
// submissions are deterministic," on why re-submitting the identical,
// already-finalized bytes is always safe when a person chooses to.
//
// FAILED IS FOR AN UNACCEPTABLE OR UNVERIFIABLE BROADCASTER RESPONSE,
// NEVER FOR THIS COORDINATOR'S OWN CALLER-CONTRACT VIOLATIONS. Exactly as
// application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js's own
// header already draws this line: a missing or malformed finalization
// artifact is a UI-layer bug, refused by throwing, never caught into a
// FAILED outcome. anchoring/BitcoinAnchorTransactionBroadcaster.js itself
// never throws for an operational broadcaster failure — it only throws for
// a malformed `txid`/`rawTransaction`, which by this class's own contract
// above can only happen if this coordinator's caller passed a
// non-finalization artifact through, again a caller-contract violation,
// not a network outcome. FAILED therefore stays honestly unreached by this
// class today — kept in the vocabulary, not removed, for the identical
// reason application/BitcoinAnchorSignedPsbtFinalizationState.js's own
// UNAVAILABLE stays honestly unreached: a future broadcaster contract
// change would have a state to report through rather than forcing a false
// REJECTED or UNAVAILABLE.
export class BitcoinAnchorBroadcastCoordinator {
    constructor({ bitcoinAnchorTransactionBroadcaster } = {}) {
        if (!bitcoinAnchorTransactionBroadcaster || typeof bitcoinAnchorTransactionBroadcaster.broadcast !== 'function') {
            throw new Error('BitcoinAnchorBroadcastCoordinator: a BitcoinAnchorTransactionBroadcaster is required');
        }
        this._broadcaster = bitcoinAnchorTransactionBroadcaster;
    }

    // Resolves to exactly one of:
    //
    //   { state: BROADCASTED, broadcasted: true, txid, reason: null }
    //   { state: UNAVAILABLE, broadcasted: false, txid: null, reason }
    //   { state: REJECTED, broadcasted: false, txid: null, reason }
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // broadcaster is ever consulted — `finalized` is not `true`, or
    // `txid`/`rawTransaction` is missing — see this file's own header. Any
    // throw from the injected broadcaster itself is anchoring/
    // BitcoinAnchorTransactionBroadcaster.js's own documented behavior for
    // a malformed `txid`/`rawTransaction` — propagated, never swallowed
    // into a FAILED outcome, for the identical caller-contract reason.
    async broadcast({ finalized, txid, rawTransaction } = {}) {
        if (finalized !== true) {
            throw new Error('BitcoinAnchorBroadcastCoordinator: finalized must be true — finalize a transaction before ever requesting a broadcast');
        }
        if (!txid || !rawTransaction) {
            throw new Error('BitcoinAnchorBroadcastCoordinator: txid and rawTransaction are required — pass the exact result of a FINALIZED outcome');
        }

        const result = await this._broadcaster.broadcast({ txid, rawTransaction });

        if (result.broadcasted === true) {
            return this._outcome(BitcoinAnchorBroadcastState.BROADCASTED, { broadcasted: true, txid: result.txid });
        }
        const state = result.unavailable
            ? BitcoinAnchorBroadcastState.UNAVAILABLE
            : BitcoinAnchorBroadcastState.REJECTED;
        return this._outcome(state, { reason: result.reason });
    }

    _outcome(state, { broadcasted = false, txid = null, reason = null } = {}) {
        return Object.freeze({ state, broadcasted, txid, reason });
    }
}
