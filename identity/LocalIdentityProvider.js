import { IdentityProvider } from './IdentityProvider.js';
import { Identity } from './Identity.js';
import { SigningIdentity } from './SigningIdentity.js';
import { LocalIdentity } from './LocalIdentity.js';
import { AuthenticationSession } from './AuthenticationSession.js';
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
export class LocalIdentityProvider extends IdentityProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    // --- 0.2.46: identity lifecycle -----------------------------------
    //
    // Generates a keypair NOW and stores it in the durable index — the
    // design doc's "Identity = f(publicKey)" step, independent of any
    // login flow. Does not authenticate a session by itself; creating an
    // identity and unlocking it are deliberately two different verbs.
    createLocalIdentity(label) {
        if (!label || typeof label !== 'string' || !label.trim()) {
            throw new Error('LocalIdentityProvider: label is required to create a local identity');
        }
        const seed = Ed25519.randomSeed();
        const { publicKey } = Ed25519.seedToKeyPair(seed);
        const publicKeyHex = Ed25519.bytesToHex(publicKey);
        const identityId = Ed25519.publicKeyToDidKey(publicKey);
        const createdAt = new Date().toISOString();

        this._storageProvider.save(IDENTITY_KEY_PREFIX + identityId, {
            seed: Ed25519.bytesToHex(seed),
            publicKey: publicKeyHex,
            algorithm: 'Ed25519',
            createdAt
        });

        const entry = { identityId, publicKey: publicKeyHex, algorithm: 'Ed25519', label: label.trim(), createdAt };
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

    // --- 0.2.46: authentication session --------------------------------
    //
    // "Login," for a decentralized identity: prove (to this device
    // itself) that it holds the private key for identityId, and record
    // that as the active session. There is no server to ask; possessing
    // the key IS the proof. Throws if this device doesn't hold that
    // identity's key — a session can never be authenticated onto an
    // identity this device didn't itself create.
    authenticate(identityId) {
        const identity = this.getLocalIdentity(identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot authenticate, no local identity with id ' + identityId);
        }
        const session = AuthenticationSession.authenticated(identityId, new Date());
        this._storageProvider.save(SESSION_KEY, session.toJSON());
        return session;
    }

    // "Logout": the in-use session ends. The identity and its key are
    // untouched and remain on this device — logging out never deletes
    // or forgets a key, it only stops using one.
    endSession() {
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
    login(username) {
        if (!username || typeof username !== 'string' || !username.trim()) {
            throw new Error('LocalIdentityProvider: username is required to log in');
        }
        const label = username.trim();
        const existing = this._loadIndex().find((entry) => entry.label === label);
        const identity = existing ? LocalIdentity.fromJSON(existing) : this.createLocalIdentity(label);
        this.authenticate(identity.identityId);
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
        const keyData = this._storageProvider.load(IDENTITY_KEY_PREFIX + identity.identityId);
        const bytes = Signature.canonicalBytes(descriptor);
        const signatureBytes = Ed25519.sign(
            Ed25519.hexToBytes(keyData.seed),
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

    _requireAuthenticatedIdentity() {
        const session = this.currentSession();
        if (!session.isAuthenticated) {
            throw new Error('LocalIdentityProvider: cannot sign, no active authentication session');
        }
        const identity = this.getLocalIdentity(session.identityId);
        if (!identity) {
            throw new Error('LocalIdentityProvider: cannot sign, authenticated identity not found on this device');
        }
        return identity;
    }

    _loadIndex() {
        return this._storageProvider.load(IDENTITIES_INDEX_KEY) || [];
    }

    _saveIndex(index) {
        this._storageProvider.save(IDENTITIES_INDEX_KEY, index);
    }
}
