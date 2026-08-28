// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// The vocabulary `application/BaseSignedTransactionFinalizationCoordinator.js`
// reports its own explicit "Verify & Finalize Transaction" attempt
// through, and the UI drives its own finalize button and result from —
// the identical "name the difference structurally, not by convention"
// discipline every other `*State.js` vocabulary in this codebase already
// holds, mirroring `application/
// BitcoinAnchorSignedPsbtFinalizationState.js`'s own header (0.8.63)
// exactly, one chain over:
//
//   IDLE              — no finalization attempt has been made yet for the
//                        current signed transaction. The starting state,
//                        and the state after a fresh "Sign Reviewed
//                        Transaction" click OR a fresh "Create Base
//                        Transaction Plan" click replaces whatever was
//                        previously signed — a newly signed transaction
//                        always starts unfinalized again, never inheriting
//                        a previous attempt's own FINALIZED outcome. See
//                        `application/BaseReviewedSigningState.js`'s own
//                        header, the identical restraint one stage
//                        earlier.
//   FINALIZING        — a finalization attempt is in flight. `base/
//                        BaseSignedTransactionFinalizer.js` performs no
//                        network call and resolves synchronously — this
//                        state is necessarily as brief as `application/
//                        BasePublicationTransactionPlanState.js`'s own
//                        CONSTRUCTING is for a purely local computation,
//                        kept only for the identical "attempt is in
//                        flight" vocabulary symmetry every other
//                        coordinator on this page already holds.
//   FINALIZED         — the signed transaction was independently decoded,
//                        its structural fields (chainId, nonce, gasLimit,
//                        maxFeePerGas, maxPriorityFeePerGas, to, value,
//                        data) proven to match the reviewed plan
//                        field-for-field, and its signature
//                        cryptographically proven to have been produced by
//                        the exact account named in the plan's own `from`
//                        — a real secp256k1 public-key recovery, never a
//                        comparison against a caller-supplied `from`
//                        string. This is the FIRST state in this whole
//                        pipeline that has ever cryptographically checked
//                        a wallet's own claim rather than merely accepting
//                        that it returned SOME bytes — see `application/
//                        BaseReviewedSigningState.js`'s own header,
//                        "SIGNED IS NOT VERIFIED, AND NOT YET EVEN
//                        STRUCTURALLY INSPECTED," which this state is the
//                        answer to.
//   INVALID_SIGNATURE — a genuine cryptographic fact, never a structural
//                        one: either the signature bytes do not
//                        cryptographically recover to any valid public key
//                        at all, or they recover to a real account that is
//                        NOT the account named in the reviewed plan's own
//                        `from` — signed by the wrong account. Deliberately
//                        distinct from FAILED — see `application/
//                        BaseSignedTransactionFinalizationCoordinator.js`'s
//                        own header on exactly which of `base/
//                        BaseSignedTransactionFinalizer.js`'s own outcomes
//                        reach this state.
//   FAILED            — the finalization operation could not be completed
//                        for a reason other than an invalid signature: the
//                        signed bytes could not even be RLP-decoded, an
//                        unsupported transaction envelope type (not
//                        EIP-1559), a non-empty access list, or a decoded
//                        field — chainId, nonce, gasLimit, maxFeePerGas,
//                        maxPriorityFeePerGas, to, value, or data — that
//                        does not match the reviewed plan. A signature over
//                        the WRONG transaction is a structural fact about
//                        WHAT was signed, never a claim about whether the
//                        cryptography itself is sound.
//   UNAVAILABLE       — reserved for an inability to perform some external
//                        operation this finalization boundary would need —
//                        exactly the meaning `application/
//                        BaseReviewedSigningState.js`'s own UNAVAILABLE
//                        already holds for a missing wallet. `base/
//                        BaseSignedTransactionFinalizer.js` is a purely
//                        offline, synchronous check with no network call
//                        and no external dependency of any kind — see that
//                        file's own header — so nothing in this codebase
//                        today ever produces this state. It stays in the
//                        vocabulary, honestly unreached, rather than
//                        removed, mirroring `application/
//                        BitcoinAnchorSignedPsbtFinalizationState.js`'s own
//                        identical, identically-unreached UNAVAILABLE.
//
// NEVER READY, SAFE, VALID, VERIFIED, OR TRUSTED AS A SEPARATE STATE. This
// vocabulary already names the one real cryptographic fact this boundary
// checks — FINALIZED means verified against the exact reviewed plan — and
// adds no further judgment on top of it. It carries no field, anywhere,
// naming this transaction eligible for broadcast, likely to succeed, or
// recommended. See `docs/Principles.md`, "The UI Displays Observations;
// It Does Not Turn Them Into A Verdict (0.8.57)," extended here exactly as
// `application/BaseReviewedSigningState.js`'s own header already extends
// it one stage earlier.
//
// NEVER BROADCASTED, ACCEPTED, INCLUDED, OR CONFIRMED. FINALIZED names
// only that ForkBuild has independently established the signed bytes
// correspond to the reviewed plan — nothing about whether Base's own
// network has ever seen them. `FINALIZED ≠ BROADCASTED`; broadcasting
// remains its own, separately sized, deliberately unbuilt next milestone.
export const BaseSignedTransactionFinalizationState = Object.freeze({
    IDLE: 'idle',
    FINALIZING: 'finalizing',
    FINALIZED: 'finalized',
    INVALID_SIGNATURE: 'invalid_signature',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBaseSignedTransactionFinalizationState(value) {
    return Object.values(BaseSignedTransactionFinalizationState).includes(value);
}
