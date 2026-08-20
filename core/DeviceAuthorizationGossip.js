import { isValidDeviceAuthorizationGrant, isValidDeviceAuthorizationRevocation } from './DeviceAuthorizationEnvelope.js';

// 0.2.78 — Multi-Device Identity Semantics.
//
// The WIRE shape carried over peer/PeerMessageBus.js under the
// 'forkbuild:device-authorization' protocol (see application/
// DeviceAuthorizationPropagationUseCase.js) — deliberately the same
// smallest-possible wrapper core/IdentityLifecycleGossip.js already
// established for revocation/succession: a `kind` discriminator plus
// the record itself, completely unchanged from what identity/
// LocalIdentityProvider.js's own authorizeDevice()/
// revokeDeviceAuthorization() already produced and stored LOCALLY.
// There is no NEW signature type invented at this layer, and no NEW
// claim being made — a gossiped GRANT/REVOCATION is byte-for-byte the
// exact record identity/LocalAuthorizationVerifier.js's own
// verifyDeviceAuthorizationGrant()/verifyDeviceAuthorizationRevocation()
// already knows how to verify. See docs/Principles.md, "Propagation
// Carries A Record, It Does Not Mint A New Claim" (0.2.68, unchanged
// by this milestone).
export const DeviceAuthorizationGossipKind = Object.freeze({
    GRANT: 'GRANT',
    REVOCATION: 'REVOCATION'
});

export function isValidDeviceAuthorizationGossipKind(value) {
    return value === DeviceAuthorizationGossipKind.GRANT || value === DeviceAuthorizationGossipKind.REVOCATION;
}

export function toDeviceAuthorizationGossipMessage(kind, record) {
    if (!isValidDeviceAuthorizationGossipKind(kind)) {
        throw new Error('toDeviceAuthorizationGossipMessage: unknown kind ' + kind);
    }
    return { kind, record };
}

// Structural validity ONLY — exactly like core/IdentityLifecycleGossip.js's
// own isValidIdentityLifecycleGossipMessage(): says nothing about
// whether the record's SIGNATURE verifies, whether it is relevant to
// this device, or whether it is newer than something already on file.
// Those are application/DeviceAuthorizationPropagationUseCase.js's own
// ingestion boundary questions, asked in order, one layer up.
export function isValidDeviceAuthorizationGossipMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === DeviceAuthorizationGossipKind.GRANT) {
        return isValidDeviceAuthorizationGrant(value.record);
    }
    if (value.kind === DeviceAuthorizationGossipKind.REVOCATION) {
        return isValidDeviceAuthorizationRevocation(value.record);
    }
    return false;
}
