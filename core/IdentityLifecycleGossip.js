import { isValidIdentityRevocationRecord } from './IdentityRevocationEnvelope.js';
import { isValidIdentitySuccessionRecord } from './IdentitySuccessionEnvelope.js';

// 0.2.68 — Identity Lifecycle Propagation.
//
// The WIRE shape carried over peer/PeerMessageBus.js under the
// 'forkbuild:identity-lifecycle' protocol (see application/
// IdentityLifecyclePropagationUseCase.js). Deliberately the smallest
// possible wrapper — a `kind` discriminator plus the record itself,
// completely unchanged from what identity/LocalIdentityProvider.js's
// own revokeIdentity()/declareSuccessor() already produced and stored
// LOCALLY back in 0.2.67 (core/IdentityRevocationEnvelope.js /
// core/IdentitySuccessionEnvelope.js). This is the one property that
// makes propagation safe rather than a second, competing source of
// truth: there is no NEW signature type here, and no NEW claim being
// made — a gossiped REVOCATION is byte-for-byte the exact record
// identity/LocalAuthorizationVerifier.js#verifyIdentityRevocation()
// already knows how to verify, just handed to a peer instead of only
// ever read back off the revoking device's own storage.
//
// See docs/Principles.md, "Propagation Carries A Record, It Does Not
// Mint A New Claim" (0.2.68).
export const IdentityLifecycleGossipKind = Object.freeze({
    REVOCATION: 'REVOCATION',
    SUCCESSION: 'SUCCESSION'
});

export function isValidIdentityLifecycleGossipKind(value) {
    return value === IdentityLifecycleGossipKind.REVOCATION || value === IdentityLifecycleGossipKind.SUCCESSION;
}

export function toIdentityLifecycleGossipMessage(kind, record) {
    if (!isValidIdentityLifecycleGossipKind(kind)) {
        throw new Error('toIdentityLifecycleGossipMessage: unknown kind ' + kind);
    }
    return { kind, record };
}

// Structural validity ONLY — exactly like peer/PeerMessage.js's own
// isValidPeerMessageEnvelope(), this says nothing about whether the
// record's SIGNATURE verifies, whether it is relevant to this device,
// or whether it is newer than something already on file. Those are
// application/IdentityLifecyclePropagationUseCase.js's own ingestion
// boundary questions, asked in order, one layer up — see that file's
// own header.
export function isValidIdentityLifecycleGossipMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === IdentityLifecycleGossipKind.REVOCATION) {
        return isValidIdentityRevocationRecord(value.record);
    }
    if (value.kind === IdentityLifecycleGossipKind.SUCCESSION) {
        return isValidIdentitySuccessionRecord(value.record);
    }
    return false;
}
