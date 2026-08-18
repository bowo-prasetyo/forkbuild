import * as Ed25519 from './Ed25519.js';

// An identity whose PRIVATE key THIS device currently holds. New in
// 0.2.46 — the missing piece between two identity concepts that already
// existed but were never quite the same thing:
//
//   SigningIdentity  "Which key authorized this object?" — possession of
//                     the private key is neither known nor relevant; it
//                     travels with anything that gets signed, including
//                     replicas received from someone else entirely.
//   LocalIdentity     "Which keys can THIS device actually sign with?" —
//                     always local, always implies possession.
//   Identity          "Which account is the app currently showing?" — a
//                     display label (identity/Identity.js), unchanged
//                     since 0.1.21.
//
// identityId is a did:key, the exact derivation SigningIdentity already
// uses (Ed25519.publicKeyToDidKey) — so a LocalIdentity converts
// losslessly into the SigningIdentity that travels with anything it
// signs; the two are never allowed to disagree about who "it" is.
//
// label is local-only presentation metadata (what LoginModal/Identity
// Switcher shows) — never part of the identity's cryptographic identity,
// and never transmitted as an authorization claim. Two devices, or two
// LocalIdentity entries on the same device, may use the same label; the
// identityId is what actually distinguishes them.
export class LocalIdentity {
    constructor({ identityId, publicKey, algorithm = 'Ed25519', label, createdAt } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('LocalIdentity: identityId is required');
        }
        if (!publicKey || typeof publicKey !== 'string') {
            throw new Error('LocalIdentity: publicKey is required');
        }
        if (!label || typeof label !== 'string' || !label.trim()) {
            throw new Error('LocalIdentity: label is required');
        }
        if (Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKey)) !== identityId) {
            throw new Error('LocalIdentity: identityId does not match publicKey');
        }
        this._identityId = identityId;
        this._publicKey = publicKey;
        this._algorithm = algorithm;
        this._label = label.trim();
        this._createdAt = createdAt ? new Date(createdAt) : new Date();
    }

    get identityId() { return this._identityId; }
    get publicKey() { return this._publicKey; }
    get algorithm() { return this._algorithm; }
    get label() { return this._label; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            label: this._label,
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new LocalIdentity(json);
    }
}
