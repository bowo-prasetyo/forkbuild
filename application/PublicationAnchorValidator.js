import { PUBLICATION_ANCHOR_KIND, CURRENT_SCHEMA_VERSION } from '../core/PublicationAnchor.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
//
// Strict, side-effect-free STRUCTURAL validation of the anchor envelope
// ITSELF — the exact same split application/
// DecentralizedPublicationValidator.js already draws for a
// DecentralizedPublication: this module answers ONE question, "is this
// well-formed as a PublicationAnchor?", and never touches a verifier,
// never interprets `proof`, and never persists anything.
//
// Interpreting `proof` against whatever external system `anchorType`
// names is deliberately out of scope here — proof shapes vary per
// anchorType and no concrete backend exists yet in 0.8.0 (see
// docs/Roadmap.md). This module only ever checks that `proof`, if
// present, round-trips as a plain JSON-serializable value — never that
// its CONTENTS make sense for any particular anchorType.
export class PublicationAnchorError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PublicationAnchorError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new PublicationAnchorError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new PublicationAnchorError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

function validateAnchorIdentity(identity, prefix) {
    if (!identity || typeof identity !== 'object') {
        throw new PublicationAnchorError(`${prefix}.anchorIdentity is missing or not an object`);
    }
    for (const field of ['id', 'algorithm', 'publicKey']) {
        if (!isNonEmptyString(identity[field])) {
            throw new PublicationAnchorError(`${prefix}.anchorIdentity.${field} is missing or not a string`);
        }
    }
}

// Throws PublicationAnchorError describing exactly what's wrong;
// returns nothing on success. Never mutates or normalizes `record`,
// never constructs a PublicationAnchor — a caller that wants a hydrated
// instance does so afterward, the same "validate, THEN construct, THEN
// verify" order every exchange in this codebase already requires.
export function validatePublicationAnchor(record) {
    if (!record || typeof record !== 'object') {
        throw new PublicationAnchorError('PublicationAnchor: record is missing or not an object');
    }
    if (record.kind !== PUBLICATION_ANCHOR_KIND) {
        throw new PublicationAnchorError('PublicationAnchor: this file is not a ForkBuild publication anchor');
    }
    if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new PublicationAnchorError(`PublicationAnchor: unsupported schema version ${record.schemaVersion}`);
    }
    for (const field of ['id', 'publicationId', 'contentHash', 'anchorType', 'locator', 'anchoredAt']) {
        if (!isNonEmptyString(record[field])) {
            throw new PublicationAnchorError(`PublicationAnchor: ${field} is missing or not a string`);
        }
    }
    if (record.proof !== null && record.proof !== undefined) {
        try {
            JSON.stringify(record.proof);
        } catch (error) {
            throw new PublicationAnchorError('PublicationAnchor: proof is not JSON-serializable');
        }
    }
    validateAnchorIdentity(record.anchorIdentity, 'PublicationAnchor');
    validateSignature(record.signature, 'PublicationAnchor');
}
