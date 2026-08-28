import { BitcoinAnchorChainPlacementObservationOutcome } from './BitcoinAnchorChainPlacementObservation.js';

// 0.8.76 — Bitcoin Anchor Chain Placement Change Observation.
//
// application/BitcoinAnchorChainPlacementObserver.js's own
// `observeBitcoinAnchorChainPlacementChanges()` already produces a
// sequence of comparisons. This file is the presentation layer for that
// sequence — mirroring application/
// BitcoinAnchorConfirmationObservationHistoryView.js's own shape exactly,
// one layer up:
//
//   describeBitcoinAnchorChainPlacementObservationOutcomeLabel(outcome, ...)
//     UNCHANGED                 → "Observed block placement unchanged."
//     PLACEMENT_CHANGED         → "Observed block placement changed."
//     INSUFFICIENT_OBSERVATIONS → "Not enough confirmed observations exist
//                                  yet to compare block placement."
//     INCOMPARABLE              → "These observations cannot be compared
//                                  for block placement."
//
//   describeBitcoinAnchorChainPlacementObservations(result)
//     → { count, comparisons: [{ outcome, outcomeLabel,
//          previousObservationIndex, laterObservationIndex,
//          previousBlock, laterBlock }, ...] }
//     in the SAME order `result.comparisons` already holds them.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated one more time from
// docs/Principles.md, "A Changed Observation Is Not Automatically A
// Reorganization (0.8.76)": every sentence this file produces names what
// the two compared observations themselves say, never what a person
// should conclude about why they differ. "Observed block placement
// changed" is as far as this vocabulary ever goes — never "reorganization
// detected," never "invalid," never "unsafe," never "unreliable."
//
// NOTHING IS EVER DISCARDED FOR A PLACEMENT_CHANGED RESULT. `previousBlock`
// and `laterBlock` carry `blockHash`, `blockHeight`, `confirmationCount`,
// and `observedAt` through from `result.previous`/`result.later`
// completely unchanged — for EVERY outcome, not only `PLACEMENT_CHANGED`,
// so a person inspecting an `UNCHANGED` or `INCOMPARABLE` comparison sees
// the same full pair of facts a `PLACEMENT_CHANGED` one would show. Only
// `outcomeLabel` is new, and it is a sentence describing an existing
// `outcome`/pair of indices, never a new fact.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// caching. Calling either function twice with byte-identical arguments
// returns a byte-identical result.
export function describeBitcoinAnchorChainPlacementObservationOutcomeLabel(outcome, previousObservationIndex = null, laterObservationIndex = null) {
    const positions = (Number.isInteger(previousObservationIndex) && Number.isInteger(laterObservationIndex))
        ? ` between observation ${previousObservationIndex} and observation ${laterObservationIndex}`
        : '';

    switch (outcome) {
        case BitcoinAnchorChainPlacementObservationOutcome.UNCHANGED:
            return `Observed block placement unchanged${positions}.`;
        case BitcoinAnchorChainPlacementObservationOutcome.PLACEMENT_CHANGED:
            return `Observed block placement changed${positions}.`;
        case BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS:
            return 'Not enough confirmed observations exist yet to compare block placement.';
        case BitcoinAnchorChainPlacementObservationOutcome.INCOMPARABLE:
            return `These observations cannot be compared for block placement${positions}.`;
        default:
            return null;
    }
}

export function describeBitcoinAnchorChainPlacementObservations(result) {
    const comparisons = (result && Array.isArray(result.comparisons) ? result.comparisons : [])
        .map((comparison) => Object.freeze({
            outcome: comparison.outcome,
            outcomeLabel: describeBitcoinAnchorChainPlacementObservationOutcomeLabel(
                comparison.outcome, comparison.previousObservationIndex, comparison.laterObservationIndex
            ),
            previousObservationIndex: comparison.previousObservationIndex,
            laterObservationIndex: comparison.laterObservationIndex,
            previousBlock: toBlockDescription(comparison.previous),
            laterBlock: toBlockDescription(comparison.later)
        }));
    return Object.freeze({ count: comparisons.length, comparisons: Object.freeze(comparisons) });
}

function toBlockDescription(observation) {
    if (!observation) return null;
    return Object.freeze({
        blockHash: observation.blockHash,
        blockHeight: observation.blockHeight,
        confirmationCount: observation.confirmationCount,
        observedAt: observation.observedAt
    });
}
