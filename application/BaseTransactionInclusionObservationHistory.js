// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// `base/BaseTransactionInclusionObserver.js#observeInclusion()` already
// names ONE frozen fact: what an injected `rpcSource` reported, about one
// txid, at one moment THIS replica's own clock recorded — `{ state, txid,
// blockHash, blockNumber, transactionIndex, confirmationCount, reason,
// observedAt }`. That class's own header already anticipated this file
// exactly: "A caller that wants a HISTORY of observations... keeps that
// history itself; this class's only job is answering 'what does the
// network report RIGHT NOW,' once, per call." This file is that caller-
// kept history, mirroring `application/
// BitcoinAnchorConfirmationObservationHistory.js` (0.8.56)'s own identical
// append-only shape exactly, one chain over:
//
//   []
//     │  appendBaseTransactionInclusionObservationHistoryEntry(history, obs)
//     ▼
//   [obs1]
//     │  appendBaseTransactionInclusionObservationHistoryEntry(history, obs2)
//     ▼
//   [obs1, obs2]
//     │ ...
//     ▼
//   [obs1, obs2, obs3, ...]
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from that file's own
// header, one chain over: a history is APPENDED TO, NEVER OVERWRITTEN,
// NEVER MUTATED, and never reordered, deduplicated, or filtered down to
// "the current answer." Given the sequence
//
//   10:00  NOT_INCLUDED
//   10:10  INCLUDED  block 100 / head 100 / confirmations 1
//   10:30  INCLUDED  block 100 / head 105 / confirmations 6
//
// the history holds all three entries, in that order, forever — reaching
// INCLUDED at 10:10 never rewrites or discards the NOT_INCLUDED entry from
// 10:00, and the six-confirmation observation at 10:30 never rewrites or
// discards the one-confirmation observation from 10:10. Every explicit
// "Observe Transaction" click gets its own entry, in the order it
// happened, even when it reports the identical state and block as the
// entry before it — this file never collapses repeated identical
// observations into one.
//
// `appendBaseTransactionInclusionObservationHistoryEntry()` never mutates
// the `history` array it was given — the same "always a new frozen array"
// discipline `application/BitcoinAnchorConfirmationObservationHistory.js`'s
// own `appendBitcoinAnchorConfirmationObservationHistoryEntry()` already
// holds. A caller keeps whatever this function returns as the new
// history; the old array is left untouched.
//
// NO REORGANIZATION DETECTION, HERE OR ANYWHERE ELSE IN THIS MILESTONE.
// The sequence above, by itself, LOOKS like ordinary confirmation-count
// progress on a single block. A history whose two INCLUDED entries named
// two DIFFERENT `blockHash` values for the same txid would look
// different — a possible chain reorganization — but this file does not
// compare entries against one another, does not flag disagreement, and
// introduces no `REORG_DETECTED` or similar vocabulary. It only ever
// preserves what `base/BaseTransactionInclusionObserver.js`'s own header
// already promised it would: `blockHash` alongside `blockNumber`,
// `transactionIndex`, and `confirmationCount`, never collapsed away.
// Comparing sequential observations and naming what a disagreement
// between them means is real, separately sized future work.
//
// NEVER PERSISTED, NEVER SHARED, NEVER TRANSMITTED — the identical
// restraint `base/BaseTransactionInclusionObserver.js`'s own header
// already holds for a single observation, now extended to the sequence as
// a whole. This history is never written onto a durable publication
// record or archive — see `docs/Roadmap.md`, 0.8.96, "Deliberately
// excluded," on why durable archive integration remains its own, later,
// separately sized milestone. It lives only in whatever ephemeral
// component state a caller keeps for the lifetime of the page — reset to
// empty the moment the Publication Center is reopened, or the moment a
// fresh broadcast replaces the transaction this history was about,
// exactly like `application/BitcoinAnchorConfirmationObservationHistory.js`'s
// own equivalent. Two replicas that observe the identical txid through the
// identical sequence of inclusion checks each hold their own, entirely
// separate history — there is no notion of a shared or canonical history.
export function appendBaseTransactionInclusionObservationHistoryEntry(history, observation) {
    const existing = Array.isArray(history) ? history : [];
    if (!observation) return Object.freeze(existing.slice());
    return Object.freeze([...existing, observation]);
}

// The single MOST RECENT entry in `history` — the entry with the latest
// `observedAt` among every entry this history holds — or `null` for an
// empty history. This is the one place this file lets "current" mean
// anything at all: never a live re-query of Base's own network (nothing
// here consults an rpcSource), only "the newest fact this replica's own
// history happens to have on file," the identical restraint `application/
// BitcoinAnchorConfirmationObservationHistory.js`'s own
// `latestBitcoinAnchorConfirmationObservation()` already holds. A tie (an
// identical `observedAt` millisecond) keeps whichever entry appears LATER
// in `history` — history is already chronological, so that is still the
// more recent of the two. The earlier entries this function does not
// return are never discarded — they remain exactly where `history`
// already holds them; this function only ever reads.
export function latestBaseTransactionInclusionObservation(history) {
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
