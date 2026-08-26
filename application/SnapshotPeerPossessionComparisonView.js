import { SnapshotPeerPossessionState } from './SnapshotPeerPossessionState.js';
import { isPeerSnapshotPossessed } from './SnapshotPeerPossessionObservation.js';

// 0.8.41 — Peer Snapshot Possession Comparison & Observation History.
//
// application/SnapshotPeerPossessionView.js (0.8.40) turns ONE completed
// observation attempt into a single peer's own "Peer reports snapshot
// available" line. This file is its multi-peer sibling: pure, read-only,
// synchronous, and — this is the important part — deliberately NOT a
// ranking. Never imports application/SnapshotPeerPossessionCoordinator.js
// or application/ObservePeerSnapshotPossessionUseCase.js, and never
// itself sends a message.
//
//   describeSnapshotPeerPossessionComparison(publicationId, contentHash,
//       observations)
//     → {
//         publicationId, contentHash,
//         peers: [{ peerId, state, possessed, observedAt }, ...],
//         availableCount, notAvailableCount, unavailableCount
//       }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: the result names exactly what
// was observed, and counts exactly how many peers reported each state —
// and NOTHING ELSE. If Alice reports AVAILABLE and Bob reports
// NOT_AVAILABLE, the result says exactly that, in that order (`peers`
// preserves whatever order `observations` was given in — ordinarily
// application/SnapshotPeerPossessionObservationHistory.js's own
// `latestSnapshotPeerPossessionObservationsByPeer()`'s first-seen order,
// never re-sorted here by state or recency). There is deliberately no
// `bestPeer`, `preferredPeer`, `recommendedPeer`, `trustedPeer`,
// `reliability`, `confidence`, `score`, or `rank` anywhere in this file,
// and none should ever be added to it — see docs/Principles.md, "Peer
// Possession Observations Describe What Peers Report; They Do Not Become
// Placement Claims (0.8.41)."
//
// `observations`: an array of application/
// SnapshotPeerPossessionObservation.js records, ordinarily already
// narrowed to one entry per peer (the caller's own job — see
// application/SnapshotPeerPossessionObservationHistory.js's own
// `latestSnapshotPeerPossessionObservationsByPeer()`). This function does
// not itself deduplicate by peerId; a caller that hands it the SAME
// peer's observation twice gets two rows and two counted states, exactly
// as given — it trusts its input rather than silently re-deriving
// "latest," so the one place "latest" is decided stays that one function.
export function describeSnapshotPeerPossessionComparison(publicationId, contentHash, observations = []) {
    const list = Array.isArray(observations) ? observations : [];
    const peers = list.map((observation) => ({
        peerId: observation.peerId || null,
        state: observation.state,
        possessed: isPeerSnapshotPossessed(observation),
        observedAt: observation.observedAt
    }));
    return {
        publicationId,
        contentHash,
        peers,
        availableCount: peers.filter((peer) => peer.state === SnapshotPeerPossessionState.AVAILABLE).length,
        notAvailableCount: peers.filter((peer) => peer.state === SnapshotPeerPossessionState.NOT_AVAILABLE).length,
        unavailableCount: peers.filter((peer) => peer.state === SnapshotPeerPossessionState.UNAVAILABLE).length
    };
}

// A short, factual label for one observed state — the three-way
// vocabulary docs/Roadmap.md's own 0.8.41 entry names directly:
// "Available," "Not available," and "Could not determine." The third
// label is deliberately NOT "Not available" — application/
// SnapshotPeerPossessionState.js's own header already draws this line at
// the wire/requester boundary, and this view exists specifically to keep
// that same line visible to a person reading the comparison, never
// collapsing "the peer said no" into "nothing came back."
export function describeSnapshotPeerPossessionStateLabel(state) {
    switch (state) {
        case SnapshotPeerPossessionState.AVAILABLE: return 'Available';
        case SnapshotPeerPossessionState.NOT_AVAILABLE: return 'Not available';
        case SnapshotPeerPossessionState.UNAVAILABLE: return 'Could not determine';
        default: return null;
    }
}

// application/SnapshotMaterializationHistoryView.js's (0.8.38) own
// `describeSnapshotMaterializationHistory()`, one domain over: turns
// application/SnapshotPeerPossessionObservationHistory.js's own
// accumulated, chronological SEQUENCE of observations into the plain
// narration a "Possession Observation History" disclosure shows — oldest
// first, exactly the order `appendSnapshotPeerPossessionObservationHistoryEntry()`
// already appends in. Never sorts, groups, or reorders by peer or state,
// and never collapses repeat observations of the same peer into one
// row — every recorded check gets its own row, including a peer asked
// (and answering differently) more than once.
export function describeSnapshotPeerPossessionObservationHistory(history) {
    const observations = (Array.isArray(history) ? history : []).map((observation) => ({
        peerId: observation.peerId || null,
        stateLabel: describeSnapshotPeerPossessionStateLabel(observation.state),
        possessed: isPeerSnapshotPossessed(observation),
        observedAt: observation.observedAt,
        publicationId: observation.publicationId,
        contentHash: observation.contentHash
    }));
    return { count: observations.length, observations };
}
