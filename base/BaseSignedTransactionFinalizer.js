import { decodeBaseSignedTransaction } from './BaseSignedTransactionCodec.js';
import { requireRealBasePublicationTransactionPlan } from '../application/BasePublicationTransactionReview.js';

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// `base/BaseTransactionSigner.js` (0.8.93) stops the moment a wallet
// returns SOME `rawTransaction` — its own header names exactly what is
// still missing: "Genuinely confirming a wallet's claimed signature
// belongs to the exact transaction this milestone asked to have signed
// is this codebase's own deliberately separate next milestone." This
// class is that milestone, held to the identical principle `anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js` (0.8.51) already established one
// chain over:
//
//   A signed transaction must be independently verified against the
//   exact reviewed plan before it becomes eligible for broadcast.
//
//   { network, chainId, from, to, value, data,
//     nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas }   an already-
//                                                              CONSTRUCTED,
//                                                              FROZEN plan
//                                                              (0.8.91)
//           │
//           │                    "0x02f8...aabbcc"   a claimed SIGNED
//           │                    (external, untrusted wallet output)
//           │                            │
//           │                            ▼
//           │              base/BaseSignedTransactionCodec.js
//           │              decodeBaseSignedTransaction()
//           │                            │
//           │            ┌───────────────┴────────────────┐
//           │            ▼                                 ▼
//           │   { decoded: false, ... }          { decoded: true,
//           │            │                          transaction: { ...,
//           │            │                            from: RECOVERED } }
//           │            │                                 │
//           ▼            ▼                                 ▼
//   BaseSignedTransactionFinalizer.finalize({ plan, rawTransaction })  (THIS FILE)
//           │
//   ┌───────┴──────────────────────────────────┐
//   ▼                                            ▼
// { finalized: true,                    { finalized: false,
//   finalizedTransaction }                invalidSignature, reason }
//
// THE PLAN IS THE ONLY SOURCE OF EXPECTED FACTS — NEVER THE NETWORK, AND
// NEVER A FRESH RE-REVIEW. `finalize()` makes no RPC call, imports no
// `base/BaseJsonRpcClient.js`, and never re-derives `application/
// BasePublicationTransactionReview.js`'s own projection. Every expected
// field comes from `plan` exactly as `application/
// BasePublicationTransactionPlanCoordinator.js#construct()` (0.8.91)
// originally froze it — a caller who lets the network's own current
// nonce or fees drift after constructing `plan` still finalizes against
// the ORIGINAL plan, never a fresher one. See `docs/Roadmap.md`, 0.8.94,
// test "A": "Construct P, sign it, change the RPC's current nonce/fees,
// then finalize the old signed artifact. The finalizer must use the
// original P. No RPC calls."
//
// DO NOT TRUST THE SIGNED TRANSACTION'S CLAIMED `from` — THERE ISN'T ONE.
// An EIP-1559 transaction's own serialized fields are `chainId, nonce,
// maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
// accessList, signatureYParity, signatureR, signatureS` — `from` is never
// among them. `base/BaseSignedTransactionCodec.js#decodeBaseSignedTransaction()`
// cryptographically RECOVERS it from the signature via secp256k1 public-key
// recovery, and this class compares that RECOVERED address against
// `plan.from` — never a caller-supplied string standing in for it. See
// `docs/Roadmap.md`, 0.8.94: "recovered signer === reviewed plan.from,
// without trusting a caller-supplied address."
//
// A STRUCTURAL MISMATCH IS CAUGHT BEFORE CRYPTOGRAPHY EVER RUNS —
// MIRRORING `anchoring/BitcoinAnchorSignedPsbtFinalizer.js`'s OWN
// STRUCTURAL-INSPECTION-FIRST ORDER. `chainId`, `nonce`, `gasLimit`,
// `maxFeePerGas`, `maxPriorityFeePerGas`, `to`, `value`, `data`, and
// `accessListLength` are compared against `plan`'s own frozen fields
// BEFORE the recovered `from` is ever consulted. A modified nonce, a
// substituted destination, a different commitment in `data`, or a
// transaction signed for a different chain id are every one of them
// caught here — `{ finalized: false, invalidSignature: false, reason }` —
// exactly the same class of fact `anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js`'s own unchanged 0.8.50 inspection
// boundary already catches before Bitcoin's own cryptography ever runs.
// This is deliberate: a signature over the WRONG transaction is not "an
// invalid signature" in the narrow cryptographic sense this class reserves
// that word for — see `invalidSignature` below.
//
// `invalidSignature` NAMES A GENUINE CRYPTOGRAPHIC FACT, NEVER A STRUCTURAL
// ONE — SET BY THIS CLASS DIRECTLY, NEVER GUESSED FROM REASON TEXT. Unlike
// `anchoring/BitcoinAnchorSignedPsbtFinalizationCoordinator.js`'s own
// `CRYPTOGRAPHIC_VERIFICATION_FAILURE_MARKERS` (a list of reason
// substrings a SEPARATE coordinator class matches against, because the
// Bitcoin finalizer predates having a caller that needed the
// distinction), this class was designed together with its own
// coordinator and simply sets `invalidSignature: true`/`false` on every
// non-finalized result — a structural fact its own caller reads directly,
// never a string it has to pattern-match. `invalidSignature: true` is set
// in exactly two cases: (1) the signature bytes themselves do not
// cryptographically recover to any valid public key at all (an
// out-of-range `r`/`s`, an `x`-coordinate with no valid curve point, a
// recovered point at infinity — `base/
// BaseSignedTransactionCodec.js`'s own `cryptographicFailure: true`), and
// (2) the signature recovers to a real public key, but the address it
// recovers to does not match `plan.from` — a DEFINITE case of "signed by
// the wrong account," stronger than merely comparing a supplied `from`
// string. See `docs/Roadmap.md`, 0.8.94, test "C": "Sign the same
// transaction with another account: stronger than comparing a supplied
// `from` string."
//
// FINALIZED MEANS EXACTLY ONE THING, AND NOTHING BROADER. The signed
// artifact was successfully decoded, its structural fields correspond
// field-for-field to the reviewed plan, and the transaction was
// cryptographically signed by the exact account named in `plan.from`. It
// does NOT mean broadcast, accepted by Base, included in a block,
// confirmed, published, or immutable — those remain entirely separate,
// later facts (`docs/Roadmap.md`, 0.8.95 and 0.8.96). `FINALIZED ≠
// BROADCASTED`, `BROADCASTED ≠ CONFIRMED` — the identical discipline this
// codebase already holds for Bitcoin.
//
// THE PLAN, THE SIGNED BYTES, AND THE FINALIZED ARTIFACT ARE THREE,
// SEPARATE OBJECTS — NEVER MERGED. `finalize()` never mutates `plan`,
// never mutates or wraps `rawTransaction`, and returns a wholly new
// `finalizedTransaction` object a caller can hand to a future broadcaster
// without that broadcaster ever needing to reconstruct anything from
// `plan` or re-decode `rawTransaction` itself.
//
// NEVER BROADCASTS, NEVER RETRIES, NEVER RECONSTRUCTS. This class imports
// no broadcaster of any kind and calls nothing broadcast-shaped — see
// `docs/Roadmap.md`, 0.8.94, test "I": `broadcastCalls === 0` throughout
// finalization. A FAILED or INVALID_SIGNATURE result is the end of this
// finalization attempt: this class never re-signs, never substitutes a
// different transaction, and never adjusts a fee, nonce, or gas value on
// a person's behalf — transaction replacement and fee bumping are
// explicitly out of scope for this milestone (`docs/Roadmap.md`, 0.8.94,
// "What I would deliberately exclude").
//
// `plan` MUST BE A REAL, ALREADY-CONSTRUCTED PLAN — NO DUCK TYPING.
// Re-validated via `application/BasePublicationTransactionReview.js`'s
// own exported `requireRealBasePublicationTransactionPlan()` — the
// identical field-by-field, already-known-good-internal-artifact check
// `base/BaseTransactionSigner.js` (0.8.93) already performs, reused
// verbatim rather than duplicated. A malformed `plan` is a
// caller-contract violation and throws, before `rawTransaction` is ever
// consulted.
//
// `rawTransaction` IS NEVER TRUSTED, AND NEVER THROWS. External,
// untrusted wallet output — every failure to decode, structurally match,
// or cryptographically verify it is reported as an operational
// `{ finalized: false, invalidSignature, reason }` outcome, never a
// thrown error. See `base/BaseSignedTransactionCodec.js`'s own identical
// posture.
//
// SYNCHRONOUS, OFFLINE, ZERO CRYPTOGRAPHY OF ITS OWN. `finalize()` makes
// no network call of any kind and performs no cryptography itself — every
// bit of RLP decoding, Keccak-256 hashing, and secp256k1 recovery lives
// in `base/BaseSignedTransactionCodec.js` alone (see `docs/Roadmap.md`,
// 0.8.94, "Cryptography belongs here, not in the coordinator" — extended
// one layer further still: it belongs in the codec, not even in this
// finalizer). This class owns exactly one thing: comparing a decoded,
// structured signed transaction against an already-constructed plan.
export class BaseSignedTransactionFinalizer {
    // Resolves synchronously (no network, no async work of any kind) to
    // exactly one of:
    //
    //   { finalized: true, invalidSignature: false, reason: null,
    //       finalizedTransaction: { rawTransaction, transactionHash, from,
    //         to, network, chainId, nonce, gasLimit, maxFeePerGas,
    //         maxPriorityFeePerGas, value, data } }
    //   { finalized: false, invalidSignature: false, reason }
    //       — a structural fact: the signed bytes could not be decoded, an
    //         unsupported envelope type or a non-empty access list, or a
    //         decoded field that does not match `plan`.
    //   { finalized: false, invalidSignature: true, reason }
    //       — a genuine cryptographic fact: the signature does not
    //         recover to any valid public key, or it recovers to an
    //         account other than `plan.from`.
    //
    // Throws only for a malformed `plan` (a caller-contract violation,
    // checked before `rawTransaction` is ever consulted) — see this
    // file's own header.
    finalize({ plan, rawTransaction } = {}) {
        requireRealBasePublicationTransactionPlan(plan);

        const decoded = decodeBaseSignedTransaction(rawTransaction);
        if (!decoded.decoded) {
            return outcome(false, decoded.cryptographicFailure, decoded.reason);
        }
        const transaction = decoded.transaction;

        const structuralMismatch = firstStructuralMismatch(plan, transaction);
        if (structuralMismatch) {
            return outcome(false, false, structuralMismatch);
        }

        if (transaction.from.toLowerCase() !== plan.from.toLowerCase()) {
            return outcome(false, true, `the signed transaction was signed by ${transaction.from}, which does not match the reviewed plan's own from address ${plan.from}`);
        }

        return outcome(true, false, null, Object.freeze({
            rawTransaction,
            transactionHash: transaction.transactionHash,
            from: transaction.from,
            to: transaction.to,
            network: plan.network,
            chainId: transaction.chainId,
            nonce: transaction.nonce,
            gasLimit: transaction.gasLimit,
            maxFeePerGas: transaction.maxFeePerGas,
            maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
            value: transaction.value,
            data: transaction.data
        }));
    }
}

