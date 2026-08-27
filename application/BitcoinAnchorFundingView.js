import { BitcoinAnchorFundingObservationState } from './BitcoinAnchorFundingObservationState.js';

const STATE_LABELS = {
    [BitcoinAnchorFundingObservationState.OBSERVED]: 'Funding observed',
    [BitcoinAnchorFundingObservationState.UNSUPPORTED]: 'Unsupported address format',
    [BitcoinAnchorFundingObservationState.UNAVAILABLE]: 'Funding unavailable'
};

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// The label vocabulary for application/BitcoinAnchorFundingObservationState.js,
// mirroring exactly how application/BitcoinWalletConnectionView.js (0.8.58)
// turns application/BitcoinWalletConnectionState.js's own vocabulary into a
// factual sentence, one domain over.
//
//   describeBitcoinAnchorFundingStateLabel(state)
//     OBSERVED    -> "Funding observed"
//     UNSUPPORTED -> "Unsupported address format"
//     UNAVAILABLE -> "Funding unavailable"
//
//   describeBitcoinAnchorFunding(observation, { expectedNetwork })
//     -> { state, stateLabel, account, network, expectedNetwork,
//          networkMismatch, scriptType, utxos, utxoCount, totalValueSats,
//          changeAccount, reason, observedAt }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. Every field is read
// straight off `observation` — a real anchoring/
// BitcoinWalletFundingObserver.js#observeFunding() result — the identical
// restraint application/BitcoinAnchorTransactionReviewView.js already holds
// one domain over. It carries no `valid`, `safe`, `recommended`, `best`, or
// `confidence` field: which UTXOs are worth spending, and whether this
// funding is "enough," is entirely a judgment for anchoring/
// BitcoinAnchorTransactionBuilder.js's own deterministic selection and, one
// level higher, the person reading the result — never this view. See
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict (0.8.57)."
//
// `networkMismatch` NAMES STALENESS AGAINST THE WALLET'S CURRENT NETWORK,
// NEVER AUTO-REFRESHES. `expectedNetwork` is the CONNECTED wallet's own
// CURRENT `network` (application/BitcoinWalletConnectionView.js's own
// field, called with the review's own network one domain over) — comparing
// it against `observation.network` (the network this SPECIFIC observation
// was made under) surfaces exactly one thing: a person switched their
// wallet's network after this funding was observed. It is `true` only for
// an OBSERVED or UNSUPPORTED observation whose own network disagrees; it is
// deliberately `false`, never `null`, when no `expectedNetwork` was
// supplied or the observation is UNAVAILABLE — there is no meaningful
// staleness to report about an observation that never completed. Exactly
// like application/BitcoinWalletConnectionView.js's own identical field,
// this never triggers an automatic re-observation — a caller decides
// whether and when to ask again.
//
// Pure and stateless: no constructor, no network access, no history of its
// own. `observation` is read only through its own fixed field set — any
// object shaped that way (a real anchoring/BitcoinWalletFundingObserver.js
// result, or a plain object a test constructs) works identically.
export function describeBitcoinAnchorFundingStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBitcoinAnchorFunding(observation, { expectedNetwork = null } = {}) {
    const state = observation ? observation.state : null;
    const network = observation ? observation.network : null;
    const networkMismatch = expectedNetwork !== null
        && state !== BitcoinAnchorFundingObservationState.UNAVAILABLE
        && network !== null
        && network !== expectedNetwork;

    return Object.freeze({
        state,
        stateLabel: describeBitcoinAnchorFundingStateLabel(state),
        account: observation ? observation.account : null,
        network,
        expectedNetwork,
        networkMismatch,
        scriptType: observation ? observation.scriptType : null,
        utxos: observation ? observation.utxos : Object.freeze([]),
        utxoCount: observation ? observation.utxos.length : 0,
        totalValueSats: observation ? observation.totalValueSats : null,
        changeAccount: observation ? observation.changeAccount : null,
        reason: observation ? observation.reason : null,
        observedAt: observation ? observation.observedAt : null
    });
}
