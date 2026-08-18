import * as Ed25519 from '../identity/Ed25519.js';

// Pure data (0.2.49): the cryptographic identity a remote peer has
// PROVEN it controls, via peer/PeerAuthenticationSession.js's
// handshake. Deliberately distinct from every other identity concept
// this codebase already has:
//
//   Identity        "Which account is using the app?" (identity/
//                    Identity.js, 0.1.21 — a display label.)
//   SigningIdentity "Which key authorized this OBJECT?" (identity/
//                    SigningIdentity.js, 0.2.16 — travels with signed
//                    content, possession neither known nor relevant.)
//   LocalIdentity   "Which keys can THIS device sign with?" (identity/
//                    LocalIdentity.js, 0.2.46 — always local, always
//                    implies possession.)
//   PeerIdentity    "Which key does the OTHER end of THIS connection
//                    currently, provably, control?" — always remote,
//                    always scoped to one live PeerConnection, and
//                    gone the moment that connection closes (see
//                    peer/PeerAuthenticationSession.js's own header).
//                    Never persisted, never a "friend," never anything
//                    beyond what this one handshake proved.
//
// Structurally identical to LocalIdentity's own identityId/publicKey
// invariant — the did:key IS the public key, so a PeerIdentity can
// never claim an identityId that doesn't match the key it also
// carries — but this class carries no `label` (a remote peer's local
// nickname, if one ever exists, is a UI/social-layer concern this
// milestone deliberately does not add — see docs/Roadmap.md, "No
// persistent peer trust yet") and no `createdAt` (this device did not
// create this key and has no idea when it was).
export class PeerIdentity {
    constructor({ identityId, publicKey, algorithm = 'Ed25519' } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('PeerIdentity: identityId is required');
        }
        if (!publicKey || typeof publicKey !== 'string') {
            throw new Error('PeerIdentity: publicKey is required');
        }
        if (Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKey)) !== identityId) {
            throw new Error('PeerIdentity: identityId does not match publicKey');
        }
        this._identityId = identityId;
        this._publicKey = publicKey;
        this._algorithm = algorithm;
    }

    get identityId() { return this._identityId; }
    get publicKey() { return this._publicKey; }
    get algorithm() { return this._algorithm; }

    toJSON() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new PeerIdentity(json);
    }
}
