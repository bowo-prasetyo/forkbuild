import { buildPublicationSnapshotTransferPackage } from './PublicationSnapshotTransferPackage.js';

// 0.8.32 — Explicit Snapshot Content Transfer.
//
// The export-side counterpart of application/
// ImportPublicationSnapshotTransferPackageUseCase.js, mirroring
// application/BuildPublicationReplicaPackageUseCase.js's own "smallest
// possible thing that could be called a use case" shape one file over:
// pure orchestration, no new logic. Given a publicationId, reads the TWO
// things this replica needs to hand another replica the actual bytes —
//
//   publicationCatalog.get(publicationId)             — the envelope,
//     for its own contentReference (0.7.2)
//   contentStore.get(publication.contentReference)     — the bytes this
//     replica itself already holds for that reference (0.2.14/0.7.1)
//
// — and hands them, unchanged, to application/
// PublicationSnapshotTransferPackage.js#buildPublicationSnapshotTransferPackage().
// `contentStore` is the SAME content/ContentStore.js instance every other
// put()/get() in this codebase already goes through — this class
// introduces no second content-retrieval path.
//
// Deliberately performs NO hash verification — see application/
// PublicationSnapshotTransferPackage.js's own header on why that check
// belongs to the IMPORTING side, never the exporting one. This class
// trusts its own ContentStore exactly as much as application/
// PeerContentExchange.js#_handleRequest() already trusts it when
// answering a live REQUEST: content/LocalContentStore.js#put() computed
// `hash` FROM these exact bytes when they were first stored, so get()
// handing back anything that fails to verify against that same hash would
// mean the ContentStore itself is broken, not that this class forgot a
// check.
//
// Throws if this replica has never cataloged `publicationId` at all, OR
// if it does not currently hold the snapshot bytes for that publication's
// own contentReference — the exact distinction this milestone's own
// design conversation drew: KNOWING a publication and POSSESSING its
// content are two independent facts, and this class refuses to manufacture
// a package for content it cannot actually supply.
export class BuildPublicationSnapshotTransferPackageUseCase {
    constructor({ publicationCatalog, contentStore }) {
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('BuildPublicationSnapshotTransferPackageUseCase: a publication catalog is required');
        }
        if (!contentStore || typeof contentStore.get !== 'function') {
            throw new Error('BuildPublicationSnapshotTransferPackageUseCase: a ContentStore is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._contentStore = contentStore;
    }

    // Returns a plain, JSON-safe Publication Snapshot Transfer Package
    // (application/PublicationSnapshotTransferPackage.js's own shape).
    async execute(publicationId) {
        if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
            throw new Error('BuildPublicationSnapshotTransferPackageUseCase: a publicationId is required');
        }
        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) {
            throw new Error(`BuildPublicationSnapshotTransferPackageUseCase: no publication cataloged for "${publicationId}" — nothing to export`);
        }

        let content;
        try {
            content = await this._contentStore.get(publication.contentReference);
        } catch (error) {
            throw new Error(`BuildPublicationSnapshotTransferPackageUseCase: could not read this replica's own content for "${publicationId}" — ${error.message}`);
        }
        if (content === null || content === undefined) {
            throw new Error(`BuildPublicationSnapshotTransferPackageUseCase: this replica does not hold the snapshot bytes for "${publicationId}" — nothing to transfer`);
        }

        return buildPublicationSnapshotTransferPackage(publicationId, publication.contentReference, content);
    }
}
