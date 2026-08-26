import { describePeerPossessionAttempt } from './SnapshotPeerPossessionView.js';
import { describeSnapshotPeerPossessionStateLabel } from './SnapshotPeerPossessionComparisonView.js';

// 0.8.45 — Explicit Peer Possession Observation Inspection.
//
// application/SnapshotPeerPossessionComparisonView.js (0.8.41) already
// turns application/SnapshotPeerPossessionObservationHistory.js's own
// accumulated SEQUENCE of observations into a flat narration —
// `peerId`/`stateLabel`/`possessed`/`observedAt`/`publicationId`/
// `contentHash`, oldest first — for the "Possession Observation History"
// disclosure. That narration is a single flat LIST; it does not let a
// caller inspect any ONE observation on its own, the way application/
// SnapshotMaterializationHistoryDetailView.js (0.8.44) lets a caller
// inspect any one acquisition ATTEMPT on its own. This file is that same
// per-attempt inspection layer, one domain over: it adds exactly ONE new,
// UI-ready convenience — a short `stateShortLabel`, sized for a
// condensed, chronological row ("Alice → Available") — alongside the
// SAME full-sentence `stateLabel` application/
// SnapshotPeerPossessionView.js#describePeerPossessionAttempt() already
// narrates ("Peer reports snapshot available") for whichever single
// observation a person expands. Mirrors application/
// SnapshotMaterializationHistoryDetailView.js's own `outcomeLabel`/
// `outcomeShortLabel` split exactly, one domain over.
//
//   describeSnapshotPeerPossessionObservationDetail(observation)
//     → one observation's own description, or null for no observation.
//   describeSnapshotPeerPossessionObservationDetails(observations)
//     → { count, entries: [...] }, in the SAME order `observations` was
//       given — ordinarily application/
//       SnapshotPeerPossessionObservationHistory.js's own chronological,
//       append-only order (oldest first), but this file never itself
//       reads that history or re-sorts what it is given.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from application/
// SnapshotPeerPossessionObservation.js's own header one layer up: a peer
// possession observation records what a peer reported at a particular
// time; inspection must not turn that observation into a current claim
// about the peer. Both functions add ZERO new facts and perform ZERO new
// work — `state`, `publicationId`, `contentHash`, and `observedAt` are
// carried through unchanged from the observation itself; `stateLabel`
// and `stateShortLabel` are two DIFFERENT existing sentences this
// codebase already produces for that same `state` — `describePeerPossessionAttempt()`'s
// own full sentence and `describeSnapshotPeerPossessionStateLabel()`'s own
// short word — brought together here for one observation, never
// recomputed or reworded. Neither function contacts a peer, performs a
// new local content check, resolves a placement, mutates the observation
// or the array it was given, or reads any state beyond the observation
// itself — this file takes no coordinator, catalog, use case, or store as
// an argument, so there is no way for it to perform a new action.
//
// UNAVAILABLE reads `stateShortLabel: 'Could not determine'`, never "Not
// available" — the identical three-way distinction application/
// SnapshotPeerPossessionComparisonView.js's own
// `describeSnapshotPeerPossessionStateLabel()` already draws, preserved
// here unchanged: "the peer said no" and "nothing came back" are never
// collapsed into one reading.
//
// And, restated one more time because it is the entire point of this
// file: no peer is ever ranked, and NO `reliability`, `availabilityPercentage`,
// `score`, `sourceRanking`, `bestPeer`, or `mostReliablePeer` field is
// ever added here — an observation ledger is not a reliability metric.
// See docs/Principles.md, "Peer Possession Observations Describe What
// Peers Report; They Do Not Become Placement Claims (0.8.41)."
//
// NEVER PERSISTED, NEVER SHARED, and introduces no new state of its
// own — the identical restraint every file it composes already holds.
// Pure and stateless: no constructor, no injected dependency, no
// caching. Calling either function twice with a byte-identical
// observation returns a byte-identical result.
export function describeSnapshotPeerPossessionObservationDetail(observation) {
    if (!observation) return null;
    return Object.freeze({
        peerId: observation.peerId || null,
        publicationId: observation.publicationId,
        contentHash: observation.contentHash,
        state: observation.state,
        stateLabel: describePeerPossessionAttempt(observation).label,
        stateShortLabel: describeSnapshotPeerPossessionStateLabel(observation.state),
        observedAt: observation.observedAt
    });
}

export function describeSnapshotPeerPossessionObservationDetails(observations) {
    const list = Array.isArray(observations) ? observations : [];
    const entries = list
        .map((observation) => describeSnapshotPeerPossessionObservationDetail(observation))
        .filter(Boolean);
    return Object.freeze({ count: entries.length, entries: Object.freeze(entries) });
}
