import { buildPublicationReplicaPackage } from './PublicationReplicaPackage.js';

// 0.8.29 — Publication Replica Export & Offline Transfer.
//
// The export-side counterpart of application/
// ImportPublicationReplicaPackageUseCase.js, mirroring application/
// ExportBlueprintUseCase.js's own "smallest possible thing that could be
// called a use case" shape one file over: pure orchestration, no new
// logic. Given a publicationId, collects the THREE things this replica
// already independently knows about it —
//
//   publicationCatalog.get(publicationId)          — the envelope itself (0.7.2)
//   anchorExchange.findByPublicationId(publicationId)     — every known evidence claim (0.8.4/0.8.5)
//   placementExchange.findByPublicationId(publicationId)  — every known locator claim (0.8.18/0.8.19)
//
// — and hands them, unchanged, to application/PublicationReplicaPackage.js#
// buildPublicationReplicaPackage(). `anchorExchange`/`placementExchange`
// are the SAME application/PublicationAnchorExchange.js/application/
// PublicationSnapshotPlacementExchange.js instances every other anchor/
// placement read or write in this codebase already goes through — their
// own findByPublicationId() passthrough exists exactly for this "read
// this replica's own catalog" case (see those files' own headers, 0.8.5),
// so this class introduces no second query path.
//
// Deliberately performs NO verification and NO resolution, and touches no
// network — see this milestone's own docs/Roadmap.md entry, "Exporting
// replica knowledge does not perform verification or resolution." A
// publication this replica has never verified, alongside a placement it
// has never successfully resolved, packages exactly as readily as one
// this replica has confirmed repeatedly — this class cannot tell the
// difference between the two, and does not try to.
export class BuildPublicationReplicaPackageUseCase {
    constructor({ publicationCatalog, anchorExchange, placementExchange }) {
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('BuildPublicationReplicaPackageUseCase: a publication catalog is required');
        }
        if (!anchorExchange || typeof anchorExchange.findByPublicationId !== 'function') {
            throw new Error('BuildPublicationReplicaPackageUseCase: a PublicationAnchorExchange is required');
        }
        if (!placementExchange || typeof placementExchange.findByPublicationId !== 'function') {
            throw new Error('BuildPublicationReplicaPackageUseCase: a PublicationSnapshotPlacementExchange is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._anchorExchange = anchorExchange;
        this._placementExchange = placementExchange;
    }

    // Returns a plain, JSON-safe Publication Replica Package (application/
    // PublicationReplicaPackage.js's own shape). Throws if this replica
    // has never cataloged `publicationId` at all — there is nothing to
    // export, and no such thing as an "empty" package about a publication
    // this replica doesn't itself know.
    execute(publicationId) {
        if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
            throw new Error('BuildPublicationReplicaPackageUseCase: a publicationId is required');
        }
        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) {
            throw new Error(`BuildPublicationReplicaPackageUseCase: no publication cataloged for "${publicationId}" — nothing to export`);
        }
        const anchors = this._anchorExchange.findByPublicationId(publicationId);
        const placements = this._placementExchange.findByPublicationId(publicationId);
        return buildPublicationReplicaPackage(publication, { anchors, placements });
    }
}
