// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
//
// The vocabulary application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js
// reports its own explicit "Verify & Finalize Transaction" attempt through,
// and the UI drives its own finalize button and result from — the identical
// "name the difference structurally, not by convention" discipline every
// other `*State.js` vocabulary in this codebase already holds, most
// recently application/BitcoinAnchorReviewedSigningState.js (0.8.62), one
// stage earlier in the same pipeline:
//
//   IDLE              — no finalization attempt has been made yet for the
//                        current signed PSBT. The starting state, and the
//                        state after a fresh "Sign Reviewed Transaction"
//                        click replaces whatever was previously signed — a
//                        newly signed PSBT always starts unfinalized again,
//                        never inheriting a previous attempt's own
//                        FINALIZED outcome. See application/
//                        BitcoinAnchorReviewedSigningState.js's own header,
//                        the identical restraint one stage earlier.
//   FINALIZING        — a finalization attempt is in flight. Unlike
//                        BitcoinAnchorReviewedSigningState.js's own SIGNING
//                        (genuinely asynchronous — a real person's wallet
//                        popup), anchoring/BitcoinAnchorSignedPsbtFinalizer.js
//                        performs no network call and resolves synchronously
//                        — this state is necessarily as brief as
//                        application/BitcoinAnchorTransactionConstructionState.js's
//                        own CONSTRUCTING, kept only for the identical
//                        "attempt is in flight" vocabulary symmetry every
//                        other coordinator on this page already holds.
//   FINALIZED         — the signed PSBT was independently, cryptographically
//                        verified — every input's claimed public key proven
//                        to have authority over the script it spends, and
//                        every input's claimed signature proven valid over
//                        this exact transaction's own BIP143 sighash — and
//                        assembled into real, broadcastable transaction
//                        bytes. This is the FIRST state in this whole
//                        pipeline that has ever cryptographically checked a
//                        wallet's own claim rather than merely inspecting
//                        its shape — see application/
//                        BitcoinAnchorReviewedSigningState.js's own header,
//                        "SIGNED IS NOT VERIFIED," which this state is the
//                        answer to.
//   INVALID_SIGNATURE — the returned signing material did not
//                        cryptographically verify: a public key without
//                        authority over the script it claims to spend, a
//                        malformed or out-of-range signature, or a
//                        signature that does not satisfy this exact
//                        transaction's own sighash. Deliberately distinct
//                        from FAILED — see application/
//                        BitcoinAnchorSignedPsbtFinalizationCoordinator.js's
//                        own header on exactly which reasons this class
//                        recognizes as a genuine cryptographic failure
//                        rather than some other kind.
//   UNAVAILABLE       — reserved for an inability to perform some external
//                        operation this finalization boundary would need —
//                        exactly the meaning application/
//                        BitcoinAnchorReviewedSigningState.js's own
//                        UNAVAILABLE already holds for a missing wallet.
//                        anchoring/BitcoinAnchorSignedPsbtFinalizer.js is a
//                        purely offline, synchronous cryptographic check
//                        with no network call and no external dependency of
//                        any kind — see that file's own header, "AN OFFLINE
//                        CRYPTOGRAPHIC BOUNDARY, NOTHING MORE" — so nothing
//                        in this codebase today ever produces this state.
//                        It stays in the vocabulary, honestly unreached,
//                        rather than removed, so a future external
//                        dependency this boundary might one day gain (were
//                        one ever added) would have a state to report
//                        through rather than forcing a false FAILED.
//   FAILED            — the finalization operation could not be completed
//                        for a reason other than an invalid signature: the
//                        signed PSBT no longer structurally matches the
//                        transaction that was signed (the unchanged 0.8.50
//                        inspection boundary catches this BEFORE any
//                        cryptography is attempted), the signed PSBT could
//                        not even be decoded, or an input uses a script
//                        type (p2tr, p2pkh) this finalizer does not yet
//                        cryptographically support.
//
// NEVER READY, SAFE, VALID, VERIFIED, OR TRUSTED AS A SEPARATE STATE. This
// vocabulary already names the one real cryptographic fact this boundary
// checks — FINALIZED means verified — and adds no further judgment on top
// of it. See docs/Principles.md, "The UI Displays Observations; It Does Not
// Turn Them Into A Verdict (0.8.57)," extended here exactly as application/
// BitcoinAnchorReviewedSigningState.js's own header already extends it one
// stage earlier.
export const BitcoinAnchorSignedPsbtFinalizationState = Object.freeze({
    IDLE: 'idle',
    FINALIZING: 'finalizing',
    FINALIZED: 'finalized',
    INVALID_SIGNATURE: 'invalid_signature',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBitcoinAnchorSignedPsbtFinalizationState(value) {
    return Object.values(BitcoinAnchorSignedPsbtFinalizationState).includes(value);
}
