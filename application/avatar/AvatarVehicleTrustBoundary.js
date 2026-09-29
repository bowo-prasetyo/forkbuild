// Decides whether to believe an incoming AvatarVehicleAdvertisement ("this
// avatar is riding that vehicle"), in the same order as
// AvatarProfileTrustBoundary: well-formed, a valid signature if signed, not a
// blocked signer, the same authority already bound to this avatarId (its own
// binding, as presence, profile and interaction keep theirs), not a replay,
// not two different claims at one sequence, and newer than what is held.
import { isValidAvatarVehicleAdvertisement, getAvatarVehicleSigningDescriptor } from '../../core/AvatarVehicleAdvertisement.js';
import { PresenceAuthorityRegistry } from '../../core/PresenceAuthority.js';
import { TrustObservation, TrustStatus } from '../../core/TrustObservation.js';
import { computeContentHash } from '../../serializer/contentHash.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';
import { ReplayGuard } from '../../replication/ReplayGuard.js';

const SUBJECT = 'avatar-vehicle';

function rejected(status, avatarId, reason = null) {
    return { accepted: false, observation: TrustObservation.of(status, { subjectType: SUBJECT, subjectId: avatarId, reason }) };
}

export class AvatarVehicleTrustBoundary {
    constructor({
        authorizationVerifier = new LocalAuthorizationVerifier(),
        authorityRegistry = new PresenceAuthorityRegistry(),
        replayGuard = new ReplayGuard(),
        isBlocked = () => false
    } = {}) {
        this._verifier = authorizationVerifier;
        this._authority = authorityRegistry;
        this._replayGuard = replayGuard;
        this._isBlocked = isBlocked;
    }

    evaluate(incoming, current) {
        if (!isValidAvatarVehicleAdvertisement(incoming)) {
            const id = incoming && typeof incoming === 'object' ? incoming.avatarId : null;
            return rejected(TrustStatus.UNAVAILABLE, id, 'malformed or structurally invalid advertisement');
        }
        const avatarId = incoming.avatarId;
        const verification = this._verifier.verifyAvatarVehicleAdvertisement(incoming);
        if (verification.signed && !verification.valid) {
            return rejected(TrustStatus.INVALID_SIGNATURE, avatarId, verification.reason);
        }
        const signerId = verification.signed && verification.valid ? incoming.signature.signer : null;
        if (signerId && this._isBlocked(signerId)) {
            return rejected(TrustStatus.BLOCKED, avatarId, 'signer is locally blocked');
        }
        const authority = this._authority.evaluate(avatarId, { ownerIdentity: incoming.ownerIdentity, signerId });
        if (!authority.authorized) {
            return rejected(TrustStatus.UNAUTHORIZED, avatarId, authority.reason);
        }
        const payload = JSON.stringify(getAvatarVehicleSigningDescriptor(incoming).payload);
        const hash = computeContentHash(payload);
        const scope = `${SUBJECT}:${avatarId}`;
        if (this._replayGuard.hasAccepted(hash, scope)) {
            return rejected(TrustStatus.REPLAYED, avatarId);
        }
        if (current && current.sequence === incoming.sequence
            && JSON.stringify(getAvatarVehicleSigningDescriptor(current).payload) !== payload) {
            return rejected(TrustStatus.EQUIVOCATING, avatarId, `competing claims at sequence ${incoming.sequence}`);
        }
        if (current && !(incoming.sequence > current.sequence)) {
            return rejected(TrustStatus.STALE, avatarId, 'stale-or-duplicate');
        }
        this._replayGuard.recordAccepted(hash, scope);
        return { accepted: true, observation: TrustObservation.of(TrustStatus.VALID, { subjectType: SUBJECT, subjectId: avatarId }) };
    }
}
