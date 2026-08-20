import { IdentityProvider } from './IdentityProvider.js';
import { Identity } from './Identity.js';
import { SigningIdentity } from './SigningIdentity.js';
import { LocalIdentity } from './LocalIdentity.js';
import { AuthenticationSession } from './AuthenticationSession.js';
import { VaultLock } from './VaultLock.js';
import { FailedUnlockTracker } from './FailedUnlockTracker.js';
import { isVaultExpired, DEFAULT_VAULT_TIMEOUT_MS } from './VaultTimeoutPolicy.js';
import * as KeyEncryption from './KeyEncryption.js';
import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
import { computeContentHash } from '../serializer/contentHash.js';
import * as Ed25519 from './Ed25519.js';
import * as IdentityExport from './IdentityExport.js';
import * as IdentityRecovery from './IdentityRecovery.js';
import { IdentityLifecycleState } from '../core/IdentityLifecycleState.js';
import { toIdentityRevocationRecord, getIdentityRevocationSigningDescriptor } from '../core/IdentityRevocationEnvelope.js';
import { toIdentitySuccessionRecord, getIdentitySuccessionSigningDescriptor } from '../core/IdentitySuccessionEnvelope.js';
import {
    toDeviceAuthorizationGrant,
    getDeviceAuthorizationGrantSigningDescriptor,
    toDeviceAuthorizationRevocation,
    getDeviceAuthorizationRevocationSigningDescriptor
} from '../core/DeviceAuthorizationEnvelope.js';

const IDENTITIES_INDEX_KEY = 'local-identities';
const IDENTITY_KEY_PREFIX = 'local-identity-key:';
const IDENTITY_REVOCATION_PREFIX = 'local-identity-revocation:';
const IDENTITY_SUCCESSION_PREFIX = 'local-identity-succession:';
const DEVICE_AUTHORIZATIONS_PREFIX = 'local-device-authorizations:';
const SESSION_KEY = 'local-session';
const LEGACY_STORAGE_KEY = 'local-identity';
const PROVIDER_ID = 'local';

// The first concrete IdentityProvider: no wallet, no external service.
//
// 0.2.16 gave every logged-in user a lazily-created Ed25519 keypair,
// keyed by the username string they happened to type. That quietly
// conflated two different questions: "which account is the app
// showing?" (a typed label) and "which cryptographic key does this
// device actually hold?" (a fact that should exist independent of any
// label, and should be inspectable on its own).
//
// 0.2.46 makes the second question a first-class, durable concept —
// identity/LocalIdentity.js — and adds the missing third concept, an
// explicit identity/AuthenticationSession.js answering "is one of this
// device's identities currently unlocked?" Every identity this device
// holds is generated up front (`createLocalIdentity`) and persisted in
// a durable index; "logging in" now means AUTHENTICATING an existing
// LocalIdentity (unlocking a key this device already has), never
// deriving a fresh one from whatever string happens to be typed.
// `login(username)`/`logout()`/`currentUser()`/`sign()`/
// `getSigningIdentity()`/`signCanonical()` — the whole 0.1.21/0.2.16
// surface every other use case already calls — keep their exact
// signatures and behavior, now implemented ON TOP of the session model
// instead of beside it: login(label) finds-or-creates a LocalIdentity
// for that label and authenticates it; currentUser() is a pure,
// derived VIEW of the current AuthenticationSession, never a second
// source of truth that could disagree with it.
//
// 0.2.46 named, rather than hid, the gap it deliberately left open: a
// LocalIdentity's private key sat in storage exactly as plainly as
// 0.2.16's ever did. 0.2.47 closes that gap for identities that opt in.
// A FOURTH concept joins the three 0.2.46 established — identity/
// VaultLock.js, "is this identity's private key decrypted in memory
// right now?" A protected identity's key is stored ONLY as
// KeyEncryption's encrypted record (`{seed}` is never written to disk
// for it at all); unlocking it — via `unlock(identityId, passphrase)`
// or by supplying a passphrase to `authenticate()`/`login()` — decrypts
// the seed into a volatile, in-memory-only cache (`_vaultCache`) that a
// page reload cannot recover, on purpose. An unprotected identity (no
// passphrase ever set — including every identity created before 0.2.47
// existed) is trivially always unlocked; nothing about its behavior
// changes. Protecting an existing identity (`protectIdentity`) migrates
// it in place, non-destructively, only when the owner asks — 0.2.47
// never forces a passphrase onto an identity that never had one.
//
// 0.2.47 named, rather than closed, the gap that a LocalIdentity's key
// still only ever existed on the one device that generated it. 0.2.48
// closes that: `exportLocalIdentity(identityId, passphrase)` /
// `importLocalIdentity(package, passphrase, { label })` move an
// identity's PRIVATE key between devices as a protected, versioned
// package (identity/IdentityExport.js, validated on the way back in by
// identity/IdentityImport.js, decrypted and duplicate-checked by
// identity/IdentityRecovery.js) — never a plaintext seed, and never
// silently. An imported identity always lands LOCKED, exactly like any
// other protected identity: import proves this device now HOLDS the
// key, never that it has been authenticated with it.
//
// 0.2.46 through 0.2.48 answered "does this device hold this identity,"
// "is its key currently decrypted," and "can its key move to another
// device" — but never "what happens when the owner wants to change,
// rotate, revoke, or recover it." 0.2.67 closes that: `changePassphrase`
// re-protects an existing protected identity's key under a new
// passphrase without touching the identity itself (same identityId,
// same public key, every existing signature and peer relationship stays
// valid — see docs/Principles.md, "Changing A Passphrase Never Changes
// The Identity"); `declareSuccessor` produces a signed, cryptographically
// verifiable statement that one identity names another as its
// successor, WITHOUT collapsing them into one mutable identity (see
// core/IdentitySuccessionEnvelope.js's own header); `revokeIdentity`
// produces a signed, PERMANENT self-revocation and closes the one gate
// that matters everywhere else in this codebase — `signCanonical()`/
// `getSigningIdentity()` refuse a revoked identity from that point on,
// which is also what stops it from completing any NEW peer/
// PeerAuthenticationSession.js handshake, with zero changes to any file
// under peer/ (see this class's own `_requireAuthenticatedIdentity()`).
// Recovery itself gained no new mechanism: 0.2.48's export/import
// already IS recovery ("regain control of an identity you still have
// the exported package and passphrase for"); 0.2.67 only makes it
// possible, once recovered, to also revoke a compromised original and
// point everyone who still has it at a named successor. See
// docs/Principles.md, "Backup, Recovery, Rotation, And Revocation Are
// Four Different Questions."
//
// 0.2.67 through 0.2.71 each named, and deliberately left open, one
// more question: "is an identity a person, a device, or a key?" 0.2.78
// answers it — see this class's own "0.2.78: device authorization"
// section below. An identity remains exactly one keypair, unchanged. A
// device is not a new kind of identity at all — it is just ANOTHER
// LocalIdentity, wherever it happens to live. `authorizeDevice()`/
// `revokeDeviceAuthorization()` add the one genuinely new concept: a
// signed, revocable AUTHORIZATION LINK from a parent identity to a
// device's key, completely separate from peer/
// PeerAuthenticationSession.js's own handshake (which only ever proves
// possession of A key, never permission to act for a DIFFERENT one) —
// see docs/Principles.md, "Identity Authentication Proves A Key;
// Device Authorization Proves Permission."
export class LocalIdentityProvider extends IdentityProvider {
    constructor(storageProvider, {
        pbkdf2Iterations = KeyEncryption.DEFAULT_ITERATIONS,
        vaultTimeoutMs = DEFAULT_VAULT_TIMEOUT_MS,
        maxUnlockAttempts,
        unlockCooldownMs,
        now = () => new Date()
    } = {}) {
        super();
        this._storageProvider = storageProvider;
        this._pbkdf2Iterations = pbkdf2Iterations;
        this._vaultTimeoutMs = vaultTimeoutMs;
        this._now = now;
        // Decrypted seeds live ONLY here — a plain in-memory Map, never
        // serialized, never touched by _storageProvider. This is the
        // entire reason unlocking a protected identity requires its
        // passphrase again after every page reload: there is nothing on
        // disk that could reconstruct this cache.
        this._vaultCache = new Map();
        this._failedUnlocks = new FailedUnlockTracker({
            ...(maxUnlockAttempts !== undefined ? { maxAttempts: maxUnlockAttempts } : {}),
            ...(unlockCooldownMs !== undefined ? { cooldownMs: unlockCooldownMs } : {}),
            now
        });
    }

