// 0.8.41 — Peer Snapshot Possession Comparison & Observation History.
//
// application/SnapshotPeerPossessionObservation.js (0.8.40) names ONE
// frozen fact: what one peer said, about one contentHash, at one moment
// this replica's own clock recorded. This file is the append-only
// SEQUENCE of every such observation a single ui/views/
// DecentralizedPublicationsView.js entry has collected THIS SESSION,
// mirroring application/SnapshotMaterializationHistory.js's (0.8.38) own
// shape exactly, one domain over:
//
//   []
//     │  appendSnapshotPeerPossessionObservationHistoryEntry(history, obs)
//     ▼
//   [obs1]
//     │  appendSnapshotPeerPossessionObservationHistoryEntry(history, obs2)
//     ▼
//   [obs1, obs2]
//     │ ...
//     ▼
//   [obs1, obs2, obs3, ...]
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from application/
// SnapshotMaterializationHistory.js's own header one domain over: a
// history is APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, and never
// reordered, deduplicated, or filtered down to "the current answer" —
// every explicit observation, from either a single "Check with Peer"
// click or a multi-peer "Check Selected Peers" click, gets its own entry,
// in the order it happened. The SAME peer may appear any number of
// times — a caller asking Alice three times ends up with three entries,
// not one entry that got "refreshed."
//
// `appendSnapshotPeerPossessionObservationHistoryEntry()` never mutates
// the `history` array it was given — the same "always a new frozen
// array" discipline application/SnapshotMaterializationHistory.js's own
// `appendSnapshotMaterializationHistoryEntry()` already holds. A caller
// keeps whatever this function returns as the new history; the old array
// is left untouched.
//
// NEVER PERSISTED, NEVER SHARED, NEVER TRANSMITTED — the identical
// restraint application/SnapshotPeerPossessionObservation.js's own header
// already holds for a single observation, now extended to the sequence
// as a whole. This history is never written onto a core/
// DecentralizedPublication.js, a core/PublicationSnapshotPlacement.js, a
// catalog, or a Publication Replica Package. It lives only in whatever
// ephemeral component state a caller keeps for the lifetime of the
// page — reset to empty the moment the Publication Center is reopened.
// See docs/Principles.md, "Peer Possession Observations Describe What
// Peers Report; They Do Not Become Placement Claims (0.8.41)."
export function appendSnapshotPeerPossessionObservationHistoryEntry(history, observation) {
    const existing = Array.isArray(history) ? history : [];
    if (!observation) return Object.freeze(existing.slice());
    return Object.freeze([...existing, observation]);
}

// Reduces a history down to, at most, ONE entry per distinct `peerId` —
// that peer's own MOST RECENTLY observed entry, i.e. the entry with the
// latest `observedAt` among every entry this history holds for that
// peer. This is the one place this milestone lets "current" mean
// anything at all: never a live view of a peer's actual present state
// (nothing here re-asks anyone), only "the newest fact this replica
// happens to have on file." Ties (an identical `observedAt` millisecond)
// keep whichever entry appears LATER in `history` — history is already
// chronological, so that is still the more recent of the two.
//
// Returned in the order each peerId FIRST appears in `history` — a
// stable, deterministic order that never reorders by state, recency, or
// any notion of which peer is "better." A `null`/non-string `peerId` is
// its own distinct bucket (mirroring application/
// SnapshotPeerPossessionObservation.js's own tolerance for a `null`
// peerId), so a handful of contract-violation observations with no known
// peer never silently collapse into one another.
//
// `publicationId`/`contentHash`, when given, filter the history down to
// entries naming exactly that pair FIRST — the identical restraint
// application/PublicationSnapshotPlacementConvergence.js's own
// `derivePublicationSnapshotPlacementConvergence()` already holds for
// `publicationId` alone, one axis over: a caller handing this function a
// whole session's history, rather than one already scoped to a single
// entry, still gets back only what is relevant to the pair it asked
// about.
export function latestSnapshotPeerPossessionObservationsByPeer(history, { publicationId = null, contentHash = null } = {}) {
    const order = [];
    const latestByPeer = new Map();
    for (const observation of (Array.isArray(history) ? history : [])) {
        if (!observation) continue;
        if (publicationId && observation.publicationId !== publicationId) continue;
        if (contentHash && observation.contentHash !== contentHash) continue;
        const key = observation.peerId || null;
        if (!latestByPeer.has(key)) order.push(key);
        const current = latestByPeer.get(key);
        if (!current || observation.observedAt.getTime() >= current.observedAt.getTime()) {
            latestByPeer.set(key, observation);
        }
    }
    return order.map((key) => latestByPeer.get(key));
}
