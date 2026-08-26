import { ContentReference } from '../core/ContentReference.js';
import { validatePublicationSnapshotTransferPackage } from './PublicationSnapshotTransferPackageValidator.js';
import { SnapshotContentTransferOutcome } from './SnapshotContentTransferOutcome.js';

// 0.8.32 — Explicit Snapshot Content Transfer.
//
// The offline counterpart of application/PeerContentExchange.js#
// _handleResponse() (0.7.4) — the identical central rule, restated for a
// file instead of a live message:
//
//   THE ONLY THING THAT EVER MAKES THIS TRUSTWORTHY is core/
//   ContentReference.js#verify(): recomputing the hash of exactly the
//   bytes received and checking it against exactly the hash the package
//   itself claims. Nothing here trusts `content` merely because it
//   arrived inside a well-formed package — see application/
//   PeerContentExchange.js's own header for why "the other side supplied
//   it" is never, by itself, a reason to store anything.
//
//   pkg (validated structurally, application/
//        PublicationSnapshotTransferPackageValidator.js)
//        │
//        ▼
//   ContentReference({ hash: pkg.contentHash }).verify(pkg.content)
//        │                                  │
//        │ fails                            │ passes
//        ▼                                  ▼
//   CONTENT_HASH_MISMATCH              contentStore.put(pkg.content)
//   (nothing stored)                        │
//                                            ▼
//                                   STORED / ALREADY_STORED
//
// Deliberately never touches a publication, an anchor, or a placement —
// see this milestone's own docs/Roadmap.md entry. This class:
//
//   1. validates package structure                    (STEP 1)
//   2. verifies content actually hashes to contentHash (STEP 2)
//   3. reports whether the publication is known locally, as a plain
//      observation, never a gate on steps 4+                (STEP 3)
//   4. stores the bytes through the existing ContentStore     (STEP 4)
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
    // contentStore: a content/ContentStore.js instance — the one and only
    // storage boundary this class ever writes through.
    // publicationCatalog: an application/LocalPublicationCatalog.js
    // instance, used ONLY to answer "is this publicationId known to this
    // replica right now" — read-only, never written to, never required
    // to already know `pkg.publicationId` before content is stored.
    constructor(contentStore, publicationCatalog) {
        if (!contentStore || typeof contentStore.put !== 'function' || typeof contentStore.has !== 'function') {
            throw new Error('ImportPublicationSnapshotTransferPackageUseCase: a ContentStore is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('ImportPublicationSnapshotTransferPackageUseCase: a publication catalog is required');
        }
        this._contentStore = contentStore;
        this._publicationCatalog = publicationCatalog;
    }

    // `pkg`: a Publication Snapshot Transfer Package — validated HERE,
    // structurally, before anything is verified or stored (application/
    // PublicationSnapshotTransferPackageValidator.js#
    // validatePublicationSnapshotTransferPackage(), throws
    // PublicationSnapshotTransferPackageError on any malformed field).
    //
    // Returns `{ outcome, publicationId, contentReference,
    // publicationKnown }`:
    //   outcome            — one of application/
    //                         SnapshotContentTransferOutcome.js's three
    //                         values
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
    async execute(pkg) {
        validatePublicationSnapshotTransferPackage(pkg);

        const publicationKnown = Boolean(this._publicationCatalog.get(pkg.publicationId));
        const reference = new ContentReference({ hash: pkg.contentHash });

        if (!reference.verify(pkg.content)) {
            return {
                outcome: SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH,
                publicationId: pkg.publicationId,
                contentReference: null,
                publicationKnown
            };
        }

        const alreadyStored = await this._contentStore.has(reference);
        const storedReference = await this._contentStore.put(pkg.content);

        return {
            outcome: alreadyStored ? SnapshotContentTransferOutcome.ALREADY_STORED : SnapshotContentTransferOutcome.STORED,
            publicationId: pkg.publicationId,
            contentReference: storedReference,
            publicationKnown
        };
    }
}
