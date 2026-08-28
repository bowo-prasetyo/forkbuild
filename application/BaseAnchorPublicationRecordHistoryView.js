// 0.8.99 — Durable Base Publication Identity Record.
//
// The narration layer for application/BaseAnchorPublicationRecordHistory.js
// — mirroring application/BitcoinAnchorPublicationRecordHistoryView.js
// (0.8.80) exactly, one chain over:
//
//   describeBaseAnchorPublicationRecordHistoryEntry(record)
//     -> { contentHash, txid, network, createdAt }
//
//   describeBaseAnchorPublicationRecordHistory(history)
//     -> { count, records: [...] }, in the SAME order `history` itself
//       holds them — oldest first, never sorted, grouped, or reordered.
//
// IDENTITY, NARRATED — NEVER SCORED. Every field this file returns is
// carried through UNCHANGED from the record itself. There is no
// `included`, `confirmed`, `valid`, `trusted`, `safe`, `healthy`,
// `canonical`, or `status` field anywhere in this file's output — the
// identical restraint application/BaseAnchorPublicationRecord.js's own
// header already holds, held here again for its own presentation. A
// person reading this narration learns exactly what a publication record
// itself knows: what was published, as which Base transaction, on which
// network, and when this replica minted that identity — never whether it
// was later included in a block, which is answered entirely separately by
// application/PublicationObservationArchive.js's own
// `baseTransactionInclusionObservationsByTransactionHash` collection
// (0.8.96/0.8.97, unchanged).
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access. Calling this function twice with byte-identical
// arguments returns a byte-identical result.
export function describeBaseAnchorPublicationRecordHistoryEntry(record) {
    if (!record) return null;
    return Object.freeze({
        contentHash: record.contentHash,
        txid: record.txid,
        network: record.network,
        createdAt: record.createdAt
    });
}

export function describeBaseAnchorPublicationRecordHistory(history) {
    const records = (Array.isArray(history) ? history : [])
        .map((record) => describeBaseAnchorPublicationRecordHistoryEntry(record))
        .filter((entry) => entry !== null);
    return Object.freeze({ count: records.length, records: Object.freeze(records) });
}
