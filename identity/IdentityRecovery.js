import * as Ed25519 from './Ed25519.js';
import * as KeyEncryption from './KeyEncryption.js';
import * as IdentityImport from './IdentityImport.js';
import { IdentityPackageError } from './IdentityImport.js';

// The actual recovery decision, orchestrated in one place (0.2.48):
//
//   importIdentity(package, passphrase)
//           |
//     validate package        <- identity/IdentityImport.js, no passphrase needed
//           |
//     already on this device? <- duplicate policy, no passphrase needed either
//        |          |
//   ALREADY_EXISTS  no
//                    |
//              decrypt private key   <- identity/KeyEncryption.js, needs passphrase
//                    |
//              derive & check public key
//                    |
//              IMPORTED (caller persists, LOCKED)
//
// Deliberately storage-agnostic: this module never touches a
// StorageProvider or a LocalIdentityProvider's internals, only plain
// data handed to it (a package, a passphrase, the caller's own list of
// existing identities) and plain data handed back. identity/
// LocalIdentityProvider.js's importLocalIdentity() is the only thing
// that turns an IMPORTED result into a persisted, LOCKED identity —
// recoverIdentity() itself never writes anything and never leaves a
// partial identity behind on any failure path, because it has nothing
// to write to in the first place.
//
// Duplicate policy is intentionally NOT "first write wins, second write
// overwrites": an identityId already present on this device is either
// the SAME identity (nothing to do — report it, don't clone it) or,
// defensively, a CONFLICT (refuse outright, never overwrite the key
// already here). In practice a conflict can't arise from two honestly
// generated packages — did:key is a direct, bijective encoding of the
// public key itself, so two different keys can never produce the same
// identityId — but the check costs nothing and guards against a future
// second algorithm, or a hand-edited package, doing something the
// identityId <-> publicKey math alone wouldn't catch.
export class IdentityConflictError extends Error {
    constructor(identityId) {
        super(`IdentityRecovery: identityId ${identityId} already exists on this device with different key material — refusing to overwrite it`);
        this.name = 'IdentityConflictError';
        this.identityId = identityId;
    }
}

function normalizeHex(hex) {
    return typeof hex === 'string' ? hex.toLowerCase() : hex;
}

// existingIdentities: plain entries carrying at least identityId,
// publicKey, algorithm (the shape identity/LocalIdentityProvider.js's
// own _loadIndex() already returns — no LocalIdentity instances
// required).
//
// Returns one of:
//   { status: 'ALREADY_EXISTS', entry }                    — identical identity, no-op
//   { status: 'IMPORTED', identityId, publicKey, algorithm,
//     label, createdAt, seedBytes }                        — new identity, ready to persist
//
// Throws IdentityPackageError (malformed/tampered package, including a
// decrypted key that doesn't match the package's own claimed public
// key), IdentityConflictError (see above), or KeyEncryption's
// IncorrectPassphraseError (wrong passphrase, or a tampered encrypted
// record) — three distinct, never-confused failure reasons, matching
// this codebase's habit of telling refusal reasons apart rather than
// collapsing them into one generic error.
export function recoverIdentity({ package: pkg, passphrase, existingIdentities = [] } = {}) {
    IdentityImport.validatePackage(pkg);

    const existingEntry = existingIdentities.find((entry) => entry.identityId === pkg.identityId);
    if (existingEntry) {
        if (normalizeHex(existingEntry.publicKey) !== normalizeHex(pkg.publicKey) || existingEntry.algorithm !== pkg.algorithm) {
            throw new IdentityConflictError(pkg.identityId);
        }
        return { status: 'ALREADY_EXISTS', entry: existingEntry };
    }

    // Decrypting (and therefore the passphrase itself) is only ever
    // attempted once we know this isn't a no-op — an ALREADY_EXISTS
    // import never has to get the passphrase right at all.
    const seedBytes = KeyEncryption.decrypt(pkg.encryptedPrivateKey, passphrase);

    const derivedPublicKey = Ed25519.bytesToHex(Ed25519.seedToKeyPair(seedBytes).publicKey);
    if (normalizeHex(derivedPublicKey) !== normalizeHex(pkg.publicKey)) {
        throw new IdentityPackageError(
            'IdentityRecovery: the decrypted private key does not match the package\'s declared public key — the package is corrupted or has been tampered with'
        );
    }

    return {
        status: 'IMPORTED',
        identityId: pkg.identityId,
        publicKey: pkg.publicKey,
        algorithm: pkg.algorithm,
        label: pkg.label || null,
        createdAt: pkg.createdAt,
        seedBytes
    };
}
