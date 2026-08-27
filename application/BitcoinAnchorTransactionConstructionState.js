// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
//
// The vocabulary application/BitcoinAnchorTransactionConstructionCoordinator.js
// reports its own construction attempt through, and the UI drives its own
// "Create Transaction Plan" button from — the identical "name the
// difference structurally, not by convention" discipline every other
// *State.js vocabulary in this codebase already holds (most recently
// application/BitcoinAnchorFundingObservationState.js, 0.8.60).
//
//   IDLE         — no construction attempt has been made yet for the
//                  current funding observation. The starting state, and
//                  the state after a person picks a different funding
//                  observation or publication to construct against.
//   CONSTRUCTING — a construction attempt is in flight. anchoring/
//                  BitcoinAnchorTransactionBuilder.js#build() is itself
//                  synchronous (no network, no async work of any kind —
//                  see that file's own header), so this state is
//                  necessarily brief; it exists so the UI has a real state
//                  to render between the click and the result rather than
//                  inferring one from a boolean flag, the identical
//                  discipline application/BitcoinAnchorFundingObservationState.js's
//                  own OBSERVED/UNSUPPORTED/UNAVAILABLE trio holds for
//                  observation, one step earlier in the pipeline.
//   CONSTRUCTED  — anchoring/BitcoinAnchorTransactionBuilder.js#build()
//                  produced a real, deterministic transaction plan from
//                  the supplied funding observation.
//   FAILED       — the builder could not produce a plan from the supplied
//                  funding observation (most commonly: insufficient
//                  funds). The builder's own `reason` is carried through
//                  unchanged — see anchoring/BitcoinAnchorTransactionBuilder.js's
//                  own header on why that reason is never rewritten or
//                  summarized here.
//
// NEVER READY, SAFE, VALID, OPTIMAL, BEST, OR TRUSTED. Those words would
// each imply a judgment this application never makes about a constructed
// plan — whether its inputs, fee, or change are ACCEPTABLE remains
// entirely a judgment for the person reading application/
// BitcoinAnchorTransactionConstructionView.js's own projection of it. See
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict (0.8.57)," extended here to a transaction plan's own
// construction.
//
// NO FIFTH VALUE FOR "DEFINITELY WILL NEVER CONSTRUCT." Exactly as
// application/BitcoinAnchorFundingObservationState.js's own header already
// holds for a funding observation, a FAILED construction attempt against
// one funding observation says nothing about a LATER attempt against a
// fresher one — refreshing funding and constructing again may succeed.
export const BitcoinAnchorTransactionConstructionState = Object.freeze({
    IDLE: 'idle',
    CONSTRUCTING: 'constructing',
    CONSTRUCTED: 'constructed',
    FAILED: 'failed'
});

export function isValidBitcoinAnchorTransactionConstructionState(value) {
    return Object.values(BitcoinAnchorTransactionConstructionState).includes(value);
}
