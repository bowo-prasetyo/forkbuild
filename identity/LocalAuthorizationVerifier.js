import { AuthorizationVerifier } from './AuthorizationVerifier.js';
import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
import { getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';
import { getAvatarProfileSigningDescriptor } from '../core/AvatarProfileAdvertisement.js';
import { computeContentHash } from '../serializer/contentHash.js';
import * as Ed25519 from './Ed25519.js';

// The V0.1 concrete verifier.
//
// Verification reconstructs the canonical envelope from the object's
// own signing descriptor — it never trusts anything the signature
// claims about the payload:
//
//   canonical object -> canonical bytes -> signedHash check
//                                      -> Ed25519 verification
//
// Authorization rules (0.2.16, deliberately simple):
//   Publication  — signature must verify against publisherIdentity,
//                  and signer must BE that identity.
//   Placement    — signature must verify against ownerIdentity, and
//                  signer must BE that identity. (Bob placing Alice's
//                  castle is a POLICY question for 0.2.17; here the
//                  placer must own the placement revision they sign.)
//   Index root   — signer's key is recovered from the did:key in the
//                  signature itself; if an indexAuthorityIdentity is
//                  configured, the signer must match it.
//
// Unsigned (pre-0.2.16) objects are tolerated and reported as
// signed: false — the deployed corpus must keep working.
export class LocalAuthorizationVerifier extends AuthorizationVerifier {
    constructor({ indexAuthorityIdentity = null } = {}) {
        super();
        this._indexAuthorityIdentity = indexAuthorityIdentity;
    }

    verifyPublication(publication) {
        if (!publication) {
            return { valid: false, signed: false, reason: 'no publication' };
        }
        if (!publication.signature) {
            return { valid: true, signed: false, reason: 'unsigned publication (legacy)' };
        }
        if (!publication.publisherIdentity) {
            return { valid: false, signed: true, reason: 'signature without publisher identity' };
        }
        return this.verifyDescriptor(
            publication.getSigningDescriptor(),
            publication.signature,
            publication.publisherIdentity
        );
    }

    verifyPlacement(record) {
        if (!record) {
            return { valid: false, signed: false, reason: 'no placement record' };
        }
        if (!record.signature) {
            return { valid: true, signed: false, reason: 'unsigned placement (legacy)' };
        }
        if (!record.ownerIdentity) {
            return { valid: false, signed: true, reason: 'signature without owner identity' };
        }
        return this.verifyDescriptor(
            record.getSigningDescriptor(),
            record.signature,
            record.ownerIdentity
        );
    }

    verifyIndexRoot(root) {
        if (!root) {
            return { valid: false, signed: false, reason: 'no index root' };
        }
        const signature = root.signature;
        if (!signature) {
            return { valid: true, signed: false, reason: 'unsigned index root (legacy)' };
        }
        // The root carries no identity payload — the did:key signer IS
        // the public key.
        const publicKeyBytes = Ed25519.didKeyToPublicKey(signature.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = {
            id: signature.signer,
            algorithm: 'Ed25519',
            publicKey: Ed25519.bytesToHex(publicKeyBytes)
        };
        const result = this.verifyDescriptor(root.getSigningDescriptor(), signature, identity);
        if (!result.valid) {
            return result;
        }
        if (this._indexAuthorityIdentity && signature.signer !== this._indexAuthorityIdentity.id) {
            return { valid: false, signed: true, reason: 'signer is not the index authority' };
        }
        return result;
    }

    // 0.2.38 — an AvatarPresenceAdvertisement (core/
    // AvatarPresenceAdvertisement.js) carries no identity payload of
    // its own, exactly like a SpatialIndexRoot above: the did:key
    // signer of a valid signature IS the public key. Unsigned is
    // tolerated at THIS layer (structural verification only) — see
    // core/PresenceTrustPolicy.js for whether a receiver's policy
    // actually accepts an unsigned claim, and
    // application/PresenceTrustBoundary.js for the identity-binding
    // check ("is this signer allowed to speak for this avatarId at
    // all") that a merely-VALID signature does not by itself answer.
    verifyPresenceAdvertisement(advertisement) {
        if (!advertisement) {
            return { valid: false, signed: false, reason: 'no advertisement' };
        }
        if (!advertisement.signature) {
            return { valid: true, signed: false, reason: 'unsigned presence advertisement' };
        }
        const sig = Signature.fromJSON(advertisement.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getAvatarPresenceSigningDescriptor(advertisement), advertisement.signature, identity);
    }

    // 0.2.41 — the same shape verifyPresenceAdvertisement() above
    // already established, one layer up: an AvatarProfileAdvertisement
    // carries no identity payload of its own, so the did:key signer of
    // a valid signature IS the public key. Unsigned is tolerated at
    // THIS layer (structural verification only) — 0.2.41 introduces no
    // policy knob equivalent to core/PresenceTrustPolicy.js, so
    // application/AvatarProfileTrustBoundary.js always tolerates an
    // unsigned profile claim, exactly like presence's own permissive
    // default.
    verifyAvatarProfileAdvertisement(advertisement) {
        if (!advertisement) {
            return { valid: false, signed: false, reason: 'no advertisement' };
        }
        if (!advertisement.signature) {
            return { valid: true, signed: false, reason: 'unsigned profile advertisement' };
        }
        const sig = Signature.fromJSON(advertisement.signature);
        if (!sig) {
            return { valid: false, signed: true, reason: 'malformed signature' };
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(sig.signer);
        if (!publicKeyBytes) {
            return { valid: false, signed: true, reason: 'unknown signer identity' };
        }
        const identity = { id: sig.signer, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) };
        return this.verifyDescriptor(getAvatarProfileSigningDescriptor(advertisement), advertisement.signature, identity);
    }

    // The core check, exposed for direct use (tests, future verifiers).
    verifyDescriptor(descriptor, signature, identityJson) {
        const sig = signature instanceof Signature ? signature : Signature.fromJSON(signature);
        if (!sig || !identityJson || !identityJson.id || !identityJson.publicKey) {
            return { valid: false, signed: false, reason: 'missing signature or identity' };
        }
        if (sig.algorithm !== 'Ed25519' || identityJson.algorithm !== 'Ed25519') {
            return { valid: false, signed: true, reason: 'unsupported algorithm' };
        }
        if (sig.signer !== identityJson.id) {
            return { valid: false, signed: true, reason: 'signer identity mismatch' };
        }
        if (sig.domain !== SIGNING_DOMAIN + '/' + descriptor.type) {
            return { valid: false, signed: true, reason: 'signature domain mismatch' };
        }
        const bytes = Signature.canonicalBytes(descriptor);
        if (computeContentHash(bytes) !== sig.signedHash) {
            return { valid: false, signed: true, reason: 'signed hash mismatch' };
        }
        const ok = Ed25519.verify(
            Ed25519.hexToBytes(identityJson.publicKey),
            Ed25519.utf8ToBytes(bytes),
            Ed25519.hexToBytes(sig.signature)
        );
        return ok
            ? { valid: true, signed: true, reason: null }
            : { valid: false, signed: true, reason: 'signature verification failed' };
    }
}