function outcome(finalized, invalidSignature, reason, finalizedTransaction = null) {
    return { finalized, invalidSignature, reason, finalizedTransaction };
}

// Every field that defines the transaction being authorized, checked in a
// fixed order so a caller always sees the SAME field named first for a
// transaction that differs in more than one place — never a different
// field depending on object key iteration order. `to`/`from`/`data` are
// compared case-insensitively (hex letters), everything else exactly.
function firstStructuralMismatch(plan, transaction) {
    if (transaction.chainId !== plan.chainId) {
        return `the signed transaction's chainId (${transaction.chainId}) does not match the reviewed plan's own chainId (${plan.chainId})`;
    }
    if (transaction.nonce !== plan.nonce) {
        return `the signed transaction's nonce (${transaction.nonce}) does not match the reviewed plan's own nonce (${plan.nonce})`;
    }
    if (transaction.gasLimit !== plan.gasLimit) {
        return `the signed transaction's gasLimit (${transaction.gasLimit}) does not match the reviewed plan's own gasLimit (${plan.gasLimit})`;
    }
    if (transaction.maxFeePerGas !== plan.maxFeePerGas) {
        return `the signed transaction's maxFeePerGas (${transaction.maxFeePerGas}) does not match the reviewed plan's own maxFeePerGas (${plan.maxFeePerGas})`;
    }
    if (transaction.maxPriorityFeePerGas !== plan.maxPriorityFeePerGas) {
        return `the signed transaction's maxPriorityFeePerGas (${transaction.maxPriorityFeePerGas}) does not match the reviewed plan's own maxPriorityFeePerGas (${plan.maxPriorityFeePerGas})`;
    }
    if (transaction.to.toLowerCase() !== plan.to.toLowerCase()) {
        return `the signed transaction's to address (${transaction.to}) does not match the reviewed plan's own to address (${plan.to})`;
    }
    if (transaction.value !== plan.value) {
        return `the signed transaction's value (${transaction.value}) does not match the reviewed plan's own value (${plan.value})`;
    }
    if (transaction.data.toLowerCase() !== plan.data.toLowerCase()) {
        return `the signed transaction's data (${transaction.data}) does not match the reviewed plan's own data (${plan.data}) — the commitment being published has changed`;
    }
    if (transaction.accessListLength !== 0) {
        return `the signed transaction carries an access list (${transaction.accessListLength} entries), which was never part of the reviewed plan`;
    }
    return null;
}
