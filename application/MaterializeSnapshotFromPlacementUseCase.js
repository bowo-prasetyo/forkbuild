import { SnapshotPlacementResolutionOutcome } from './SnapshotPlacementResolutionOutcome.js';
import { SnapshotPlacementMaterializationOutcome } from './SnapshotPlacementMaterializationOutcome.js';
import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
// 0.8.36 — Unified Explicit Snapshot Materialization Sources: storage now
// runs through the SAME application/StoreSnapshotContentUseCase.js
// application/ImportPublicationSnapshotTransferPackageUseCase.js (0.8.32)
// also feeds — see that class's own header. This class's OWN outer
// contract does not change: the same five application/
// SnapshotPlacementMaterializationOutcome.js values, the same mapping from
// resolution outcomes, plus one new, additive `source` field (see below).
//
// application/ImportPublicationSnapshotTransferPackageUseCase.js (0.8.32)
// turns an explicitly SUPPLIED package into local possession. This class
// is its placement-backed sibling: it turns an explicitly CHOSEN
// placement into local possession, by running the SAME two questions
// 0.8.20's own application/SnapshotPlacementResolutionCoordinator.js
// already answers for "Resolve Snapshot" — does this locator's signature
// check out, and can it presently produce bytes matching its own claimed
// hash — and, only once both are true, adding exactly one more step
// resolution itself has never taken: writing those bytes into this
// replica's own content/ContentStore.js, through the SAME shared boundary
// the offline-package path now also uses.
//
//   placement (an already-known, already-cataloged
//              PublicationSnapshotPlacement — never a bare id
//              this class would have to look up itself)
//        │
//        ▼
//   resolutionCoordinator.resolve(placement)   (application/
//        │                                      SnapshotPlacementResolutionCoordinator.js,
//        │                                      0.8.20 — UNCHANGED)
//        │
//   ┌────┴─────────────────────────────────────────────┐
//   │ RESOLVED                                          │ anything else
//   ▼                                                    ▼
// storeSnapshotContentUseCase.execute(               map the SAME resolution
//   { contentHash: placement.contentHash,             outcome onto ONE of this
//     bytes: resolution.bytes })                       class's own failure
//   │                              │                    values — see this
//   │ ALREADY_AVAILABLE            │ STORED              file's own mapping
//   ▼                              ▼                     table below
// ALREADY_AVAILABLE              STORED
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: resolution observes whether a
// placement can currently provide the claimed bytes; materialization
// turns successfully retrieved bytes into local possession, through the
// SAME hash-verify-then-store boundary every other explicit source now
// shares. This class never re-verifies a signature — resolution already
// did — and never resolves more than the ONE placement it was asked
// about — no ranking, no trying a second placement when the first fails,
// no "best source." Handing resolution's own already-verified bytes to
// application/StoreSnapshotContentUseCase.js means that boundary verifies
// the hash a second time; this is not a second, independent trust
// decision — it is the SAME check (core/ContentReference.js#verify())
// applied once, at the one place bytes are ever written, regardless of
// which caller reached it, exactly the discipline application/
// StoreSnapshotContentUseCase.js's own header exists to guarantee. See
// docs/Principles.md, "Placement Resolution Observes Present
// Availability; Materialization Turns It Into Possession (0.8.35)," and
// "A Shared Storage Boundary Does Not Merge The Sources That Feed It
// (0.8.36)."
//
// Deliberately never modifies the placement, its provenance
// (application/LocalPlacementKnowledgeStore.js), or resolution history
// (application/SnapshotPlacementResolutionObservation.js) — exactly as
// application/ImportPublicationSnapshotTransferPackageUseCase.js's own
// header already states one axis over for the offline-package path.
// `publicationKnown` is reported as a plain, independent observation,
// never a gate on storing the bytes — the identical restraint that
// class's own header establishes, carried over unchanged.
export class MaterializeSnapshotFromPlacementUseCase {
    // resolutionCoordinator: an application/
    // SnapshotPlacementResolutionCoordinator.js instance — the SAME one
    // "Resolve Snapshot" already uses, never a second resolver wired
    // against a different store registry.
    // storeSnapshotContentUseCase: an application/
    // StoreSnapshotContentUseCase.js instance — the ONE shared boundary
    // this class now writes bytes through, the SAME instance application/
    // ImportPublicationSnapshotTransferPackageUseCase.js (0.8.32) is wired
    // against, never a second, disconnected one.
    // publicationCatalog: an application/LocalPublicationCatalog.js
    // instance, used ONLY to report whether `placement.publicationId` is
    // known to this replica right now — read-only, never a precondition.
    constructor(resolutionCoordinator, storeSnapshotContentUseCase, publicationCatalog) {
        if (!resolutionCoordinator || typeof resolutionCoordinator.resolve !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: a SnapshotPlacementResolutionCoordinator is required');
        }
        if (!storeSnapshotContentUseCase || typeof storeSnapshotContentUseCase.execute !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: a StoreSnapshotContentUseCase is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: a publication catalog is required');
        }
        this._resolutionCoordinator = resolutionCoordinator;
        this._storeSnapshotContentUseCase = storeSnapshotContentUseCase;
        this._publicationCatalog = publicationCatalog;
    }

