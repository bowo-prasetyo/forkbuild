import { createId } from './createId.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { SigningIdentity } from './SigningIdentity.js';

export const DelegationAction = Object.freeze({
    PLACE: 'PLACE',
    MOVE: 'MOVE',
    PUBLISH: 'PUBLISH'
});

// A cryptographically signed authorization capability.
// Immutable. Revocation is deliberately excluded from 0.2.17.
export class Delegation {
    constructor({
        id = createId(),
        issuerIdentity,
        delegateIdentity,
        action,
        subject,
        constraints = null,
        expiresAt = null,
        signature = null,
        issuedAt = new Date()
    }) {
        this._id = id;
        this._issuerIdentity = issuerIdentity;
        this._delegateIdentity = delegateIdentity;
        this._action = action;
        this._subject = subject;
        this._constraints = constraints;
        this._expiresAt = expiresAt ? new Date(expiresAt) : null;
        this._signature = signature;
        this._issuedAt = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
    }

    get id() { return this._id; }
    get issuerIdentity() { return this._issuerIdentity; }
    get delegateIdentity() { return this._delegateIdentity; }
    get action() { return this._action; }
    get subject() { return this._subject; }
    get constraints() { return this._constraints; }
    get expiresAt() { return this._expiresAt; }
    get signature() { return this._signature; }
    get issuedAt() { return this._issuedAt; }

    getCanonicalPayload() {
        return JSON.stringify({
            id: this._id,
            issuer: this._issuerIdentity.id,
            delegate: this._delegateIdentity.id,
            action: this._action,
            subject: this._subject,
            constraints: this._constraints,
            expiresAt: this._expiresAt ? this._expiresAt.toISOString() : null,
            issuedAt: this._issuedAt.toISOString()
        });
    }

    computeHash() {
        return computeContentHash(this.getCanonicalPayload());
    }

    toJSON() {
        return {
            id: this._id,
            issuerIdentity: this._issuerIdentity.toJSON(),
            delegateIdentity: this._delegateIdentity.toJSON(),
            action: this._action,
            subject: this._subject,
            constraints: this._constraints,
            expiresAt: this._expiresAt ? this._expiresAt.toISOString() : null,
            signature: this._signature,
            issuedAt: this._issuedAt.toISOString()
        };
    }

    static fromJSON(json) {
        return new Delegation({
            id: json.id,
            issuerIdentity: SigningIdentity.fromJSON(json.issuerIdentity),
            delegateIdentity: SigningIdentity.fromJSON(json.delegateIdentity),
            action: json.action,
            subject: json.subject,
            constraints: json.constraints,
            expiresAt: json.expiresAt,
            signature: json.signature,
            issuedAt: json.issuedAt
        });
    }
}
