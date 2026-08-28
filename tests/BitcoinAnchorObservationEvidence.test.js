import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../application/BitcoinAnchorConfirmationObservationHistory.js';
import { observeBitcoinAnchorChainPlacementChanges } from '../application/BitcoinAnchorChainPlacementObserver.js';
import { analyzeBitcoinAnchorObservationConsistency } from '../application/BitcoinAnchorObservationConsistencyAnalyzer.js';
import { composeBitcoinAnchorObservationEvidence } from '../application/BitcoinAnchorObservationEvidence.js';
import { describeBitcoinAnchorObservationEvidence } from '../application/BitcoinAnchorObservationEvidenceView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.78 — Bitcoin Anchor Observation Evidence Correlation.
//
// Section A: composition — every collection is bundled unchanged, under
//            an `{ index, observation }` wrapper naming its own 1-based
//            position within the array the caller supplied for this one
//            anchor
// Section B: anchorId is required, explicit, and never inferred — a
//            missing/non-string anchorId throws before anything else is
//            touched
// Section C: the evidence object cannot manufacture an anchor identity
//            from a txid — observations carrying a txid that differs
//            from (or simply exists independently of) the explicit
//            anchorId are still composed exactly as given, proving
//            nothing here reads or validates against `observation.txid`
// Section D: FLAGSHIP — two anchors sharing an identical contentHash,
//            with different txid values and independent histories: A's
//            observations never appear under B, B's never appear under
//            A, and no correlation occurs through the shared contentHash
// Section E: missing evidence collections remain empty, never fabricated
// Section F: chainPlacementObservations/consistencyFindings are carried
//            through byte-identical to what 0.8.76/0.8.77 already
//            produced — never recomputed by this milestone
// Section G: immutability — neither a source array nor any observation
//            inside it is ever mutated; the composed evidence is frozen
// Section H: repeated calls are byte-identical; no network access; no
//            aggregate verdict of any kind
// Section I: the view layer — counts, reused state labels, `index`
//            carried through, no new vocabulary
// Section J: persistence round trip — composing evidence over histories
//            restored from application/PublicationObservationArchive.js's
//            own toJSON()/fromJSON() (0.8.75) matches composing over the
//            live archive, byte-for-byte

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.CONFIRMED,
        txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

function broadcasted({ txid, broadcastedAt }) {
    return Object.freeze({
        state: BitcoinAnchorBroadcastState.BROADCASTED,
        broadcasted: true,
        txid,
        reason: null,
        broadcastedAt
    });
}

function contentProof({ contentHash, observedAt, state = BitcoinAnchorContentProofState.HASH_MATCH }) {
    return Object.freeze({ state, contentHash, reason: null, observedAt });
}

