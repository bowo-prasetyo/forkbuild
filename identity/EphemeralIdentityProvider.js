import { SigningIdentity } from './SigningIdentity.js';
import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
import { computeFnv1a32 } from '../serializer/contentHash.js';
import * as Ed25519 from './Ed25519.js';

// A signing identity that lives only in memory, for one short exchange:
// pairing a device (application/devicePairing/) opens a peer connection
// through the rendezvous servers, which look peers up by a did:key and
// want each request signed by it. A fresh key per pairing keeps the
// user's own identity out of it: the servers never learn who is moving
// their builds, and nothing has to be unlocked first.
//
// The same signing surface the peer layer uses (identity/
// LocalIdentityProvider.js#getSigningIdentity/#signCanonical), and always
// "signed in". The key is never stored and is gone with the object.
export class EphemeralIdentityProvider {
    constructor({ seed = Ed25519.randomSeed(), label = 'device pairing' } = {}) {
        this._seed = seed;
        this._label = label;
        this._publicKey = Ed25519.seedToKeyPair(seed).publicKey;
        this._signingIdentity = SigningIdentity.fromPublicKeyHex(Ed25519.bytesToHex(this._publicKey), { username: label });
    }

    get identityId() { return this._signingIdentity.id; }

    get publicKey() { return this._publicKey; }

    isAuthenticated() {
        return true;
    }

    getSigningIdentity() {
        return this._signingIdentity;
    }

    signCanonical(descriptor) {
        const bytes = Signature.canonicalBytes(descriptor);
        return new Signature({
            algorithm: 'Ed25519',
            signer: this._signingIdentity.id,
            signature: Ed25519.bytesToHex(Ed25519.sign(this._seed, Ed25519.utf8ToBytes(bytes))),
            signedHash: computeFnv1a32(bytes),
            domain: SIGNING_DOMAIN + '/' + descriptor.type,
            signedAt: new Date()
        });
    }
}
