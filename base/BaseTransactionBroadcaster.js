const RAW_TRANSACTION_PATTERN = /^0x[0-9a-fA-F]+$/;

// 0.8.95 — Explicit Base Transaction Broadcast.
//
// `base/BaseSignedTransactionFinalizer.js` (0.8.94) stops the instant it
// has a genuinely, independently, cryptographically verified transaction —
// its own header names exactly what is still missing: "It does NOT mean
// broadcast, accepted by Base, included in a block, confirmed, published,
// or immutable... those remain entirely separate, later facts (0.8.95 and
// 0.8.96)." This class is that milestone, held to the identical principle
// `anchoring/BitcoinAnchorTransactionBroadcaster.js` (0.8.52) already
// established one chain over:
//
//   Broadcast publishes an already-finalized transaction; it does not
//   construct, sign, modify, or re-verify one.
//
//   { finalized: true, finalizedTransaction: { rawTransaction, ... } }
//                              │
//                              ▼
//                  BaseTransactionBroadcaster   (THIS FILE — new)
//                              │
//                              ▼
//                     injected `rpcSource`
//                     (base/BaseJsonRpcClient.js, or a fake in every test)
//                              │
//                    ┌─────────┴─────────┐
//                    ▼                   ▼
//            { broadcasted: true,   { broadcasted: false,
//              txid }                 reason [, unavailable] }
//
// BROADCASTING SUBMITS; IT DOES NOT DECIDE — the identical restraint
// `anchoring/BitcoinAnchorTransactionBroadcaster.js`'s own header (0.8.52)
// already holds. This class never inspects, re-signs, re-encodes, or
// second-guesses the transaction it is handed — that entire question was
// already settled, cryptographically, by `base/
// BaseSignedTransactionFinalizer.js#finalize()`. `broadcast()` does exactly
// one thing: hand the exact `rawTransaction` hex the finalizer produced to
// an injected `rpcSource`, and translate whatever it reports into this
// class's own narrow, three-outcome vocabulary.
//
// ACCEPTS ONLY THE OUTPUT OF SUCCESSFUL FINALIZATION — NEVER A PLAN, NEVER
// A CONTENT HASH, NEVER A NONCE OR FEE OF ITS OWN. `broadcast({
// finalizedTransaction })` takes exactly the object `base/
// BaseSignedTransactionFinalizer.js#finalize()` produces on a FINALIZED
// outcome. There is no code path in this file that reads a `plan`, calls
// `eth_getTransactionCount`/`eth_gasPrice`/`eth_maxPriorityFeePerGas`, or
// builds any transaction request of any kind — `rpcSource` here is asked
// for exactly one thing, `broadcastRawTransaction()`, and nothing else.
// See this file's own tests, "no RPC reads for nonce/fees" — changing
// what the network currently reports for either, after finalization,
// changes nothing this class submits.
//
// `finalizedTransaction` IS AN INTERNAL, ALREADY-TRUSTED ARTIFACT —
// TREATED LIKE ONE. Mirroring exactly how `anchoring/
// BitcoinAnchorTransactionBroadcaster.js` treats its own `txid`/
// `rawTransaction` pair (0.8.52): a malformed `finalizedTransaction`, or a
// `rawTransaction` that is not a real hex string, throws immediately,
// before the injected `rpcSource` is ever consulted. This is not the
// untrusted-external-input posture; `finalizedTransaction` did not arrive
// from a wallet or the network — it came from this codebase's own
// finalizer.
//
// THE REPORTED txid IS THE NETWORK'S OWN `eth_sendRawTransaction` RESULT —
// A DELIBERATE DIFFERENCE FROM THE BITCOIN BOUNDARY THIS MILESTONE
// OTHERWISE MIRRORS. `anchoring/BitcoinAnchorTransactionBroadcaster.js`
// never trusts an external broadcaster's own claimed txid, because an
// Esplora-style HTTP endpoint's self-reported identifier is exactly the
// kind of unverified claim this codebase refuses at every prior boundary.
// `eth_sendRawTransaction` is different: Base's own JSON-RPC contract
// DEFINES its result, on success, to be the transaction hash — the
// network-returned identifier this milestone's own proposal names
// directly. `base/BaseJsonRpcClient.js#broadcastRawTransaction()` already
// validates it is a genuine 32-byte hex hash before this class ever sees
// it; this class exposes it unchanged, with no further normalization.
//
// NEVER RE-SIGNS, RE-CONSTRUCTS, OR RETRIES WITH DIFFERENT BYTES. A
// rejection or unavailability is reported and stops there. This class
// holds no retry logic, no fee-bump path, and no fallback that would
// submit anything other than the exact `rawTransaction` it was handed —
// see `docs/Roadmap.md`, 0.8.95, "No automatic retry."
//
// AN `rpcSource` HAS EXACTLY THIS SHAPE FOR THIS CLASS'S OWN PURPOSES —
// `base/BaseJsonRpcClient.js`'s OWN, ALREADY-SIZED CONTRACT:
//
//   { broadcastRawTransaction(rawTransaction) ->
//       { broadcasted: true, txid }
//           — accepted; `txid` is read and exposed unchanged, per this
//             file's own header, above.
//       | { broadcasted: false, reason }
//           — a DEFINITE no: the endpoint was reached and refused this
//             exact transaction.
//       | { broadcasted: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: no connectivity, a timeout, a
//             malformed response. NEVER treated as a rejection.
//     (sync return or Promise — broadcast() always awaits it) }
//
// Throwing is tolerated as a last resort — broadcast() catches it and
// reports the `unavailable` form, never the definite-rejection form —
// mirroring exactly how `anchoring/BitcoinAnchorTransactionBroadcaster.js`
// already treats a throwing broadcaster.
//
// NO SIGNER, NO FINALIZER, NO CONFIRMATION OBSERVER OF ANY KIND IS EVER
// IMPORTED OR CALLED HERE. This class holds no dependency on `base/
// BaseTransactionSigner.js`, `base/BaseSignedTransactionFinalizer.js`, or
// any future confirmation-observation capability — broadcasting an
// already-finalized artifact needs none of them. See `docs/Roadmap.md`,
// 0.8.95, tests C/D/E.
export class BaseTransactionBroadcaster {
    constructor({ rpcSource } = {}) {
        if (!rpcSource || typeof rpcSource.broadcastRawTransaction !== 'function') {
            throw new Error('BaseTransactionBroadcaster: an rpcSource with broadcastRawTransaction is required');
        }
        this._rpcSource = rpcSource;
    }

