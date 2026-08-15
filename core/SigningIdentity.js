import { computeContentHash } from '../serializer/contentHash.js';

// Represents a cryptographic identity capable of signing payloads.
// In 0.2.17, we use a mock signature scheme for local testing.
// Future milestones (DID, Web3) will replace the sign/verify implementations.
export class SigningIdentity {
    constructor({ id, username, providerId, publicKey = null, privateKey = null }) {
        this._id = id;
        this._username = username;
        this._providerId = providerId;
        this._publicKey = publicKey || id;
        this._privateKey = privateKey || id;
    }

    get id() { return this._id; }
    get username() { return this._username; }
    get providerId() { return this._providerId; }
    
    toJSON() {
        return {
            id: this._id,
            username: this._username,
            providerId: this._providerId,
            publicKey: this._publicKey
        };
    }
    
    static fromJSON(json) {
        return new SigningIdentity(json);
    }

    async sign(payload) {
        const hash = computeContentHash(payload);
        return {
            signerId: this._id,
            payloadHash: hash,
            signature: `mock-sig-${this._privateKey}-${hash}`
        };
    }

    async verify(payload, signature) {
        const hash = computeContentHash(payload);
        return signature.signerId === this._id && 
               signature.payloadHash === hash &&
               signature.signature === `mock-sig-${this._privateKey}-${hash}`;
    }
}
