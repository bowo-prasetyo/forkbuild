import { PublicationCommentary } from './PublicationCommentary.js';

// 0.9.242 — Publication Commentary Domain Boundary.
//
// The three queries core/PublicationCommentary.js's own domain boundary
// actually needs — add one, look one up by its own id, and list every
// commentary for one Publication — held as plain functions over an
// ordinary array, NOT a Repository class. This milestone's own brief is
// explicit about why: don't create a repository merely because
// repositories are fashionable. An in-memory collection is enough to
// establish the domain seam; persistence, querying at scale, and a real
// storage adapter are all later, separate milestones, exactly the same
// deferral application/IpfsPublicationRecordHistory.js's own 0.8.71
// header already drew for a different domain one milestone family over.
//
// APPEND-ONLY, EXACTLY LIKE THAT FILE'S OWN DISCIPLINE:
// addPublicationCommentary() never mutates the array it was given — it
// returns a NEW array with the new commentary appended, leaving the old
// one untouched. Two Publications never contaminate each other's
// commentary here: getPublicationCommentariesForPublication() filters
// strictly by `publicationId`, so P1's commentary and P2's commentary —
// even when both trace back to the same underlying Document — are
// always read back as two disjoint lists.
export function addPublicationCommentary(collection, commentary) {
    if (!(commentary instanceof PublicationCommentary)) {
        throw new Error('addPublicationCommentary: a PublicationCommentary instance is required');
    }
    const existing = Array.isArray(collection) ? collection : [];
    return [...existing, commentary];
}

export function getPublicationCommentaryById(collection, commentaryId) {
    const existing = Array.isArray(collection) ? collection : [];
    return existing.find((commentary) => commentary.commentaryId === commentaryId) || null;
}

export function getPublicationCommentariesForPublication(collection, publicationId) {
    const existing = Array.isArray(collection) ? collection : [];
    return existing.filter((commentary) => commentary.publicationId === publicationId);
}
