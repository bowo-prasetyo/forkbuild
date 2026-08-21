import { SignatureType } from './Signature.js';

// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// The WIRE shape of TWO signed, self-attested facts a World's OWNER can
// declare about ANOTHER identity — modeled directly on core/
// DeviceAuthorizationEnvelope.js, the closest precedent this codebase
// already has for "one identity making a REQUIRED-signature declaration
// about another key": a GRANT ("grantingIdentityId gives
// subjectIdentityId EDIT authority over worldDocumentId") and a
// REVOCATION ("grantingIdentityId withdraws it"). Never optional, never
// tolerated unsigned — see identity/LocalAuthorizationVerifier.js's
// verifyWorldEditAuthorizationGrant()/verifyWorldEditAuthorizationRevocation()
// — for the same reason a device authorization is never optional: there
// is no server anywhere in this architecture that could otherwise vouch
// for "grantingIdentityId itself really did grant this."
//
// This is deliberately a NARROWER claim than a device authorization
// grant. DeviceAuthorizationEnvelope answers "may this KEY act as me,
// everywhere" — the question 0.2.78 closed for good. This answers a
// completely different question 0.2.95 left open on purpose (see
// docs/Roadmap.md, 0.2.97, "a genuine multi-owner/collaborator model...
// not one this milestone quietly assumed into existence"): "may this
// OTHER, independent identity edit exactly this ONE World." Granting
// Bob EDIT on Alice's World never makes Bob able to act AS Alice
// anywhere else, and never makes Bob able to grant a THIRD identity
// anything — see application/WorldMembershipUseCase.js's own header on
// why only the World's own cryptographic owner may ever produce a valid
// grant for it, checked structurally on every replica, not merely
// trusted from whoever relayed it.
//
// A GRANT is signed by the GRANTING identity's own key ONLY — the
// subject does NOT counter-sign, the exact same asymmetry core/
// DeviceAuthorizationEnvelope.js already established for a device grant
// ("the device being authorized does NOT counter-sign"). The subject
// needs no opportunity to refuse being named editable — exactly like
// naming someone a successor, or handing them a device authorization,
// this is a capability GRANTED, never a relationship both sides
// negotiate.
export const WORLD_EDIT_AUTHORIZATION_FORMAT_VERSION = 1;

export function toWorldEditAuthorizationGrant({
    worldDocumentId,
    subjectIdentityId,
    grantingIdentityId,
    authorizedAt = new Date().toISOString()
}) {
    return {
        formatVersion: WORLD_EDIT_AUTHORIZATION_FORMAT_VERSION,
        worldDocumentId,
        subjectIdentityId,
        grantingIdentityId,
        authorizedAt
    };
}

export function isValidWorldEditAuthorizationGrant(value) {
    return Boolean(value)
        && value.formatVersion === WORLD_EDIT_AUTHORIZATION_FORMAT_VERSION
        && typeof value.worldDocumentId === 'string' && value.worldDocumentId.length > 0
        && typeof value.subjectIdentityId === 'string' && value.subjectIdentityId.length > 0
        && typeof value.grantingIdentityId === 'string' && value.grantingIdentityId.length > 0
        && value.subjectIdentityId !== value.grantingIdentityId
        && typeof value.authorizedAt === 'string' && !Number.isNaN(new Date(value.authorizedAt).getTime());
}

// Covers every field the grant claims, in the SAME "sign everything,
// never let a captured signature be replayed with a swapped-in field"
// discipline every other envelope in this codebase already follows.
// `id` is `worldDocumentId` (the World this claim is ABOUT — matching
// the convention that `id` names the subject of the signed fact, one
// layer up from `subjectIdentityId`, which names WHO the fact concerns);
// `revision` is `authorizedAt`, the one field that must differ between
// any two honestly-produced grants for the same (worldDocumentId,
// subjectIdentityId) pair.
export function getWorldEditAuthorizationGrantSigningDescriptor(record) {
    return {
        type: SignatureType.WORLD_EDIT_AUTHORIZATION_GRANT,
        id: record.worldDocumentId,
        revision: record.authorizedAt,
        payload: {
            worldDocumentId: record.worldDocumentId,
            subjectIdentityId: record.subjectIdentityId,
            grantingIdentityId: record.grantingIdentityId,
            authorizedAt: record.authorizedAt
        }
    };
}

// A revocation is deliberately a SEPARATE, smaller record, the same
// shape core/DeviceAuthorizationEnvelope.js's own revocation already
// takes — see application/WorldMembershipUseCase.js and core/
// WorldEditAuthority.js for how a receiver reconciles a grant and a
// later revocation for the same (worldDocumentId, subjectIdentityId)
// pair: timestamp comparison, never "permanent, first-one-wins." An
// owner can re-grant an identity it previously revoked (a strictly newer
// grant wins) — losing World EDIT authority is not the irreversible act
// identity revocation itself is.
export function toWorldEditAuthorizationRevocation({
    worldDocumentId,
    subjectIdentityId,
    grantingIdentityId,
    revokedAt = new Date().toISOString()
}) {
    return {
        formatVersion: WORLD_EDIT_AUTHORIZATION_FORMAT_VERSION,
        worldDocumentId,
        subjectIdentityId,
        grantingIdentityId,
        revokedAt
    };
}

export function isValidWorldEditAuthorizationRevocation(value) {
    return Boolean(value)
        && value.formatVersion === WORLD_EDIT_AUTHORIZATION_FORMAT_VERSION
        && typeof value.worldDocumentId === 'string' && value.worldDocumentId.length > 0
        && typeof value.subjectIdentityId === 'string' && value.subjectIdentityId.length > 0
        && typeof value.grantingIdentityId === 'string' && value.grantingIdentityId.length > 0
        && typeof value.revokedAt === 'string' && !Number.isNaN(new Date(value.revokedAt).getTime());
}

export function getWorldEditAuthorizationRevocationSigningDescriptor(record) {
    return {
        type: SignatureType.WORLD_EDIT_AUTHORIZATION_REVOCATION,
        id: record.worldDocumentId,
        revision: record.revokedAt,
        payload: {
            worldDocumentId: record.worldDocumentId,
            subjectIdentityId: record.subjectIdentityId,
            grantingIdentityId: record.grantingIdentityId,
            revokedAt: record.revokedAt
        }
    };
}
