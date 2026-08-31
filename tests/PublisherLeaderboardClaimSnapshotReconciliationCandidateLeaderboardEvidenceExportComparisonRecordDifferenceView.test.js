import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';

// 0.8.197 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Difference View.
//
// Section A: FLAGSHIP — three explicitly paired observations, each
//            differing by exactly one named field, prove the reported
//            `differences` array names exactly that one field, and no
//            other pair's difference leaks across pairs.
// Section B: a decision pair's differing field is named exactly, and an
//            identical decision pair reports zero differences.
// Section C: an observation pair differing in an object-valued field
//            (`candidate`) is reported, while structurally-equal-but-not-
//            reference-equal object fields are never reported as
//            spurious differences.
// Section D: entry/field order is deterministic — one entry per input
//            pair in supplied order; `differences` in the field kind's
//            own fixed order.
// Section E: no automatic pairing — this file never reads sourceOnly/
//            targetOnly itself, and pairing only what the caller supplies
//            never invents a pair the caller did not ask for.
// Section F: malformed/absent input degrades to an empty, valid
//            projection, never throws; a malformed individual pair
//            degrades to an all-undefined, zero-difference entry.
// Section G: determinism, no mutation, frozen output.
// Section H: vocabulary/import boundary — zero imports, no
//            reconstructXxx, no verdict/ranking/synchronization
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

function detailOf(shared, sourceOnly, targetOnly) {
    return Object.freeze({
        sharedCount: shared.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        shared: Object.freeze(shared.slice()),
        sourceOnly: Object.freeze(sourceOnly.slice()),
        targetOnly: Object.freeze(targetOnly.slice())
    });
}

function entryOf(candidate, decisionDetail, observationDetail) {
    return Object.freeze({ candidate, decisionDetail, observationDetail });
}

function exportOf(entries, filter, comparisonState) {
    return Object.freeze({
        protocolVersion: 1,
        comparisonState,
        filter: Object.freeze({ ...filter }),
        candidateCount: entries.length,
        candidates: Object.freeze(entries.slice())
    });
}

const ALL_FILTER = Object.freeze({ evidenceKind: 'ALL', replicaRelation: 'ALL' });

