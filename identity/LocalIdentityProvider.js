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

const IDENTITIES_INDEX_KEY = 'local-identities';
const IDENTITY_KEY_PREFIX = 'local-identity-key:';
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
    _requireAuthenticatedIdentity() {
        const session = this.currentSession();
        if (!session.isAuthenticated) {
            throw new Error('LocalIdentityProvider: cannot sign, no active authentication session');
        }
        const identity = this.getLocalIdentity(session.identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot sign, authenticated identity not found on this device');
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
