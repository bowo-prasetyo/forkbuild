// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// application/PublicationEvidenceCoordinator.js's own 0.8.3 header
// states the shape this class copies onto the placement side: "this
// class owns no storage, no catalog, no state of its own... calling it
// twice is always safe and always re-derives its answer from scratch."
// Where that class sequences EVIDENCE (discover a PublicationAnchor,
// verify it against an external system), this one sequences PLACEMENT
// RESOLUTION — two calls that read from, but never modify, application/
// LocalPublicationSnapshotPlacementCatalog.js and application/
// SnapshotPlacementResolver.js:
//
//   discover(publicationId)  — synchronous, local-only, no network.
//                               Every application/
//                               PublicationSnapshotPlacement.js this
//                               replica has cataloged for
//                               `publicationId`, in the catalog's own
//                               deterministic order. Never invented,
//                               never memoized here.
//   resolve(placement)       — asynchronous, may reach a real storage
//                               backend through the store this
//                               coordinator's own registry resolves for
//                               the placement's `storage`. Called ONLY
//                               when a caller explicitly asks about ONE
//                               placement — never as a side effect of
//                               discover(), and never for every known
//                               placement at once. See docs/
//                               Principles.md, "Resolving A Placement
//                               Observes Present Availability; It Does
//                               Not Rewrite The Placement Claim
//                               (0.8.20)."
//
// This class stores no resolution result anywhere, before or after a
// call — a caller (ui/views/DecentralizedPublicationsView.js) that wants
// to keep the current outcome on screen holds it itself, as ordinary
// ephemeral UI state, and discards it exactly as easily as it was
// computed. Calling resolve() twice for the same placement is always
// safe, always re-derives the answer from scratch, and may legitimately
// return a DIFFERENT outcome the second time — a storage backend's own
// availability can change even though the placement itself never does
// (see application/SnapshotPlacementResolutionOutcome.js's own header).
export class SnapshotPlacementResolutionCoordinator {
    constructor(placementCatalog, snapshotPlacementResolver, storeRegistry) {
        if (!placementCatalog || typeof placementCatalog.findByPublicationId !== 'function') {
            throw new Error('SnapshotPlacementResolutionCoordinator: a LocalPublicationSnapshotPlacementCatalog is required');
        }
        if (!snapshotPlacementResolver || typeof snapshotPlacementResolver.resolve !== 'function') {
            throw new Error('SnapshotPlacementResolutionCoordinator: a SnapshotPlacementResolver is required');
        }
        if (!storeRegistry || typeof storeRegistry.get !== 'function') {
            throw new Error('SnapshotPlacementResolutionCoordinator: a SnapshotPlacementStoreRegistry is required');
        }
        this._catalog = placementCatalog;
        this._resolver = snapshotPlacementResolver;
        this._storeRegistry = storeRegistry;
    }

    // DISCOVERY. Every placement this replica has cataloged naming
    // `publicationId` — a plain pass-through to application/
    // LocalPublicationSnapshotPlacementCatalog.js#findByPublicationId(),
    // never filtered, ranked, or narrowed to "the" placement for this
    // publication. Never touches application/SnapshotPlacementResolver.js.
    discover(publicationId) {
        if (!publicationId) {
            throw new Error('SnapshotPlacementResolutionCoordinator: discover() requires a publicationId');
        }
        return this._catalog.findByPublicationId(publicationId);
    }

    // RESOLUTION. Runs `placement` through application/
    // SnapshotPlacementResolver.js#resolve() exactly once, for exactly
    // the one placement supplied — never a batch, never every placement
    // a prior discover() call returned. The store registry this
    // coordinator was built with is always what resolves `placement`'s
    // own `storage` — a caller never supplies one, so a placement is
    // always resolved against the SAME registered stores this replica
    // uses everywhere else.
    async resolve(placement) {
        if (!placement || typeof placement.toJSON !== 'function') {
            throw new Error('SnapshotPlacementResolutionCoordinator: resolve() requires a PublicationSnapshotPlacement instance');
        }
        return this._resolver.resolve(placement.toJSON(), { storeRegistry: this._storeRegistry });
    }
}
