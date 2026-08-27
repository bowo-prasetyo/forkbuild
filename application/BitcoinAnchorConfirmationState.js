// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// 0.8.53's own header drew the line this file sits on the far side of:
// "BROADCASTED" means only that the network accepted a transaction for
// broadcast — never that it was later mined into a block. This is the
// named vocabulary for the SEPARATE, later, explicitly-triggered question
// this milestone exists to answer: "what does the Bitcoin network
// currently report about this already-broadcast transaction?" — the
// identical "name the difference structurally, not by convention"
// discipline application/BitcoinAnchorPublicationLifecycleState.js already
// held for publication, and application/AnchorVerificationOutcome.js
// already held for proof verification, held here for confirmation
// observation specifically.
//
//   CONFIRMED     — the transaction was found, and the network reports it
//                   mined into a block. `blockHash`, `blockHeight`, and
//                   `confirmationCount` are all present on this outcome —
//                   see anchoring/BitcoinAnchorConfirmationObserver.js's
//                   own header on why an incomplete confirmed report is
//                   never surfaced as CONFIRMED.
//   NOT_CONFIRMED — the transaction was found (e.g. sitting in the
//                   mempool) but is not yet part of any block. This is a
//                   REAL, positive fact — a transaction that genuinely
//                   exists and is simply still waiting — never conflated
//                   with UNAVAILABLE below.
//   UNAVAILABLE   — this observation cannot PRESENTLY tell what the
//                   network reports: the confirmation source could not be
//                   reached, the transaction was not found (which may
//                   simply mean it has not yet propagated — never treated
//                   as "it will never exist"), or a found-and-reportedly-
//                   confirmed transaction arrived with incomplete block
//                   metadata this codebase refuses to treat as trustworthy
//                   on its own say-so. Retrying later may reach a
//                   different, more informative answer.
//
// THERE IS NO FOURTH VALUE FOR "DEFINITELY WILL NEVER CONFIRM." Unlike
// anchoring/BitcoinAnchorTransactionBroadcaster.js's own broadcast-time
// rejection (a real, definite "no" the network can give at submission
// time), Bitcoin gives no equivalent definite verdict for a transaction
// that is simply not (yet) found — exactly the same restraint anchoring/
// BitcoinOpReturnProofVerifier.js already held for its own 404 handling
// since 0.8.1. Every "not found" observation is UNAVAILABLE, never a
// permanent, structural rejection.
//
// NEVER A SCORE, A CONFIDENCE PERCENTAGE, OR A "STRENGTH" RATING. This
// vocabulary reports what the network currently says, nothing more — see
// docs/Roadmap.md, "0.8.54 — Bitcoin Anchor Confirmation Observation."
export const BitcoinAnchorConfirmationState = Object.freeze({
    CONFIRMED: 'confirmed',
    NOT_CONFIRMED: 'not-confirmed',
    UNAVAILABLE: 'unavailable'
});

export function isValidBitcoinAnchorConfirmationState(value) {
    return Object.values(BitcoinAnchorConfirmationState).includes(value);
}
