import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';

// 0.8.190 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Read Model.
//
// Section A: FLAGSHIP — same candidate set, different decision evidence,
//            different observation evidence, different filters, same
//            comparison state; every fact preserved, no arrays exposed.
// Section B: byte-identical comparison -> identical read model.
// Section C: candidates with no shared evidence at all.
// Section D: evidence differences with identical candidate presence.
// Section E: candidate differences with identical evidence dimensions.
// Section F: NO_PEER vs PEER_EMPTY.
// Section G: multiplicity counts forwarded exactly (no re-derivation).
// Section H: row/order information is intentionally discarded.
// Section I: no arithmetic beyond what 0.8.189 already represented.
// Section J: malformed/absent input degrades, never throws.
// Section K: immutability/determinism.
// Section L: zero ranking/judgment vocabulary; no verdict booleans beyond
//            the two 0.8.189 already computed; import boundary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function detailOf(shared, sourceOnly, targetOnly) {
    return Object.freeze({
        shared: Object.freeze(shared.slice()),
        sourceOnly: Object.freeze(sourceOnly.slice()),
        targetOnly: Object.freeze(targetOnly.slice())
    });
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

function readModelFor(sourceExport, targetExport) {
    const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        // Same candidate set (C1, C2 on both sides); different decision
        // evidence; different observation evidence; different filters;
        // same comparison state (PEER_PRESENT on both).
        const c1Source = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], []));
        const c2Source = entryOf('C2', detailOf([], [], []), detailOf([], [], []));
        const sourceExport = exportOf([c1Source, c2Source], { evidenceKind: 'ALL', replicaRelation: 'SOURCE_ONLY' }, 'PEER_PRESENT');

        const c1Target = entryOf('C1', detailOf(['D1'], [], ['D3']), detailOf(['O1'], [], ['O2']));
        const c2Target = entryOf('C2', detailOf([], [], []), detailOf([], [], []));
        const targetExport = exportOf([c1Target, c2Target], { evidenceKind: 'DECISIONS', replicaRelation: 'ALL' }, 'PEER_PRESENT');

        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);

        assert(readModel.candidates.sharedCount === 2 && readModel.candidates.sourceOnlyCount === 0 && readModel.candidates.targetOnlyCount === 0, '1. FLAGSHIP — same candidate set is preserved as fully shared');
        assert(readModel.decisionEvidence.sharedCount === comparison.decisionEvidence.sharedCount
            && readModel.decisionEvidence.sourceOnlyCount === comparison.decisionEvidence.sourceOnlyCount
            && readModel.decisionEvidence.targetOnlyCount === comparison.decisionEvidence.targetOnlyCount, '2. FLAGSHIP — decision evidence counts forwarded exactly from 0.8.189');
        assert(comparison.decisionEvidence.sourceOnlyCount > 0 && comparison.decisionEvidence.targetOnlyCount > 0, '3. FLAGSHIP sanity — decision evidence genuinely differs (D2 source-only, D3 target-only)');
        assert(readModel.observationEvidence.sharedCount === comparison.observationEvidence.sharedCount
            && readModel.observationEvidence.sourceOnlyCount === comparison.observationEvidence.sourceOnlyCount
            && readModel.observationEvidence.targetOnlyCount === comparison.observationEvidence.targetOnlyCount, '4. FLAGSHIP — observation evidence counts forwarded exactly from 0.8.189');
        assert(comparison.observationEvidence.targetOnlyCount > 0, '5. FLAGSHIP sanity — observation evidence genuinely differs (O2 target-only)');
        assert(readModel.metadata.filter.same === false, '6. FLAGSHIP — different filters preserved as sameFilter === false');
        assert(serialize(readModel.metadata.filter.source) === serialize({ evidenceKind: 'ALL', replicaRelation: 'SOURCE_ONLY' }), '7. FLAGSHIP — source filter forwarded verbatim');
        assert(serialize(readModel.metadata.filter.target) === serialize({ evidenceKind: 'DECISIONS', replicaRelation: 'ALL' }), '8. FLAGSHIP — target filter forwarded verbatim');
        assert(readModel.metadata.comparisonState.source === 'PEER_PRESENT' && readModel.metadata.comparisonState.target === 'PEER_PRESENT' && readModel.metadata.comparisonState.same === true, '9. FLAGSHIP — same comparison state preserved as sameComparisonState === true');

        assert(readModel.candidates.shared === undefined && readModel.candidates.sourceOnly === undefined && readModel.candidates.targetOnly === undefined, '10. FLAGSHIP — no record arrays exposed on candidates');
        assert(readModel.decisionEvidence.shared === undefined && readModel.observationEvidence.shared === undefined, '11. FLAGSHIP — no record arrays exposed on decisionEvidence/observationEvidence');
    }
    console.log('✓ Section A: FLAGSHIP — same candidate set, differing decision evidence, differing observation evidence, and differing filters are all preserved independently under the same comparison state, with no record arrays exposed');

    // ---------------------------------------------------------------
    // Section B — byte-identical comparison -> identical read model.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], []));
        const doc = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const readModel1 = readModelFor(doc, doc);
        const readModel2 = readModelFor(doc, doc);
        assert(serialize(readModel1) === serialize(readModel2), '12. byte-identical comparisons produce byte-identical read models');
        assert(readModel1.candidates.sourceOnlyCount === 0 && readModel1.candidates.targetOnlyCount === 0, '13. an export compared against itself has zero exclusive candidates');
    }
    console.log('✓ Section B: a byte-identical comparison produces a byte-identical read model');

    // ---------------------------------------------------------------
    // Section C — candidates with no shared evidence at all.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf([], ['D1'], []), detailOf([], ['O1'], []));
        const c1Target = entryOf('C1', detailOf([], [], ['D2']), detailOf([], [], ['O2']));
        const readModel = readModelFor(exportOf([c1Source], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT'));

        assert(readModel.candidates.sharedCount === 1, '14. the candidate itself is shared even though it carries no shared evidence');
        assert(readModel.decisionEvidence.sharedCount === 0 && readModel.decisionEvidence.sourceOnlyCount === 1 && readModel.decisionEvidence.targetOnlyCount === 1, '15. decision evidence has zero shared, fully exclusive on each side');
        assert(readModel.observationEvidence.sharedCount === 0 && readModel.observationEvidence.sourceOnlyCount === 1 && readModel.observationEvidence.targetOnlyCount === 1, '16. observation evidence has zero shared, fully exclusive on each side');
    }
    console.log('✓ Section C: a shared candidate with no shared evidence at all is reported with sharedCount 0 on both evidence dimensions');

    // ---------------------------------------------------------------
    // Section D — evidence differences with identical candidate presence.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf(['D1'], [], []), detailOf(['O1'], [], []));
        const c1Target = entryOf('C1', detailOf([], [], ['D2']), detailOf([], [], ['O2']));
        const readModel = readModelFor(exportOf([c1Source], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT'));

        assert(readModel.candidates.sourceOnlyCount === 0 && readModel.candidates.targetOnlyCount === 0 && readModel.candidates.sharedCount === 1, '17. identical candidate presence — a single shared candidate on both sides');
        assert(readModel.decisionEvidence.sourceOnlyCount === 1 && readModel.decisionEvidence.targetOnlyCount === 1, '18. decision evidence differs entirely despite identical candidate presence');
        assert(readModel.observationEvidence.sourceOnlyCount === 1 && readModel.observationEvidence.targetOnlyCount === 1, '19. observation evidence differs entirely despite identical candidate presence');
    }
    console.log('✓ Section D: candidate presence can be identical while both evidence dimensions differ entirely');

    // ---------------------------------------------------------------
    // Section E — candidate differences with identical evidence
    // dimensions (both empty).
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf([], [], []), detailOf([], [], []));
        const c2 = entryOf('C2', detailOf([], [], []), detailOf([], [], []));
        const readModel = readModelFor(exportOf([c1], ALL_FILTER, 'PEER_PRESENT'), exportOf([c2], ALL_FILTER, 'PEER_PRESENT'));

        assert(readModel.candidates.sourceOnlyCount === 1 && readModel.candidates.targetOnlyCount === 1 && readModel.candidates.sharedCount === 0, '20. candidates differ entirely (disjoint C1/C2)');
        assert(readModel.decisionEvidence.sourceOnlyCount === 0 && readModel.decisionEvidence.sharedCount === 0 && readModel.decisionEvidence.targetOnlyCount === 0, '21. decision evidence is identically empty on both sides');
        assert(readModel.observationEvidence.sourceOnlyCount === 0 && readModel.observationEvidence.sharedCount === 0 && readModel.observationEvidence.targetOnlyCount === 0, '22. observation evidence is identically empty on both sides');
    }
    console.log('✓ Section E: candidates can differ entirely while both evidence dimensions are identical (empty)');

    // ---------------------------------------------------------------
    // Section F — NO_PEER vs PEER_EMPTY.
    // ---------------------------------------------------------------
    {
        const noPeer = exportOf([], ALL_FILTER, 'NO_PEER');
        const peerEmpty = exportOf([], ALL_FILTER, 'PEER_EMPTY');
        const readModel = readModelFor(noPeer, peerEmpty);

        assert(readModel.metadata.comparisonState.source === 'NO_PEER' && readModel.metadata.comparisonState.target === 'PEER_EMPTY', '23. NO_PEER and PEER_EMPTY are each reported distinctly');
        assert(readModel.metadata.comparisonState.same === false, '24. NO_PEER vs PEER_EMPTY — same is false even though the underlying (empty) evidence is byte-identical');
        assert(readModel.candidates.sharedCount === 0 && readModel.candidates.sourceOnlyCount === 0 && readModel.candidates.targetOnlyCount === 0, '25. NO_PEER vs PEER_EMPTY — the (empty) candidate comparison itself is unaffected');
    }
    console.log('✓ Section F: NO_PEER and PEER_EMPTY are distinguished in metadata.comparisonState even when every count is identically zero');

    // ---------------------------------------------------------------
    // Section G — multiplicity counts forwarded exactly.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf(['D1', 'D1'], [], []), detailOf([], [], []));
        const c1Target = entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []));
        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
            exportOf([c1Source], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT')
        );
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);

        assert(readModel.decisionEvidence.sharedCount === comparison.decisionEvidence.sharedCount, '26. multiplicity — sharedCount forwarded exactly (one of two identical D1s matches)');
        assert(readModel.decisionEvidence.sourceOnlyCount === comparison.decisionEvidence.sourceOnlyCount && readModel.decisionEvidence.sourceOnlyCount === 1, '27. multiplicity — the unmatched second D1 remains source-only, forwarded exactly, never re-derived as 0 or 2');
    }
    console.log('✓ Section G: multiset multiplicity counts computed by 0.8.189 are forwarded exactly, never re-derived');

    // ---------------------------------------------------------------
    // Section H — row/order information is intentionally discarded.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1', 'D2'], [], []), detailOf([], [], []));
        const c2 = entryOf('C2', detailOf(['D3'], [], []), detailOf([], [], []));
        const readModelForward = readModelFor(exportOf([c1, c2], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1, c2], ALL_FILTER, 'PEER_PRESENT'));
        const readModelReversed = readModelFor(exportOf([c2, c1], ALL_FILTER, 'PEER_PRESENT'), exportOf([c2, c1], ALL_FILTER, 'PEER_PRESENT'));

        assert(serialize(readModelForward) === serialize(readModelReversed), '28. reordering candidates/evidence produces an identical read model — only counts are represented, no order survives');
        assert(readModelForward.candidates.shared === undefined && readModelForward.decisionEvidence.shared === undefined, '29. no shared/sourceOnly/targetOnly array of any kind is present to carry order in the first place');
    }
    console.log('✓ Section H: row and record order is intentionally discarded — reordering the underlying exports never changes the read model');

    // ---------------------------------------------------------------
    // Section I — no arithmetic beyond what 0.8.189 already represented.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], ['O2']));
        const c2Source = entryOf('C2', detailOf([], [], ['D3']), detailOf([], [], []));
        const c1Target = entryOf('C1', detailOf(['D1'], [], []), detailOf(['O1'], [], []));
        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
            exportOf([c1Source, c2Source], ALL_FILTER, 'PEER_PRESENT'), exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT')
        );
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);

        for (const key of ['candidates', 'decisionEvidence', 'observationEvidence']) {
            assert(readModel[key].sourceOnlyCount === comparison[key].sourceOnlyCount, `30. ${key}.sourceOnlyCount is 0.8.189's own count, not a recomputation`);
            assert(readModel[key].sharedCount === comparison[key].sharedCount, `31. ${key}.sharedCount is 0.8.189's own count, not a recomputation`);
            assert(readModel[key].targetOnlyCount === comparison[key].targetOnlyCount, `32. ${key}.targetOnlyCount is 0.8.189's own count, not a recomputation`);
            assert(!('sourceCount' in readModel[key]) && !('targetCount' in readModel[key]), `33. ${key} never forwards 0.8.189's own sourceCount/targetCount`);
        }
    }
    console.log('✓ Section I: every count is 0.8.189\'s own count, copied field-by-field, with no derived total and no raw sourceCount/targetCount forwarded');

    // ---------------------------------------------------------------
    // Section J — malformed/absent input degrades, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-a-comparison', 42, {}, { candidates: 'nope' }, { candidates: {}, decisionEvidence: null, observationEvidence: 7 }]) {
            const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(malformed);
            assert(readModel.candidates.sharedCount === 0 && readModel.candidates.sourceOnlyCount === 0 && readModel.candidates.targetOnlyCount === 0, `34. malformed input (${serialize(malformed)}) degrades candidates to an empty section rather than throwing`);
            assert(readModel.decisionEvidence.sharedCount === 0 && readModel.observationEvidence.sharedCount === 0, `35. malformed input (${serialize(malformed)}) degrades both evidence sections to empty`);
            assert(readModel.metadata.comparisonState.source === 'NO_PEER' && readModel.metadata.comparisonState.target === 'NO_PEER', `36. malformed input (${serialize(malformed)}) degrades comparisonState to NO_PEER on both sides`);
            assert(serialize(readModel.metadata.filter.source) === serialize({ evidenceKind: 'ALL', replicaRelation: 'ALL' }), `37. malformed input (${serialize(malformed)}) degrades filter to ALL/ALL`);
        }

        const genuine = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
            exportOf([entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT'), null
        );
        const mixedReadModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(genuine);
        assert(mixedReadModel.candidates.sourceOnlyCount === 1 && mixedReadModel.candidates.targetOnlyCount === 0, '38. a genuine comparison against a malformed target still forwards the genuine side\'s own counts correctly');
    }
    console.log('✓ Section J: malformed or absent comparison input degrades to an empty, NO_PEER, ALL/ALL read model rather than throwing');

    // ---------------------------------------------------------------
    // Section K — immutability/determinism.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], []));
        const sourceExport = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const beforeComparison = serialize(comparison);

        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);
        assert(serialize(first) === serialize(second), '39. calling describeXxx() twice with the byte-identical comparison returns a byte-identical read model');
        assert(serialize(comparison) === beforeComparison, '40. describeXxx() never mutates the supplied comparison');

        assert(Object.isFrozen(first), '41. the result is frozen');
        assert(Object.isFrozen(first.metadata), '42. metadata is frozen');
        assert(Object.isFrozen(first.metadata.comparisonState) && Object.isFrozen(first.metadata.filter), '43. metadata.comparisonState and metadata.filter are each frozen');
        assert(Object.isFrozen(first.metadata.filter.source) && Object.isFrozen(first.metadata.filter.target), '44. metadata.filter.source/target are each frozen');
        assert(Object.isFrozen(first.candidates) && Object.isFrozen(first.decisionEvidence) && Object.isFrozen(first.observationEvidence), '45. candidates/decisionEvidence/observationEvidence are each frozen');
    }
    console.log('✓ Section K: describeXxx() is deterministic, never mutates its input comparison, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '46. this file imports no module of its own — it takes 0.8.189\'s own already-computed result directly as its one argument');
        assert(!/function reconstruct/.test(codeOnly), '47. this file declares no reconstructXxx() of its own — there is no document pair for it to read');
        assert(!/\bshared\s*:/.test(codeOnly) && !/\bsourceOnly\s*:/.test(codeOnly) && !/\btargetOnly\s*:/.test(codeOnly), '48. this file\'s own code never assembles a shared/sourceOnly/targetOnly record array of its own');
        assert(!/\bsourceCount\b/.test(codeOnly) && !/\btargetCount\b/.test(codeOnly), '49. this file never reads or forwards 0.8.189\'s own raw sourceCount/targetCount');
        assert(!/sameCandidates|sameDecisionEvidence|sameObservationEvidence/.test(codeOnly), '50. this file never introduces sameCandidates/sameDecisionEvidence/sameObservationEvidence booleans');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `51. this file's own code never carries "${term}"`);
        }

        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel({});
        assert(!('shared' in readModel.candidates) && !('sourceOnly' in readModel.candidates) && !('targetOnly' in readModel.candidates), '52. the result\'s own candidates section never carries a shared/sourceOnly/targetOnly key');
    }
    console.log('✓ Section L: imports nothing, declares no reconstructXxx() of its own, assembles no record arrays, never forwards raw sourceCount/targetCount, never introduces a same*Evidence boolean, and carries no reconciliation/ranking/judgment vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.test.js FAILED:', error);
    process.exitCode = 1;
});
