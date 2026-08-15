import { IdentityProvider } from './IdentityProvider.js';
import { Identity } from './Identity.js';
import { SigningIdentity } from './SigningIdentity.js';
import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
import { computeContentHash } from '../serializer/contentHash.js';
import * as Ed25519 from './Ed25519.js';

const STORAGE_KEY = 'local-identity';
const PROVIDER_ID = 'local';
const SIGNING_KEY_PREFIX = 'local-signing-key:';

// The first concrete IdentityProvider: no wallet, no external service —
// just a username the user types once and this provider remembers, via
// an injected StorageProvider.
//
// New in 0.2.16 — cryptographic signing. Each logged-in user lazily
// gets an Ed25519 keypair, persisted at 'local-signing-key:<username>'
// next to the login identity. getSigningIdentity() exposes the public
// half as a SigningIdentity (did:key id); signCanonical() produces a
// real Signature over the canonical signing envelope.
//
// The legacy sign() attribution stamp remains for non-cryptographic
// consumers; the two surfaces coexist by design. This milestone
// establishes cryptographic SEMANTICS — wallet integration is later
// adapter work around exactly this interface.
export class LocalIdentityProvider extends IdentityProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    login(username) {
        const identity = new Identity({ username, providerId: PROVIDER_ID });
        this._storageProvider.save(STORAGE_KEY, { username });
        return identity;
    }

    logout() {
        this._storageProvider.remove(STORAGE_KEY);
    }

    currentUser() {
        const stored = this._storageProvider.load(STORAGE_KEY);
        if (!stored) {
            return null;
        }
        return new Identity({ username: stored.username, providerId: PROVIDER_ID });
    }

    // Honest about what it is: an attribution stamp, not a proof.
    sign(data) {
        const user = this.currentUser();
        if (!user) {
            throw new Error('LocalIdentityProvider: cannot sign, no user logged in');
        }
        return { signedBy: user.username, providerId: PROVIDER_ID, data };
    }

    // --- 0.2.16 ------------------------------------------------------
    getSigningIdentity() {
        const user = this.currentUser();
        if (!user) {
            throw new Error('LocalIdentityProvider: cannot sign, no user logged in');
        }
        const keyData = this._loadOrCreateKeyPair(user.username);
        return SigningIdentity.fromPublicKeyHex(keyData.publicKey, { username: user.username });
    }

    signCanonical(descriptor) {
        const identity = this.getSigningIdentity();
        const keyData = this._loadOrCreateKeyPair(this.currentUser().username);
        const bytes = Signature.canonicalBytes(descriptor);
        const signatureBytes = Ed25519.sign(
            Ed25519.hexToBytes(keyData.seed),
            Ed25519.utf8ToBytes(bytes)
        );
        return new Signature({
            algorithm: 'Ed25519',
            signer: identity.id,
            signature: Ed25519.bytesToHex(signatureBytes),
            signedHash: computeContentHash(bytes),
            domain: SIGNING_DOMAIN + '/' + descriptor.type,
            signedAt: new Date()
        });
    }

    _loadOrCreateKeyPair(username) {
        const existing = this._storageProvider.load(SIGNING_KEY_PREFIX + username);
        if (existing && existing.seed && existing.publicKey) {
            return existing;
        }
        const seed = Ed25519.randomSeed();
        const { publicKey } = Ed25519.seedToKeyPair(seed);
        const keyData = {
            seed: Ed25519.bytesToHex(seed),
            publicKey: Ed25519.bytesToHex(publicKey),
            algorithm: 'Ed25519',
            createdAt: new Date().toISOString()
        };
        this._storageProvider.save(SIGNING_KEY_PREFIX + username, keyData);
        return keyData;
    }
}
