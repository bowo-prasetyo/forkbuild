// 0.8.95 — Explicit Base Transaction Broadcast.
//
// The vocabulary `application/BaseTransactionBroadcastCoordinator.js`
// reports its own explicit "Broadcast Transaction" attempt through, and
// the UI drives its own broadcast button and result from — the identical
// "name the difference structurally, not by convention" discipline every
// other `*State.js` vocabulary in this codebase already holds, mirroring
// `application/BitcoinAnchorBroadcastState.js`'s own header (0.8.64)
// exactly, one chain over:
//
//   IDLE         — no broadcast attempt has been made yet for the current
//                  finalized transaction. The starting state, and the
//                  state after a fresh "Create Base Transaction Plan,"
//                  "Sign Reviewed Transaction," or "Verify & Finalize
//                  Transaction" click replaces whatever was previously
//                  broadcast-ready — a newly finalized transaction always
//                  starts unbroadcast again, never inheriting a previous
//                  attempt's own BROADCASTED outcome. See `application/
//                  BaseSignedTransactionFinalizationState.js`'s own
//                  header, the identical restraint one stage earlier.
//   BROADCASTING — a broadcast attempt is in flight: the injected `base/
//                  BaseTransactionBroadcaster.js` (0.8.95) has been asked
//                  and has not yet answered. Genuinely asynchronous — a
//                  real network round trip.
//   BROADCASTED  — Base's own JSON-RPC endpoint accepted the finalized
//                  transaction submission and returned a transaction
//                  hash. THIS IS NOT CONFIRMATION. It means only "the
//                  network was reached and accepted this transaction" —
//                  exactly the same restraint `base/
//                  BaseTransactionBroadcaster.js`'s own header and
//                  `application/BitcoinAnchorBroadcastState.js`'s own
//                  header (0.8.64) already draw for the identical fact.
//                  Whether a broadcasted transaction later gets mined into
//                  a block is a separate, later question, asked by a
//                  separate, later explicit confirmation-observation
//                  action (docs/Roadmap.md, 0.8.96) — never something this
//                  state itself claims.
//   REJECTED     — the RPC endpoint reached a definite no: the endpoint
//                  was reached and definitely refused this exact,
//                  already-finalized transaction (e.g. nonce too low,
//                  insufficient funds, already known).
//   UNAVAILABLE  — the RPC endpoint could not presently be reached, or its
//                  response could not be trusted — no connectivity, a
//                  timeout, a malformed result. Retrying later, with an
//                  explicit "Broadcast Again" click, may succeed; nothing
//                  about this state is a definite no.
//   FAILED       — the broadcast operation could not be completed for a
//                  reason other than the RPC endpoint's own definite
//                  rejection or unavailability — a caller/internal
//                  contract failure this coordinator refuses to accept as
//                  a real broadcast answer.
//
// NEVER READY, SAFE, VALID, CONFIRMED, TRUSTED, OR RECOMMENDED. This
// vocabulary names only what the last explicit broadcast attempt produced
// — never a broader judgment about the transaction, and never a promise
// about what Base will eventually do with it. See `docs/Principles.md`,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)," extended here exactly as `application/
// BitcoinAnchorBroadcastState.js`'s own header already extends it one
// chain over.
export const BaseTransactionBroadcastState = Object.freeze({
    IDLE: 'idle',
    BROADCASTING: 'broadcasting',
    BROADCASTED: 'broadcasted',
    REJECTED: 'rejected',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBaseTransactionBroadcastState(value) {
    return Object.values(BaseTransactionBroadcastState).includes(value);
}
