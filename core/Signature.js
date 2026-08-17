// Explicit signature data (0.2.16).
//
// The trust model of the decentralized planes:
//
//   content hash  ->  "What exactly is this object?"
//   revision      ->  "Which version of it?"
//   signature     ->  "Who authorized it?"
//   identity      ->  "Which public key is that authority?"
//
// A hash can prove a PlacementRecord has not changed. It cannot prove
// Alice created it. That is what this entity carries.
//
// ForkBuild NEVER signs arbitrary serialized JSON. Every signature
// covers a canonical signing envelope:
//
//   { domain: 'forkbuild', type, id, revision, payload }
//
// constructed in exactly this property order (canonical serialization
// discipline) — so the same semantic object can never produce two
// different signatures, and so a signature for
// 'forkbuild/placement-record' can never be replayed as one for
// 'forkbuild/publication' (domain separation).
//
// A Signature contains no unsigned claims: signer, algorithm, the raw
// signature bytes, the hash of the signed canonical bytes, and the
// domain. Verification reconstructs the envelope from the object and
// checks everything (see identity/LocalAuthorizationVerifier).
export const SIGNING_DOMAIN = 'forkbuild';

export const SignatureType = Object.freeze({
    PUBLICATION: 'publication',
    PLACEMENT_RECORD: 'placement-record',
    SPATIAL_INDEX_ROOT: 'spatial-index-root',
    // 0.2.38 — an OPTIONAL signature over an AvatarPresenceAdvertisement
    // (core/AvatarPresenceAdvertisement.js's wire shape), never over
    // AvatarPresence itself (core/AvatarPresence.js stays permanently
    // unsigned — see its own header). See
    // core/AvatarPresenceAdvertisement.js's getAvatarPresenceSigningDescriptor().
    AVATAR_PRESENCE: 'avatar-presence',
    // 0.2.41 — the same, one layer up: an OPTIONAL signature over an
    // AvatarProfileAdvertisement (core/AvatarProfileAdvertisement.js's
    // wire shape), never over AvatarProfile itself. See
    // core/AvatarProfileAdvertisement.js's
    // getAvatarProfileSigningDescriptor().
    AVATAR_PROFILE: 'avatar-profile'
});

export class Signature {
    constructor({ algorithm, signer, signature, signedHash, domain, signedAt = null } = {}) {
        if (!algorithm || typeof algorithm !== 'string') {
            throw new Error('Signature: algorithm is required');
        }
        if (!signer || typeof signer !== 'string') {
            throw new Error('Signature: signer is required');
        }
        if (!signature || typeof signature !== 'string') {
            throw new Error('Signature: signature bytes are required');
        }
        if (!signedHash || typeof signedHash !== 'string') {
            throw new Error('Signature: signedHash is required');
        }
        if (!domain || typeof domain !== 'string') {
            throw new Error('Signature: domain is required');
        }
        this._algorithm = algorithm;
        this._signer = signer;
        this._signature = signature;
        this._signedHash = signedHash;
        this._domain = domain;
        this._signedAt = signedAt instanceof Date ? signedAt : (signedAt ? new Date(signedAt) : null);
    }

    get algorithm() { return this._algorithm; }
    get signer() { return this._signer; }
    get signature() { return this._signature; }
    get signedHash() { return this._signedHash; }
    get domain() { return this._domain; }
    get signedAt() { return this._signedAt; }

    toJSON() {
        return {
            algorithm: this._algorithm,
            signer: this._signer,
            signature: this._signature,
            signedHash: this._signedHash,
            domain: this._domain,
            signedAt: this._signedAt ? this._signedAt.toISOString() : null
        };
    }

    // Defensive: returns null for anything that is not a real 0.2.16
    // signature — including legacy attribution stamps
    // ({ signedBy, providerId, data }) stored by pre-0.2.16 publishers.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        if (typeof json.signature !== 'string'
            || typeof json.signer !== 'string'
            || typeof json.signedHash !== 'string'
            || typeof json.domain !== 'string') {
            return null;
        }
        return new Signature({
            algorithm: json.algorithm || 'Ed25519',
            signer: json.signer,
            signature: json.signature,
            signedHash: json.signedHash,
            domain: json.domain,
            signedAt: json.signedAt || null
        });
    }

    // The canonical signing envelope. Property order is part of the
    // protocol — it must never change without a new signature version.
    static canonicalEnvelope(descriptor) {
        return {
            domain: SIGNING_DOMAIN,
            type: descriptor.type,
            id: descriptor.id,
            revision: descriptor.revision,
            payload: descriptor.payload
        };
    }

    static canonicalBytes(descriptor) {
        return JSON.stringify(Signature.canonicalEnvelope(descriptor));
    }
}
