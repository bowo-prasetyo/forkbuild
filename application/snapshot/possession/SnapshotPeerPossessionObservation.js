import { SnapshotPeerPossessionState } from './SnapshotPeerPossessionState.js';

// 0.8.40 — Snapshot Possession Observation Exchange.
//
// THE ONE SHAPE THIS ENTIRE MILESTONE EXISTS TO PROTECT:
//
//   { peerId, publicationId, contentHash, state, observedAt }
//
// A record of what one specific peer said, about one specific contentHash,
// at one specific moment THIS replica's own clock recorded — never a
// distributed fact, never evidence, never a placement, and never anything
// that gets more "true" the longer it sits around. Mirrors application/
// PublicationAnchorVerificationObservation.js (0.8.13) and application/
// SnapshotPlacementResolutionObservation.js (0.8.20)'s own identical
// `observedAt`-stamped, purely-local-fact shape, applied here to a peer's
// own ANSWER rather than to this replica's own verification/resolution
// work — the one field those two files don't need and this one does is
// `peerId`, because unlike verifying an anchor or resolving a placement,
// asking a peer is inherently a statement ABOUT that peer, not just about
// this replica's own effort.
//
// NEVER PERSISTED, NEVER SHARED, NEVER RE-DERIVED FROM A LATER CHECK. Once
// built, an observation is a frozen fact about the past — `state` at
// `observedAt` — and stays exactly that even if the peer's own possession
// later changes. A caller wanting to know whether a peer STILL reports
// AVAILABLE must make a NEW request and receive a NEW observation with its
// own, later, `observedAt`; nothing in this codebase ever mutates an
// existing observation, re-validates it against a fresh answer, or expires
// it automatically. See docs/Principles.md, "Peer Possession Responses Are
// Observations, Not Placement Claims (0.8.40)."
export function toSnapshotPeerPossessionObservation({
    peerId = null, publicationId, contentHash, state, observedAt = new Date()
} = {}) {
    if (!publicationId || typeof publicationId !== 'string') {
        throw new Error('toSnapshotPeerPossessionObservation: a publicationId is required');
    }
    if (!contentHash || typeof contentHash !== 'string') {
        throw new Error('toSnapshotPeerPossessionObservation: a contentHash is required');
    }
    if (!Object.values(SnapshotPeerPossessionState).includes(state)) {
        throw new Error('toSnapshotPeerPossessionObservation: a valid SnapshotPeerPossessionState is required');
    }
    const observedAtDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
    if (Number.isNaN(observedAtDate.getTime())) {
        throw new Error('toSnapshotPeerPossessionObservation: observedAt must be a valid date');
    }
    return Object.freeze({
        peerId: peerId || null,
        publicationId,
        contentHash,
        state,
        observedAt: observedAtDate
    });
}

// A single, honest boolean carved out of `state` — TRUE only for
// SnapshotPeerPossessionState.AVAILABLE, mirroring application/
// PublicationSnapshotPossessionView.js#isSnapshotPossessed()'s own identical
// restraint one milestone back. NOT_AVAILABLE and UNAVAILABLE both report
// `false` here — this function deliberately never distinguishes "the peer
// said no" from "nothing came back," because neither one means this
// replica, or the peer, possesses anything; a caller that needs to tell
// them apart still reads `observation.state` itself, unchanged.
export function isPeerSnapshotPossessed(observation) {
    return Boolean(observation) && observation.state === SnapshotPeerPossessionState.AVAILABLE;
}
