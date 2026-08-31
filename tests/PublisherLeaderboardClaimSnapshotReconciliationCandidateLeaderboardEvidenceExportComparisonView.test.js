import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';

// 0.8.191 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// View.
//
// Section A: empty comparison — isEmpty true, every count zero.
// Section B: fully identical comparison — isEmpty false, no exclusive counts.
// Section C: FLAGSHIP — three-dimensional asymmetric comparison.
// Section D: metadata independence — comparisonState and filter vary
//            independently of one another and of every evidence count.
// Section E: exact count fidelity — every count traced through both layers.
// Section F: no ranking/reconciliation vocabulary in the result itself.
// Section G: input order/reference behavior.
// Section H: malformed input tolerance — never throws.
// Section I: deep immutability.
// Section J: determinism.
// Section K: architectural import boundary.

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

function viewFor(sourceExport, targetExport) {
    const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
    const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty comparison.
    // ---------------------------------------------------------------
    {
        const empty = exportOf([], ALL_FILTER, 'NO_PEER');
        const view = viewFor(empty, empty);

        assert(view.isEmpty === true, '1. two empty exports produce an empty view');
        assert(view.candidateSummary.sourceOnlyCount === 0 && view.candidateSummary.sharedCount === 0 && view.candidateSummary.targetOnlyCount === 0, '2. candidateSummary is fully zero');
        assert(view.decisionEvidence.sourceOnlyCount === 0 && view.decisionEvidence.sharedCount === 0 && view.decisionEvidence.targetOnlyCount === 0, '3. decisionEvidence is fully zero');
        assert(view.observationEvidence.sourceOnlyCount === 0 && view.observationEvidence.sharedCount === 0 && view.observationEvidence.targetOnlyCount === 0, '4. observationEvidence is fully zero');
        assert(view.metadata.comparisonState.source === 'NO_PEER' && view.metadata.comparisonState.target === 'NO_PEER' && view.metadata.comparisonState.same === true, '5. comparisonState metadata is forwarded unchanged');
        assert(serialize(view.metadata.filter.source) === serialize(ALL_FILTER) && serialize(view.metadata.filter.target) === serialize(ALL_FILTER) && view.metadata.filter.same === true, '6. filter metadata is forwarded unchanged');
    }
    console.log('✓ Section A: an empty comparison produces isEmpty === true with every count and metadata fact preserved');

    // ---------------------------------------------------------------
    // Section B — fully identical comparison.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], [], []), detailOf(['O1'], [], []));
        const doc = exportOf([c1], ALL_FILTER, 'PEER_PRESENT');
        const view = viewFor(doc, doc);

        assert(view.isEmpty === false, '7. an identical, non-empty comparison is not reported as empty');
        assert(view.candidateSummary.sharedCount === 1 && view.candidateSummary.sourceOnlyCount === 0 && view.candidateSummary.targetOnlyCount === 0, '8. candidateSummary — fully shared, no exclusives');
        assert(view.decisionEvidence.sharedCount === 1 && view.decisionEvidence.sourceOnlyCount === 0 && view.decisionEvidence.targetOnlyCount === 0, '9. decisionEvidence — fully shared, no exclusives');
        assert(view.observationEvidence.sharedCount === 1 && view.observationEvidence.sourceOnlyCount === 0 && view.observationEvidence.targetOnlyCount === 0, '10. observationEvidence — fully shared, no exclusives');
        assert(view.metadata.comparisonState.same === true && view.metadata.filter.same === true, '11. metadata reports full agreement');
    }
    console.log('✓ Section B: a fully identical comparison reports zero exclusive counts on every dimension and full metadata agreement');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: three-dimensional asymmetric comparison.
    //
    //                  Source      Shared      Target
    //   Candidates        1           2          1
    //   Decisions         2           3          1
    //   Observations      1           4          2
    //
    // comparisonState: same (PEER_PRESENT on both). filter: different.
    // ---------------------------------------------------------------
    let flagshipView;
    {
        const c1Source = entryOf('C1', detailOf(['D1', 'D2'], [], []), detailOf(['O1', 'O2'], [], []));
        const c2Source = entryOf('C2', detailOf(['D3'], ['D4'], []), detailOf(['O3', 'O4'], ['O5'], []));
        const c3Source = entryOf('C3', detailOf([], ['D5'], []), detailOf([], [], []));
        const sourceExport = exportOf([c1Source, c2Source, c3Source], { evidenceKind: 'ALL', replicaRelation: 'SOURCE_ONLY' }, 'PEER_PRESENT');

        const c1Target = entryOf('C1', detailOf(['D1', 'D2'], [], []), detailOf(['O1', 'O2'], [], []));
        const c2Target = entryOf('C2', detailOf(['D3'], [], []), detailOf(['O3', 'O4'], [], ['O6']));
        const c4Target = entryOf('C4', detailOf([], [], ['D6']), detailOf([], [], ['O7']));
        const targetExport = exportOf([c1Target, c2Target, c4Target], { evidenceKind: 'DECISIONS', replicaRelation: 'ALL' }, 'PEER_PRESENT');

        flagshipView = viewFor(sourceExport, targetExport);

        assert(flagshipView.candidateSummary.sourceOnlyCount === 1 && flagshipView.candidateSummary.sharedCount === 2 && flagshipView.candidateSummary.targetOnlyCount === 1, '12. FLAGSHIP — candidates: 1 source-only (C3), 2 shared (C1, C2), 1 target-only (C4)');
        assert(flagshipView.decisionEvidence.sourceOnlyCount === 2 && flagshipView.decisionEvidence.sharedCount === 3 && flagshipView.decisionEvidence.targetOnlyCount === 1, '13. FLAGSHIP — decisions: 2 source-only, 3 shared, 1 target-only');
        assert(flagshipView.observationEvidence.sourceOnlyCount === 1 && flagshipView.observationEvidence.sharedCount === 4 && flagshipView.observationEvidence.targetOnlyCount === 2, '14. FLAGSHIP — observations: 1 source-only, 4 shared, 2 target-only');
        assert(flagshipView.metadata.comparisonState.source === 'PEER_PRESENT' && flagshipView.metadata.comparisonState.target === 'PEER_PRESENT' && flagshipView.metadata.comparisonState.same === true, '15. FLAGSHIP — comparisonState is the same on both sides');
        assert(flagshipView.metadata.filter.same === false, '16. FLAGSHIP — filter differs between source and target');
        assert(serialize(flagshipView.metadata.filter.source) === serialize({ evidenceKind: 'ALL', replicaRelation: 'SOURCE_ONLY' }), '17. FLAGSHIP — source filter forwarded verbatim');
        assert(serialize(flagshipView.metadata.filter.target) === serialize({ evidenceKind: 'DECISIONS', replicaRelation: 'ALL' }), '18. FLAGSHIP — target filter forwarded verbatim');
        assert(flagshipView.isEmpty === false, '19. FLAGSHIP — a comparison with real counts on every dimension is never empty');
    }
    console.log('✓ Section C: FLAGSHIP — an asymmetric three-dimensional comparison preserves every independent count and metadata fact without interpreting them');

    // ---------------------------------------------------------------
    // Section D — metadata independence.
    // ---------------------------------------------------------------
    {
        // D1: comparisonState differs, filter identical, evidence identically empty.
        const noPeer = exportOf([], ALL_FILTER, 'NO_PEER');
        const peerEmpty = exportOf([], ALL_FILTER, 'PEER_EMPTY');
        const view1 = viewFor(noPeer, peerEmpty);
        assert(view1.metadata.comparisonState.same === false, '20. comparisonState can differ while filter is identical');
        assert(view1.metadata.filter.same === true, '21. filter agreement is unaffected by comparisonState disagreement');
        assert(view1.isEmpty === true, '22. isEmpty reflects only evidence counts, not metadata disagreement');

        // D2: filter differs, comparisonState identical, evidence identically empty.
        const sourceFilterOnly = exportOf([], { evidenceKind: 'ALL', replicaRelation: 'SOURCE_ONLY' }, 'PEER_PRESENT');
        const targetFilterOnly = exportOf([], { evidenceKind: 'OBSERVATIONS', replicaRelation: 'ALL' }, 'PEER_PRESENT');
        const view2 = viewFor(sourceFilterOnly, targetFilterOnly);
        assert(view2.metadata.filter.same === false, '23. filter can differ while comparisonState is identical');
        assert(view2.metadata.comparisonState.same === true, '24. comparisonState agreement is unaffected by filter disagreement');
        assert(view2.isEmpty === true, '25. isEmpty still reflects only evidence counts here too');

        // D3: FLAGSHIP already proved same-comparisonState/different-filter with
        // non-empty evidence — cross-checked again here against Section C's
        // own view for consistency.
        assert(flagshipView.metadata.comparisonState.same === true && flagshipView.metadata.filter.same === false, '26. FLAGSHIP view itself already demonstrates comparisonState/filter independence under non-empty evidence');
    }
    console.log('✓ Section D: metadata.comparisonState and metadata.filter vary independently of each other and of every evidence count');

    // ---------------------------------------------------------------
    // Section E — exact count fidelity, traced through both layers.
    // ---------------------------------------------------------------
    {
        const c1Source = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], ['O2']));
        const c2Source = entryOf('C2', detailOf([], [], ['D3']), detailOf([], [], []));
        const c1Target = entryOf('C1', detailOf(['D1'], [], []), detailOf(['O1'], [], []));
        const sourceExport = exportOf([c1Source, c2Source], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([c1Target], ALL_FILTER, 'PEER_PRESENT');

        const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel);

        assert(view.candidateSummary.sourceOnlyCount === readModel.candidates.sourceOnlyCount
            && view.candidateSummary.sharedCount === readModel.candidates.sharedCount
            && view.candidateSummary.targetOnlyCount === readModel.candidates.targetOnlyCount, '27. candidateSummary matches 0.8.190\'s own candidates counts exactly, field-by-field');
        assert(view.candidateSummary.sourceOnlyCount === comparison.candidates.sourceOnlyCount
            && view.candidateSummary.sharedCount === comparison.candidates.sharedCount
            && view.candidateSummary.targetOnlyCount === comparison.candidates.targetOnlyCount, '28. candidateSummary matches 0.8.189\'s own candidates counts exactly, through both layers');

        for (const key of ['decisionEvidence', 'observationEvidence']) {
            assert(view[key].sourceOnlyCount === readModel[key].sourceOnlyCount && view[key].sourceOnlyCount === comparison[key].sourceOnlyCount, `29. ${key}.sourceOnlyCount is identical across 0.8.189/0.8.190/0.8.191`);
            assert(view[key].sharedCount === readModel[key].sharedCount && view[key].sharedCount === comparison[key].sharedCount, `30. ${key}.sharedCount is identical across 0.8.189/0.8.190/0.8.191`);
            assert(view[key].targetOnlyCount === readModel[key].targetOnlyCount && view[key].targetOnlyCount === comparison[key].targetOnlyCount, `31. ${key}.targetOnlyCount is identical across 0.8.189/0.8.190/0.8.191`);
        }

        assert(!('sourceCount' in view.candidateSummary) && !('targetCount' in view.candidateSummary), '32. candidateSummary never carries raw sourceCount/targetCount');
        assert(!('shared' in view.decisionEvidence) && !('sourceOnly' in view.decisionEvidence) && !('targetOnly' in view.decisionEvidence), '33. decisionEvidence never carries the underlying record arrays');
    }
    console.log('✓ Section E: every count in the view traces back exactly to 0.8.189\'s and 0.8.190\'s own counts, with no recomputation and nothing extra forwarded');

    // ---------------------------------------------------------------
    // Section F — no ranking/reconciliation vocabulary in the result.
    // ---------------------------------------------------------------
    {
        const keysOf = (value) => Object.keys(value).join(',');
        const allKeys = [
            keysOf(flagshipView),
            keysOf(flagshipView.metadata),
            keysOf(flagshipView.metadata.comparisonState),
            keysOf(flagshipView.metadata.filter),
            keysOf(flagshipView.candidateSummary),
            keysOf(flagshipView.decisionEvidence),
            keysOf(flagshipView.observationEvidence)
        ].join(',').toLowerCase();

        const forbidden = ['rank', 'score', 'winner', 'better', 'worse', 'correct', 'incorrect', 'conflict', 'stale', 'confidence', 'recommend', 'valid', 'preferred', 'status'];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `34. no field name anywhere in the result carries "${term}"`);
        }
    }
    console.log('✓ Section F: no field in the result carries rank/score/winner/better-worse/correct-incorrect/conflict/stale/confidence/recommendation vocabulary');

    // ---------------------------------------------------------------
    // Section G — input order/reference behavior.
    // ---------------------------------------------------------------
    {
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(
            describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
                exportOf([entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT'),
                exportOf([entryOf('C1', detailOf(['D1'], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT')
            )
        );
        const beforeSerialized = serialize(readModel);

        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel);

        assert(view.candidateSummary !== readModel.candidates, '35. candidateSummary is a freshly built object, not a reference to 0.8.190\'s own candidates section');
        assert(view.decisionEvidence !== readModel.decisionEvidence, '36. decisionEvidence is a freshly built object, not a reference to 0.8.190\'s own section');
        assert(view.metadata !== readModel.metadata, '37. metadata is a freshly built object, not a reference to 0.8.190\'s own metadata');
        assert(serialize(view.candidateSummary) === serialize(readModel.candidates), '38. despite being a new object, candidateSummary carries the identical values');
        assert(serialize(readModel) === beforeSerialized, '39. building the view never mutates the supplied read model');
    }
    console.log('✓ Section G: the view rebuilds its own frozen objects rather than referencing 0.8.190\'s own sections, and never mutates the supplied read model');

    // ---------------------------------------------------------------
    // Section H — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        const malformedInputs = [
            null, undefined, 'not-a-read-model', 42, [], {},
            { candidates: 'nope' },
            { metadata: null, candidates: {}, decisionEvidence: null, observationEvidence: 7 },
            { metadata: { comparisonState: 'nope', filter: 42 } }
        ];
        for (const malformed of malformedInputs) {
            const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(malformed);
            assert(view.isEmpty === true, `40. malformed input (${serialize(malformed)}) degrades to isEmpty === true`);
            assert(view.candidateSummary.sourceOnlyCount === 0 && view.candidateSummary.sharedCount === 0 && view.candidateSummary.targetOnlyCount === 0, `41. malformed input (${serialize(malformed)}) degrades candidateSummary to zero`);
            assert(view.decisionEvidence.sharedCount === 0 && view.observationEvidence.sharedCount === 0, `42. malformed input (${serialize(malformed)}) degrades both evidence sections to zero`);
            assert(view.metadata.comparisonState.source === 'NO_PEER' && view.metadata.comparisonState.target === 'NO_PEER', `43. malformed input (${serialize(malformed)}) degrades comparisonState to NO_PEER on both sides`);
            assert(serialize(view.metadata.filter.source) === serialize(ALL_FILTER) && serialize(view.metadata.filter.target) === serialize(ALL_FILTER), `44. malformed input (${serialize(malformed)}) degrades filter to ALL/ALL`);
        }
    }
    console.log('✓ Section H: malformed or absent read-model input degrades to an empty, NO_PEER, ALL/ALL view rather than throwing');

    // ---------------------------------------------------------------
    // Section I — deep immutability.
    // ---------------------------------------------------------------
    {
        assert(Object.isFrozen(flagshipView), '45. the result itself is frozen');
        assert(Object.isFrozen(flagshipView.metadata), '46. metadata is frozen');
        assert(Object.isFrozen(flagshipView.metadata.comparisonState) && Object.isFrozen(flagshipView.metadata.filter), '47. metadata.comparisonState and metadata.filter are each frozen');
        assert(Object.isFrozen(flagshipView.metadata.filter.source) && Object.isFrozen(flagshipView.metadata.filter.target), '48. metadata.filter.source/target are each frozen');
        assert(Object.isFrozen(flagshipView.candidateSummary), '49. candidateSummary is frozen');
        assert(Object.isFrozen(flagshipView.decisionEvidence) && Object.isFrozen(flagshipView.observationEvidence), '50. decisionEvidence and observationEvidence are each frozen');
    }
    console.log('✓ Section I: every object in the result is frozen, at every level of nesting');

    // ---------------------------------------------------------------
    // Section J — determinism.
    // ---------------------------------------------------------------
    {
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(
            describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(
                exportOf([entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], []))], ALL_FILTER, 'PEER_PRESENT'),
                exportOf([entryOf('C1', detailOf(['D1'], [], ['D3']), detailOf(['O1'], [], []))], ALL_FILTER, 'PEER_PRESENT')
            )
        );
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel);
        assert(serialize(first) === serialize(second), '51. calling describeXxx() twice with the byte-identical read model returns a byte-identical view');
    }
    console.log('✓ Section J: describeXxx() is deterministic — byte-identical input always produces a byte-identical view');

    // ---------------------------------------------------------------
    // Section K — architectural import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '52. this file imports no module of its own — it takes 0.8.190\'s own already-computed result directly as its one argument');
        assert(!/function reconstruct/.test(codeOnly), '53. this file declares no reconstructXxx() of its own — there is no document pair, and no read model pair, for it to build');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz', 'recommend', 'better', 'worse'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `54. this file's own code never carries "${term}"`);
        }

        const emptyView = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView({});
        assert(!('shared' in emptyView.candidateSummary) && !('sourceOnly' in emptyView.candidateSummary) && !('targetOnly' in emptyView.candidateSummary), '55. the result\'s own candidateSummary never carries a shared/sourceOnly/targetOnly key');
    }
    console.log('✓ Section K: imports nothing, declares no reconstructXxx() of its own, and carries no ranking/reconciliation vocabulary anywhere in its own code');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.test.js FAILED:', error);
    process.exitCode = 1;
});
