const TXID_PATTERN = /^[0-9a-f]{64}$/i;
const HEX_PATTERN = /^[0-9a-f]+$/i;

// 0.8.52 — Bitcoin Anchor Transaction Broadcasting.
//
// anchoring/BitcoinAnchorSignedPsbtFinalizer.js (0.8.51) stops the instant
// it has real, broadcastable transaction bytes — its own header names
// broadcasting as "explicitly the next, separately sized milestone." This
// class is that milestone, and nothing more:
//
//   { finalized: true, txid, rawTransaction: { bytes, hex } }
//                              │
//                              ▼
//              BitcoinAnchorTransactionBroadcaster   (new)
//                              │
//                              ▼
//                    injected `broadcaster`
//                    (Esplora, Bitcoin Core RPC,
//                     a future backend, or a fake in every test)
//                              │
//                    ┌─────────┴─────────┐
//                    ▼                   ▼
//            { broadcasted: true,   { broadcasted: false,
//              txid }                 reason [, unavailable] }
//
// BROADCASTING SUBMITS; IT DOES NOT DECIDE. This class never inspects,
// re-signs, re-serializes, or second-guesses the transaction it is handed
// — that entire question was already settled, cryptographically, by
// BitcoinAnchorSignedPsbtFinalizer#finalize(). `broadcast()` does exactly
// one thing: hand the exact hex the finalizer produced to an injected
// capability, and translate whatever that capability reports into this
// class's own narrow, three-outcome vocabulary. See docs/Principles.md,
// "Broadcasting Submits; It Does Not Decide (0.8.52)."
//
// ACCEPTS ONLY FINALIZED TRANSACTION BYTES, NEVER A PSBT. `broadcast()`
// takes exactly the two fields BitcoinAnchorSignedPsbtFinalizer#finalize()
// produces on success — `txid` and `rawTransaction` — never a PSBT, never
// a `description`, never anything a caller could hand it that still needs
// signing or finalizing. There is no code path in this file that parses,
// walks, or interprets PSBT bytes. This preserves the trust boundary the
// whole 0.8.47→0.8.51 sequence built: by the time anything reaches this
// class, "is this transaction valid" is already a closed question.
//
// `txid` AND `rawTransaction` ARE INTERNAL, ALREADY-TRUSTED ARTIFACTS —
// TREATED LIKE ONE. Mirroring exactly how anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js treats its own `description` (an
// already-known-good internal artifact, re-validated and thrown on if
// malformed) and how anchoring/BitcoinAnchorPublisher.js treats its own
// `contentHash` (a caller-contract violation, checked before the
// broadcaster is ever consulted): a malformed `txid` or `rawTransaction`
// — the wrong shape, or a `bytes`/`hex` pair that disagree with each other
// — throws, immediately, before the injected broadcaster is ever called.
// This is not the untrusted-external-input posture; `txid` and
// `rawTransaction` did not arrive from a wallet or the network, they came
// from this codebase's own finalizer.
//
// THE REPORTED txid IS NEVER TAKEN FROM THE BROADCASTER'S OWN RESPONSE.
// The only txid this class ever reports back is the one the caller
// supplied — the one BitcoinAnchorSignedPsbtFinalizer already derived,
// cryptographically, from the exact bytes being submitted. Whatever an
// injected broadcaster's response claims about "the" txid (if anything) is
// read only far enough to decide accepted/rejected/unavailable, and then
// discarded. This is deliberate, not an oversight: the injected
// broadcaster talks to an external system this class does not control,
// and an external system's own self-reported identifier for what it just
// accepted is exactly the kind of untrusted claim this codebase has
// refused to take at face value at every boundary before this one. A
// `{ broadcasted: true }` result can therefore never carry a txid this
// class fabricated or mis-copied from a confused or malicious response —
// see this file's own tests, "no broadcaster failure or malformed
// response ever changes the reported txid."
//
// NEVER RE-SIGNS, RE-BUILDS, OR RETRIES WITH A DIFFERENT TRANSACTION. A
// rejection is reported and stops there. This class holds no retry logic,
// no fee-bump path, and no fallback that would submit anything other than
// the exact bytes it was handed — see docs/Roadmap.md, 0.8.52, "One
// important security rule."
//
// A `broadcaster` has exactly this shape — the identical injected-
// capability discipline anchoring/BitcoinAnchorPublisher.js has held
// since 0.8.9, sized for what THIS class actually submits (a fully
// finalized raw transaction, not a raw OP_RETURN payload):
//
//   { broadcast(rawTransactionHex) ->
//       { broadcast: true [, txid] }
//           — accepted; any `txid` in the response is read then discarded,
//             per this file's own header, above.
//       | { broadcast: false, reason }
//           — a DEFINITE no: the endpoint was reached and refused this
//             exact transaction (e.g. non-standard, already spent).
//       | { broadcast: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: no connectivity, a timeout, a 5xx.
//             NEVER treated as a rejection.
//     (sync return or Promise — broadcast() always awaits it) }
//
// Throwing is tolerated as a last resort — broadcast() catches it and
// reports the `unavailable` form, never the definite-rejection form —
// mirroring exactly how anchoring/BitcoinAnchorPublisher.js already
// treats a throwing broadcaster, and application/
// ExternalAnchorVerifier.js a throwing proofVerifier.
export class BitcoinAnchorTransactionBroadcaster {
    constructor({ broadcaster } = {}) {
        if (!broadcaster || typeof broadcaster.broadcast !== 'function') {
            throw new Error('BitcoinAnchorTransactionBroadcaster: a transaction broadcaster is required');
        }
        this._broadcaster = broadcaster;
    }

