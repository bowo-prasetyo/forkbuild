// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// application/PublicationSnapshotPlacementDetailView.js (this milestone)
// derives the generic detail every placement carries, deliberately
// WITHOUT interpreting anything only one storage backend's own locator
// shape could make sense of (see that file's own header on why `locator`
// is returned opaque). Turning an `ipfs://<cid>` locator into a
// followable gateway URL is exactly that kind of storage-specific
// interpretation, and this registry is the SAME `storage -> plugin`
// lookup seam application/SnapshotPlacementStoreRegistry.js (0.8.18)
// already established for RETRIEVAL, applied here to a second,
// independent axis: presentation — the identical relationship
// application/ExternalAnchorEvidenceViewRegistry.js (0.8.14) already
// holds to application/ExternalProofVerifierRegistry.js (0.8.1) for
// anchors.
//
// UNLIKE THE EVIDENCE-SIDE REGISTRY, THIS ONE IS NAMED AFTER ITS OWN
// SIBLINGS, NOT AFTER "EXTERNAL". application/
// SnapshotPlacementStoreRegistry.js/application/
// SnapshotPlacementResolutionOutcome.js/application/
// SnapshotPlacementResolver.js all drop the anchor-side "External"/
// "Publication" prefixing once they are naming something on the
// placement side of this codebase — this file keeps that same plain
// `SnapshotPlacement*` naming rather than importing `ExternalAnchor*`'s
// own vocabulary onto a different kind of fact.
//
// It never itself describes anything, never imports content/
// IpfsSnapshotPlacementView.js or content/LocalSnapshotPlacementView.js,
// and application/PublicationSnapshotPlacementDetailView.js never
// imports THIS file either — a caller (ordinarily ui/views/
// DecentralizedPublicationsView.js) looks a placement's own `storage` up
// here, entirely separately from calling
// publicationSnapshotPlacementDetailView() itself. No storage vocabulary
// lives here — a view names its own `storage`; this registry only ever
// reads that name back, never invents or validates it against any fixed
// list.
//
// A registered view's own `describe(placement)` MUST stay exactly as
// pure and side-effect-free as application/
// PublicationSnapshotPlacementDetailView.js itself: no network request,
// no resolution, no mutation. See content/IpfsSnapshotPlacementView.js's
// own header for the shape it returns and everything it deliberately
// never decides.
export class SnapshotPlacementViewRegistry {
    constructor() {
        this._placementViews = new Map();
    }

    // Keyed by the plugin's OWN `storage` — never a second, caller-
    // supplied key that could drift from what the plugin actually
    // describes. Registering a second view for a storage name already
    // registered REPLACES the first, the same "last write wins, for a
    // purely local lookup table" posture every sibling registry in this
    // codebase already takes.
    register(placementView) {
        if (!placementView || typeof placementView.storage !== 'string' || !placementView.storage.trim()) {
            throw new Error('SnapshotPlacementViewRegistry: a placementView with a non-empty storage is required');
        }
        if (typeof placementView.describe !== 'function') {
            throw new Error('SnapshotPlacementViewRegistry: a placementView must implement describe()');
        }
        this._placementViews.set(placementView.storage, placementView);
        return this;
    }

    unregister(storage) {
        this._placementViews.delete(storage);
    }

    has(storage) {
        return this._placementViews.has(storage);
    }

    // Returns null for an unregistered storage — never throws. A caller
    // with no plugin for this placement's storage simply shows the
    // generic application/PublicationSnapshotPlacementDetailView.js
    // shape alone, exactly as honestly as application/
    // SnapshotPlacementStoreRegistry.js's own null falls through to
    // STORE_UNAVAILABLE one layer over.
    get(storage) {
        return this._placementViews.get(storage) || null;
    }

    get storageTypes() {
        return Array.from(this._placementViews.keys());
    }
}
