import { PublicationAnchorError } from './PublicationAnchorValidator.js';

// 0.8.7 — External Evidence Import & Publication Package Integration.
//
// application/ImportBlueprintUseCase.js stays exactly what 0.6.6 already
// made it: it only ever returns a Structure, and "reading pkg.attributions
// back out is the caller's own job" (see tests/
// BlueprintAttributionExchange.test.js's own comment on that split). This
// class is that same "caller's own job," made concrete for a package's
// bundled `anchors` (application/BlueprintPackage.js, 0.8.7) — never a
// change to ImportBlueprintUseCase itself, and never a second place a
// PublicationAnchor gets validated or verified.
//
// The whole point of this class is to introduce NO new validation or
// verification logic at all. Every anchor in `pkg.anchors` is handed,
// completely unchanged, to application/PublicationAnchorExchange.js#
// importAnchor() — the exact same validate -> construct -> verify
// SIGNATURE -> catalog boundary an anchor arriving from a stranger over a
// peer connection already goes through (0.8.4). A package is untrusted,
// portable data, exactly like a peer message; there is no reason its
// anchors deserve a looser (or a different) gate than one that arrived
// any other way.
//
//   package.anchors[i]
//        │
//        ▼
//   PublicationAnchorExchange#importAnchor()
//        │           (validate envelope -> construct -> verify signature)
//        ▼
//   LocalPublicationAnchorCatalog#add()
//
// Deliberately never calls application/ExternalAnchorVerifier.js. See
// this milestone's own docs/Principles.md entry, "Package Import Is
// Evidence Ingestion, Not Evidence Verification (0.8.7)" — importing a
// package that bundles three anchors catalogs three CLAIMS, and proves
// nothing about any of them. A caller that wants to know whether one
// actually holds up calls ExternalAnchorVerifier separately, afterward,
// exactly as if the anchor had been cataloged any other way.
//
// Never cross-checks a bundled anchor's own `publicationId`/`contentHash`
// against the package's own `structure`, and never rejects or rewrites an
// anchor for naming a publication the package doesn't obviously agree
// with — this codebase has no notion of "the publication this Blueprint
// Package is about" in the first place (a BlueprintPackage bundles a
// Structure, never a DecentralizedPublication), so there is nothing to
// compare against even if this class wanted to. Whether a bundled
// anchor's claims agree with what a caller separately knows about a
// publication is application/PublicationEvidenceConvergence.js's own
// question (0.8.6), asked later, over the catalog — never this class's.
// See docs/Principles.md, "Importing Evidence Preserves The Claim; It
// Does Not Repair The Claim (0.8.7)."
//
// Every rejection is categorized, never collapsed into a bare
// `success: false` — one malformed or forged anchor in a bundle of
// several never destroys the otherwise-valid rest of it, mirroring
// application/PublicationAnchorPeerExchange.js's own per-envelope
// tolerance for a RESPONSE batch (0.8.5).
export const PackageAnchorImportReason = Object.freeze({
    DUPLICATE: 'duplicate',
    INVALID_STRUCTURE: 'invalid-structure',
    INVALID_SIGNATURE: 'invalid-signature'
});

export class ImportPackageAnchorsUseCase {
    // anchorExchange: an application/PublicationAnchorExchange.js instance
    // — the one and only anchor-import boundary this class ever calls.
    constructor(anchorExchange) {
        if (!anchorExchange || typeof anchorExchange.importAnchor !== 'function') {
            throw new Error('ImportPackageAnchorsUseCase: a PublicationAnchorExchange is required');
        }
        this._anchorExchange = anchorExchange;
    }

    // `pkg`: a Blueprint Package (application/BlueprintPackage.js) that
    // has already passed application/BlueprintImportValidator.js#
    // validateBlueprintPackage() — this class does not re-validate the
    // package's own shape, only iterates whatever `anchors` it carries.
    // A package with no `anchors` field at all (or an empty one) is
    // handled identically to one that bundles several — an empty result,
    // never an error.
    //
    // Returns `{ importedAnchors, skippedAnchors, rejectedAnchors }`:
    //   importedAnchors — real PublicationAnchor instances, newly cataloged
    //   skippedAnchors  — `{ anchor, reason: DUPLICATE }`; already known
    //                      to this replica's catalog — never an error
    //   rejectedAnchors — `{ anchor, reason, message }`; `anchor` is the
    //                      RAW bundled JSON (it may never have parsed into
    //                      a real instance), `reason` one of
    //                      INVALID_STRUCTURE (failed application/
    //                      PublicationAnchorValidator.js) or
    //                      INVALID_SIGNATURE (parsed, but did not verify)
    execute(pkg) {
        const anchors = (pkg && Array.isArray(pkg.anchors)) ? pkg.anchors : [];
        const importedAnchors = [];
        const skippedAnchors = [];
        const rejectedAnchors = [];

        for (const anchorJson of anchors) {
            try {
                const { anchor, isNew } = this._anchorExchange.importAnchor(anchorJson);
                if (isNew) {
                    importedAnchors.push(anchor);
                } else {
                    skippedAnchors.push({ anchor, reason: PackageAnchorImportReason.DUPLICATE });
                }
            } catch (error) {
                const reason = error instanceof PublicationAnchorError
                    ? PackageAnchorImportReason.INVALID_STRUCTURE
                    : PackageAnchorImportReason.INVALID_SIGNATURE;
                rejectedAnchors.push({ anchor: anchorJson, reason, message: error.message });
            }
        }

        return { importedAnchors, skippedAnchors, rejectedAnchors };
    }
}
