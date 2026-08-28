import { BitcoinAnchorConfirmationState } from './BitcoinAnchorConfirmationState.js';

// 0.8.77 — Bitcoin Anchor Observation Consistency Analysis.
//
// application/BitcoinAnchorChainPlacementObservation.js (0.8.76) already
// answers one narrow question — "does the observed block placement between
// two CONFIRMED observations stay the same or change?" — and refuses, on
// purpose, to say anything about WHY a changed placement changed. This
// file asks a related but genuinely different question, one layer over:
// "do two observations this replica already recorded, taken together,
// describe a state of affairs that is internally self-contradictory?"
//
//   0.8.76 — did placement change?           UNCHANGED / PLACEMENT_CHANGED
//   0.8.77 — is that change (or non-change)  CONSISTENT / INCONSISTENT
//            internally coherent?
//
// A confirmationCount that goes DOWN while blockHash/blockHeight stay the
// same, a blockHeight that goes DOWN (or simply changes) while blockHash
// stays the same, and two different blockHash values reported for the
// same blockHeight are all facts a real Bitcoin full node would never
// itself report about a single, settled chain state — see docs/
// Principles.md, "An Internal Inconsistency Is Not Automatically A
// Reorganization (0.8.77)." Reporting them as INCONSISTENT names only
// that the two records disagree with each other in a way ordinary
// confirmation-depth progress cannot explain — never that a
// reorganization, invalidation, double spend, or loss of finality
// occurred, and never which of the two observations (if either) is
// correct.
//
//   CONSISTENT                — both observations are CONFIRMED, name the
//                               same txid, and either (a) agree on
//                               blockHash and blockHeight with a
//                               confirmationCount that did not decrease,
//                               or (b) disagree on blockHash and/or
//                               blockHeight in a way 0.8.76 already names
//                               PLACEMENT_CHANGED — a changed placement is
//                               not, by itself, an inconsistency; only the
//                               specific self-contradictory shapes below
//                               are.
//   INCONSISTENT               — the two observations disagree in one of
//                               the specific, self-contradictory shapes
//                               `BitcoinAnchorObservationConsistencyFindingKind`
//                               names below. `finding` on the result names
//                               exactly which one, with the plain facts
//                               that produced it — never a severity, a
//                               cause, or a verdict on which observation is
//                               correct.
//   INSUFFICIENT_OBSERVATIONS  — either argument is missing (null/
//                               undefined) — there are not two
//                               observations here to analyze at all.
//   INCOMPARABLE               — both observations are present but at
//                               least one is not CONFIRMED, or they name
//                               different txid values — the identical
//                               restraint 0.8.76 already holds, for the
//                               identical reason: a NOT_CONFIRMED ->
//                               CONFIRMED pair is ordinary settling, never
//                               an inconsistency finding.
export const BitcoinAnchorObservationConsistencyState = Object.freeze({
    CONSISTENT: 'consistent',
    INCONSISTENT: 'inconsistent',
    INSUFFICIENT_OBSERVATIONS: 'insufficient-observations',
    INCOMPARABLE: 'incomparable'
});

export function isValidBitcoinAnchorObservationConsistencyState(value) {
    return Object.values(BitcoinAnchorObservationConsistencyState).includes(value);
}

// THE FOUR, AND ONLY FOUR, SELF-CONTRADICTORY SHAPES THIS FILE RECOGNIZES.
// No fifth, scored, or ranked kind — the identical restraint 0.8.76 held
// for its own outcome vocabulary, held here for a finding's own kind.
//
//   CONFIRMATION_COUNT_DECREASED — same blockHash, same blockHeight,
//                                  confirmationCount went down.
//   BLOCK_HEIGHT_CHANGED_SAME_HASH — same blockHash, different
//                                  blockHeight (either direction — a
//                                  height that decreased is still this
//                                  same kind, with `heightDecreased: true`
//                                  in the finding's own details; a height
//                                  that merely changed, upward, is
//                                  reported identically, since a single
//                                  blockHash can never legitimately gain a
//                                  second, different height either way).
//   DIFFERENT_HASH_SAME_HEIGHT — different blockHash, same blockHeight.
//   DIFFERENT_HASH_AND_HEIGHT — different blockHash AND different
//                                  blockHeight — kept as its OWN kind,
//                                  never collapsed into
//                                  DIFFERENT_HASH_SAME_HEIGHT or
//                                  BLOCK_HEIGHT_CHANGED_SAME_HASH, so a
//                                  caller can tell exactly which facts
//                                  changed from the finding's own `kind`
//                                  alone, before even reading its details.
export const BitcoinAnchorObservationConsistencyFindingKind = Object.freeze({
    CONFIRMATION_COUNT_DECREASED: 'confirmation-count-decreased',
    BLOCK_HEIGHT_CHANGED_SAME_HASH: 'block-height-changed-same-hash',
    DIFFERENT_HASH_SAME_HEIGHT: 'different-hash-same-height',
    DIFFERENT_HASH_AND_HEIGHT: 'different-hash-and-height'
});

