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
// Section A: FLAGSHIP — the milestone's own asymmetric three-candidate
//            scenario, round-tripped through JSON.stringify()/JSON.parse()/
//            importXxx(); the imported document is structurally identical
//            to the exported one, candidate order and record order both
//            survive, and observedAt survives exactly.
// Section B: NO_PEER and PEER_EMPTY remain distinct across the round trip
//            even when candidates is byte-identical (empty) between them.
// Section C: malformed/wrong-version documents are rejected, never thrown
//            on, and never damage a caller's own already-held state.
// Section D: describeXxx() tallies decision/observation record counts from
//            an already-imported document, and degrades to an empty
//            summary for malformed/absent input.
// Section E: determinism, no mutation, frozen output.
// Section F: vocabulary/import boundary — no archive import, no
//            reconstruction, ranking, or revalidation vocabulary.

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

function evidenceDetailOf(entries) {
    return Object.freeze({ candidateCount: entries.length, candidates: Object.freeze(entries) });
}

function entryFor(result, claimId) {
    return result.candidates.find((entry) => entry.candidate.claimId === claimId);
}

// The milestone's own flagship scenario, verbatim:
//   C1: decisions shared + source-only / observations shared + target-only
//   C2: decisions shared / observations source-only
//   C3: decisions target-only / observations shared
function buildFlagshipFilteredDetail() {
    const c1 = entryOf('C1',
        detailOf(['D1'], ['D2'], []),
        detailOf([observationOf('O1', '2026-08-31T06:00:00.000Z')], [], [observationOf('O2', '2026-08-31T07:00:00.000Z'), observationOf('O3', '2026-08-31T08:00:00.000Z')])
    );
    const c2 = entryOf('C2', detailOf(['D3'], [], []), detailOf([], ['O4'], []));
    const c3 = entryOf('C3', detailOf([], [], ['D4']), detailOf([observationOf('O5', '2026-08-31T09:00:00.000Z')], [], []));
    return evidenceDetailOf([c1, c2, c3]);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP round trip.
    // ---------------------------------------------------------------
    {
        const filteredDetail = buildFlagshipFilteredDetail();
        const exported = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
            filteredDetail, { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'PEER_PRESENT'
        );

        const wireText = JSON.stringify(exported);
        const wireValue = JSON.parse(wireText);

        const result = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(wireValue);
        assert(result.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED, '1. FLAGSHIP — a genuine, round-tripped export document imports successfully');

        assert(serialize(result.document) === serialize(exported), '2. FLAGSHIP — the imported document is structurally identical to the exported one');

        assert(serialize(result.document.candidates.map((entry) => entry.candidate.claimId)) === serialize(['C1', 'C2', 'C3']), '3. FLAGSHIP — candidate order survives the round trip');

        const c1 = entryFor(result.document, 'C1');
        assert(serialize(c1.decisionDetail.shared) === serialize(['D1']), '4. FLAGSHIP — record order survives within a surviving list (decisionDetail.shared)');
        assert(serialize(c1.observationDetail.targetOnly.map((o) => o.id)) === serialize(['O2', 'O3']), '5. FLAGSHIP — record order survives within observationDetail.targetOnly');

        assert(c1.observationDetail.shared[0].observedAt === '2026-08-31T06:00:00.000Z', '6. FLAGSHIP — observedAt survives exactly for a shared observation');
        assert(c1.observationDetail.targetOnly[0].observedAt === '2026-08-31T07:00:00.000Z' && c1.observationDetail.targetOnly[1].observedAt === '2026-08-31T08:00:00.000Z', '7. FLAGSHIP — observedAt survives exactly for target-only observations');

        assert(result.document.comparisonState === 'PEER_PRESENT', '8. FLAGSHIP — comparisonState survives the round trip');

        // Also parse the raw JSON string directly, exactly the way a
        // textarea paste would arrive.
        const fromText = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(wireText);
        assert(fromText.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED, '9. FLAGSHIP — importXxx() accepts a raw JSON string, not only an already-parsed value');
        assert(serialize(fromText.document) === serialize(result.document), '10. FLAGSHIP — importing the raw text and importing the already-parsed value produce identical documents');
    }
    console.log('✓ Section A: FLAGSHIP — the asymmetric three-candidate scenario survives JSON.stringify()/JSON.parse()/importXxx() with candidate order, record order, and observedAt all exact');

    // ---------------------------------------------------------------
    // Section B — NO_PEER vs PEER_EMPTY survive the round trip.
    // ---------------------------------------------------------------
    {
        const emptyDetail = evidenceDetailOf([]);
        const noPeerExported = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(emptyDetail, 'ALL', 'NO_PEER');
        const peerEmptyExported = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(emptyDetail, 'ALL', 'PEER_EMPTY');

        const noPeerImported = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(JSON.parse(JSON.stringify(noPeerExported)));
        const peerEmptyImported = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(JSON.parse(JSON.stringify(peerEmptyExported)));

        assert(noPeerImported.outcome === 'imported' && peerEmptyImported.outcome === 'imported', '11. both documents import successfully');
        assert(serialize(noPeerImported.document.candidates) === serialize(peerEmptyImported.document.candidates), '12. the two imported documents carry byte-identical (empty) candidates');
        assert(noPeerImported.document.comparisonState === 'NO_PEER' && peerEmptyImported.document.comparisonState === 'PEER_EMPTY', '13. NO_PEER and PEER_EMPTY remain distinct after the round trip');
    }
    console.log('✓ Section B: NO_PEER and PEER_EMPTY remain distinct through the round trip even when the underlying candidates are byte-identical (empty)');

    // ---------------------------------------------------------------
    // Section C — malformed/wrong-version documents are rejected.
    // ---------------------------------------------------------------
    {
        const genuine = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(buildFlagshipFilteredDetail(), 'ALL', 'PEER_PRESENT');

        for (const malformed of [
            null, undefined, 'not json at all {{{', 42, {},
            { ...genuine, protocolVersion: 999 },
            { ...genuine, comparisonState: 'BOGUS' },
            { ...genuine, filter: { evidenceKind: 'ALL' } },
            { ...genuine, candidateCount: genuine.candidateCount + 1 },
            { ...genuine, candidates: [{ candidate: {}, decisionDetail: {} }] },
            { ...genuine, extraField: 'not part of the contract' }
        ]) {
            const result = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(malformed);
            assert(result.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.INVALID_DOCUMENT, `14. malformed document (${serialize(malformed)}) is rejected as INVALID_DOCUMENT`);
            assert(result.document === null, `15. malformed document (${serialize(malformed)}) carries a null document`);
        }

        // A caller's own already-held state is never damaged by a
        // rejected import — importXxx() is a pure function of its own
        // argument and touches nothing else.
        const held = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(genuine);
        assert(held.outcome === 'imported', 'test setup — the genuine document must import successfully');
        const before = serialize(held.document);
        importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport('not json at all {{{');
        assert(serialize(held.document) === before, '16. a subsequent rejected import never mutates a document already held from a prior successful import');
    }
    console.log('✓ Section C: malformed and wrong-protocolVersion documents are rejected as INVALID_DOCUMENT, never thrown on, and never damage a caller\'s own already-held state');

    // ---------------------------------------------------------------
    // Section D — describeXxx() tallies from an already-imported
    // document.
    // ---------------------------------------------------------------
    {
        const { document } = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
            describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(buildFlagshipFilteredDetail(), 'ALL', 'PEER_PRESENT')
        );

        const summary = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(document);
        assert(summary.comparisonState === 'PEER_PRESENT', '17. summary forwards comparisonState verbatim');
        assert(summary.candidateCount === 3, '18. summary forwards candidateCount verbatim');
        assert(summary.decisionRecordCount === 4, '19. summary tallies decision records across all candidates (D1, D2, D3, D4 = 4)');
        assert(summary.observationRecordCount === 5, '20. summary tallies observation records across all candidates (O1..O5 = 5)');

        for (const malformed of [null, undefined, 'not-a-document', 42, {}, { candidates: 'nope' }]) {
            const empty = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(malformed);
            assert(empty.candidateCount === 0 && empty.decisionRecordCount === 0 && empty.observationRecordCount === 0 && empty.comparisonState === 'NO_PEER', `21. malformed/absent document (${serialize(malformed)}) degrades to an empty, NO_PEER summary rather than throwing`);
        }
    }
    console.log('✓ Section D: describeXxx() tallies decision/observation record counts from an already-imported document, forwards comparisonState/filter/candidateCount verbatim, and degrades to an empty summary for malformed input');

    // ---------------------------------------------------------------
    // Section E — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const exported = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(buildFlagshipFilteredDetail(), 'ALL', 'PEER_PRESENT');
        const wireValue = JSON.parse(JSON.stringify(exported));
        const beforeWire = serialize(wireValue);

        const first = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(wireValue);
        const second = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(wireValue);
        assert(serialize(first) === serialize(second), '22. importXxx() is deterministic — byte-identical input yields byte-identical output');
        assert(serialize(wireValue) === beforeWire, '23. importXxx() never mutates the payload it is handed');

        assert(Object.isFrozen(first.document), '24. the imported document is frozen');
        assert(Object.isFrozen(first.document.candidates), '25. the imported candidates array is frozen');
        assert(Object.isFrozen(first.document.candidates[0].decisionDetail.shared), '26. an imported record list is frozen');

        const summary = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(first.document);
        assert(Object.isFrozen(summary), '27. the import summary is frozen');
    }
    console.log('✓ Section E: importXxx() is deterministic, never mutates its input, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section F — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 3, '28. this file imports exactly three modules');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js'"), '29. one import is 0.8.186\'s own evidence-export module (its protocol-version constant)');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js'"), '30. another import is 0.8.184\'s own evidence filter module (its enums)');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js'"), '31. another import is 0.8.183\'s own comparison-state module');
        assert(!codeOnly.includes('PublicationObservationArchive'), '32. this file never imports PublicationObservationArchive, or any archive-reading module, directly');
        assert(!codeOnly.includes('CandidateEvidenceAgreementView') && !codeOnly.includes('CandidateEvidenceDetailView') && !codeOnly.includes('FilteredEvidenceDetailView'), '33. this file never imports 0.8.176, 0.8.182, or 0.8.185 directly');
        assert(!/\breconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport\s*\(/.test(codeOnly), '34. this file never calls 0.8.186\'s own reconstructXxx() — there is no archive pair to reconstruct from');
        assert(!/function reconstruct/.test(codeOnly), '35. this file declares no reconstructXxx() of its own');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'apply', 'execute', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `36. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section F: imports exactly 0.8.183/0.8.184/0.8.186, never an archive-reading module or 0.8.176/0.8.182/0.8.185, declares no reconstructXxx() of its own, and carries no ranking/judgment/synchronization/transmission vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.test.js FAILED:', error);
    process.exitCode = 1;
});
