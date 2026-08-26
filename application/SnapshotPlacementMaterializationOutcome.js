// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
//
// Names every way application/MaterializeSnapshotFromPlacementUseCase.js
// #execute() can end — the same "one enum, one file" shape application/
// SnapshotContentTransferOutcome.js (0.8.32) already established for the
// offline-package transfer path, applied here to the PLACEMENT-backed
// path 0.8.34's own Roadmap entry named directly as still missing: "An
// explicit 'Store Snapshot Locally' action after a successful placement
// resolution remains a distinct, future milestone (0.8.35)."
//
// Deliberately NOT a second, competing resolution vocabulary. This
// enum's job is to answer one question a step past application/
// SnapshotPlacementResolutionOutcome.js's own five values: once a
// placement has been asked whether its bytes can presently be retrieved,
// what happened when this replica tried to KEEP them? Every failure
// value below is a direct, lossless MAPPING of one or more
// SnapshotPlacementResolutionOutcome values — see application/
// MaterializeSnapshotFromPlacementUseCase.js's own header for the exact
// mapping table. This file never re-derives, re-checks, or re-verifies
// anything resolution already decided.
export const SnapshotPlacementMaterializationOutcome = Object.freeze({
    // The placement resolved (SnapshotPlacementResolutionOutcome.RESOLVED
    // — signature verified, bytes retrieved, bytes hashed correctly), and
    // those bytes were newly written to this replica's own local
    // content/ContentStore.js.
    STORED: 'stored',
    // The placement resolved, but this replica already held bytes for
    // that same content hash. Never an error — the identical "duplicate
    // is not a failure" posture application/
    // SnapshotContentTransferOutcome.js's own ALREADY_STORED already
    // holds one layer under, for the offline-package path.
    ALREADY_AVAILABLE: 'already-available',
    // Maps SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE and
    // .CONTENT_UNAVAILABLE — no store was available for this placement's
    // storage, or the resolved store could not presently retrieve the
    // bytes. Honestly inconclusive, exactly as both source outcomes
    // already are; a retry later may succeed, and nothing was stored.
    UNAVAILABLE: 'unavailable',
    // Maps SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH — the
    // resolved store answered with bytes that do NOT hash to this
    // placement's own claimed contentHash. A definite finding; nothing
    // is stored under a hash those bytes do not actually match.
    HASH_MISMATCH: 'hash-mismatch',
    // Maps SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE and
    // .INVALID_SIGNATURE — the placement itself is not even a well-formed,
    // validly signed claim. Nothing is retrieved or stored.
    INVALID_PLACEMENT: 'invalid-placement'
});
