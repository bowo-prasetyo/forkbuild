// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// The vocabulary application/BitcoinAnchorReviewedSigningCoordinator.js
// reports its own explicit "Sign Reviewed Transaction" attempt through, and
// the UI drives its own signing button and result from — the identical
// "name the difference structurally, not by convention" discipline every
// other `*State.js` vocabulary in this codebase already holds (most
// recently application/BitcoinAnchorTransactionConstructionState.js,
// 0.8.61).
//
//   IDLE         — no signing attempt has been made yet for the current
//                  reviewed transaction. The starting state, and the state
//                  after a person constructs (or reconstructs) a
//                  transaction plan — a fresh plan always starts unsigned
//                  again, never inheriting a previous plan's own SIGNED
//                  outcome.
//   SIGNING      — a signing attempt is in flight: the wallet has been
//                  asked and has not yet answered. Unlike CONSTRUCTING
//                  (application/BitcoinAnchorTransactionConstructionState.js's
//                  own, necessarily brief state), this one can last as long
//                  as a real person takes to look at their own wallet's
//                  popup and decide — genuinely asynchronous, not merely
//                  named for consistency.
//   SIGNED       — the wallet returned a signature, and it was independently
//                  inspected (anchoring/BitcoinAnchorSignedPsbtInspector.js,
//                  0.8.50, unchanged) and found to carry recognized signing
//                  material for exactly the transaction that was reviewed.
//                  This is NOT cryptographic verification — see this file's
//                  own header below, "SIGNED IS NOT VERIFIED."
//   DECLINED     — a definite no: either the wallet itself declined or
//                  refused to sign, or — before the wallet was ever asked —
//                  anchoring/BitcoinAnchorReviewedPsbtSigner.js's own 0.8.59
//                  precondition found that the transaction no longer
//                  matches what was reviewed. Both are reported through this
//                  ONE state because the class beneath this coordinator
//                  already reports both through the identical `{ signed:
//                  false, reason }` shape — see that file's own header,
//                  "A MISMATCH IS A DEFINITE REFUSAL, NEVER
//                  'UNAVAILABLE.'" The `reason` string, carried through
//                  verbatim, is what actually distinguishes the two.
//   UNAVAILABLE  — cannot presently tell whether a signature is obtainable:
//                  no wallet is connected right now, the wallet is locked,
//                  or it could not be reached. Retrying later, once a
//                  wallet capable of signing is connected, may reach a
//                  different answer.
//   FAILED       — the signing operation produced an unacceptable result:
//                  not the wallet's own declared decline or unavailability,
//                  but a collaborator this coordinator refuses to accept as
//                  a real answer — most notably a wallet claiming
//                  `signed: true` while returning no PSBT at all, or one
//                  whose claimed signature does not survive independent
//                  inspection against a substituted transaction. See
//                  application/BitcoinAnchorReviewedSigningCoordinator.js's
//                  own header on exactly what this state does and does not
//                  catch.
//
// SIGNED IS NOT VERIFIED. Exactly as anchoring/BitcoinAnchorWalletSigner.js's
// own header (0.8.50) already holds — "A SIGNED-PSBT INSPECTION BOUNDARY,
// NEVER SKIPPED... never simply trusts a wallet's own `{ signed: true }`
// claim" — SIGNED here means a wallet returned a PSBT that independently
// inspects as carrying recognized signing material for the exact
// transaction reviewed. It does NOT mean anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js's own cryptographic ECDSA/HASH160
// verification (0.8.51) has run at all. See docs/Principles.md, "Review Is
// An Authorization Boundary; Signing Is An External Capability Invocation
// (0.8.62)."
//
// NEVER READY, SAFE, VALID, OR TRUSTED. Those words would each imply a
// judgment this state vocabulary never makes about a signing attempt —
// whether a SIGNED result is itself acceptable to finalize and broadcast
// remains entirely a judgment for whatever explicit step comes next. See
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict (0.8.57)," extended here to a signing attempt's own
// outcome.
//
// A CONNECTED WALLET IS NEVER A SIXTH STATE FOR "WILL DEFINITELY SIGN."
// This vocabulary names only what THIS coordinator's own last attempt
// produced — it carries no state meaning "ready to sign" or "authorized,"
// because a wallet being connected, or even a transaction being reviewed,
// is never itself authorization. See anchoring/BitcoinWalletConnection.js's
// own header, "A CAPABILITY, NEVER A SECRET," and anchoring/
// BitcoinAnchorReviewedPsbtSigner.js's own header, both unchanged and
// extended here.
export const BitcoinAnchorReviewedSigningState = Object.freeze({
    IDLE: 'idle',
    SIGNING: 'signing',
    SIGNED: 'signed',
    DECLINED: 'declined',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBitcoinAnchorReviewedSigningState(value) {
    return Object.values(BitcoinAnchorReviewedSigningState).includes(value);
}
