// 0.8.99 — Durable Base Publication Identity Record.
//
// The append-only counterpart of application/BaseAnchorPublicationRecord.js
// — mirroring application/BitcoinAnchorPublicationRecordHistory.js (0.8.80)
// exactly, one chain over:
//
//   []
//     │  appendBaseAnchorPublicationRecordHistoryEntry(history, recordA)
//     ▼
//   [recordA]
//     │  appendBaseAnchorPublicationRecordHistoryEntry(history, recordB)
//     ▼
//   [recordA, recordB]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED. Two records sharing an identical `contentHash`, or even an
// identical `txid`, are never merged into one entry — each publication
// attempt this replica ever minted an identity for stays its own,
// independent entry, forever. See application/
// BaseAnchorPublicationRecord.js's own header for the concrete reason two
// such records must never be reconciled.
//
// LOOKUP IS BY `txid` ALONE — NEVER `contentHash`, AND NEVER A SEPARATE
// `anchorId` (Base has none — see application/
// BaseAnchorPublicationRecord.js's own header, "No `anchorId` field").
// `findBaseAnchorPublicationRecordByTxid()` below is the ONE lookup this
// file offers, mirroring exactly the SAME explicit-identity discipline
// application/BitcoinAnchorPublicationRecordHistory.js's own
// `findBitcoinAnchorPublicationRecordByAnchorId()` already holds — held
// here over Base's own, already-established correlation key instead. No
// grouping by `contentHash`, no automatic reconciliation of any kind.
export function appendBaseAnchorPublicationRecordHistoryEntry(history, record) {
    const existing = Array.isArray(history) ? history : [];
    if (!record) return Object.freeze(existing.slice());
    return Object.freeze([...existing, record]);
}

// Every record in `history` whose own `txid` matches — in the exact order
// `history` already holds them. The ordinary case is a single publication
// attempt per `txid` and therefore a single-entry array, but this function
// never assumes that: it reports every record this replica ever minted
// under that identity, honestly, rather than picking one and discarding
// the rest.
export function findBaseAnchorPublicationRecordsByTxid(history, txid) {
    const list = Array.isArray(history) ? history : [];
    if (typeof txid !== 'string' || !txid) return Object.freeze([]);
    return Object.freeze(list.filter((record) => record && record.txid === txid));
}

// The single, EARLIEST record in `history` naming this `txid` — the one a
// caller inspecting "the publication record for this transaction" almost
// always means — or `null` when none exists. Never a "latest" or
// "canonical" choice: for the ordinary one-record-per-txid case this is
// simply that one record; for the honestly-unusual case of more than one,
// a caller that needs every one of them calls
// `findBaseAnchorPublicationRecordsByTxid()` above instead, which never
// discards any of them.
export function findBaseAnchorPublicationRecordByTxid(history, txid) {
    const matches = findBaseAnchorPublicationRecordsByTxid(history, txid);
    return matches.length > 0 ? matches[0] : null;
}
