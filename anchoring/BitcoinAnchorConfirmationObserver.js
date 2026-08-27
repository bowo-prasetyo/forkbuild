import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';

const TXID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// 0.8.53's own header drew this exact boundary: "BROADCASTED... means only
// 'ForkBuild associated this content hash with this Bitcoin transaction and
// the network accepted it for broadcast.' Whether the transaction later
// gets mined into a block is answered later, separately." This class is
// that separate, later action, and NOTHING else:
//
//   already-known txid
//        │
//        ▼
//   BitcoinAnchorConfirmationObserver.observeConfirmation()   (new)
//        │
//        ▼
//   injected `confirmationSource`
//   (Esplora, Bitcoin Core RPC, a future backend, or a fake in every test)
//        │
//   ┌────┴────┬────────────────┐
//   ▼         ▼                ▼
// CONFIRMED  NOT_CONFIRMED   UNAVAILABLE
//
// A SEPARATE, EXPLICITLY-TRIGGERED ACTION — NEVER PART OF PUBLISHING.
// Nothing in application/BitcoinAnchorPublicationCoordinator.js (0.8.53)
// calls this class, and this class never calls back into that pipeline
// either. Reaching BROADCASTED never triggers a confirmation check
// automatically, and a confirmation check never re-broadcasts, re-signs,
// or otherwise touches the transaction it is asked about — it only reads.
// A caller decides when to ask, and asks again, explicitly, whenever it
// wants a fresher answer — there is no polling loop, timer, or retry
// anywhere in this file. See docs/Roadmap.md, "0.8.54 — Bitcoin Anchor
// Confirmation Observation."
//
// EVERY OBSERVATION IS A FRESH READ, NEVER A CACHED OR REMEMBERED ONE.
// `observeConfirmation()` holds no state across calls and returns a new,
// frozen record every time — it never remembers a previous CONFIRMED
// result and never lets one silently outlive an observation that would
// contradict it. A caller that wants a HISTORY of observations (to notice,
// say, a later observation naming a different blockHash than an earlier
// one — a possible reorganization) keeps that history itself; this class's
// only job is answering "what does the network report RIGHT NOW," once,
// per call — the identical restraint application/
// PublicationAnchorVerificationObservation.js already holds for anchor
// proof verification, and application/
// SnapshotPeerPossessionObservationHistory.js already holds for peer
// possession: an observation is a fact about a moment, not a claim that
// gets silently overwritten or promoted to permanent truth.
//
// `txid` IS A TRUSTED INTERNAL ARTIFACT, NEVER UNTRUSTED INPUT. Exactly
// like anchoring/BitcoinAnchorTransactionBroadcaster.js's own `txid`
// parameter, the txid this class is asked to observe is always one this
// codebase already derived and stored itself — ordinarily a
// `core/PublicationAnchor.js` instance's own `proof.txid` (0.8.9,
// unchanged). A malformed txid is therefore a caller-contract violation,
// checked before the injected `confirmationSource` is ever consulted —
// never a network-observation outcome of its own.
//
// A "NOT FOUND" TRANSACTION IS NEVER A DEFINITE VERDICT. Unlike
// broadcasting (where the network CAN give a definite rejection at
// submission time), there is no Bitcoin-network answer that means "this
// txid will never exist" — a transaction simply not (yet) found may mean
// it has not yet propagated to the queried node. This class reports that
// the identical way anchoring/BitcoinOpReturnProofVerifier.js's own 404
// handling already has, since 0.8.1: `UNAVAILABLE`, never a rejection, and
// never `NOT_CONFIRMED` either — `NOT_CONFIRMED` is reserved for a
// transaction the source genuinely FOUND (e.g. sitting in the mempool),
// which "not found" is not. See application/
// BitcoinAnchorConfirmationState.js's own header.
//
// A "CONFIRMED" REPORT WITH INCOMPLETE BLOCK METADATA IS NEVER TAKEN AT
// FACE VALUE. `blockHash`, `blockHeight`, and `confirmationCount` are
// never independently derivable by this class — they are exactly what the
// external system reports, an untrusted claim the same way anchoring/
// BitcoinOpReturnProofVerifier.js already treats a proof's own contents.
// A `confirmationSource` that claims `confirmed: true` but supplies a
// missing, malformed, or non-positive block field is reported as
// `UNAVAILABLE` — this class never fabricates a placeholder value, and
// never reports `CONFIRMED` on partial information.
//
// BLOCK METADATA IS PRESERVED, NEVER COLLAPSED INTO A BOOLEAN. The
// CONFIRMED outcome always carries `blockHash`, `blockHeight`, AND
// `confirmationCount` together — never merely `confirmed: true`. This
// matters for a future, separately sized milestone this codebase does not
// yet build: telling a ROUTINE new observation apart from one whose
// `blockHash` disagrees with an earlier CONFIRMED observation of the SAME
// txid (a possible chain reorganization) requires the block identity to
// have been kept, not discarded the moment "is it confirmed" was answered.
// This class does not detect or reason about reorganizations itself — it
// only refuses to throw away the information a later caller would need to.
//
// CONFIRMATION IS INDEPENDENT OF OP_RETURN PROOF VERIFICATION — NEVER
// MERGED INTO ONE VERDICT. This class answers "has this transaction been
// included in the chain, and what does the network currently report about
// it," nothing about whether any output of that transaction carries a
// particular content hash — that remains entirely anchoring/
// BitcoinOpReturnProofVerifier.js's own, separate question. A transaction
// can be CONFIRMED here and simultaneously fail OP_RETURN verification
// there (e.g. a genuine but content-mismatched anchor); this class never
// conflates the two into a single "is this anchor good" answer. See docs/
// Principles.md, "External Anchoring Provides Evidence; It Does Not
// Establish Authority (0.8.0)."
//
// A `confirmationSource` has exactly this shape — the identical injected-
// capability discipline anchoring/BitcoinAnchorTransactionBroadcaster.js
// already holds for broadcasting, sized for what THIS class reads instead
// of submits:
//
//   { fetchConfirmation(txid) ->
//       { found: true, confirmed: true,
//         blockHash, blockHeight, confirmationCount }
//           — the transaction is confirmed; all three block fields are
//             the source's own factual report
//       | { found: true, confirmed: false }
//           — the transaction exists (e.g. in the mempool) but is not yet
//             part of any block
//       | { found: false [, reason] }
//           — cannot presently establish the transaction's status: not
//             found, not reachable, or an unparseable response — NEVER
//             distinguished further; see this file's own header on why
//             "not found" carries no definite verdict
//     (sync return or Promise — observeConfirmation() always awaits it) }
//
// Throwing is tolerated as a last resort — observeConfirmation() catches
// it and reports the UNAVAILABLE form — mirroring exactly how anchoring/
// BitcoinAnchorTransactionBroadcaster.js already treats a throwing
// broadcaster, and application/ExternalAnchorVerifier.js a throwing
// proofVerifier.
export class BitcoinAnchorConfirmationObserver {
    constructor({ confirmationSource } = {}) {
        if (!confirmationSource || typeof confirmationSource.fetchConfirmation !== 'function') {
            throw new Error('BitcoinAnchorConfirmationObserver: a confirmation source is required');
        }
        this._confirmationSource = confirmationSource;
    }

