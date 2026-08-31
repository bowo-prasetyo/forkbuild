import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js';
import {
    ReconciliationCandidateLeaderboardEvidenceImportOutcome,
    importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js';

// 0.8.188 — Reconciliation Candidate Leaderboard Evidence Export Import.
//
// 0.8.188's own application module (tested independently in
// tests/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.test.js)
// gained a UI counterpart on ReconciliationCandidateLeaderboardView: an
// "Import Evidence" control that reads a pasted export document and shows
// a read-only summary, never merging it into the live leaderboard.
//
// Section A: FLAGSHIP — the identical export-to-JSON-to-import-to-summary
//            chain the view's own computed values compose, proven at the
//            application layer.
// Section B: the view's own wiring — imports 0.8.188's own importXxx()/
//            describeXxx(), calls each exactly once inside its own click
//            handler, exposes an "Import Evidence" control, and touches
//            none of the existing reconstructXxx()/describeXxx() calls
//            from prior milestones.
// Section C: the imported document never becomes the live archive/page —
//            no assignment of an imported value to sourceArchive/
//            targetArchive/page/filteredPage/evidenceDetail/
//            filteredEvidenceDetail anywhere in the new code.
// Section D: vocabulary boundary — no merge/synchronize/network vocabulary
//            in the new code.

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

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: export -> JSON -> import -> summary.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], ['O2', 'O3']));
        const filteredEvidenceDetail = evidenceDetailOf([c1]);

        const exportDocument = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
            filteredEvidenceDetail, { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'PEER_PRESENT'
        );

        // Exactly what a textarea paste + click would carry: a JSON
        // string a person copies out of the Evidence Export panel.
        const pastedText = JSON.stringify(exportDocument, null, 2);

        const importResult = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(pastedText);
        assert(importResult.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED, '1. FLAGSHIP — a document copied straight out of the export panel imports successfully');

        const summary = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(importResult.document);
        assert(summary.comparisonState === 'PEER_PRESENT', '2. FLAGSHIP — the summary reports the exported comparisonState');
        assert(summary.candidateCount === 1, '3. FLAGSHIP — the summary reports the exported candidateCount');
        assert(summary.decisionRecordCount === 2, '4. FLAGSHIP — the summary tallies D1 + D2 = 2 decision records');
        assert(summary.observationRecordCount === 3, '5. FLAGSHIP — the summary tallies O1 + O2 + O3 = 3 observation records');
    }
    console.log('✓ Section A: FLAGSHIP — a document copied out of the Evidence Export panel imports and summarizes exactly as exported');

    // ---------------------------------------------------------------
    // Section B — the view's own wiring.
    // ---------------------------------------------------------------
    let moduleSource;
    let codeOnly;
    {
        moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js'"), '6. the view imports 0.8.188\'s own evidence-import module');
        assert((codeOnly.match(/importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport\(/g) || []).length === 1, '7. the view calls 0.8.188\'s own importXxx() exactly once');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport\(/g) || []).length === 1, '8. the view calls 0.8.188\'s own describeXxx() exactly once');

        assert(codeOnly.includes('function importEvidenceExport()'), '9. the view declares its own importEvidenceExport() click handler');
        assert(moduleSource.includes('Import Evidence'), '10. the template exposes an "Import Evidence" control, exactly as the milestone names it');

        // Every prior reconstructXxx()/describeXxx() call from 0.8.179
        // through 0.8.187 still fires exactly once each, unchanged.
        for (const priorCall of [
            'reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\\(',
            'reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail\\(',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState\\(',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter\\(',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail\\(',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport\\('
        ]) {
            const count = (codeOnly.match(new RegExp(priorCall, 'g')) || []).length;
            assert(count === 1, `11. prior computed value ${priorCall} still fires exactly once — 0.8.188 introduces no extra call to it`);
        }
    }
    console.log('✓ Section B: the view imports 0.8.188\'s own importXxx()/describeXxx(), calls each exactly once from its own click handler, exposes an "Import Evidence" control, and leaves every prior computed value untouched');

    // ---------------------------------------------------------------
    // Section C — an imported document never becomes the live archive/
    // page.
    // ---------------------------------------------------------------
    {
        const importBlockStart = codeOnly.indexOf('function importEvidenceExport()');
        const importBlockEnd = codeOnly.indexOf('function clearImportedEvidence()');
        const importBlock = codeOnly.slice(importBlockStart, importBlockEnd);

        for (const forbiddenTarget of ['sourceArchive =', 'targetArchive.value =', 'page.value =', 'filteredPage.value =', 'evidenceDetail.value =', 'filteredEvidenceDetail.value =']) {
            assert(!importBlock.includes(forbiddenTarget), `12. importEvidenceExport() never assigns to "${forbiddenTarget}" — an imported document never becomes the live archive/page`);
        }
        assert(importBlock.includes('importedEvidenceSummary.value ='), '13. importEvidenceExport() assigns only its own page-local importedEvidenceSummary');
    }
    console.log('✓ Section C: importEvidenceExport() only ever assigns its own page-local importedEvidenceSummary — the imported document never becomes the live sourceArchive/targetArchive/page/evidenceDetail');

    // ---------------------------------------------------------------
    // Section D — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const importBlockStart = codeOnly.indexOf('function importEvidenceExport()');
        const importBlockEnd = codeOnly.indexOf('return {');
        const newCode = codeOnly.slice(importBlockStart, importBlockEnd).toLowerCase();

        const forbiddenInCode = ['merge', 'synchroniz', 'fetch(', 'xmlhttprequest', 'websocket', 'rank', 'score', 'winner', '.sort('];
        for (const term of forbiddenInCode) {
            assert(!newCode.includes(term), `14. the new import-handling code never carries "${term}"`);
        }
    }
    console.log('✓ Section D: the new import-handling code carries no merge/synchronize/network/ranking vocabulary of its own');

    console.log('\nAll ReconciliationCandidateLeaderboardEvidenceImportUI tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardEvidenceImportUI.test.js FAILED:', error);
    process.exitCode = 1;
});
