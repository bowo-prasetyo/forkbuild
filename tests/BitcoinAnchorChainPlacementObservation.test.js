import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import {
    BitcoinAnchorChainPlacementObservationOutcome,
    isValidBitcoinAnchorChainPlacementObservationOutcome,
    compareBitcoinAnchorChainPlacementObservations
} from '../application/BitcoinAnchorChainPlacementObservation.js';
import { observeBitcoinAnchorChainPlacementChanges } from '../application/BitcoinAnchorChainPlacementObserver.js';
import {
    describeBitcoinAnchorChainPlacementObservationOutcomeLabel,
    describeBitcoinAnchorChainPlacementObservations
} from '../application/BitcoinAnchorChainPlacementObservationView.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../application/BitcoinAnchorConfirmationObservationHistory.js';

// 0.8.76 — Bitcoin Anchor Chain Placement Change Observation.
//
// Section A: UNCHANGED — three CONFIRMED observations of the same block
//            produce two UNCHANGED comparisons
// Section B: PLACEMENT_CHANGED — a changed blockHash between two
//            CONFIRMED observations produces exactly one PLACEMENT_CHANGED
// Section C: an unchanged blockHash paired with a changed blockHeight is
//            still reported as PLACEMENT_CHANGED, with both facts
//            preserved whole — this file never picks one field as
//            authoritative
// Section D: a confirmationCount change alone (same blockHash/blockHeight)
//            is UNCHANGED — ordinary confirmation-depth progress, not a
//            placement change
// Section E: NOT_CONFIRMED -> CONFIRMED is INCOMPARABLE, never interpreted
//            as a chain-placement change
// Section F: CONFIRMED -> UNAVAILABLE is INCOMPARABLE, never evidence the
//            transaction disappeared
// Section G: historical immutability — neither the confirmation history
//            nor the observations within it are ever mutated by any
//            function in this milestone
// Section H: no verdict vocabulary (status/confidence/health/trusted/
//            valid/canonical/reliable/reorg) anywhere in this milestone's
//            output — "reorganization" remains fine in comments/docs, but
//            never in a field's own name or value

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.CONFIRMED,
        txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

function notConfirmed({ txid, observedAt }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.NOT_CONFIRMED,
        txid, blockHash: null, blockHeight: null, confirmationCount: null, reason: null, observedAt
    });
}

function unavailable({ txid, observedAt, reason = 'confirmation source unreachable' }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.UNAVAILABLE,
        txid, blockHash: null, blockHeight: null, confirmationCount: null, reason, observedAt
    });
}

