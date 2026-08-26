import { ContentReference } from '../core/ContentReference.js';
import { SnapshotPlacementResolutionOutcome } from './SnapshotPlacementResolutionOutcome.js';
import { SnapshotPlacementMaterializationOutcome } from './SnapshotPlacementMaterializationOutcome.js';

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
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
// replica's own content/ContentStore.js.
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
// localContentStore.has(reference)               map the SAME resolution
//   │                              │              outcome onto ONE of this
//   │ true                         │ false        class's own failure
//   ▼                              ▼              values — see application/
// ALREADY_AVAILABLE          localContentStore    SnapshotPlacementMaterializationOutcome.js's
//                             .put(bytes)          own header for the table
//                                  │
//                                  ▼
//                                STORED
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: resolution observes whether a
// placement can currently provide the claimed bytes; materialization
// turns successfully retrieved bytes into local possession. This class
// never re-verifies a signature, never re-hashes anything resolution
// already hashed, and never resolves more than the ONE placement it was
// asked about — no ranking, no trying a second placement when the first
// fails, no "best source." See docs/Principles.md, "Placement Resolution
// Observes Present Availability; Materialization Turns It Into Possession
// (0.8.35)."
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
    // localContentStore: a content/ContentStore.js instance — this
    // replica's own LOCAL store, the ONLY place this class ever writes
    // bytes to, regardless of which storage backend the placement itself
    // named. Mirrors application/
    // ImportPublicationSnapshotTransferPackageUseCase.js's own
    // `contentStore` exactly.
    // publicationCatalog: an application/LocalPublicationCatalog.js
    // instance, used ONLY to report whether `placement.publicationId` is
    // known to this replica right now — read-only, never a precondition.
    constructor(resolutionCoordinator, localContentStore, publicationCatalog) {
        if (!resolutionCoordinator || typeof resolutionCoordinator.resolve !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: a SnapshotPlacementResolutionCoordinator is required');
        }
        if (!localContentStore || typeof localContentStore.put !== 'function' || typeof localContentStore.has !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: a local ContentStore is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: a publication catalog is required');
        }
        this._resolutionCoordinator = resolutionCoordinator;
        this._localContentStore = localContentStore;
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
    // contentReference, publicationKnown, reason }`:
    //   outcome            — one of application/
    //                         SnapshotPlacementMaterializationOutcome.js's
    //                         own five values
    //   contentReference   — the core/ContentReference.js this replica
    //                         now holds bytes under (STORED/
    //                         ALREADY_AVAILABLE), or null otherwise
    //   publicationKnown   — whether this replica's own publication
    //                         catalog already has an envelope for
    //                         `placement.publicationId` RIGHT NOW
    //   reason             — the underlying resolution's own `reason`,
    //                         unchanged, on any non-storing outcome; null
    //                         on STORED/ALREADY_AVAILABLE
    async execute(placement) {
        if (!placement || typeof placement.toJSON !== 'function') {
            throw new Error('MaterializeSnapshotFromPlacementUseCase: execute() requires a PublicationSnapshotPlacement instance');
        }

        const resolution = await this._resolutionCoordinator.resolve(placement);
        const publicationKnown = Boolean(this._publicationCatalog.get(placement.publicationId));

        if (resolution.outcome === SnapshotPlacementResolutionOutcome.RESOLVED) {
            const reference = new ContentReference({ hash: placement.contentHash });
            const alreadyStored = await this._localContentStore.has(reference);
            const storedReference = await this._localContentStore.put(resolution.bytes);
            return {
                outcome: alreadyStored ? SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE : SnapshotPlacementMaterializationOutcome.STORED,
                placementId: placement.id,
                publicationId: placement.publicationId,
                contentHash: placement.contentHash,
                contentReference: storedReference,
                publicationKnown,
                reason: null
            };
        }

        return {
            outcome: this._mapFailure(resolution.outcome),
            placementId: placement.id,
            publicationId: placement.publicationId,
            contentHash: placement.contentHash,
            contentReference: null,
            publicationKnown,
            reason: resolution.reason
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