    // Resolves to exactly one, frozen, observation record:
    //
    //   { state: CONFIRMED, txid, blockHash, blockHeight, confirmationCount,
    //     reason: null, observedAt }
    //   { state: NOT_CONFIRMED, txid, blockHash: null, blockHeight: null,
    //     confirmationCount: null, reason: null, observedAt }
    //   { state: UNAVAILABLE, txid, blockHash: null, blockHeight: null,
    //     confirmationCount: null, reason, observedAt }
    //
    // `observedAt` is THIS call's own local clock at the moment the
    // observation was produced — never a timestamp the external system
    // itself reports — the identical restraint application/
    // PublicationAnchorVerificationObservation.js's own header already
    // draws for its own `observedAt`.
    //
    // Throws only for a malformed `txid` — a caller-contract violation,
    // checked before the injected confirmationSource is ever consulted.
    // Never throws for the injected source's own operational failure.
    async observeConfirmation(txid) {
        const validatedTxid = validateTxid(txid);
        const observedAt = new Date();

        let result;
        try {
            result = await this._confirmationSource.fetchConfirmation(validatedTxid);
        } catch (error) {
            return outcome(BitcoinAnchorConfirmationState.UNAVAILABLE, {
                txid: validatedTxid, observedAt, reason: error.message
            });
        }

        if (!result || typeof result !== 'object' || result.found !== true) {
            return outcome(BitcoinAnchorConfirmationState.UNAVAILABLE, {
                txid: validatedTxid,
                observedAt,
                reason: (result && typeof result.reason === 'string' && result.reason)
                    || `transaction ${validatedTxid} was not found`
            });
        }

        if (result.confirmed !== true) {
            return outcome(BitcoinAnchorConfirmationState.NOT_CONFIRMED, { txid: validatedTxid, observedAt });
        }

        const blockHash = typeof result.blockHash === 'string' && result.blockHash ? result.blockHash : null;
        const blockHeight = Number.isInteger(result.blockHeight) ? result.blockHeight : null;
        const confirmationCount = Number.isInteger(result.confirmationCount) && result.confirmationCount >= 1
            ? result.confirmationCount
            : null;

        if (blockHash === null || blockHeight === null || confirmationCount === null) {
            return outcome(BitcoinAnchorConfirmationState.UNAVAILABLE, {
                txid: validatedTxid,
                observedAt,
                reason: `confirmation source reported transaction ${validatedTxid} as confirmed but did not supply complete block metadata`
            });
        }

        return outcome(BitcoinAnchorConfirmationState.CONFIRMED, {
            txid: validatedTxid, observedAt, blockHash, blockHeight, confirmationCount
        });
    }
}

function outcome(state, { txid, observedAt, blockHash = null, blockHeight = null, confirmationCount = null, reason = null }) {
    return Object.freeze({ state, txid, blockHash, blockHeight, confirmationCount, reason, observedAt });
}

function validateTxid(txid) {
    if (typeof txid !== 'string' || !TXID_PATTERN.test(txid)) {
        throw new Error('BitcoinAnchorConfirmationObserver: txid must be the 32-byte hex transaction id named by a PublicationAnchor\'s own proof.txid');
    }
    return txid.toLowerCase();
}
