// 0.8.40 — Snapshot Possession Observation Exchange.
//
// application/SnapshotPeerMaterializationCoordinator.js (0.8.37) is a
// deliberately thin pass-through in front of application/
// MaterializeSnapshotFromPeerUseCase.js; this class is the identical shape
// in front of application/ObservePeerSnapshotPossessionUseCase.js, one axis
// over. A DELIBERATELY THIN PASS-THROUGH, NOT A SECOND ORCHESTRATOR — the
// identical restraint every *Coordinator.js in this codebase already holds.
// `observe({ peer, publicationId, contentHash })` forwards to that use
// case's own `execute()` completely unchanged and returns its result
// exactly as received.
//
// DELIBERATELY single-peer, and deliberately no ranking, fallback, or
// automatic "ask every connected peer" behavior. The choice of WHICH peer
// to ask is always the person's own, made by clicking "Check with Peer" on
// one specific, already-selected peer — never a list this class assembles
// or ranks on their behalf.
export class SnapshotPeerPossessionCoordinator {
    constructor(observePeerSnapshotPossessionUseCase) {
        if (!observePeerSnapshotPossessionUseCase || typeof observePeerSnapshotPossessionUseCase.execute !== 'function') {
            throw new Error('SnapshotPeerPossessionCoordinator: an ObservePeerSnapshotPossessionUseCase is required');
        }
        this._useCase = observePeerSnapshotPossessionUseCase;
    }

    // Triggers exactly ONE explicit "Check with Peer" attempt for
    // `{ peer, publicationId, contentHash }`. Resolves to that use case's
    // own application/SnapshotPeerPossessionObservation.js result
    // completely unchanged; throws straight through for a caller contract
    // violation (a missing peer/publicationId/contentHash) — a genuine
    // programming error this class does not catch. It is ui/views/
    // DecentralizedPublicationsView.js's own job, as the UI layer, to turn
    // a completed observation into its own display state via application/
    // SnapshotPeerPossessionView.js.
    async observe({ peer, publicationId, contentHash } = {}) {
        return this._useCase.execute({ peer, publicationId, contentHash });
    }
}
