import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// 0.8.95's own header drew this exact boundary, one chain over from
// `anchoring/BitcoinAnchorConfirmationObserver.js`'s own (0.8.54):
// "BROADCASTED... means only 'Base's own JSON-RPC endpoint accepted this
// transaction submission and returned a transaction hash.' Whether the
// transaction later gets included in a block is answered later,
// separately." This class is that separate, later action, and NOTHING
// else:
//
//   already-known txid (the EXACT hash a real BROADCASTED outcome named)
//        │
//        ▼
//   BaseTransactionInclusionObserver.observeInclusion()   (new)
//        │
//        ▼
//   injected `rpcSource`
//   (base/BaseJsonRpcClient.js, or a fake in every test)
//        │
//   ┌────┴─────┬──────────────┐
//   ▼          ▼              ▼
// INCLUDED  NOT_INCLUDED   UNAVAILABLE
//
// A SEPARATE, EXPLICITLY-TRIGGERED ACTION — NEVER PART OF BROADCASTING.
// Nothing in `base/BaseTransactionBroadcaster.js` or `application/
// BaseTransactionBroadcastCoordinator.js` (0.8.95) calls this class, and
// this class never calls back into that pipeline either. Reaching
// BROADCASTED never triggers an inclusion check automatically, and an
// inclusion check never re-broadcasts, re-signs, re-finalizes, or
// otherwise touches the transaction it is asked about — it only reads. A
// caller decides when to ask, and asks again, explicitly, whenever it
// wants a fresher answer — there is no polling loop, timer, or retry
// anywhere in this file. See `docs/Roadmap.md`, "0.8.96 — Explicit Base
// Transaction Inclusion & Confirmation Observation."
//
// EVERY OBSERVATION IS A FRESH READ, NEVER A CACHED OR REMEMBERED ONE.
// `observeInclusion()` holds no state across calls and returns a new,
// frozen record every time — it never remembers a previous INCLUDED
// result and never lets one silently outlive an observation that would
// contradict it. A caller that wants a HISTORY of observations keeps that
// history itself — see `application/
// BaseTransactionInclusionObservationHistory.js` — the identical restraint
// `anchoring/BitcoinAnchorConfirmationObserver.js`'s own header already
// holds one chain over.
//
// `txid` IS A TRUSTED INTERNAL ARTIFACT, NEVER UNTRUSTED INPUT. Exactly
// like `base/BaseTransactionBroadcaster.js`'s own `finalizedTransaction`
// parameter, the txid this class is asked to observe is always one this
// codebase already derived itself — ordinarily the exact `txid` a real
// `application/BaseTransactionBroadcastCoordinator.js` BROADCASTED outcome
// carries. A malformed txid is therefore a caller-contract violation,
// checked before the injected `rpcSource` is ever consulted — never a
// network-observation outcome of its own. This class still names its own
// field `txid`, not `transactionHash`, purely to stay the SAME field name
// `application/BaseTransactionBroadcastView.js` already exposes — never a
// different name for the identical value one stage later.
//
// A "NOT INCLUDED" TRANSACTION IS NEVER A DEFINITE VERDICT. Unlike
// broadcasting (where the network CAN give a definite rejection at
// submission time), there is no Base-network answer that means "this txid
// will never be included" — a transaction simply not (yet) included may
// mean it is still sitting in the mempool. Base's own `eth_getTransactionReceipt`
// is well-behaved here in a way Bitcoin's own "not found" never was: a
// genuinely-reached endpoint reports a definite `null` for a transaction
// it does not know about, so this class reports that as NOT_INCLUDED — a
// real, positive fact — reserving UNAVAILABLE for when the endpoint could
// not be consulted at all. See `application/
// BaseTransactionInclusionObservationState.js`'s own header.
//
// AN "INCLUDED" REPORT WITH INCOMPLETE BLOCK METADATA IS NEVER TAKEN AT
// FACE VALUE. `blockHash`, `blockNumber`, and `transactionIndex` are
// re-validated here even though `base/BaseJsonRpcClient.js#fetchTransactionReceipt()`
// already validates them once — the identical defense-in-depth `anchoring/
// BitcoinAnchorConfirmationObserver.js` already holds toward its own
// `confirmationSource`. A `rpcSource` that claims `found: true` but
// supplies a missing or malformed block field is reported as UNAVAILABLE
// — this class never fabricates a placeholder value, and never reports
// INCLUDED on partial information.
//
// `confirmationCount` IS A MECHANICAL DERIVATION FROM TWO INDEPENDENT
// READS, NEVER A SEPARATELY REPORTED FACT. Unlike Bitcoin, where an
// external `confirmationSource` reports its own `confirmationCount`
// directly, Base's own JSON-RPC surface reports only a receipt's block
// number and, separately, the chain's current head — `confirmationCount =
// latestBlockNumber - blockNumber + 1` is this class's own arithmetic,
// computed fresh on every call from THIS call's own two reads, never
// cached and never carried over from a previous observation. If either
// read fails, or the arithmetic itself does not produce a sane, positive
// count (the two reads landing on two momentarily inconsistent views of
// the chain), this class reports UNAVAILABLE rather than a fabricated or
// negative confirmation count — an INCLUDED outcome always carries a
// genuine, positive `confirmationCount`, never a null or invented one.
//
// BLOCK METADATA IS PRESERVED, NEVER COLLAPSED INTO A BOOLEAN. The
// INCLUDED outcome always carries `blockHash`, `blockNumber`,
// `transactionIndex`, AND `confirmationCount` together — never merely
// `included: true`. This matters for a future, separately sized milestone
// this codebase does not yet build: telling a ROUTINE new observation
// apart from one whose `blockHash` disagrees with an earlier INCLUDED
// observation of the SAME txid (a possible chain reorganization) requires
// the block identity to have been kept, not discarded the moment "is it
// included" was answered. This class does not detect or reason about
// reorganizations itself — it only refuses to throw away the information
// a later caller would need to.
//
// INCLUSION IS INDEPENDENT OF EXECUTION OUTCOME — NEVER MERGED INTO ONE
// VERDICT. This class answers "has this transaction been included in the
// chain, and what does the network currently report about its block
// position," nothing about whether the transaction's own on-chain
// execution succeeded or reverted. `base/BaseJsonRpcClient.js#fetchTransactionReceipt()`
// deliberately decodes no `status` field, and this class carries none —
// see `docs/Roadmap.md`, 0.8.96, "Deliberately excluded," on why execution-
// result preservation is its own, later, separately sized milestone.
//
// A `rpcSource` has exactly this shape for this class's own purposes —
// `base/BaseJsonRpcClient.js`'s OWN, already-sized contract:
//
//   { fetchTransactionReceipt(txid) ->
//       { available: true, found: true, blockHash, blockNumber, transactionIndex }
//           — a genuine receipt; all three block fields are the source's
//             own factual report.
//       | { available: true, found: false }
//           — the transaction is not (yet) part of any block.
//       | { available: false [, reason] }
//           — cannot presently establish the transaction's status: not
//             reachable, or an unparseable response.
//     fetchLatestBlockNumber() ->
//       { available: true, blockNumber }
//       | { available: false [, reason] }
//     (sync return or Promise — observeInclusion() always awaits both) }
//
// Throwing is tolerated as a last resort — observeInclusion() catches it
// and reports the UNAVAILABLE form — mirroring exactly how `anchoring/
// BitcoinAnchorConfirmationObserver.js` already treats a throwing
// confirmationSource.
export class BaseTransactionInclusionObserver {
    constructor({ rpcSource } = {}) {
        if (!rpcSource || typeof rpcSource.fetchTransactionReceipt !== 'function' || typeof rpcSource.fetchLatestBlockNumber !== 'function') {
            throw new Error('BaseTransactionInclusionObserver: an rpcSource with fetchTransactionReceipt and fetchLatestBlockNumber is required');
        }
        this._rpcSource = rpcSource;
    }

