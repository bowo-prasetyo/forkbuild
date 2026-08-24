import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { validateDecentralizedPublication } from './DecentralizedPublicationValidator.js';

// 0.7.2 — Decentralized Publication Discovery & Catalog.
//
// The generalization of application/PlaceNamingClaimExchange.js and
// application/BlueprintAttributionExchange.js one layer up: those two
// each move exactly one domain's own signed claim from one replica's
// store into another's. This class moves the WRAPPER those domains can
// optionally travel inside instead — a core/DecentralizedPublication.js
// envelope itself — into application/LocalPublicationCatalog.js,
// without ever needing to know what contentKind it wraps.
//
//   Alice's publication --export--> envelope JSON --import--> Bob's catalog
//
// Deliberately protocol-independent, the identical restraint application/
// PlaceNamingClaimExchange.js's own header already states: this class
// knows nothing about files, clipboards, WebRTC, peers, or any other
// transport. A caller hands it a plain envelope object and gets a plain
// envelope object, or a cataloged DecentralizedPublication, back. A real
// live transport — gossiping envelopes over an active peer connection
// rather than a hand-off file — is its own future milestone (0.7.3,
// unchanged from this milestone's own docs/Roadmap.md entry), exactly
// the same "first transport is deliberately boring" posture 0.5.3 drew
// for naming claims: every future transport plugs into THIS class's
// importPublication()/exportPublication(), never into
// application/LocalPublicationCatalog.js directly.
//
// The three-step discipline named in this milestone's own design
// conversation, always in this order, never fewer:
//
//   1. validate  — application/DecentralizedPublicationValidator.js (is
//                   this even a well-formed envelope?)
//   2. construct — a real core/DecentralizedPublication.js from the
//                   package's own fields (never trusted as-is)
//   3. verify    — identity/LocalAuthorizationVerifier.js#
//                   verifyDecentralizedPublication() (did the claimed
//                   publisher really sign exactly this envelope?)
//
// Deliberately STOPS there — never retrieves the wrapped content, never
// calls application/PublicationResolver.js, never checks whether the
// locator this envelope names is even reachable. Cataloging is not
// resolving: see application/LocalPublicationCatalog.js's own header and
// this milestone's docs/Principles.md entry, "Discovery Is Not
// Resolution (0.7.2)." A publication whose content is temporarily
// unavailable is exactly as cataloggable as one that resolves instantly
// — this class cannot tell the difference, and does not try to.
//
// A package that fails validation or verification THROWS — this is
// untrusted input that may have crossed devices, been hand-edited, or
// been forged outright, the identical posture every exchange class in
// this codebase already takes for the identical reason (see application/
// PlaceNamingClaimExchange.js#importClaim()'s own header).
//
// Unlike application/BlueprintAttributionExchange.js/application/
// PlaceNamingClaimExchange.js, which each check store.has() themselves
// before calling store.save() (because their own stores are scoped by a
// fingerprint or region a caller must already know to check against),
// this class delegates dedup entirely to application/
// LocalPublicationCatalog.js#add() — a catalog with no natural per-call
// scope is free to make add() itself idempotent, so importPublication()
// never has to ask "have I seen this id" before handing it over. The
// outcome is identical either way: cataloging a publication this replica
// already knew about is never an error, only the ordinary cost of the
// same envelope reaching it through more than one transport.
export class PublicationExchange {
    constructor(catalog, verifier) {
        if (!catalog) {
            throw new Error('PublicationExchange: a publication catalog is required');
        }
        if (!verifier) {
            throw new Error('PublicationExchange: an authorization verifier is required');
        }
        this._catalog = catalog;
        this._verifier = verifier;
    }

    // The portable form of a publication this replica already has — pure
    // passthrough to `publication.toJSON()`, the same shape application/
    // BlueprintAttributionExchange.js#exportAttribution() already
    // establishes one domain over. Throws for anything that isn't a
    // signed DecentralizedPublication instance — a
    // DecentralizedPublication has no unsigned path at all (see core/
    // DecentralizedPublication.js's own header), so refusing to export
    // one here is not a policy choice, only a structural impossibility
    // being caught early.
    exportPublication(publication) {
        if (!publication || !(publication instanceof DecentralizedPublication)) {
            throw new Error('PublicationExchange: a DecentralizedPublication instance is required');
        }
        if (!publication.signature) {
            throw new Error('PublicationExchange: refusing to export an unsigned publication');
        }
        return publication.toJSON();
    }

    // Runs the three-step discipline described in this class's own
    // header and, on success, catalogs the resulting DecentralizedPublication.
    // Returns `{ publication, isNew }` — see application/
    // LocalPublicationCatalog.js#add()'s own header for what `isNew`
    // means. Throws on any structural or signature failure; never
    // attempts to resolve or otherwise inspect the wrapped content — see
    // this class's own header for why that is deliberately out of scope.
    importPublication(publicationJson) {
        validateDecentralizedPublication(publicationJson);

        const publication = DecentralizedPublication.fromJSON(publicationJson);
        const result = this._verifier.verifyDecentralizedPublication(publicationJson);
        if (!result.valid) {
            throw new Error(`PublicationExchange: refusing to catalog an unverifiable publication — ${result.reason}`);
        }

        return this._catalog.add(publication);
    }
}
