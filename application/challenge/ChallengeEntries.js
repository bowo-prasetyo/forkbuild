// A week's challenge entries (core/BuildChallenge.js): the published builds
// this device knows of that carry the week's tag, read from their snapshots
// (`tagsOf`), plus those found on the networks under that tag (`loggedIds`,
// application/challenge/ChallengeEntryLog.js), whose snapshots this device
// doesn't have. Each build is listed once, by its newest Publication, newest
// first.
//
// Pure: callers pass the Publications this device knows of.
export function listChallengeEntries({ publications, tag, tagsOf = () => [], loggedIds = [] }) {
    if (!Array.isArray(publications) || typeof tag !== 'string' || !tag) return [];
    const logged = new Set(Array.isArray(loggedIds) ? loggedIds : []);
    const newestByDocument = new Map();
    for (const publication of publications) {
        if (!publication || typeof publication.documentId !== 'string' || !publication.documentId) continue;
        if (!logged.has(publication.id) && !carriesTag(tagsOf, publication, tag)) continue;
        const current = newestByDocument.get(publication.documentId);
        if (!current || time(publication) > time(current)) newestByDocument.set(publication.documentId, publication);
    }
    return [...newestByDocument.values()].sort((a, b) => (time(b) - time(a)) || compareIds(a.id, b.id));
}

function carriesTag(tagsOf, publication, tag) {
    try {
        const tags = tagsOf(publication);
        return Array.isArray(tags) && tags.includes(tag);
    } catch {
        return false;
    }
}

function time(publication) {
    const value = new Date(publication.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}

function compareIds(a, b) {
    return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
}