    // --- 0.2.46: identity lifecycle -----------------------------------
    //
    // Generates a keypair NOW and stores it in the durable index — the
    // design doc's "Identity = f(publicKey)" step, independent of any
    // login flow. Does not authenticate a session by itself; creating an
    // identity and unlocking it are deliberately two different verbs.
    //
    // 0.2.47: an optional passphrase protects the key from the moment it
    // is created. Passing one means the plaintext seed is NEVER written
    // to storage at all — encrypt() runs before the very first save.
    createLocalIdentity(label, passphrase = null) {
        if (!label || typeof label !== 'string' || !label.trim()) {
            throw new Error('LocalIdentityProvider: label is required to create a local identity');
        }
        const seed = Ed25519.randomSeed();
        const { publicKey } = Ed25519.seedToKeyPair(seed);
        const publicKeyHex = Ed25519.bytesToHex(publicKey);
        const identityId = Ed25519.publicKeyToDidKey(publicKey);
        const createdAt = new Date().toISOString();

        if (passphrase) {
            this._storeProtectedKey(identityId, seed, publicKeyHex, createdAt, passphrase);
        } else {
            this._storageProvider.save(IDENTITY_KEY_PREFIX + identityId, {
                seed: Ed25519.bytesToHex(seed),
                publicKey: publicKeyHex,
                algorithm: 'Ed25519',
                createdAt
            });
        }

        const entry = {
            identityId, publicKey: publicKeyHex, algorithm: 'Ed25519', label: label.trim(), createdAt,
            protected: !!passphrase
        };
        const index = this._loadIndex();
        index.push(entry);
        this._saveIndex(index);

        return LocalIdentity.fromJSON(entry);
    }

    // Every identity whose private key this device currently holds.
    // Never exposes key material — only what LocalIdentity itself does.
    listLocalIdentities() {
        return this._loadIndex().map((entry) => LocalIdentity.fromJSON(entry));
    }

    getLocalIdentity(identityId) {
        const entry = this._loadIndex().find((e) => e.identityId === identityId);
        return entry ? LocalIdentity.fromJSON(entry) : null;
    }

    // --- 0.2.47: key protection -----------------------------------------
    //
    // Migrates an EXISTING unprotected identity to a passphrase-protected
    // one, in place: the plaintext seed is read once, re-written as an
    // encrypted record, and the index is flipped to `protected: true`.
    // Never automatic and never forced — an identity created before
    // 0.2.47 (or created without a passphrase since) stays exactly as
    // unprotected as it always was until its owner explicitly calls this.
    // The newly protected identity starts LOCKED: having the plaintext
    // seed in hand a moment ago to encrypt it does not carry over into
    // "already unlocked."
    protectIdentity(identityId, passphrase) {
        if (!passphrase || typeof passphrase !== 'string' || !passphrase.trim()) {
            throw new Error('LocalIdentityProvider: passphrase is required to protect an identity');
        }
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot protect, no local identity with id ' + identityId);
        }
        if (identity.isProtected) {
            throw new Error('LocalIdentityProvider: identity is already protected');
        }
        const stored = this._storageProvider.load(IDENTITY_KEY_PREFIX + identityId);
        if (!stored || !stored.seed) {
            throw new Error('LocalIdentityProvider: cannot protect, no key material found for this identity');
        }
        this._storeProtectedKey(identityId, Ed25519.hexToBytes(stored.seed), stored.publicKey, stored.createdAt, passphrase);
        this._vaultCache.delete(identityId);

