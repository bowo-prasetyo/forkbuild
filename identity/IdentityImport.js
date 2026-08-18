import * as Ed25519 from './Ed25519.js';
import { CURRENT_FORMAT_VERSION } from './IdentityExport.js';

// Strict, side-effect-free validation of a portable identity package
// (0.2.48), deliberately kept separate from identity/IdentityRecovery.js:
// this module answers ONE question — "is this package well-formed and
// internally consistent?" — and never touches a passphrase, a
// StorageProvider, or a LocalIdentityProvider. Malformed input fails
// HERE, before anything is decrypted or persisted, so a corrupted/
// tampered/incomplete package can never leave a partially-created
// identity behind — there is nothing to roll back because nothing was
// ever attempted.
//
// What "strictly validates" means concretely: format version, every
// required field present with the right type/shape, the encrypted-key
// record's own shape (the same fields identity/KeyEncryption.js's
// encrypt() produces), and — the one check that needs actual
// cryptography, not just shape — that identityId is the exact did:key
// derivation of publicKey, the identical invariant identity/
// LocalIdentity.js's constructor already enforces for a live identity.
// That check catches a tampered or corrupted package immediately,
// without needing the passphrase at all: identityId <-> publicKey
// consistency is public information, checkable before anyone proves
// they hold the private key.
export class IdentityPackageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IdentityPackageError';
    }
}

const SUPPORTED_ALGORITHMS = ['Ed25519'];
const HEX_PATTERN = /^[0-9a-f]+$/i;
const PUBLIC_KEY_HEX_LENGTH = 64; // 32 raw bytes

function isNonEmptyHex(value) {
    return typeof value === 'string' && value.length > 0 && HEX_PATTERN.test(value);
}

function validateEncryptedPrivateKey(record) {
    if (!record || typeof record !== 'object') {
        throw new IdentityPackageError('IdentityImport: encryptedPrivateKey is missing or not an object');
    }
    for (const field of ['salt', 'nonce', 'ciphertext', 'tag']) {
        if (!isNonEmptyHex(record[field])) {
            throw new IdentityPackageError(`IdentityImport: encryptedPrivateKey.${field} is missing or not valid hex`);
        }
    }
    if (typeof record.kdf !== 'string' || !record.kdf) {
        throw new IdentityPackageError('IdentityImport: encryptedPrivateKey.kdf is missing');
    }
    if (!Number.isInteger(record.iterations) || record.iterations <= 0) {
        throw new IdentityPackageError('IdentityImport: encryptedPrivateKey.iterations must be a positive integer');
    }
}

// Throws IdentityPackageError describing exactly what's wrong; returns
// nothing on success. Never mutates or normalizes `pkg` — a caller that
// wants a normalized copy does so itself, after validation passes.
export function validatePackage(pkg) {
    if (!pkg || typeof pkg !== 'object') {
        throw new IdentityPackageError('IdentityImport: package is missing or not an object');
    }
    if (pkg.formatVersion !== CURRENT_FORMAT_VERSION) {
        throw new IdentityPackageError(`IdentityImport: unsupported format version ${pkg.formatVersion}`);
    }
    if (typeof pkg.identityId !== 'string' || !pkg.identityId.startsWith('did:key:z')) {
        throw new IdentityPackageError('IdentityImport: identityId is missing or not a valid did:key');
    }
    if (!isNonEmptyHex(pkg.publicKey) || pkg.publicKey.length !== PUBLIC_KEY_HEX_LENGTH) {
        throw new IdentityPackageError('IdentityImport: publicKey is missing or not valid 32-byte hex');
    }
    if (typeof pkg.algorithm !== 'string' || !SUPPORTED_ALGORITHMS.includes(pkg.algorithm)) {
        throw new IdentityPackageError(`IdentityImport: unsupported or missing algorithm ${pkg.algorithm}`);
    }
    if (!pkg.createdAt || Number.isNaN(new Date(pkg.createdAt).getTime())) {
        throw new IdentityPackageError('IdentityImport: createdAt is missing or not a valid date');
    }
    if (pkg.label !== undefined && pkg.label !== null && typeof pkg.label !== 'string') {
        throw new IdentityPackageError('IdentityImport: label, if present, must be a string');
    }
    validateEncryptedPrivateKey(pkg.encryptedPrivateKey);

    const publicKeyBytes = Ed25519.hexToBytes(pkg.publicKey);
    if (Ed25519.publicKeyToDidKey(publicKeyBytes) !== pkg.identityId) {
        throw new IdentityPackageError(
            'IdentityImport: identityId does not match publicKey — the package is corrupted or has been tampered with'
        );
    }
}
