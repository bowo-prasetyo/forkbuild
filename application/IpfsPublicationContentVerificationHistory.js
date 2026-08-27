// 0.8.72 — IPFS Publication Verification History & Inspection UI.
//
// application/IpfsPublicationContentVerificationCoordinator.js#verify()
// (0.8.70) already names ONE frozen fact: what a single retrieval-and-
// compare attempt found about ONE application/IpfsPublicationRecord.js
// instance — `{ state, contentHash, locator, reason, observedAt }`. Until
// this milestone, ui/views/DecentralizedPublicationsView.js kept only the
// single MOST RECENT such outcome per history record, in `entry.
// ipfsPublicationVerificationsByRecordIndex[index]` (0.8.71) — a second
// "Verify Again" click silently overwrote the first. This file is the
// append-only counterpart application/
// BitcoinAnchorConfirmationObservationHistory.js (0.8.56) already
// established for repeated OBSERVATIONS of one anchor, and application/
// IpfsPublicationRecordHistory.js (0.8.71) already established for
// repeated PUBLICATIONS — applied here to a third, independent axis: the
// repeated OBSERVATIONS a person can make of one already-published
// record.
//
//   []
//     │  appendIpfsPublicationContentVerificationHistoryEntry(history, obs1)
//     ▼
//   [obs1]                                          (obs1.state === HASH_MATCH)
//     │  appendIpfsPublicationContentVerificationHistoryEntry(history, obs2)
//     ▼
//   [obs1, obs2]                                     (obs2.state === UNAVAILABLE)
//     │ ...
//     ▼
//   [obs1, obs2, obs3, ...]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED — the identical restraint both files named above already
// hold, restated verbatim one axis over. Re-verifying the SAME record and
// getting the SAME state back (two HASH_MATCH observations in a row)
// still appends a second, distinct entry; this file never collapses
// repeated identical observations into one, and a later observation never
// rewrites an earlier entry's own recorded `state`/`reason`/`observedAt`.
//
// `appendIpfsPublicationContentVerificationHistoryEntry()` never mutates
// the `history` array it was given — the same "always a new frozen array"
// discipline every history file before it already holds. A caller keeps
// whatever this function returns as the new history; the old array is
// left untouched.
//
// NO COMPARISON BETWEEN OBSERVATIONS, HERE OR ANYWHERE ELSE IN THIS
// MILESTONE. This file does not ask whether two observations agree,
// whether a later one "supersedes" an earlier one, or compute any
// aggregate `status`/`confidence`/`trusted`/`healthy`/`valid` field from
// the sequence. It only ever appends, and reads back the single most
// recent entry — see application/
// IpfsPublicationContentVerificationHistoryView.js for the narration
// layer, which carries the identical restraint over the full sequence.
//
// NEVER PERSISTED, NEVER SHARED, NEVER TRANSMITTED — the identical
// restraint every history file before it already holds. This history
// lives only in whatever ephemeral component state a caller keeps for the
// lifetime of the page — reset to empty the moment the Publication Center
// is reopened. Two replicas that verify the identical record through the
// identical sequence of "Verify Again" clicks each hold their own,
// entirely separate history.
export function appendIpfsPublicationContentVerificationHistoryEntry(history, observation) {
    const existing = Array.isArray(history) ? history : [];
    if (!observation) return Object.freeze(existing.slice());
    return Object.freeze([...existing, observation]);
}

// The single MOST RECENT entry in `history` — the entry with the latest
// `observedAt` among every entry this history holds — or `null` for an
// empty history. Never a live re-verification, never a re-query of
// anything; only "the newest fact this record's own history happens to
// have on file," the identical restraint
// `latestBitcoinAnchorConfirmationObservation()`/
// `latestIpfsPublicationRecord()` already hold, one axis over. A tie (an
// identical `observedAt` millisecond) keeps whichever entry appears LATER
// in `history` — history is already chronological, so that is still the
// more recent of the two. The earlier entries this function does not
// return are never discarded — they remain exactly where `history`
// already holds them; this function only ever reads.
export function latestIpfsPublicationContentVerification(history) {
    const list = Array.isArray(history) ? history : [];
    let latest = null;
    for (const observation of list) {
        if (!observation) continue;
        if (!latest || observation.observedAt.getTime() >= latest.observedAt.getTime()) {
            latest = observation;
        }
    }
    return latest;
}
