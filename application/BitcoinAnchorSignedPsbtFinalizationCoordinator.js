import { BitcoinAnchorSignedPsbtFinalizationState } from './BitcoinAnchorSignedPsbtFinalizationState.js';

// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
//
// anchoring/BitcoinAnchorSignedPsbtFinalizer.js (0.8.51) already carries
// EVERY invariant this milestone exists to expose behind an explicit
// button — structural re-validation, BIP143 sighash calculation,
// public-key authority, secp256k1 verification, supported script type
// enforcement, and final transaction construction. Nothing about that
// class changes here — this coordinator is a deliberately thin wiring on
// top of it, mirroring EXACTLY the shape application/
// BitcoinAnchorReviewedSigningCoordinator.js (0.8.62) already established
// one stage earlier for anchoring/BitcoinAnchorReviewedPsbtSigner.js:
//
//   { description, signedPsbt }
//           │
//           │ explicit "Verify & Finalize Transaction" click
//           ▼
//   BitcoinAnchorSignedPsbtFinalizationCoordinator.finalize()   (THIS FILE — new)
//           │
//           ▼
//   anchoring/BitcoinAnchorSignedPsbtFinalizer.js#finalize()   (0.8.51, UNCHANGED)
//           │
//           ▼
//   { finalized: true, txid, rawTransaction, verifiedInputs }  ──► FINALIZED
// | { finalized: false, reason: <a cryptographic verification failure> }
//                                                               ──► INVALID_SIGNATURE
// | { finalized: false, reason: <anything else> }              ──► FAILED
//
// NO NEW CRYPTOGRAPHY BELONGS HERE, AND NONE IS ADDED. This class computes
// no hash, verifies no signature, and re-implements no part of BIP143 or
// secp256k1. It calls the unchanged 0.8.51 finalizer exactly once per
// `finalize()` call and does nothing with the result except translate it
// into application/BitcoinAnchorSignedPsbtFinalizationState.js's own
// six-value vocabulary.
//
// WHY INVALID_SIGNATURE AND FAILED ARE DISTINGUISHED BY REASON TEXT, NOT BY
// A SECOND IMPLEMENTATION. anchoring/BitcoinAnchorSignedPsbtFinalizer.js
// itself reports every non-finalized outcome through the identical
// `{ finalized: false, reason }` shape, regardless of WHERE in its own
// pipeline the failure occurred — a structural mismatch caught by the
// unchanged 0.8.50 inspector, a PSBT that could not be decoded, an
// unsupported script type, and a genuine cryptographic verification
// failure are all reported the same way. Splitting these into two states
// without re-deriving the finalizer's own cryptography means recognizing
// its own, already-stable, documented failure phrasing — the identical
// posture application/BitcoinAnchorReviewedSigningCoordinator.js's own
// tests already take toward matching known reason substrings (e.g.
// `/no longer matches/`, `/does not match the intended transaction/`).
// `CRYPTOGRAPHIC_VERIFICATION_FAILURE_MARKERS` below names exactly, and
// only, the four reason fragments anchoring/BitcoinAnchorSignedPsbtFinalizer.js
// itself produces once it has reached genuine per-input cryptographic
// verification: a public key without proven authority over the script it
// spends, an invalid curve point, an out-of-range signature, and a
// signature that does not satisfy the computed sighash. Every other
// `{ finalized: false, reason }` this class can ever produce — a
// structural mismatch (never reaches cryptography at all), a decode
// failure, an unsupported script type — is reported as FAILED, honestly
// naming that no signature was ever actually cryptographically checked.
//
// FINALIZED IS AN EPHEMERAL, PER-ATTEMPT FACT — NEVER A NEW HISTORY, AND
// NEVER A PLACEMENT, ANCHOR, OR PUBLICATION CLAIM. This class holds no
// state of its own across calls and appends nothing to any acquisition,
// placement, or publication history. Whether — and how — a caller chooses
// to preserve a FINALIZED outcome's own `rawTransaction` for a later,
// separately explicit broadcast action is entirely the caller's own
// concern; this coordinator returns the fact once and forgets it.
//
// NO AUTOMATIC BROADCAST, RETRY, RE-SIGN, OR RECONSTRUCTION OF ANY KIND. A
// FINALIZED result never itself broadcasts anything — anchoring/
// BitcoinAnchorTransactionBroadcaster.js (0.8.52) is neither imported nor
// called anywhere in this file. An INVALID_SIGNATURE or FAILED result is
// the end of this finalization attempt: this class never retries, never
// re-requests a signature, never substitutes a different transaction, and
// never adjusts a fee on a person's behalf. See docs/Principles.md,
// "Cryptographic Failure Terminates This Signing Attempt (0.8.63)."
//
// FAILED IS FOR AN UNACCEPTABLE OR UNVERIFIABLE RESULT, NEVER FOR THIS
// COORDINATOR'S OWN CALLER-CONTRACT VIOLATIONS. A missing `description` or
// `signedPsbt` is a UI-layer bug — the caller never reaches this method
// without first having a genuinely SIGNED outcome in hand — and is refused
// by throwing, checked before the finalizer is ever consulted, mirroring
// exactly how application/BitcoinAnchorReviewedSigningCoordinator.js#sign()
// itself throws for its own missing arguments. A malformed `description`
// reaching the finalizer itself still throws — see anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js's own header, "Throws only for a
// malformed `description`" — and this class deliberately never catches
// that throw into a FAILED outcome, for the identical reason: it is a
// caller-contract violation, not an operational Bitcoin-network or
// cryptographic outcome.
export class BitcoinAnchorSignedPsbtFinalizationCoordinator {
    constructor({ bitcoinAnchorSignedPsbtFinalizer } = {}) {
        if (!bitcoinAnchorSignedPsbtFinalizer || typeof bitcoinAnchorSignedPsbtFinalizer.finalize !== 'function') {
            throw new Error('BitcoinAnchorSignedPsbtFinalizationCoordinator: a BitcoinAnchorSignedPsbtFinalizer is required');
        }
        this._finalizer = bitcoinAnchorSignedPsbtFinalizer;
    }

