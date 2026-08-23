import { CURRENT_SCHEMA_VERSION, PLACE_NAMING_CLAIM_PUBLICATION_KIND } from './PlaceNamingClaimPublication.js';

// 0.5.3 — Decentralized Place Name Exchange.
//
// Strict, side-effect-free STRUCTURAL validation of a portable naming
// publication — deliberately separate from application/
// PlaceNamingClaimExchange.js's own importClaim(), the exact same split
// application/BlueprintImportValidator.js already draws from
// application/ImportBlueprintUseCase.js one domain over: this module
// answers ONE question, "is this package well-formed?", and never
// constructs a PlaceNamingClaim, never touches a verifier, and never
// persists anything.
//
// A publication is untrusted input the moment it crosses a device
// boundary — it may have been hand-edited, corrupted in transit, or
// authored by a different, incompatible build of ForkBuild — so
// malformed input fails HERE, before anything is constructed or
// cryptographically verified. "Well-formed" is deliberately a WEAKER
// claim than "authentic": this validator only checks shape (every field
// present, the right type); whether the claim actually verifies against
// its own signature is a separate question application/
// PlaceNamingClaimExchange.js#importClaim() asks next, via
// identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim() — see
// that method's own header on why STRUCTURAL shape and CRYPTOGRAPHIC
// authenticity are never conflated into one check anywhere in this
// codebase.
export class PlaceNamingClaimPublicationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PlaceNamingClaimPublicationError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new PlaceNamingClaimPublicationError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new PlaceNamingClaimPublicationError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

// Throws PlaceNamingClaimPublicationError describing exactly what's
// wrong; returns nothing on success. Never mutates or normalizes `pkg` —
// a caller that wants a hydrated PlaceNamingClaim does so afterward
// (application/PlaceNamingClaimExchange.js#importClaim()'s own "validate,
// THEN construct, THEN verify" order), the same discipline
// application/BlueprintImportValidator.js's own header requires.
export function validatePlaceNamingClaimPublication(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new PlaceNamingClaimPublicationError('PlaceNamingClaimPublication: package is missing or not an object');
    }
    if (pkg.kind !== PLACE_NAMING_CLAIM_PUBLICATION_KIND) {
        throw new PlaceNamingClaimPublicationError('PlaceNamingClaimPublication: this file is not a ForkBuild place naming claim');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new PlaceNamingClaimPublicationError(`PlaceNamingClaimPublication: unsupported schema version ${pkg.schemaVersion}`);
    }

    const claim = pkg.claim;
    if (!claim || typeof claim !== 'object') {
        throw new PlaceNamingClaimPublicationError('PlaceNamingClaimPublication: claim is missing or not an object');
    }
    for (const field of ['id', 'worldId', 'regionId', 'name', 'authorIdentityId', 'createdAt']) {
        if (!isNonEmptyString(claim[field])) {
            throw new PlaceNamingClaimPublicationError(`PlaceNamingClaimPublication: claim.${field} is missing or not a string`);
        }
    }
    validateSignature(claim.signature, 'PlaceNamingClaimPublication: claim');
}
