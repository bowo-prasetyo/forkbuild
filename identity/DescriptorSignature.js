import { Signature, SIGNING_DOMAIN } from '../core/Signature.js';
import { computeFnv1a32 } from '../serializer/contentHash.js';
import * as Ed25519 from './Ed25519.js';

// Whether `signature` is `identityJson`'s Ed25519 signature over the
// canonical envelope `descriptor` describes. Every signed record is checked
// here, so the key-to-did:key binding and the per-type domain can't be
// forgotten by one verifier. Returns { valid, signed, reason }.
export function verifySignedDescriptor(descriptor, signature, identityJson) {
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
    // Records that carry their signer's identity (Publications, placements,
    // anchors…) could otherwise pair someone else's did:key with their own key.
    if (!Ed25519.publicKeyMatchesDidKey(identityJson.id, identityJson.publicKey)) {
        return { valid: false, signed: true, reason: 'public key does not match identity' };
    }
    if (!descriptor || sig.domain !== SIGNING_DOMAIN + '/' + descriptor.type) {
        return { valid: false, signed: true, reason: 'signature domain mismatch' };
    }
    const bytes = Signature.canonicalBytes(descriptor);
    // signedHash is a cheap pre-check kept for stored signatures; the
    // Ed25519 verification below is over the full bytes.
    if (computeFnv1a32(bytes) !== sig.signedHash) {
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

// The Ed25519 identity a did:key names, with the key taken from the did:key
// itself rather than from anything a record carries; null for anything else.
export function identityForDidKey(didKey) {
    const publicKeyBytes = typeof didKey === 'string' ? Ed25519.didKeyToPublicKey(didKey) : null;
    return publicKeyBytes
        ? { id: didKey, algorithm: 'Ed25519', publicKey: Ed25519.bytesToHex(publicKeyBytes) }
        : null;
}
