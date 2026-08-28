// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
//
// The append-only counterpart of application/BitcoinAnchorPublicationRecord.js
// — mirroring application/IpfsPublicationRecordHistory.js (0.8.71) exactly,
// one domain over:
//
//   []
//     │  appendBitcoinAnchorPublicationRecordHistoryEntry(history, recordA)
//     ▼
//   [recordA]
//     │  appendBitcoinAnchorPublicationRecordHistoryEntry(history, recordB)
//     ▼
//   [recordA, recordB]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED. Two records sharing an identical `contentHash`, or even an
// identical `txid`, are never merged into one entry — each publication
// attempt this replica ever minted an identity for stays its own,
// independent entry, forever. See application/
// BitcoinAnchorPublicationRecord.js's own header, "Why txid Belongs Here,"
// for the concrete reason two such records must never be reconciled.
//
// NO GROUPING BY contentHash, NO GROUPING BY txid, NO AUTOMATIC
// RECONCILIATION OF ANY KIND. `findBitcoinAnchorPublicationRecordByAnchorId()`
// below is the ONLY lookup this file offers, and it looks up by explicit
// `anchorId` alone — never by `contentHash` or `txid` — mirroring exactly
// application/BitcoinAnchorObservationEvidence.js's own (0.8.78) identical
// restraint for observations, held here one layer up, for identity itself.
export function appendBitcoinAnchorPublicationRecordHistoryEntry(history, record) {
    const existing = Array.isArray(history) ? history : [];
    if (!record) return Object.freeze(existing.slice());
    return Object.freeze([...existing, record]);
}

// Every record in `history` whose own `anchorId` matches — in the exact
// order `history` already holds them. The ordinary case is a single
// publication attempt per `anchorId` and therefore a single-entry array,
// but this function never assumes that: it reports every record this
// replica ever minted under that identity, honestly, rather than picking
// one and discarding the rest.
export function findBitcoinAnchorPublicationRecordsByAnchorId(history, anchorId) {
    const list = Array.isArray(history) ? history : [];
    if (typeof anchorId !== 'string' || !anchorId) return Object.freeze([]);
    return Object.freeze(list.filter((record) => record && record.anchorId === anchorId));
}

// The single, EARLIEST record in `history` naming this `anchorId` — the
// one a caller inspecting "the publication record for this anchor" almost
// always means — or `null` when none exists. Never a "latest" or
// "canonical" choice: for the ordinary one-record-per-anchor case this is
// simply that one record; for the honestly-unusual case of more than one,
// a caller that needs every one of them calls
// `findBitcoinAnchorPublicationRecordsByAnchorId()` above instead, which
// never discards any of them.
export function findBitcoinAnchorPublicationRecordByAnchorId(history, anchorId) {
    const matches = findBitcoinAnchorPublicationRecordsByAnchorId(history, anchorId);
    return matches.length > 0 ? matches[0] : null;
}
