import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js';

// 0.8.187 — Reconciliation Candidate Leaderboard Evidence Export UI
// Integration.
//
// 0.8.186 produced a pure, exportable document; this milestone's only job
// is turning it into a user action — an "Export Evidence" control on
// ReconciliationCandidateLeaderboardView that downloads exactly what the
// currently-selected Evidence Filter and peer archive state already show.
//
// Section A: FLAGSHIP — the milestone's own worked example, proven at the
//            application layer exactly the way the view's own computed
//            chain composes it: user's filter selection -> 0.8.184's own
//            filteredPage -> 0.8.185's own filteredEvidenceDetail ->
//            0.8.186's own describeXxx() -> the document a download would
//            carry. Only O2/O3 survive; D1/D2/O1 are absent.
// Section B: 0.8.183's NO_PEER/PEER_EMPTY distinction survives into the
//            exported document even when the underlying evidence is
//            byte-identical (empty) between the two.
// Section C: the view's own wiring — imports 0.8.186's own describeXxx()
//            (never its reconstructXxx(), never a fresh archive read),
//            calls it exactly once over the three already-computed
//            values, exposes an "Export Evidence" control and a real
//            download link, and touches none of the existing
//            reconstructXxx() calls.
// Section D: vocabulary boundary — the new code carries no
//            filtering/scoring/dedup/sort/server vocabulary of its own;
//            the download mechanism mirrors the codebase's own existing
//            "Export Archive" shape rather than inventing a new one.

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

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

function entryOf(claimId, decisionDetail, observationDetail) {
    return Object.freeze({ candidate: candidateOf(claimId), decisionDetail, observationDetail });
}

function evidenceDetailOf(entries) {
    return Object.freeze({ candidateCount: entries.length, candidates: Object.freeze(entries) });
}

function entryFor(result, claimId) {
    return result.candidates.find((entry) => entry.candidate.claimId === claimId);
}

function allRecords(entry) {
    return [
        ...entry.decisionDetail.shared, ...entry.decisionDetail.sourceOnly, ...entry.decisionDetail.targetOnly,
        ...entry.observationDetail.shared, ...entry.observationDetail.sourceOnly, ...entry.observationDetail.targetOnly
    ];
}

