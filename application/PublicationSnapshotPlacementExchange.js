import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { validatePublicationSnapshotPlacement } from './PublicationSnapshotPlacementValidator.js';

// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
// application/PublicationAnchorExchange.js's own three-step discipline
// (0.8.4), applied to a placement instead of an anchor:
//
//   1. validate  — application/PublicationSnapshotPlacementValidator.js
//                   (is this even a well-formed
//                   PublicationSnapshotPlacement envelope?)
//   2. construct — a real core/PublicationSnapshotPlacement.js instance,
//                   never trusted as-is
//   3. verify    — identity/LocalAuthorizationVerifier.js#
//                   verifyPublicationSnapshotPlacement() (did the claimed
//                   placerIdentity really sign exactly this
//                   publicationId/contentHash/storage/locator tuple?)
//
//   → catalog    — application/
//                   LocalPublicationSnapshotPlacementCatalog.js#add()
//
// This is deliberately a SECOND way to get a placement into the catalog,
// never a replacement for application/
// AddPublicationSnapshotPlacementUseCase.js (0.8.18) — that class still
// exists, unchanged, for a caller that already trusts a placement some
// other way (e.g. its own freshly-signed one) and only needs the
// two-step structural discipline. A placement arriving from a stranger
// over a peer connection has no such standing trust; this class is what
// application/PublicationSnapshotPlacementPeerExchange.js runs every
// incoming ANNOUNCE (and every entry of a RESPONSE) through instead.
//
// Stops exactly where application/PublicationAnchorExchange.js already
// stops: signature verification only. Never calls application/
// SnapshotPlacementResolver.js, never interprets `locator` against any
// real storage backend, and never retrieves a single byte. Signature
// verification answers "who signed this placement claim, and is the
// signature intact?" Resolution answers "can the named storage backend
// currently serve those exact bytes?" Those stay independent — see
// docs/Principles.md, "A Placement Is A Locator, Not Evidence Of History
// (0.8.18)," extended here across a network the identical way 0.8.4
// extended anchor signature verification across one.
export class PublicationSnapshotPlacementExchange {
    constructor(catalog, verifier) {
        if (!catalog) {
            throw new Error('PublicationSnapshotPlacementExchange: a placement catalog is required');
        }
        if (!verifier || typeof verifier.verifyPublicationSnapshotPlacement !== 'function') {
            throw new Error('PublicationSnapshotPlacementExchange: an authorization verifier is required');
        }
        this._catalog = catalog;
        this._verifier = verifier;
    }

    // The portable form of a placement this replica already has — pure
    // passthrough to `placement.toJSON()`, the same shape application/
    // PublicationAnchorExchange.js#exportAnchor() already establishes one
    // domain over. Throws for anything that isn't a signed
    // core/PublicationSnapshotPlacement.js instance.
    exportPlacement(placement) {
        if (!placement || !(placement instanceof PublicationSnapshotPlacement)) {
            throw new Error('PublicationSnapshotPlacementExchange: a PublicationSnapshotPlacement instance is required');
        }
        if (!placement.signature) {
            throw new Error('PublicationSnapshotPlacementExchange: refusing to export an unsigned placement');
        }
        return placement.toJSON();
    }

    // Runs the three-step discipline described in this class's own header
    // and, on success, catalogs the resulting PublicationSnapshotPlacement.
    // Returns `{ placement, isNew }` — see application/
    // LocalPublicationSnapshotPlacementCatalog.js#add()'s own header for
    // what `isNew` means. Throws on any structural or signature failure;
    // never attempts resolution — see this class's own header for why
    // that stays out of scope here.
    importPlacement(placementJson) {
        validatePublicationSnapshotPlacement(placementJson);

        const placement = PublicationSnapshotPlacement.fromJSON(placementJson);
        const result = this._verifier.verifyPublicationSnapshotPlacement(placementJson);
        if (!result.valid) {
            throw new Error(`PublicationSnapshotPlacementExchange: refusing to catalog an unverifiable placement — ${result.reason}`);
        }

        return this._catalog.add(placement);
    }

    // A thin passthrough to the injected catalog's own
    // findByPublicationId() — the read this class needed once
    // application/PublicationSnapshotPlacementPeerExchange.js had to
    // ANSWER a REQUEST, not just handle one. Deliberately does not expose
    // the catalog itself: a caller (namely
    // PublicationSnapshotPlacementPeerExchange) only ever needs "which
    // placements do I know about this publication," never remove()/
    // getReceivedAt()/list()-across-everything, so this stays the one
    // query this class's own import boundary already has standing to
    // answer. Never resolves, never filters by whether a placement is
    // signed — see exportPlacement()'s own header for where an unsigned
    // entry (only reachable via application/
    // AddPublicationSnapshotPlacementUseCase.js's separate, no-signature-
    // check path) gets refused, one layer up, by the caller that tries to
    // export it.
    findByPublicationId(publicationId) {
        return this._catalog.findByPublicationId(publicationId);
    }
}
