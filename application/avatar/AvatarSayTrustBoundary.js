import { isValidAvatarSayAdvertisement } from '../../core/avatar/AvatarSay.js';
import { resolveIncomingInteraction } from '../../core/avatar/AvatarInteractionIngestion.js';
import { PresenceAuthorityRegistry } from '../../core/avatar/PresenceAuthority.js';
import { AvatarInteractionReplayWindow } from '../../core/avatar/AvatarInteractionReplayWindow.js';
import { TrustObservation, TrustStatus } from '../../core/identity/TrustObservation.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';

const SUBJECT = 'avatar-say';

function rejected(status, avatarId, reason = null) {
    return { accepted: false, observation: TrustObservation.of(status, { subjectType: SUBJECT, subjectId: avatarId, reason }) };
}

// Whether a line said aloud (core/avatar/AvatarSay.js) is shown here: the
// checks a gesture gets (application/avatar/AvatarInteractionTrustBoundary.js),
// as an event never stored. Well-formed; a signature, when there is one, that
// checks out; never from someone blocked here; from the identity that owns
// that avatar (core/avatar/PresenceAuthority.js); and each line once, newer
// than the last from that avatar, so nothing is replayed.
export class AvatarSayTrustBoundary {
    constructor({
        authorizationVerifier = new LocalAuthorizationVerifier(),
        authorityRegistry = new PresenceAuthorityRegistry(),
        replayWindow = new AvatarInteractionReplayWindow(),
        isBlocked = () => false
    } = {}) {
        this._verifier = authorizationVerifier;
        this._authority = authorityRegistry;
        this._replayWindow = replayWindow;
        this._isBlocked = isBlocked;
    }

    evaluate(incoming) {
        if (!isValidAvatarSayAdvertisement(incoming)) {
            const id = incoming && typeof incoming === 'object' ? incoming.avatarId : null;
            return rejected(TrustStatus.UNAVAILABLE, id, 'malformed or structurally invalid advertisement');
        }
        const avatarId = incoming.avatarId;
        const verification = this._verifier.verifyAvatarSayAdvertisement(incoming);
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
        if (this._replayWindow.hasAccepted(avatarId, incoming.sayId)) {
            return rejected(TrustStatus.REPLAYED, avatarId);
        }
        const decision = resolveIncomingInteraction(this._replayWindow.highestSequence(avatarId), incoming);
        if (!decision.accepted) {
            return rejected(TrustStatus.STALE, avatarId, decision.reason);
        }
        this._replayWindow.recordAccepted(avatarId, incoming.sayId, incoming.sequence);
        return { accepted: true, observation: TrustObservation.of(TrustStatus.VALID, { subjectType: SUBJECT, subjectId: avatarId }) };
    }
}
