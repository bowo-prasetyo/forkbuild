// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// application/PublicationAnchorDetailView.js (0.8.14) turns a
// PublicationAnchor into a flat, UI-ready shape without touching a
// verifier. This file is the identical idea, one axis over: a
// PublicationSnapshotPlacement (core/PublicationSnapshotPlacement.js,
// 0.8.18) turned into a flat, UI-ready shape without touching
// application/SnapshotPlacementResolver.js. Pure, synchronous,
// side-effect-free — never imports application/
// LocalPublicationSnapshotPlacementCatalog.js or application/
// SnapshotPlacementResolver.js. Calling this twice for the same
// placement always returns a byte-identical result, and calling it at
// all never changes the placement, the catalog, or anything else this
// replica holds.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: `locator` is returned
// exactly as the placement itself carries it — an opaque, storage-
// defined string this file never parses. There is no `locator.cid`, no
// `locator.gateway`, no `locator.path` read anywhere below. See
// content/IpfsSnapshotPlacementView.js for the one place an
// `ipfs://`-shaped locator is ever interpreted, and application/
// SnapshotPlacementViewRegistry.js for why that interpretation lives
// behind its own storage-keyed seam rather than an
// `if (storage === 'ipfs')` branch here.
//
// `placedAtLabel` exists so a caller never has to invent its own
// wording for the restraint core/PublicationSnapshotPlacement.js's own
// header already states: `placedAt` is THIS REPLICA's own reported time
// of placing the content, never an external system's timestamp (a
// placement has no external system to report one at all — content-
// addressed storage backends do not timestamp anything). "Claimed
// placement time" — never "Confirmed at," "Pinned at," or "Stored at" —
// is the one sentence this file writes for it.
export function publicationSnapshotPlacementDetailView(placement) {
    if (!placement || typeof placement.toJSON !== 'function') {
        throw new Error('publicationSnapshotPlacementDetailView: a PublicationSnapshotPlacement instance is required');
    }
    return {
        placementId: placement.id,
        publicationId: placement.publicationId,
        contentHash: placement.contentHash,
        storage: placement.storage,
        locator: placement.locator,
        placedAt: placement.placedAt instanceof Date ? placement.placedAt.toISOString() : placement.placedAt,
        placedAtLabel: 'Claimed placement time',
        placerIdentityId: placement.placerIdentity ? placement.placerIdentity.id : null,
        bindingDescription: describePlacementBinding(placement.publicationId, placement.contentHash)
    };
}

// The one sentence naming the relationship a PublicationSnapshotPlacement's
// own signature binds together — never cross-checked against a locally
// known publication's own contentReference.hash here. That cross-check
// is application/SnapshotPlacementResolver.js's own job, a SEPARATE,
// explicit "Resolve Snapshot" step. Worded exactly as a claim
// ("claims... can be retrieved from"), never as an established fact
// ("is," "serves," "hosts"), mirroring application/
// PublicationAnchorDetailView.js#describeAnchorBinding()'s own
// restraint.
export function describePlacementBinding(publicationId, contentHash) {
    return `This placement claims that publication ${publicationId} with content hash ${contentHash} can be retrieved from its named locator.`;
}
