import { SignatureType } from './Signature.js';

// 0.2.67 — the WIRE shape of one signed self-revocation, and the
// canonical signing envelope its signature covers. Modeled directly on
// core/PeerAuthenticationEnvelope.js and core/FriendshipAdvertisement.js:
// a plain, JSON-shaped record, REQUIRED to be signed (never optional the
// way AVATAR_PRESENCE/AVATAR_PROFILE/AVATAR_INTERACTION/
// RENDEZVOUS_PUBLICATION are) — there is no server anywhere in this
// architecture that could otherwise vouch for "identityId's own owner
// really did revoke it." See identity/LocalAuthorizationVerifier.js's
// verifyIdentityRevocation() and docs/Principles.md, "A Revocation Is
// Self-Attested, Never Third-Party" (0.2.67).
//
// The one property that makes this record meaningful at all: it can
// ONLY ever be produced by whoever holds identityId's own private key —
// see identity/LocalIdentityProvider.js#revokeIdentity(), the only
// place this envelope is ever signed. A revocation is the identity
// saying "I no longer trust this key," which is why it must be signed
// BY that same key — an external party can never revoke an identity it
// doesn't control, and this codebase deliberately builds no mechanism
// that would let one try (see docs/Principles.md, "No Central Authority
// Can Revoke An Identity It Does Not Control").
//
// Fields:
//   identityId          — the did:key being revoked. Also the
//                          signature's own `signer` — a verifier
//                          requires the two to match (see
//                          verifyIdentityRevocation()), so a revocation
//                          record can never claim to be about one
//                          identity while actually being signed by
//                          another.
//   publicKey/algorithm — carried alongside identityId the same way
//                          every other envelope in this codebase
//                          carries its subject's key material directly,
//                          rather than requiring a verifier to already
//                          have it on hand.
//   reason               — an untrusted, optional, free-text HINT for
//                          humans (compromise, routine rotation,
//                          device loss) — never interpreted by any
//                          code path, exactly as untrusted as
//                          LocalIdentity's own `label`.
//   successorIdentityId  — optional. When present, this revocation
//                          doubles as "…and here is the identity that
//                          replaces me," letting a single signed act
//                          cover the common real case (rotating to a
//                          new key). See core/IdentitySuccessionEnvelope.js
//                          for the record this field is cross-checked
//                          against when identity/
//                          LocalIdentityProvider.js#revokeIdentity() is
//                          given one. A revocation with no successor is
//                          just as valid — see docs/Principles.md, "An
//                          Identity Can Be Revoked Without A Successor."
//   revokedAt             — the revoking device's own clock, carried as
//                          display metadata only, exactly as untrusted
//                          as core/AvatarInteractionAdvertisement.js's
//                          own `timestamp` — never a freshness or
//                          ordering mechanism. Revocation has no
//                          "latest wins" question to answer: once
//                          REVOKED, an identity stays REVOKED (see
//                          docs/Principles.md, "Revocation Is
//                          Permanent, Never A State A Later Event
//                          Reverses").
export function toIdentityRevocationRecord({
    identityId,
    publicKey,
    algorithm = 'Ed25519',
    reason = null,
    successorIdentityId = null,
    revokedAt = new Date().toISOString()
}) {
    return {
        formatVersion: 1,
        identityId,
        publicKey,
        algorithm,
        reason: reason || null,
        successorIdentityId: successorIdentityId || null,
        revokedAt
    };
}

export function isValidIdentityRevocationRecord(value) {
    return Boolean(value)
        && value.formatVersion === 1
        && typeof value.identityId === 'string' && value.identityId.length > 0
        && typeof value.publicKey === 'string' && value.publicKey.length > 0
        && typeof value.algorithm === 'string' && value.algorithm.length > 0
        && (value.reason === null || typeof value.reason === 'string')
        && (value.successorIdentityId === null || (typeof value.successorIdentityId === 'string' && value.successorIdentityId !== value.identityId))
        && typeof value.revokedAt === 'string' && !Number.isNaN(new Date(value.revokedAt).getTime());
}

// Covers EVERY field the record claims — identityId, publicKey,
// algorithm, reason, successorIdentityId, AND revokedAt — never a
// narrower subset, matching every other *SigningDescriptor in this
// codebase's own discipline (see core/PeerAuthenticationEnvelope.js's
// header for why a narrower subset would let a captured signature be
// replayed with a swapped-in field while still verifying). `id` is the
// identity this claim is ABOUT; `revision` is `revokedAt`, the one
// field a re-signed revocation for the same identity (there should
// never be one, but nothing above this layer prevents attempting it)
// would have to differ on.
export function getIdentityRevocationSigningDescriptor(record) {
    return {
        type: SignatureType.IDENTITY_REVOCATION,
        id: record.identityId,
        revision: record.revokedAt,
        payload: {
            identityId: record.identityId,
            publicKey: record.publicKey,
            algorithm: record.algorithm,
            reason: record.reason,
            successorIdentityId: record.successorIdentityId,
            revokedAt: record.revokedAt
        }
    };
}
