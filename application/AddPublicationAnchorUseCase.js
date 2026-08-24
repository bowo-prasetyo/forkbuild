import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { validatePublicationAnchor } from './PublicationAnchorValidator.js';

// 0.8.2 — Anchor Catalog & Evidence Discovery.
//
// The one place this codebase turns an anchor record into a cataloged
// PublicationAnchor. Deliberately a TWO-step discipline, one step
// shorter than application/PublicationExchange.js#importPublication()'s
// own three:
//
//   1. validate  — application/PublicationAnchorValidator.js (is this
//                   even a well-formed PublicationAnchor envelope?)
//   2. construct — a real core/PublicationAnchor.js instance
//
//   → catalog    — application/LocalPublicationAnchorCatalog.js#add()
//
// No signature check, no proof check, and no call to application/
// ExternalAnchorVerifier.js anywhere in this class. That is not an
// oversight: 0.8.2 deliberately builds no peer transport for anchors yet
// (see docs/Roadmap.md) — a `PublicationExchange`-shaped anchor exchange
// that DOES verify a signature at its own import boundary, the same way
// application/PublicationExchange.js does for a DecentralizedPublication
// arriving from a stranger, is explicitly sized as its own future
// milestone. Until that transport exists, this use case only ever
// answers "is this envelope well-formed enough to keep a record of" —
// never "is this genuinely signed" and never "does its proof hold up."
// See application/LocalPublicationAnchorCatalog.js's own header and
// docs/Principles.md, "Cataloging External Evidence Does Not Validate
// External Evidence (0.8.2)."
//
// A caller that also wants to know whether a just-added anchor is
// trustworthy calls application/ExternalAnchorVerifier.js separately,
// afterward, exactly as if it had looked the anchor up from the catalog
// on any other day — cataloging an anchor is never itself a verification
// attempt, successful or otherwise.
export class AddPublicationAnchorUseCase {
    constructor(catalog) {
        if (!catalog) {
            throw new Error('AddPublicationAnchorUseCase: an anchor catalog is required');
        }
        this._catalog = catalog;
    }

    // Runs the two-step discipline described in this class's own header
    // and, on success, catalogs the resulting PublicationAnchor. Returns
    // `{ anchor, isNew }` — see application/
    // LocalPublicationAnchorCatalog.js#add()'s own header for what
    // `isNew` means. Throws a PublicationAnchorError for a structurally
    // malformed envelope; never throws for one that is well-formed but
    // unsigned, forged, or otherwise unverifiable — that judgment belongs
    // entirely to application/ExternalAnchorVerifier.js, never to this
    // class.
    execute(anchorJson) {
        validatePublicationAnchor(anchorJson);
        const anchor = PublicationAnchor.fromJSON(anchorJson);
        return this._catalog.add(anchor);
    }
}
