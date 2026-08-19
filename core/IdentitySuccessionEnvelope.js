import { SignatureType } from './Signature.js';

// 0.2.67 — the WIRE shape of a signed successor declaration: identity A
// saying "identity B is my successor," never identity A silently
// BECOMING identity B. This is the deliberate architectural stance the
// milestone's own design discussion settled on: identityId stays
// immutable for the lifetime of the cryptographic identity it names
// (see docs/Principles.md, "An Identity Identifier Is Immutable For
// The Lifetime Of That Cryptographic Identity") — a rotation is always
// TWO identities plus a signed, directional link between them, never
// one identity whose key quietly changed underneath the same id.
//
// Modeled on core/IdentityRevocationEnvelope.js's own shape and
// REQUIRED-signature discipline: a successor declaration is signed by
// the PREDECESSOR's own key, the one and only party with any authority
// to say "this is my successor" — see identity/
// LocalIdentityProvider.js#declareSuccessor(), the only place this
// envelope is signed. The successor identity does NOT counter-sign —
// it is already its own, independently valid identity (its own
// LocalIdentity, its own keypair, provable entirely on its own terms
// the moment it was created); the declaration exists to link it to a
// predecessor, not to prove the successor's own key possession a
// second time. See docs/Principles.md, "A Successor Declaration Is
// Signed By The Predecessor, Never Counter-Signed By The Successor."
//
// Fields:
//   predecessorIdentityId/predecessorPublicKey — the identity making
//                          the declaration. Also the signature's own
//                          `signer` (see verifyIdentitySuccession()).
//   successorIdentityId/successorPublicKey     — the identity being
//                          named. successorPublicKey is redundant with
//                          successorIdentityId (a did:key is a
//                          bijective encoding of the public key — see
//                          identity/Ed25519.js#publicKeyToDidKey/
//                          didKeyToPublicKey) but is carried explicitly
//                          anyway, the same "don't make a verifier
//                          re-derive what the claim already states"
//                          choice every other envelope in this codebase
//                          already makes; isValidIdentitySuccessionRecord()
//                          checks the two agree.
//   declaredAt          — the declaring device's own clock, carried as
//                          untrusted display metadata only, exactly
//                          like core/IdentityRevocationEnvelope.js's
//                          own `revokedAt`.
//
// Declaring a successor does NOT, by itself, revoke the predecessor —
// see docs/Principles.md, "Declaring A Successor Does Not Revoke The
// Predecessor": Alice can name Bob's-new-key as her successor today and
// keep signing with her current key for weeks before ever calling
// identity/LocalIdentityProvider.js#revokeIdentity(). identity/
// LocalIdentityProvider.js#revokeIdentity() accepts an OPTIONAL
// successorIdentityId of its own precisely so the common case — "I am
// rotating right now, and the old key stops working right now" — can
// still be one signed user action that produces both records together,
// without forcing the two concepts into one envelope type.
export function toIdentitySuccessionRecord({
    predecessorIdentityId,
    predecessorPublicKey,
    successorIdentityId,
    successorPublicKey,
    declaredAt = new Date().toISOString()
}) {
    return {
        formatVersion: 1,
        predecessorIdentityId,
        predecessorPublicKey,
        successorIdentityId,
        successorPublicKey,
        declaredAt
    };
}

export function isValidIdentitySuccessionRecord(value) {
    return Boolean(value)
        && value.formatVersion === 1
        && typeof value.predecessorIdentityId === 'string' && value.predecessorIdentityId.length > 0
        && typeof value.predecessorPublicKey === 'string' && value.predecessorPublicKey.length > 0
        && typeof value.successorIdentityId === 'string' && value.successorIdentityId.length > 0
        && typeof value.successorPublicKey === 'string' && value.successorPublicKey.length > 0
        && value.predecessorIdentityId !== value.successorIdentityId
        && typeof value.declaredAt === 'string' && !Number.isNaN(new Date(value.declaredAt).getTime());
}

// Covers every field the record claims, never a narrower subset — the
// same "sign everything that matters" discipline core/
// PeerAuthenticationEnvelope.js and core/IdentityRevocationEnvelope.js
// already apply. `id` is the predecessor (who this claim is ABOUT —
// "who is declaring a successor"); `revision` is `declaredAt`.
export function getIdentitySuccessionSigningDescriptor(record) {
    return {
        type: SignatureType.IDENTITY_SUCCESSION,
        id: record.predecessorIdentityId,
        revision: record.declaredAt,
        payload: {
            predecessorIdentityId: record.predecessorIdentityId,
            predecessorPublicKey: record.predecessorPublicKey,
            successorIdentityId: record.successorIdentityId,
            successorPublicKey: record.successorPublicKey,
            declaredAt: record.declaredAt
        }
    };
}
