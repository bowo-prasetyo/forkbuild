import { BaseSignedTransactionFinalizationState } from './BaseSignedTransactionFinalizationState.js';

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// `base/BaseSignedTransactionFinalizer.js` already carries EVERY
// invariant this milestone exists to expose behind an explicit button:
// structural re-validation of the reviewed plan, RLP decoding, Keccak-256
// hashing, secp256k1 sender recovery, field-by-field structural
// comparison, and finalized-artifact construction. Nothing about that
// class changes here — this coordinator is a deliberately thin wiring on
// top of it, mirroring exactly the shape `application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js` (0.8.63) already
// established one chain over:
//
//   { plan, rawTransaction }
//           │
//           │ explicit "Verify & Finalize Transaction" click
//           ▼
//   BaseSignedTransactionFinalizationCoordinator.finalize()   (THIS FILE — new)
//           │
//           ▼
//   base/BaseSignedTransactionFinalizer.js#finalize()   (THIS MILESTONE,
//           │                                             sibling file,
//           │                                             UNCHANGED by
//           │                                             this class)
//           ▼
//   { finalized: true, finalizedTransaction }        ──► FINALIZED
// | { finalized: false, invalidSignature: true, ... }  ──► INVALID_SIGNATURE
// | { finalized: false, invalidSignature: false, ... } ──► FAILED
//
// NO NEW CRYPTOGRAPHY, RLP DECODING, OR COMPARISON LOGIC BELONGS HERE, AND
// NONE IS ADDED. This class computes no hash, recovers no public key, and
// compares no transaction field of its own. It calls the unchanged
// finalizer exactly once per `finalize()` call and does nothing with the
// result except translate it into `application/
// BaseSignedTransactionFinalizationState.js`'s own six-value vocabulary.
//
// INVALID_SIGNATURE IS READ DIRECTLY OFF `invalidSignature`, NEVER GUESSED
// FROM REASON TEXT. Unlike `application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js`'s own
// `CRYPTOGRAPHIC_VERIFICATION_FAILURE_MARKERS` (a list of reason
// substrings matched against a Bitcoin finalizer that predates having a
// caller needing the distinction), `base/
// BaseSignedTransactionFinalizer.js` was designed together with this
// coordinator and reports the distinction as a structural fact —
// `invalidSignature: true`/`false` — on every non-finalized result. This
// class reads that flag directly; see that file's own header,
// "`invalidSignature` NAMES A GENUINE CRYPTOGRAPHIC FACT."
//
// FINALIZED IS AN EPHEMERAL, PER-ATTEMPT FACT — NEVER A NEW HISTORY, AND
// NEVER A PLACEMENT, PUBLICATION, OR BROADCAST-ELIGIBILITY CLAIM. This
// class holds no state of its own across calls and appends nothing to any
// publication history. Whether — and how — a caller chooses to preserve a
// FINALIZED outcome's own `finalizedTransaction` for a later, separately
// explicit broadcast action is entirely the caller's own concern; this
// coordinator returns the fact once and forgets it.
//
// NO AUTOMATIC BROADCAST, RETRY, RE-SIGN, OR RECONSTRUCTION OF ANY KIND. A
// FINALIZED result never itself broadcasts anything — no broadcast
// capability of any kind is imported or called anywhere in this file. An
// INVALID_SIGNATURE or FAILED result is the end of this finalization
// attempt: this class never retries, never re-requests a signature, never
// substitutes a different transaction, and never adjusts a fee, nonce, or
// gas value on a person's behalf.
//
// FAILED IS FOR AN UNACCEPTABLE OR UNVERIFIABLE RESULT, NEVER FOR THIS
// COORDINATOR'S OWN CALLER-CONTRACT VIOLATIONS. A missing `plan` or
// `rawTransaction` is a UI-layer bug — the caller never reaches this
// method without first having a genuinely SIGNED outcome in hand — and is
// refused by throwing, checked before the finalizer is ever consulted,
// mirroring exactly how `application/BaseReviewedSigningCoordinator.js#sign()`
// itself throws for its own missing arguments. A malformed `plan` reaching
// the finalizer itself still throws — see `base/
// BaseSignedTransactionFinalizer.js`'s own header, "Throws only for a
// malformed `plan`" — and this class deliberately never catches that
// throw into a FAILED outcome, for the identical reason: it is a
// caller-contract violation, not an operational outcome about the signed
// bytes themselves.
export class BaseSignedTransactionFinalizationCoordinator {
    constructor({ baseSignedTransactionFinalizer } = {}) {
        if (!baseSignedTransactionFinalizer || typeof baseSignedTransactionFinalizer.finalize !== 'function') {
            throw new Error('BaseSignedTransactionFinalizationCoordinator: a BaseSignedTransactionFinalizer is required');
        }
        this._finalizer = baseSignedTransactionFinalizer;
    }

    // Resolves to exactly one of:
    //
    //   { state: FINALIZED, finalized: true, finalizedTransaction,
    //       reason: null }
    //   { state: INVALID_SIGNATURE, finalized: false,
    //       finalizedTransaction: null, reason }
    //       — the signature does not cryptographically recover to any
    //         valid public key, or it recovers to an account other than
    //         the reviewed plan's own `from`.
    //   { state: FAILED, finalized: false, finalizedTransaction: null,
    //       reason }
    //       — the finalization operation could not be completed for any
    //         other reason (decode failure, unsupported envelope type, a
    //         non-empty access list, or a structural field mismatch).
    //
    // Synchronous — `base/BaseSignedTransactionFinalizer.js` itself
    // performs no async work of any kind, so neither does this method.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // finalizer is ever consulted — a missing `plan` or `rawTransaction`
    // — or one the finalizer itself already throws for (a malformed
    // `plan`) — see this file's own header.
    finalize({ plan, rawTransaction } = {}) {
        if (!plan || typeof plan !== 'object') {
            throw new Error('BaseSignedTransactionFinalizationCoordinator: plan is required — sign a transaction before ever requesting finalization');
        }
        if (typeof rawTransaction !== 'string' || !rawTransaction) {
            throw new Error('BaseSignedTransactionFinalizationCoordinator: rawTransaction is required — sign a transaction before ever requesting finalization');
        }

        const result = this._finalizer.finalize({ plan, rawTransaction });

        if (result.finalized === true) {
            return this._outcome(BaseSignedTransactionFinalizationState.FINALIZED, {
                finalized: true,
                finalizedTransaction: result.finalizedTransaction
            });
        }

        const state = result.invalidSignature === true
            ? BaseSignedTransactionFinalizationState.INVALID_SIGNATURE
            : BaseSignedTransactionFinalizationState.FAILED;
        return this._outcome(state, { reason: result.reason });
    }

    _outcome(state, { finalized = false, finalizedTransaction = null, reason = null } = {}) {
        return Object.freeze({ state, finalized, finalizedTransaction, reason });
    }
}
