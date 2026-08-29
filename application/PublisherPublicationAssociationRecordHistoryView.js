// 0.8.108 — Explicit Publisher Identity Association.
//
// The narration layer for application/
// PublisherPublicationAssociationRecordHistory.js — mirroring application/
// PublicationReferenceRecordHistoryView.js (0.8.104) exactly, one
// relationship over:
//
//   describePublisherPublicationAssociationRecordHistoryEntry(record)
//     -> { publisherIdentity, publicationIdentity, createdAt }
//
//   describePublisherPublicationAssociationRecordHistory(history)
//     -> { count, records: [...] }, in the SAME order `history` itself
//       holds them — oldest first, never sorted, grouped, or reordered.
//
// IDENTITY, NARRATED — NEVER SCORED. Every field this file returns is
// carried through UNCHANGED from the record itself, including the exact
// `PublisherIdentityRecord` (0.8.108) and `BlockchainPublicationIdentity`
// (0.8.89) instances each record already carries — never re-serialized,
// never re-derived. There is no `weight`, `strength`, `verified`,
// `canonical`, or `status` field anywhere in this file's output — the
// identical restraint `application/PublisherPublicationAssociationRecord.js`'s
// own header already holds, held here again for its own presentation.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access. Calling this function twice with byte-identical
// arguments returns a byte-identical result.
export function describePublisherPublicationAssociationRecordHistoryEntry(record) {
    if (!record) return null;
    return Object.freeze({
        publisherIdentity: record.publisherIdentity,
        publicationIdentity: record.publicationIdentity,
        createdAt: record.createdAt
    });
}

export function describePublisherPublicationAssociationRecordHistory(history) {
    const records = (Array.isArray(history) ? history : [])
        .map((record) => describePublisherPublicationAssociationRecordHistoryEntry(record))
        .filter((entry) => entry !== null);
    return Object.freeze({ count: records.length, records: Object.freeze(records) });
}
