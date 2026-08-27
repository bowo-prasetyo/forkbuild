// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// The vocabulary anchoring/BitcoinWalletFundingObserver.js reports its own
// funding observation through — the identical "name the difference
// structurally, not by convention" discipline application/
// BitcoinAnchorConfirmationState.js already held for confirmation
// observation, held here for a wallet's own spendable funding instead.
//
//   OBSERVED    — the funding source was reached and answered for this
//                 account. `utxos` may be EMPTY (a real, honest "this
//                 account currently holds no spendable output this class
//                 could recognize") — an empty list is not the same thing
//                 as UNAVAILABLE below, exactly as application/
//                 BitcoinAnchorConfirmationState.js's own NOT_CONFIRMED is
//                 never conflated with its own UNAVAILABLE.
//   UNSUPPORTED — the account's own address uses a real, valid Bitcoin
//                 address format this codebase's anchoring/
//                 BitcoinAnchorTransactionBuilder.js cannot estimate a fee
//                 for (e.g. a P2SH address) — a genuine fact about the
//                 address, never a caller mistake, and never silently
//                 guessed at as p2wpkh. See anchoring/
//                 BitcoinWalletFundingObserver.js's own header.
//   UNAVAILABLE — this observation cannot presently tell what the account
//                 holds: the funding source could not be reached, returned
//                 an unparseable answer, or reported a UTXO this class
//                 cannot make sense of. Retrying later may reach a
//                 different, more informative answer.
//
// NEVER A FOURTH VALUE FOR "DEFINITELY WILL NEVER HAVE FUNDS." Exactly as
// application/BitcoinAnchorConfirmationState.js's own header already holds
// for a transaction that is simply not (yet) found, there is no equivalent
// permanent verdict here either — an account with zero UTXOs today may
// receive one moments later, and this class never remembers a prior
// observation across calls (see that file's own header, "EVERY OBSERVATION
// IS A FRESH READ, NEVER A CACHED OR REMEMBERED ONE").
//
// NEVER A SCORE, A RANKING, OR A "BEST FUNDING" JUDGMENT. This vocabulary
// reports what a funding source currently says an account holds, nothing
// more — see docs/Roadmap.md, "0.8.60 — Explicit Bitcoin Anchor Funding &
// Address Preparation."
export const BitcoinAnchorFundingObservationState = Object.freeze({
    OBSERVED: 'observed',
    UNSUPPORTED: 'unsupported',
    UNAVAILABLE: 'unavailable'
});

export function isValidBitcoinAnchorFundingObservationState(value) {
    return Object.values(BitcoinAnchorFundingObservationState).includes(value);
}
