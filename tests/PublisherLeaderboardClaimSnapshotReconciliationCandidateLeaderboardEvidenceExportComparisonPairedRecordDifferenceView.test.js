import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js';

// 0.8.200 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Paired Record Difference View.
//
// Section A: FLAGSHIP — the full 0.8.197 -> 0.8.199 -> 0.8.200 pipeline over
//            four explicitly paired observations proves 0.8.200 forwards
//            0.8.199's own facts (counts and per-pair summaries) unchanged,
//            adding only `isEmpty`.
// Section B: an explicitly supplied, completely identical pair is NOT
//            empty — pair existence, not pair difference, drives `isEmpty`.
// Section C: completely empty input (no pairs on either side) is empty.
// Section D: decision/observation independence — a populated branch on one
//            side alone is enough to make `isEmpty` false.
// Section E: input order is preserved.
// Section F: duplicate entries remain distinct, undeduplicated entries.
// Section G: no recalculation — internally inconsistent duck-typed counts
//            are forwarded exactly as supplied, never silently corrected.
// Section H: no record access — entries carrying `source`/`target` fields
//            never have them read or forwarded, proven both behaviorally
//            (poisoned getters) and by source inspection.
// Section I: no comparison logic — source inspection rejects sameValue,
//            JSON.stringify, source/target reads, archive/reconstructXxx,
//            and verdict vocabulary.
// Section J: determinism, no mutation, frozen output throughout.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

function decisionOf(candidate, decision, decidedAt, decided = true) {
    return Object.freeze({ decided, candidate, decision, decidedAt });
}

function planIdentityOf(planFingerprint) {
    return Object.freeze({ planFingerprint });
}

