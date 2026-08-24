// 0.8.3 — Publication Center: External Evidence UX.
//
// application/PublicationResolutionCoordinator.js's own header states
// the shape this class copies onto a second axis: "this class owns no
// storage, no catalog, no state of its own... calling it twice is
// always safe and always re-derives its answer from scratch." Where
// that class sequences RESOLUTION (is the content available, and can a
// peer supply it), this one sequences EVIDENCE — two calls that read
// from, but never modify, application/LocalPublicationAnchorCatalog.js
// and application/ExternalAnchorVerifier.js:
//
//   discover(publicationId)  — synchronous, local-only, no network.
//                               Every application/PublicationAnchor.js
//                               this replica has cataloged for
//                               `publicationId`, in the catalog's own
//                               deterministic order. Never invented,
//                               never memoized here.
//   verify(anchor, options)  — asynchronous, may reach a real external
//                               system through the anchor's own
//                               anchorType-specific proofVerifier.
//                               Called ONLY when a caller explicitly
//                               asks about ONE anchor — never as a side
//                               effect of discover(), and never for
//                               every known anchor at once. See
//                               docs/Principles.md, "Known Evidence Is
//                               Not Verified Evidence, And Verified
//                               Evidence Is Not Authority (0.8.3)."
//
// This class stores no verification result anywhere, before or after a
// call — a caller (ui/views/DecentralizedPublicationsView.js) that
// wants to keep the current outcome on screen holds it itself, as
// ordinary ephemeral UI state, and discards it exactly as easily as it
// was computed. Calling verify() twice for the same anchor is always
// safe, always re-derives the answer from scratch, and may legitimately
// return a DIFFERENT outcome the second time — an external system's own
// confirmation state can change even though the anchor itself never
// does (see application/AnchorVerificationOutcome.js's own header).
export class PublicationEvidenceCoordinator {
    constructor(anchorCatalog, externalAnchorVerifier) {
        if (!anchorCatalog || typeof anchorCatalog.findByPublicationId !== 'function') {
            throw new Error('PublicationEvidenceCoordinator: a LocalPublicationAnchorCatalog is required');
        }
        if (!externalAnchorVerifier || typeof externalAnchorVerifier.verify !== 'function') {
            throw new Error('PublicationEvidenceCoordinator: an ExternalAnchorVerifier is required');
        }
        this._catalog = anchorCatalog;
        this._verifier = externalAnchorVerifier;
    }

    // DISCOVERY. Every anchor this replica has cataloged naming
    // `publicationId` — a plain pass-through to application/
    // LocalPublicationAnchorCatalog.js#findByPublicationId(), never
    // filtered, ranked, or narrowed to "the" anchor for this
    // publication. Never touches application/ExternalAnchorVerifier.js.
    discover(publicationId) {
        if (!publicationId) {
            throw new Error('PublicationEvidenceCoordinator: discover() requires a publicationId');
        }
        return this._catalog.findByPublicationId(publicationId);
    }

    // VERIFICATION. Runs `anchor` through application/
    // ExternalAnchorVerifier.js#verify() exactly once, for exactly the
    // one anchor supplied — never a batch, never every anchor a prior
    // discover() call returned. `expectedContentHash`/
    // `expectedPublicationId` are the caller's own already-known
    // publication's values, so a verified anchor is checked against the
    // SPECIFIC publication a person is looking at, not merely against
    // its own internally consistent claims — the binding this
    // milestone's own UI makes visible (see ui/views/
    // DecentralizedPublicationsView.js). `proofVerifierRegistry` is
    // passed straight through, letting a caller supply real anchorType-
    // specific backends (e.g. anchoring/BitcoinOpReturnProofVerifier.js)
    // without this class ever importing one itself.
    async verify(anchor, { expectedContentHash = null, expectedPublicationId = null, proofVerifierRegistry = null } = {}) {
        if (!anchor || typeof anchor.toJSON !== 'function') {
            throw new Error('PublicationEvidenceCoordinator: verify() requires a PublicationAnchor instance');
        }
        return this._verifier.verify(anchor.toJSON(), { expectedContentHash, expectedPublicationId, proofVerifierRegistry });
    }
}
