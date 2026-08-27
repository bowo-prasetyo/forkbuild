// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
//
// The vocabulary application/BitcoinAnchorBroadcastCoordinator.js reports
// its own explicit "Broadcast Transaction" attempt through, and the UI
// drives its own broadcast button and result from — the identical "name
// the difference structurally, not by convention" discipline every other
// `*State.js` vocabulary in this codebase already holds, most recently
// application/BitcoinAnchorSignedPsbtFinalizationState.js (0.8.63), one
// stage earlier in the same pipeline:
//
//   IDLE         — no broadcast attempt has been made yet for the current
//                  finalized transaction. The starting state, and the
//                  state after a fresh "Verify & Finalize Transaction" or
//                  "Sign Reviewed Transaction" click replaces whatever was
//                  previously broadcast-ready — a newly finalized
//                  transaction always starts unbroadcast again, never
//                  inheriting a previous attempt's own BROADCASTED
//                  outcome. See application/
//                  BitcoinAnchorSignedPsbtFinalizationState.js's own
//                  header, the identical restraint one stage earlier.
//   BROADCASTING — a broadcast attempt is in flight: the injected
//                  anchoring/BitcoinAnchorTransactionBroadcaster.js (0.8.52)
//                  has been asked and has not yet answered. Genuinely
//                  asynchronous — a real network round trip — exactly like
//                  application/BitcoinAnchorReviewedSigningState.js's own
//                  SIGNING, one domain over.
//   BROADCASTED  — the broadcaster accepted the finalized transaction for
//                  broadcast. THIS IS NOT CONFIRMATION. It means only "the
//                  network was reached and accepted this transaction" —
//                  exactly the same restraint anchoring/
//                  BitcoinAnchorTransactionBroadcaster.js's own header
//                  (0.8.52) and application/
//                  BitcoinAnchorPublicationLifecycleState.js's own header
//                  (0.8.53) already draw for the identical fact. Whether a
//                  broadcasted transaction later gets mined into a block is
//                  a separate, later question, asked by a separate, later
//                  explicit "Observe Confirmation" action against
//                  application/ExternalAnchorVerifier.js /
//                  anchoring/BitcoinOpReturnProofVerifier.js — never
//                  something this state itself claims.
//   REJECTED     — the broadcaster reached a definite no: the network was
//                  reached and definitely refused this exact,
//                  already-finalized transaction (e.g. non-standard,
//                  already spent, fee too low).
//   UNAVAILABLE  — the broadcasting endpoint could not presently be
//                  reached — no connectivity, a timeout, a 5xx. Retrying
//                  later, with an explicit "Broadcast Again" click, may
//                  succeed; nothing about this state is a definite no.
//   FAILED       — the broadcast operation could not be completed for a
//                  reason other than the broadcaster's own definite
//                  rejection or unavailability — a caller/internal
//                  contract failure this coordinator refuses to accept as
//                  a real broadcaster answer.
//
// NEVER READY, SAFE, VALID, CONFIRMED, TRUSTED, OR RECOMMENDED. This
// vocabulary names only what the last explicit broadcast attempt produced
// — never a broader judgment about the transaction, and never a promise
// about what Bitcoin will eventually do with it. See docs/Principles.md,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)," extended here exactly as application/
// BitcoinAnchorSignedPsbtFinalizationState.js's own header already extends
// it one stage earlier.
export const BitcoinAnchorBroadcastState = Object.freeze({
    IDLE: 'idle',
    BROADCASTING: 'broadcasting',
    BROADCASTED: 'broadcasted',
    REJECTED: 'rejected',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBitcoinAnchorBroadcastState(value) {
    return Object.values(BitcoinAnchorBroadcastState).includes(value);
}
