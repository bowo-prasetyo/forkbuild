// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// The vocabulary `application/BaseReviewedSigningCoordinator.js` reports
// its own explicit "Sign Reviewed Transaction" attempt through, and the UI
// drives its own signing button and result from — the identical "name the
// difference structurally, not by convention" discipline every other
// `*State.js` vocabulary in this codebase already holds, mirroring
// `application/BitcoinAnchorReviewedSigningState.js`'s own header (0.8.62)
// exactly, one chain over.
//
//   IDLE         — no signing attempt has been made yet for the current
//                  reviewed transaction. The starting state, and the state
//                  after a person constructs (or reconstructs) a Base
//                  transaction plan — a fresh plan always starts unsigned
//                  again, never inheriting a previous plan's own SIGNED
//                  outcome.
//   SIGNING      — a signing attempt is in flight: the wallet has been
//                  asked and has not yet answered. Genuinely asynchronous
//                  — this can last as long as a real person takes to look
//                  at their own wallet's own prompt and decide.
//   SIGNED       — the wallet returned SOME rawTransaction for a plan that
//                  still matched what was reviewed. This is NOT
//                  cryptographic verification, and NOT even the lighter
//                  structural inspection `anchoring/
//                  BitcoinAnchorSignedPsbtInspector.js` already performs
//                  for Bitcoin at this identical stage — see this file's
//                  own header below, "SIGNED IS NOT VERIFIED, AND NOT YET
//                  EVEN STRUCTURALLY INSPECTED."
//   DECLINED     — a definite no: either the wallet itself declined or
//                  refused to sign, or — before the wallet was ever asked
//                  — `base/BaseReviewedTransactionSigner.js`'s own
//                  precondition found that the plan no longer matches what
//                  was reviewed. Both are reported through this ONE state
//                  because the class beneath this coordinator already
//                  reports both through the identical `{ signed: false,
//                  reason }` shape. The `reason` string, carried through
//                  verbatim, is what actually distinguishes the two.
//   UNAVAILABLE  — cannot presently tell whether a signature is obtainable:
//                  no wallet is connected right now, the wallet is locked,
//                  unreachable, or does not support signing a transaction
//                  without broadcasting it. Retrying later, once a wallet
//                  capable of signing is connected, may reach a different
//                  answer.
//   FAILED       — the signing operation produced an unacceptable result:
//                  not the wallet's own declared decline or unavailability,
//                  but a collaborator this coordinator refuses to accept as
//                  a real answer — most notably a wallet claiming
//                  `signed: true` while returning no rawTransaction at all.
//
// SIGNED IS NOT VERIFIED, AND NOT YET EVEN STRUCTURALLY INSPECTED. Unlike
// Bitcoin's own signing stage (which independently re-inspects a claimed
// PSBT signature in the SAME milestone that introduces wallet signing),
// this milestone deliberately stops one step earlier: SIGNED here means
// only that a wallet returned a rawTransaction for a plan that still
// matched its own review — not that ForkBuild has looked inside that
// rawTransaction at all. Genuinely inspecting whether the signed bytes
// correspond to the reviewed plan is this codebase's own next, separately
// sized milestone — see docs/Roadmap.md, 0.8.94. See docs/Principles.md,
// "Review Is An Authorization Boundary; Signing Is An External Capability
// Invocation (0.8.62)," extended here one chain over.
//
// NEVER READY, SAFE, VALID, OR TRUSTED. Those words would each imply a
// judgment this state vocabulary never makes about a signing attempt —
// whether a SIGNED result is itself acceptable to inspect and eventually
// broadcast remains entirely a judgment for whatever explicit step comes
// next. See docs/Principles.md, "The UI Displays Observations; It Does
// Not Turn Them Into A Verdict (0.8.57)."
//
// A CONNECTED WALLET IS NEVER A SIXTH STATE FOR "WILL DEFINITELY SIGN."
// This vocabulary names only what THIS coordinator's own last attempt
// produced — it carries no state meaning "ready to sign" or "authorized,"
// because a wallet being connected, or even a transaction being reviewed,
// is never itself authorization. See `base/BaseWalletConnection.js`'s own
// header, and `base/BaseReviewedTransactionSigner.js`'s own header, both
// unchanged and extended here.
export const BaseReviewedSigningState = Object.freeze({
    IDLE: 'idle',
    SIGNING: 'signing',
    SIGNED: 'signed',
    DECLINED: 'declined',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBaseReviewedSigningState(value) {
    return Object.values(BaseReviewedSigningState).includes(value);
}