function observationOf(candidate, decision, planIdentity, candidatePresent, candidateType, candidateMatchesPlan, observedAt) {
    return Object.freeze({ candidate, decision, planIdentity, candidatePresent, candidateType, candidateMatchesPlan, observedAt });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('C1');
        const decision1 = decisionOf(C1, 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const plan1 = planIdentityOf('FP1');
        const T1 = '2026-08-31T06:00:00.000Z';
        const T2 = '2026-08-31T09:00:00.000Z';

        const anchor = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T1);
        const P1 = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T1); // identical
        const P2 = observationOf(C1, decision1, plan1, true, 'CLAIM', false, T1); // candidateMatchesPlan differs
        const P3 = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T2); // observedAt differs
        const P4 = observationOf(C1, decision1, plan1, true, 'PLAN', true, T1); // candidateType differs

        const decisionAnchor = decisionOf(candidateOf('C2'), 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const decisionTarget = decisionOf(candidateOf('C2'), 'DEFER', '2026-08-30T00:00:00.000Z');

        const differences = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [{ source: decisionAnchor, target: decisionTarget }],
            observationPairs: [
                { source: anchor, target: P1 },
                { source: anchor, target: P2 },
                { source: anchor, target: P3 },
                { source: anchor, target: P4 }
            ]
        });
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences);
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(readModel);

        assert(view.isEmpty === false, '1. FLAGSHIP — a populated read model is not empty');
        assert(view.decisionCount === readModel.decisionCount, '2. FLAGSHIP — decisionCount is forwarded from the read model unchanged');
        assert(view.observationCount === readModel.observationCount, '3. FLAGSHIP — observationCount is forwarded from the read model unchanged');
        assert(view.differingDecisionCount === readModel.differingDecisionCount, '4. FLAGSHIP — differingDecisionCount is forwarded from the read model unchanged');
        assert(view.differingObservationCount === readModel.differingObservationCount, '5. FLAGSHIP — differingObservationCount is forwarded from the read model unchanged');
        assert(serialize(view.decisionDifferences) === serialize(readModel.decisionDifferences), '6. FLAGSHIP — decisionDifferences is forwarded from the read model unchanged');
        assert(serialize(view.observationDifferences) === serialize(readModel.observationDifferences), '7. FLAGSHIP — observationDifferences is forwarded from the read model unchanged');

        assert(view.observationCount === 4, '8. FLAGSHIP — observationCount counts all four supplied pairs, including the identical one');
        assert(view.differingObservationCount === 3, '9. FLAGSHIP — differingObservationCount counts only the three pairs that actually differ');
        assert(view.observationDifferences[0].differenceCount === 0 && serialize(view.observationDifferences[0].differingFields) === '[]', '10. FLAGSHIP — the identical pair is still present, with zero differences');
        assert(serialize(view.observationDifferences[1].differingFields) === serialize(['candidateMatchesPlan']), '11. FLAGSHIP — pair 2 differs by exactly candidateMatchesPlan');
        assert(serialize(view.observationDifferences[2].differingFields) === serialize(['observedAt']), '12. FLAGSHIP — pair 3 differs by exactly observedAt');
        assert(serialize(view.observationDifferences[3].differingFields) === serialize(['candidateType']), '13. FLAGSHIP — pair 4 differs by exactly candidateType');
        assert(view.decisionCount === 1 && serialize(view.decisionDifferences[0].differingFields) === serialize(['decision']), '14. FLAGSHIP — the decision branch is reported independently and correctly alongside the observation branch');
    }
    console.log('✓ Section A: FLAGSHIP — the full 0.8.197 -> 0.8.199 -> 0.8.200 pipeline forwards every read-model fact unchanged, adding only isEmpty');

    // ---------------------------------------------------------------
    // Section B — an identical pair is not empty.
    // ---------------------------------------------------------------
    {
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [{ differenceCount: 0, differingFields: [] }],
            observationDifferences: [],
            decisionCount: 1,
            observationCount: 0,
            differingDecisionCount: 0,
            differingObservationCount: 0
        });
        assert(view.isEmpty === false, '15. an explicitly supplied, completely identical pair is NOT empty — pair existence, not pair difference, drives isEmpty');
        assert(view.decisionCount === 1 && view.differingDecisionCount === 0, '16. the pair is present and correctly reported as non-differing');
    }
    console.log('✓ Section B: a single explicitly paired, completely identical record is not empty — the distinction between pair existence and pair difference is preserved');

    // ---------------------------------------------------------------
    // Section C — completely empty input is empty.
    // ---------------------------------------------------------------
    {
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [],
            observationDifferences: [],
            decisionCount: 0,
            observationCount: 0,
            differingDecisionCount: 0,
            differingObservationCount: 0
        });
        assert(view.isEmpty === true, '17. a read model with no pairs on either side is empty');
    }
    console.log('✓ Section C: a completely empty read model (no pairs on either side) is empty');

    // ---------------------------------------------------------------
    // Section D — decision/observation independence.
    // ---------------------------------------------------------------
    {
        const decisionOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [{ differenceCount: 1, differingFields: ['decision'] }],
            observationDifferences: [],
            decisionCount: 1,
            observationCount: 0,
            differingDecisionCount: 1,
            differingObservationCount: 0
        });
        assert(decisionOnly.isEmpty === false, '18. a populated decision branch alone is enough to make isEmpty false');
        assert(decisionOnly.observationCount === 0 && decisionOnly.observationDifferences.length === 0, '19. the observation branch stays genuinely empty, never invented');

        const observationOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [],
            observationDifferences: [{ differenceCount: 1, differingFields: ['observedAt'] }],
            decisionCount: 0,
            observationCount: 1,
            differingDecisionCount: 0,
            differingObservationCount: 1
        });
        assert(observationOnly.isEmpty === false, '20. a populated observation branch alone is enough to make isEmpty false');
        assert(observationOnly.decisionCount === 0 && observationOnly.decisionDifferences.length === 0, '21. the decision branch stays genuinely empty, never invented');
    }
    console.log('✓ Section D: decision and observation branches are independent — either one alone populated is enough to make isEmpty false, and the other stays genuinely empty');

    // ---------------------------------------------------------------
    // Section E — input order is preserved.
    // ---------------------------------------------------------------
    {
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [
                { differenceCount: 1, differingFields: ['decision'] },
                { differenceCount: 0, differingFields: [] },
                { differenceCount: 1, differingFields: ['decidedAt'] }
            ],
            observationDifferences: [],
            decisionCount: 3,
            observationCount: 0,
            differingDecisionCount: 2,
            differingObservationCount: 0
        });
        assert(serialize(view.decisionDifferences[0].differingFields) === serialize(['decision']), '22. entry order position 0 is preserved');
        assert(serialize(view.decisionDifferences[1].differingFields) === '[]', '23. entry order position 1 is preserved');
        assert(serialize(view.decisionDifferences[2].differingFields) === serialize(['decidedAt']), '24. entry order position 2 is preserved');
    }
    console.log('✓ Section E: input order is preserved exactly, position for position');

    // ---------------------------------------------------------------
    // Section F — duplicate entries remain distinct.
    // ---------------------------------------------------------------
    {
        const duplicateEntry = Object.freeze({ differenceCount: 1, differingFields: Object.freeze(['decision']) });
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [duplicateEntry, duplicateEntry],
            observationDifferences: [],
            decisionCount: 2,
            observationCount: 0,
            differingDecisionCount: 2,
            differingObservationCount: 0
        });
        assert(view.decisionDifferences.length === 2, '25. two identical difference entries remain two entries, never deduplicated');
        assert(view.decisionDifferences[0] !== view.decisionDifferences[1], '26. the two entries are distinct copies, not the same reference forwarded twice into a merged shape');
    }
    console.log('✓ Section F: duplicate entries are never deduplicated — two identical entries in produce two entries out');

    // ---------------------------------------------------------------
    // Section G — no recalculation.
    // ---------------------------------------------------------------
    {
        // A single entry array, but top-level counts that deliberately
        // disagree with that array's own length. 0.8.200 must forward the
        // supplied counts exactly, never silently "correct" them to match
        // the array length it was also handed.
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [{ differenceCount: 1, differingFields: ['decision'] }],
            observationDifferences: [],
            decisionCount: 99,
            observationCount: 0,
            differingDecisionCount: 77,
            differingObservationCount: 0
        });
        assert(view.decisionCount === 99, '27. decisionCount is forwarded exactly as supplied, never recomputed from decisionDifferences.length (1)');
        assert(view.differingDecisionCount === 77, '28. differingDecisionCount is forwarded exactly as supplied, never recomputed from the array\'s own differing entries');
        assert(view.decisionDifferences.length === 1, '29. the entry array itself is still forwarded unchanged, independent of the (inconsistent) counts');

        // An entry whose differenceCount disagrees with its own
        // differingFields.length must also be forwarded verbatim.
        const inconsistentEntry = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [{ differenceCount: 5, differingFields: ['decision'] }],
            observationDifferences: [],
            decisionCount: 1,
            observationCount: 0,
            differingDecisionCount: 1,
            differingObservationCount: 0
        });
        assert(inconsistentEntry.decisionDifferences[0].differenceCount === 5, '30. an entry\'s own differenceCount is forwarded verbatim, even when it disagrees with differingFields.length (1)');
        assert(serialize(inconsistentEntry.decisionDifferences[0].differingFields) === serialize(['decision']), '31. an entry\'s own differingFields is forwarded verbatim alongside the (disagreeing) differenceCount');

        // An entry carrying the raw 0.8.197 vocabulary (`differences`)
        // rather than 0.8.199's own (`differenceCount`/`differingFields`)
        // must never be read for that field — it degrades to a
        // zero-difference summary rather than deriving anything from
        // `differences`.
        const wrongVocabulary = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [{ differences: ['decision'] }],
            observationDifferences: [],
            decisionCount: 1,
            observationCount: 0,
            differingDecisionCount: 1,
            differingObservationCount: 0
        });
        assert(wrongVocabulary.decisionDifferences[0].differenceCount === 0 && serialize(wrongVocabulary.decisionDifferences[0].differingFields) === '[]', '32. an entry carrying only the raw 0.8.197 `differences` field (never 0.8.199\'s own differenceCount/differingFields) degrades to zero, rather than reading or reinterpreting `differences` itself');
    }
    console.log('✓ Section G: internally inconsistent or unexpectedly-shaped duck-typed counts and entries are forwarded/degraded exactly as supplied, never silently recalculated or corrected');

    // ---------------------------------------------------------------
    // Section H — no record access.
    // ---------------------------------------------------------------
    {
        function poisoned(label) {
            return new Proxy({}, {
                get(target, property) {
                    throw new Error(`should never be accessed: ${label}.${String(property)}`);
                }
            });
        }

        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView({
            decisionDifferences: [{
                differenceCount: 1,
                differingFields: ['decision'],
                source: poisoned('source'),
                target: poisoned('target')
            }],
            observationDifferences: [],
            decisionCount: 1,
            observationCount: 0,
            differingDecisionCount: 1,
            differingObservationCount: 0
        });
        assert(serialize(view.decisionDifferences[0]) === serialize({ differenceCount: 1, differingFields: ['decision'] }), '33. an entry\'s source/target fields, even when accessing them would throw, are never read and never forwarded');

        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.source') && !codeOnly.includes('.target'), '34. this file\'s own code never reads a pair\'s own source/target');
    }
    console.log('✓ Section H: source/target fields on an entry are never read, even when a poisoned getter would throw on access — proven behaviorally and by source inspection');

    // ---------------------------------------------------------------
    // Section I — no comparison logic.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '35. this file imports nothing — a pure, duck-typed transform of whatever shape it is handed');
        assert(!/function reconstruct/.test(codeOnly), '36. this file declares no reconstructXxx() of its own');
        assert(!codeOnlyLower.includes('samevalue'), '37. this file performs no structural equality comparison of its own');
        assert(!codeOnly.includes('JSON.stringify'), '38. this file never serializes values for comparison');
        assert(!codeOnly.includes('sourceOnly') && !codeOnly.includes('targetOnly'), '39. this file never reads sourceOnly/targetOnly');
        assert(!codeOnlyLower.includes('archive'), '40. this file never reads or references an archive');

        const forbiddenInCode = ['score', 'rank', 'winner', 'better', 'worse', 'correct', 'incorrect', 'preferred', 'status', 'confidence', 'mismatchseverity', 'conflict', 'resolution', 'recommendation', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz', 'same', 'hasdifferences', 'matchingpaircount', 'mismatchingpaircount'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `41. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section I: imports nothing, declares no reconstructXxx() of its own, performs no comparison/matching of its own, and carries no verdict/interpretive vocabulary');

    // ---------------------------------------------------------------
    // Section J — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const readModelInput = Object.freeze({
            decisionDifferences: Object.freeze([Object.freeze({ differenceCount: 1, differingFields: Object.freeze(['decision']) })]),
            observationDifferences: Object.freeze([]),
            decisionCount: 1,
            observationCount: 0,
            differingDecisionCount: 1,
            differingObservationCount: 0
        });
        const before = serialize(readModelInput);
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(readModelInput);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(readModelInput);
        assert(serialize(first) === serialize(second), '42. calling describeXxx() twice with byte-identical input returns a byte-identical result');
        assert(serialize(readModelInput) === before, '43. describeXxx() never mutates the supplied read model');

        assert(Object.isFrozen(first), '44. the result is frozen');
        assert(Object.isFrozen(first.decisionDifferences) && Object.isFrozen(first.observationDifferences), '45. each section is frozen');
        assert(Object.isFrozen(first.decisionDifferences[0]), '46. each individual entry is frozen');
        assert(Object.isFrozen(first.decisionDifferences[0].differingFields), '47. each entry\'s differingFields array is frozen');
    }
    console.log('✓ Section J: describeXxx() is deterministic, never mutates the supplied read model, and returns frozen output throughout');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