    // Resolves to exactly one, frozen observation record:
    //
    //   { state: INCLUDED, txid, blockHash, blockNumber, transactionIndex,
    //     confirmationCount, reason: null, observedAt }
    //   { state: NOT_INCLUDED, txid, blockHash: null, blockNumber: null,
    //     transactionIndex: null, confirmationCount: null, reason: null,
    //     observedAt }
    //   { state: UNAVAILABLE, txid, blockHash: null, blockNumber: null,
    //     transactionIndex: null, confirmationCount: null, reason,
    //     observedAt }
    //
    // `observedAt` is THIS call's own local clock at the moment the
    // observation was produced — never a timestamp the RPC endpoint itself
    // reports — the identical restraint `anchoring/
    // BitcoinAnchorConfirmationObserver.js`'s own header already draws for
    // its own `observedAt`.
    //
    // Throws only for a malformed `txid` — a caller-contract violation,
    // checked before the injected `rpcSource` is ever consulted. Never
    // throws for the injected source's own operational failure.
    async observeInclusion(txid) {
        const validatedTxid = validateTxid(txid);
        const observedAt = new Date();

        let receiptResult;
        try {
            receiptResult = await this._rpcSource.fetchTransactionReceipt(validatedTxid);
        } catch (error) {
            return outcome(BaseTransactionInclusionObservationState.UNAVAILABLE, {
                txid: validatedTxid, observedAt, reason: error.message
            });
        }

        if (!receiptResult || typeof receiptResult !== 'object' || receiptResult.available !== true) {
            return outcome(BaseTransactionInclusionObservationState.UNAVAILABLE, {
                txid: validatedTxid,
                observedAt,
                reason: (receiptResult && typeof receiptResult.reason === 'string' && receiptResult.reason)
                    || `could not determine whether transaction ${validatedTxid} has been included`
            });
        }

        if (receiptResult.found !== true) {
            return outcome(BaseTransactionInclusionObservationState.NOT_INCLUDED, { txid: validatedTxid, observedAt });
        }

        const blockHash = typeof receiptResult.blockHash === 'string' && receiptResult.blockHash ? receiptResult.blockHash : null;
        const blockNumber = Number.isInteger(receiptResult.blockNumber) && receiptResult.blockNumber >= 0 ? receiptResult.blockNumber : null;
        const transactionIndex = Number.isInteger(receiptResult.transactionIndex) && receiptResult.transactionIndex >= 0 ? receiptResult.transactionIndex : null;

        if (blockHash === null || blockNumber === null || transactionIndex === null) {
            return outcome(BaseTransactionInclusionObservationState.UNAVAILABLE, {
                txid: validatedTxid,
                observedAt,
                reason: `rpcSource reported transaction ${validatedTxid} as included but did not supply complete block metadata`
            });
        }

        let blockNumberResult;
        try {
            blockNumberResult = await this._rpcSource.fetchLatestBlockNumber();
        } catch (error) {
            return outcome(BaseTransactionInclusionObservationState.UNAVAILABLE, {
                txid: validatedTxid, observedAt, reason: error.message
            });
        }

        if (!blockNumberResult || typeof blockNumberResult !== 'object' || blockNumberResult.available !== true
            || !Number.isInteger(blockNumberResult.blockNumber) || blockNumberResult.blockNumber < 0) {
            return outcome(BaseTransactionInclusionObservationState.UNAVAILABLE, {
                txid: validatedTxid,
                observedAt,
                reason: (blockNumberResult && typeof blockNumberResult.reason === 'string' && blockNumberResult.reason)
                    || `transaction ${validatedTxid} is included, but the current block number could not be determined`
            });
        }

        const confirmationCount = blockNumberResult.blockNumber - blockNumber + 1;
        if (!Number.isInteger(confirmationCount) || confirmationCount < 1) {
            return outcome(BaseTransactionInclusionObservationState.UNAVAILABLE, {
                txid: validatedTxid,
                observedAt,
                reason: `transaction ${validatedTxid} reported at block ${blockNumber}, which is not consistent with the current block number ${blockNumberResult.blockNumber}`
            });
        }

        return outcome(BaseTransactionInclusionObservationState.INCLUDED, {
            txid: validatedTxid, observedAt, blockHash, blockNumber, transactionIndex, confirmationCount
        });
    }
}

function outcome(state, { txid, observedAt, blockHash = null, blockNumber = null, transactionIndex = null, confirmationCount = null, reason = null }) {
    return Object.freeze({ state, txid, blockHash, blockNumber, transactionIndex, confirmationCount, reason, observedAt });
}

function validateTxid(txid) {
    if (typeof txid !== 'string' || !TX_HASH_PATTERN.test(txid)) {
        throw new Error('BaseTransactionInclusionObserver: txid must be the 32-byte hex transaction hash named by a real BROADCASTED outcome');
    }
    return txid;
}
