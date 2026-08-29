// 0.8.108 — Explicit Publisher Identity Association.
//
// The append-only counterpart of application/
// PublisherPublicationAssociationRecord.js — mirroring application/
// PublicationReferenceRecordHistory.js (0.8.104) exactly, one relationship
// over:
//
//   []
//     │  appendPublisherPublicationAssociationRecordHistoryEntry(history, associationA)
//     ▼
//   [associationA]
//     │  appendPublisherPublicationAssociationRecordHistoryEntry(history, associationB)
//     ▼
//   [associationA, associationB]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED. A publisher associated with the same publication twice is
// TWO independent entries here — never collapsed into one. See
// `application/PublisherPublicationAssociationRecord.js`'s own header,
// "Never Deduplicated," for the full rationale.
//
// LOOKUP IS BY EXPLICIT IDENTITY ALONE — NEVER BY `contentHash`, A SHARED
// WALLET, OR ANY OTHER RESEMBLANCE. `findPublisherPublicationAssociationRecordsByPublisher()`/
// `findPublisherPublicationAssociationRecordsByPublication()` below are
// the only two lookups this file offers, each matching through their own
// identity's own `sameAs()` — the identical explicit-identity discipline
// `application/PublicationReferenceRecordHistory.js`'s own lookups already
// hold, one layer over a publisher/publication relationship instead of a
// publication/publication one.
export function appendPublisherPublicationAssociationRecordHistoryEntry(history, record) {
    const existing = Array.isArray(history) ? history : [];
    if (!record) return Object.freeze(existing.slice());
    return Object.freeze([...existing, record]);
}

// Every record in `history` whose own `publisherIdentity` names the SAME
// publisher as `publisherIdentity` — i.e. every publication that publisher
// has explicitly claimed. In the exact order `history` already holds them;
// never sorted, grouped, or deduplicated.
export function findPublisherPublicationAssociationRecordsByPublisher(history, publisherIdentity) {
    const list = Array.isArray(history) ? history : [];
    if (!publisherIdentity || typeof publisherIdentity.sameAs !== 'function') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record && record.publisherIdentity.sameAs(publisherIdentity)));
}

// Every record in `history` whose own `publicationIdentity` names the SAME
// publication as `publicationIdentity` — i.e. every publisher who has
// explicitly claimed that publication. A publication associated with more
// than one publisher (a genuine, honestly recorded conflict this class
// does not resolve or flag) surfaces here as multiple entries, exactly as
// recorded.
export function findPublisherPublicationAssociationRecordsByPublication(history, publicationIdentity) {
    const list = Array.isArray(history) ? history : [];
    if (!publicationIdentity || typeof publicationIdentity.sameAs !== 'function') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record && record.publicationIdentity.sameAs(publicationIdentity)));
}
