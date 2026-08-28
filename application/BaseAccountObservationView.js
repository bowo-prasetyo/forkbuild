import { BaseNetworkObservationState } from './BaseNetworkObservationState.js';

const STATE_LABELS = {
    [BaseNetworkObservationState.OBSERVED]: 'Base account observed',
    [BaseNetworkObservationState.CHAIN_MISMATCH]: 'Connected network is not Base',
    [BaseNetworkObservationState.UNAVAILABLE]: 'Base account unavailable'
};

// 0.8.90 — Explicit Base Network & Account Observation.
//
// The label vocabulary for application/BaseNetworkObservationState.js,
// mirroring exactly how application/BitcoinAnchorFundingView.js (0.8.60)
// turns application/BitcoinAnchorFundingObservationState.js's own
// vocabulary into a factual sentence, one chain over.
//
//   describeBaseAccountObservationStateLabel(state)
//     OBSERVED       -> "Base account observed"
//     CHAIN_MISMATCH -> "Connected network is not Base"
//     UNAVAILABLE    -> "Base account unavailable"
//
//   describeBaseAccountObservation(observation)
//     -> { state, stateLabel, address, network, chainId, nativeBalanceWei,
//          reason, observedAt }
//
// A PURE PROJECTION, NEVER A NEW SOURCE OF TRUTH. Every field is read
// straight off `observation` — a real application/BaseAccountObservation.js
// instance, or a plain object shaped the same way, exactly the restraint
// application/BitcoinAnchorFundingView.js already holds one chain over. It
// carries no `valid`, `safe`, `recommended`, or `confidence` field: this
// view never turns an observation into a verdict about whether it is safe
// to build, sign, or publish anything against. See docs/Principles.md,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)."
//
// Pure and stateless: no constructor, no network access, no history of its
// own.
export function describeBaseAccountObservationStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBaseAccountObservation(observation) {
    return Object.freeze({
        state: observation ? observation.state : null,
        stateLabel: observation ? describeBaseAccountObservationStateLabel(observation.state) : null,
        address: observation ? observation.address : null,
        network: observation ? observation.network : null,
        chainId: observation ? observation.chainId : null,
        nativeBalanceWei: observation ? observation.nativeBalanceWei : null,
        reason: observation ? observation.reason : null,
        observedAt: observation ? observation.observedAt : null
    });
}
