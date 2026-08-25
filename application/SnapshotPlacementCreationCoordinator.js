// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
// The placement-side counterpart of application/
// PublicationAnchorCreationCoordinator.js (0.8.11), mirrored
// deliberately — application/PublicationEvidenceCoordinator.js's own
// 0.8.3 "what's known"/"does it hold up" pair has an EXACT placement-side
// analogue in application/SnapshotPlacementResolutionCoordinator.js
// (0.8.20, "discover"/"resolve"). This class is the third, symmetric
// question a person can now ask explicitly from the same page — "go
// place some" — and nothing more:
//
//   availableStorageTypes()      — which storage backends this replica
//                                   can currently ask to place bytes onto
//                                   at all (a synchronous, side-effect-
//                                   free registry read)
//   create(publicationId, storage) — trigger exactly ONE external
//                                   placement attempt, for exactly the
//                                   storage the caller named
//
// A DELIBERATELY THIN PASS-THROUGH, NOT A SECOND ORCHESTRATOR — the
// identical restraint application/
// PublicationAnchorCreationCoordinator.js's own header already states,
// applied here one axis over. This class never selects a storage type,
// never retries, never resolves what it just created, never modifies
// application/LocalPublicationSnapshotPlacementCatalog.js directly, never
// reads or writes bytes itself, and never ranks existing placements —
// every one of those responsibilities already lives exactly where 0.8.18
// put them (application/CreateExternalSnapshotPlacementUseCase.js,
// content/ContentStore.js implementations, application/
// SnapshotPlacementStoreRegistry.js). `create()` forwards to application/
// CreateExternalSnapshotPlacementUseCase.js#execute() unchanged and
// returns its `{ outcome, placement, reason }` exactly as received —
// never reinterpreted, never caught, never turned into a different
// shape. A caller wanting a display-ready shape uses application/
// SnapshotPlacementCreationView.js#describeCreationAttempt() separately,
// exactly as application/SnapshotPlacementResolutionCoordinator.js's own
// `resolve()` stays separate from application/SnapshotPlacementView.js's
// own display derivation.
//
// A SIGNING FAILURE (nobody signed in) is a genuine caller contract
// violation application/CreateExternalSnapshotPlacementUseCase.js itself
// declines to catch (it forwards straight through from application/
// CreatePublicationSnapshotPlacementUseCase.js — see that file's own
// header) — this class does not catch it either. It is ui/views/
// DecentralizedPublicationsView.js's own job, as the UI layer, to wrap a
// `create()` call in a try/catch and turn that specific failure into its
// own honest display state — see application/
// SnapshotPlacementCreationView.js's own header on why that reads to a
// person exactly like PLACEMENT_UNAVAILABLE: nothing external was ever
// attempted either way.
//
// availableStorageTypes() IS WHAT KEEPS THE UI FROM EVER OFFERING A
// STORAGE TYPE NOBODY CAN ACTUALLY PLACE ONTO. `create()` throws for a
// `storage` with no registered content store — a genuine contract
// violation, not a degraded-but-honest outcome (see application/
// CreateExternalSnapshotPlacementUseCase.js's own header) — so a caller
// is expected to only ever offer a storage type this method actually
// lists, the identical discipline application/
// PublicationAnchorCreationCoordinator.js's own header already holds for
// `availableAnchorTypes()`.
export class SnapshotPlacementCreationCoordinator {
    constructor(createExternalSnapshotPlacementUseCase, storeRegistry) {
        if (!createExternalSnapshotPlacementUseCase || typeof createExternalSnapshotPlacementUseCase.execute !== 'function') {
            throw new Error('SnapshotPlacementCreationCoordinator: a CreateExternalSnapshotPlacementUseCase is required');
        }
        if (!storeRegistry || typeof storeRegistry.get !== 'function' || !Array.isArray(storeRegistry.storageTypes)) {
            throw new Error('SnapshotPlacementCreationCoordinator: a SnapshotPlacementStoreRegistry is required');
        }
        this._createExternalSnapshotPlacementUseCase = createExternalSnapshotPlacementUseCase;
        this._storeRegistry = storeRegistry;
    }

    // Every storage type this replica currently has a registered
    // content/ContentStore.js for, in the registry's own order — never
    // ranked, never narrowed to a "preferred" or "default" one. Empty is
    // a perfectly ordinary result (no store configured on this device
    // yet); it is never this class's job to explain why, only to report
    // it.
    availableStorageTypes() {
        return this._storeRegistry.storageTypes;
    }

    // Triggers exactly ONE external placement attempt for
    // `publicationId`/`storage`. Resolves to `{ outcome, placement,
    // reason }` — application/SnapshotPlacementCreationOutcome.js's own
    // two values — completely unchanged from what application/
    // CreateExternalSnapshotPlacementUseCase.js#execute() returned. Never
    // called automatically by anything in this codebase; always the
    // direct result of one explicit person's click.
    async create(publicationId, storage) {
        return this._createExternalSnapshotPlacementUseCase.execute(publicationId, storage);
    }
}