    // Resolves to exactly one of:
    //
    //   { broadcasted: true, txid }
    //   { broadcasted: false, reason }
    //       — the injected rpcSource reached a definite no.
    //   { broadcasted: false, unavailable: true, reason }
    //       — cannot presently broadcast; retrying later, with another
    //         explicit click, may succeed.
    //
    // Throws only for a malformed `finalizedTransaction` — a caller
    // contract violation, checked before the injected `rpcSource` is ever
    // consulted. Never throws for the injected `rpcSource`'s own
    // operational failure.
    async broadcast({ finalizedTransaction } = {}) {
        const rawTransaction = requireFinalizedRawTransaction(finalizedTransaction);

        let result;
        try {
            result = await this._rpcSource.broadcastRawTransaction(rawTransaction);
        } catch (error) {
            return { broadcasted: false, unavailable: true, reason: error.message };
        }

        if (!result || typeof result !== 'object' || result.broadcasted !== true) {
            return {
                broadcasted: false,
                unavailable: !!(result && result.unavailable),
                reason: (result && typeof result.reason === 'string' && result.reason) || 'rpcSource declined to broadcast this transaction'
            };
        }

        if (typeof result.txid !== 'string' || !result.txid) {
            return { broadcasted: false, unavailable: true, reason: 'BaseTransactionBroadcaster: rpcSource reported broadcasted:true without a txid' };
        }

        return { broadcasted: true, txid: result.txid };
    }
}

function requireFinalizedRawTransaction(finalizedTransaction) {
    if (!finalizedTransaction || typeof finalizedTransaction !== 'object') {
        throw new Error('BaseTransactionBroadcaster: finalizedTransaction is required — pass the exact result of BaseSignedTransactionFinalizer#finalize()');
    }
    const { rawTransaction } = finalizedTransaction;
    if (typeof rawTransaction !== 'string' || rawTransaction.length < 3 || rawTransaction.length % 2 !== 0 || !RAW_TRANSACTION_PATTERN.test(rawTransaction)) {
        throw new Error('BaseTransactionBroadcaster: finalizedTransaction.rawTransaction must be a non-empty, even-length 0x-prefixed hex string');
    }
    return rawTransaction;
}
