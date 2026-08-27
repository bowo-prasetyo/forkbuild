import { describeBitcoinAnchorConfirmationObservationHistory } from './BitcoinAnchorConfirmationObservationHistoryView.js';
import { BitcoinAnchorConfirmationState } from './BitcoinAnchorConfirmationState.js';

// 0.8.56 — Bitcoin Anchor Confirmation Observation History & Per-Observation
// Inspection.
//
// application/BitcoinAnchorConfirmationObservationHistoryView.js already
// turns application/BitcoinAnchorConfirmationObservationHistory.js's own
// accumulated SEQUENCE of observations into a full per-observation
// narration — `stateLabel`, `blockHash`, `blockHeight`, `confirmationCount`,
// `reason`, `observedAt` — in the order they happened. Neither that file
// nor the history it narrates makes the sequence INSPECTABLE one
// observation at a time — a caller wanting that still has to read
// `describeBitcoinAnchorConfirmationObservationHistory()`'s own
// `observations` array directly. This file is that inspection layer,
// mirroring application/SnapshotMaterializationHistoryDetailView.js
// (0.8.44) and application/SnapshotPeerPossessionObservationDetailView.js
// (0.8.45)'s own identical shape exactly, one domain over: it adds
// exactly ONE new, UI-ready convenience — a short `stateShortLabel`
// ("Confirmed"/"Not confirmed"/"Unavailable") sized for a condensed,
// chronological row ("10:10 — Confirmed at block 900000"), alongside the
// SAME full-sentence `stateLabel` ("Transaction confirmed") the composed
// layer beneath this one already narrates, for whichever single
// observation a person expands:
//
//   [10:00]
//     State: Not confirmed
//     Transaction: ...
//     Observed: ...
//
//   [10:10]
//     State: Confirmed
//     Block height: 900000
//     Block hash: ...
//     Confirmations: 1
//     Observed: ...
//
//   describeBitcoinAnchorConfirmationObservationHistoryDetails(history)
//     → { count, entries: [...] }, in the SAME order `history` itself
//       holds them — oldest first, exactly as application/
//       BitcoinAnchorConfirmationObservationHistoryView.js#describeBitcoinAnchorConfirmationObservationHistory()
//       already returns them. Never sorted, grouped, or reordered by
//       state or block.
//   describeBitcoinAnchorConfirmationObservationDetail(observation)
//     → one observation's own description, or null for no observation —
//       the identical single-record convenience application/
//       SnapshotPeerPossessionObservationDetailView.js's own
//       `describeSnapshotPeerPossessionObservationDetail()` already
//       provides, one domain over.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: an observation describes the
// network AT THE TIME IT WAS MADE, not the current state of the
// transaction — inspection must not reinterpret an earlier observation in
// light of a later one, and must not turn "what was reported at 10:10"
// into "what is true now." Both functions add ZERO new facts and perform
// ZERO new work — `txid`, `state`, `blockHash`, `blockHeight`,
// `confirmationCount`, `reason`, and `observedAt` are all carried through
// unchanged from `describeBitcoinAnchorConfirmationObservationHistory()`'s
// own result; `stateShortLabel` is the one new field, and it is a
// DIFFERENT existing sentence for the SAME `state` a full-sentence
// `stateLabel` already carries — brought together here for one
// observation, never recomputed or reworded. Neither function re-queries
// a confirmationSource, contacts the Bitcoin network, mutates the
// observation or the array it was given, or reads any state beyond the
// observation itself — this file takes no observer, coordinator, or use
// case as an argument, so there is no way for it to perform a new
// network read.
//
// And, restated one more time because it is the entire point of this
// file: no observation is ever ranked against another, and NO
// `confidence`, `reliability`, `strength`, `security`, `mostRecent` (as a
// label ABOUT that entry, distinct from application/
// BitcoinAnchorConfirmationObservationHistory.js's own separate
// `latestBitcoinAnchorConfirmationObservation()` query), or
// `reorganization`/`REORG_DETECTED` field is ever added here — this
// milestone's entire restraint, restated from application/
// BitcoinAnchorConfirmationObservationHistory.js's own header: comparing
// observations against one another is real, separately sized future
// work. See docs/Principles.md, "An Observation Describes The Network At
// The Time It Was Made, Not The Current State Of The Transaction (0.8.56)."
//
// NEVER PERSISTED, NEVER SHARED, and introduces no new state of its own —
// the identical restraint every file it composes already holds. Pure and
// stateless: no constructor, no injected dependency, no caching. Calling
// either function twice with byte-identical arguments returns a
// byte-identical result.
export function describeBitcoinAnchorConfirmationObservationHistoryDetails(history) {
    const raw = Array.isArray(history) ? history : [];
    const described = describeBitcoinAnchorConfirmationObservationHistory(raw).observations;
    const entries = described.map((entry, index) => Object.freeze({
        ...entry,
        stateShortLabel: describeBitcoinAnchorConfirmationStateShortLabel(raw[index] && raw[index].state)
    }));
    return Object.freeze({ count: entries.length, entries: Object.freeze(entries) });
}

export function describeBitcoinAnchorConfirmationObservationDetail(observation) {
    if (!observation) return null;
    return describeBitcoinAnchorConfirmationObservationHistoryDetails([observation]).entries[0] || null;
}

// A condensed counterpart to application/
// BitcoinAnchorConfirmationObservationHistoryView.js#describeBitcoinAnchorConfirmationStateLabel()'s
// own full sentence — the identical three states, in fewer words, for a
// row that has no room for "Confirmation status unavailable." Carries no
// meaning the full sentence does not already carry.
function describeBitcoinAnchorConfirmationStateShortLabel(state) {
    switch (state) {
        case BitcoinAnchorConfirmationState.CONFIRMED: return 'Confirmed';
        case BitcoinAnchorConfirmationState.NOT_CONFIRMED: return 'Not confirmed';
        case BitcoinAnchorConfirmationState.UNAVAILABLE: return 'Unavailable';
        default: return null;
    }
}
