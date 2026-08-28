import { compareBitcoinAnchorChainPlacementObservations } from './BitcoinAnchorChainPlacementObservation.js';

// 0.8.76 — Bitcoin Anchor Chain Placement Change Observation.
//
// application/BitcoinAnchorChainPlacementObservation.js compares exactly
// TWO observations. This file is the layer above it that makes 0.8.56's
// own accumulated HISTORY usable for that comparison: it walks a
// history's own observations, in the order they happened, and compares
// each adjacent pair —
//
//   [obs1, obs2, obs3, obs4]
//        │       │       │
//        ▼       ▼       ▼
//    compare(1,2) compare(2,3) compare(3,4)
//        │       │       │
//        ▼       ▼       ▼
//     result1  result2  result3
//
// — never a single "is the current placement okay" verdict, and never a
// comparison against anything other than a real, adjacent, earlier
// observation this replica already recorded.
//
// TAKES NO CONFIRMATION SOURCE, MAKES NO NETWORK CALL. Unlike
// anchoring/BitcoinAnchorConfirmationObserver.js (0.8.54), which answers
// "what does the network report RIGHT NOW," this file answers a strictly
// narrower, different question — "how do two records this replica
// ALREADY HOLDS differ from each other?" — entirely offline, over
// whatever `history` a caller already has in memory (durable across a
// page reload since 0.8.75, for whichever observations were explicitly
// archived).
//
// "SELECT OBSERVATIONS BELONGING TO THE SAME ANCHOR IDENTITY" IS A
// DEFENSIVE FILTER, NEVER A REORDERING. `history` is ordinarily already
// scoped to one anchor's own observations — exactly the array
// application/BitcoinAnchorConfirmationObservationHistory.js's own
// `appendBitcoinAnchorConfirmationObservationHistoryEntry()` already
// produces. This function narrows to the observations sharing the FIRST
// entry's own `txid` purely to guard against a caller-supplied history
// that, by mistake, mixed two anchors' observations together — it never
// sorts, groups, or drops entries for any other reason, and for a
// correctly-scoped history (the ordinary case) every observation already
// shares one txid, so this filter changes nothing.
//
// EVERY COMPARISON NAMES ITS OWN OBSERVATIONS' POSITIONS IN THE ORIGINAL
// HISTORY, NEVER IN THE FILTERED SUBSET. `previousObservationIndex`/
// `laterObservationIndex` are 1-based positions in the exact `history`
// array the caller supplied — the same array a "Confirmation History"
// disclosure already numbers on screen — so "placement changed between
// observation 2 and observation 3" always points at the observation 2
// and observation 3 already visible there.
//
// NEVER MUTATES, NEVER APPENDS, NEVER PERSISTS. This function only ever
// reads `history`; it does not import
// `appendBitcoinAnchorConfirmationObservationHistoryEntry()`, does not
// import anything from application/PublicationObservationArchive.js or
// storage/, and returns a brand-new, frozen result every call — `history`
// and every observation inside it are exactly what they were before this
// function was called.
export function observeBitcoinAnchorChainPlacementChanges(history) {
    const list = (Array.isArray(history) ? history : []).filter(Boolean);

    if (list.length === 0) {
        return Object.freeze({ count: 0, comparisons: Object.freeze([]) });
    }

    const indexed = list.map((observation, index) => Object.freeze({ observation, index }));
    const anchorTxid = indexed[0].observation.txid;
    const sameAnchor = indexed.filter((item) => item.observation.txid === anchorTxid);

    if (sameAnchor.length < 2) {
        const only = sameAnchor[0] || null;
        const result = compareBitcoinAnchorChainPlacementObservations(only ? only.observation : null, null);
        return Object.freeze({
            count: 1,
            comparisons: Object.freeze([toComparisonEntry(result, only ? only.index + 1 : null, null)])
        });
    }

    const comparisons = [];
    for (let i = 0; i < sameAnchor.length - 1; i += 1) {
        const previousItem = sameAnchor[i];
        const laterItem = sameAnchor[i + 1];
        const result = compareBitcoinAnchorChainPlacementObservations(previousItem.observation, laterItem.observation);
        comparisons.push(toComparisonEntry(result, previousItem.index + 1, laterItem.index + 1));
    }

    return Object.freeze({ count: comparisons.length, comparisons: Object.freeze(comparisons) });
}

function toComparisonEntry(result, previousObservationIndex, laterObservationIndex) {
    return Object.freeze({
        outcome: result.outcome,
        previous: result.previous,
        later: result.later,
        previousObservationIndex,
        laterObservationIndex
    });
}