    // Resolves to exactly one of:
    //
    //   { state: FINALIZED, finalized: true, txid, rawTransaction,
    //       verifiedInputCount, reason: null }
    //   { state: INVALID_SIGNATURE, finalized: false, txid: null,
    //       rawTransaction: null, verifiedInputCount: null, reason }
    //       — the signed PSBT reached genuine cryptographic verification
    //         and failed it.
    //   { state: FAILED, finalized: false, txid: null, rawTransaction: null,
    //       verifiedInputCount: null, reason }
    //       — the finalization operation could not be completed for any
    //         other reason (structural mismatch, decode failure, or an
    //         unsupported script type).
    //
    // Synchronous — anchoring/BitcoinAnchorSignedPsbtFinalizer.js itself
    // performs no async work of any kind, so neither does this method.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // finalizer is ever consulted — a missing `description` or
    // `signedPsbt` — or one the finalizer itself already throws for (a
    // malformed `description`) — see this file's own header.
    finalize({ description, signedPsbt } = {}) {
        if (!description || typeof description !== 'object') {
            throw new Error('BitcoinAnchorSignedPsbtFinalizationCoordinator: description is required — sign a transaction before ever requesting finalization');
        }
        if (signedPsbt === undefined || signedPsbt === null) {
            throw new Error('BitcoinAnchorSignedPsbtFinalizationCoordinator: signedPsbt is required — sign a transaction before ever requesting finalization');
        }

        const result = this._finalizer.finalize({ description, signedPsbt });

        if (result.finalized === true) {
            return this._outcome(BitcoinAnchorSignedPsbtFinalizationState.FINALIZED, {
                finalized: true,
                txid: result.txid,
                rawTransaction: result.rawTransaction,
                verifiedInputCount: result.verifiedInputs ? result.verifiedInputs.length : null
            });
        }

        const state = isCryptographicVerificationFailure(result.reason)
            ? BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE
            : BitcoinAnchorSignedPsbtFinalizationState.FAILED;
        return this._outcome(state, { reason: result.reason });
    }

    _outcome(state, { finalized = false, txid = null, rawTransaction = null, verifiedInputCount = null, reason = null } = {}) {
        return Object.freeze({ state, finalized, txid, rawTransaction, verifiedInputCount, reason });
    }
}

// Exactly, and only, the reason fragments anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js itself produces once it has reached
// genuine per-input cryptographic verification — see this file's own
// header, "WHY INVALID_SIGNATURE AND FAILED ARE DISTINGUISHED BY REASON
// TEXT, NOT BY A SECOND IMPLEMENTATION." A structural mismatch (caught by
// the unchanged 0.8.50 inspector before any cryptography is attempted), a
// decode failure, or an unsupported script type never matches any of
// these, and correctly falls through to FAILED instead.
const CRYPTOGRAPHIC_VERIFICATION_FAILURE_MARKERS = [
    'does not cryptographically verify',
    'does not correspond to the P2WPKH script being spent',
    'is not a valid secp256k1 point',
    'is out of the valid range'
];

function isCryptographicVerificationFailure(reason) {
    return typeof reason === 'string' && CRYPTOGRAPHIC_VERIFICATION_FAILURE_MARKERS.some((marker) => reason.includes(marker));
}
