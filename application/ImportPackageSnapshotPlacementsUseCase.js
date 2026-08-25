import { PublicationSnapshotPlacementError } from './PublicationSnapshotPlacementValidator.js';
import { PlacementAcquisitionKind } from './PlacementAcquisitionKind.js';

// 0.8.22 — Snapshot Placement Package Integration.
//
// application/ImportBlueprintUseCase.js stays exactly what 0.6.6 already
// made it: it only ever returns a Structure, and "reading pkg.attributions
// back out is the caller's own job" (see tests/
// BlueprintAttributionExchange.test.js's own comment on that split). This
// class is that same "caller's own job," made concrete for a package's
// bundled `placements` (application/BlueprintPackage.js, 0.8.22) — never a
// change to ImportBlueprintUseCase itself, and never a second place a
// PublicationSnapshotPlacement gets validated or resolved.
//
// The whole point of this class is to introduce NO new validation or
// resolution logic at all. Every placement in `pkg.placements` is handed,
// completely unchanged, to application/PublicationSnapshotPlacementExchange.js#
// importPlacement() — the exact same validate -> construct -> verify
// SIGNATURE -> catalog boundary a placement arriving from a stranger over
// a peer connection already goes through (0.8.19). A package is
// untrusted, portable data, exactly like a peer message; there is no
// reason its placements deserve a looser (or a different) gate than one
// that arrived any other way.
//
//   package.placements[i]
//        │
//        ▼
//   PublicationSnapshotPlacementExchange#importPlacement()
//        │           (validate envelope -> construct -> verify signature)
//        ▼
//   LocalPublicationSnapshotPlacementCatalog#add()
//
// Deliberately never calls application/SnapshotPlacementResolver.js. See
// this milestone's own docs/Principles.md entry, "Package Import Is
// Placement Ingestion, Not Placement Resolution (0.8.22)" — importing a
// package that bundles three placements catalogs three LOCATOR CLAIMS,
// and retrieves not a single byte from any of them. A caller that wants
// to know whether one actually still serves its bytes calls
// SnapshotPlacementResolver separately, afterward, exactly as if the
// placement had been cataloged any other way.
//
// Never cross-checks a bundled placement's own `publicationId`/
// `contentHash` against the package's own `structure`, and never rejects
// or rewrites a placement for naming a publication the package doesn't
// obviously agree with — this codebase has no notion of "the publication
// this Blueprint Package is about" in the first place (a BlueprintPackage
// bundles a Structure, never a DecentralizedPublication), so there is
// nothing to compare against even if this class wanted to. See docs/
// Principles.md, "Package Import Preserves Placement Claims; It Does Not
// Establish Retrieval Availability (0.8.22)" — the placement-side
// counterpart of 0.8.7's own "Importing Evidence Preserves The Claim; It
// Does Not Repair The Claim."
//
// Every rejection is categorized, never collapsed into a bare
// `success: false` — one malformed or forged placement in a bundle of
// several never destroys the otherwise-valid rest of it, mirroring
// application/ImportPackageAnchorsUseCase.js's own per-envelope tolerance
// (0.8.7).
export const PackagePlacementImportReason = Object.freeze({
    DUPLICATE: 'duplicate',
    INVALID_STRUCTURE: 'invalid-structure',
    INVALID_SIGNATURE: 'invalid-signature'
});

export class ImportPackageSnapshotPlacementsUseCase {
    // placementExchange: an application/PublicationSnapshotPlacementExchange.js
    // instance — the one and only placement-import boundary this class
    // ever calls.
    //
    // knowledgeStore: OPTIONAL, an application/LocalPlacementKnowledgeStore.js
    // instance (0.8.24 — Snapshot Placement Provenance & Observation
    // Boundary). This file's own pre-0.8.24 header named this exact,
    // additive move as future work once a "PlacementAcquisitionKind"/
    // knowledge store existed — that milestone has now landed. When
    // supplied, every successfully imported placement — new or
    // already-known, `isNew` either way — also records an application/
    // PlacementAcquisitionKind.js#PACKAGE knowledge entry. Called
    // unconditionally, on every placement, every time: FIRST-SEEN-WINS
    // inside application/LocalPlacementKnowledgeStore.js#record() is what
    // makes that safe — a placement Bob already knows as PEER keeps
    // reporting PEER even after a package import of the identical
    // placement calls record() again with PACKAGE. See that file's own
    // header, and application/ImportPackageAnchorsUseCase.js's own
    // identical 0.8.17 parameter.
    constructor(placementExchange, knowledgeStore = null) {
        if (!placementExchange || typeof placementExchange.importPlacement !== 'function') {
            throw new Error('ImportPackageSnapshotPlacementsUseCase: a PublicationSnapshotPlacementExchange is required');
        }
        this._placementExchange = placementExchange;
        this._knowledgeStore = knowledgeStore;
    }

    // `pkg`: a Blueprint Package (application/BlueprintPackage.js) that
    // has already passed application/BlueprintImportValidator.js#
    // validateBlueprintPackage() — this class does not re-validate the
    // package's own shape, only iterates whatever `placements` it
    // carries. A package with no `placements` field at all (or an empty
    // one) is handled identically to one that bundles several — an empty
    // result, never an error.
    //
    // Returns `{ importedPlacements, skippedPlacements, rejectedPlacements }`:
    //   importedPlacements — real PublicationSnapshotPlacement instances,
    //                        newly cataloged
    //   skippedPlacements  — `{ placement, reason: DUPLICATE }`; already
    //                        known to this replica's catalog — never an
    //                        error
    //   rejectedPlacements — `{ placement, reason, message }`; `placement`
    //                        is the RAW bundled JSON (it may never have
    //                        parsed into a real instance), `reason` one of
    //                        INVALID_STRUCTURE (failed application/
    //                        PublicationSnapshotPlacementValidator.js) or
    //                        INVALID_SIGNATURE (parsed, but did not
    //                        verify)
    execute(pkg) {
        const placements = (pkg && Array.isArray(pkg.placements)) ? pkg.placements : [];
        const importedPlacements = [];
        const skippedPlacements = [];
        const rejectedPlacements = [];

        for (const placementJson of placements) {
            try {
                const { placement, isNew } = this._placementExchange.importPlacement(placementJson);
                if (this._knowledgeStore) {
                    this._knowledgeStore.record(placement.id, PlacementAcquisitionKind.PACKAGE);
                }
                if (isNew) {
                    importedPlacements.push(placement);
                } else {
                    skippedPlacements.push({ placement, reason: PackagePlacementImportReason.DUPLICATE });
                }
            } catch (error) {
                const reason = error instanceof PublicationSnapshotPlacementError
                    ? PackagePlacementImportReason.INVALID_STRUCTURE
                    : PackagePlacementImportReason.INVALID_SIGNATURE;
                rejectedPlacements.push({ placement: placementJson, reason, message: error.message });
            }
        }

        return { importedPlacements, skippedPlacements, rejectedPlacements };
    }
}
