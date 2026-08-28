import { BasePublicationTransactionPlanState } from './BasePublicationTransactionPlanState.js';

const STATE_LABELS = {
    [BasePublicationTransactionPlanState.IDLE]: 'Not yet constructed',
    [BasePublicationTransactionPlanState.CONSTRUCTING]: 'Constructing…',
    [BasePublicationTransactionPlanState.CONSTRUCTED]: 'Transaction plan constructed',
    [BasePublicationTransactionPlanState.UNAVAILABLE]: 'Base network unavailable',
    [BasePublicationTransactionPlanState.FAILED]: 'Unable to construct transaction'
};

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// The label vocabulary for application/BasePublicationTransactionPlanState.js,
// and the projection application/BasePublicationTransactionPlanCoordinator.js's
// own outcome is turned into a screen's worth of facts through — mirroring
// exactly how application/BitcoinAnchorTransactionConstructionView.js
// (0.8.61) turns application/BitcoinAnchorTransactionConstructionState.js's
// own vocabulary into a factual sentence, one chain over.
//
//   describeBasePublicationTransactionPlanStateLabel(state)
//     IDLE         -> "Not yet constructed"
//     CONSTRUCTING -> "Constructing…"
//     CONSTRUCTED  -> "Transaction plan constructed"
//     UNAVAILABLE  -> "Base network unavailable"
//     FAILED       -> "Unable to construct transaction"
//
//   describeBasePublicationTransactionPlan(outcome)
//     -> { state, stateLabel, reason, publicationId, contentHash, network,
//          chainId, from, to, value, data, nonce, gasLimit, maxFeePerGas,
//          maxPriorityFeePerGas, accountObservedAt, constructedAt }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like application/BasePublicationTransactionPlanCoordinator.js#
// construct()'s own return value (`{ state, construction, reason }`) — a
// caller's own reactive mirror of it, copied wholesale after every
// explicit "Create Base Transaction Plan" click, works identically to the
// real thing, the same restraint every other `*View.js` file in this
// codebase already holds toward its own injected collaborator's result.
//
// EVERY WEI-DENOMINATED FIGURE STAYS A STRING HERE TOO. `value`,
// `maxFeePerGas`, and `maxPriorityFeePerGas` are projected straight off
// `plan`'s own decimal-digit strings — this file performs no arithmetic
// and no `Number()` conversion of any of them, mirroring exactly how
// application/BaseAccountObservationView.js already carries
// `nativeBalanceWei` through unchanged, one stage earlier in this exact
// pipeline.
//
// NEVER A VERDICT. This view carries no `valid`, `safe`, `recommended`,
// `optimal`, `best`, or `trusted` field of any kind — only the plan's own
// facts: which account it spends from, where it sends, what it carries,
// and what gas/fee figures it was priced with. Whether those facts are
// ACCEPTABLE remains entirely a judgment for the person reading them,
// exactly as application/BitcoinAnchorTransactionConstructionView.js
// (0.8.61) already holds one chain over.
//
// A FAILED OR UNAVAILABLE OUTCOME NAMES THE COORDINATOR'S OWN REASON,
// VERBATIM, AND NOTHING ELSE. `outcome.reason` is `base/
// BasePublicationTransactionPlanner.js`'s own, exact `reason` string,
// forwarded unchanged through the coordinator — never rewritten,
// summarized, or replaced with a generic message. Every other field is
// `null`/empty on a FAILED or UNAVAILABLE outcome: there is no partial
// plan to show, exactly as the planner itself never returns a partial
// one.
//
// Pure and stateless: no constructor, no network access, no history of
// its own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBasePublicationTransactionPlanStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBasePublicationTransactionPlan(outcome) {
    const state = outcome ? outcome.state : BasePublicationTransactionPlanState.IDLE;
    const construction = outcome ? outcome.construction : null;
    const plan = construction ? construction.plan : null;

    return Object.freeze({
        state,
        stateLabel: describeBasePublicationTransactionPlanStateLabel(state),
        reason: outcome ? outcome.reason : null,
        publicationId: construction ? construction.publicationId : null,
        contentHash: construction ? construction.contentHash : null,
        network: plan ? plan.network : null,
        chainId: plan ? plan.chainId : null,
        from: plan ? plan.from : null,
        to: plan ? plan.to : null,
        value: plan ? plan.value : null,
        data: plan ? plan.data : null,
        nonce: plan ? plan.nonce : null,
        gasLimit: plan ? plan.gasLimit : null,
        maxFeePerGas: plan ? plan.maxFeePerGas : null,
        maxPriorityFeePerGas: plan ? plan.maxPriorityFeePerGas : null,
        accountObservedAt: construction ? construction.accountObservation.observedAt : null,
        constructedAt: construction ? construction.constructedAt : null
    });
}