// The milestone's own flagship scenario, verbatim:
//   C1
//   Decision:    Shared [D1] / Source-only [D2]
//   Observation: Shared [O1] / Target-only [O2, O3]
// This is 0.8.182-shaped (the UNFILTERED evidenceDetail a real view holds)
// so the test exercises the SAME 0.8.185 filtering step the view's own
// `filteredEvidenceDetail` computed value performs, rather than handing
// 0.8.186 an already-filtered detail directly.
function buildFlagshipEvidenceDetail() {
    const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], ['O2', 'O3']));
    return evidenceDetailOf([c1]);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the full user-selects-filter -> ... ->
    // downloaded-JSON chain.
    // ---------------------------------------------------------------
    {
        const evidenceDetail = buildFlagshipEvidenceDetail();
        const filter = { evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS, replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY };

        // The identical computed chain the view itself holds:
        // filteredEvidenceDetail (0.8.185) -> evidenceExport (0.8.186).
        // filteredPage (0.8.184) is exercised too, over an equivalent
        // page-shaped structure, to prove the SAME filter selection
        // drives both computed values at once, exactly as the view wires
        // them from the same two refs.
        const pageRow = Object.freeze({
            candidate: candidateOf('C1'),
            decisionEvidence: Object.freeze({ sharedCount: 1, sourceOnlyCount: 1, targetOnlyCount: 0 }),
            observationEvidence: Object.freeze({ sharedCount: 1, sourceOnlyCount: 0, targetOnlyCount: 2 })
        });
        const page = Object.freeze({ isEmpty: false, rowCount: 1, rows: Object.freeze([pageRow]) });

        const filteredPage = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, filter);
        assert(filteredPage.rowCount === 1, '1. FLAGSHIP — C1 survives the Observations + Target-only row filter');

        const filteredEvidenceDetail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(evidenceDetail, filter);
        const comparisonState = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, evidenceDetail);

        const exportDocument = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEvidenceDetail, filter, comparisonState);
        const downloadedJson = JSON.parse(JSON.stringify(exportDocument));

        const c1 = entryFor(downloadedJson, 'C1');
        const records = allRecords(c1);
        assert(serialize(records) === serialize(['O2', 'O3']), '2. FLAGSHIP — the downloaded JSON contains exactly the records visible through the selected filter: O2 and O3');
        assert(!records.includes('O1'), '3. FLAGSHIP — O1 is absent from the downloaded JSON');
        assert(!records.includes('D1'), '4. FLAGSHIP — D1 is absent from the downloaded JSON');
        assert(!records.includes('D2'), '5. FLAGSHIP — D2 is absent from the downloaded JSON');
        assert(serialize(downloadedJson.filter) === serialize({ evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }), '6. FLAGSHIP — the downloaded JSON records the active filter');
    }
    console.log('✓ Section A: FLAGSHIP — user selects OBSERVATIONS + TARGET_ONLY, and the downloaded JSON contains exactly O2/O3, with D1/D2/O1 absent, matching the exact records visible through the selected filter');

    // ---------------------------------------------------------------
    // Section B — NO_PEER vs PEER_EMPTY survive into the export.
    // ---------------------------------------------------------------
    {
        const emptyDetail = evidenceDetailOf([]);
        const filteredEmpty = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(emptyDetail, 'ALL');

        const noPeerState = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(false, emptyDetail);
        const peerEmptyState = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, emptyDetail);
        assert(noPeerState === 'NO_PEER' && peerEmptyState === 'PEER_EMPTY', 'test setup — the two comparison states under test must be genuinely NO_PEER and PEER_EMPTY');

        const noPeerExport = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEmpty, 'ALL', noPeerState);
        const peerEmptyExport = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEmpty, 'ALL', peerEmptyState);

        assert(serialize(noPeerExport.candidates) === serialize(peerEmptyExport.candidates), '7. an empty export under NO_PEER and one under PEER_EMPTY carry byte-identical (empty) candidates');
        assert(noPeerExport.comparisonState === 'NO_PEER' && peerEmptyExport.comparisonState === 'PEER_EMPTY', '8. the two downloaded documents still say which comparison state produced them');
        assert(serialize(noPeerExport) !== serialize(peerEmptyExport), '9. the two downloaded documents are not byte-identical as a whole — an empty export from NO_PEER is never indistinguishable from an empty export from PEER_EMPTY');
    }
    console.log('✓ Section B: 0.8.183\'s NO_PEER/PEER_EMPTY distinction is preserved in the exported document even when the underlying evidence is byte-identical (empty) between the two');

    // ---------------------------------------------------------------
    // Section C — the view's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js'"), '10. the view imports 0.8.186\'s own evidence-export module');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport\(/g) || []).length === 1,
            '11. the view calls 0.8.186\'s own describeXxx() exactly once');
        assert(!codeOnly.includes('reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport'), '12. the view never calls 0.8.186\'s own reconstructXxx() — it already holds filteredEvidenceDetail/filter/comparisonState and passes them to describeXxx() directly, never re-reading either archive');
        assert(/evidenceExport\s*=\s*computed/.test(codeOnly), '13. evidenceExport is its own reactive computed value, recomputed whenever the filter, peer archive, or underlying evidence changes');

        // evidenceExport is fed the SAME filteredEvidenceDetail/filter/
        // comparisonState the view already computes — never a fresh,
        // fourth computation.
        const evidenceExportBlock = codeOnly.slice(codeOnly.indexOf('const evidenceExport'), codeOnly.indexOf('const evidenceExport') + 400);
        assert(evidenceExportBlock.includes('filteredEvidenceDetail.value'), '14. evidenceExport reads the view\'s own filteredEvidenceDetail (0.8.185), never evidenceDetail directly');
        assert(evidenceExportBlock.includes('evidenceKindFilter.value') && evidenceExportBlock.includes('replicaRelationFilter.value'), '15. evidenceExport reads the SAME two filter refs filteredPage/filteredEvidenceDetail already read, never a third, independent selection');
        assert(evidenceExportBlock.includes('comparisonState.value'), '16. evidenceExport reads the view\'s own comparisonState (0.8.183) verbatim');

        assert(moduleSource.includes('Export Evidence'), '17. the template exposes an "Export Evidence" control, exactly as the milestone names it');
        assert(codeOnly.includes('function exportEvidence()'), '18. the view declares its own exportEvidence() click handler');
        assert(/JSON\.stringify\(\s*evidenceExport\.value/.test(codeOnly), '19. exportEvidence() serializes evidenceExport\'s own current value as JSON, never a re-derived shape');
        assert(codeOnly.includes(":download=\"evidenceExportPackage.fileName\"") || moduleSource.includes(':download="evidenceExportPackage.fileName"'), '20. the template offers a real browser download via a `download`-attributed link');
        assert(moduleSource.includes("'data:application/json"), '21. the download mechanism mirrors the codebase\'s own existing Export Archive shape — a `data:` URI, never a programmatically triggered save');

        // No existing evidence computation changed by this milestone —
        // every prior reconstructXxx()/describeXxx() call still fires
        // exactly once, unchanged.
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\(/g) || []).length === 1,
            '22. the view still calls 0.8.179\'s own reconstructXxx() exactly once');
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail\(/g) || []).length === 1,
            '23. the view still calls 0.8.182\'s own reconstructXxx() exactly once');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter\(/g) || []).length === 1,
            '24. the view still calls 0.8.184\'s own describeXxx() exactly once');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail\(/g) || []).length === 1,
            '25. the view still calls 0.8.185\'s own describeXxx() exactly once');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState\(/g) || []).length === 1,
            '26. the view still calls 0.8.183\'s own describeXxx() exactly once');
    }
    console.log('✓ Section C: the view imports 0.8.186\'s own describeXxx() (never reconstructXxx()), feeds it the SAME already-computed filteredEvidenceDetail/filter/comparisonState, exposes an "Export Evidence" control with a real download link mirroring the codebase\'s own existing export shape, and leaves every prior computed value untouched');

    // ---------------------------------------------------------------
    // Section D — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'dedup', 'fetch(', 'xmlhttprequest', 'websocket'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `27. the view's own code never carries "${term}"`);
        }

        // No server communication of any kind was introduced.
        assert(!codeOnly.includes('http://') && !codeOnly.includes('https://'), '28. exportEvidence() never contacts a server');
        assert(!codeOnly.includes('localstorage') && !codeOnly.includes('sessionstorage'), '29. the exported document is never persisted anywhere by this view');
    }
    console.log('✓ Section D: the view\'s own new code carries no ranking/dedup/sort/server vocabulary, and introduces no persistence or network call of its own');

    console.log('\nAll ReconciliationCandidateLeaderboardEvidenceExportUI tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardEvidenceExportUI.test.js FAILED:', error);
    process.exitCode = 1;
});
