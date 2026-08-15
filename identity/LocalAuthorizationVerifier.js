import { AuthorizationVerifier } from './AuthorizationVerifier.js';
import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
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
