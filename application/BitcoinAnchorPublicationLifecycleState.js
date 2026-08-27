// 0.8.53 — Bitcoin Anchor Publication Lifecycle.
//
// The vocabulary application/BitcoinAnchorPublicationCoordinator.js reports
// its own progress in — one value per stage of the 0.8.47→0.8.52 pipeline,
// plus one failure value per boundary that pipeline can actually stop at.
// Never a generic true/false: a caller (eventually a UI) needs to tell
// "the wallet was unreachable" apart from "the wallet signed something
// that didn't survive inspection" apart from "the network rejected the
// finalized transaction," exactly the same "name the difference
// structurally, not by convention" discipline application/
// AnchorVerificationOutcome.js already established for anchor
// verification, held here for anchor PUBLICATION.
//
//   NOT_STARTED    — a caller's own state before publishAnchor() is ever
//                     called. Never returned by it.
//   PSBT_READY     — a transaction plan (0.8.47) and a real, serialized
//                     BIP174 PSBT (0.8.48/0.8.49) exist. Reported as
//                     `reachedStage` once a later stage fails.
//   SIGNED         — an external wallet produced a signature, and it
//                     independently survived BitcoinAnchorWalletSigner's
//                     own structural inspection (0.8.50). Reported as
//                     `reachedStage` once a later stage fails.
//   FINALIZED      — the signed PSBT cryptographically verified and a
//                     real, broadcastable transaction was assembled
//                     (0.8.51). Reported as `reachedStage` once broadcast
//                     itself fails.
//   BROADCASTED    — the network accepted the finalized transaction
//                     (0.8.52), and a real PublicationAnchor now records
//                     it. The one success terminal state.
//
//   PLAN_FAILED           — BitcoinAnchorTransactionBuilder could not
//                            build a plan (e.g. insufficient funds).
//   SIGNING_UNAVAILABLE   — the wallet could not presently be reached —
//                            locked, unreachable, not installed. Retrying
//                            later may succeed.
//   SIGNATURE_INVALID     — the wallet reached a definite no (the user
//                            declined, or it refused outright), OR it
//                            claimed a signature that did not survive
//                            independent structural inspection. Both are
//                            "no usable signature was obtained," and
//                            BitcoinAnchorWalletSigner itself does not
//                            distinguish them any further — see that
//                            file's own header.
//   FINALIZATION_FAILED   — a structurally intact signed PSBT did not
//                            cryptographically verify (wrong key, wrong
//                            sighash, an unsupported scriptType).
//   BROADCAST_UNAVAILABLE — the broadcasting endpoint could not presently
//                            be reached. Retrying later may succeed.
//   BROADCAST_REJECTED    — the network was reached and definitely
//                            refused this exact, already-finalized
//                            transaction.
//
// THIS IS NOT CONFIRMATION. BROADCASTED means only "the network accepted
// this transaction for broadcast" — exactly the same restraint anchoring/
// BitcoinAnchorPublisher.js's own header already drew in 0.8.9. There is
// no CONFIRMED value here, on purpose: whether a broadcasted transaction
// later gets mined into a block is a separate, later question, asked by a
// separate, later action against application/ExternalAnchorVerifier.js /
// anchoring/BitcoinOpReturnProofVerifier.js — never something this
// coordinator checks automatically as part of publishing. See
// docs/Roadmap.md, "0.8.54 — Bitcoin Anchor Confirmation Observation."
export const BitcoinAnchorPublicationLifecycleState = Object.freeze({
    NOT_STARTED: 'not-started',
    PSBT_READY: 'psbt-ready',
    SIGNED: 'signed',
    FINALIZED: 'finalized',
    BROADCASTED: 'broadcasted',
    PLAN_FAILED: 'plan-failed',
    SIGNING_UNAVAILABLE: 'signing-unavailable',
    SIGNATURE_INVALID: 'signature-invalid',
    FINALIZATION_FAILED: 'finalization-failed',
    BROADCAST_UNAVAILABLE: 'broadcast-unavailable',
    BROADCAST_REJECTED: 'broadcast-rejected'
});

export function isValidBitcoinAnchorPublicationLifecycleState(value) {
    return Object.values(BitcoinAnchorPublicationLifecycleState).includes(value);
}
