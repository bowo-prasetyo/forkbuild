import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import {
    BitcoinAnchorObservationConsistencyState,
    BitcoinAnchorObservationConsistencyFindingKind,
    isValidBitcoinAnchorObservationConsistencyState,
    isValidBitcoinAnchorObservationConsistencyFindingKind,
    compareBitcoinAnchorObservationConsistency
} from '../application/BitcoinAnchorObservationConsistencyState.js';
import { analyzeBitcoinAnchorObservationConsistency } from '../application/BitcoinAnchorObservationConsistencyAnalyzer.js';
import {
    describeBitcoinAnchorObservationConsistencyLabel,
    describeBitcoinAnchorObservationConsistency
} from '../application/BitcoinAnchorObservationConsistencyView.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../application/BitcoinAnchorConfirmationObservationHistory.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.77 — Bitcoin Anchor Observation Consistency Analysis.
//
// Section A: CONSISTENT — three CONFIRMED observations of the same block,
//            with a non-decreasing confirmationCount, produce two
//            CONSISTENT findings
// Section B: CONFIRMATION_COUNT_DECREASED — same blockHash/blockHeight, a
//            decreased confirmationCount, is INCONSISTENT
// Section C: BLOCK_HEIGHT_CHANGED_SAME_HASH — same blockHash, different
//            blockHeight, in EITHER direction, is INCONSISTENT
// Section D: DIFFERENT_HASH_SAME_HEIGHT — different blockHash, same
//            blockHeight, is INCONSISTENT
// Section E: DIFFERENT_HASH_AND_HEIGHT — different blockHash AND
//            different blockHeight is its own, distinct kind, never
//            collapsed into C or D
// Section F: NOT_CONFIRMED/UNAVAILABLE observations are INCOMPARABLE,
//            never treated as an inconsistency
// Section G: defensive behavior — missing observations, an empty history,
//            a single-entry history, and a mixed-txid history
// Section H: immutability — neither the history nor its observations, nor
//            any observation named on a finding, are ever mutated
// Section I: persistence round trip — analyzing a history restored from
//            application/PublicationObservationArchive.js's own
//            toJSON()/fromJSON() produces byte-identical findings to
//            analyzing the live archive's own array
// Section J: no verdict/cause vocabulary anywhere in this milestone's
//            output — "reorganization" never appears as an assertion, and
//            no scored/ranked field (confidence/health/valid/etc.) exists

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