        const index = this._loadIndex();
        const entry = index.find((e) => e.identityId === identityId);
        entry.protected = true;
        this._saveIndex(index);
        return LocalIdentity.fromJSON(entry);
    }

    // Decrypts a protected identity's seed into the volatile in-memory
    // vault cache. A no-op success for an unprotected identity — there is
    // nothing to unlock. Failed-unlock handling: repeated wrong
    // passphrases exhaust FailedUnlockTracker's attempt budget and start
    // a temporary cooldown, checked BEFORE the (expensive, on purpose)
    // KDF even runs.
    unlock(identityId, passphrase) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot unlock, no local identity with id ' + identityId);
        }
        if (!identity.isProtected) {
            return VaultLock.unlocked(identityId, this._now());
        }
        if (this._failedUnlocks.isLockedOut(identityId)) {
            const seconds = Math.ceil(this._failedUnlocks.remainingCooldownMs(identityId) / 1000);
            throw new Error('LocalIdentityProvider: too many failed unlock attempts, try again in ' + seconds + 's');
        }
        const stored = this._storageProvider.load(IDENTITY_KEY_PREFIX + identityId);
        if (!stored || !stored.encryption) {
            throw new Error('LocalIdentityProvider: identity is protected but has no encrypted key material');
        }
        let seedBytes;
        try {
            seedBytes = KeyEncryption.decrypt(stored.encryption, passphrase);
        } catch (e) {
            const remaining = this._failedUnlocks.recordFailure(identityId);
            const suffix = remaining > 0
                ? remaining + ' attempt(s) remaining before a temporary lockout'
                : 'temporarily locked out after too many failed attempts';
            throw new Error('LocalIdentityProvider: incorrect passphrase (' + suffix + ')');
        }
        this._failedUnlocks.recordSuccess(identityId);
        const unlockedAt = this._now();
        this._vaultCache.set(identityId, { seedHex: Ed25519.bytesToHex(seedBytes), unlockedAt });
        return VaultLock.unlocked(identityId, unlockedAt);
    }

    // Evicts the decrypted seed from memory without touching the
    // AuthenticationSession or the identity's key on disk — "lock/unlock
    // without deleting it." A protected identity that is re-authenticated
    // later simply asks for its passphrase again.
    lock(identityId) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot lock, no local identity with id ' + identityId);
        }
        if (!identity.isProtected) {
            throw new Error('LocalIdentityProvider: identity has no passphrase set, there is nothing to lock');
        }
        this._vaultCache.delete(identityId);
        return VaultLock.locked(identityId);
    }

    // The current lock state, computed fresh every call — never a stored
    // boolean. An unprotected identity is always UNLOCKED. A protected
    // identity is UNLOCKED only while its decrypted seed is still in the
    // in-memory cache AND that entry hasn't outlived vaultTimeoutMs; an
    // expired entry is evicted right here, lazily, the same "computed,
    // not stored" discipline the rest of this codebase already applies
    // to lifecycle status and spatial overlap.
    vaultLock(identityId) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            return VaultLock.locked(identityId);
        }
        if (!identity.isProtected) {
            return VaultLock.unlocked(identityId, identity.createdAt);
        }
        const cached = this._vaultCache.get(identityId);
        if (!cached) {
            return VaultLock.locked(identityId);
        }
        if (isVaultExpired(cached.unlockedAt, this._now(), this._vaultTimeoutMs)) {
            this._vaultCache.delete(identityId);
            return VaultLock.locked(identityId);
        }
        return VaultLock.unlocked(identityId, cached.unlockedAt);
    }

    isUnlocked(identityId) {
        return this.vaultLock(identityId).isUnlocked;
    }

    // Proactive idle-expiry sweep: a UI timer calls this periodically so
    // a vault visibly re-locks on its own instead of only APPEARING
    // unlocked until the next sign attempt happens to notice. Returns the
    // identityIds that transitioned to LOCKED this call, so a caller can
    // fire change notifications for exactly those.
    checkVaultTimeouts() {
        return Array.from(this._vaultCache.keys()).filter((identityId) => !this.vaultLock(identityId).isUnlocked);
    }

    _storeProtectedKey(identityId, seedBytes, publicKeyHex, createdAt, passphrase) {
        const encryption = KeyEncryption.encrypt(seedBytes, passphrase, { iterations: this._pbkdf2Iterations });
        this._storageProvider.save(IDENTITY_KEY_PREFIX + identityId, {
            protected: true,
            publicKey: publicKeyHex,
            algorithm: 'Ed25519',
            createdAt,
            encryption
        });
    }

    // --- 0.2.48: portable identity export / import / recovery ----------
    //
    // exportLocalIdentity(identityId, passphrase) builds a self-contained
    // portable package (identity/IdentityExport.js) that identityId's
    // PRIVATE key travels inside, protected under `passphrase` with the
    // exact same KeyEncryption record shape 0.2.47 already uses at rest —
    // there is no separate, second "portable secret" format.
    //
    // `passphrase` plays two roles depending on the source identity, and
    // is deliberately the SAME single value for both, matching how
    // createLocalIdentity/protectIdentity already reuse one passphrase
    // param for more than one role:
    //   - protected identity: the CURRENT unlock passphrase, required to
    //     decrypt the seed from its stored record. This ALWAYS re-reads
    //     and re-decrypts from storage — it never reads the in-memory
    //     _vaultCache, even if the vault is currently unlocked. Exporting
    //     gets its own explicit security boundary: proving you know the
    //     passphrase right now, not merely that you unlocked it earlier
    //     in this session.
    //   - unprotected identity: nothing to decrypt (the seed is already
    //     plaintext on disk) — `passphrase` is simply the NEW passphrase
    //     chosen to protect the exported copy for transit. The package
    //     format doesn't distinguish "was protected at rest" from "was
    //     protected only for export" — both produce an
    //     encryptedPrivateKey a receiving device can only open with the
    //     right passphrase.
    //
    // Never rate-limited the way unlock() is — a wrong passphrase here
    // simply fails the export attempt (KeyEncryption.decrypt's own
    // IncorrectPassphraseError); FailedUnlockTracker guards live
    // signing/authentication, not this one-shot local operation. A real,
    // named gap if export were ever exposed to something other than the
    // identity's own owner acting locally — it isn't, today.
    exportLocalIdentity(identityId, passphrase) {
        if (!passphrase || typeof passphrase !== 'string' || !passphrase.trim()) {
            throw new Error('LocalIdentityProvider: a passphrase is required to export an identity');
        }
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot export, no local identity with id ' + identityId);
        }
        const stored = this._storageProvider.load(IDENTITY_KEY_PREFIX + identityId);
        if (!stored) {
            throw new Error('LocalIdentityProvider: cannot export, no key material found for this identity');
        }
        let seedBytes;
        if (identity.isProtected) {
            if (!stored.encryption) {
                throw new Error('LocalIdentityProvider: identity is protected but has no encrypted key material');
            }
            seedBytes = KeyEncryption.decrypt(stored.encryption, passphrase);
        } else {
            seedBytes = Ed25519.hexToBytes(stored.seed);
        }
        return IdentityExport.buildExportPackage({
            identityId: identity.identityId,
            publicKey: identity.publicKey,
            algorithm: identity.algorithm,
            label: identity.label,
            createdAt: identity.createdAt.toISOString(),
            seedBytes,
            passphrase,
            iterations: this._pbkdf2Iterations
        });
    }

    // importLocalIdentity(package, passphrase, { label }) turns a package
    // exportLocalIdentity produced (on this device or another) back into
    // key material this device holds, via identity/IdentityRecovery.js's
    // validate -> duplicate-check -> decrypt -> verify pipeline.
    //
    // Three, and only three, outcomes:
    //   - malformed/tampered package, or a package whose decrypted key
    //     doesn't match its own claimed public key -> throws
    //     IdentityImport.IdentityPackageError, nothing persisted.
    //   - wrong passphrase (or a tampered encrypted record) -> throws
    //     KeyEncryption.IncorrectPassphraseError, nothing persisted.
    //   - identityId already present on this device with DIFFERENT key
    //     material -> throws IdentityRecovery.IdentityConflictError,
    //     existing identity untouched, nothing new persisted. (See
    //     IdentityRecovery.js: this is currently unreachable by any
    //     honestly-generated package, kept as a defensive floor.)
    //   - identityId already present with the SAME key material ->
    //     returns { status: 'ALREADY_EXISTS', identity }, a pure no-op —
    //     never creates a second copy, never touches the existing entry,
    //     and notably never even requires the passphrase to be correct.
    //   - genuinely new identity -> decrypts, verifies, and persists it
    //     as a NEW protected identity (`protected: true` always, even if
    //     the source was unprotected on its origin device — the only
    //     secret this device ever had was the decrypted seed plus the
    //     import passphrase, so that passphrase is what protects it
    //     here), returns { status: 'IMPORTED', identity }. The imported
    //     identity is never authenticated and never added to the vault
    //     cache by this call — it starts, and stays, LOCKED until its
    //     owner explicitly unlocks it, exactly like any other protected
    //     identity created by protectIdentity() or createLocalIdentity()
    //     with a passphrase.
    //
    // `label` overrides the package's own (untrusted, presentation-only)
    // label hint; if neither is provided, falls back to a generic
    // placeholder rather than silently importing an unlabeled identity.
    importLocalIdentity(pkg, passphrase, { label } = {}) {
        const existingIndex = this._loadIndex();
        const result = IdentityRecovery.recoverIdentity({
            package: pkg,
            passphrase,
            existingIdentities: existingIndex
        });

        if (result.status === 'ALREADY_EXISTS') {
            return { status: 'ALREADY_EXISTS', identity: LocalIdentity.fromJSON(result.entry) };
        }

        const finalLabel = (label && label.trim()) || (result.label && result.label.trim()) || 'Imported Identity';
        const entry = {
            identityId: result.identityId,
            publicKey: result.publicKey,
            algorithm: result.algorithm,
            label: finalLabel,
            createdAt: result.createdAt,
            protected: true
        };
        this._storeProtectedKey(entry.identityId, result.seedBytes, entry.publicKey, entry.createdAt, passphrase);
        existingIndex.push(entry);
        this._saveIndex(existingIndex);
        return { status: 'IMPORTED', identity: LocalIdentity.fromJSON(entry) };
    }

    // --- 0.2.67: identity lifecycle hardening ---------------------------
    //
    // Re-protects an EXISTING protected identity's key under a new
    // passphrase, in place: decrypts with the current passphrase,
    // re-encrypts under the new one with a fresh salt/nonce (identity/
    // KeyEncryption.js's encrypt() always generates both fresh — see
    // its own header), and overwrites the stored record. The identity
    // itself is completely untouched — same identityId, same publicKey,
    // same label, same createdAt — because a passphrase protects the
    // KEY, never the identity's cryptographic identity itself (see
    // docs/Principles.md, "Changing A Passphrase Never Changes The
    // Identity"). Every existing signature this identity ever produced
    // stays exactly as valid as it always was; no peer relationship,
    // friendship, or placement needs to know anything happened. Subject
    // to the same failed-attempt cooldown unlock() already enforces —
    // repeatedly guessing the CURRENT passphrase to change it is exactly
    // as much an offline-attacker risk as repeatedly guessing it to
    // unlock. Always evicts the vault cache afterward, exactly like
    // protectIdentity() — the identity starts LOCKED under its new
    // passphrase, never silently carrying over "already unlocked" from a
    // passphrase that no longer applies. Requires the identity to
    // already be protected; use protectIdentity() to add a passphrase to
    // one that never had one.
    changePassphrase(identityId, oldPassphrase, newPassphrase) {
        if (!oldPassphrase || typeof oldPassphrase !== 'string') {
            throw new Error('LocalIdentityProvider: the current passphrase is required to change it');
        }
        if (!newPassphrase || typeof newPassphrase !== 'string' || !newPassphrase.trim()) {
            throw new Error('LocalIdentityProvider: a new passphrase is required');
        }
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot change passphrase, no local identity with id ' + identityId);
        }
        if (!identity.isProtected) {
            throw new Error('LocalIdentityProvider: identity has no passphrase set — use protectIdentity to add one');
        }
        if (this._failedUnlocks.isLockedOut(identityId)) {
            const seconds = Math.ceil(this._failedUnlocks.remainingCooldownMs(identityId) / 1000);
            throw new Error('LocalIdentityProvider: too many failed unlock attempts, try again in ' + seconds + 's');
        }
        const stored = this._storageProvider.load(IDENTITY_KEY_PREFIX + identityId);
        if (!stored || !stored.encryption) {
            throw new Error('LocalIdentityProvider: identity is protected but has no encrypted key material');
        }
        let seedBytes;
        try {
            seedBytes = KeyEncryption.decrypt(stored.encryption, oldPassphrase);
        } catch (e) {
            this._failedUnlocks.recordFailure(identityId);
            throw new Error('LocalIdentityProvider: incorrect current passphrase');
        }
        this._failedUnlocks.recordSuccess(identityId);
        this._storeProtectedKey(identityId, seedBytes, stored.publicKey, stored.createdAt, newPassphrase);
        this._vaultCache.delete(identityId);
        return this.getLocalIdentity(identityId);
    }

    // Produces a signed, cryptographically verifiable statement that
    // identityId (the predecessor, whose key this device must be able to
    // unlock) names successorIdentityId as its successor — see core/
    // IdentitySuccessionEnvelope.js for exactly what this does and does
    // not mean. Deliberately does NOT require this device to hold the
    // successor's key at all: successorIdentityId only needs to be a
    // structurally valid did:key (its public key is recovered from the
    // did:key itself — see identity/Ed25519.js#didKeyToPublicKey), so
    // Alice can name a successor she generated on a brand-new device she
    // hasn't even finished setting up yet, as long as she already knows
    // its public identity. Purely declarative: the predecessor identity
    // is NOT revoked by this call — see revokeIdentity()'s own
    // `successorIdentityId` option for the one-call "rotate and revoke
    // together" path, and docs/Principles.md, "Declaring A Successor
    // Does Not Revoke The Predecessor."
    declareSuccessor(identityId, successorIdentityId, { passphrase = null } = {}) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot declare a successor, no local identity with id ' + identityId);
        }
        const record = this._signSuccession(identity, successorIdentityId, passphrase);
        const index = this._loadIndex();
        const entry = index.find((e) => e.identityId === identityId);
        entry.successorIdentityId = successorIdentityId;
        this._saveIndex(index);
        return record;
    }

    // Produces a signed, PERMANENT self-revocation of identityId (this
    // device must be able to unlock identityId's own key — see this
    // file's own header on why revocation can only ever be self-
    // attested) and durably flips its lifecycleState to REVOKED. From
    // this point on, signCanonical()/getSigningIdentity() refuse this
    // identity outright (see _requireAuthenticatedIdentity() below) —
    // which is also, with zero changes to any file under peer/, what
    // makes it impossible for this identity to complete any NEW peer/
    // PeerAuthenticationSession.js handshake ever again, because that
    // handshake's PROOF step has no other way to produce a signature
    // than calling straight through this same gate.
    //
    // Deliberately, explicitly does NOT retroact onto anything already
    // established before revocation — an already-AUTHENTICATED
    // peer/PeerIdentity.js on some live connection elsewhere is not
    // torn down, because peer connections have been fully ephemeral,
    // re-proved from nothing on every reconnect, since 0.2.49; there is
    // no persistent peer-trust ledger anywhere in this codebase for a
    // revocation to even reach into. See docs/Principles.md, "Revocation
    // Prevents New Trust; It Does Not Retroactively Revoke Old Trust."
    //
    // Also, deliberately, does NOT end the AuthenticationSession or
    // evict the vault beyond this one call's own forced re-lock (see
    // below) — an identity can be REVOKED and still AUTHENTICATED, so
    // its owner can keep inspecting it (read its own revocation record,
    // export it one final time) without the app abruptly logging them
    // out. Always evicts the vault cache once the revocation itself is
    // produced, though: a revoked identity should never keep sitting
    // decrypted in memory a moment longer than the one signature it
    // just needed to produce.
    //
    // `successorIdentityId` is optional. When given, this call ALSO
    // produces and stores a signed IdentitySuccessionRecord in the same
    // step (exactly what declareSuccessor() would produce on its own),
    // so the common "I am rotating right now, and the old key stops
    // working right now" gesture is one signed user action, not two.
    revokeIdentity(identityId, { passphrase = null, reason = null, successorIdentityId = null } = {}) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot revoke, no local identity with id ' + identityId);
        }
        if (identity.isRevoked) {
            throw new Error('LocalIdentityProvider: identity is already revoked');
        }
        if (successorIdentityId) {
            this._signSuccession(identity, successorIdentityId, passphrase);
        }
        const seedHex = this._resolveOrUnlockSeedHex(identity, passphrase);
        const revokedAt = new Date().toISOString();
        const record = toIdentityRevocationRecord({
            identityId: identity.identityId,
            publicKey: identity.publicKey,
            algorithm: identity.algorithm,
            reason,
            successorIdentityId,
            revokedAt
        });
        const signedRecord = this._signEnvelope(record, getIdentityRevocationSigningDescriptor(record), identity.identityId, seedHex);
        this._storageProvider.save(IDENTITY_REVOCATION_PREFIX + identityId, signedRecord);

        const index = this._loadIndex();
        const entry = index.find((e) => e.identityId === identityId);
        entry.lifecycleState = IdentityLifecycleState.REVOKED;
        if (successorIdentityId) {
            entry.successorIdentityId = successorIdentityId;
        }
        this._saveIndex(index);
        this._vaultCache.delete(identityId);
        return signedRecord;
    }

    isRevoked(identityId) {
        const identity = this.getLocalIdentity(identityId);
        return Boolean(identity && identity.isRevoked);
    }

    getRevocationRecord(identityId) {
        return this._storageProvider.load(IDENTITY_REVOCATION_PREFIX + identityId) || null;
    }

    getSuccessionRecord(identityId) {
        return this._storageProvider.load(IDENTITY_SUCCESSION_PREFIX + identityId) || null;
    }

    // --- 0.2.78: device authorization ------------------------------------
    //
    // "Is an identity a person, a device, or a key?" — the question
    // 0.2.67 through 0.2.71 each named and deliberately left open (see
    // docs/Roadmap.md). The answer: an identity stays exactly what it
    // has been since 0.2.46 — one keypair. A DEVICE is not a new kind of
    // identity; it is just ANOTHER LocalIdentity, generated wherever it
    // lives, exactly like any identity createLocalIdentity() already
    // produces. What's new is this section: a signed, revocable
    // AUTHORIZATION LINK from a parent identity to a device's key,
    // completely independent of whether this device ever holds the
    // device's own private key at all (identityId only needs to KNOW the
    // device's public identity to authorize it — the same "Alice can
    // name a successor she hasn't finished setting up yet, as long as
    // she already knows its public identity" property declareSuccessor()
    // above already established).
    //
    // authorizeDevice() signs with identityId's OWN key (this device
    // must be able to unlock it — same passphrase discipline as
    // declareSuccessor()/revokeIdentity()), producing a portable,
    // signed core/DeviceAuthorizationEnvelope.js grant record — meant to
    // be handed to the device it names (out of band, exactly like
    // 0.2.48's exported identity package) and/or gossiped to peers who
    // already know identityId (application/
    // DeviceAuthorizationPropagationUseCase.js). Calling it again for a
    // device identityId already authorized simply re-signs a fresh grant
    // (a later authorizedAt), which is also how a previously revoked
    // device is re-authorized — see core/DeviceAuthorizationEnvelope.js's
    // own header on why that's a deliberate, safe difference from
    // identity revocation's own permanent, one-way latch.
    authorizeDevice(identityId, deviceIdentityId, devicePublicKey, { deviceLabel = null, passphrase = null } = {}) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot authorize a device, no local identity with id ' + identityId);
        }
        if (!deviceIdentityId || typeof deviceIdentityId !== 'string') {
            throw new Error('LocalIdentityProvider: deviceIdentityId is required to authorize a device');
        }
        if (deviceIdentityId === identityId) {
            throw new Error('LocalIdentityProvider: an identity cannot authorize itself as its own device');
        }
        const devicePublicKeyBytes = Ed25519.didKeyToPublicKey(deviceIdentityId);
        if (!devicePublicKeyBytes || Ed25519.bytesToHex(devicePublicKeyBytes) !== devicePublicKey) {
            throw new Error('LocalIdentityProvider: deviceIdentityId does not match devicePublicKey');
        }
        const seedHex = this._resolveOrUnlockSeedHex(identity, passphrase);
        const record = toDeviceAuthorizationGrant({
            identityId: identity.identityId,
            deviceIdentityId,
            devicePublicKey,
            deviceLabel,
            authorizedAt: new Date().toISOString()
        });
        const signedRecord = this._signEnvelope(record, getDeviceAuthorizationGrantSigningDescriptor(record), identity.identityId, seedHex);
        const authorizations = this._loadDeviceAuthorizations(identityId);
        const existing = authorizations.find((entry) => entry.deviceIdentityId === deviceIdentityId);
        if (existing) {
            existing.grant = signedRecord;
        } else {
            authorizations.push({ deviceIdentityId, grant: signedRecord, revocation: null });
        }
        this._saveDeviceAuthorizations(identityId, authorizations);
        return signedRecord;
    }

    // Withdraws a grant already made above — identityId must again be
    // able to unlock its own key (revocation, like authorization, is
    // only ever self-attested by the PARENT, never by the device or by
    // anyone else — see core/DeviceAuthorizationEnvelope.js's own
    // header). Refuses a device that was never authorized in the first
    // place; revoking an already-revoked device is a no-op that simply
    // re-signs a fresher revocation timestamp.
    revokeDeviceAuthorization(identityId, deviceIdentityId, { passphrase = null } = {}) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot revoke a device authorization, no local identity with id ' + identityId);
        }
        const authorizations = this._loadDeviceAuthorizations(identityId);
        const existing = authorizations.find((entry) => entry.deviceIdentityId === deviceIdentityId);
        if (!existing) {
            throw new Error('LocalIdentityProvider: no device authorization on file for ' + deviceIdentityId);
        }
        const seedHex = this._resolveOrUnlockSeedHex(identity, passphrase);
        const record = toDeviceAuthorizationRevocation({
            identityId: identity.identityId,
            deviceIdentityId,
            revokedAt: new Date().toISOString()
        });
        const signedRecord = this._signEnvelope(record, getDeviceAuthorizationRevocationSigningDescriptor(record), identity.identityId, seedHex);
        existing.revocation = signedRecord;
        this._saveDeviceAuthorizations(identityId, authorizations);
        return signedRecord;
    }

    // Every device identityId has ever authorized, most-recently-updated
    // first — never exposes anything beyond what the signed grant/
    // revocation records themselves already carry.
    listDeviceAuthorizations(identityId) {
        return this._loadDeviceAuthorizations(identityId)
            .map((entry) => this._toDeviceAuthorizationView(entry))
            .sort((a, b) => new Date(b.grant.authorizedAt).getTime() - new Date(a.grant.authorizedAt).getTime());
    }

    getDeviceAuthorization(identityId, deviceIdentityId) {
        const entry = this._loadDeviceAuthorizations(identityId).find((e) => e.deviceIdentityId === deviceIdentityId);
        return entry ? this._toDeviceAuthorizationView(entry) : null;
    }

    // Authorized RIGHT NOW: a grant is on file, it is not superseded by
    // a later revocation (see core/DeviceAuthority.js's own timestamp-
    // comparison rule, mirrored here for the LOCAL/authoring side), and
    // the parent identity itself has not been revoked — an identity
    // that can no longer sign anything (see _requireAuthenticatedIdentity()
    // below) can no longer vouch for any of its devices either.
    isDeviceAuthorized(identityId, deviceIdentityId) {
        if (this.isRevoked(identityId)) {
            return false;
        }
        const view = this.getDeviceAuthorization(identityId, deviceIdentityId);
        return Boolean(view && view.isAuthorized);
    }

    _toDeviceAuthorizationView(entry) {
        const isAuthorized = Boolean(entry.grant) && (!entry.revocation
            || new Date(entry.grant.authorizedAt).getTime() > new Date(entry.revocation.revokedAt).getTime());
        return {
            deviceIdentityId: entry.deviceIdentityId,
            devicePublicKey: entry.grant.devicePublicKey,
            deviceLabel: entry.grant.deviceLabel,
            grant: entry.grant,
            revocation: entry.revocation,
            isAuthorized
        };
    }

    _loadDeviceAuthorizations(identityId) {
        return this._storageProvider.load(DEVICE_AUTHORIZATIONS_PREFIX + identityId) || [];
    }

    _saveDeviceAuthorizations(identityId, authorizations) {
        this._storageProvider.save(DEVICE_AUTHORIZATIONS_PREFIX + identityId, authorizations);
    }

    // Shared by declareSuccessor() and revokeIdentity()'s own optional
    // successorIdentityId path, so naming a successor is signed and
    // stored identically no matter which call produced it.
    _signSuccession(predecessorIdentity, successorIdentityId, passphrase) {
        if (!successorIdentityId || typeof successorIdentityId !== 'string') {
            throw new Error('LocalIdentityProvider: successorIdentityId is required to declare a successor');
        }
        if (successorIdentityId === predecessorIdentity.identityId) {
            throw new Error('LocalIdentityProvider: an identity cannot be its own successor');
        }
        const successorPublicKeyBytes = Ed25519.didKeyToPublicKey(successorIdentityId);
        if (!successorPublicKeyBytes) {
            throw new Error('LocalIdentityProvider: successorIdentityId is not a valid did:key');
        }
        const seedHex = this._resolveOrUnlockSeedHex(predecessorIdentity, passphrase);
        const record = toIdentitySuccessionRecord({
            predecessorIdentityId: predecessorIdentity.identityId,
            predecessorPublicKey: predecessorIdentity.publicKey,
            successorIdentityId,
            successorPublicKey: Ed25519.bytesToHex(successorPublicKeyBytes),
            declaredAt: new Date().toISOString()
        });
        const signedRecord = this._signEnvelope(
            record, getIdentitySuccessionSigningDescriptor(record), predecessorIdentity.identityId, seedHex
        );
        this._storageProvider.save(IDENTITY_SUCCESSION_PREFIX + predecessorIdentity.identityId, signedRecord);
        return signedRecord;
    }

    // identityId + an explicit passphrase is the security boundary for
    // every lifecycle-mutating operation in this section, matching
    // exportLocalIdentity()'s own stance: a protected identity that
    // isn't already unlocked needs its passphrase supplied right here,
    // an already-unlocked one (or one being acted on within its own
    // vault timeout) does not, and an unprotected one never did.
    _resolveOrUnlockSeedHex(identity, passphrase) {
        if (identity.isProtected && !this.isUnlocked(identity.identityId)) {
            if (!passphrase) {
                throw new Error('LocalIdentityProvider: this identity is protected, a passphrase is required');
            }
            this.unlock(identity.identityId, passphrase);
        }
        return this._resolveSeedHex(identity.identityId);
    }

    // Signs an arbitrary lifecycle record with identityId's own key and
    // attaches the resulting Signature, exactly the same canonical-
    // envelope-then-Ed25519 construction signCanonical() below uses for
    // ordinary content signing — but callable for ANY local identity
    // this device holds, never only the currently-AUTHENTICATED one,
    // because revoking or declaring a successor for an identity should
    // never require first making that identity the app's active login.
    _signEnvelope(record, descriptor, signerIdentityId, seedHex) {
        const bytes = Signature.canonicalBytes(descriptor);
        const signatureBytes = Ed25519.sign(Ed25519.hexToBytes(seedHex), Ed25519.utf8ToBytes(bytes));
        const signature = new Signature({
            algorithm: 'Ed25519',
            signer: signerIdentityId,
            signature: Ed25519.bytesToHex(signatureBytes),
            signedHash: computeContentHash(bytes),
            domain: SIGNING_DOMAIN + '/' + descriptor.type,
            signedAt: new Date()
        });
        return { ...record, signature: signature.toJSON() };
    }

    // --- 0.2.46: authentication session --------------------------------
    //
    // "Login," for a decentralized identity: prove (to this device
    // itself) that it holds the private key for identityId, and record
    // that as the active session. There is no server to ask; possessing
    // the key IS the proof. Throws if this device doesn't hold that
    // identity's key — a session can never be authenticated onto an
    // identity this device didn't itself create.
    //
    // 0.2.47: a protected identity that isn't already unlocked requires
    // its passphrase here — authenticating onto a locked vault unlocks it
    // as part of the same call, rather than making every caller perform
    // unlock() and authenticate() as two separate steps for the common
    // "log in" gesture. An already-unlocked protected identity (or one
    // being re-authenticated within its own vault timeout) needs none.
    authenticate(identityId, passphrase = null) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot authenticate, no local identity with id ' + identityId);
        }
        if (identity.isProtected && !this.isUnlocked(identityId)) {
            if (!passphrase) {
                throw new Error('LocalIdentityProvider: this identity is protected, a passphrase is required to authenticate');
            }
            this.unlock(identityId, passphrase);
        }
        const session = AuthenticationSession.authenticated(identityId, this._now());
        this._storageProvider.save(SESSION_KEY, session.toJSON());
        return session;
    }

    // "Logout": the in-use session ends. The identity and its key are
    // untouched and remain on this device — logging out never deletes
    // or forgets a key, it only stops using one. Also evicts that
    // identity's decrypted seed from the vault cache, if it had one: no
    // session should ever leave a protected identity's key sitting
    // unlocked in memory with nothing authenticated onto it.
    endSession() {
        const session = this.currentSession();
        if (session.isAuthenticated) {
            this._vaultCache.delete(session.identityId);
        }
        this._storageProvider.remove(SESSION_KEY);
    }

    currentSession() {
        const stored = this._storageProvider.load(SESSION_KEY);
        return stored ? AuthenticationSession.fromJSON(stored) : AuthenticationSession.anonymous();
    }

    isAuthenticated() {
        return this.currentSession().isAuthenticated;
    }

    // --- 0.1.21 surface, unchanged in shape -----------------------------
    //
    // login(label) finds an existing LocalIdentity carrying this label
    // (so the same typed name keeps resolving to the same key on this
    // device, exactly as 0.2.16 already guaranteed) or creates one, then
    // authenticates it. Kept for every existing caller — application/
    // use cases and tests alike — that only ever calls login(username).
    // The optional passphrase (0.2.47) flows straight through to
    // createLocalIdentity()/authenticate(): every pre-0.2.47 caller
    // passes none and sees no change in behavior whatsoever.
    login(username, passphrase = null) {
        if (!username || typeof username !== 'string' || !username.trim()) {
            throw new Error('LocalIdentityProvider: username is required to log in');
        }
        const label = username.trim();
        const existing = this._loadIndex().find((entry) => entry.label === label);
        const identity = existing ? LocalIdentity.fromJSON(existing) : this.createLocalIdentity(label, passphrase);
        this.authenticate(identity.identityId, passphrase);
        this._storageProvider.remove(LEGACY_STORAGE_KEY);
        return new Identity({ username: label, providerId: PROVIDER_ID });
    }

    logout() {
        this.endSession();
        this._storageProvider.remove(LEGACY_STORAGE_KEY);
    }

    // A pure, derived view of the current AuthenticationSession — never
    // a second stored fact that session state could drift away from.
    currentUser() {
        const session = this.currentSession();
        if (!session.isAuthenticated) {
            return null;
        }
        const identity = this.getLocalIdentity(session.identityId);
        if (!identity) {
            return null;
        }
        return new Identity({ username: identity.label, providerId: PROVIDER_ID });
    }

    // Honest about what it is: an attribution stamp, not a proof.
    sign(data) {
        const user = this.currentUser();
        if (!user) {
            throw new Error('LocalIdentityProvider: cannot sign, no user logged in');
        }
        return { signedBy: user.username, providerId: PROVIDER_ID, data };
    }

    // --- 0.2.16 cryptographic signing surface, now session-gated -------
    getSigningIdentity() {
        const identity = this._requireAuthenticatedIdentity();
        return SigningIdentity.fromPublicKeyHex(identity.publicKey, { username: identity.label });
    }

    signCanonical(descriptor) {
        const identity = this._requireAuthenticatedIdentity();
        const seedHex = this._resolveSeedHex(identity.identityId);
        const bytes = Signature.canonicalBytes(descriptor);
        const signatureBytes = Ed25519.sign(
            Ed25519.hexToBytes(seedHex),
            Ed25519.utf8ToBytes(bytes)
        );
        return new Signature({
            algorithm: 'Ed25519',
            signer: SigningIdentity.fromPublicKeyHex(identity.publicKey, { username: identity.label }).id,
            signature: Ed25519.bytesToHex(signatureBytes),
            signedHash: computeContentHash(bytes),
            domain: SIGNING_DOMAIN + '/' + descriptor.type,
            signedAt: new Date()
        });
    }

    // 0.2.47: "no active authentication session" and "identity is locked"
    // are DIFFERENT reasons signing can be refused, and this is where
    // they're told apart — checked in this order because a locked vault
    // is only a meaningful question once we know an identity is even the
    // one currently authenticated. An unprotected identity never hits
    // the second check at all; isUnlocked() is unconditionally true for
    // it.
    //
    // 0.2.67 adds a THIRD reason, checked between the two: "identity has
    // been revoked" — deliberately before the vault-lock check, since a
    // revoked identity is refused regardless of whether it happens to be
    // unlocked. This is the ONE gate identity/LocalIdentityProvider.js
    // enforces for revocation — see revokeIdentity()'s own header for
    // why nothing under peer/ needed to change for a revoked identity to
    // also lose the ability to complete a NEW peer authentication
    // handshake: peer/PeerAuthenticationSession.js's PROOF step has no
    // path to a signature that doesn't run through here. Note this
    // check is about SIGNING, not about being logged in — currentSession()/
    // currentUser() stay completely unaffected by revocation (see docs/
    // Principles.md, "Revocation Is A Signing Gate, Not A Session Gate").
    _requireAuthenticatedIdentity() {
        const session = this.currentSession();
        if (!session.isAuthenticated) {
            throw new Error('LocalIdentityProvider: cannot sign, no active authentication session');
        }
        const identity = this.getLocalIdentity(session.identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot sign, authenticated identity not found on this device');
        }
        if (identity.isRevoked) {
            throw new Error('LocalIdentityProvider: cannot sign, identity has been revoked');
        }
        if (!this.isUnlocked(identity.identityId)) {
            throw new Error('LocalIdentityProvider: cannot sign, identity is locked — unlock it with its passphrase first');
        }
        return identity;
    }

    // Unprotected: the plaintext seed is always right there in storage.
    // Protected: only ever available from the volatile vault cache, and
    // only once _requireAuthenticatedIdentity() has already confirmed the
    // vault is unlocked — this never reads or reconstructs a seed from
    // the encrypted record itself.
    _resolveSeedHex(identityId) {
        const cached = this._vaultCache.get(identityId);
        if (cached) {
            return cached.seedHex;
        }
        const stored = this._storageProvider.load(IDENTITY_KEY_PREFIX + identityId);
        if (!stored || !stored.seed) {
            throw new Error('LocalIdentityProvider: cannot sign, no accessible key material for this identity');
        }
        return stored.seed;
    }

    _loadIndex() {
        return this._storageProvider.load(IDENTITIES_INDEX_KEY) || [];
    }

    _saveIndex(index) {
        this._storageProvider.save(IDENTITIES_INDEX_KEY, index);
    }
}
