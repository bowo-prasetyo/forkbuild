import { AnnouncementKind } from './AnnouncementKinds.js';
import { PlacementRecord } from '../../core/PlacementRecord.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';

const MAX_CACHED_VERDICTS = 5000;

// The Announcement Index's isKeptFirst: a record stays ahead of the rest when
// a followed, unblocked identity signed it. Only kinds whose payload carries a
// signature by an identity qualify: a Snapshot with its publisher's signed
// placement, and a Place Naming claim. A Publication lead is only a URI, so
// who published it is unknown until it is resolved.
//
// The signature is checked, not just the identity named, so nobody but the
// followed identity can have records kept in their name.
export function createFollowedAnnouncementRetention({ isFollowing, isBlocked = () => false, verifier = new LocalAuthorizationVerifier() }) {
    const verdicts = new Map();
    const verified = (cacheKey, check) => {
        if (verdicts.has(cacheKey)) return verdicts.get(cacheKey);
        let valid = false;
        try {
            const result = check();
            valid = Boolean(result && result.valid && result.signed);
        } catch {
            valid = false;
        }
        if (verdicts.size >= MAX_CACHED_VERDICTS) verdicts.clear();
        verdicts.set(cacheKey, valid);
        return valid;
    };
    const followed = (identityId) => typeof identityId === 'string' && isFollowing(identityId) && !isBlocked(identityId);

    return (kind, payload) => {
        if (!payload || typeof payload !== 'object') return false;
        if (kind === AnnouncementKind.SNAPSHOT) {
            const record = payload.placementRecord;
            const owner = record && record.ownerIdentity ? record.ownerIdentity.id : null;
            if (!followed(owner) || !record.signature) return false;
            return verified(`placement ${JSON.stringify(record)}`,
                () => verifier.verifyPlacement(PlacementRecord.fromJSON(record)));
        }
        if (kind === AnnouncementKind.PLACE_NAMING) {
            const claim = payload.claim;
            if (!claim || !followed(claim.authorIdentityId) || !claim.signature) return false;
            return verified(`claim ${JSON.stringify(claim)}`, () => verifier.verifyPlaceNamingClaim(claim));
        }
        return false;
    };
}
