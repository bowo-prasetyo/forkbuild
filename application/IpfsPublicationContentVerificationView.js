import { IpfsPublicationContentVerificationCoordinatorState } from './IpfsPublicationContentVerificationCoordinatorState.js';

const STATE_LABELS = {
    [IpfsPublicationContentVerificationCoordinatorState.IDLE]: 'Not yet verified',
    [IpfsPublicationContentVerificationCoordinatorState.VERIFYING]: 'Verifying…',
    [IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH]: 'Retrieved content matches the recorded content hash',
    [IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH]: 'Retrieved content does not match the recorded content hash',
    [IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE]: 'Content retrieval unavailable',
    [IpfsPublicationContentVerificationCoordinatorState.FAILED]: 'Verification failed'
};

// 0.8.70 — IPFS Publication & Content Verification UI.
//
// The label vocabulary for application/
// IpfsPublicationContentVerificationCoordinatorState.js, and the
// projection application/IpfsPublicationContentVerificationCoordinator.js
// 's own outcome is turned into a screen's worth of facts through —
// mirroring exactly how application/BitcoinAnchorContentProofView.js
// (0.8.57) turns application/BitcoinAnchorContentProofState.js's own
// vocabulary into a factual sentence, for a different external boundary.
//
//   describeIpfsPublicationContentVerificationStateLabel(state)
//     IDLE          -> "Not yet verified"
//     VERIFYING     -> "Verifying…"
//     HASH_MATCH    -> "Retrieved content matches the recorded content hash"
//     HASH_MISMATCH -> "Retrieved content does not match the recorded content hash"
//     UNAVAILABLE   -> "Content retrieval unavailable"
//     FAILED        -> "Verification failed"
//
//   describeIpfsPublicationContentVerification(outcome)
//     -> { state, stateLabel, contentHash, locator, reason, observedAt }
//
// NEVER "VERIFIED," "TRUSTED," "SAFE," "PERMANENT," OR "GUARANTEED." A
// hash match is an observation, not a verdict — see application/
// IpfsPublicationContentVerificationState.js's own header, and
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn
// Them Into A Verdict (0.8.57)." Nothing in this file's output ever
// carries one of those words, or a `confidence`/`score`/`health` field
// of any kind.
//
// `contentHash`/`locator` ARE NEVER RE-DERIVED HERE. Exactly as
// application/IpfsRemotePublicationView.js's own header requires for its
// own `contentHash`/`locator` — this view exposes only whatever
// `outcome.contentHash`/`outcome.locator` the coordinator itself already
// settled on; it computes nothing and re-checks nothing.
//
// Pure and stateless: no constructor, no network access, no history of
// its own. Calling either function twice with byte-identical input
// returns a byte-identical result.
export function describeIpfsPublicationContentVerificationStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeIpfsPublicationContentVerification(outcome) {
    const state = outcome ? outcome.state : IpfsPublicationContentVerificationCoordinatorState.IDLE;

    return Object.freeze({
        state,
        stateLabel: describeIpfsPublicationContentVerificationStateLabel(state),
        contentHash: outcome ? outcome.contentHash : null,
        locator: outcome ? outcome.locator : null,
        reason: outcome ? outcome.reason : null,
        observedAt: outcome ? outcome.observedAt : null
    });
}
