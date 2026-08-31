import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';

// 0.8.189 — Reconciliation Candidate Leaderboard Evidence Export Comparison.
//
// Section A: FLAGSHIP — the milestone's own asymmetric scenario, proving
//            candidate presence and evidence agreement are independent.
// Section B: empty export vs empty export.
// Section C: byte-identical exports (every record/candidate lands shared).
// Section D: metadata independence — same evidence, different filter; same
//            evidence, different comparisonState; NO_PEER vs PEER_EMPTY.
// Section E: source-only and target-only candidates, with no evidence at
//            all on either side (a candidate can differ from another
//            candidate purely by presence).
// Section F: duplicate records / multiplicity — multiset semantics, never
//            set semantics.
// Section G: records differing only by observedAt, or only by
//            candidateMatchesPlan, are genuinely distinct evidence.
// Section H: candidate identity stays independent from decision/observation
//            identity — identical-looking evidence under two different
//            candidates is never cross-matched.
// Section I: candidate order and record order preservation.
// Section J: malformed/absent documents degrade to an empty comparison,
//            never throw.
// Section K: determinism, no mutation, frozen output.
// Section L: vocabulary/import boundary — no archive import, no
//            reconciliation/ranking vocabulary, no top-level "same".

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

function observationOf(id, observedAt, candidateMatchesPlan = true) {
    return Object.freeze({ id, observedAt, candidateMatchesPlan });
}

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

