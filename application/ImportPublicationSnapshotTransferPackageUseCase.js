import { validatePublicationSnapshotTransferPackage } from './PublicationSnapshotTransferPackageValidator.js';
import { SnapshotContentTransferOutcome } from './SnapshotContentTransferOutcome.js';
import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';

// 0.8.32 — Explicit Snapshot Content Transfer.
// 0.8.36 — Unified Explicit Snapshot Materialization Sources: hash
// verification and storage now run through the SAME application/
// StoreSnapshotContentUseCase.js application/
// MaterializeSnapshotFromPlacementUseCase.js (0.8.35) also feeds — see
// that class's own header for the shape this class no longer implements
// itself. Nothing about this class's OWN outer contract changes: it still
// validates package structure, still reports `publicationKnown` as a
// plain observation, and still returns exactly the same `{ outcome,
// publicationId, contentReference, publicationKnown }` shape (plus one
// new, additive `source` field — see below) for the identical three
// SnapshotContentTransferOutcome values it always has.
//
// The offline counterpart of application/PeerContentExchange.js#
// _handleResponse() (0.7.4) — the identical central rule, restated for a
// file instead of a live message, now enforced by application/
// StoreSnapshotContentUseCase.js rather than inline here:
//
//   THE ONLY THING THAT EVER MAKES THIS TRUSTWORTHY is core/
//   ContentReference.js#verify(): recomputing the hash of exactly the
//   bytes received and checking it against exactly the hash the package
//   itself claims. Nothing here trusts `content` merely because it
//   arrived inside a well-formed package.
//
//   pkg (validated structurally, application/
//        PublicationSnapshotTransferPackageValidator.js)
//        │
//        ▼
//   storeSnapshotContentUseCase.execute({ contentHash: pkg.contentHash,
//                                          bytes: pkg.content })
//        │                                  │
//        │ HASH_MISMATCH                    │ STORED / ALREADY_AVAILABLE
//        ▼                                  ▼
//   CONTENT_HASH_MISMATCH              STORED / ALREADY_STORED
//   (nothing stored)                   (mapped straight through)
//
// Deliberately never touches a publication, an anchor, or a placement —
// see this milestone's own docs/Roadmap.md entry. This class:
//
//   1. validates package structure                       (STEP 1)
//   2. hands content + claimed hash to the SHARED storage
//      boundary, which verifies and stores                (STEP 2)
//   3. reports whether the publication is known locally, as a plain
//      observation, never a gate on step 2                (STEP 3)
//   4. tags the result with WHICH explicit source produced it
//      (application/SnapshotMaterializationSourceKind.js.PACKAGE)  (STEP 4)
//
// and never performs step 5, 6, 7, 8, or 9 this milestone's own design
// conversation named: it never modifies the publication, never modifies
// an anchor, never modifies a placement, never calls application/
// ExternalAnchorVerifier.js or application/SnapshotPlacementResolver.js,
// and never resolves a placement as a side effect of possessing the
// bytes a placement happens to name. Possessing content and resolving a
// claimed locator remain two independently true (or false) facts about
// the same publication — see docs/Principles.md, "Knowledge Of Content
// Is Not Possession Of Content (0.8.32)."
export class ImportPublicationSnapshotTransferPackageUseCase {
    // storeSnapshotContentUseCase: an application/
    // StoreSnapshotContentUseCase.js instance — the ONE shared boundary
    // this class now writes bytes through, the SAME instance application/
    // MaterializeSnapshotFromPlacementUseCase.js (0.8.35) is wired against,
    // never a second, disconnected one.
    // publicationCatalog: an application/LocalPublicationCatalog.js
    // instance, used ONLY to answer "is this publicationId known to this
    // replica right now" — read-only, never written to, never required
    // to already know `pkg.publicationId` before content is stored.
    constructor(storeSnapshotContentUseCase, publicationCatalog) {
        if (!storeSnapshotContentUseCase || typeof storeSnapshotContentUseCase.execute !== 'function') {
            throw new Error('ImportPublicationSnapshotTransferPackageUseCase: a StoreSnapshotContentUseCase is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('ImportPublicationSnapshotTransferPackageUseCase: a publication catalog is required');
        }
        this._storeSnapshotContentUseCase = storeSnapshotContentUseCase;
        this._publicationCatalog = publicationCatalog;
    }

    // `pkg`: a Publication Snapshot Transfer Package — validated HERE,
    // structurally, before anything is verified or stored (application/
    // PublicationSnapshotTransferPackageValidator.js#
    // validatePublicationSnapshotTransferPackage(), throws
    // PublicationSnapshotTransferPackageError on any malformed field).
    //
    // Returns `{ outcome, publicationId, contentReference,
    // publicationKnown, source }`:
    //   outcome            — one of application/
    //                         SnapshotContentTransferOutcome.js's three
    //                         values, UNCHANGED from before 0.8.36
    //   publicationId      — `pkg.publicationId`, unchanged
    //   contentReference    — the core/ContentReference.js this replica
    //                         now holds bytes under (STORED/
    //                         ALREADY_STORED), or null
    //                         (CONTENT_HASH_MISMATCH — nothing stored)
    //   publicationKnown   — whether this replica's own publication
    //                         catalog already has an envelope for
    //                         `pkg.publicationId` RIGHT NOW — a plain,
    //                         independent observation, never a
    //                         precondition for storing the bytes
    //   source             — `{ kind: SnapshotMaterializationSourceKind.PACKAGE }`,
    //                         always this same value, on every outcome —
    //                         new in 0.8.36, purely additive, naming WHICH
    //                         explicit action produced this result for a
    //                         caller building an application/
    //                         SnapshotMaterializationAttempt.js record
    async execute(pkg) {
        validatePublicationSnapshotTransferPackage(pkg);

        const publicationKnown = Boolean(this._publicationCatalog.get(pkg.publicationId));
        const source = Object.freeze({ kind: SnapshotMaterializationSourceKind.PACKAGE });

        const stored = await this._storeSnapshotContentUseCase.execute({ contentHash: pkg.contentHash, bytes: pkg.content });

        if (stored.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH) {
            return {
                outcome: SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH,
                publicationId: pkg.publicationId,
                contentReference: null,
                publicationKnown,
                source
            };
        }

        return {
            outcome: stored.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE
                ? SnapshotContentTransferOutcome.ALREADY_STORED
                : SnapshotContentTransferOutcome.STORED,
            publicationId: pkg.publicationId,
            contentReference: stored.contentReference,
            publicationKnown,
            source
        };
    }
}
