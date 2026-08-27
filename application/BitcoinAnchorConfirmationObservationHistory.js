// 0.8.56 — Bitcoin Anchor Confirmation Observation History & Per-Observation
// Inspection.
//
// anchoring/BitcoinAnchorConfirmationObserver.js#observeConfirmation() (0.8.54)
// already names ONE frozen fact: what an injected confirmationSource
// reported, about one txid, at one moment THIS replica's own clock
// recorded — `{ state, txid, blockHash, blockHeight, confirmationCount,
// reason, observedAt }`. That class's own header already anticipated this
// file exactly: "A caller that wants a HISTORY of observations... keeps
// that history itself; this class's only job is answering 'what does the
// network report RIGHT NOW,' once, per call." This file is that caller-
// kept history, mirroring application/SnapshotMaterializationHistory.js
// (0.8.38) and application/SnapshotPeerPossessionObservationHistory.js
// (0.8.41)'s own identical append-only shape exactly, one domain over:
//
//   []
//     │  appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs)
//     ▼
//   [obs1]
//     │  appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2)
//     ▼
//   [obs1, obs2]
//     │ ...
//     ▼
//   [obs1, obs2, obs3, ...]
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from those two files'
// own headers, one domain over: a history is APPENDED TO, NEVER
// OVERWRITTEN, NEVER MUTATED, and never reordered, deduplicated, or
// filtered down to "the current answer." Given the sequence
//
//   10:00  NOT_CONFIRMED
//   10:10  CONFIRMED block A / height 900000
//   10:30  CONFIRMED block A / height 900001
//
// the history holds all three entries, in that order, forever — reaching
// CONFIRMED at 10:10 never rewrites or discards the NOT_CONFIRMED entry
// from 10:00, and the height-900001 observation at 10:30 never rewrites
// or discards the height-900000 one from 10:10. Every explicit "Check
// Confirmation" click gets its own entry, in the order it happened, even
// when it reports the identical state and block as the entry before it —
// this file never collapses repeated identical observations into one.
//
// `appendBitcoinAnchorConfirmationObservationHistoryEntry()` never mutates
// the `history` array it was given — the same "always a new frozen array"
// discipline application/SnapshotMaterializationHistory.js's own
// `appendSnapshotMaterializationHistoryEntry()` already holds. A caller
// keeps whatever this function returns as the new history; the old array
// is left untouched.
//
// NO REORGANIZATION DETECTION, HERE OR ANYWHERE ELSE IN THIS MILESTONE.
// The sequence above, by itself, LOOKS like ordinary confirmation-count
// progress on a single block. A history whose two CONFIRMED entries named
// two DIFFERENT `blockHash` values for the same txid would look
// different — a possible chain reorganization — but this file does not
// compare entries against one another, does not flag disagreement, and
// introduces no `REORG_DETECTED` or similar vocabulary. It only ever
// preserves what anchoring/BitcoinAnchorConfirmationObserver.js's own
// header already promised it would: `blockHash` alongside `blockHeight`
// and `confirmationCount`, never collapsed away. Comparing sequential
// observations and naming what a disagreement between them means is real,
// separately sized future work — see docs/Roadmap.md, "0.8.56 — Bitcoin
// Anchor Confirmation Observation History."
//
// NEVER PERSISTED, NEVER SHARED, NEVER TRANSMITTED — the identical
// restraint anchoring/BitcoinAnchorConfirmationObserver.js's own header
// already holds for a single observation, now extended to the sequence as
// a whole. This history is never written onto a core/PublicationAnchor.js,
// a catalog, or a Publication Replica Package. It lives only in whatever
// ephemeral component state a caller keeps for the lifetime of the page —
// reset to empty the moment the Publication Center is reopened, exactly
// like application/SnapshotMaterializationHistory.js's own
// `entry.materializationHistory` and application/
// SnapshotPeerPossessionObservationHistory.js's own equivalent. Two
// replicas that observe the identical txid through the identical sequence
// of confirmation checks each hold their own, entirely separate history —
// there is no notion of a shared or canonical history.
export function appendBitcoinAnchorConfirmationObservationHistoryEntry(history, observation) {
    const existing = Array.isArray(history) ? history : [];
    if (!observation) return Object.freeze(existing.slice());
    return Object.freeze([...existing, observation]);
}

// The single MOST RECENT entry in `history` — the entry with the latest
// `observedAt` among every entry this history holds — or `null` for an
// empty history. This is the one place this file lets "current" mean
// anything at all: never a live re-query of the Bitcoin network (nothing
// here consults a confirmationSource), only "the newest fact this
// replica's own history happens to have on file," the identical
// restraint application/SnapshotPeerPossessionObservationHistory.js's own
// `latestSnapshotPeerPossessionObservationsByPeer()` already holds, one
// axis over. A tie (an identical `observedAt` millisecond) keeps whichever
// entry appears LATER in `history` — history is already chronological, so
// that is still the more recent of the two. The earlier entries this
// function does not return are never discarded — they remain exactly
// where `history` already holds them; this function only ever reads.
export function latestBitcoinAnchorConfirmationObservation(history) {
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
