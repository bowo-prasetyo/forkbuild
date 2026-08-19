import * as Ed25519 from './Ed25519.js';
import { IdentityLifecycleState, isValidIdentityLifecycleState } from '../core/IdentityLifecycleState.js';

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
//
// isProtected (0.2.47) answers "does this identity's private key require
// a passphrase to decrypt?" — display/routing metadata exactly like
// label, never key material itself (see identity/KeyEncryption.js for
// where the actual encrypted bytes live). It defaults to false so every
// pre-0.2.47 stored identity — which never had a `protected` field at
// all — deserializes as the unprotected identity it has always been,
// with no migration required to keep loading it.
//
// lifecycleState/successorIdentityId (0.2.67) answer a fourth question,
// durable like isProtected but otherwise independent of it: "has this
// identity's own owner permanently declared it no longer trustworthy?"
// See core/IdentityLifecycleState.js for why this is deliberately kept
// apart from VaultLock and AuthenticationSession. lifecycleState
// defaults to ACTIVE for the exact same backward-compatibility reason
// isProtected defaults to false — every identity that existed before
// 0.2.67 keeps loading as the ACTIVE identity it has always been.
// successorIdentityId is an informational pointer set by
// identity/LocalIdentityProvider.js#declareSuccessor() — see that
// method, and core/IdentitySuccessionEnvelope.js, for the signed
// record it is derived from. It may be present on an identity that is
// still ACTIVE (naming a successor does not itself revoke anything —
// see docs/Principles.md, "Declaring A Successor Does Not Revoke The
// Predecessor").
export class LocalIdentity {
    constructor({
        identityId, publicKey, algorithm = 'Ed25519', label, createdAt, protected: isProtected = false,
        lifecycleState = IdentityLifecycleState.ACTIVE, successorIdentityId = null
    } = {}) {
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
        if (!isValidIdentityLifecycleState(lifecycleState)) {
            throw new Error('LocalIdentity: lifecycleState must be ACTIVE or REVOKED');
        }
        if (successorIdentityId && successorIdentityId === identityId) {
            throw new Error('LocalIdentity: successorIdentityId cannot be the identity itself');
        }
        this._identityId = identityId;
        this._publicKey = publicKey;
        this._algorithm = algorithm;
        this._label = label.trim();
        this._createdAt = createdAt ? new Date(createdAt) : new Date();
        this._isProtected = !!isProtected;
        this._lifecycleState = lifecycleState;
        this._successorIdentityId = successorIdentityId || null;
    }

    get identityId() { return this._identityId; }
    get publicKey() { return this._publicKey; }
    get algorithm() { return this._algorithm; }
    get label() { return this._label; }
    get createdAt() { return this._createdAt; }
    get isProtected() { return this._isProtected; }
    get lifecycleState() { return this._lifecycleState; }
    get isRevoked() { return this._lifecycleState === IdentityLifecycleState.REVOKED; }
    get successorIdentityId() { return this._successorIdentityId; }

    toJSON() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            label: this._label,
            createdAt: this._createdAt.toISOString(),
            protected: this._isProtected,
            lifecycleState: this._lifecycleState,
            successorIdentityId: this._successorIdentityId
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new LocalIdentity(json);
    }
}
