import { SignatureType } from './Signature.js';

// 0.2.78 — Multi-Device Identity Semantics.
//
// The WIRE shape of TWO signed, self-attested facts an identity can
// declare about a DEVICE — modeled directly on core/
// IdentityRevocationEnvelope.js and core/IdentitySuccessionEnvelope.js,
// the two closest precedents this codebase already has for "one
// identity making a REQUIRED-signature declaration about a key": a
// GRANT ("identityId authorizes deviceIdentityId to act on its
// behalf") and a REVOCATION ("identityId no longer authorizes
// deviceIdentityId"). Never optional, never tolerated unsigned — see
// identity/LocalAuthorizationVerifier.js's verifyDeviceAuthorizationGrant()/
// verifyDeviceAuthorizationRevocation() — for the same reason a
// friendship/revocation/succession record is never optional: there is
// no server anywhere in this architecture that could otherwise vouch
// for "identityId itself really did authorize this device."
//
// This is the answer 0.2.78 commits to for the question every
// milestone from 0.2.67 through 0.2.71 named and deliberately left
// open — "is an identity a person, a device, or a key?" (see
// docs/Roadmap.md, 0.2.67/0.2.68). An identity stays exactly what it
// has been since 0.2.16/0.2.46: one Ed25519 keypair, one did:key. A
// DEVICE is not a new kind of identity at all — it is simply ANOTHER
// ordinary LocalIdentity (identity/LocalIdentity.js), generated on
// whatever device holds it, exactly like every other local identity
// this codebase already knows how to create. What is NEW here is the
// AUTHORIZATION LINK between the two: a device's key is never a copy
// of the parent identity's own private key (that remains 0.2.48's
// export/import — moving the identity ITSELF to a new primary device),
// and a device is never trusted merely because it can complete an
// ordinary peer/PeerAuthenticationSession.js handshake (that only ever
// proves possession of A key, never permission to speak for ANOTHER
// one — see docs/Principles.md, "Identity Authentication Proves A Key;
// Device Authorization Proves Permission").
//
// A GRANT is signed by the PARENT identity's own key ONLY — the device
// being authorized does NOT counter-sign, the exact same asymmetry
// core/IdentitySuccessionEnvelope.js already established for successor
// declarations ("the successor identity does NOT counter-sign — it is
// already its own, independently valid identity, provable entirely on
// its own terms the moment it was created"). A device proves its own
// key possession the ordinary way, live, over its own connection —
// see application/DeviceAuthorizationPropagationUseCase.js's own
// header for how a GRANT is never itself treated as proof that the
// connection on the other end of a live PeerConnection actually IS
// the device it names.
export const DEVICE_AUTHORIZATION_FORMAT_VERSION = 1;

export function toDeviceAuthorizationGrant({
    identityId,
    deviceIdentityId,
    devicePublicKey,
    deviceLabel = null,
    algorithm = 'Ed25519',
    authorizedAt = new Date().toISOString()
}) {
    return {
        formatVersion: DEVICE_AUTHORIZATION_FORMAT_VERSION,
        identityId,
        deviceIdentityId,
        devicePublicKey,
        deviceLabel: deviceLabel || null,
        algorithm,
        authorizedAt
    };
}

export function isValidDeviceAuthorizationGrant(value) {
    return Boolean(value)
        && value.formatVersion === DEVICE_AUTHORIZATION_FORMAT_VERSION
        && typeof value.identityId === 'string' && value.identityId.length > 0
        && typeof value.deviceIdentityId === 'string' && value.deviceIdentityId.length > 0
        && value.deviceIdentityId !== value.identityId
        && typeof value.devicePublicKey === 'string' && value.devicePublicKey.length > 0
        && (value.deviceLabel === null || typeof value.deviceLabel === 'string')
        && typeof value.algorithm === 'string' && value.algorithm.length > 0
        && typeof value.authorizedAt === 'string' && !Number.isNaN(new Date(value.authorizedAt).getTime());
}

// Covers every field the grant claims — never a narrower subset, the
// same "sign everything, never let a captured signature be replayed
// with a swapped-in field" discipline core/PeerAuthenticationEnvelope.js's
// own header explains. `id` is the identity this claim is ABOUT (the
// authorizing parent — matches every other envelope's "id is the
// subject" convention); `revision` is `authorizedAt`, the one field
// that must differ between any two honestly-produced grants for the
// same device.
export function getDeviceAuthorizationGrantSigningDescriptor(record) {
    return {
        type: SignatureType.DEVICE_AUTHORIZATION_GRANT,
        id: record.identityId,
        revision: record.authorizedAt,
        payload: {
            identityId: record.identityId,
            deviceIdentityId: record.deviceIdentityId,
            devicePublicKey: record.devicePublicKey,
            deviceLabel: record.deviceLabel,
            algorithm: record.algorithm,
            authorizedAt: record.authorizedAt
        }
    };
}

// A revocation is deliberately a SEPARATE, smaller record — it does
// not need to restate devicePublicKey/deviceLabel, only which device
// is no longer authorized and when. See application/
// DeviceAuthorizationPropagationUseCase.js and core/DeviceAuthority.js
// for how a receiver reconciles a grant and a later revocation for the
// same (identityId, deviceIdentityId) pair — timestamp comparison,
// never "permanent, first-one-wins" the way core/
// IdentityRevocationEnvelope.js's own revocation is: an identity can
// re-authorize a device it previously revoked (a strictly newer grant
// wins), because losing a device's access is not the same
// irreversible act as an identity revoking ITSELF — see docs/
// Principles.md, "Device Authorization Can Be Re-Granted; Identity
// Revocation Cannot."
export function toDeviceAuthorizationRevocation({ identityId, deviceIdentityId, revokedAt = new Date().toISOString() }) {
    return {
        formatVersion: DEVICE_AUTHORIZATION_FORMAT_VERSION,
        identityId,
        deviceIdentityId,
        revokedAt
    };
}

export function isValidDeviceAuthorizationRevocation(value) {
    return Boolean(value)
        && value.formatVersion === DEVICE_AUTHORIZATION_FORMAT_VERSION
        && typeof value.identityId === 'string' && value.identityId.length > 0
        && typeof value.deviceIdentityId === 'string' && value.deviceIdentityId.length > 0
        && typeof value.revokedAt === 'string' && !Number.isNaN(new Date(value.revokedAt).getTime());
}

export function getDeviceAuthorizationRevocationSigningDescriptor(record) {
    return {
        type: SignatureType.DEVICE_AUTHORIZATION_REVOCATION,
        id: record.identityId,
        revision: record.revokedAt,
        payload: {
            identityId: record.identityId,
            deviceIdentityId: record.deviceIdentityId,
            revokedAt: record.revokedAt
        }
    };
}