    // `placement`: a PublicationSnapshotPlacement instance — already
    // discovered (application/SnapshotPlacementResolutionCoordinator.js#
    // discover()) and already in the caller's hand, exactly as
    // resolve(placement) itself already requires one axis over. This
    // class never accepts a bare placementId and never looks one up
    // itself — see this file's own header on why that keeps a
    // PLACEMENT_NOT_FOUND outcome unnecessary.
    //
    // Returns `{ outcome, placementId, publicationId, contentHash,
    // contentReference, publicationKnown, reason, source }`:
    //   outcome            — one of application/
    //                         SnapshotPlacementMaterializationOutcome.js's
    //                         own five values, UNCHANGED from before 0.8.36
    //   contentReference   — the core/ContentReference.js this replica
    //                         now holds bytes under (STORED/
    //                         ALREADY_AVAILABLE), or null otherwise
    //   publicationKnown   — whether this replica's own publication
    //                         catalog already has an envelope for
    //                         `placement.publicationId` RIGHT NOW
    //   reason             — the underlying resolution's own `reason`,
    //                         unchanged, on any non-storing outcome; null
    //                         on STORED/ALREADY_AVAILABLE
    //   source             — `{ kind: SnapshotMaterializationSourceKind.PLACEMENT }`,
    //                         always this same value, on every outcome —
    //                         new in 0.8.36, purely additive, naming WHICH
    //                         explicit action produced this result for a
    //                         caller building an application/
    //                         SnapshotMaterializationAttempt.js record
    async execute(placement) {
        if (!placement || typeof placement.toJSON !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: execute() requires a PublicationSnapshotPlacement instance');
        }

        const resolution = await this._resolutionCoordinator.resolve(placement);
        const publicationKnown = Boolean(this._publicationCatalog.get(placement.publicationId));
        const source = Object.freeze({ kind: SnapshotMaterializationSourceKind.PLACEMENT });

        if (resolution.outcome === SnapshotPlacementResolutionOutcome.RESOLVED) {
            const stored = await this._storeSnapshotContentUseCase.execute({ contentHash: placement.contentHash, bytes: resolution.bytes });
            return {
                outcome: stored.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE
                    ? SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE
                    : SnapshotPlacementMaterializationOutcome.STORED,
                placementId: placement.id,
                publicationId: placement.publicationId,
                contentHash: placement.contentHash,
                contentReference: stored.contentReference,
                publicationKnown,
                reason: null,
                source
            };
        }

        return {
            outcome: this._mapFailure(resolution.outcome),
            placementId: placement.id,
            publicationId: placement.publicationId,
            contentHash: placement.contentHash,
            contentReference: null,
            publicationKnown,
            reason: resolution.reason,
            source
        };
    }

    // The one place this class names the mapping application/
    // SnapshotPlacementMaterializationOutcome.js's own header already
    // documents — kept here, alone, so that table is never duplicated a
    // second time in prose.
    _mapFailure(resolutionOutcome) {
        switch (resolutionOutcome) {
            case SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE:
            case SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE:
                return SnapshotPlacementMaterializationOutcome.UNAVAILABLE;
            case SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH:
                return SnapshotPlacementMaterializationOutcome.HASH_MISMATCH;
            case SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE:
            case SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE:
            default:
                return SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT;
        }
    }
}
