import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';

// 0.8.193 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Detail View.
//
// Section A: FLAGSHIP — the milestone's own worked example. C1 carries
//            shared, source-only, AND target-only evidence simultaneously
//            across both dimensions; C2 is a shared candidate with
//            target-only decision evidence but shared observation
//            evidence — candidate presence and evidence partitions proven
//            independent, and every record landing in exactly the right
//            partition.
// Section B: duplicate records retain multiplicity (forwarded, not
//            deduplicated).
// Section C: evidence stays flat — never regrouped by candidate.
// Section D: this file's own result never carries a count field on any
//            section.
// Section E: this file consumes 0.8.189's own result by reference, never
//            copies or reorders its arrays.
// Section F: metadata is forwarded verbatim and stays independent of
//            evidence.
// Section G: malformed/absent input degrades to an empty, valid detail
//            view, never throws.
// Section H: determinism, no mutation, frozen output.
// Section I: vocabulary/import boundary — zero imports, no reconstructXxx,
//            no ranking/judgment/synchronization vocabulary, no counts.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
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

function observationOf(id, observedAt) {
    return Object.freeze({ id, observedAt });
}

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

function entryOf(claimId, decisionDetail, observationDetail) {
    return Object.freeze({ candidate: candidateOf(claimId), decisionDetail, observationDetail });
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

function ids(records) {
    return records.map((record) => (typeof record === 'string' ? record : record.id));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    let flagshipComparison;
    {
        const O1 = observationOf('O1', '2026-08-31T06:00:00.000Z');
        const O2 = observationOf('O2', '2026-08-31T07:00:00.000Z');
        const O3 = observationOf('O3', '2026-08-31T08:00:00.000Z');
        const O4 = observationOf('O4', '2026-08-31T09:00:00.000Z');

        const c1Source = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf([O1], [O2], []));
        const c2Source = entryOf('C2', detailOf([], [], []), detailOf([O4], [], []));
        const sourceExport = exportOf([c1Source, c2Source], ALL_FILTER, 'PEER_PRESENT');

        const c1Target = entryOf('C1', detailOf(['D1'], [], []), detailOf([O1], [], [O3]));
        const c2Target = entryOf('C2', detailOf([], [], ['D3']), detailOf([O4], [], []));
        const targetExport = exportOf([c1Target, c2Target], ALL_FILTER, 'PEER_PRESENT');

        flagshipComparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(flagshipComparison);

        // Candidate presence: both C1 and C2 are shared candidates.
        assert(detail.candidates.shared.map((c) => c.claimId).join(',') === 'C1,C2', '1. FLAGSHIP — both C1 and C2 are shared candidates');
        assert(detail.candidates.sourceOnly.length === 0 && detail.candidates.targetOnly.length === 0, '2. FLAGSHIP — no candidate is exclusive to either document');

        // Decision evidence: D1 shared, D2 source-only, D3 target-only.
        assert(ids(detail.decisionEvidence.shared).join(',') === 'D1', '3. FLAGSHIP — D1 is shared decision evidence');
        assert(ids(detail.decisionEvidence.sourceOnly).join(',') === 'D2', '4. FLAGSHIP — D2 is source-only decision evidence (belongs to C1)');
        assert(ids(detail.decisionEvidence.targetOnly).join(',') === 'D3', '5. FLAGSHIP — D3 is target-only decision evidence (belongs to C2)');

        // Observation evidence: O1 shared, O2 source-only, O3 target-only, O4 shared.
        assert(ids(detail.observationEvidence.shared).join(',') === 'O1,O4', '6. FLAGSHIP — O1 (C1) and O4 (C2) are shared observation evidence');
        assert(ids(detail.observationEvidence.sourceOnly).join(',') === 'O2', '7. FLAGSHIP — O2 is source-only observation evidence (belongs to C1)');
        assert(ids(detail.observationEvidence.targetOnly).join(',') === 'O3', '8. FLAGSHIP — O3 is target-only observation evidence (belongs to C1)');

        // C1 simultaneously carries shared/source-only/target-only evidence.
        const c1HasShared = detail.decisionEvidence.shared.some((r) => r === 'D1') || ids(detail.observationEvidence.shared).includes('O1');
        const c1HasSourceOnly = detail.decisionEvidence.sourceOnly.some((r) => r === 'D2') || ids(detail.observationEvidence.sourceOnly).includes('O2');
        const c1HasTargetOnly = ids(detail.observationEvidence.targetOnly).includes('O3');
        assert(c1HasShared && c1HasSourceOnly && c1HasTargetOnly, '9. FLAGSHIP — C1 simultaneously has shared, source-only, and target-only evidence');

        // C2 has target-only decision evidence but shared observation evidence,
        // while remaining a shared candidate — presence and evidence agreement
        // never collapse into one fact.
        const c2HasTargetOnlyDecision = detail.decisionEvidence.targetOnly.some((r) => r === 'D3');
        const c2HasSharedObservation = ids(detail.observationEvidence.shared).includes('O4');
        const c2IsSharedCandidate = detail.candidates.shared.some((c) => c.claimId === 'C2');
        assert(c2HasTargetOnlyDecision && c2HasSharedObservation && c2IsSharedCandidate, '10. FLAGSHIP — C2 is a shared candidate with target-only decision evidence but shared observation evidence');

        // Duplicate records retain multiplicity — 0.8.189's own multiset
        // partitioning already guarantees this; this file must not collapse it.
        const dupSourceExport = exportOf([entryOf('C1', detailOf(['D1', 'D1'], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const dupTargetExport = exportOf([entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const dupComparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(dupSourceExport, dupTargetExport);
        const dupDetail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(dupComparison);
        assert(dupDetail.decisionEvidence.shared.length === 1 && dupDetail.decisionEvidence.sourceOnly.length === 1, '11. FLAGSHIP — duplicate records retain multiplicity: [D1, D1] vs [D1] yields one shared and one source-only, never collapsed');

        // Record order matches the order 0.8.189 itself already supplied —
        // never re-sorted, never re-grouped by candidate.
        assert(serialize(ids(detail.decisionEvidence.sourceOnly)) === serialize(ids(flagshipComparison.decisionEvidence.sourceOnly)), '12. FLAGSHIP — decisionEvidence.sourceOnly order matches 0.8.189\'s own order exactly');
        assert(serialize(ids(detail.observationEvidence.shared)) === serialize(ids(flagshipComparison.observationEvidence.shared)), '13. FLAGSHIP — observationEvidence.shared order matches 0.8.189\'s own order exactly');
    }
    console.log('✓ Section A: FLAGSHIP — C1 carries shared/source-only/target-only evidence simultaneously, C2 is a shared candidate with target-only decision evidence but shared observation evidence, every record lands in exactly the correct partition, duplicates retain multiplicity, and order is preserved');

    // ---------------------------------------------------------------
    // Section B — duplicate records retain multiplicity (standalone).
    // ---------------------------------------------------------------
    {
        const sourceExport = exportOf([entryOf('C1', detailOf([], [], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z'), observationOf('O1', '2026-08-31T06:00:00.000Z')], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([entryOf('C1', detailOf([], [], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison);
        assert(detail.observationEvidence.shared.length === 1 && detail.observationEvidence.sourceOnly.length === 1 && detail.observationEvidence.targetOnly.length === 0, '14. two identical observations against one — exactly one shared, one source-only, never a set collapse');
    }
    console.log('✓ Section B: duplicate records are forwarded with their full multiplicity intact');

    // ---------------------------------------------------------------
    // Section C — evidence stays flat, never regrouped by candidate.
    // ---------------------------------------------------------------
    {
        assert(Array.isArray(flagshipComparison.decisionEvidence.shared), '15. sanity — 0.8.189\'s own decisionEvidence.shared is a flat array');
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(flagshipComparison);
        assert(Array.isArray(detail.decisionEvidence.shared) && typeof detail.decisionEvidence.shared[0] !== 'object' || typeof detail.decisionEvidence.shared[0] === 'string', '16. decisionEvidence.shared remains a flat array of records, never grouped under a per-candidate key');
        assert(!('candidates' in detail.decisionEvidence) && !('byCandidate' in detail.decisionEvidence), '17. no per-candidate grouping key is introduced on decisionEvidence');
        assert(!('candidates' in detail.observationEvidence) && !('byCandidate' in detail.observationEvidence), '18. no per-candidate grouping key is introduced on observationEvidence');
    }
    console.log('✓ Section C: decision and observation evidence remain flat, cross-candidate arrays — never regrouped under a per-candidate key');

    // ---------------------------------------------------------------
    // Section D — no count field on this file's own result.
    // ---------------------------------------------------------------
    {
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(flagshipComparison);
        for (const section of [detail.candidates, detail.decisionEvidence, detail.observationEvidence]) {
            for (const forbiddenKey of ['sharedCount', 'sourceOnlyCount', 'targetOnlyCount', 'sourceCount', 'targetCount']) {
                assert(!(forbiddenKey in section), `19. section carries no "${forbiddenKey}" field — this file reports records, never counts`);
            }
            assert(Object.keys(section).sort().join(',') === 'shared,sourceOnly,targetOnly', '20. each section carries exactly shared/sourceOnly/targetOnly, nothing else');
        }
    }
    console.log('✓ Section D: no section on this file\'s own result carries any count field — a caller wanting counts uses 0.8.190\'s own read model');

    // ---------------------------------------------------------------
    // Section E — records are forwarded by reference, never copied/reordered.
    // ---------------------------------------------------------------
    {
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(flagshipComparison);
        assert(detail.candidates.shared === flagshipComparison.candidates.shared, '21. candidates.shared is 0.8.189\'s own array, referenced unchanged');
        assert(detail.decisionEvidence.sourceOnly === flagshipComparison.decisionEvidence.sourceOnly, '22. decisionEvidence.sourceOnly is 0.8.189\'s own array, referenced unchanged');
        assert(detail.observationEvidence.targetOnly === flagshipComparison.observationEvidence.targetOnly, '23. observationEvidence.targetOnly is 0.8.189\'s own array, referenced unchanged');
    }
    console.log('✓ Section E: this file forwards 0.8.189\'s own record arrays by reference — no copying, no re-partitioning, no reordering');

    // ---------------------------------------------------------------
    // Section F — metadata forwarded verbatim, independent of evidence.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []));
        const sourceExport = exportOf([c1], { evidenceKind: 'OBSERVATIONS', replicaRelation: 'SOURCE_ONLY' }, 'PEER_PRESENT');
        const targetExport = exportOf([c1], { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }, 'PEER_EMPTY');
        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison);

        assert(detail.metadata.filter.source.replicaRelation === 'SOURCE_ONLY' && detail.metadata.filter.target.replicaRelation === 'TARGET_ONLY', '24. metadata.filter forwards each side\'s own filter verbatim');
        assert(detail.metadata.filter.same === false, '25. differing filters report sameFilter === false');
        assert(detail.metadata.comparisonState.source === 'PEER_PRESENT' && detail.metadata.comparisonState.target === 'PEER_EMPTY', '26. metadata.comparisonState forwards each side\'s own state verbatim');
        assert(detail.metadata.comparisonState.same === false, '27. differing comparison states report same === false');
        // Metadata disagreement never leaks into evidence, and vice versa.
        assert(detail.decisionEvidence.sourceOnly.length === 0 && detail.decisionEvidence.targetOnly.length === 0, '28. metadata disagreement does not affect the (fully shared) evidence comparison itself');
    }
    console.log('✓ Section F: metadata (comparisonState/filter) is forwarded verbatim and stays fully independent of the evidence sections');

    // ---------------------------------------------------------------
    // Section G — malformed/absent input degrades, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-a-comparison', 42, {}, { candidates: 'nope' }, { decisionEvidence: { shared: 'nope' } }]) {
            const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(malformed);
            assert(Array.isArray(detail.candidates.shared) && detail.candidates.shared.length === 0, `29. malformed input (${serialize(malformed)}) degrades candidates.shared to an empty array`);
            assert(Array.isArray(detail.decisionEvidence.sourceOnly) && detail.decisionEvidence.sourceOnly.length === 0, `30. malformed input (${serialize(malformed)}) degrades decisionEvidence.sourceOnly to an empty array`);
            assert(Array.isArray(detail.observationEvidence.targetOnly) && detail.observationEvidence.targetOnly.length === 0, `31. malformed input (${serialize(malformed)}) degrades observationEvidence.targetOnly to an empty array`);
            assert(detail.metadata.comparisonState.source === 'NO_PEER' && detail.metadata.comparisonState.target === 'NO_PEER', `32. malformed input (${serialize(malformed)}) degrades comparisonState to NO_PEER`);
            assert(detail.metadata.filter.source.evidenceKind === 'ALL' && detail.metadata.filter.source.replicaRelation === 'ALL', `33. malformed input (${serialize(malformed)}) degrades filter to ALL/ALL`);
        }
    }
    console.log('✓ Section G: malformed or absent comparison input degrades to an empty, valid detail view on every section — never throws');

    // ---------------------------------------------------------------
    // Section H — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const before = serialize(flagshipComparison);
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(flagshipComparison);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(flagshipComparison);
        assert(serialize(first) === serialize(second), '34. calling describeXxx() twice with a byte-identical comparison returns a byte-identical result');
        assert(serialize(flagshipComparison) === before, '35. describeXxx() never mutates the supplied comparison');

        assert(Object.isFrozen(first), '36. the result is frozen');
        assert(Object.isFrozen(first.candidates), '37. the candidates section is frozen');
        assert(Object.isFrozen(first.decisionEvidence) && Object.isFrozen(first.observationEvidence), '38. the decisionEvidence/observationEvidence sections are frozen');
        assert(Object.isFrozen(first.metadata) && Object.isFrozen(first.metadata.comparisonState) && Object.isFrozen(first.metadata.filter), '39. metadata and its two sub-sections are frozen');
    }
    console.log('✓ Section H: describeXxx() is deterministic, never mutates the supplied comparison, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section I — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '40. this file imports nothing — a pure, duck-typed transform of whatever shape it is handed');
        assert(!/function reconstruct/.test(codeOnly), '41. this file declares no reconstructXxx() of its own — there is no archive pair, and no document pair, to reconstruct from');
        assert(!codeOnlyLower.includes('sharedcount') && !codeOnlyLower.includes('sourceonlycount') && !codeOnlyLower.includes('targetonlycount') && !codeOnlyLower.includes('sourcecount') && !codeOnlyLower.includes('targetcount'), '42. this file\'s own code never references any count field name — it forwards record arrays only');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `43. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section I: imports nothing, declares no reconstructXxx() of its own, never references a count field name in code, and carries no reconciliation/ranking/judgment/synchronization vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.test.js FAILED:', error);
    process.exitCode = 1;
});
