import { BitcoinAnchorTransactionConstructionState } from './BitcoinAnchorTransactionConstructionState.js';

const STATE_LABELS = {
    [BitcoinAnchorTransactionConstructionState.IDLE]: 'Not yet constructed',
    [BitcoinAnchorTransactionConstructionState.CONSTRUCTING]: 'Constructing…',
    [BitcoinAnchorTransactionConstructionState.CONSTRUCTED]: 'Transaction plan constructed',
    [BitcoinAnchorTransactionConstructionState.FAILED]: 'Unable to construct transaction'
};

// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
//
// The label vocabulary for application/BitcoinAnchorTransactionConstructionState.js,
// and the projection application/BitcoinAnchorTransactionConstructionCoordinator.js's
// own outcome is turned into a screen's worth of facts through — mirroring
// exactly how application/BitcoinAnchorFundingView.js (0.8.60) turns
// application/BitcoinAnchorFundingObservationState.js's own vocabulary into
// a factual sentence, one domain later in the pipeline.
//
//   describeBitcoinAnchorTransactionConstructionStateLabel(state)
//     IDLE         -> "Not yet constructed"
//     CONSTRUCTING -> "Constructing…"
//     CONSTRUCTED  -> "Transaction plan constructed"
//     FAILED       -> "Unable to construct transaction"
//
//   describeBitcoinAnchorTransactionConstruction(outcome)
//     -> { state, stateLabel, reason, publicationId, contentHash, network,
//          selectedInputCount, inputs, outputs, changeSats, feeSats,
//          totalInputSats, fundingObservedAt, constructedAt }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. `outcome` is expected to
// be shaped exactly like application/BitcoinAnchorTransactionConstructionCoordinator.js#
// construct()'s own return value (`{ state, construction, reason }`) — a
// caller's own reactive mirror of it, copied wholesale after every
// explicit "Create Transaction Plan" click, works identically to the real
// thing, the same restraint every other `*View.js` file in this codebase
// already holds toward its own injected collaborator's result.
//
// "SELECTED INPUTS," NEVER "BEST INPUTS." anchoring/
// BitcoinAnchorTransactionBuilder.js's own header (0.8.47) is explicit that
// its deterministic largest-value-first accumulation is "a plain greedy
// accumulation, never an optimal... coin selector." `selectedInputCount`
// REPORTS the size of the builder's own resulting selection — it never
// re-describes that selection as the best, optimal, or recommended one,
// because this codebase never claims that about it anywhere, including
// inside the builder itself.
//
// OBSERVED FUNDING AND A CONSTRUCTED PLAN ARE TWO DIFFERENT MOMENTS, NAMED
// SEPARATELY. `fundingObservedAt` (read straight off `construction.
// fundingObservation.observedAt` — anchoring/BitcoinWalletFundingObserver.js's
// own local clock read, 0.8.60) and `constructedAt` (application/
// BitcoinAnchorTransactionConstructionCoordinator.js's own local clock
// read, taken the moment `build()` returned) are deliberately two separate
// fields, never collapsed into one timestamp. The UTXOs a plan spends may
// already be stale by the time construction happens, and may be stranger
// still by the time anyone signs — this view names both moments honestly
// rather than implying they were the same instant. See docs/Roadmap.md,
// "0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation," on why
// a funding observation is "a fact about a moment, never a commitment,"
// unchanged and extended here.
//
// NEVER A VERDICT. This view carries no `valid`, `safe`, `recommended`,
// `optimal`, `best`, or `trusted` field of any kind — only the plan's own
// facts: which UTXOs were selected, what is created, how large the fee is,
// and what content hash is being anchored. Whether those facts are
// ACCEPTABLE remains entirely a judgment for the person reading them,
// exactly as application/BitcoinAnchorTransactionReviewView.js (0.8.59)
// already holds one PSBT-shaped domain later, and application/
// BitcoinAnchorFundingView.js (0.8.60) already holds one domain earlier.
//
// A FAILED OUTCOME NAMES THE BUILDER'S OWN REASON, VERBATIM, AND NOTHING
// ELSE. `outcome.reason` is anchoring/BitcoinAnchorTransactionBuilder.js's
// own, exact `reason` string — never rewritten, summarized, or replaced
// with a generic message. Every other field is `null`/empty on a FAILED
// outcome: there is no partial plan to show, exactly as the builder itself
// never returns a partial one (see that file's own header, Section D of
// tests/BitcoinAnchorTransactionConstruction.test.js).
//
// Pure and stateless: no constructor, no network access, no history of its
// own. Calling this twice with the byte-identical `outcome` returns a
// byte-identical result.
export function describeBitcoinAnchorTransactionConstructionStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBitcoinAnchorTransactionConstruction(outcome) {
    const state = outcome ? outcome.state : BitcoinAnchorTransactionConstructionState.IDLE;
    const construction = outcome ? outcome.construction : null;
    const plan = construction ? construction.plan : null;

    const changeOutput = plan ? plan.outputs.find((output) => output.type === 'change') : null;

    return Object.freeze({
        state,
        stateLabel: describeBitcoinAnchorTransactionConstructionStateLabel(state),
        reason: outcome ? outcome.reason : null,
        publicationId: construction ? construction.publicationId : null,
        contentHash: construction ? construction.contentHash : null,
        network: plan ? plan.network : null,
        selectedInputCount: plan ? plan.inputs.length : null,
        inputs: plan ? plan.inputs.map((input) => ({
            txid: input.txid,
            vout: input.vout,
            valueSats: input.valueSats,
            scriptType: input.scriptType
        })) : Object.freeze([]),
        outputs: plan ? plan.outputs.map((output) => ({
            type: output.type,
            address: output.type === 'change' ? output.address : null,
            valueSats: output.valueSats
        })) : Object.freeze([]),
        changeSats: changeOutput ? changeOutput.valueSats : (plan ? 0 : null),
        feeSats: plan ? plan.feeSats : null,
        totalInputSats: plan ? plan.totalInputSats : null,
        fundingObservedAt: construction ? construction.fundingObservation.observedAt : null,
        constructedAt: construction ? construction.constructedAt : null
    });
}
