// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// 0.8.95's own header drew the line this file sits on the far side of:
// "BROADCASTED" means only that Base's own JSON-RPC endpoint accepted a
// transaction submission — never that it was later included in a block.
// This is the named vocabulary for the SEPARATE, later, explicitly-
// triggered question this milestone exists to answer: "does Base's own
// network currently report this already-broadcast transaction as included
// in a block?" — the identical "name the difference structurally, not by
// convention" discipline `application/BitcoinAnchorConfirmationState.js`
// (0.8.54) already held for the identical question, one chain over.
//
//   INCLUDED     — `eth_getTransactionReceipt` returned a genuine receipt
//                  object for this exact transaction hash: the transaction
//                  is part of a specific block. `blockHash`, `blockNumber`,
//                  `transactionIndex`, and `confirmationCount` are all
//                  present on this outcome — see `base/
//                  BaseTransactionInclusionObserver.js`'s own header on why
//                  an incomplete report is never surfaced as INCLUDED.
//   NOT_INCLUDED — the endpoint was reached and genuinely reports no
//                  receipt exists for this transaction hash (yet). This is
//                  a REAL, positive fact — Base's own JSON-RPC contract
//                  returns a definite `null` for a transaction it does not
//                  presently know about, never an ambiguous or partial
//                  answer — and it is never conflated with UNAVAILABLE
//                  below. It does NOT mean rejected, lost, invalid, or
//                  abandoned; it means only that no receipt was returned
//                  for this transaction at this observation.
//   UNAVAILABLE  — this observation cannot PRESENTLY tell whether the
//                  transaction is included: the RPC endpoint could not be
//                  reached, or a receipt WAS found but this observer could
//                  not also determine a trustworthy confirmation count (see
//                  `base/BaseTransactionInclusionObserver.js`'s own header
//                  on why an INCLUDED outcome is never reported with a
//                  missing or nonsensical `confirmationCount`). Retrying
//                  later, with another explicit observation, may reach a
//                  different, more informative answer.
//
// THERE IS NO FOURTH VALUE FOR "DEFINITELY WILL NEVER BE INCLUDED." Unlike
// `base/BaseTransactionBroadcaster.js`'s own broadcast-time rejection (a
// real, definite "no" the network can give at submission time), Base gives
// no equivalent definite verdict for a transaction that is simply not
// (yet) included — exactly the same restraint `application/
// BitcoinAnchorConfirmationState.js` already holds one chain over. Every
// "no receipt yet" observation is NOT_INCLUDED, a genuine and stable fact
// at this observation, never treated as a permanent rejection.
//
// NEVER A SCORE, A CONFIDENCE PERCENTAGE, OR A "STRENGTH" RATING, AND NEVER
// CONFIRMED, SAFE, VALID, OR TRUSTED. This vocabulary reports what Base's
// own network currently says, nothing more — see `docs/Principles.md`,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)."
export const BaseTransactionInclusionObservationState = Object.freeze({
    INCLUDED: 'included',
    NOT_INCLUDED: 'not-included',
    UNAVAILABLE: 'unavailable'
});

export function isValidBaseTransactionInclusionObservationState(value) {
    return Object.values(BaseTransactionInclusionObservationState).includes(value);
}
