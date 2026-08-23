import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';

// 0.5.3 — Decentralized Place Name Exchange.
//
// The portable wire envelope for moving ONE PlaceNamingClaim between
// replicas — the exact same shape application/BlueprintPackage.js
// already established one domain over for a core/Structure.js: a small,
// versioned, plain-JSON wrapper around the one signed fact that needs to
// survive the trip, never a live reference to the store or device it was
// exported from. See docs/Principles.md, "A Naming Publication Is
// Portable Data, Never A Second Kind Of Claim (0.5.3)."
//
// Deliberately just `{ kind, schemaVersion, claim }` — no separate
// envelope-level "publishedAt." A claim's own `createdAt` is ALREADY the
// signed publication timestamp (it is part of
// core/PlaceNamingClaim.js#getSigningDescriptor()'s own payload); adding
// a second, unsigned "publishedAt" alongside it would only invite a
// spoofable shadow fact that disagrees with the one the signature
// actually covers. What genuinely cannot be known ahead of time — when
// THIS replica first heard about the claim — is `receivedAt`, and that
// is exactly why it lives in application/LocalPlaceNamingPublicationLog.js
// instead: purely local, per-replica, never transmitted, never signed.
//
// `kind` is a plain discriminator (not a security boundary), so a
// malformed or unrelated JSON file — a blueprint export, a saved
// Document, random JSON — fails
// application/PlaceNamingClaimPublicationValidator.js's very first
// check with a specific message, exactly like BlueprintImportValidator's
// own `pkg.kind !== BLUEPRINT_KIND` check one layer over.
export const CURRENT_SCHEMA_VERSION = 1;
export const PLACE_NAMING_CLAIM_PUBLICATION_KIND = 'forkbuild.place-naming-claim';

// Builds the plain, JSON-safe publication package for one PlaceNamingClaim.
// Pure — knows nothing about StorageProvider, files, or downloads; those
// are application/PlaceNamingClaimExchange.js's and the UI's own
// concerns, the same split application/ExportBlueprintUseCase.js already
// draws over application/BlueprintPackage.js.
//
// Requires a SIGNED claim — exporting an unsigned one would produce a
// package no receiver's verifier could ever accept, so this fails at the
// export boundary instead of silently producing dead-on-arrival data.
export function buildPlaceNamingClaimPublication(claim) {
    if (!claim || !(claim instanceof PlaceNamingClaim)) {
        throw new Error('PlaceNamingClaimPublication: a PlaceNamingClaim instance is required');
    }
    if (!claim.signature) {
        throw new Error('PlaceNamingClaimPublication: refusing to publish an unsigned claim');
    }
    return {
        kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        claim: claim.toJSON()
    };
}
