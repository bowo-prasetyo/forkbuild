// 0.8.34 — Explicit Snapshot Materialization UX.
//
// application/SnapshotPlacementResolutionCoordinator.js (0.8.20) sequences
// "what's known" (discover) and "does it hold up" (resolve) for a
// placement claim; application/SnapshotPlacementCreationCoordinator.js
// (0.8.25) and application/PublicationAnchorCreationCoordinator.js (0.8.11)
// each add a third, symmetric "go create some" action, over their own
// axis. This class is the missing fourth action 0.8.32/0.8.33 deliberately
// left unbuilt — the one ui/views/DecentralizedPublicationsView.js's own
// "Local Snapshot" section names directly in its 0.8.33 header comment as
// "never itself a materialization action":
//
//   import(pkg) — trigger exactly ONE explicit content-transfer import,
//                 for exactly the Publication Snapshot Transfer Package
//                 (application/PublicationSnapshotTransferPackage.js,
//                 0.8.32) the caller supplies.
//
// A DELIBERATELY THIN PASS-THROUGH, NOT A SECOND ORCHESTRATOR — the
// identical restraint every *CreationCoordinator.js in this codebase
// already holds. `import()` forwards to application/
// ImportPublicationSnapshotTransferPackageUseCase.js#execute() completely
// unchanged and returns its `{ outcome, publicationId, contentReference,
// publicationKnown }` exactly as received — never reinterpreted, never
// caught, never turned into a different shape. A caller wanting a
// display-ready shape uses application/
// SnapshotContentMaterializationView.js#describeMaterializationAttempt()
// separately, exactly as every sibling coordinator already stays separate
// from its own display derivation.
//
// DELIBERATELY NO `availableSources(publicationId)`. This milestone's own
// design conversation considered, and explicitly deferred, a method that
// would discover EVERY way a publication's bytes might currently be
// obtainable (a transfer package on disk, a resolvable placement, a peer
// announcement) and let a caller choose among them. Building that now
// would invent source-selection infrastructure this milestone does not
// need: for a FIRST explicit "Import Snapshot" action, "the source" is
// simply whatever Publication Snapshot Transfer Package a person
// explicitly supplies — a file they chose, or JSON they pasted — never a
// list this class assembles or ranks on their behalf. See docs/
// Principles.md, "Snapshot Materialization Is An Explicit User Action,
// Distinct From Every Other Way A Replica Learns About Content (0.8.34)."
//
// This class never discovers a source, never selects a preferred one,
// never resolves a placement, never retries a failed import, never
// verifies an anchor, and never modifies a publication, an anchor, or a
// placement — it does exactly one thing: hand `pkg` to the SAME import
// pipeline application/ImportPublicationSnapshotTransferPackageUseCase.js
// (0.8.32) already validates and verifies content through, unchanged.
export class SnapshotContentMaterializationCoordinator {
    constructor(importPublicationSnapshotTransferPackageUseCase) {
        if (!importPublicationSnapshotTransferPackageUseCase || typeof importPublicationSnapshotTransferPackageUseCase.execute !== 'function') {
            throw new Error('SnapshotContentMaterializationCoordinator: an ImportPublicationSnapshotTransferPackageUseCase is required');
        }
        this._importUseCase = importPublicationSnapshotTransferPackageUseCase;
    }

    // Triggers exactly ONE explicit import attempt for `pkg` — a
    // Publication Snapshot Transfer Package, structurally validated and
    // content-verified entirely inside application/
    // ImportPublicationSnapshotTransferPackageUseCase.js#execute(), never
    // here. Resolves to `{ outcome, publicationId, contentReference,
    // publicationKnown }` completely unchanged from what that use case
    // returned; throws PublicationSnapshotTransferPackageError straight
    // through for a malformed `pkg` — a genuine caller contract
    // violation this class does not catch, exactly as application/
    // PublicationAnchorCreationCoordinator.js's own header already
    // declines to catch a signing failure. It is ui/views/
    // DecentralizedPublicationsView.js's own job, as the UI layer, to
    // wrap an `import()` call in a try/catch and turn that specific
    // failure into its own honest UNAVAILABLE display state — see
    // application/SnapshotContentMaterializationView.js's own header.
    async import(pkg) {
        return this._importUseCase.execute(pkg);
    }
}