    // Matches every other anchoring/ class's own anchorType exactly — the
    // same external protocol, one more stage of it.
    get anchorType() { return 'bitcoin-op-return'; }

    // Resolves to exactly one of:
    //
    //   { broadcasted: true, txid }
    //   { broadcasted: false, reason }
    //       — the injected broadcaster reached a definite no.
    //   { broadcasted: false, unavailable: true, reason }
    //       — cannot presently broadcast; retrying later may succeed.
    //
    // Throws only for a malformed `txid` or `rawTransaction` — a caller
    // contract violation, checked before the injected broadcaster is ever
    // consulted. Never throws for the injected broadcaster's own
    // operational failure.
    async broadcast({ txid, rawTransaction } = {}) {
        const expectedTxid = validateTxid(txid);
        const hex = validateRawTransaction(rawTransaction);

        let result;
        try {
            result = await this._broadcaster.broadcast(hex);
        } catch (error) {
            return { broadcasted: false, unavailable: true, reason: error.message };
        }

        if (!result || typeof result !== 'object' || result.broadcast !== true) {
            return {
                broadcasted: false,
                unavailable: !!(result && result.unavailable),
                reason: (result && typeof result.reason === 'string' && result.reason) || 'broadcaster declined to broadcast this transaction'
            };
        }

        return { broadcasted: true, txid: expectedTxid };
    }
}

function validateTxid(txid) {
    if (typeof txid !== 'string' || !TXID_PATTERN.test(txid)) {
        throw new Error('BitcoinAnchorTransactionBroadcaster: txid must be the 32-byte hex transaction id produced by BitcoinAnchorSignedPsbtFinalizer#finalize()');
    }
    return txid.toLowerCase();
}

function validateRawTransaction(rawTransaction) {
    if (!rawTransaction || typeof rawTransaction !== 'object') {
        throw new Error('BitcoinAnchorTransactionBroadcaster: rawTransaction is required — pass the { bytes, hex } produced by BitcoinAnchorSignedPsbtFinalizer#finalize()');
    }
    const { bytes, hex } = rawTransaction;
    if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) {
        throw new Error('BitcoinAnchorTransactionBroadcaster: rawTransaction.hex must be a non-empty, even-length hex string');
    }
    if (!(bytes instanceof Uint8Array)) {
        throw new Error('BitcoinAnchorTransactionBroadcaster: rawTransaction.bytes must be a Uint8Array');
    }
    if (bytesToHex(bytes) !== hex.toLowerCase()) {
        throw new Error('BitcoinAnchorTransactionBroadcaster: rawTransaction.bytes and rawTransaction.hex do not agree — internal inconsistency, refusing to broadcast');
    }
    return hex.toLowerCase();
}

function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
