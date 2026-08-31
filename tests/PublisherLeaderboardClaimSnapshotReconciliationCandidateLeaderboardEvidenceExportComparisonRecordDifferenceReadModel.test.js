import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js';

// 0.8.199 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Difference Read Model.
//
// Section A: FLAGSHIP — four explicitly paired observations (identical,
//            candidateMatchesPlan differs, observedAt differs, candidateType
//            differs) prove observationCount/differingObservationCount and
//            each summary's differenceCount/differingFields, with the
//            zero-difference pair still present as its own entry.
// Section B: repeated with decisions, proving the two record kinds remain
//            independent.
// Section C: pair order preservation, and duplicate pairs both survive as
//            separate summaries.
// Section D: zero-pair input produces zero counts, not an omitted section.
// Section E: malformed/absent input degrades to an empty, valid read
//            model, never throws; a malformed individual entry degrades to
//            a zero-difference summary.
// Section F: determinism, no mutation, frozen output throughout.
// Section G: vocabulary/import boundary — zero imports, no
//            reconstructXxx, no sameValue/comparison of its own, no
//            source/target/sourceOnly/targetOnly reads, no verdict
//            vocabulary.

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

        const differences = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            observationPairs: [
                { source: anchor, target: P1 },
                { source: anchor, target: P2 },
                { source: anchor, target: P3 },
                { source: anchor, target: P4 }
            ]
        });

        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences);

        assert(readModel.observationCount === 4, '1. FLAGSHIP — observationCount counts all four supplied pairs, including the identical one');
        assert(readModel.differingObservationCount === 3, '2. FLAGSHIP — differingObservationCount counts only the three pairs that actually differ');
        assert(readModel.observationDifferences.length === 4, '3. FLAGSHIP — one summary entry per supplied pair, in the same position');

        assert(readModel.observationDifferences[0].differenceCount === 0, '4. FLAGSHIP — P1 (identical) has differenceCount 0');
        assert(serialize(readModel.observationDifferences[0].differingFields) === '[]', '5. FLAGSHIP — P1 (identical) has an empty differingFields array, and is still present as its own entry');

        assert(readModel.observationDifferences[1].differenceCount === 1, '6. FLAGSHIP — P2 has differenceCount 1');
        assert(serialize(readModel.observationDifferences[1].differingFields) === serialize(['candidateMatchesPlan']), '7. FLAGSHIP — P2 differs by exactly candidateMatchesPlan');

        assert(readModel.observationDifferences[2].differenceCount === 1, '8. FLAGSHIP — P3 has differenceCount 1');
        assert(serialize(readModel.observationDifferences[2].differingFields) === serialize(['observedAt']), '9. FLAGSHIP — P3 differs by exactly observedAt');

        assert(readModel.observationDifferences[3].differenceCount === 1, '10. FLAGSHIP — P4 has differenceCount 1');
        assert(serialize(readModel.observationDifferences[3].differingFields) === serialize(['candidateType']), '11. FLAGSHIP — P4 differs by exactly candidateType');

        assert(readModel.decisionCount === 0 && readModel.differingDecisionCount === 0 && readModel.decisionDifferences.length === 0, '12. FLAGSHIP — no decision pairs were supplied, so none are invented on the decision side');
    }
    console.log('✓ Section A: FLAGSHIP — four explicitly paired observations report the correct counts and per-pair summaries, with the zero-difference pair preserved as its own entry');

    // ---------------------------------------------------------------
    // Section B — decisions remain independent of observations.
    // ---------------------------------------------------------------
    {
        const anchor = decisionOf(candidateOf('C1'), 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const D1 = decisionOf(candidateOf('C1'), 'OBSERVE', '2026-08-30T00:00:00.000Z'); // identical
        const D2 = decisionOf(candidateOf('C1'), 'DEFER', '2026-08-30T00:00:00.000Z'); // decision differs
        const D3 = decisionOf(candidateOf('C1'), 'OBSERVE', '2026-08-31T00:00:00.000Z'); // decidedAt differs

        const differences = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [
                { source: anchor, target: D1 },
                { source: anchor, target: D2 },
                { source: anchor, target: D3 }
            ]
        });
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences);

        assert(readModel.decisionCount === 3, '13. decisionCount counts all three supplied decision pairs');
        assert(readModel.differingDecisionCount === 2, '14. differingDecisionCount counts only the two pairs that actually differ');
        assert(serialize(readModel.decisionDifferences[0].differingFields) === '[]', '15. an identical decision pair reports an empty differingFields array');
        assert(serialize(readModel.decisionDifferences[1].differingFields) === serialize(['decision']), '16. a decision pair differing only in decision reports exactly ["decision"]');
        assert(serialize(readModel.decisionDifferences[2].differingFields) === serialize(['decidedAt']), '17. a decision pair differing only in decidedAt reports exactly ["decidedAt"]');
        assert(readModel.observationCount === 0 && readModel.differingObservationCount === 0 && readModel.observationDifferences.length === 0, '18. supplying only decision pairs invents no observation summaries');
    }
    console.log('✓ Section B: decision summaries and counts are computed independently of observation summaries, proving the two record kinds remain independent');

    // ---------------------------------------------------------------
    // Section C — pair order preservation and duplicate pairs.
    // ---------------------------------------------------------------
    {
        const source = decisionOf(candidateOf('C1'), 'OBSERVE', 'T1');
        const target = decisionOf(candidateOf('C1'), 'DEFER', 'T1');
        const differences = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [{ source, target }, { source, target }, { source, target }]
        });
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences);
        assert(readModel.decisionCount === 3, '19. duplicate pairs are each counted, never deduplicated');
        assert(readModel.differingDecisionCount === 3, '20. duplicate differing pairs are each counted as differing');
        for (const summary of readModel.decisionDifferences) {
            assert(serialize(summary.differingFields) === serialize(['decision']), '21. every duplicate summary independently reports the same differing field');
        }
    }
    console.log('✓ Section C: pair order is preserved, and duplicate pairs remain undeduplicated, each producing its own summary');

    // ---------------------------------------------------------------
    // Section D — zero-pair input.
    // ---------------------------------------------------------------
    {
        const differences = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({});
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences);
        assert(serialize(readModel) === serialize({
            decisionDifferences: [],
            observationDifferences: [],
            decisionCount: 0,
            observationCount: 0,
            differingDecisionCount: 0,
            differingObservationCount: 0
        }), '22. zero supplied pairs produce an all-zero, empty read model, with both sections present as empty arrays');
    }
    console.log('✓ Section D: zero-pair input produces an all-zero read model, never an omitted section');

    // ---------------------------------------------------------------
    // Section E — malformed/absent input degrades, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-differences', 42, {}, { decisionDifferences: 'nope' }, { observationDifferences: 'nope' }]) {
            const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(malformed);
            assert(Array.isArray(readModel.decisionDifferences) && readModel.decisionDifferences.length === 0, `23. malformed input (${serialize(malformed)}) degrades decisionDifferences to an empty array`);
            assert(Array.isArray(readModel.observationDifferences) && readModel.observationDifferences.length === 0, `24. malformed input (${serialize(malformed)}) degrades observationDifferences to an empty array`);
            assert(readModel.decisionCount === 0 && readModel.observationCount === 0 && readModel.differingDecisionCount === 0 && readModel.differingObservationCount === 0, `25. malformed input (${serialize(malformed)}) degrades every count to 0`);
        }

        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel({
            decisionDifferences: [null, 'not-an-entry', 42, {}, { differences: 'nope' }, { source: {}, target: {}, differences: ['decidedAt'] }],
            observationDifferences: [{ differences: ['candidate'] }]
        });
        assert(readModel.decisionDifferences.length === 6, '26. a malformed entry does not get dropped — the output array still has one entry per input position');
        for (const summary of readModel.decisionDifferences.slice(0, 5)) {
            assert(summary.differenceCount === 0 && serialize(summary.differingFields) === '[]', '27. a malformed entry degrades to a zero-difference summary, never throws');
        }
        assert(readModel.decisionDifferences[5].differenceCount === 1 && serialize(readModel.decisionDifferences[5].differingFields) === serialize(['decidedAt']), '28. a genuine entry alongside malformed ones is still summarized correctly');
        assert(readModel.differingDecisionCount === 1, '29. differingDecisionCount only counts the one genuinely differing entry among the malformed ones');
        assert(readModel.observationDifferences.length === 1 && readModel.observationDifferences[0].differenceCount === 1, '30. an observation entry missing source/target is still summarized from its own differences array');
    }
    console.log('✓ Section E: malformed or absent input degrades to an empty read model; a malformed individual entry degrades to a zero-difference summary rather than throwing or being dropped');

    // ---------------------------------------------------------------
    // Section F — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const differencesInput = Object.freeze({
            decisionDifferences: Object.freeze([Object.freeze({ source: {}, target: {}, differences: Object.freeze(['decidedAt']) })]),
            observationDifferences: Object.freeze([])
        });
        const before = serialize(differencesInput);
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differencesInput);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differencesInput);
        assert(serialize(first) === serialize(second), '31. calling describeXxx() twice with byte-identical input returns a byte-identical result');
        assert(serialize(differencesInput) === before, '32. describeXxx() never mutates the supplied differences');

        assert(Object.isFrozen(first), '33. the result is frozen');
        assert(Object.isFrozen(first.decisionDifferences) && Object.isFrozen(first.observationDifferences), '34. each section is frozen');
        assert(Object.isFrozen(first.decisionDifferences[0]), '35. each individual summary entry is frozen');
        assert(Object.isFrozen(first.decisionDifferences[0].differingFields), '36. each entry\'s differingFields array is frozen');
    }
    console.log('✓ Section F: describeXxx() is deterministic, never mutates the supplied differences, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section G — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '37. this file imports nothing — a pure, duck-typed transform of whatever shape it is handed');
        assert(!/function reconstruct/.test(codeOnly), '38. this file declares no reconstructXxx() of its own');
        assert(!codeOnly.includes('sourceOnly') && !codeOnly.includes('targetOnly'), '39. this file\'s own code never reads sourceOnly/targetOnly');
        assert(!codeOnly.includes('.source') && !codeOnly.includes('.target'), '40. this file\'s own code never reads a pair\'s own source/target — only its already-computed differences array');
        assert(!codeOnlyLower.includes('samevalue') && !codeOnlyLower.includes('.find('), '41. this file performs no comparison or matching of its own');

        const forbiddenInCode = ['score', 'rank', 'winner', 'better', 'worse', 'correct', 'incorrect', 'preferred', 'status', 'confidence', 'mismatchseverity', 'conflict', 'resolution', 'recommendation', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `42. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section G: imports nothing, declares no reconstructXxx() of its own, never reads source/target/sourceOnly/targetOnly, performs no comparison of its own, and carries no verdict vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.test.js FAILED:', error);
    process.exitCode = 1;
});
