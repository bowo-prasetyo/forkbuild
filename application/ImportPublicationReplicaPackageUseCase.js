import { validatePublicationReplicaPackage } from './PublicationReplicaPackageValidator.js';
import { ImportPackageAnchorsUseCase } from './ImportPackageAnchorsUseCase.js';
import { ImportPackageSnapshotPlacementsUseCase } from './ImportPackageSnapshotPlacementsUseCase.js';

// 0.8.29 — Publication Replica Export & Offline Transfer.
//
// The offline counterpart of the existing peer/package ingestion paths —
// the "structural validation -> existing trust boundaries -> local
// catalogs" pipeline this milestone's own design conversation named.
// Deliberately introduces NO second place a publication, an anchor, or a
// placement gets validated, constructed, or signature-verified:
//
//   pkg.publication  -> application/PublicationExchange.js#importPublication()             (0.7.2)
//   pkg.anchors      -> application/ImportPackageAnchorsUseCase.js (unchanged, 0.8.7)       -> PublicationAnchorExchange#importAnchor()
//   pkg.placements   -> application/ImportPackageSnapshotPlacementsUseCase.js (unchanged, 0.8.22) -> PublicationSnapshotPlacementExchange#importPlacement()
//
// A Publication Replica Package (application/PublicationReplicaPackage.js)
// bundles its anchors/placements under the SAME `anchors`/`placements`
// field names a Blueprint Package already uses — application/
// ImportPackageAnchorsUseCase.js and application/
// ImportPackageSnapshotPlacementsUseCase.js each only ever read those two
// fields off whatever object they're handed, with no coupling to
// `kind`/`schemaVersion`/`structure`, so this class reuses BOTH of them
// completely unchanged, exactly as this milestone's own docs/Roadmap.md
// entry required: "just as 0.8.22 reused the placement exchange boundary
// for package import."
//
// Deliberately never calls application/ExternalAnchorVerifier.js or
// application/SnapshotPlacementResolver.js, and never queries a network —
// see application/BuildPublicationReplicaPackageUseCase.js's own header
// and this milestone's docs/Principles.md entry. Importing a package that
// bundles a publication, two anchors, and a placement catalogs FOUR
// CLAIMS, and proves nothing about any of them.
//
// Records acquisition provenance exactly the same way ImportPackage
// AnchorsUseCase/ImportPackageSnapshotPlacementsUseCase already do on
// their own — application/AnchorAcquisitionKind.js#PACKAGE / application/
// PlacementAcquisitionKind.js#PACKAGE, first-seen-wins, unconditionally on
// every anchor/placement, every time (see those files' own headers). The
// publication itself gets no such record: this codebase has no
// "PublicationAcquisitionKind" — a publication is a single envelope, not
// a set of independently-arriving claims about the same fact the way
// anchors/placements are, so there is nothing here for provenance to
// distinguish (see application/PublicationReplicaKnowledgeView.js, 0.8.28,
// which surfaces `hasPublication` as a plain boolean for the identical
// reason).
//
// The publication's own import is tolerant of failure exactly like every
// bundled anchor/placement already is: a forged or unverifiable
// publication envelope is reported back as `rejectedPublication`, never
// thrown past this class — the SAME per-item tolerance application/
// ImportPackageAnchorsUseCase.js's own header already establishes ("one
// malformed or forged anchor in a bundle of several never destroys the
// otherwise-valid rest of it"), extended here to the one publication a
// package can ever bundle. This also means a package whose publication
// fails to import can still contribute its anchors/placements to this
// replica's catalogs — exactly as consistent with application/
// PublicationAnchorExchange.js never requiring a publicationId to already
// be cataloged before accepting an anchor that names it (0.8.4).
export class ImportPublicationReplicaPackageUseCase {
    // publicationExchange: an application/PublicationExchange.js instance.
    // anchorExchange/placementExchange: application/
    // PublicationAnchorExchange.js/application/
    // PublicationSnapshotPlacementExchange.js instances — the SAME
    // instances handed to ImportPackageAnchorsUseCase/
    // ImportPackageSnapshotPlacementsUseCase were they constructed by hand.
    // anchorKnowledgeStore/placementKnowledgeStore: OPTIONAL, the identical
    // application/LocalAnchorKnowledgeStore.js/application/
    // LocalPlacementKnowledgeStore.js passthrough those two use cases
    // already accept.
    constructor(publicationExchange, anchorExchange, placementExchange, { anchorKnowledgeStore = null, placementKnowledgeStore = null } = {}) {
        if (!publicationExchange || typeof publicationExchange.importPublication !== 'function') {
            throw new Error('ImportPublicationReplicaPackageUseCase: a PublicationExchange is required');
        }
        if (!anchorExchange || typeof anchorExchange.importAnchor !== 'function') {
            throw new Error('ImportPublicationReplicaPackageUseCase: a PublicationAnchorExchange is required');
        }
        if (!placementExchange || typeof placementExchange.importPlacement !== 'function') {
            throw new Error('ImportPublicationReplicaPackageUseCase: a PublicationSnapshotPlacementExchange is required');
        }
        this._publicationExchange = publicationExchange;
        this._anchorImporter = new ImportPackageAnchorsUseCase(anchorExchange, anchorKnowledgeStore);
        this._placementImporter = new ImportPackageSnapshotPlacementsUseCase(placementExchange, placementKnowledgeStore);
    }

    // `pkg`: a Publication Replica Package — validated HERE, structurally,
    // before anything is imported (application/
    // PublicationReplicaPackageValidator.js#validatePublicationReplicaPackage(),
    // throws PublicationReplicaPackageError on any malformed field or any
    // anchor/placement naming a different publicationId than the
    // package's own publication).
    //
    // Returns `{ publication, publicationIsNew, rejectedPublication,
    // importedAnchors, skippedAnchors, rejectedAnchors, importedPlacements,
    // skippedPlacements, rejectedPlacements }`:
    //   publication         — the cataloged DecentralizedPublication, or
    //                          null if it was rejected
    //   publicationIsNew    — see application/LocalPublicationCatalog.js#
    //                          add()'s own header for what this means
    //   rejectedPublication — `{ publication, message }` if the publication
    //                          failed signature verification; null
    //                          otherwise. `publication` is the RAW bundled
    //                          JSON.
    //   the six anchor/placement fields are application/
    //   ImportPackageAnchorsUseCase.js's and application/
    //   ImportPackageSnapshotPlacementsUseCase.js's own return shapes,
    //   passed through unchanged.
    execute(pkg) {
        validatePublicationReplicaPackage(pkg);

        let publication = null;
        let publicationIsNew = false;
        let rejectedPublication = null;
        try {
            const result = this._publicationExchange.importPublication(pkg.publication);
            publication = result.publication;
            publicationIsNew = result.isNew;
        } catch (error) {
            rejectedPublication = { publication: pkg.publication, message: error.message };
        }

        const { importedAnchors, skippedAnchors, rejectedAnchors } = this._anchorImporter.execute(pkg);
        const { importedPlacements, skippedPlacements, rejectedPlacements } = this._placementImporter.execute(pkg);

        return {
            publication, publicationIsNew, rejectedPublication,
            importedAnchors, skippedAnchors, rejectedAnchors,
            importedPlacements, skippedPlacements, rejectedPlacements
        };
    }
}
