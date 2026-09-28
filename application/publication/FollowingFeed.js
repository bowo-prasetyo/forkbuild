import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';

// The Publications by identities the signed-in identity follows, drawn from
// what the Repository already knows. Following never fetches anything by
// itself.
//
// A Publication counts only when its signature verifies against the identity
// it names: `publisherIdentity` alone is a claim anyone can type, and an
// unsigned legacy Publication has no identity to follow at all.
export class FollowingFeed {
    constructor({ discoveryProvider, isFollowing, isBlocked = () => false, verifier = new LocalAuthorizationVerifier() }) {
        if (!discoveryProvider || typeof discoveryProvider.list !== 'function') {
            throw new Error('FollowingFeed: a discoveryProvider with list() is required');
        }
        if (typeof isFollowing !== 'function') {
            throw new Error('FollowingFeed: isFollowing is required');
        }
        this._discoveryProvider = discoveryProvider;
        this._isFollowing = isFollowing;
        this._isBlocked = isBlocked;
        this._signerOf = createVerifiedPublisherResolver(verifier);
    }

    // Newest first. With `identityId`, only that identity's Publications.
    list({ identityId = null } = {}) {
        const seen = new Set();
        const items = [];
        for (const publication of this._discoveryProvider.list()) {
            if (!publication || seen.has(publication.id)) continue;
            const signer = this._signerOf(publication);
            if (!signer || (identityId && signer !== identityId)) continue;
            if (!this._isFollowing(signer) || this._isBlocked(signer)) continue;
            seen.add(publication.id);
            items.push(publication);
        }
        return items.sort(newestFirst);
    }

    // The verified signing identity of one Publication, or null.
    verifiedPublisherOf(publication) {
        return this._signerOf(publication);
    }
}

// Returns `(publication) -> identityId | null`. Answers are remembered by
// exactly what verification reads (the signed descriptor, the signature and
// the identity), so a copy that changes any of them is verified afresh.
export function createVerifiedPublisherResolver(verifier = new LocalAuthorizationVerifier()) {
    const cache = new Map();
    return (publication) => {
        if (!publication || typeof publication !== 'object' || !publication.publisherIdentity || !publication.signature) return null;
        let cacheKey;
        try {
            cacheKey = JSON.stringify([publication.getSigningDescriptor(), publication.signature, publication.publisherIdentity]);
        } catch {
            return null;
        }
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        let signer = null;
        try {
            const result = verifier.verifyPublication(publication);
            signer = result && result.valid && result.signed ? publication.publisherIdentity.id : null;
        } catch {
            signer = null;
        }
        if (cache.size >= MAX_CACHED_VERDICTS) cache.clear();
        cache.set(cacheKey, signer);
        return signer;
    };
}

const MAX_CACHED_VERDICTS = 5000;

function newestFirst(a, b) {
    const byDate = timeOf(b) - timeOf(a);
    return byDate !== 0 ? byDate : String(a.id).localeCompare(String(b.id));
}

function timeOf(publication) {
    const time = publication.publishedAt instanceof Date ? publication.publishedAt.getTime() : NaN;
    return Number.isNaN(time) ? 0 : time;
}
