import * as Ed25519 from './Ed25519.js';

// A public-key identity (0.2.16).
//
// Deliberately distinct from identity/Identity.js (0.1.21), which is
// the LOGIN identity — username/displayName/providerId, consumed by
// the UI and publishing flows. The two answer different questions:
//
//   Identity        "Which account is using the app?"
//   SigningIdentity "Which key authorized this object?"
//
// LocalIdentityProvider links them: every logged-in user gets an
// Ed25519 keypair, and its SigningIdentity travels with the objects
// that user signs (Publication.publisherIdentity,
// PlacementRecord.ownerIdentity).
//
// Algorithm-neutral by shape; Ed25519 is the first concrete algorithm.
// The id is a did:key — the public key is embedded in the identifier
// itself, which is what later lets a bare signature be verified
// without any external identity store.
export class SigningIdentity {
    constructor({ id, algorithm = 'Ed25519', publicKey, metadata = {} } = {}) {
        if (!id || typeof id !== 'string') {
            throw new Error('SigningIdentity: id is required');
        }
        if (!publicKey || typeof publicKey !== 'string') {
            throw new Error('SigningIdentity: publicKey is required');
        }
        this._id = id;
        this._algorithm = algorithm;
        this._publicKey = publicKey;
        this._metadata = { ...metadata };
    }

    get id() { return this._id; }
    get algorithm() { return this._algorithm; }
    get publicKey() { return this._publicKey; }
    get metadata() { return { ...this._metadata }; }

    toJSON() {
        return {
            id: this._id,
            algorithm: this._algorithm,
            publicKey: this._publicKey,
            metadata: { ...this._metadata }
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object' || !json.id || !json.publicKey) {
            return null;
        }
        return new SigningIdentity(json);
    }

    static fromPublicKeyHex(publicKeyHex, metadata = {}) {
        return new SigningIdentity({
            id: Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKeyHex)),
            algorithm: 'Ed25519',
            publicKey: publicKeyHex,
            metadata
        });
    }
}