export function isValidBitcoinAnchorObservationConsistencyFindingKind(value) {
    return Object.values(BitcoinAnchorObservationConsistencyFindingKind).includes(value);
}

// Compares two anchoring/BitcoinAnchorConfirmationObserver.js-shaped
// observations (`{ state, txid, blockHash, blockHeight, confirmationCount,
// reason, observedAt }`) and returns exactly one frozen result:
//
//   { state, previous, later, finding }
//
// `previous`/`later` are the two arguments this function was given,
// carried through completely unchanged — the identical "never re-derived,
// trimmed, or merged into a diff" discipline application/
// BitcoinAnchorChainPlacementObservation.js's own
// `compareBitcoinAnchorChainPlacementObservations()` already holds.
// `finding` is `null` for every state but INCONSISTENT; for INCONSISTENT
// it is `{ kind, ...plain facts }` — never a class instance, never a
// function, always JSON-safe.
//
// TAKES NO CONFIRMATION SOURCE, MAKES NO NETWORK CALL, INFERS NOTHING
// BEYOND THE TWO OBSERVATIONS GIVEN. Pure and stateless: calling this
// function twice with byte-identical arguments returns a byte-identical
// result.
export function compareBitcoinAnchorObservationConsistency(previous, later) {
    if (!previous || !later) {
        return result(
            BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS,
            previous || null,
            later || null,
            null
        );
    }

    const bothConfirmed = previous.state === BitcoinAnchorConfirmationState.CONFIRMED
        && later.state === BitcoinAnchorConfirmationState.CONFIRMED;
    if (!bothConfirmed || previous.txid !== later.txid) {
        return result(BitcoinAnchorObservationConsistencyState.INCOMPARABLE, previous, later, null);
    }

    const sameHash = previous.blockHash === later.blockHash;
    const sameHeight = previous.blockHeight === later.blockHeight;

    if (sameHash && sameHeight) {
        if (later.confirmationCount < previous.confirmationCount) {
            return result(
                BitcoinAnchorObservationConsistencyState.INCONSISTENT,
                previous, later,
                finding(BitcoinAnchorObservationConsistencyFindingKind.CONFIRMATION_COUNT_DECREASED, {
                    previousConfirmationCount: previous.confirmationCount,
                    laterConfirmationCount: later.confirmationCount
                })
            );
        }
        return result(BitcoinAnchorObservationConsistencyState.CONSISTENT, previous, later, null);
    }

    if (sameHash && !sameHeight) {
        return result(
            BitcoinAnchorObservationConsistencyState.INCONSISTENT,
            previous, later,
            finding(BitcoinAnchorObservationConsistencyFindingKind.BLOCK_HEIGHT_CHANGED_SAME_HASH, {
                blockHash: previous.blockHash,
                previousBlockHeight: previous.blockHeight,
                laterBlockHeight: later.blockHeight,
                heightDecreased: later.blockHeight < previous.blockHeight
            })
        );
    }

    if (!sameHash && sameHeight) {
        return result(
            BitcoinAnchorObservationConsistencyState.INCONSISTENT,
            previous, later,
            finding(BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_SAME_HEIGHT, {
                blockHeight: previous.blockHeight,
                previousBlockHash: previous.blockHash,
                laterBlockHash: later.blockHash
            })
        );
    }

    return result(
        BitcoinAnchorObservationConsistencyState.INCONSISTENT,
        previous, later,
        finding(BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_AND_HEIGHT, {
            previousBlockHash: previous.blockHash,
            laterBlockHash: later.blockHash,
            previousBlockHeight: previous.blockHeight,
            laterBlockHeight: later.blockHeight
        })
    );
}

function finding(kind, details) {
    return Object.freeze({ kind, ...details });
}

function result(state, previous, later, findingValue) {
    return Object.freeze({ state, previous, later, finding: findingValue });
}
