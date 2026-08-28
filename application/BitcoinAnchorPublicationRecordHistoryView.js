// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
//
// The narration layer for application/BitcoinAnchorPublicationRecordHistory.js
// — mirroring application/IpfsPublicationRecordHistoryView.js (0.8.71)
// exactly, one domain over:
//
//   describeBitcoinAnchorPublicationRecordHistoryEntry(record)
//     -> { anchorId, contentHash, txid, network, createdAt }
//
//   describeBitcoinAnchorPublicationRecordHistory(history)
//     -> { count, records: [...] }, in the SAME order `history` itself
//       holds them — oldest first, never sorted, grouped, or reordered.
//
// IDENTITY, NARRATED — NEVER SCORED. Every field this file returns is
// carried through UNCHANGED from the record itself. There is no
// `confirmed`, `valid`, `trusted`, `safe`, `healthy`, `canonical`, or
// `status` field anywhere in this file's output — the identical restraint
// application/BitcoinAnchorPublicationRecord.js's own header already
// holds, held here again for its own presentation. A person reading this
// narration learns exactly what a publication record itself knows: what
// was published, as which transaction, on which network, and when this
// replica minted that identity — never whether it was later confirmed,
// which is answered entirely separately by application/
// BitcoinAnchorDurableEvidenceView.js (0.8.79, unchanged).
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access. Calling this function twice with byte-identical
// arguments returns a byte-identical result.
export function describeBitcoinAnchorPublicationRecordHistoryEntry(record) {
    if (!record) return null;
    return Object.freeze({
        anchorId: record.anchorId,
        contentHash: record.contentHash,
        txid: record.txid,
        network: record.network,
        createdAt: record.createdAt
    });
}

export function describeBitcoinAnchorPublicationRecordHistory(history) {
    const records = (Array.isArray(history) ? history : [])
        .map((record) => describeBitcoinAnchorPublicationRecordHistoryEntry(record))
        .filter((entry) => entry !== null);
    return Object.freeze({ count: records.length, records: Object.freeze(records) });
}
