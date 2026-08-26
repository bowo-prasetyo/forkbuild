// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// application/SnapshotPlacementMaterializationCoordinator.js (0.8.35) is a
// deliberately thin pass-through in front of application/
// MaterializeSnapshotFromPlacementUseCase.js; this class is the identical
// shape in front of application/MaterializeSnapshotFromPeerUseCase.js, one
// axis over. A DELIBERATELY THIN PASS-THROUGH, NOT A SECOND ORCHESTRATOR —
// the identical restraint every *MaterializationCoordinator.js in this
// codebase already holds. `materialize({ peer, publicationId, contentHash })`
// forwards to that use case's own `execute()` completely unchanged and
// returns its result exactly as received — never reinterpreted, never
// caught, never turned into a different shape.
//
// DELIBERATELY single-peer, and deliberately no ranking or fallback. This
// class never discovers a peer, never selects a "best" or "preferred" one
// among several connected, never tries a second peer after the first
// times out, and never retries automatically. The choice of WHICH peer to
// ask is always made by the person clicking "Get Snapshot from Peer" on
// one specific, already-selected peer — never a list this class assembles
// or ranks on their behalf.
export class SnapshotPeerMaterializationCoordinator {
    constructor(materializeSnapshotFromPeerUseCase) {
        if (!materializeSnapshotFromPeerUseCase || typeof materializeSnapshotFromPeerUseCase.execute !== 'function') {
            throw new Error('SnapshotPeerMaterializationCoordinator: a MaterializeSnapshotFromPeerUseCase is required');
        }
        this._useCase = materializeSnapshotFromPeerUseCase;
    }

    // Triggers exactly ONE explicit "Get Snapshot from Peer" attempt for
    // `{ peer, publicationId, contentHash }`. Resolves to that use case's
    // own result completely unchanged; throws straight through for a
    // caller contract violation (a missing peer/publicationId/contentHash)
    // — a genuine programming error this class does not catch, exactly as
    // application/SnapshotPlacementMaterializationCoordinator.js's own
    // header already declines to catch one, one axis over. It is
    // ui/views/DecentralizedPublicationsView.js's own job, as the UI
    // layer, to turn a completed attempt into its own display state via
    // application/SnapshotPeerMaterializationView.js.
    async materialize({ peer, publicationId, contentHash } = {}) {
        return this._useCase.execute({ peer, publicationId, contentHash });
    }
}