// A realistic 0.8.145-shaped decision record, embedding its own candidate
// directly — used where a test needs the candidate to genuinely be PART OF
// the record's own structural identity (Section H). Elsewhere, a bare
// string label ('D1', 'D2', ...) stands in for a decision record, exactly
// the way 0.8.188's own test file already does, since those sections never
// compare records naming two different candidates against each other.
function decisionRecordOf(claimId, decision, decidedAt) {
    return Object.freeze({ candidate: candidateOf(claimId), decision, decidedAt });
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
    // Section A — FLAGSHIP: candidate presence vs evidence agreement.
    // ---------------------------------------------------------------
    {
        // Export A — C1 only.
        const c1A = entryOf('C1',
            detailOf(['D1'], ['D2'], []),
            detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [observationOf('O2', '2026-08-31T07:00:00.000Z')], [])
        );
        const sourceExport = exportOf([c1A], ALL_FILTER, 'PEER_PRESENT');

        // Export B — C1 (asymmetric evidence vs A) and C2 (new).
        const c1B = entryOf('C1',
            detailOf(['D1'], [], []),
            detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [], [observationOf('O3', '2026-08-31T08:00:00.000Z')])
        );
        const c2B = entryOf('C2', detailOf([], [], ['D3']), detailOf([], [], []));
        const targetExport = exportOf([c1B, c2B], ALL_FILTER, 'PEER_PRESENT');

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);

        assert(result.candidates.shared.length === 1 && result.candidates.shared[0].claimId === 'C1', '1. FLAGSHIP — C1 is a shared candidate');
        assert(result.candidates.sourceOnly.length === 0, '2. FLAGSHIP — no candidate is source-only');
        assert(result.candidates.targetOnly.length === 1 && result.candidates.targetOnly[0].claimId === 'C2', '3. FLAGSHIP — C2 is target-only');

        assert(ids(result.decisionEvidence.shared).join(',') === 'D1', '4. FLAGSHIP — D1 is shared decision evidence');
        assert(ids(result.decisionEvidence.sourceOnly).join(',') === 'D2', '5. FLAGSHIP — D2 is source-only decision evidence');
        assert(ids(result.decisionEvidence.targetOnly).join(',') === 'D3', '6. FLAGSHIP — D3 is target-only decision evidence');

        assert(ids(result.observationEvidence.shared).join(',') === 'O1', '7. FLAGSHIP — O1 is shared observation evidence');
        assert(ids(result.observationEvidence.sourceOnly).join(',') === 'O2', '8. FLAGSHIP — O2 is source-only observation evidence');
        assert(ids(result.observationEvidence.targetOnly).join(',') === 'O3', '9. FLAGSHIP — O3 is target-only observation evidence');

        // The flagship's own point: C1 is shared even though its evidence
        // is asymmetric — presence and agreement never collapse into one
        // fact.
        assert(result.candidates.sharedCount === 1 && (result.decisionEvidence.sourceOnlyCount > 0 || result.decisionEvidence.targetOnlyCount > 0), '10. FLAGSHIP — a shared candidate can carry asymmetric evidence');
    }
    console.log('✓ Section A: FLAGSHIP — candidate presence (C1 shared, C2 target-only) is reported entirely independently of evidence agreement (D1/O1 shared, D2/O2 source-only, D3/O3 target-only)');

    // ---------------------------------------------------------------
    // Section B — empty export vs empty export.
    // ---------------------------------------------------------------
    {
        const empty1 = exportOf([], ALL_FILTER, 'NO_PEER');
        const empty2 = exportOf([], ALL_FILTER, 'NO_PEER');
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(empty1, empty2);

        for (const section of [result.candidates, result.decisionEvidence, result.observationEvidence]) {
            assert(section.sourceCount === 0 && section.targetCount === 0, '11. empty vs empty — sourceCount/targetCount are zero throughout');
            assert(section.sharedCount === 0 && section.sourceOnlyCount === 0 && section.targetOnlyCount === 0, '12. empty vs empty — every count is zero throughout');
        }
        assert(result.sameComparisonState === true && result.sameFilter === true, '13. empty vs empty — metadata reports as identical when it is');
    }
    console.log('✓ Section B: an empty export compared against another empty export reports zero everywhere, never throws');

    // ---------------------------------------------------------------
    // Section C — byte-identical exports.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [], []));
        const doc = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(doc, doc);

        assert(result.candidates.sourceOnlyCount === 0 && result.candidates.targetOnlyCount === 0 && result.candidates.sharedCount === 1, '14. byte-identical exports — every candidate lands shared');
        assert(result.decisionEvidence.sourceOnlyCount === 0 && result.decisionEvidence.targetOnlyCount === 0 && result.decisionEvidence.sharedCount === 2, '15. byte-identical exports — every decision record lands shared');
        assert(result.observationEvidence.sourceOnlyCount === 0 && result.observationEvidence.targetOnlyCount === 0 && result.observationEvidence.sharedCount === 1, '16. byte-identical exports — every observation record lands shared');
    }
    console.log('✓ Section C: comparing an export against itself lands every candidate and every record as shared, nothing exclusive on either side');

    // ---------------------------------------------------------------
    // Section D — metadata independence.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []));
        const sameEvidenceDifferentFilter1 = exportOf([c1], { evidenceKind: 'OBSERVATIONS', replicaRelation: 'SOURCE_ONLY' }, 'PEER_PRESENT');
        const sameEvidenceDifferentFilter2 = exportOf([c1], { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }, 'PEER_PRESENT');
        const filterResult = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sameEvidenceDifferentFilter1, sameEvidenceDifferentFilter2);
        assert(filterResult.sameFilter === false, '17. identical evidence, different filter metadata — sameFilter is false');
        assert(filterResult.decisionEvidence.sourceOnlyCount === 0 && filterResult.decisionEvidence.targetOnlyCount === 0, '18. identical evidence, different filter metadata — the evidence comparison itself is unaffected');

        const noPeer = exportOf([], ALL_FILTER, 'NO_PEER');
        const peerEmpty = exportOf([], ALL_FILTER, 'PEER_EMPTY');
        const stateResult = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(noPeer, peerEmpty);
        assert(stateResult.sourceComparisonState === 'NO_PEER' && stateResult.targetComparisonState === 'PEER_EMPTY', '19. NO_PEER and PEER_EMPTY are reported distinctly even with byte-identical (empty) evidence');
        assert(stateResult.sameComparisonState === false, '20. NO_PEER vs PEER_EMPTY — sameComparisonState is false');
        assert(stateResult.candidates.sharedCount === 0 && stateResult.candidates.sourceOnlyCount === 0 && stateResult.candidates.targetOnlyCount === 0, '21. NO_PEER vs PEER_EMPTY — the (empty) candidate comparison itself is unaffected');
    }
    console.log('✓ Section D: filter and comparisonState are compared independently of evidence — a metadata difference never leaks into the evidence comparison, and vice versa');

    // ---------------------------------------------------------------
    // Section E — source-only and target-only candidates.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf([], [], []), detailOf([], [], []));
        const c2 = entryOf('C2', detailOf([], [], []), detailOf([], [], []));
        const sourceExport = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([c2], ALL_FILTER, 'PEER_PRESENT');
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);

        assert(result.candidates.sourceOnly.length === 1 && result.candidates.sourceOnly[0].claimId === 'C1', '22. a candidate present only in the source export is source-only');
        assert(result.candidates.targetOnly.length === 1 && result.candidates.targetOnly[0].claimId === 'C2', '23. a candidate present only in the target export is target-only');
        assert(result.candidates.sharedCount === 0, '24. two entirely disjoint candidate sets share nothing');
    }
    console.log('✓ Section E: candidates present in only one export are reported as source-only or target-only, with no evidence on either side needed to establish that');

    // ---------------------------------------------------------------
    // Section F — duplicate records / multiplicity.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf(['D1', 'D1'], [], []), detailOf([], [], []));
        const c1Target = entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []));
        const sourceExport = exportOf([c1Source], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT');
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);

        assert(result.decisionEvidence.sharedCount === 1, '25. multiset semantics — one of two identical D1s matches, leaving exactly one shared');
        assert(result.decisionEvidence.sourceOnlyCount === 1, '26. multiset semantics — the unmatched second D1 is reported source-only, never silently absorbed');
        assert(result.decisionEvidence.targetOnlyCount === 0, '27. multiset semantics — nothing is left over on the target side');
    }
    console.log('✓ Section F: duplicate records use multiset (bag) semantics — [D1, D1] against [D1] reports exactly one shared and one source-only, never collapsing to a set');

    // ---------------------------------------------------------------
    // Section G — records differing only by one field are distinct.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf([], [], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [], []));
        const c1Target = entryOf('C1', detailOf([], [], []), detailOf([observationOf('O1', '2026-08-31T09:00:00.000Z')], [], []));
        const result1 = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
            exportOf([c1Source], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT')
        );
        assert(result1.observationEvidence.sharedCount === 0 && result1.observationEvidence.sourceOnlyCount === 1 && result1.observationEvidence.targetOnlyCount === 1, '28. two records differing only by observedAt are genuinely distinct evidence, never matched as the same fact');

        const c1SourceMatch = entryOf('C1', detailOf([], [], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z', true)], [], []));
        const c1TargetMismatch = entryOf('C1', detailOf([], [], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z', false)], [], []));
        const result2 = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
            exportOf([c1SourceMatch], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1TargetMismatch], ALL_FILTER, 'PEER_PRESENT')
        );
        assert(result2.observationEvidence.sharedCount === 0 && result2.observationEvidence.sourceOnlyCount === 1 && result2.observationEvidence.targetOnlyCount === 1, '29. two records differing only by candidateMatchesPlan are genuinely distinct evidence, never matched as the same fact');
    }
    console.log('✓ Section G: records differing only by observedAt, or only by candidateMatchesPlan, are reported as genuinely distinct evidence — never silently matched');

    // ---------------------------------------------------------------
    // Section H — candidate identity stays independent from evidence
    // identity.
    // ---------------------------------------------------------------
    {
        // Identical-looking decision content ("OBSERVE" at the identical
        // decidedAt) under two DIFFERENT candidates must never be
        // cross-matched — the record's own embedded `candidate` field is
        // part of its structural identity.
        const sameLookingDecisionUnderC1 = decisionRecordOf('C1', 'OBSERVE', '2026-08-31T06:00:00.000Z');
        const sameLookingDecisionUnderC2 = decisionRecordOf('C2', 'OBSERVE', '2026-08-31T06:00:00.000Z');
        const c1Source = entryOf('C1', detailOf([sameLookingDecisionUnderC1], [], []), detailOf([], [], []));
        const c2Target = entryOf('C2', detailOf([sameLookingDecisionUnderC2], [], []), detailOf([], [], []));
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
            exportOf([c1Source], ALL_FILTER, 'PEER_PRESENT'), exportOf([c2Target], ALL_FILTER, 'PEER_PRESENT')
        );
        assert(result.decisionEvidence.sharedCount === 0, '30. identical decision content under two different candidates never counts as shared evidence');
        assert(result.decisionEvidence.sourceOnlyCount === 1 && result.decisionEvidence.targetOnlyCount === 1, '31. each candidate\'s own "D1" is reported exclusive to its own side');
        assert(result.candidates.sharedCount === 0 && result.candidates.sourceOnlyCount === 1 && result.candidates.targetOnlyCount === 1, '32. C1 and C2 themselves are correctly reported as disjoint candidates');
    }
    console.log('✓ Section H: candidate identity and evidence identity never cross-contaminate — identical-looking evidence under two different candidates is never matched across them');

    // ---------------------------------------------------------------
    // Section I — order preservation.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1', 'D2'], [], []), detailOf([], [], []));
        const c2 = entryOf('C2', detailOf(['D3'], [], []), detailOf([], [], []));
        const c3 = entryOf('C3', detailOf(['D4'], [], []), detailOf([], [], []));
        const sourceExport = exportOf([c1, c2, c3], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([c3, c2], ALL_FILTER, 'PEER_PRESENT');
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);

        assert(serialize(result.candidates.shared.map((c) => c.claimId)) === serialize(['C2', 'C3']), '33. candidates.shared preserves the source export\'s own relative candidate order');
        assert(serialize(result.candidates.sourceOnly.map((c) => c.claimId)) === serialize(['C1']), '34. candidates.sourceOnly preserves the source export\'s own relative order');
        assert(ids(result.decisionEvidence.shared).join(',') === 'D3,D4', '35. decisionEvidence.shared preserves the source export\'s own relative record order across candidates');
        assert(ids(result.decisionEvidence.sourceOnly).join(',') === 'D1,D2', '36. decisionEvidence.sourceOnly preserves the source export\'s own relative record order within a candidate');
    }
    console.log('✓ Section I: candidate order and record order both follow the source export\'s own relative order — nothing is re-sorted');

    // ---------------------------------------------------------------
    // Section J — malformed/absent input degrades to empty.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-a-document', 42, {}, { candidates: 'nope' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(malformed, malformed);
            assert(result.candidates.sourceCount === 0 && result.candidates.targetCount === 0, `37. malformed input (${serialize(malformed)}) degrades to an empty comparison rather than throwing`);
            assert(result.sourceComparisonState === 'NO_PEER' && result.targetComparisonState === 'NO_PEER', `38. malformed input (${serialize(malformed)}) degrades comparisonState to NO_PEER`);
            assert(result.sourceFilter.evidenceKind === 'ALL' && result.sourceFilter.replicaRelation === 'ALL', `39. malformed input (${serialize(malformed)}) degrades filter to ALL/ALL`);
        }

        const genuine = exportOf([entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const mixedResult = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(genuine, null);
        assert(mixedResult.candidates.sourceCount === 1 && mixedResult.candidates.targetCount === 0, '40. one genuine document alongside one malformed document degrades only the malformed side, never throws, and never drops the genuine side');
        assert(mixedResult.candidates.sourceOnly.length === 1 && mixedResult.candidates.sourceOnly[0].claimId === 'C1', '41. the genuine side\'s own candidate is reported source-only against an empty malformed target');
    }
    console.log('✓ Section J: malformed or absent documents on either side degrade to an empty, NO_PEER, ALL/ALL comparison rather than throwing, without damaging the genuine side');

    // ---------------------------------------------------------------
    // Section K — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [], []));
        const sourceExport = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const beforeSource = serialize(sourceExport);
        const beforeTarget = serialize(targetExport);

        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        assert(serialize(first) === serialize(second), '42. calling describeXxx() twice with byte-identical arguments returns a byte-identical result');
        assert(serialize(sourceExport) === beforeSource && serialize(targetExport) === beforeTarget, '43. describeXxx() never mutates either argument');

        assert(Object.isFrozen(first), '44. the result is frozen');
        assert(Object.isFrozen(first.candidates), '45. the candidates comparison section is frozen');
        assert(Object.isFrozen(first.candidates.shared), '46. a comparison section\'s own shared/sourceOnly/targetOnly array is frozen');
        assert(Object.isFrozen(first.decisionEvidence) && Object.isFrozen(first.observationEvidence), '47. the decisionEvidence/observationEvidence sections are frozen');
    }
    console.log('✓ Section K: describeXxx() is deterministic, never mutates either input document, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 2, '48. this file imports exactly two modules');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js'"), '49. one import is 0.8.184\'s own evidence filter module (its enums)');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js'"), '50. the other import is 0.8.183\'s own comparison-state module');
        assert(!codeOnly.includes('PublicationObservationArchive'), '51. this file never imports PublicationObservationArchive, or any archive-reading module, directly');
        assert(!codeOnly.includes('EvidenceExport.js') && !codeOnly.includes('EvidenceImport.js'), '52. this file never imports 0.8.186\'s or 0.8.188\'s own module — it takes two already-produced documents directly as arguments');
        assert(!codeOnly.includes('CandidateEvidenceAgreementView') && !codeOnly.includes('CandidateEvidenceDetailView') && !codeOnly.includes('FilteredEvidenceDetailView'), '53. this file never imports any live-archive evidence projection (0.8.176/0.8.182/0.8.185)');
        assert(!/function reconstruct/.test(codeOnly), '54. this file declares no reconstructXxx() of its own — there is no archive pair to reconstruct from');

        assert(!/\bsame\s*[:,)]/i.test(codeOnly.replace(/sameComparisonState|sameFilter/g, '')), '55. this file\'s result never carries a bare top-level "same" field — only the named sameComparisonState/sameFilter metadata facts');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `56. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section L: imports exactly 0.8.183/0.8.184, never an archive-reading module, never 0.8.176/0.8.182/0.8.185/0.8.186/0.8.188, declares no reconstructXxx() of its own, never collapses into a bare top-level "same", and carries no reconciliation/ranking/judgment vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.test.js FAILED:', error);
    process.exitCode = 1;
});
