// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
//
// application/SnapshotContentMaterializationCoordinator.js (0.8.34) is a
// deliberately thin pass-through in front of the offline-package import
// pipeline; this class is the identical shape in front of application/
// MaterializeSnapshotFromPlacementUseCase.js, one axis over. A
// DELIBERATELY THIN PASS-THROUGH, NOT A SECOND ORCHESTRATOR — the
// identical restraint every *CreationCoordinator.js and both existing
// *MaterializationCoordinator.js-shaped classes in this codebase already
// hold. `materialize(placement)` forwards to that use case's own
// `execute()` completely unchanged and returns its result exactly as
// received — never reinterpreted, never caught, never turned into a
// different shape. A caller wanting a display-ready shape uses
// application/SnapshotPlacementMaterializationView.js separately, exactly
// as every sibling coordinator already stays separate from its own
// display derivation.
//
// DELIBERATELY single-placement, and deliberately no ranking. This class
// never discovers a placement, never selects a "best" or "preferred" one
// among several a publication might have, never tries a second placement
// after the first fails, and never retries automatically. The choice of
// WHICH placement to materialize from is always made by the person
// clicking "Materialize Snapshot" on one specific placement card, exactly
// mirroring the identical choice already required to click "Resolve
// Snapshot" on one specific placement (0.8.20) — never a list this class
// assembles or ranks on their behalf. See docs/Principles.md,
// "Placement Resolution Observes Present Availability; Materialization
// Turns It Into Possession (0.8.35)."
//
// This class never selects a preferred placement, never retries a failed
// materialization against a different placement, never verifies an
// anchor, and never modifies a publication, an anchor, or a placement —
// it does exactly one thing: hand `placement` to application/
// MaterializeSnapshotFromPlacementUseCase.js#execute(), unchanged.
export class SnapshotPlacementMaterializationCoordinator {
    constructor(materializeSnapshotFromPlacementUseCase) {
        if (!materializeSnapshotFromPlacementUseCase || typeof materializeSnapshotFromPlacementUseCase.execute !== 'function') {
            throw new Error('SnapshotPlacementMaterializationCoordinator: a MaterializeSnapshotFromPlacementUseCase is required');
        }
        this._useCase = materializeSnapshotFromPlacementUseCase;
    }

    // Triggers exactly ONE explicit materialization attempt for
    // `placement` — a PublicationSnapshotPlacement instance a caller
    // already discovered (application/
    // SnapshotPlacementResolutionCoordinator.js#discover()), structurally
    // validated and content-verified entirely inside application/
    // MaterializeSnapshotFromPlacementUseCase.js#execute(), never here.
    // Resolves to that use case's own result completely unchanged; throws
    // straight through for a caller contract violation (a non-placement
    // argument) — a genuine programming error this class does not catch,
    // exactly as application/SnapshotContentMaterializationCoordinator.js's
    // own header already declines to catch one, one axis over. It is
    // ui/views/DecentralizedPublicationsView.js's own job, as the UI
    // layer, to turn a completed attempt into its own display state via
    // application/SnapshotPlacementMaterializationView.js.
    async materialize(placement) {
        return this._useCase.execute(placement);
    }
}
