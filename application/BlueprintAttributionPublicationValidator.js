import { BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';

// 0.6.6 — Decentralized Blueprint Exchange.
//
// Strict, side-effect-free STRUCTURAL validation of a portable
// BlueprintAttribution publication — the exact same split
// application/PlaceNamingClaimPublicationValidator.js already drew for a
// PlaceNamingClaim one domain over, and application/
// BlueprintImportValidator.js drew for a Blueprint before that: this
// module answers ONE question, "is this well-formed?", and never
// constructs a BlueprintAttribution, never touches a verifier, and never
// persists anything. Whether it actually verifies cryptographically is a
// completely separate question, asked next by identity/
// LocalAuthorizationVerifier.js#verifyBlueprintAttribution() — "well-formed"
// and "authentic" are never conflated into one check anywhere in this
// codebase, and this module keeps that discipline rather than inventing a
// shortcut for attributions specifically.
//
// Unlike application/PlaceNamingClaimPublication.js, THERE IS NO SEPARATE
// envelope module here. core/BlueprintAttribution.js#toJSON() already
// carries its own `kind`/`schemaVersion` (that module's own 0.6.5 header
// says as much: "free to include now and exactly what 0.6.6 will need") —
// so the publication IS `attribution.toJSON()`, unwrapped, and this
// validator checks exactly that shape. Reusing BLUEPRINT_ATTRIBUTION_KIND/
// CURRENT_SCHEMA_VERSION straight from core/BlueprintAttribution.js rather
// than redefining them here keeps there being exactly one place that owns
// what "a current blueprint attribution" means.
export class BlueprintAttributionPublicationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BlueprintAttributionPublicationError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new BlueprintAttributionPublicationError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new BlueprintAttributionPublicationError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

// Throws BlueprintAttributionPublicationError describing exactly what's
// wrong; returns nothing on success. Never mutates or normalizes `pkg` —
// a caller that wants a hydrated BlueprintAttribution does so afterward
// (application/BlueprintAttributionExchange.js#importAttribution()'s own
// "validate, THEN construct, THEN verify" order), the same discipline
// every other publication validator in this codebase already requires.
export function validateBlueprintAttributionPublication(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new BlueprintAttributionPublicationError('BlueprintAttributionPublication: package is missing or not an object');
    }
    if (pkg.kind !== BLUEPRINT_ATTRIBUTION_KIND) {
        throw new BlueprintAttributionPublicationError('BlueprintAttributionPublication: this file is not a ForkBuild blueprint attribution');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new BlueprintAttributionPublicationError(`BlueprintAttributionPublication: unsupported schema version ${pkg.schemaVersion}`);
    }
    for (const field of ['id', 'fingerprint', 'authorIdentityId', 'createdAt']) {
        if (!isNonEmptyString(pkg[field])) {
            throw new BlueprintAttributionPublicationError(`BlueprintAttributionPublication: ${field} is missing or not a string`);
        }
    }
    validateSignature(pkg.signature, 'BlueprintAttributionPublication');
}
