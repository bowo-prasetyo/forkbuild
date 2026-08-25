import { PUBLICATION_SNAPSHOT_PLACEMENT_KIND, CURRENT_SCHEMA_VERSION } from '../core/PublicationSnapshotPlacement.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// Strict, side-effect-free STRUCTURAL validation of the placement
// envelope ITSELF — the exact same split application/
// PublicationAnchorValidator.js already draws for a PublicationAnchor:
// this module answers ONE question, "is this well-formed as a
// PublicationSnapshotPlacement?", and never touches a verifier, never
// interprets `locator` against any real storage backend, and never
// persists anything.
export class PublicationSnapshotPlacementError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PublicationSnapshotPlacementError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateSignature(signature, prefix) {
    if (!signature || typeof signature !== 'object') {
        throw new PublicationSnapshotPlacementError(`${prefix}.signature is missing or not an object`);
    }
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        if (!isNonEmptyString(signature[field])) {
            throw new PublicationSnapshotPlacementError(`${prefix}.signature.${field} is missing or not a string`);
        }
    }
}

function validatePlacerIdentity(identity, prefix) {
    if (!identity || typeof identity !== 'object') {
        throw new PublicationSnapshotPlacementError(`${prefix}.placerIdentity is missing or not an object`);
    }
    for (const field of ['id', 'algorithm', 'publicKey']) {
        if (!isNonEmptyString(identity[field])) {
            throw new PublicationSnapshotPlacementError(`${prefix}.placerIdentity.${field} is missing or not a string`);
        }
    }
}

// Throws PublicationSnapshotPlacementError describing exactly what's
// wrong; returns nothing on success. Never mutates or normalizes
// `record`, never constructs a PublicationSnapshotPlacement — a caller
// that wants a hydrated instance does so afterward, the same "validate,
// THEN construct, THEN verify" order every exchange in this codebase
// already requires.
export function validatePublicationSnapshotPlacement(record) {
    if (!record || typeof record !== 'object') {
        throw new PublicationSnapshotPlacementError('PublicationSnapshotPlacement: record is missing or not an object');
    }
    if (record.kind !== PUBLICATION_SNAPSHOT_PLACEMENT_KIND) {
        throw new PublicationSnapshotPlacementError('PublicationSnapshotPlacement: this file is not a ForkBuild publication snapshot placement');
    }
    if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new PublicationSnapshotPlacementError(`PublicationSnapshotPlacement: unsupported schema version ${record.schemaVersion}`);
    }
    for (const field of ['id', 'publicationId', 'contentHash', 'storage', 'locator', 'placedAt']) {
        if (!isNonEmptyString(record[field])) {
            throw new PublicationSnapshotPlacementError(`PublicationSnapshotPlacement: ${field} is missing or not a string`);
        }
    }
    validatePlacerIdentity(record.placerIdentity, 'PublicationSnapshotPlacement');
    validateSignature(record.signature, 'PublicationSnapshotPlacement');
}
