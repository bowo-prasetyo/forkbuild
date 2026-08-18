import * as KeyEncryption from './KeyEncryption.js';

// The portable package format for moving a LocalIdentity between devices
// (0.2.48). Answers a question 0.2.46 and 0.2.47 both deliberately left
// open: a LocalIdentity has always been durable, session-gated, and (as
// of 0.2.47) vault-locked — but it has only ever lived on the one device
// that generated its keypair. This module defines the SHAPE that survives
// the trip to a second device; identity/IdentityImport.js validates a
// package built this way, and identity/IdentityRecovery.js turns a valid
// one back into key material.
//
// The central invariant: exporting and importing an identity preserves
// the identity itself, not merely its name. A package therefore carries
// exactly the fields LocalIdentity's own identityId <-> publicKey
// invariant needs to be re-checked on the other side (see LocalIdentity.js
// constructor) plus the ONE thing that can't be re-derived — the private
// key — protected the same way 0.2.47 already protects one at rest:
// identity/KeyEncryption.js's PBKDF2-HMAC-SHA512 + SHA512-CTR +
// HMAC-SHA512 encrypt-then-MAC record. There is no separate "portable
// secret" format; `encryptedPrivateKey` below is a KeyEncryption record,
// verbatim.
//
// label is carried as an unauthoritative HINT only — the exact same
// "local-only presentation metadata, never part of the identity's
// cryptographic identity, never transmitted as an authorization claim"
// LocalIdentity.js already documents. IdentityImport never validates it
// and IdentityRecovery never trusts it for anything but a suggested
// default; the importing device is always free to relabel.
export const CURRENT_FORMAT_VERSION = 1;

// Builds the plain, JSON-safe export package for one LocalIdentity.
// Pure with respect to storage — it knows nothing about StorageProvider
// or LocalIdentityProvider, only the bytes and metadata it's handed;
// identity/LocalIdentityProvider.js's exportLocalIdentity() is what
// resolves an actual identity's seed and calls this. `seedBytes` must
// already be plaintext (decrypted by the caller if the source identity
// is protected) — this function's only job is re-protecting it for
// transit, always, regardless of whether the source was protected at
// rest.
export function buildExportPackage({
    identityId,
    publicKey,
    algorithm = 'Ed25519',
    label = null,
    createdAt,
    seedBytes,
    passphrase,
    iterations
} = {}) {
    if (!identityId || typeof identityId !== 'string') {
        throw new Error('IdentityExport: identityId is required');
    }
    if (!publicKey || typeof publicKey !== 'string') {
        throw new Error('IdentityExport: publicKey is required');
    }
    if (!seedBytes || !seedBytes.length) {
        throw new Error('IdentityExport: seedBytes is required');
    }
    if (!passphrase || typeof passphrase !== 'string' || !passphrase.trim()) {
        throw new Error('IdentityExport: a passphrase is required to protect the exported private key');
    }
    const encryptedPrivateKey = KeyEncryption.encrypt(
        seedBytes,
        passphrase,
        iterations !== undefined ? { iterations } : {}
    );
    return {
        formatVersion: CURRENT_FORMAT_VERSION,
        identityId,
        publicKey,
        algorithm,
        label: label || null,
        encryptedPrivateKey,
        createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()
    };
}
