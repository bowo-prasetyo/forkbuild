import { compareBitcoinAnchorObservationConsistency } from './BitcoinAnchorObservationConsistencyState.js';

// 0.8.77 — Bitcoin Anchor Observation Consistency Analysis.
//
// application/BitcoinAnchorObservationConsistencyState.js compares exactly
// TWO observations. This file is the layer above it that makes 0.8.56's
// own accumulated HISTORY usable for that analysis — mirroring
// application/BitcoinAnchorChainPlacementObserver.js's own (0.8.76) walk
// EXACTLY, one analysis over: it walks a history's own observations, in
// the order they happened, and analyzes each adjacent pair —
//
//   [obs1, obs2, obs3, obs4]
//        │       │       │
//        ▼       ▼       ▼
//   analyze(1,2) analyze(2,3) analyze(3,4)
//        │       │       │
//        ▼       ▼       ▼
//     finding1  finding2  finding3
//
// — never a single "is this anchor's history okay" verdict, and never an
// analysis against anything other than a real, adjacent, earlier
// observation this replica already recorded.
//
// TAKES NO CONFIRMATION SOURCE, MAKES NO NETWORK CALL, CONSUMES ONLY
// OBSERVATIONS THIS REPLICA ALREADY HOLDS. Exactly like application/
// BitcoinAnchorChainPlacementObserver.js's own header already draws this
// line: 0.8.54's own `observeConfirmation()` answers "what does the
// network report RIGHT NOW"; this file answers a strictly narrower,
// entirely offline question — "are two records this replica ALREADY HOLDS
// internally consistent with each other?"
//
// "SELECT OBSERVATIONS BELONGING TO THE SAME ANCHOR IDENTITY" IS A
// DEFENSIVE FILTER, NEVER A REORDERING — the identical restraint, and the
// identical reasoning, application/BitcoinAnchorChainPlacementObserver.js's
// own header already holds: `history` is ordinarily already scoped to one
// anchor's own observations, and narrowing to the observations sharing
// the FIRST entry's own `txid` exists only to guard against a
// caller-supplied history that, by mistake, mixed two anchors' own
// observations together.
//
// EVERY FINDING NAMES ITS OWN OBSERVATIONS' POSITIONS IN THE ORIGINAL
// HISTORY, NEVER IN THE FILTERED SUBSET, and PRESERVES THE COMPLETE
// OBSERVATIONS RESPONSIBLE FOR IT — never collapsed to `{ state:
// "inconsistent" }` alone. `previousObservationIndex`/
// `laterObservationIndex` are 1-based positions in the exact `history`
// array the caller supplied — the same array a "Confirmation History"
// disclosure already numbers on screen — and `previousObservation`/
// `laterObservation` are the two full observation objects themselves, so
// a person can move from "an inconsistency was found" back to "these were
// the two actual observations from which that statement was derived."
//
// NEVER MUTATES, NEVER APPENDS, NEVER PERSISTS, NEVER QUERIES BITCOIN OR
// ESPLORA, NEVER SELECTS AN AUTHORITATIVE OBSERVATION, NEVER REPAIRS OR
// DELETES AN OBSERVATION. This function only ever reads `history`; it
// does not import `appendBitcoinAnchorConfirmationObservationHistoryEntry()`,
// does not import anything from application/PublicationObservationArchive.js
// or storage/, and returns a brand-new, frozen result every call —
// `history` and every observation inside it are exactly what they were
// before this function was called.
export function analyzeBitcoinAnchorObservationConsistency(history) {
    const list = (Array.isArray(history) ? history : []).filter(Boolean);

    if (list.length === 0) {
        return Object.freeze({ count: 0, findings: Object.freeze([]) });
    }

    const indexed = list.map((observation, index) => Object.freeze({ observation, index }));
    const anchorTxid = indexed[0].observation.txid;
    const sameAnchor = indexed.filter((item) => item.observation.txid === anchorTxid);

    if (sameAnchor.length < 2) {
        const only = sameAnchor[0] || null;
        const outcome = compareBitcoinAnchorObservationConsistency(only ? only.observation : null, null);
        return Object.freeze({
            count: 1,
            findings: Object.freeze([toFindingEntry(outcome, only ? only.index + 1 : null, null)])
        });
    }

    const findings = [];
    for (let i = 0; i < sameAnchor.length - 1; i += 1) {
        const previousItem = sameAnchor[i];
        const laterItem = sameAnchor[i + 1];
        const outcome = compareBitcoinAnchorObservationConsistency(previousItem.observation, laterItem.observation);
        findings.push(toFindingEntry(outcome, previousItem.index + 1, laterItem.index + 1));
    }

    return Object.freeze({ count: findings.length, findings: Object.freeze(findings) });
}

function toFindingEntry(outcome, previousObservationIndex, laterObservationIndex) {
    return Object.freeze({
        state: outcome.state,
        finding: outcome.finding,
        previousObservation: outcome.previous,
        laterObservation: outcome.later,
        previousObservationIndex,
        laterObservationIndex
    });
}
