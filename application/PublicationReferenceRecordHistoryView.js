// 0.8.104 — Explicit Publication Reference Relationship.
//
// The narration layer for application/PublicationReferenceRecordHistory.js
// — mirroring application/BaseAnchorPublicationRecordHistoryView.js (0.8.99)
// exactly, one relationship over:
//
//   describePublicationReferenceRecordHistoryEntry(record)
//     -> { sourcePublicationIdentity, referencedPublicationIdentity, createdAt }
//
//   describePublicationReferenceRecordHistory(history)
//     -> { count, records: [...] }, in the SAME order `history` itself
//       holds them — oldest first, never sorted, grouped, or reordered.
//
// IDENTITY, NARRATED — NEVER SCORED. Every field this file returns is
// carried through UNCHANGED from the record itself, including the exact
// `BlockchainPublicationIdentity` (0.8.89) instances each record already
// carries — never re-serialized, never re-derived. There is no `weight`,
// `strength`, `verified`, `canonical`, or `status` field anywhere in this
// file's output — the identical restraint application/
// PublicationReferenceRecord.js's own header already holds, held here
// again for its own presentation.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access. Calling this function twice with byte-identical
// arguments returns a byte-identical result.
export function describePublicationReferenceRecordHistoryEntry(record) {
    if (!record) return null;
    return Object.freeze({
        sourcePublicationIdentity: record.sourcePublicationIdentity,
        referencedPublicationIdentity: record.referencedPublicationIdentity,
        createdAt: record.createdAt
    });
}

export function describePublicationReferenceRecordHistory(history) {
    const records = (Array.isArray(history) ? history : [])
        .map((record) => describePublicationReferenceRecordHistoryEntry(record))
        .filter((entry) => entry !== null);
    return Object.freeze({ count: records.length, records: Object.freeze(records) });
}
