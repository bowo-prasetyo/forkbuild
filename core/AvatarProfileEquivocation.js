import { computeContentHash } from '../serializer/contentHash.js';

// 0.2.41 — "Equal-but-different is still a conflict" (0.2.18),
// applied to avatar profiles the same way core/PresenceEquivocation.js
// already applies it to live presence: the SAME avatarId, at the SAME
// `profileRevision`, carrying DIFFERENT templateId/appearance/
// displayName. The design doc's own example — "red shirt -> blue
// shirt -> red shirt" arriving out of order — is handled by
// core/AvatarProfileIngestion.js's monotonic-revision rule alone
// (whichever revision is highest wins, red-then-blue-then-red is just
// three strictly-increasing revisions); THIS file exists for the
// narrower, genuinely adversarial case: two DIFFERENT claims at the
// SAME revision number, which monotonic comparison alone cannot
// distinguish from a harmless duplicate.
//
// Deliberately a pure, STATELESS comparison against whatever is
// currently stored — exactly core/PresenceEquivocation.js's own
// reasoning for why no separate accumulating detector is needed here
// either: a profile has exactly one "current" slot to compare
// against. Only meaningful once application/AvatarProfileTrustBoundary.js
// has already confirmed the incoming claim shares the SAME bound
// authority as the currently-stored one — a forged claim from a
// different signer is rejected earlier, as UNAUTHORIZED/
// INVALID_SIGNATURE, a STRONGER outcome than equivocation.
export function detectAvatarProfileEquivocation(currentAdvertisement, incomingAdvertisement) {
    if (!currentAdvertisement || !incomingAdvertisement) {
        return null;
    }
    if (currentAdvertisement.avatarId !== incomingAdvertisement.avatarId) {
        return null;
    }
    if (currentAdvertisement.profileRevision !== incomingAdvertisement.profileRevision) {
        return null;
    }
    return profileContentHash(currentAdvertisement) === profileContentHash(incomingAdvertisement)
        ? null
        : {
            avatarId: incomingAdvertisement.avatarId,
            profileRevision: incomingAdvertisement.profileRevision,
            claims: [
                { templateId: currentAdvertisement.templateId, appearance: currentAdvertisement.appearance, displayName: currentAdvertisement.displayName },
                { templateId: incomingAdvertisement.templateId, appearance: incomingAdvertisement.appearance, displayName: incomingAdvertisement.displayName }
            ]
        };
}

function profileContentHash(advertisement) {
    return computeContentHash(JSON.stringify({
        templateId: advertisement.templateId,
        appearance: advertisement.appearance,
        displayName: advertisement.displayName
    }));
}
