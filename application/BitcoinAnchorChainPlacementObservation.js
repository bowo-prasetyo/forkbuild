import { BitcoinAnchorConfirmationState } from './BitcoinAnchorConfirmationState.js';

// 0.8.76 — Bitcoin Anchor Chain Placement Change Observation.
//
// application/BitcoinAnchorConfirmationObservationHistory.js's own header
// named this exact gap the day it was written (0.8.56): "A history whose
// two CONFIRMED entries named two DIFFERENT `blockHash` values for the
// same txid would look different — a possible chain reorganization — but
// this file does not compare entries against one another... Comparing
// sequential observations and naming what a disagreement between them
// means is real, separately sized future work." This file is that
// comparison, and nothing more:
//
//   observation A (CONFIRMED, blockHash X)   observation B (CONFIRMED, blockHash X)
//        │                                        │
//        └──────────── compareBitcoinAnchorChainPlacementObservations() ───┘
//                                  │
//                                  ▼
//                             UNCHANGED
//
//   observation A (CONFIRMED, blockHash X)   observation B (CONFIRMED, blockHash Y)
//        │                                        │
//        └──────────── compareBitcoinAnchorChainPlacementObservations() ───┘
//                                  │
//                                  ▼
//                           PLACEMENT_CHANGED
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: a changed `blockHash` (or a
// changed `blockHeight` alongside an unchanged `blockHash` — a rare,
// self-contradictory pairing this file does not attempt to resolve, see
// below) is an OBSERVED CHANGE IN PLACEMENT, never a chain reorganization,
// an invalidation, a double spend, a loss of finality, a canonicality
// verdict, a safety verdict, or a trust verdict. `PLACEMENT_CHANGED` names
// only that two records this replica already held disagree; it forms no
// opinion about why. See docs/Principles.md, "A Changed Observation Is
// Not Automatically A Reorganization (0.8.76)."
//
//   UNCHANGED                 — both observations are CONFIRMED, name the
//                               same txid, and agree on both blockHash and
//                               blockHeight. A different confirmationCount
//                               alone is ordinary confirmation-depth
//                               progress, not a placement change.
//   PLACEMENT_CHANGED         — both observations are CONFIRMED, name the
//                               same txid, and disagree on blockHash
//                               and/or blockHeight.
//   INSUFFICIENT_OBSERVATIONS — either argument is missing (null/
//                               undefined) — there are not two
//                               observations here to compare at all.
//   INCOMPARABLE              — both observations are present but at
//                               least one is not CONFIRMED, or they name
//                               different txid values. Never treated as
//                               UNCHANGED or PLACEMENT_CHANGED: a
//                               NOT_CONFIRMED → CONFIRMED pair is ordinary
//                               settling, not a placement changing from
//                               something; a CONFIRMED → UNAVAILABLE pair
//                               means only that this replica's source
//                               could not presently answer, never that
//                               the transaction left its previously
//                               observed block.
//
// NO FOURTH, SCORED, OR RANKED OUTCOME. Never a `confidence`,
// `reliability`, `severity`, or `REORG_DETECTED` value — the identical
// restraint every confirmation-vocabulary file since 0.8.54 already
// holds, held here for a comparison between two observations rather than
// a single one.
//
// BOTH OBSERVATIONS ARE ALWAYS PRESERVED, WHOLE, ON THE RESULT — never
// collapsed to a diff of only the fields that changed, and never resolved
// into a single "current" observation. A `PLACEMENT_CHANGED` result
// carries `previous` and `later` exactly as given, so a caller can see
// the full disagreement — including the odd case of an unchanged
// blockHash paired with a changed blockHeight — and judge it, rather than
// have this file quietly decide which field is authoritative.
//
// PURE AND STATELESS. No network access, no history mutation, no
// constructor, no injected collaborator. Calling this function twice with
// byte-identical arguments returns a byte-identical result.
export const BitcoinAnchorChainPlacementObservationOutcome = Object.freeze({
    UNCHANGED: 'unchanged',
    PLACEMENT_CHANGED: 'placement-changed',
    INSUFFICIENT_OBSERVATIONS: 'insufficient-observations',
    INCOMPARABLE: 'incomparable'
});

export function isValidBitcoinAnchorChainPlacementObservationOutcome(value) {
    return Object.values(BitcoinAnchorChainPlacementObservationOutcome).includes(value);
}

// Compares two anchoring/BitcoinAnchorConfirmationObserver.js-shaped
// observations (`{ state, txid, blockHash, blockHeight, confirmationCount,
// reason, observedAt }`) and returns exactly one frozen result:
//
//   { outcome, previous, later }
//
// `previous`/`later` are the two arguments this function was given,
// carried through completely unchanged — never re-derived, trimmed, or
// merged into a diff. Either may be `null` when this function itself
// reports `INSUFFICIENT_OBSERVATIONS` for a missing argument.
export function compareBitcoinAnchorChainPlacementObservations(previous, later) {
    if (!previous || !later) {
        return outcome(
            BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS,
            previous || null,
            later || null
        );
    }

    const bothConfirmed = previous.state === BitcoinAnchorConfirmationState.CONFIRMED
        && later.state === BitcoinAnchorConfirmationState.CONFIRMED;
    if (!bothConfirmed || previous.txid !== later.txid) {
        return outcome(BitcoinAnchorChainPlacementObservationOutcome.INCOMPARABLE, previous, later);
    }

    const placementChanged = previous.blockHash !== later.blockHash || previous.blockHeight !== later.blockHeight;
    return outcome(
        placementChanged
            ? BitcoinAnchorChainPlacementObservationOutcome.PLACEMENT_CHANGED
            : BitcoinAnchorChainPlacementObservationOutcome.UNCHANGED,
        previous,
        later
    );
}

function outcome(outcomeValue, previous, later) {
    return Object.freeze({ outcome: outcomeValue, previous, later });
}
