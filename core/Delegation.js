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
//
// As of 0.2.19:
//   issuedFor         — the delegate's did:key, flat (not nested inside
//                        delegateIdentity) so it can be compared or
//                        indexed without deserializing a full identity.
//   nonce              — a random per-issuance token. `id` already
//                        identifies THIS delegation object for a future
//                        revocation system (0.2.17); nonce exists so
//                        that even a delegation reissued with otherwise
//                        byte-identical terms (same issuer/delegate/
//                        action/subject/constraints/expiry) is
//                        distinguishable — a replay guard can tell
//                        "the exact same signed object came back"
//                        (id+nonce+hash match) from "a fresh, merely
//                        similar-looking issuance" (same terms, new
//                        nonce).
//   scope / scopeHash  — the canonical, normalized capability this
//                        delegation grants (action + subject +
//                        optional spatial region), independent of how
//                        any particular replica happened to serialize
//                        the object. Two independently-received copies
//                        of "the same capability" hash identically
//                        even if their surrounding JSON differs in key
//                        order or optional-field presence.
//   parentDelegationId — set only when this delegation claims to be
//                        issued under the authority of ANOTHER
//                        delegation (a delegate re-delegating). 0.2.19
//                        does not support delegation chains; a
//                        delegation carrying this is a chain attempt
//                        and identity/DelegationVerifier.js rejects it
//                        outright with UNSUPPORTED_DELEGATION_CHAIN
//                        rather than silently granting or silently
//                        misreading it as direct-owner authority.
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
        issuedAt = new Date(),
        nonce = createId(),
        parentDelegationId = null
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
        this._nonce = nonce;
        this._parentDelegationId = parentDelegationId;
    }

    get id() { return this._id; }
    get issuerIdentity() { return this._issuerIdentity; }
    get delegateIdentity() { return this._delegateIdentity; }
    get issuedFor() { return this._delegateIdentity ? this._delegateIdentity.id : null; }
    get action() { return this._action; }
    get subject() { return this._subject; }
    get constraints() { return this._constraints; }
    get expiresAt() { return this._expiresAt; }
    get signature() { return this._signature; }
    get issuedAt() { return this._issuedAt; }
    get nonce() { return this._nonce; }
    get parentDelegationId() { return this._parentDelegationId; }

    // The canonical, normalized capability — what this delegation
    // GRANTS, independent of incidental JSON shape. See item 9's
    // "requested operation is a subset of the delegated capability,
    // not equal to the delegated JSON" — this is that canonical form.
    get scope() {
        return {
            action: this._action,
            subject: this._subject ? { type: this._subject.type, id: this._subject.id } : null,
            spatialScope: (this._constraints && this._constraints.region)
                ? {
                    min: { ...this._constraints.region.min },
                    max: { ...this._constraints.region.max }
                }
                : null
        };
    }

    get scopeHash() {
        return computeContentHash(JSON.stringify(this.scope));
    }

    getCanonicalPayload() {
        return JSON.stringify({
            id: this._id,
            issuer: this._issuerIdentity.id,
            delegate: this._delegateIdentity.id,
            issuedFor: this.issuedFor,
            action: this._action,
            subject: this._subject,
            constraints: this._constraints,
            expiresAt: this._expiresAt ? this._expiresAt.toISOString() : null,
            issuedAt: this._issuedAt.toISOString(),
            nonce: this._nonce,
            parentDelegationId: this._parentDelegationId
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
            issuedAt: this._issuedAt.toISOString(),
            nonce: this._nonce,
            parentDelegationId: this._parentDelegationId
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
            issuedAt: json.issuedAt,
            nonce: json.nonce, // undefined -> constructor default (createId()) for pre-0.2.19 records
            parentDelegationId: json.parentDelegationId || null
        });
    }
}
