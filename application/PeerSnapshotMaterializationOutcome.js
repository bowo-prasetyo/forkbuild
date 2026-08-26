// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// Names every way application/MaterializeSnapshotFromPeerUseCase.js
// #execute() can end — the same "one enum, one file" shape application/
// SnapshotContentTransferOutcome.js (0.8.32) and application/
// SnapshotPlacementMaterializationOutcome.js (0.8.35) already established,
// applied here to the PEER-backed path.
export const PeerSnapshotMaterializationOutcome = Object.freeze({
    // The selected peer answered with bytes that verified against
    // `contentHash` (`core/ContentReference.js#verify()`, run inside
    // application/StoreSnapshotContentUseCase.js — never here), and those
    // bytes were newly written to this replica's own local
    // content/ContentStore.js.
    STORED: 'stored',
    // The selected peer answered with verifying bytes, but this replica
    // already held bytes for that same content hash. Never an error — the
    // identical "duplicate is not a failure" posture application/
    // SnapshotPlacementMaterializationOutcome.js's own ALREADY_AVAILABLE
    // already holds one axis over.
    ALREADY_AVAILABLE: 'already-available',
    // No verified RESPONSE arrived from the selected peer before the
    // timeout elapsed. Deliberately the SAME outcome whether the peer does
    // not currently hold these bytes, is unreachable, or simply never
    // replied — application/PeerSnapshotContentProtocol.js's own wire
    // shape carries no NOT_FOUND kind, so nothing on the requesting side
    // could ever honestly distinguish those cases from one another. See
    // application/PublicationSnapshotContentPeerExchange.js's own header.
    // Honestly inconclusive, never a rejection; choosing a different peer,
    // or trying the same one again later, may succeed.
    UNAVAILABLE: 'unavailable',
    // The selected peer answered, but its own bytes do NOT hash to the
    // `contentHash` this replica asked for. A DEFINITE finding — nothing
    // is stored under a hash those bytes do not actually match, regardless
    // of the fact that the peer was an authenticated connection. See
    // application/PublicationSnapshotContentPeerExchange.js's own header:
    // peer authentication authenticates the communication participant,
    // never the content itself.
    HASH_MISMATCH: 'hash-mismatch'
});
