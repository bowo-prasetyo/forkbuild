import { IpfsRemotePublicationState } from './IpfsRemotePublicationState.js';

const STATE_LABELS = {
    [IpfsRemotePublicationState.IDLE]: 'Not yet published',
    [IpfsRemotePublicationState.PUBLISHING]: 'Publishing…',
    [IpfsRemotePublicationState.PUBLISHED]: 'Published',
    [IpfsRemotePublicationState.REJECTED]: 'Publish rejected',
    [IpfsRemotePublicationState.UNAVAILABLE]: 'Publish unavailable',
    [IpfsRemotePublicationState.FAILED]: 'Publish failed'
};

// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
//
// The label vocabulary for application/IpfsRemotePublicationState.js,
// and the projection application/IpfsRemotePublicationCoordinator.js's
// own outcome is turned into a screen's worth of facts through —
// mirroring exactly how application/BitcoinAnchorBroadcastView.js
// (0.8.64) turns application/BitcoinAnchorBroadcastState.js's own
// vocabulary into a factual sentence, for a different external boundary.
//
//   describeIpfsRemotePublicationStateLabel(state)
//     IDLE        -> "Not yet published"
//     PUBLISHING  -> "Publishing…"
//     PUBLISHED   -> "Published"
//     REJECTED    -> "Publish rejected"
//     UNAVAILABLE -> "Publish unavailable"
//     FAILED      -> "Publish failed"
//
//   describeIpfsRemotePublication(outcome)
//     -> { state, stateLabel, contentHash, locator, endpoint, publishedAt, reason }
//
//   describeIpfsRemotePublishingConfiguration(configuration)
//     -> { configured, endpoint, hasCredential }
//
// NEVER "VERIFIED," "TRUSTED," "SAFE," "PERMANENT," OR "GUARANTEED." A
// pinning provider saying it accepted content is an observation, not a
// verdict — see application/IpfsRemotePublicationState.js's own header,
// and docs/Principles.md, "The UI Displays Observations; It Does Not
// Turn Them Into A Verdict (0.8.57)." Nothing in this file's output ever
// carries one of those words, or a `confidence`/`score`/`health` field
// of any kind.
//
// THE CREDENTIAL IS NEVER PROJECTED. `describeIpfsRemotePublishingConfiguration()`
// exposes `hasCredential` — a boolean — and never the credential's own
// value, mirroring application/IpfsRemotePublishingConfiguration.js's
// own `hasCredential` getter exactly. A caller of this file has no way
// to put a real credential on screen even by accident.
//
// `contentHash`/`locator` ARE NEVER RE-DERIVED HERE. Exactly as
// application/BitcoinAnchorBroadcastView.js's own header requires for
// `txid` — this view exposes only whatever `outcome.contentHash`/
// `outcome.locator` the coordinator itself already settled on; it
// computes nothing and re-checks nothing.
//
// Pure and stateless: no constructor, no network access, no history of
// its own. Calling either function twice with byte-identical input
// returns a byte-identical result.
export function describeIpfsRemotePublicationStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeIpfsRemotePublication(outcome) {
    const state = outcome ? outcome.state : IpfsRemotePublicationState.IDLE;

    return Object.freeze({
        state,
        stateLabel: describeIpfsRemotePublicationStateLabel(state),
        contentHash: outcome ? outcome.contentHash : null,
        locator: outcome ? outcome.locator : null,
        endpoint: outcome ? outcome.endpoint : null,
        publishedAt: outcome ? outcome.publishedAt : null,
        reason: outcome ? outcome.reason : null
    });
}

export function describeIpfsRemotePublishingConfiguration(configuration) {
    return Object.freeze({
        configured: Boolean(configuration),
        endpoint: configuration ? configuration.endpoint : null,
        hasCredential: configuration ? configuration.hasCredential : false
    });
}