const FORBIDDEN_KEYS = ['status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable', 'severity', 'cause'];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a consistency finding composes facts, it does not score them`);
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
    // Section A — CONSISTENT: three CONFIRMED observations of the same
    // block, confirmationCount only ever rising, produce two CONSISTENT
    // findings.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T10:10:00Z') });
        const obs3 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 12, observedAt: new Date('2026-01-01T10:20:00Z') });

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs3);

        const result = analyzeBitcoinAnchorObservationConsistency(history);
        assert(result.count === 2, '1. three observations produce two adjacent findings');
        assert(result.findings.every((f) => f.state === BitcoinAnchorObservationConsistencyState.CONSISTENT), '2. both findings are CONSISTENT');
        assert(result.findings.every((f) => f.finding === null), '3. a CONSISTENT finding carries no `finding` object');
        assert(result.findings[0].previousObservationIndex === 1 && result.findings[0].laterObservationIndex === 2, '4. the first finding names observations 1 and 2');
        assert(result.findings[1].previousObservationIndex === 2 && result.findings[1].laterObservationIndex === 3, '5. the second finding names observations 2 and 3');

        const equalCount = compareBitcoinAnchorObservationConsistency(obs1, confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:05:00Z') }));
        assert(equalCount.state === BitcoinAnchorObservationConsistencyState.CONSISTENT, '6. an unchanged confirmationCount is CONSISTENT, not merely a non-decrease');
    }
    console.log('✓ Section A: CONSISTENT — same-block observations with a non-decreasing confirmationCount');

    // ---------------------------------------------------------------
    // Section B — CONFIRMATION_COUNT_DECREASED.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 20, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 15, observedAt: new Date('2026-01-01T10:10:00Z') });

        const direct = compareBitcoinAnchorObservationConsistency(obs1, obs2);
        assert(direct.state === BitcoinAnchorObservationConsistencyState.INCONSISTENT, '7. a decreased confirmationCount is INCONSISTENT');
        assert(direct.finding.kind === BitcoinAnchorObservationConsistencyFindingKind.CONFIRMATION_COUNT_DECREASED, '8. the finding names CONFIRMATION_COUNT_DECREASED');
        assert(direct.finding.previousConfirmationCount === 20 && direct.finding.laterConfirmationCount === 15, '9. both confirmation counts are preserved on the finding');
        assert(direct.previous === obs1 && direct.later === obs2, '10. both original observations are carried through unchanged, by reference');

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        const result = analyzeBitcoinAnchorObservationConsistency(history);
        assert(result.findings[0].previousObservation === obs1 && result.findings[0].laterObservation === obs2, '11. the analyzer preserves both complete observations, not merely a state string');

        const described = describeBitcoinAnchorObservationConsistency(result);
        assert(described.findings[0].stateLabel === 'Confirmation count decreased while block placement remained unchanged between observation 1 and observation 2.', '12. the narrated sentence names the specific inconsistency factually');
    }
    console.log('✓ Section B: CONFIRMATION_COUNT_DECREASED — a decreased confirmationCount at an unchanged block is INCONSISTENT');

    // ---------------------------------------------------------------
    // Section C — BLOCK_HEIGHT_CHANGED_SAME_HASH, in either direction.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const decreased = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 899999, confirmationCount: 2, observedAt: new Date('2026-01-01T10:10:00Z') });
        const increased = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900002, confirmationCount: 2, observedAt: new Date('2026-01-01T10:10:00Z') });

        const decreasedResult = compareBitcoinAnchorObservationConsistency(obs1, decreased);
        assert(decreasedResult.state === BitcoinAnchorObservationConsistencyState.INCONSISTENT, '13. a same-hash, decreased-height pair is INCONSISTENT');
        assert(decreasedResult.finding.kind === BitcoinAnchorObservationConsistencyFindingKind.BLOCK_HEIGHT_CHANGED_SAME_HASH, '14. the finding names BLOCK_HEIGHT_CHANGED_SAME_HASH');
        assert(decreasedResult.finding.heightDecreased === true, '15. the finding\'s own facts name that the height decreased');
        assert(decreasedResult.finding.previousBlockHeight === 900000 && decreasedResult.finding.laterBlockHeight === 899999, '16. both differing heights are preserved on the finding');

        const increasedResult = compareBitcoinAnchorObservationConsistency(obs1, increased);
        assert(increasedResult.state === BitcoinAnchorObservationConsistencyState.INCONSISTENT, '17. a same-hash, increased-height pair is ALSO INCONSISTENT — a single blockHash never legitimately gains a second height in either direction');
        assert(increasedResult.finding.kind === BitcoinAnchorObservationConsistencyFindingKind.BLOCK_HEIGHT_CHANGED_SAME_HASH, '18. the increased-height finding still names BLOCK_HEIGHT_CHANGED_SAME_HASH');
        assert(increasedResult.finding.heightDecreased === false, '19. the increased-height finding\'s own facts name that the height did not decrease');

        assert(decreasedResult.previous.blockHash === decreasedResult.later.blockHash, '20. the shared blockHash is visible on both preserved observations, never collapsed into one shared field');
    }
    console.log('✓ Section C: BLOCK_HEIGHT_CHANGED_SAME_HASH — a same-hash height change, either direction, is INCONSISTENT');

    // ---------------------------------------------------------------
    // Section D — DIFFERENT_HASH_SAME_HEIGHT.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:10:00Z') });

        const direct = compareBitcoinAnchorObservationConsistency(obs1, obs2);
        assert(direct.state === BitcoinAnchorObservationConsistencyState.INCONSISTENT, '21. different block hashes at the same height are INCONSISTENT');
        assert(direct.finding.kind === BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_SAME_HEIGHT, '22. the finding names DIFFERENT_HASH_SAME_HEIGHT');
        assert(direct.finding.blockHeight === 900000, '23. the shared height is preserved on the finding');
        assert(direct.finding.previousBlockHash === BLOCK_A && direct.finding.laterBlockHash === BLOCK_B, '24. both differing hashes are preserved on the finding');

        const described = describeBitcoinAnchorObservationConsistencyLabel(direct.state, direct.finding);
        assert(described === 'Different block hashes were observed at the same block height.', '25. the narrated sentence names the disagreement factually, with no verdict wording');
    }
    console.log('✓ Section D: DIFFERENT_HASH_SAME_HEIGHT — different block hashes at the same height are INCONSISTENT');

    // ---------------------------------------------------------------
    // Section E — DIFFERENT_HASH_AND_HEIGHT is its own, distinct kind.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 12, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 3, observedAt: new Date('2026-01-01T10:30:00Z') });

        const direct = compareBitcoinAnchorObservationConsistency(obs1, obs2);
        assert(direct.state === BitcoinAnchorObservationConsistencyState.INCONSISTENT, '26. a different hash AND a different height is INCONSISTENT');
        assert(direct.finding.kind === BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_AND_HEIGHT, '27. the finding names its own DIFFERENT_HASH_AND_HEIGHT kind');
        assert(direct.finding.kind !== BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_SAME_HEIGHT, '28. it is never collapsed into DIFFERENT_HASH_SAME_HEIGHT');
        assert(direct.finding.kind !== BitcoinAnchorObservationConsistencyFindingKind.BLOCK_HEIGHT_CHANGED_SAME_HASH, '29. it is never collapsed into BLOCK_HEIGHT_CHANGED_SAME_HASH');
        assert(
            direct.finding.previousBlockHash === BLOCK_A && direct.finding.laterBlockHash === BLOCK_B
            && direct.finding.previousBlockHeight === 900000 && direct.finding.laterBlockHeight === 900001,
            '30. all four facts (both hashes, both heights) are preserved on the finding, nothing discarded'
        );
    }
    console.log('✓ Section E: DIFFERENT_HASH_AND_HEIGHT — kept as its own kind, both complete pairs of facts preserved');

    // ---------------------------------------------------------------
    // Section F — NOT_CONFIRMED/UNAVAILABLE observations are
    // INCOMPARABLE, never an inconsistency.
    // ---------------------------------------------------------------
    {
        const notConf = notConfirmed({ txid: TXID, observedAt: new Date('2026-01-01T09:50:00Z') });
        const conf = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const unavail = unavailable({ txid: TXID, observedAt: new Date('2026-01-01T10:10:00Z') });

        assert(compareBitcoinAnchorObservationConsistency(notConf, conf).state === BitcoinAnchorObservationConsistencyState.INCOMPARABLE, '31. NOT_CONFIRMED -> CONFIRMED is INCOMPARABLE, never an inconsistency');
        assert(compareBitcoinAnchorObservationConsistency(conf, unavail).state === BitcoinAnchorObservationConsistencyState.INCOMPARABLE, '32. CONFIRMED -> UNAVAILABLE is INCOMPARABLE, never evidence of disappearance');

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, notConf);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, conf);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, unavail);
        const result = analyzeBitcoinAnchorObservationConsistency(history);
        assert(result.count === 2 && result.findings.every((f) => f.state === BitcoinAnchorObservationConsistencyState.INCOMPARABLE), '33. the analyzer reports the same INCOMPARABLE state over a real history');
        assert(result.findings.every((f) => f.finding === null), '34. an INCOMPARABLE finding carries no `finding` object');
    }
    console.log('✓ Section F: NOT_CONFIRMED/UNAVAILABLE observations are INCOMPARABLE, never treated as an inconsistency');

    // ---------------------------------------------------------------
    // Section G — defensive behavior.
    // ---------------------------------------------------------------
    {
        assert(compareBitcoinAnchorObservationConsistency(null, confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date() })).state === BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS, '35. a missing previous observation is INSUFFICIENT_OBSERVATIONS');
        assert(compareBitcoinAnchorObservationConsistency(confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date() }), undefined).state === BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS, '36. a missing later observation is INSUFFICIENT_OBSERVATIONS');

        const emptyResult = analyzeBitcoinAnchorObservationConsistency([]);
        assert(emptyResult.count === 0 && emptyResult.findings.length === 0, '37. an empty history produces no findings at all');

        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const singleHistory = appendBitcoinAnchorConfirmationObservationHistoryEntry(Object.freeze([]), obs1);
        const singleResult = analyzeBitcoinAnchorObservationConsistency(singleHistory);
        assert(singleResult.count === 1 && singleResult.findings[0].state === BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS, '38. a one-entry history has nothing to analyze yet');

        const differentTxid = confirmed({ txid: OTHER_TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:20:00Z') });
        assert(compareBitcoinAnchorObservationConsistency(obs1, differentTxid).state === BitcoinAnchorObservationConsistencyState.INCOMPARABLE, '39. two observations naming different txid values are INCOMPARABLE');

        const mixedHistory = [obs1, differentTxid];
        const mixedResult = analyzeBitcoinAnchorObservationConsistency(mixedHistory);
        assert(mixedResult.count === 1 && mixedResult.findings[0].state === BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS, '40. selecting the same anchor identity narrows a mixed-txid history to only the first entry\'s own txid, leaving nothing left to analyze it against');
    }
    console.log('✓ Section G: defensive behavior — missing observations, empty/single-entry/mixed-txid histories');

    // ---------------------------------------------------------------
    // Section H — immutability.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 20, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 15, observedAt: new Date('2026-01-01T10:10:00Z') });
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        const beforeJson = JSON.stringify(history);

        const result = analyzeBitcoinAnchorObservationConsistency(history);
        analyzeBitcoinAnchorObservationConsistency(history);
        compareBitcoinAnchorObservationConsistency(obs1, obs2);

        assert(JSON.stringify(history) === beforeJson, '41. the confirmation history is byte-identical after being analyzed, twice');
        assert(Object.isFrozen(history), '42. the history array itself is still frozen');
        assert(Object.isFrozen(obs1) && Object.isFrozen(obs2), '43. neither observation object was unfrozen or mutated');
        assert(result.findings[0].previousObservation === obs1, '44. the finding\'s own preserved observation is the exact original object, by reference, not a copy');
        assert(Object.isFrozen(result), '45. the top-level result is frozen');
        assert(Object.isFrozen(result.findings), '46. the findings array is frozen');
        assert(Object.isFrozen(result.findings[0]), '47. each finding entry is frozen');
        assert(Object.isFrozen(result.findings[0].finding), '48. the finding\'s own detail object is frozen');
    }
    console.log('✓ Section H: immutability — neither the history, its observations, nor the analysis result are ever mutated');

    // ---------------------------------------------------------------
    // Section I — persistence round trip: application/
    // PublicationObservationArchive.js's own toJSON()/fromJSON() (0.8.75)
    // must feed this milestone's analyzer an array that produces
    // byte-identical findings to analyzing the live archive directly.
    // ---------------------------------------------------------------
    {
        const anchorId = 'anchor-0.8.77';
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 20, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 15, observedAt: new Date('2026-01-01T10:10:00Z') });
        const obs3 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 1, observedAt: new Date('2026-01-01T10:20:00Z') });

        let archive = new PublicationObservationArchive({});
        archive = archive.appendBitcoinConfirmationObservation(anchorId, obs1);
        archive = archive.appendBitcoinConfirmationObservation(anchorId, obs2);
        archive = archive.appendBitcoinConfirmationObservation(anchorId, obs3);

        const liveHistory = archive.bitcoinConfirmationObservationsByAnchorId[anchorId];
        const liveResult = describeBitcoinAnchorObservationConsistency(analyzeBitcoinAnchorObservationConsistency(liveHistory));
        assert(liveResult.count === 2, '49. the live archive\'s own history produces two findings');
        assert(liveResult.findings.some((f) => f.state === BitcoinAnchorObservationConsistencyState.INCONSISTENT), '50. the live archive\'s own history contains at least one INCONSISTENT finding');

        const restored = PublicationObservationArchive.fromJSON(archive.toJSON());
        const restoredHistory = restored.bitcoinConfirmationObservationsByAnchorId[anchorId];
        const restoredResult = describeBitcoinAnchorObservationConsistency(analyzeBitcoinAnchorObservationConsistency(restoredHistory));

        assert(JSON.stringify(restoredResult) === JSON.stringify(liveResult), '51. analyzing the restored (persist -> restore) history produces a byte-identical result to analyzing the live archive');
        assert(restoredResult.findings[1].finding.kind === BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_AND_HEIGHT, '52. the specific finding kind itself survives the round trip');
    }
    console.log('✓ Section I: persistence round trip — analyzing a restored history matches analyzing the live archive, byte-for-byte');

    // ---------------------------------------------------------------
    // Section J — no verdict/cause vocabulary anywhere in this
    // milestone's output.
    // ---------------------------------------------------------------
    {
        const obs1 = confirmed({ txid: TXID, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 20, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 1, observedAt: new Date('2026-01-01T10:10:00Z') });
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);

        const rawResult = analyzeBitcoinAnchorObservationConsistency(history);
        const described = describeBitcoinAnchorObservationConsistency(rawResult);

        assertNeverScored(rawResult, 'rawResult');
        for (const f of rawResult.findings) { assertNeverScored(f, 'rawResult.findings[]'); assertNeverScored(f.finding, 'rawResult.findings[].finding'); }
        assertNeverScored(described, 'described');
        for (const f of described.findings) assertNeverScored(f, 'described.findings[]');

        assertNeverAssertsReorganization(described, 'described');
        for (const value of Object.values(BitcoinAnchorObservationConsistencyState)) {
            assert(!value.toLowerCase().includes('reorg'), `53. state value "${value}" never names a reorganization`);
        }
        for (const value of Object.values(BitcoinAnchorObservationConsistencyFindingKind)) {
            assert(!value.toLowerCase().includes('reorg'), `54. finding kind "${value}" never names a reorganization`);
        }

        assert(isValidBitcoinAnchorObservationConsistencyState(BitcoinAnchorObservationConsistencyState.INCONSISTENT), '55. INCONSISTENT is a recognized state');
        assert(!isValidBitcoinAnchorObservationConsistencyState('reorg-detected'), '56. an invented reorg-detected value is never recognized');
        assert(isValidBitcoinAnchorObservationConsistencyFindingKind(BitcoinAnchorObservationConsistencyFindingKind.DIFFERENT_HASH_AND_HEIGHT), '57. DIFFERENT_HASH_AND_HEIGHT is a recognized finding kind');
        assert(!isValidBitcoinAnchorObservationConsistencyFindingKind('fraud-detected'), '58. an invented fraud-detected value is never recognized');

        const insufficientLabel = describeBitcoinAnchorObservationConsistencyLabel(BitcoinAnchorObservationConsistencyState.INSUFFICIENT_OBSERVATIONS);
        assert(insufficientLabel === 'Not enough confirmed observations exist yet to analyze consistency.', '59. the insufficient-observations label names the gap factually');
        assert(describeBitcoinAnchorObservationConsistencyLabel('not-a-real-state') === null, '60. an unrecognized state names nothing');

        assert(compareBitcoinAnchorObservationConsistency.length === 2, '61. the pure comparison function takes exactly two observations, no injected collaborator');
        assert(analyzeBitcoinAnchorObservationConsistency.length === 1, '62. the analyzer takes exactly a history, no injected confirmationSource');
        assert(describeBitcoinAnchorObservationConsistency.length === 1, '63. the view takes exactly a result, no injected collaborator');

        const first = JSON.stringify(describeBitcoinAnchorObservationConsistency(analyzeBitcoinAnchorObservationConsistency(history)));
        const second = JSON.stringify(describeBitcoinAnchorObservationConsistency(analyzeBitcoinAnchorObservationConsistency(history)));
        assert(first === second, '64. calling the full pipeline twice over the same history returns byte-identical output');
    }
    console.log('✓ Section J: no confidence/status/health/trusted/valid/canonical/reliable/severity/cause/reorg vocabulary anywhere in this milestone\'s output');

    console.log('\nAll BitcoinAnchorObservationConsistency tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorObservationConsistency.test.js FAILED:', error);
    process.exitCode = 1;
});
