import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { validatePublicationSnapshotPlacement, PublicationSnapshotPlacementError } from './PublicationSnapshotPlacementValidator.js';

// 0.8.21 — Persistent Snapshot Placement Catalog & Restart Recovery.
//
// application/LocalPublicationSnapshotPlacementCatalog.js has been
// backed by durable storage since 0.8.18 (a `storageProvider`, now
// behind application/LocalPublicationSnapshotPlacementStore.js), and a
// fresh catalog instance has always transparently served whatever was
// already on file the moment it was constructed — there was never a
// moment where a restarted replica's catalog was actually empty. What a
// restart never did, until this class, is re-earn the trust a placement
// originally had to pass through to get there. A record already sitting
// in storage before this process started could be exactly what
// application/PublicationSnapshotPlacementExchange.js#importPlacement()
// originally validated and verified — or it could be something else
// entirely: bit rot, a bug in some earlier version of this codebase, a
// hand-edited devtools entry, another script sharing the same origin's
// storage. application/LocalPublicationSnapshotPlacementStore.js's own
// header calls this what it is: an UNTRUSTED byte source, no more
// entitled to automatic trust than a peer message or an imported
// package.
//
// This class is the ONE place that re-earns it, run ONCE, EXPLICITLY, at
// startup (see application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js)
// — never lazily, never on every catalog read (application/
// LocalPublicationSnapshotPlacementCatalog.js's own reads stay exactly as
// cheap and exactly as trusting as they always were; see that file's own
// header for why re-verifying on every read was never the right fix). It
// reuses the IDENTICAL two-of-three-step boundary application/
// PublicationSnapshotPlacementExchange.js#importPlacement() already
// established for a placement arriving from a stranger over a peer
// connection:
//
//   1. validate  — application/PublicationSnapshotPlacementValidator.js
//                   (is this even a well-formed
//                   PublicationSnapshotPlacement envelope?)
//   2. construct — a real core/PublicationSnapshotPlacement.js instance
//   3. verify    — identity/LocalAuthorizationVerifier.js#
//                   verifyPublicationSnapshotPlacement() (did the claimed
//                   placerIdentity really sign exactly this
//                   publicationId/contentHash/storage/locator tuple?)
//
// and DELIBERATELY STOPS THERE — see application/
// PublicationSnapshotPlacementExchange.js's own header, and application/
// SnapshotPlacementResolver.js's own header for the retrieval step this
// class never runs. This class never imports application/
// SnapshotPlacementResolver.js, never touches a content store or IPFS,
// and never asks whether a restored placement's locator can presently
// serve its bytes. Restarting this replica is not an occasion to
// re-resolve every placement, only to decide, once, whether each stored
// envelope is still the genuine signed claim it always was:
//
//   restart
//     ↓
//   restore placement
//     ↓
//   NEVER: contact IPFS / check content
//
// Restoration answers only "is this a structurally valid, correctly
// signed placement claim?" — never "can I retrieve the snapshot right
// now?" That remains application/SnapshotPlacementResolutionCoordinator
// .js's own explicit, separate resolve() call (0.8.20). See docs/
// Principles.md, "Restoring A Snapshot Placement Re-establishes The
// Signed Claim, Not Its Current Availability (0.8.21)."
//
// A record that fails either step is PRUNED — removed from the store via
// its own `remove()` — rather than merely skipped. Leaving a known-bad
// record sitting in storage forever would let it silently keep failing
// this exact check on every future restart with no way for a person to
// ever notice or clear it; a record that never once passed validate +
// verify was never genuinely cataloged as a placement claim in the first
// place; see this milestone's own docs/Principles.md entry on why
// pruning is not the same act as application/
// LocalPublicationSnapshotPlacementCatalog.js#remove() withdrawing a
// placement a caller once trusted.
//
// A record that DOES pass is left exactly where it already was — this
// class never calls `catalog.add()` and never touches `receivedAt` in
// any way. application/LocalPublicationSnapshotPlacementCatalog.js
// already serves it, with its own original `receivedAt` untouched, the
// moment this class returns; there is no separate "now populate the
// catalog" step, because the catalog was never actually unpopulated to
// begin with (see this class's own header, first paragraph).
export const PlacementRestorationRejectionReason = Object.freeze({
    INVALID_STRUCTURE: 'invalid-structure',
    INVALID_SIGNATURE: 'invalid-signature'
});

export class RestorePublicationSnapshotPlacementCatalogUseCase {
    // store: an application/LocalPublicationSnapshotPlacementStore.js
    // instance — the SAME one application/
    // LocalPublicationSnapshotPlacementCatalog.js was constructed over, so
    // pruning a record here is immediately reflected in every subsequent
    // catalog read.
    // verifier: an identity/LocalAuthorizationVerifier.js instance (or
    // anything shaped like one) — signature verification ONLY, never an
    // application/SnapshotPlacementResolver.js. See this class's own
    // header.
    constructor(store, verifier) {
        if (!store || typeof store.list !== 'function' || typeof store.remove !== 'function') {
            throw new Error('RestorePublicationSnapshotPlacementCatalogUseCase: a LocalPublicationSnapshotPlacementStore is required');
        }
        if (!verifier || typeof verifier.verifyPublicationSnapshotPlacement !== 'function') {
            throw new Error('RestorePublicationSnapshotPlacementCatalogUseCase: an authorization verifier is required');
        }
        this._store = store;
        this._verifier = verifier;
    }

    // Runs every record currently on file through the discipline
    // described in this class's own header. Never throws for a bad
    // record — a single forged or corrupted entry is pruned and reported,
    // never allowed to abort restoring the rest, the same per-entry
    // tolerance application/RestorePublicationAnchorCatalogUseCase.js
    // (0.8.15) already applies to a stored anchor.
    //
    // Returns `{ restoredPlacements, rejectedPlacements }`:
    //   restoredPlacements — real PublicationSnapshotPlacement instances
    //                        that passed validate + verify; informational
    //                        only (a caller that wants to log "N
    //                        placements restored" has something to
    //                        count) — never written anywhere, since they
    //                        were already durably on file.
    //   rejectedPlacements — `{ placementId, reason, message }`;
    //                        `placementId` is null when the record was
    //                        too malformed to even carry a usable id.
    //                        `reason` is INVALID_STRUCTURE (failed
    //                        application/
    //                        PublicationSnapshotPlacementValidator.js) or
    //                        INVALID_SIGNATURE (parsed, but did not
    //                        verify)
    execute() {
        const entries = this._store.list();
        const restoredPlacements = [];
        const rejectedPlacements = [];

        for (const entry of entries) {
            const raw = entry ? entry.placement : null;
            try {
                validatePublicationSnapshotPlacement(raw);
                const placement = PublicationSnapshotPlacement.fromJSON(raw);
                const result = this._verifier.verifyPublicationSnapshotPlacement(raw);
                if (!result.valid) {
                    throw new Error(result.reason || 'signature did not verify');
                }
                restoredPlacements.push(placement);
            } catch (error) {
                const reason = error instanceof PublicationSnapshotPlacementError
                    ? PlacementRestorationRejectionReason.INVALID_STRUCTURE
                    : PlacementRestorationRejectionReason.INVALID_SIGNATURE;
                const placementId = raw && typeof raw.id === 'string' && raw.id ? raw.id : null;
                if (placementId) {
                    this._store.remove(placementId);
                }
                rejectedPlacements.push({ placementId, reason, message: error.message });
            }
        }

        return { restoredPlacements, rejectedPlacements };
    }
}
