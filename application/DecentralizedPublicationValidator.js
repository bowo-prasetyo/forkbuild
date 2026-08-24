import { DECENTRALIZED_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION } from '../core/DecentralizedPublication.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
//
// Strict, side-effect-free STRUCTURAL validation of the envelope ITSELF —
// the exact same split every publication validator in this codebase
// already draws (see application/BlueprintAttributionPublicationValidator.js's
// own header): this module answers ONE question, "is this well-formed as
// a DecentralizedPublication?", and never touches a verifier, never
// looks inside the wrapped content, and never persists anything.
//
// Checking the WRAPPED content (does `contentKind` match what a caller
// expected? is the payload itself well-formed? does IT verify?) is
// deliberately out of scope here — that is application/
// PublicationResolver.js's own job, one step later, using whatever
// per-kind validator/verifier the content's own `contentKind` calls for.
// This module only ever checks the outer envelope: is there a
// contentReference with a hash, an id, a publisherIdentity, a signature
// shaped like one?
export class DecentralizedPublicationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DecentralizedPublicationError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new DecentralizedPublicationError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new DecentralizedPublicationError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

function validatePublisherIdentity(identity, prefix) {
    if (!identity || typeof identity !== 'object') {
        throw new DecentralizedPublicationError(`${prefix}.publisherIdentity is missing or not an object`);
    }
    for (const field of ['id', 'algorithm', 'publicKey']) {
        if (!isNonEmptyString(identity[field])) {
            throw new DecentralizedPublicationError(`${prefix}.publisherIdentity.${field} is missing or not a string`);
        }
    }
}

function validateContentReference(reference, prefix) {
    if (!reference || typeof reference !== 'object') {
        throw new DecentralizedPublicationError(`${prefix}.contentReference is missing or not an object`);
    }
    if (!isNonEmptyString(reference.hash)) {
        throw new DecentralizedPublicationError(`${prefix}.contentReference.hash is missing or not a string`);
    }
}

// Throws DecentralizedPublicationError describing exactly what's wrong;
// returns nothing on success. Never mutates or normalizes `pkg`, never
// constructs a DecentralizedPublication — a caller that wants a hydrated
// instance does so afterward, the same "validate, THEN construct, THEN
// verify" order every exchange in this codebase already requires.
export function validateDecentralizedPublication(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new DecentralizedPublicationError('DecentralizedPublication: package is missing or not an object');
    }
    if (pkg.kind !== DECENTRALIZED_PUBLICATION_KIND) {
        throw new DecentralizedPublicationError('DecentralizedPublication: this file is not a ForkBuild decentralized publication');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new DecentralizedPublicationError(`DecentralizedPublication: unsupported schema version ${pkg.schemaVersion}`);
    }
    for (const field of ['id', 'contentKind', 'publishedAt']) {
        if (!isNonEmptyString(pkg[field])) {
            throw new DecentralizedPublicationError(`DecentralizedPublication: ${field} is missing or not a string`);
        }
    }
    if (typeof pkg.contentSchemaVersion !== 'number') {
        throw new DecentralizedPublicationError('DecentralizedPublication: contentSchemaVersion is missing or not a number');
    }
    validateContentReference(pkg.contentReference, 'DecentralizedPublication');
    validatePublisherIdentity(pkg.publisherIdentity, 'DecentralizedPublication');
    validateSignature(pkg.signature, 'DecentralizedPublication');
}
