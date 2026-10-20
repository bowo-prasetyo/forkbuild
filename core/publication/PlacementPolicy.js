// Who may place a Publication in shared space. The publisher
// chooses it, and it is signed as part of the Publication, so nobody can
// change or strip it without breaking that signature. It is honored by
// every ForkBuild replica, the same way the license's fork permission is:
// a modified client could ignore it, so it is a stated wish that honest
// software respects, not a technical lock.
export const PlacementPolicy = Object.freeze({
    ANYONE: 'anyone',
    PUBLISHER_ONLY: 'publisher-only'
});

export const PlacementPermissionReason = Object.freeze({
    ALLOWED: 'allowed',
    PUBLISHER_ONLY: 'publisher-only',
    NO_PLACER: 'no-placer'
});

// Absent means ANYONE, so every Publication signed before the setting
// existed keeps its meaning and its signature.
export function placementPolicyOf(publication) {
    const value = publication ? publication.placementPolicy : null;
    return typeof value === 'string' && value.length > 0 ? value : PlacementPolicy.ANYONE;
}

// `placer` is { identityId, username }: the did:key that will sign the
// placement, and the display name as a fallback for unsigned (legacy)
// Publications, which have no publisher key to compare against. A policy
// value this version doesn't know is treated as PUBLISHER_ONLY, so a newer,
// stricter choice is never read as permission.
export function evaluatePlacementPermission(publication, placer = {}) {
    if (placementPolicyOf(publication) === PlacementPolicy.ANYONE) {
        return { allowed: true, reason: PlacementPermissionReason.ALLOWED };
    }
    const identityId = placer && placer.identityId ? placer.identityId : null;
    const username = placer && placer.username ? placer.username : null;
    if (!identityId && !username) {
        return { allowed: false, reason: PlacementPermissionReason.NO_PLACER };
    }
    const publisherId = publication.publisherIdentity ? publication.publisherIdentity.id : null;
    const isPublisher = publisherId
        ? identityId === publisherId
        : !!username && username === publication.author;
    return isPublisher
        ? { allowed: true, reason: PlacementPermissionReason.ALLOWED }
        : { allowed: false, reason: PlacementPermissionReason.PUBLISHER_ONLY };
}

export class PlacementNotPermittedError extends Error {
    constructor(publicationId, reason) {
        super(`Only its publisher may place publication "${publicationId}"`);
        this.name = 'PlacementNotPermittedError';
        this.publicationId = publicationId;
        this.reason = reason;
    }
}
