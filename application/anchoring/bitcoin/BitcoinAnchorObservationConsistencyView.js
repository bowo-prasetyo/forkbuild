import {
    BitcoinAnchorObservationConsistencyState,
    BitcoinAnchorObservationConsistencyFindingKind
} from './BitcoinAnchorObservationConsistencyState.js';
import { message } from '../../../core/Message.js';

// 0.8.77 — Bitcoin Anchor Observation Consistency Analysis.
//
// application/anchoring/bitcoin/BitcoinAnchorObservationConsistencyAnalyzer.js's own
// `analyzeBitcoinAnchorObservationConsistency()` already produces a
// sequence of findings. This file is the presentation layer for that
// sequence — mirroring application/anchoring/bitcoin/BitcoinAnchorChainPlacementObservationView.js's
// own shape (0.8.76) exactly, one analysis over:
//
//   describeBitcoinAnchorObservationConsistencyLabel(state, finding, ...)
//     CONSISTENT                 → "No consistency differences were found."
//     INCONSISTENT                → the specific factual sentence naming
//                                   which self-contradictory shape was
//                                   found — e.g. "Confirmation count
//                                   decreased while block placement
//                                   remained unchanged."
//     INSUFFICIENT_OBSERVATIONS  → "Not enough confirmed observations
//                                   exist yet to analyze consistency."
//     INCOMPARABLE                → "These observations cannot be compared
//                                   for consistency."
//
//   describeBitcoinAnchorObservationConsistency(result)
//     → { count, findings: [{ state, stateLabel, finding,
//          previousObservationIndex, laterObservationIndex,
//          previousBlock, laterBlock }, ...] }
//     in the SAME order `result.findings` already holds them.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated from docs/
// Principles.md, "An Internal Inconsistency Is Not Automatically A
// Reorganization (0.8.77)": every sentence this file produces names what
// the two compared observations themselves say, never what a person
// should conclude about why they disagree, and never which of the two (if
// either) is correct. "An observation inconsistency was found" is as far
// as this vocabulary ever goes — never "reorganization detected," never
// "invalid," never "corrupted," never "unreliable."
//
// NOTHING IS EVER DISCARDED FOR AN INCONSISTENT FINDING. `previousBlock`
// and `laterBlock` carry `blockHash`, `blockHeight`, `confirmationCount`,
// and `observedAt` through from `result.findings[].previousObservation`/
// `.laterObservation` completely unchanged — for EVERY state, not only
// `INCONSISTENT`, so a person inspecting a `CONSISTENT` or `INCOMPARABLE`
// finding sees the same full pair of facts an `INCONSISTENT` one would
// show. `finding` itself (the raw `{ kind, ...details }` object, or
// `null`) is also carried through unchanged, so a caller can build its own
// presentation directly from the plain facts rather than this file's own
// sentence alone.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// caching. Calling either function twice with byte-identical arguments
// returns a byte-identical result.
export function describeBitcoinAnchorObservationConsistencyLabel(state, finding = null, previousObservationIndex = null, laterObservationIndex = null) {
    // Each sentence has a form naming the two observations compared, so a
    // translation places them where its grammar needs.
    const positioned = Number.isInteger(previousObservationIndex) && Number.isInteger(laterObservationIndex);
    const said = (key, params = {}) => (positioned
        ? message(`${key}Between`, { ...params, previous: previousObservationIndex, later: laterObservationIndex })
        : message(key, params));

    switch (state) {
        case BitcoinAnchorObservationConsistencyState.CONSISTENT:
            return said('bitcoinAnchorObservationConsistency.noDifferences');
        case BitcoinAnchorObservationConsistencyState.INCONSISTENT:
            return said('bitcoinAnchorObservationConsistency.finding', { finding: describeBitcoinAnchorObservationConsistencyFindingMessage(finding) });
        case BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS:
            return message('bitcoinAnchorObservationConsistency.notEnoughConfirmedObservationsExist');
        case BitcoinAnchorObservationConsistencyState.INCOMPARABLE:
            return said('bitcoinAnchorObservationConsistency.incomparable');
        default:
            return null;
    }
}

function describeBitcoinAnchorObservationConsistencyFindingMessage(finding) {
    if (!finding) return message('bitcoinAnchorObservationConsistency.anObservationInconsistencyWasFound');
    switch (finding.kind) {
        case BitcoinAnchorObservationConsistencyFindingKind.CONFIRMATION_COUNT_DECREASED:
            return message('bitcoinAnchorObservationConsistency.confirmationCountDecreasedWhileBlock');
        case BitcoinAnchorObservationConsistencyFindingKind.BLOCK_HEIGHT_CHANGED_SAME_HASH:
            return message('bitcoinAnchorObservationConsistency.blockHeightChangedWhileThe');
        case BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_SAME_HEIGHT:
            return message('bitcoinAnchorObservationConsistency.differentBlockHashesWereObserved');
        case BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_AND_HEIGHT:
            return message('bitcoinAnchorObservationConsistency.aDifferentBlockHashAnd');
        default:
            return message('bitcoinAnchorObservationConsistency.anObservationInconsistencyWasFound');
    }
}

export function describeBitcoinAnchorObservationConsistency(result) {
    const findings = (result && Array.isArray(result.findings) ? result.findings : [])
        .map((entry) => Object.freeze({
            state: entry.state,
            stateLabel: describeBitcoinAnchorObservationConsistencyLabel(
                entry.state, entry.finding, entry.previousObservationIndex, entry.laterObservationIndex
            ),
            finding: entry.finding,
            previousObservationIndex: entry.previousObservationIndex,
            laterObservationIndex: entry.laterObservationIndex,
            previousBlock: toBlockDescription(entry.previousObservation),
            laterBlock: toBlockDescription(entry.laterObservation)
        }));
    return Object.freeze({ count: findings.length, findings: Object.freeze(findings) });
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
