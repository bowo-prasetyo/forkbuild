// One entry per followed identity for the Following page. `publications` is
// FollowingFeed#list()'s output (verified, newest first) and `signerOf` its
// verifiedPublisherOf(). The name is the one saved with the follow, else the
// author name on their newest Publication here, else the end of their ID.
export function buildFollowedPeople({ follows = [], publications = [], signerOf = () => null }) {
    const newestBySigner = new Map();
    const countBySigner = new Map();
    for (const publication of publications) {
        const signer = signerOf(publication);
        if (!signer) continue;
        if (!newestBySigner.has(signer)) newestBySigner.set(signer, publication);
        countBySigner.set(signer, (countBySigner.get(signer) || 0) + 1);
    }
    return follows
        .map((follow) => {
            const newest = newestBySigner.get(follow.identityId) || null;
            return {
                identityId: follow.identityId,
                name: follow.name || (newest && newest.author) || shortIdentityId(follow.identityId),
                publicationCount: countBySigner.get(follow.identityId) || 0,
                latestPublishedAt: newest && newest.publishedAt instanceof Date ? newest.publishedAt : null,
                followedAt: follow.followedAt
            };
        })
        .sort((a, b) => timeOf(b.latestPublishedAt) - timeOf(a.latestPublishedAt)
            || timeOf(b.followedAt) - timeOf(a.followedAt)
            || a.identityId.localeCompare(b.identityId));
}

// The same short form the Peers page shows.
export function shortIdentityId(identityId) {
    return identityId ? `…${identityId.slice(-14)}` : '';
}

function timeOf(date) {
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}
