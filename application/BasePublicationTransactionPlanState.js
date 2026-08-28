// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// The vocabulary `application/BasePublicationTransactionPlanCoordinator.js`
// reports its own construction attempt through, and
// `ui/views/DecentralizedPublicationsView.js`'s own "Create Base
// Transaction Plan" button drives from — the identical "name the
// difference structurally, not by convention" discipline every other
// `*State.js` vocabulary in this codebase already holds, most recently
// `application/BaseNetworkObservationState.js` (0.8.90) one stage
// earlier in this exact pipeline.
//
//   IDLE         — no construction attempt has been made yet for the
//                  current account observation. The starting state, and
//                  the state after a person observes a fresh Base
//                  account.
//   CONSTRUCTING — a construction attempt is in flight. Unlike
//                  `application/BitcoinAnchorTransactionConstructionState.js`'s
//                  own CONSTRUCTING (necessarily brief, since `anchoring/
//                  BitcoinAnchorTransactionBuilder.js#build()` is fully
//                  synchronous), THIS construction genuinely awaits real
//                  network reads — a nonce, a gas estimate, and current
//                  fee figures — through `base/
//                  BasePublicationTransactionPlanner.js`, so this state
//                  can be visible for as long as an ordinary Base RPC
//                  round trip takes.
//   CONSTRUCTED  — `base/BasePublicationTransactionPlanner.js#plan()`
//                  produced a real, fully-parameterized, UNSIGNED Base
//                  transaction plan from the supplied account
//                  observation and a content hash.
//   UNAVAILABLE  — this construction attempt cannot presently tell what
//                  the network reports: the injected RPC source could
//                  not be reached, timed out, or returned a malformed
//                  response while reading the nonce, gas estimate, or
//                  fee figures this plan needs. Retrying later may reach
//                  a different, more informative answer — mirrors
//                  exactly why `BaseNetworkObservationState.UNAVAILABLE`
//                  (0.8.90) is never conflated with a definite failure.
//   FAILED       — the network answered every read this construction
//                  needed, but the resulting plan is not one this
//                  account can afford: the observed native balance
//                  cannot cover the estimated worst-case transaction
//                  cost. This is a REAL, positive fact about the
//                  account, never an operational failure — the identical
//                  distinction `application/
//                  BitcoinAnchorTransactionConstructionState.js`'s own
//                  FAILED already draws for "insufficient funds," one
//                  chain over.
//
// NEVER READY, SAFE, VALID, OPTIMAL, BEST, OR TRUSTED. Those words would
// each imply a judgment this application never makes about a constructed
// plan — whether its gas limit, fee figures, or destination are
// ACCEPTABLE remains entirely a judgment for the person reading
// `application/BasePublicationTransactionPlanView.js`'s own projection
// of it. See docs/Principles.md, "The UI Displays Observations; It Does
// Not Turn Them Into A Verdict (0.8.57)," extended here to a Base
// transaction plan's own construction, exactly as `application/
// BitcoinAnchorTransactionConstructionState.js`'s own header already
// extends it for Bitcoin.
//
// NO SIXTH VALUE FOR "DEFINITELY WILL NEVER CONSTRUCT." A FAILED or
// UNAVAILABLE construction attempt against one account observation says
// nothing about a LATER attempt against a fresher one — observing the
// account again (a top-up landed; the RPC endpoint recovered) and
// constructing again may succeed.
export const BasePublicationTransactionPlanState = Object.freeze({
    IDLE: 'idle',
    CONSTRUCTING: 'constructing',
    CONSTRUCTED: 'constructed',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidBasePublicationTransactionPlanState(value) {
    return Object.values(BasePublicationTransactionPlanState).includes(value);
}