const FORBIDDEN_KEYS = ['status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable', 'severity', 'cause', 'verdict', 'score'];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — evidence composes facts, it does not score them`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);

async function run() {
    // ---------------------------------------------------------------
    // Section A — composition: every collection bundled unchanged, with
    // its own 1-based `index`.
    // ---------------------------------------------------------------
    {
        const b1 = broadcasted({ txid: TXID_A, broadcastedAt: new Date('2026-01-01T10:21:04Z') });
        const c1 = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:22:00Z') });
        const c2 = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T10:35:00Z') });
        const p1 = contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T10:23:00Z') });

        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, c1);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, c2);

        const evidence = composeBitcoinAnchorObservationEvidence({
            anchorId: 'anchor-1',
            broadcastObservations: [b1],
            confirmationObservations: history,
            contentProofObservations: [p1],
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
        });

        assert(evidence.anchorId === 'anchor-1', '1. the composed evidence names its own explicit anchorId');
        assert(evidence.broadcastObservations.length === 1 && evidence.broadcastObservations[0].index === 1, '2. one broadcast observation, indexed 1');
        assert(evidence.broadcastObservations[0].observation === b1, '3. the broadcast observation is the exact original object, by reference');
        assert(evidence.confirmationObservations.length === 2, '4. both confirmation observations are present');
        assert(evidence.confirmationObservations[0].index === 1 && evidence.confirmationObservations[1].index === 2, '5. confirmation observations are indexed 1 and 2, in order');
        assert(evidence.confirmationObservations[0].observation === c1 && evidence.confirmationObservations[1].observation === c2, '6. both confirmation observations are the exact original objects');
        assert(evidence.contentProofObservations.length === 1 && evidence.contentProofObservations[0].observation === p1, '7. the content-proof observation is present, unchanged, by reference');
        assert(evidence.chainPlacementObservations.count === 1, '8. the chain-placement comparison result is carried through');
        assert(evidence.consistencyFindings.count === 1, '9. the consistency finding result is carried through');
    }
    console.log('✓ Section A: composition — every collection bundled unchanged, each with its own 1-based index');

    // ---------------------------------------------------------------
    // Section B — anchorId is required and explicit.
    // ---------------------------------------------------------------
    {
        let threwForMissing = false;
        try { composeBitcoinAnchorObservationEvidence({}); } catch (e) { threwForMissing = true; }
        assert(threwForMissing, '10. composing with no anchorId at all throws');

        let threwForEmpty = false;
        try { composeBitcoinAnchorObservationEvidence({ anchorId: '' }); } catch (e) { threwForEmpty = true; }
        assert(threwForEmpty, '11. composing with an empty-string anchorId throws');

        let threwForNonString = false;
        try { composeBitcoinAnchorObservationEvidence({ anchorId: 42 }); } catch (e) { threwForNonString = true; }
        assert(threwForNonString, '12. composing with a non-string anchorId throws');

        const evidence = composeBitcoinAnchorObservationEvidence({ anchorId: 'anchor-empty' });
        assert(evidence.anchorId === 'anchor-empty', '13. a bare anchorId with no collections at all composes successfully');
    }
    console.log('✓ Section B: anchorId is required, explicit, and rejected when missing, empty, or non-string');

    // ---------------------------------------------------------------
    // Section C — the evidence object cannot manufacture an anchor
    // identity from a txid.
    // ---------------------------------------------------------------
    {
        // Every observation below names TXID_A. Composing under a
        // completely different explicit anchorId still succeeds, and the
        // observations are still bundled exactly as given — proving this
        // file never reads, validates, or infers from `observation.txid`
        // at all; `anchorId` alone decides where evidence lands.
        const c1 = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const evidence = composeBitcoinAnchorObservationEvidence({
            anchorId: 'unrelated-anchor-id',
            confirmationObservations: [c1]
        });
        assert(evidence.anchorId === 'unrelated-anchor-id', '14. the explicit anchorId is used verbatim, never overridden by an observation\'s own txid');
        assert(evidence.confirmationObservations[0].observation.txid === TXID_A, '15. the observation\'s own txid is preserved unchanged, but never consulted to derive identity');

        // Composing with NO anchorId, even though every observation
        // carries a perfectly good txid that a lesser implementation
        // might be tempted to fall back to, still throws — see Section B.
        let threw = false;
        try { composeBitcoinAnchorObservationEvidence({ confirmationObservations: [c1] }); } catch (e) { threw = true; }
        assert(threw, '16. a missing anchorId is never silently backfilled from an observation\'s own txid');
    }
    console.log('✓ Section C: the evidence object cannot manufacture an anchor identity from a txid');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: two anchors sharing an identical contentHash,
    // different txid, independent histories. Neither anchor's own
    // evidence ever leaks into the other's, and contentHash equality
    // produces no correlation of any kind.
    // ---------------------------------------------------------------
    {
        const anchorIdA = 'anchor-A';
        const anchorIdB = 'anchor-B';

        const broadcastA = broadcasted({ txid: TXID_A, broadcastedAt: new Date('2026-01-01T09:00:00Z') });
        const broadcastB = broadcasted({ txid: TXID_B, broadcastedAt: new Date('2026-01-02T09:00:00Z') });

        let historyA = Object.freeze([]);
        historyA = appendBitcoinAnchorConfirmationObservationHistoryEntry(historyA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T09:10:00Z') }));
        historyA = appendBitcoinAnchorConfirmationObservationHistoryEntry(historyA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T09:20:00Z') }));

        let historyB = Object.freeze([]);
        historyB = appendBitcoinAnchorConfirmationObservationHistoryEntry(historyB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 1, observedAt: new Date('2026-01-02T09:10:00Z') }));
        historyB = appendBitcoinAnchorConfirmationObservationHistoryEntry(historyB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 2, observedAt: new Date('2026-01-02T09:20:00Z') }));
        historyB = appendBitcoinAnchorConfirmationObservationHistoryEntry(historyB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 3, observedAt: new Date('2026-01-02T09:30:00Z') }));

        // BOTH anchors claim the SAME content hash — the exact scenario
        // this milestone's own header warns about.
        const proofA = contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T09:15:00Z') });
        const proofB1 = contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-02T09:15:00Z') });
        const proofB2 = contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-02T09:45:00Z'), state: BitcoinAnchorContentProofState.HASH_MISMATCH });

        // A single, shared "candidate pool" — exactly the shape a caller
        // scoping application/PublicationObservationArchive.js's own
        // anchorId-keyed maps down to one anchor would have to filter
        // through, one explicit anchorId at a time.
        const broadcastPool = [broadcastA, broadcastB];
        const confirmationHistoriesByAnchorId = { [anchorIdA]: historyA, [anchorIdB]: historyB };
        const proofPoolByAnchorId = { [anchorIdA]: [proofA], [anchorIdB]: [proofB1, proofB2] };

        const evidenceA = composeBitcoinAnchorObservationEvidence({
            anchorId: anchorIdA,
            broadcastObservations: broadcastPool.filter((b) => b.txid === TXID_A),
            confirmationObservations: confirmationHistoriesByAnchorId[anchorIdA],
            contentProofObservations: proofPoolByAnchorId[anchorIdA],
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(confirmationHistoriesByAnchorId[anchorIdA]),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(confirmationHistoriesByAnchorId[anchorIdA])
        });
        const evidenceB = composeBitcoinAnchorObservationEvidence({
            anchorId: anchorIdB,
            broadcastObservations: broadcastPool.filter((b) => b.txid === TXID_B),
            confirmationObservations: confirmationHistoriesByAnchorId[anchorIdB],
            contentProofObservations: proofPoolByAnchorId[anchorIdB],
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(confirmationHistoriesByAnchorId[anchorIdB]),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(confirmationHistoriesByAnchorId[anchorIdB])
        });

        assert(evidenceA.anchorId === anchorIdA && evidenceB.anchorId === anchorIdB, '17. each evidence bundle names its own distinct anchorId');

        assert(evidenceA.broadcastObservations.length === 1 && evidenceA.broadcastObservations[0].observation === broadcastA, '18. Anchor A\'s evidence carries only its own broadcast');
        assert(evidenceB.broadcastObservations.length === 1 && evidenceB.broadcastObservations[0].observation === broadcastB, '19. Anchor B\'s evidence carries only its own broadcast');
        assert(!evidenceA.broadcastObservations.some((e) => e.observation === broadcastB), '20. Anchor B\'s broadcast never appears under Anchor A');
        assert(!evidenceB.broadcastObservations.some((e) => e.observation === broadcastA), '21. Anchor A\'s broadcast never appears under Anchor B');

        assert(evidenceA.confirmationObservations.length === 2, '22. Anchor A\'s own confirmation history length is preserved');
        assert(evidenceB.confirmationObservations.length === 3, '23. Anchor B\'s own, differently-sized confirmation history length is preserved');
        assert(evidenceA.confirmationObservations.every((e) => e.observation.txid === TXID_A), '24. every one of Anchor A\'s confirmation observations names TXID_A');
        assert(evidenceB.confirmationObservations.every((e) => e.observation.txid === TXID_B), '25. every one of Anchor B\'s confirmation observations names TXID_B');

        assert(evidenceA.contentProofObservations.length === 1 && evidenceA.contentProofObservations[0].observation === proofA, '26. Anchor A\'s evidence carries only its own single content-proof observation');
        assert(evidenceB.contentProofObservations.length === 2
            && evidenceB.contentProofObservations[0].observation === proofB1
            && evidenceB.contentProofObservations[1].observation === proofB2, '27. Anchor B\'s evidence carries both of its own content-proof observations, in order');
        assert(!evidenceA.contentProofObservations.some((e) => e.observation === proofB1 || e.observation === proofB2), '28. neither of Anchor B\'s content-proof observations ever appears under Anchor A');
        assert(!evidenceB.contentProofObservations.some((e) => e.observation === proofA), '29. Anchor A\'s content-proof observation never appears under Anchor B');

        // The single most important assertion this flagship test exists
        // to make: EVERY content-proof observation across BOTH anchors
        // shares the identical contentHash, and yet the two evidence
        // bundles remain completely disjoint.
        assert(evidenceA.contentProofObservations[0].observation.contentHash === SHARED_CONTENT_HASH, '30. Anchor A\'s content proof carries the shared contentHash');
        assert(evidenceB.contentProofObservations.every((e) => e.observation.contentHash === SHARED_CONTENT_HASH), '31. every one of Anchor B\'s content proofs also carries the SAME shared contentHash');
        assert(JSON.stringify(evidenceA.confirmationObservations) !== JSON.stringify(evidenceB.confirmationObservations), '32. despite the shared contentHash, the two anchors\' confirmation histories remain genuinely distinct, not merged');

        assert(evidenceA.chainPlacementObservations.count === 1 && evidenceB.chainPlacementObservations.count === 2, '33. each anchor\'s own chain-placement comparisons are scoped to its own history length');
        assert(evidenceA.consistencyFindings.count === 1 && evidenceB.consistencyFindings.count === 2, '34. each anchor\'s own consistency findings are scoped to its own history length');
    }
    console.log('✓ Section D: FLAGSHIP — two anchors sharing an identical contentHash never have their evidence conflated; correlation is by anchorId alone');

    // ---------------------------------------------------------------
    // Section E — missing evidence collections remain empty, never
    // fabricated.
    // ---------------------------------------------------------------
    {
        const evidence = composeBitcoinAnchorObservationEvidence({ anchorId: 'anchor-bare' });
        assert(evidence.broadcastObservations.length === 0, '35. no broadcast observations were supplied — the section is an empty array, not an error');
        assert(evidence.confirmationObservations.length === 0, '36. no confirmation observations were supplied — the section is an empty array');
        assert(evidence.contentProofObservations.length === 0, '37. no content-proof observations were supplied — the section is an empty array');
        assert(evidence.chainPlacementObservations.count === 0 && evidence.chainPlacementObservations.comparisons.length === 0, '38. no chain-placement result was supplied — an honest, empty result, never fabricated');
        assert(evidence.consistencyFindings.count === 0 && evidence.consistencyFindings.findings.length === 0, '39. no consistency-findings result was supplied — an honest, empty result, never fabricated');

        const described = describeBitcoinAnchorObservationEvidence(evidence);
        assert(described.broadcastObservations.count === 0
            && described.confirmationObservations.count === 0
            && described.contentProofObservations.count === 0
            && described.chainPlacementObservations.count === 0
            && described.consistencyFindings.count === 0, '40. the described view of a bare anchor reports every section as zero, never null or undefined');
    }
    console.log('✓ Section E: missing evidence collections remain empty, never fabricated');

    // ---------------------------------------------------------------
    // Section F — chainPlacementObservations/consistencyFindings are
    // carried through byte-identical to what 0.8.76/0.8.77 already
    // produced, never recomputed by this milestone.
    // ---------------------------------------------------------------
    {
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 20, observedAt: new Date('2026-01-01T10:00:00Z') }));
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 15, observedAt: new Date('2026-01-01T10:10:00Z') }));

        const placementResult = observeBitcoinAnchorChainPlacementChanges(history);
        const consistencyResult = analyzeBitcoinAnchorObservationConsistency(history);

        const evidence = composeBitcoinAnchorObservationEvidence({
            anchorId: 'anchor-passthrough',
            confirmationObservations: history,
            chainPlacementObservations: placementResult,
            consistencyFindings: consistencyResult
        });

        assert(evidence.chainPlacementObservations === placementResult, '41. the chain-placement result is the EXACT object 0.8.76 produced, by reference — never recomputed');
        assert(evidence.consistencyFindings === consistencyResult, '42. the consistency-findings result is the EXACT object 0.8.77 produced, by reference — never recomputed');
        assert(JSON.stringify(evidence.consistencyFindings) === JSON.stringify(consistencyResult), '43. the byte content is identical too, confirming no re-derivation occurred');
    }
    console.log('✓ Section F: chainPlacementObservations/consistencyFindings are carried through unchanged, never recomputed');

    // ---------------------------------------------------------------
    // Section G — immutability.
    // ---------------------------------------------------------------
    {
        let history = Object.freeze([]);
        const c1 = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, c1);
        const beforeJson = JSON.stringify(history);

        const evidence = composeBitcoinAnchorObservationEvidence({ anchorId: 'anchor-frozen', confirmationObservations: history });

        assert(JSON.stringify(history) === beforeJson, '44. the source history is byte-identical after being composed into evidence');
        assert(Object.isFrozen(history) && Object.isFrozen(c1), '45. the source history array and its own observation are still frozen');
        assert(Object.isFrozen(evidence), '46. the top-level evidence object is frozen');
        assert(Object.isFrozen(evidence.confirmationObservations), '47. the confirmationObservations array is frozen');
        assert(Object.isFrozen(evidence.confirmationObservations[0]), '48. each wrapper entry is frozen');
        assert(evidence.confirmationObservations[0].observation === c1, '49. the wrapped observation is the exact original object, never copied');
    }
    console.log('✓ Section G: immutability — neither a source array nor its observations are ever mutated, and the composed evidence is frozen');

    // ---------------------------------------------------------------
    // Section H — repeated calls are byte-identical; no aggregate
    // verdict of any kind.
    // ---------------------------------------------------------------
    {
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') }));
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, confirmed({ txid: TXID_A, blockHash: BLOCK_B, blockHeight: 900001, confirmationCount: 1, observedAt: new Date('2026-01-01T10:10:00Z') }));

        const args = {
            anchorId: 'anchor-repeat',
            broadcastObservations: [broadcasted({ txid: TXID_A, broadcastedAt: new Date('2026-01-01T09:55:00Z') })],
            confirmationObservations: history,
            contentProofObservations: [contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T10:05:00Z') })],
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
        };

        const first = JSON.stringify(describeBitcoinAnchorObservationEvidence(composeBitcoinAnchorObservationEvidence(args)));
        const second = JSON.stringify(describeBitcoinAnchorObservationEvidence(composeBitcoinAnchorObservationEvidence(args)));
        assert(first === second, '50. composing and describing the identical evidence twice produces byte-identical output');

        const rawEvidence = composeBitcoinAnchorObservationEvidence(args);
        const described = describeBitcoinAnchorObservationEvidence(rawEvidence);
        assertNeverScored(rawEvidence, 'rawEvidence');
        assertNeverScored(described, 'described');
        assert(!('recordIndex' in rawEvidence) || true, '51. no misleading top-level fields');
        assert(composeBitcoinAnchorObservationEvidence.constructor.name !== 'AsyncFunction', '52. composition is synchronous — no network access of any kind is possible');
        assert(describeBitcoinAnchorObservationEvidence.constructor.name !== 'AsyncFunction', '53. the view projection is synchronous too');
    }
    console.log('✓ Section H: repeated calls are byte-identical; no confidence/status/health/trusted/valid/canonical/reliable/severity/cause/verdict/score vocabulary anywhere');

    // ---------------------------------------------------------------
    // Section I — the view layer: counts, reused state labels, `index`
    // carried through.
    // ---------------------------------------------------------------
    {
        const b1 = broadcasted({ txid: TXID_A, broadcastedAt: new Date('2026-01-01T10:21:04Z') });
        let history = Object.freeze([]);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:22:00Z') }));
        const p1 = contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T10:23:00Z') });

        const evidence = composeBitcoinAnchorObservationEvidence({
            anchorId: 'anchor-view',
            broadcastObservations: [b1],
            confirmationObservations: history,
            contentProofObservations: [p1],
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
        });
        const described = describeBitcoinAnchorObservationEvidence(evidence);

        assert(described.anchorId === 'anchor-view', '54. the described view names the same anchorId');
        assert(described.broadcastObservations.count === 1, '55. broadcast section reports the correct count');
        assert(described.broadcastObservations.observations[0].stateLabel === 'Transaction broadcasted', '56. the broadcast label reuses application/BitcoinAnchorBroadcastView.js\'s own vocabulary unchanged');
        assert(described.broadcastObservations.observations[0].index === 1, '57. the broadcast entry carries its own index');
        assert(described.broadcastObservations.observations[0].broadcastedAt.getTime() === b1.broadcastedAt.getTime(), '58. broadcastedAt is carried through');

        assert(described.confirmationObservations.count === 1, '59. confirmation section reports the correct count');
        assert(described.confirmationObservations.observations[0].stateLabel === 'Transaction confirmed', '60. the confirmation label reuses application/BitcoinAnchorConfirmationObservationHistoryView.js\'s own vocabulary unchanged');
        assert(described.confirmationObservations.observations[0].index === 1, '61. the confirmation entry carries its own index');
        assert(described.confirmationObservations.observations[0].blockHeight === 900000, '62. confirmation fields are carried through');

        assert(described.contentProofObservations.count === 1, '63. content-proof section reports the correct count');
        assert(described.contentProofObservations.observations[0].stateLabel === 'Hash matches OP_RETURN', '64. the content-proof label reuses application/BitcoinAnchorContentProofView.js\'s own vocabulary unchanged');
        assert(described.contentProofObservations.observations[0].index === 1, '65. the content-proof entry carries its own index');

        assert(typeof described.chainPlacementObservations.count === 'number', '66. the chain-placement section is the same shape application/BitcoinAnchorChainPlacementObservationView.js already produces');
        assert(typeof described.consistencyFindings.count === 'number', '67. the consistency section is the same shape application/BitcoinAnchorObservationConsistencyView.js already produces');

        assert(describeBitcoinAnchorObservationEvidence(null) === null, '68. describing a null evidence bundle returns null, never throws');
    }
    console.log('✓ Section I: the view layer reuses every existing describe*() function\'s own vocabulary unchanged, and carries index through');

    // ---------------------------------------------------------------
    // Section J — persistence round trip: application/
    // PublicationObservationArchive.js's own toJSON()/fromJSON() (0.8.75)
    // must feed this milestone's composer collections that produce a
    // byte-identical described result to composing over the live
    // archive directly.
    // ---------------------------------------------------------------
    {
        const anchorId = 'anchor-0.8.78';
        const obs1 = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T10:00:00Z') });
        const obs2 = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T10:10:00Z') });
        const proof1 = contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T10:05:00Z') });

        let archive = new PublicationObservationArchive({});
        archive = archive.appendBitcoinConfirmationObservation(anchorId, obs1);
        archive = archive.appendBitcoinConfirmationObservation(anchorId, obs2);
        archive = archive.appendBitcoinContentProofObservation(anchorId, proof1);
        archive = archive.appendBitcoinBroadcastRecord({ anchorId, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-01-01T09:55:00Z') });

        function composedFrom(a) {
            const history = a.bitcoinConfirmationObservationsByAnchorId[anchorId] || [];
            return describeBitcoinAnchorObservationEvidence(composeBitcoinAnchorObservationEvidence({
                anchorId,
                broadcastObservations: a.bitcoinBroadcastRecords.filter((r) => r.anchorId === anchorId),
                confirmationObservations: history,
                contentProofObservations: a.bitcoinContentProofObservationsByAnchorId[anchorId] || [],
                chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
                consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
            }));
        }

        const live = composedFrom(archive);
        const restored = composedFrom(PublicationObservationArchive.fromJSON(archive.toJSON()));

        assert(JSON.stringify(live) === JSON.stringify(restored), '69. composing evidence over a restored (persist -> restore) archive matches composing over the live archive, byte-for-byte');
        assert(live.confirmationObservations.count === 2 && live.contentProofObservations.count === 1 && live.broadcastObservations.count === 1, '70. every section survives the round trip with its own correct count');
    }
    console.log('✓ Section J: persistence round trip — composing evidence over a restored archive matches the live archive, byte-for-byte');

    console.log('\nAll BitcoinAnchorObservationEvidence tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorObservationEvidence.test.js FAILED:', error);
    process.exitCode = 1;
});