const FORBIDDEN_KEYS = ['status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable'];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a placement comparison composes facts, it does not score them`);
        assert(!lower.includes('reorg'), `${path}.${key} must never carry reorganization vocabulary in its own name`);
    }
}
function assertNeverAssertsReorganization(value, path) {
    if (typeof value === 'string') {
        assert(!value.toLowerCase().includes('reorganiz'), `${path} must never assert a reorganization occurred: "${value}"`);
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
        assertNeverAssertsReorganization(nested, `${path}.${key}`);
    }
}

const TXID = 'a'.repeat(64);
const OTHER_TXID = 'f'.repeat(64);
const BLOCK_A = 'b'.repeat(64);
const BLOCK_B = 'c'.repeat(64);

async function run() {
    // ---------------------------------------------------------------
    // Section A — UNCHANGED: three CONFIRMED observations of the same
    // block produce two UNCHANGED comparisons.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T10:10:00Z') });
        const obs3 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 12, observedAt: new Date('2026-01-01T10:20:00Z') });

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs3);

        const result = observeBitcoinAnchorChainPlacementChanges(history);
        assert(result.count === 2, '1. three observations produce two adjacent comparisons');
        assert(result.comparisons.every((c) => c.outcome === BitcoinAnchorChainPlacementObservationOutcome.UNCHANGED), '2. both comparisons are UNCHANGED');
        assert(result.comparisons[0].previousObservationIndex === 1 && result.comparisons[0].laterObservationIndex === 2, '3. first comparison names observations 1 and 2');
        assert(result.comparisons[1].previousObservationIndex === 2 && result.comparisons[1].laterObservationIndex === 3, '4. second comparison names observations 2 and 3');
    }
    console.log('✓ Section A: UNCHANGED — three same-block CONFIRMED observations produce two UNCHANGED comparisons');

    // ---------------------------------------------------------------
    // Section B — PLACEMENT_CHANGED: a changed blockHash produces
    // exactly one PLACEMENT_CHANGED comparison.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 12, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 3, observedAt: new Date('2026-01-01T10:30:00Z') });

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);

        const result = observeBitcoinAnchorChainPlacementChanges(history);
        assert(result.count === 1, '5. two observations produce exactly one comparison');
        assert(result.comparisons[0].outcome === BitcoinAnchorChainPlacementObservationOutcome.PLACEMENT_CHANGED, '6. a changed blockHash reports PLACEMENT_CHANGED');
        assert(result.comparisons[0].previous === obs1 && result.comparisons[0].later === obs2, '7. both original observations are carried through unchanged, by reference');

        const direct = compareBitcoinAnchorChainPlacementObservations(obs1, obs2);
        assert(direct.outcome === BitcoinAnchorChainPlacementObservationOutcome.PLACEMENT_CHANGED, '8. the pure comparison function itself reports PLACEMENT_CHANGED');
    }
    console.log('✓ Section B: PLACEMENT_CHANGED — a changed blockHash produces exactly one PLACEMENT_CHANGED comparison');

    // ---------------------------------------------------------------
    // Section C — an unchanged blockHash paired with a changed
    // blockHeight is still PLACEMENT_CHANGED; both facts are preserved.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900002, confirmationCount: 1, observedAt: new Date('2026-01-01T10:10:00Z') });

        const result = compareBitcoinAnchorChainPlacementObservations(obs1, obs2);
        assert(result.outcome === BitcoinAnchorChainPlacementObservationOutcome.PLACEMENT_CHANGED, '9. a same-hash, different-height pair is reported as PLACEMENT_CHANGED, never silently resolved to UNCHANGED');
        assert(result.previous.blockHeight === 900000 && result.later.blockHeight === 900002, '10. both differing heights are preserved on the result, neither discarded');
        assert(result.previous.blockHash === result.later.blockHash, '11. the shared blockHash is visible on both preserved observations, not collapsed into one shared field');
    }
    console.log('✓ Section C: an unchanged blockHash with a changed blockHeight reports PLACEMENT_CHANGED, preserving both facts');

    // ---------------------------------------------------------------
    // Section D — a confirmationCount change alone is UNCHANGED.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 12, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 18, observedAt: new Date('2026-01-01T10:10:00Z') });

        const result = compareBitcoinAnchorChainPlacementObservations(obs1, obs2);
        assert(result.outcome === BitcoinAnchorChainPlacementObservationOutcome.UNCHANGED, '12. a confirmationCount-only change is UNCHANGED, not a placement change');
        assert(result.previous.confirmationCount === 12 && result.later.confirmationCount === 18, '13. both confirmation counts are still preserved on the result');
    }
    console.log('✓ Section D: a confirmationCount change alone is UNCHANGED — ordinary confirmation-depth progress');

    // ---------------------------------------------------------------
    // Section E — NOT_CONFIRMED -> CONFIRMED is INCOMPARABLE.
    // ---------------------------------------------------------------
    {
        const obs1 = notConfirmed({ txid: TXID, observedAt: new Date('2026-01-01T09:50:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });

        const direct = compareBitcoinAnchorChainPlacementObservations(obs1, obs2);
        assert(direct.outcome === BitcoinAnchorChainPlacementObservationOutcome.INCOMPARABLE, '14. NOT_CONFIRMED -> CONFIRMED is INCOMPARABLE, never UNCHANGED or PLACEMENT_CHANGED');

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        const result = observeBitcoinAnchorChainPlacementChanges(history);
        assert(result.count === 1 && result.comparisons[0].outcome === BitcoinAnchorChainPlacementObservationOutcome.INCOMPARABLE, '15. the observer reports the same INCOMPARABLE outcome over a real history');
    }
    console.log('✓ Section E: NOT_CONFIRMED -> CONFIRMED is INCOMPARABLE, never interpreted as a chain-placement change');

    // ---------------------------------------------------------------
    // Section F — CONFIRMED -> UNAVAILABLE is INCOMPARABLE.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = unavailable({ txid: TXID, observedAt: new Date('2026-01-01T10:10:00Z') });

        const direct = compareBitcoinAnchorChainPlacementObservations(obs1, obs2);
        assert(direct.outcome === BitcoinAnchorChainPlacementObservationOutcome.INCOMPARABLE, '16. CONFIRMED -> UNAVAILABLE is INCOMPARABLE, never evidence of disappearance');

        assert(compareBitcoinAnchorChainPlacementObservations(null, obs1).outcome === BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS, '17. a missing previous observation is INSUFFICIENT_OBSERVATIONS');
        assert(compareBitcoinAnchorChainPlacementObservations(obs1, undefined).outcome === BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS, '18. a missing later observation is INSUFFICIENT_OBSERVATIONS');

        const singleHistory = appendBitcoinAnchorConfirmationObservationHistoryEntry(Object.freeze([]), obs1);
        const singleResult = observeBitcoinAnchorChainPlacementChanges(singleHistory);
        assert(singleResult.count === 1 && singleResult.comparisons[0].outcome === BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS, '19. a one-entry history has nothing to compare yet');

        const emptyResult = observeBitcoinAnchorChainPlacementChanges([]);
        assert(emptyResult.count === 0 && emptyResult.comparisons.length === 0, '20. an empty history produces no comparisons at all');

        const differentTxid = confirmed({ txid: OTHER_TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:20:00Z') });
        assert(compareBitcoinAnchorChainPlacementObservations(obs1, differentTxid).outcome === BitcoinAnchorChainPlacementObservationOutcome.INCOMPARABLE, '21. two observations naming different txid values are INCOMPARABLE');

        const mixedHistory = [obs1, differentTxid];
        const mixedResult = observeBitcoinAnchorChainPlacementChanges(mixedHistory);
        assert(mixedResult.count === 1 && mixedResult.comparisons[0].outcome === BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS, '22. selecting the same anchor identity narrows a mixed-txid history to only the first entry\'s own txid, leaving nothing left to compare it against');
    }
    console.log('✓ Section F: CONFIRMED -> UNAVAILABLE is INCOMPARABLE, never evidence the transaction disappeared');

    // ---------------------------------------------------------------
    // Section G — historical immutability: nothing in this milestone
    // mutates the confirmation history or the observations within it.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 1, observedAt: new Date('2026-01-01T10:10:00Z') });
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        const beforeJson = JSON.stringify(history);

        observeBitcoinAnchorChainPlacementChanges(history);
        observeBitcoinAnchorChainPlacementChanges(history);
        compareBitcoinAnchorChainPlacementObservations(obs1, obs2);

        assert(JSON.stringify(history) === beforeJson, '23. the confirmation history is byte-identical after being compared, twice');
        assert(Object.isFrozen(history), '24. the history array itself is still frozen');
        assert(Object.isFrozen(obs1) && Object.isFrozen(obs2), '25. neither observation object was unfrozen or mutated');
        assert(history.length === 2, '26. no comparison ever appends to the history it reads');
    }
    console.log('✓ Section G: historical immutability — neither the confirmation history nor its observations are ever mutated');

    // ---------------------------------------------------------------
    // Section H — no verdict vocabulary anywhere in this milestone's
    // output; "reorganization" never appears as an assertion.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 1, observedAt: new Date('2026-01-01T10:10:00Z') });
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);

        const rawResult = observeBitcoinAnchorChainPlacementChanges(history);
        const described = describeBitcoinAnchorChainPlacementObservations(rawResult);

        assertNeverScored(rawResult, 'rawResult');
        for (const comparison of rawResult.comparisons) assertNeverScored(comparison, 'rawResult.comparisons[]');
        assertNeverScored(described, 'described');
        for (const comparison of described.comparisons) assertNeverScored(comparison, 'described.comparisons[]');

        assertNeverAssertsReorganization(described, 'described');
        for (const value of Object.values(BitcoinAnchorChainPlacementObservationOutcome)) {
            assert(!value.toLowerCase().includes('reorg'), `27. outcome value "${value}" never names a reorganization`);
        }

        assert(described.comparisons[0].outcomeLabel === 'Observed block placement changed between observation 1 and observation 2.', '28. the narrated sentence names the change factually, with no verdict wording');
        assert(isValidBitcoinAnchorChainPlacementObservationOutcome(BitcoinAnchorChainPlacementObservationOutcome.PLACEMENT_CHANGED), '29. PLACEMENT_CHANGED is a recognized outcome');
        assert(!isValidBitcoinAnchorChainPlacementObservationOutcome('reorg-detected'), '30. an invented reorg-detected value is never recognized');

        const insufficientLabel = describeBitcoinAnchorChainPlacementObservationOutcomeLabel(BitcoinAnchorChainPlacementObservationOutcome.INSUFFICIENT_OBSERVATIONS);
        assert(insufficientLabel === 'Not enough confirmed observations exist yet to compare block placement.', '31. the insufficient-observations label names the gap factually');
        assert(describeBitcoinAnchorChainPlacementObservationOutcomeLabel('not-a-real-outcome') === null, '32. an unrecognized outcome names nothing');

        const unchangedHistory = Object.freeze([
            confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') }),
            confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 12, observedAt: new Date('2026-01-01T10:10:00Z') })
        ]);
        const unchangedDescribed = describeBitcoinAnchorChainPlacementObservations(observeBitcoinAnchorChainPlacementChanges(unchangedHistory));
        assert(unchangedDescribed.comparisons[0].previousBlock.blockHeight === 900000 && unchangedDescribed.comparisons[0].laterBlock.confirmationCount === 12, '33. an UNCHANGED comparison still carries both full observations, nothing discarded');

        assert(compareBitcoinAnchorChainPlacementObservations.length === 2, '34. the pure comparison function takes exactly two observations, no injected collaborator');
        assert(observeBitcoinAnchorChainPlacementChanges.length === 1, '35. the observer takes exactly a history, no injected confirmationSource');
        assert(describeBitcoinAnchorChainPlacementObservations.length === 1, '36. the view takes exactly a result, no injected collaborator');

        const first = JSON.stringify(describeBitcoinAnchorChainPlacementObservations(observeBitcoinAnchorChainPlacementChanges(history)));
        const second = JSON.stringify(describeBitcoinAnchorChainPlacementObservations(observeBitcoinAnchorChainPlacementChanges(history)));
        assert(first === second, '37. calling the full pipeline twice over the same history returns byte-identical output');
    }
    console.log('✓ Section H: no confidence/status/health/trusted/valid/canonical/reliable/reorg vocabulary anywhere in this milestone\'s output');

    console.log('\nAll BitcoinAnchorChainPlacementObservation tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorChainPlacementObservation.test.js FAILED:', error);
    process.exitCode = 1;
});