function identityFor(sourceExport, targetExport) {
    const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
    const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detail);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    let flagshipDifference;
    {
        const C1 = candidateOf('C1');
        const decision1 = decisionOf(C1, 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const plan1 = planIdentityOf('FP1');

        const T1 = '2026-08-31T06:00:00.000Z';
        const T2 = '2026-08-31T09:00:00.000Z';

        const O1 = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T1);
        // Differs from O1 by exactly candidateMatchesPlan.
        const O2 = observationOf(C1, decision1, plan1, true, 'CLAIM', false, T1);
        // Differs from O1 by exactly observedAt.
        const O3 = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T2);
        // Differs from O1 by exactly candidateType.
        const O4 = observationOf(C1, decision1, plan1, true, 'PLAN', true, T1);

        const sourceExport = exportOf(
            [entryOf(C1, detailOf([], [], []), detailOf([O1], [], []))],
            ALL_FILTER,
            'PEER_PRESENT'
        );
        const targetExport = exportOf(
            [entryOf(C1, detailOf([], [], []), detailOf([], [O2, O3, O4], []))],
            ALL_FILTER,
            'PEER_PRESENT'
        );

        const identity = identityFor(sourceExport, targetExport);
        assert(identity.observationEvidence.sourceOnly.length === 1, '1. sanity — O1 lands as the one source-only observation');
        assert(identity.observationEvidence.targetOnly.length === 3, '2. sanity — O2/O3/O4 land as the three target-only observations');

        const anchor = identity.observationEvidence.sourceOnly[0];
        const [pairB, pairO, pairT] = identity.observationEvidence.targetOnly;

        flagshipDifference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            observationPairs: [
                { source: anchor, target: pairB },
                { source: anchor, target: pairO },
                { source: anchor, target: pairT }
            ]
        });

        assert(flagshipDifference.observationDifferences.length === 3, '3. FLAGSHIP — one difference entry per explicitly supplied pair');
        assert(serialize(flagshipDifference.observationDifferences[0].differences) === serialize(['candidateMatchesPlan']), '4. FLAGSHIP — pair A differs by exactly candidateMatchesPlan');
        assert(serialize(flagshipDifference.observationDifferences[1].differences) === serialize(['observedAt']), '5. FLAGSHIP — pair B differs by exactly observedAt');
        assert(serialize(flagshipDifference.observationDifferences[2].differences) === serialize(['candidateType']), '6. FLAGSHIP — pair C differs by exactly candidateType');

        // A completely identical pair reports zero differences.
        const identicalDifference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            observationPairs: [{ source: anchor, target: anchor }]
        });
        assert(serialize(identicalDifference.observationDifferences[0].differences) === '[]', '7. FLAGSHIP — an identical pair reports an empty differences array');
    }
    console.log('✓ Section A: FLAGSHIP — three explicitly paired observations, each differing by exactly one named field, report exactly that one field, and an identical pair reports zero differences');

    // ---------------------------------------------------------------
    // Section B — decision pairs.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('C1');
        const source = decisionOf(C1, 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const target = decisionOf(C1, 'OBSERVE', '2026-08-31T00:00:00.000Z');

        const difference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [{ source, target }]
        });
        assert(difference.decisionDifferences.length === 1, '8. one decision difference entry for one supplied pair');
        assert(serialize(difference.decisionDifferences[0].differences) === serialize(['decidedAt']), '9. a decision pair differing only in decidedAt reports exactly ["decidedAt"]');
        assert(difference.decisionDifferences[0].source.decision === 'OBSERVE' && difference.decisionDifferences[0].target.decision === 'OBSERVE', '10. agreeing fields are still reported on both source and target');

        const identical = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [{ source, target: source }]
        });
        assert(serialize(identical.decisionDifferences[0].differences) === '[]', '11. an identical decision pair reports zero differences');
    }
    console.log('✓ Section B: a decision pair\'s differing field is named exactly; an identical decision pair reports zero differences');

    // ---------------------------------------------------------------
    // Section C — object-valued fields, structural not reference equality.
    // ---------------------------------------------------------------
    {
        const D1 = decisionOf(candidateOf('C1'), 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const plan1 = planIdentityOf('FP1');

        const sourceCandidate = candidateOf('C1');
        const targetCandidate = candidateOf('C2');
        const source = observationOf(sourceCandidate, D1, plan1, true, 'CLAIM', true, '2026-08-31T00:00:00.000Z');
        const target = observationOf(targetCandidate, D1, plan1, true, 'CLAIM', true, '2026-08-31T00:00:00.000Z');

        const difference = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            observationPairs: [{ source, target }]
        });
        assert(serialize(difference.observationDifferences[0].differences) === serialize(['candidate']), '12. an object-valued field (candidate) that genuinely differs is reported');

        // A separately-constructed but structurally identical decision
        // object must never be reported as a spurious difference.
        const rebuiltD1 = decisionOf(candidateOf('C1'), 'OBSERVE', '2026-08-30T00:00:00.000Z');
        assert(rebuiltD1 !== D1, '13. sanity — rebuiltD1 is a distinct reference from D1');
        const sameShapeSource = observationOf(sourceCandidate, D1, plan1, true, 'CLAIM', true, '2026-08-31T00:00:00.000Z');
        const sameShapeTarget = observationOf(sourceCandidate, rebuiltD1, plan1, true, 'CLAIM', true, '2026-08-31T00:00:00.000Z');
        const noSpurious = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            observationPairs: [{ source: sameShapeSource, target: sameShapeTarget }]
        });
        assert(serialize(noSpurious.observationDifferences[0].differences) === '[]', '14. a structurally-equal-but-not-reference-equal decision field is never reported as a spurious difference');
    }
    console.log('✓ Section C: object-valued fields are compared structurally — a genuine difference is reported, and a structurally-equal-but-not-reference-equal field is never reported as spurious');

    // ---------------------------------------------------------------
    // Section D — deterministic entry/field order.
    // ---------------------------------------------------------------
    {
        const fieldOrder = flagshipDifference.observationDifferences.map((entry) => Object.keys(entry.source));
        for (const keys of fieldOrder) {
            assert(serialize(keys) === serialize(['candidate', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt']), '15. an observation entry\'s source/target fields are always in the fixed observation field order');
        }

        const D1 = decisionOf(candidateOf('C1'), 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const D2 = decisionOf(candidateOf('C2'), 'DEFER', '2026-08-31T00:00:00.000Z', false);
        const decisionFieldOrder = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [{ source: D1, target: D2 }]
        });
        assert(serialize(decisionFieldOrder.decisionDifferences[0].differences) === serialize(['decided', 'candidate', 'decision', 'decidedAt']), '16. a decision entry differing in every field lists them in the fixed decision field order, never the order they happen to differ in');
    }
    console.log('✓ Section D: entry order matches supplied pair order; differences are always listed in the record kind\'s own fixed field order');

    // ---------------------------------------------------------------
    // Section E — no automatic pairing.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('sourceOnly') && !codeOnly.includes('targetOnly'), '17. this file\'s own code never reads sourceOnly/targetOnly — it never invents a pairing between a source-only and a target-only record');

        // Passing only one side's records, with no pairs at all, produces
        // no invented pairing and no invented difference.
        const noPairsSupplied = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({});
        assert(serialize(noPairsSupplied) === serialize({ decisionDifferences: [], observationDifferences: [] }), '18. supplying no explicit pairs produces no difference entries at all — nothing is invented');
    }
    console.log('✓ Section E: this file never reads sourceOnly/targetOnly itself and never invents a pairing — only explicitly supplied pairs ever produce a difference entry');

    // ---------------------------------------------------------------
    // Section F — malformed/absent input degrades, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-pairs', 42, {}, { decisionPairs: 'nope' }, { observationPairs: 'nope' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(malformed);
            assert(Array.isArray(result.decisionDifferences) && result.decisionDifferences.length === 0, `19. malformed input (${serialize(malformed)}) degrades decisionDifferences to an empty array`);
            assert(Array.isArray(result.observationDifferences) && result.observationDifferences.length === 0, `20. malformed input (${serialize(malformed)}) degrades observationDifferences to an empty array`);
        }

        // A malformed individual pair degrades in place — every input
        // position still has exactly one output position, with an
        // all-undefined source/target and an empty differences array
        // rather than a thrown error or a dropped entry.
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference({
            decisionPairs: [null, 'not-a-pair', 42, {}, { source: null, target: undefined }],
            observationPairs: [{ source: { candidate: 'X' } }]
        });
        assert(result.decisionDifferences.length === 5, '21. a malformed pair does not get dropped — the output array still has one entry per input position');
        for (const entry of result.decisionDifferences) {
            assert(Object.values(entry.source).every((value) => value === undefined), '22. a malformed pair degrades source to an all-undefined identity object, never throws');
            assert(Object.values(entry.target).every((value) => value === undefined), '23. a malformed pair degrades target to an all-undefined identity object, never throws');
            assert(serialize(entry.differences) === '[]', '24. two equally-absent records are never reported as differing on every field');
        }
        assert(result.observationDifferences.length === 1, '25. an observation pair missing target does not get dropped');
        assert(serialize(result.observationDifferences[0].differences) === serialize(['candidate']), '26. a present source field compared against an absent target field is reported as a genuine difference');
    }
    console.log('✓ Section F: malformed or absent pairs input degrades to an empty projection; a malformed individual pair degrades to an all-undefined, zero-difference entry rather than throwing or being dropped');

    // ---------------------------------------------------------------
    // Section G — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const pairsInput = Object.freeze({
            decisionPairs: Object.freeze([Object.freeze({ source: decisionOf(candidateOf('C1'), 'OBSERVE', 'T1'), target: decisionOf(candidateOf('C1'), 'OBSERVE', 'T2') })]),
            observationPairs: Object.freeze([])
        });
        const before = serialize(pairsInput);
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(pairsInput);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(pairsInput);
        assert(serialize(first) === serialize(second), '27. calling describeXxx() twice with byte-identical pairs returns a byte-identical result');
        assert(serialize(pairsInput) === before, '28. describeXxx() never mutates the supplied pairs');

        assert(Object.isFrozen(first), '29. the result is frozen');
        assert(Object.isFrozen(first.decisionDifferences) && Object.isFrozen(first.observationDifferences), '30. each section is frozen');
        assert(Object.isFrozen(first.decisionDifferences[0]), '31. each individual difference entry is frozen');
        assert(Object.isFrozen(first.decisionDifferences[0].source) && Object.isFrozen(first.decisionDifferences[0].differences), '32. each entry\'s source/target/differences are frozen');
    }
    console.log('✓ Section G: describeXxx() is deterministic, never mutates the supplied pairs, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section H — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '33. this file imports nothing — a pure, duck-typed transform of whatever shape it is handed');
        assert(!/function reconstruct/.test(codeOnly), '34. this file declares no reconstructXxx() of its own');

        const forbiddenInCode = ['score', 'rank', 'winner', 'better', 'worse', 'correct', 'incorrect', 'preferred', 'status', 'confidence', 'mismatchseverity', 'conflict', 'resolution', 'recommendation', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `35. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section H: imports nothing, declares no reconstructXxx() of its own, and carries no verdict/ranking/synchronization vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
