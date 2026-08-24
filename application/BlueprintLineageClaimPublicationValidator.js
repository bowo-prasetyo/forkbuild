import { BLUEPRINT_LINEAGE_CLAIM_KIND, CURRENT_SCHEMA_VERSION, BlueprintLineageRelationship } from '../core/BlueprintLineageClaim.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// Strict, side-effect-free STRUCTURAL validation of a portable
// BlueprintLineageClaim publication — the exact split application/
// BlueprintAttributionPublicationValidator.js already drew one concept
// over: this module answers ONE question, "is this well-formed?", and
// never constructs a claim, never touches a verifier, and never persists
// anything. Whether it verifies cryptographically is asked next by
// identity/LocalAuthorizationVerifier.js#verifyBlueprintLineageClaim() —
// "well-formed" and "authentic" stay two separate checks, never conflated.
//
// No separate envelope module here either — core/BlueprintLineageClaim.js
// #toJSON() already carries its own `kind`/`schemaVersion`, so the
// publication IS `claim.toJSON()`, unwrapped, and this validator checks
// exactly that shape.
export class BlueprintLineageClaimPublicationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BlueprintLineageClaimPublicationError';
    }
}

const VALID_RELATIONSHIPS = new Set(Object.values(BlueprintLineageRelationship));

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new BlueprintLineageClaimPublicationError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new BlueprintLineageClaimPublicationError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

// Throws BlueprintLineageClaimPublicationError describing exactly what's
// wrong; returns nothing on success. Never mutates or normalizes `pkg` —
// a caller that wants a hydrated BlueprintLineageClaim does so
// afterward, the same "validate, THEN construct, THEN verify" discipline
// application/BlueprintLineageExchange.js#importClaim() follows.
export function validateBlueprintLineageClaimPublication(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new BlueprintLineageClaimPublicationError('BlueprintLineageClaimPublication: package is missing or not an object');
    }
    if (pkg.kind !== BLUEPRINT_LINEAGE_CLAIM_KIND) {
        throw new BlueprintLineageClaimPublicationError('BlueprintLineageClaimPublication: this file is not a ForkBuild blueprint lineage claim');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new BlueprintLineageClaimPublicationError(`BlueprintLineageClaimPublication: unsupported schema version ${pkg.schemaVersion}`);
    }
    for (const field of ['id', 'sourceFingerprint', 'derivedFingerprint', 'authorIdentityId', 'relationship', 'createdAt']) {
        if (!isNonEmptyString(pkg[field])) {
            throw new BlueprintLineageClaimPublicationError(`BlueprintLineageClaimPublication: ${field} is missing or not a string`);
        }
    }
    if (pkg.sourceFingerprint === pkg.derivedFingerprint) {
        throw new BlueprintLineageClaimPublicationError('BlueprintLineageClaimPublication: sourceFingerprint and derivedFingerprint must differ');
    }
    if (!VALID_RELATIONSHIPS.has(pkg.relationship)) {
        throw new BlueprintLineageClaimPublicationError(`BlueprintLineageClaimPublication: unknown relationship "${pkg.relationship}"`);
    }
    validateSignature(pkg.signature, 'BlueprintLineageClaimPublication');
}
