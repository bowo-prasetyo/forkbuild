import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js';

// 0.8.198 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Pairs View.
//
// Section A: FLAGSHIP — two observation records identical except for
//            `candidateMatchesPlan` are explicitly paired; the pair
//            preserves both record references exactly, and feeding it
//            straight into 0.8.197 identifies exactly that one field.
// Section B: reversing source/target reverses the pair without inventing
//            any additional difference.
// Section C: duplicate explicit pairs remain duplicated — no
//            deduplication.
// Section D: decision pairs and observation pairs stay two separate,
//            independently-ordered sections.
// Section E: malformed/absent input degrades to an empty, valid
//            projection, never throws; a malformed individual pair
//            degrades to an all-undefined pair rather than being repaired
//            or dropped.
// Section F: determinism, no mutation, frozen wrapper — but the supplied
//            source/target objects themselves are never frozen or cloned
//            by this file.
// Section G: vocabulary/import boundary — zero imports, no
//            reconstructXxx, no candidate-based/timestamp-based pairing,
//            no sourceOnly/targetOnly reads, no difference/verdict
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

        const sourceRecord = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T1);
        const targetRecord = observationOf(C1, decision1, plan1, true, 'CLAIM', false, T1);

        const pairs = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs({
            observationPairs: [{ source: sourceRecord, target: targetRecord }]
        });

        assert(pairs.observationPairs.length === 1, '1. FLAGSHIP — one explicit pair in, one pair out');
        assert(pairs.observationPairs[0].source === sourceRecord, '2. FLAGSHIP — the pair\'s source is the exact supplied reference');
        assert(pairs.observationPairs[0].target === targetRecord, '3. FLAGSHIP — the pair\'s target is the exact supplied reference');
        assert(pairs.decisionPairs.length === 0, '4. FLAGSHIP — no decisionPairs were supplied, so none are invented');

        const difference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(pairs);
        assert(difference.observationDifferences.length === 1, '5. FLAGSHIP — 0.8.198\'s own result feeds 0.8.197 directly, producing one difference entry');
        assert(serialize(difference.observationDifferences[0].differences) === serialize(['candidateMatchesPlan']), '6. FLAGSHIP — the only difference identified is exactly candidateMatchesPlan');
    }
    console.log('✓ Section A: FLAGSHIP — an explicit pair preserves both record references exactly, and feeding it into 0.8.197 identifies exactly the one differing field');

    // ---------------------------------------------------------------
    // Section B — reversing source/target reverses the pair, without
    // inventing any additional difference.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('C1');
        const decision1 = decisionOf(C1, 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const plan1 = planIdentityOf('FP1');
        const T1 = '2026-08-31T06:00:00.000Z';

        const recordTrue = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T1);
        const recordFalse = observationOf(C1, decision1, plan1, true, 'CLAIM', false, T1);

        const forward = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs({
            observationPairs: [{ source: recordTrue, target: recordFalse }]
        });
        const reversed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs({
            observationPairs: [{ source: recordFalse, target: recordTrue }]
        });

        assert(forward.observationPairs[0].source === recordTrue && forward.observationPairs[0].target === recordFalse, '7. the forward pair keeps source/target in the supplied order');
        assert(reversed.observationPairs[0].source === recordFalse && reversed.observationPairs[0].target === recordTrue, '8. reversing the supplied source/target reverses the pair');

        const forwardDifference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(forward);
        const reversedDifference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(reversed);
        assert(serialize(forwardDifference.observationDifferences[0].differences) === serialize(['candidateMatchesPlan']), '9. the forward pair still identifies exactly candidateMatchesPlan');
        assert(serialize(reversedDifference.observationDifferences[0].differences) === serialize(['candidateMatchesPlan']), '10. the reversed pair identifies exactly candidateMatchesPlan too — no additional difference is invented by reversing');
    }
    console.log('✓ Section B: reversing source/target reverses the pair but never invents an additional difference');

    // ---------------------------------------------------------------
    // Section C — duplicate explicit pairs remain duplicated.
    // ---------------------------------------------------------------
    {
        const source = decisionOf(candidateOf('C1'), 'OBSERVE', 'T1');
        const target = decisionOf(candidateOf('C1'), 'OBSERVE', 'T2');

        const pairs = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs({
            decisionPairs: [{ source, target }, { source, target }, { source, target }]
        });
        assert(pairs.decisionPairs.length === 3, '11. supplying the identical pair three times keeps all three, undeduplicated');
        assert(pairs.decisionPairs.every((pair) => pair.source === source && pair.target === target), '12. every duplicate pair still carries the exact supplied references');
    }
    console.log('✓ Section C: duplicate explicit pairs remain duplicated — no deduplication of any kind');

    // ---------------------------------------------------------------
    // Section D — decision pairs and observation pairs stay separate.
    // ---------------------------------------------------------------
    {
        const decisionSource = decisionOf(candidateOf('C1'), 'OBSERVE', 'T1');
        const decisionTarget = decisionOf(candidateOf('C1'), 'OBSERVE', 'T2');
        const observationSource = observationOf(candidateOf('C2'), decisionSource, planIdentityOf('FP1'), true, 'CLAIM', true, 'T3');
        const observationTarget = observationOf(candidateOf('C2'), decisionSource, planIdentityOf('FP1'), true, 'CLAIM', false, 'T3');

        const pairs = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs({
            decisionPairs: [{ source: decisionSource, target: decisionTarget }],
            observationPairs: [{ source: observationSource, target: observationTarget }]
        });
        assert(pairs.decisionPairs.length === 1 && pairs.observationPairs.length === 1, '13. decisionPairs and observationPairs are both present independently');
        assert(pairs.decisionPairs[0].source === decisionSource, '14. decisionPairs never mixes in an observation record');
        assert(pairs.observationPairs[0].source === observationSource, '15. observationPairs never mixes in a decision record');
    }
    console.log('✓ Section D: decision pairs and observation pairs stay two separate, independently-ordered sections');

    // ---------------------------------------------------------------
    // Section E — malformed/absent input degrades, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-pairs', 42, {}, { decisionPairs: 'nope' }, { observationPairs: 'nope' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(malformed);
            assert(Array.isArray(result.decisionPairs) && result.decisionPairs.length === 0, `16. malformed input (${serialize(malformed)}) degrades decisionPairs to an empty array`);
            assert(Array.isArray(result.observationPairs) && result.observationPairs.length === 0, `17. malformed input (${serialize(malformed)}) degrades observationPairs to an empty array`);
        }

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs({
            decisionPairs: [null, 'not-a-pair', 42, {}, { source: null, target: undefined }],
            observationPairs: [{ source: { candidate: 'X' } }]
        });
        assert(result.decisionPairs.length === 5, '18. a malformed pair does not get dropped — the output array still has one entry per input position');
        for (const pair of result.decisionPairs.slice(0, 4)) {
            assert(pair.source === undefined && pair.target === undefined, '19. an entry that is not itself an object degrades to an all-undefined pair, never throws and is never repaired by substituting another record');
        }
        assert(result.decisionPairs[4].source === null && result.decisionPairs[4].target === undefined, '20. a genuine pair object explicitly supplying source: null is carried through exactly as supplied, never repaired to a guessed record');
        assert(result.observationPairs.length === 1, '21. an observation pair missing target does not get dropped');
        assert(result.observationPairs[0].target === undefined, '22. a genuinely missing target field stays undefined rather than being filled in from elsewhere');
    }
    console.log('✓ Section E: malformed or absent pairs input degrades to an empty projection; a malformed individual pair degrades to an all-undefined pair rather than being repaired or dropped');

    // ---------------------------------------------------------------
    // Section F — determinism, no mutation, frozen wrapper; supplied
    // records themselves are never frozen or cloned.
    // ---------------------------------------------------------------
    {
        const mutableSource = { candidate: 'C1', label: 'unfrozen' };
        const mutableTarget = { candidate: 'C1', label: 'also-unfrozen' };
        const pairsInput = Object.freeze({
            decisionPairs: Object.freeze([Object.freeze({ source: mutableSource, target: mutableTarget })]),
            observationPairs: Object.freeze([])
        });
        const before = serialize(pairsInput);
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(pairsInput);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(pairsInput);
        assert(serialize(first) === serialize(second), '23. calling describeXxx() twice with byte-identical pairs returns a byte-identical result');
        assert(serialize(pairsInput) === before, '24. describeXxx() never mutates the supplied pairs');

        assert(Object.isFrozen(first), '25. the result is frozen');
        assert(Object.isFrozen(first.decisionPairs) && Object.isFrozen(first.observationPairs), '26. each section is frozen');
        assert(Object.isFrozen(first.decisionPairs[0]), '27. each individual pair wrapper is frozen');
        assert(!Object.isFrozen(mutableSource) && !Object.isFrozen(mutableTarget), '28. describeXxx() never freezes the supplied source/target objects themselves');
        assert(first.decisionPairs[0].source === mutableSource, '29. the pair carries the exact supplied source reference through, unfrozen and unclonned');

        mutableSource.label = 'mutated-after-the-fact';
        assert(first.decisionPairs[0].source.label === 'mutated-after-the-fact', '30. this file never clones source/target — a later mutation of the original object is visible through the pair, proving no copy was made');
    }
    console.log('✓ Section F: describeXxx() is deterministic, never mutates the supplied pairs, freezes only its own wrapper, and never clones or freezes the supplied source/target objects');

    // ---------------------------------------------------------------
    // Section G — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '31. this file imports nothing — a pure, duck-typed transform of whatever shape it is handed');
        assert(!/function reconstruct/.test(codeOnly), '32. this file declares no reconstructXxx() of its own');
        assert(!codeOnly.includes('sourceOnly') && !codeOnly.includes('targetOnly'), '33. this file\'s own code never reads sourceOnly/targetOnly — it has no way to invent a pairing');
        assert(!codeOnlyLower.includes('.find('), '34. this file\'s own code never searches for a matching record');

        const forbiddenInCode = ['score', 'rank', 'winner', 'better', 'worse', 'correct', 'incorrect', 'preferred', 'confidence', 'mismatchseverity', 'conflict', 'resolution', 'recommendation', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'repair', 'replace', 'reject(', 'merge', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz', 'differences', 'sameValue'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term.toLowerCase()), `35. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section G: imports nothing, declares no reconstructXxx() of its own, never reads sourceOnly/targetOnly or searches for a match, and carries no difference/verdict vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView.test.js FAILED:', error);
    process.exitCode = 1;
});
