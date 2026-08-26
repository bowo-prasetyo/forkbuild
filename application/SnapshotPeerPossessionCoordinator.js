// 0.8.40 — Snapshot Possession Observation Exchange.
// 0.8.41 — Peer Snapshot Possession Comparison & Observation History.
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
//
// `observePeers({ peers, publicationId, contentHash })` (0.8.41) is the
// EXPLICIT multi-peer sibling `observe()`'s own header already promises
// this class would never grow into on its own: it fires exactly ONE
// `observe()` per entry of a CALLER-SUPPLIED `peers` array, in parallel,
// and resolves to an array of results in the SAME order as `peers` —
// never the order responses happen to arrive in. THE ONE RULE THIS METHOD
// EXISTS TO ENFORCE, restated because it is the entire reason this method
// is safe to add: this class still never discovers, ranks, selects,
// retries, or falls back — `peers` is exactly the list a person checked
// the boxes for, nothing more and nothing fewer. A single peer's own
// request failing (a caller contract violation on THAT entry, e.g. a
// `null` slipped into `peers`) rejects the WHOLE `Promise.all()`, exactly
// as `observe()` itself already throws straight through for a contract
// violation — this method adds no try/catch of its own to paper over
// that, because a per-peer network timeout already resolves to its own
// honest UNAVAILABLE observation via application/
// ObservePeerSnapshotPossessionUseCase.js and never reaches this method
// as a rejection at all. See docs/Principles.md, "Peer Possession
// Observations Describe What Peers Report; They Do Not Become Placement
// Claims (0.8.41)."
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

    // Asks every peer in a CALLER-SUPPLIED `peers` array — a person's own
    // checked-box selection, never a list this class assembles, ranks, or
    // pads out with peers it discovers on its own — the identical
    // `{ publicationId, contentHash }` question, independently. Resolves
    // to an array of application/SnapshotPeerPossessionObservation.js
    // records, one per entry of `peers`, in `peers`' own order. See this
    // class's own header above for why a single malformed entry in
    // `peers` is left to reject the whole call rather than being silently
    // skipped.
    async observePeers({ peers, publicationId, contentHash } = {}) {
        const list = Array.isArray(peers) ? peers : [];
        return Promise.all(list.map((peer) => this.observe({ peer, publicationId, contentHash })));
    }
}
