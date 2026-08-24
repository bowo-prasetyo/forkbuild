import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { validatePublicationAnchor } from './PublicationAnchorValidator.js';

// 0.8.4 — External Anchor Publication Over Peers.
//
// application/AddPublicationAnchorUseCase.js's own header named this class
// by shape, in advance: "a `PublicationExchange`-shaped anchor exchange
// that DOES verify a signature at its own import boundary... is explicitly
// sized as its own future milestone." This is that class — application/
// PublicationExchange.js's own three-step discipline, applied to an
// anchor instead of a publication envelope:
//
//   1. validate  — application/PublicationAnchorValidator.js (is this
//                   even a well-formed PublicationAnchor envelope?)
//   2. construct — a real core/PublicationAnchor.js instance, never
//                   trusted as-is
//   3. verify    — identity/LocalAuthorizationVerifier.js#
//                   verifyPublicationAnchor() (did the claimed
//                   anchorIdentity really sign exactly this
//                   publicationId/contentHash/anchorType/locator/proof
//                   tuple?)
//
//   → catalog    — application/LocalPublicationAnchorCatalog.js#add()
//
// This is deliberately a SECOND way to get an anchor into the catalog,
// never a replacement for application/AddPublicationAnchorUseCase.js —
// that class still exists, unchanged, for a caller that already trusts an
// anchor some other way (e.g. its own freshly-signed one) and only needs
// the two-step structural discipline. An anchor arriving from a stranger
// over a peer connection has no such standing trust; this class is what
// application/PublicationAnchorPeerExchange.js runs every incoming
// ANNOUNCE through instead.
//
// Stops exactly where application/PublicationExchange.js already stops:
// signature verification only. Never calls application/
// ExternalAnchorVerifier.js, never interprets `proof`, never checks
// whether the external system named by `locator` actually recorded
// anything. Signature verification answers "who signed this anchor claim,
// and is the signature intact?" Proof verification answers "can the
// external evidence currently substantiate the claimed recording?" Those
// stay independent — see docs/Principles.md, "Signature Verification Is
// Not Proof Verification (0.8.4)."
export class PublicationAnchorExchange {
    constructor(catalog, verifier) {
        if (!catalog) {
            throw new Error('PublicationAnchorExchange: an anchor catalog is required');
        }
        if (!verifier || typeof verifier.verifyPublicationAnchor !== 'function') {
            throw new Error('PublicationAnchorExchange: an authorization verifier is required');
        }
        this._catalog = catalog;
        this._verifier = verifier;
    }

    // The portable form of an anchor this replica already has — pure
    // passthrough to `anchor.toJSON()`, the same shape application/
    // PublicationExchange.js#exportPublication() already establishes one
    // domain over. Throws for anything that isn't a signed
    // core/PublicationAnchor.js instance.
    exportAnchor(anchor) {
        if (!anchor || !(anchor instanceof PublicationAnchor)) {
            throw new Error('PublicationAnchorExchange: a PublicationAnchor instance is required');
        }
        if (!anchor.signature) {
            throw new Error('PublicationAnchorExchange: refusing to export an unsigned anchor');
        }
        return anchor.toJSON();
    }

    // Runs the three-step discipline described in this class's own header
    // and, on success, catalogs the resulting PublicationAnchor. Returns
    // `{ anchor, isNew }` — see application/
    // LocalPublicationAnchorCatalog.js#add()'s own header for what
    // `isNew` means. Throws on any structural or signature failure; never
    // attempts external proof verification — see this class's own header
    // for why that stays out of scope here.
    importAnchor(anchorJson) {
        validatePublicationAnchor(anchorJson);

        const anchor = PublicationAnchor.fromJSON(anchorJson);
        const result = this._verifier.verifyPublicationAnchor(anchorJson);
        if (!result.valid) {
            throw new Error(`PublicationAnchorExchange: refusing to catalog an unverifiable anchor — ${result.reason}`);
        }

        return this._catalog.add(anchor);
    }
}
