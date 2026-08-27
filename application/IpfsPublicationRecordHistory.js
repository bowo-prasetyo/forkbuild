// 0.8.71 — IPFS Publication Record History & Inspection.
//
// application/IpfsPublicationRecord.js (0.8.69) already names ONE frozen
// fact: what a publish attempt produced — `{ contentHash, locator,
// publishedAt, publicationMethod }`. Every existing IPFS UI wiring
// (ui/views/DecentralizedPublicationsView.js's own `publishToRemoteIpfs()`,
// 0.8.68/0.8.70) keeps exactly ONE such record at a time, overwritten by
// the next successful publish. This file is the append-only counterpart
// application/BitcoinAnchorConfirmationObservationHistory.js (0.8.56)
// already established for a different domain, one axis over — except
// here, what accumulates is not repeated OBSERVATIONS of one anchor, but
// repeated PUBLICATIONS, each its own record:
//
//   []
//     │  appendIpfsPublicationRecordHistoryEntry(history, recordA)
//     ▼
//   [recordA]
//     │  appendIpfsPublicationRecordHistoryEntry(history, recordB)
//     ▼
//   [recordA, recordB]
//     │ ...
//     ▼
//   [recordA, recordB, recordC, ...]
//
// Publishing the SAME content a second time (a real, common case — a
// person republishes after a provider drops a pin, or simply clicks
// "Publish Again") produces a SECOND record, with its own `locator` and
// `publishedAt`, possibly identical `contentHash`. This history holds
// both, in order, forever — the second publish never overwrites or
// discards the first. A caller wanting "what did the network say about
// publication #1" must still be able to ask that, even after publication
// #2 exists.
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED. `appendIpfsPublicationRecordHistoryEntry()` never mutates
// the `history` array it was given — the same "always a new frozen array"
// discipline `appendBitcoinAnchorConfirmationObservationHistoryEntry()`
// already holds. A caller keeps whatever this function returns as the new
// history; the old array is left untouched. Two records naming the
// identical `contentHash` are never merged into one entry — each publish
// attempt is its own historical fact, even when it reports nothing new.
//
// NO RECONCILIATION OR COMPARISON BETWEEN RECORDS, HERE OR ANYWHERE ELSE
// IN THIS MILESTONE. This file does not ask whether two records name the
// same content, whether a later record "supersedes" an earlier one, or
// which record is "canonical." It only ever appends and reads back the
// most recent entry — see application/IpfsPublicationRecordHistoryView.js
// for the narration layer, which carries the identical restraint.
//
// NEVER PERSISTED, NEVER SHARED, NEVER TRANSMITTED — the identical
// restraint application/IpfsPublicationRecord.js's own header already
// holds for a single record, extended to the sequence as a whole. This
// history lives only in whatever ephemeral component state a caller keeps
// for the lifetime of the page — reset to empty the moment the
// Publication Center is reopened. Two replicas that publish the identical
// content through the identical sequence of publish clicks each hold
// their own, entirely separate history — there is no notion of a shared
// or canonical history.
export function appendIpfsPublicationRecordHistoryEntry(history, record) {
    const existing = Array.isArray(history) ? history : [];
    if (!record) return Object.freeze(existing.slice());
    return Object.freeze([...existing, record]);
}

// The single MOST RECENT entry in `history` — the entry with the latest
// `publishedAt` among every entry this history holds — or `null` for an
// empty history. Never a live re-publish, never a re-query of anything;
// only "the newest fact this replica's own history happens to have on
// file," the identical restraint
// `latestBitcoinAnchorConfirmationObservation()` already holds, one axis
// over. A tie (an identical `publishedAt` millisecond) keeps whichever
// entry appears LATER in `history` — history is already chronological, so
// that is still the more recent of the two. The earlier entries this
// function does not return are never discarded — they remain exactly
// where `history` already holds them; this function only ever reads.
export function latestIpfsPublicationRecord(history) {
    const list = Array.isArray(history) ? history : [];
    let latest = null;
    for (const record of list) {
        if (!record) continue;
        if (!latest || record.publishedAt.getTime() >= latest.publishedAt.getTime()) {
            latest = record;
        }
    }
    return latest;
}
