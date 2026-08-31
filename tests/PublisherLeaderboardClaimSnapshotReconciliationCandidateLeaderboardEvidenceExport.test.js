import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';
import {
    RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_EXPORT_PROTOCOL_VERSION,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js';

// 0.8.186 — Reconciliation Candidate Leaderboard Evidence Export Projection.
//
// Section A: malformed/absent filteredEvidenceDetail degrades to an empty,
//            valid document, never throws.
// Section B: filter absent/malformed normalizes to ALL/ALL metadata; a bare
//            string and an explicit object both normalize identically to
//            0.8.184/0.8.185's own vocabulary.
// Section C: comparisonState absent/malformed degrades to NO_PEER; the
//            three genuine values are forwarded verbatim.
// Section D: FLAGSHIP — the milestone's own asymmetric worked example:
//            OBSERVATIONS + TARGET_ONLY exports O2/O3 only; O1/D1/D2 absent;
//            the original filteredEvidenceDetail is untouched.
// Section E: protocolVersion is a fixed constant, always 1, regardless of
//            input.
// Section F: determinism — byte-identical arguments produce byte-identical
//            output.
// Section G: changing one observation's own observedAt changes the export.
// Section H: NO_PEER vs PEER_EMPTY stay distinct in the export even when
//            candidates is byte-identical (empty) between the two.
// Section I: reference identity — candidates (and its own entries) are the
//            ORIGINAL objects, never copied or rebuilt.
// Section J: no mutation of filteredEvidenceDetail.
// Section K: vocabulary/import boundary — no archive import, no
//            ranking/dedup/sort/timestamp/transmission vocabulary.
// Section L: reconstructXxx() composes 0.8.185's own reconstructXxx() and
//            0.8.183's own describeXxx() exactly once each.

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
function buildFlagshipDetail() {
    const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], ['O2', 'O3']));
    return evidenceDetailOf([c1]);
}

// Pre-filtered exactly the way 0.8.185's own describeXxx() would produce
// for `{ evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }`
// over the flagship scenario above: decisionDetail entirely empty,
// observationDetail carrying only targetOnly.
function buildFlagshipFilteredDetail() {
    const c1 = entryOf('C1', detailOf([], [], []), detailOf([], [], ['O2', 'O3']));
    return evidenceDetailOf([c1]);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent filteredEvidenceDetail.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { candidates: 'not-an-array' }, { candidates: null }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(malformed, 'ALL', 'NO_PEER');
            assert(result.candidateCount === 0, `1. malformed filteredEvidenceDetail (${serialize(malformed)}) reports candidateCount 0`);
            assert(Array.isArray(result.candidates) && result.candidates.length === 0, `2. malformed filteredEvidenceDetail (${serialize(malformed)}) reports an empty candidates array`);
            assert(Object.isFrozen(result) && Object.isFrozen(result.candidates), `3. malformed filteredEvidenceDetail (${serialize(malformed)}) still returns a frozen, valid document`);
        }
        const noArgs = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport();
        assert(noArgs.candidateCount === 0 && noArgs.comparisonState === 'NO_PEER' && serialize(noArgs.filter) === serialize({ evidenceKind: 'ALL', replicaRelation: 'ALL' }),
            '4. calling with no arguments at all degrades to an empty, NO_PEER, ALL/ALL document, never throws');
    }
    console.log('✓ Section A: malformed/absent filteredEvidenceDetail degrades to an empty, valid document rather than throwing');

    // ---------------------------------------------------------------
    // Section B — filter normalization.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();

        const bareString = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, 'TARGET_ONLY', 'NO_PEER');
        assert(serialize(bareString.filter) === serialize({ evidenceKind: 'ALL', replicaRelation: 'TARGET_ONLY' }), '5. a bare replica-relation string normalizes to { evidenceKind: ALL, replicaRelation: <string> }, matching 0.8.184/0.8.185\'s own shorthand');

        const explicitObject = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }, 'NO_PEER');
        assert(serialize(explicitObject.filter) === serialize({ evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }), '6. an explicit { evidenceKind, replicaRelation } filter is recorded verbatim');

        for (const malformedFilter of [null, undefined, 'not-a-relation', 42, { evidenceKind: 'bogus', replicaRelation: 'bogus' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, malformedFilter, 'NO_PEER');
            assert(serialize(result.filter) === serialize({ evidenceKind: 'ALL', replicaRelation: 'ALL' }), `7. malformed filter (${serialize(malformedFilter)}) degrades to ALL/ALL metadata`);
        }
    }
    console.log('✓ Section B: filter is normalized into 0.8.184/0.8.185\'s own { evidenceKind, replicaRelation } vocabulary and recorded as metadata, never re-applied to candidates');

    // ---------------------------------------------------------------
    // Section C — comparisonState normalization.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();

        for (const genuine of ['NO_PEER', 'PEER_EMPTY', 'PEER_PRESENT']) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, 'ALL', genuine);
            assert(result.comparisonState === genuine, `8. a genuine comparisonState (${genuine}) is forwarded verbatim`);
        }

        for (const malformed of [null, undefined, 'BOGUS', 42, {}]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, 'ALL', malformed);
            assert(result.comparisonState === 'NO_PEER', `9. an unrecognized/malformed comparisonState (${serialize(malformed)}) degrades to NO_PEER, never a fabricated PEER_* value`);
        }
    }
    console.log('✓ Section C: comparisonState is forwarded verbatim for the three genuine values, and degrades to NO_PEER (the least-claimed state) for anything else');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP, exactly as the milestone's own request states
    // it.
    // ---------------------------------------------------------------
    {
        const filteredDetail = buildFlagshipFilteredDetail();
        const before = serialize(filteredDetail);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
            filteredDetail,
            { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' },
            'PEER_PRESENT'
        );

        const c1 = entryFor(result, 'C1');
        const records = allRecords(c1);
        assert(serialize(records) === serialize(['O2', 'O3']), '10. FLAGSHIP — the exported document contains O2 and O3 only');
        assert(!records.includes('O1'), '11. FLAGSHIP — O1 is absent');
        assert(!records.includes('D1'), '12. FLAGSHIP — D1 is absent');
        assert(!records.includes('D2'), '13. FLAGSHIP — D2 is absent');

        assert(result.protocolVersion === 1, '14. FLAGSHIP — protocolVersion is 1');
        assert(result.comparisonState === 'PEER_PRESENT', '15. FLAGSHIP — comparisonState is preserved as PEER_PRESENT');
        assert(serialize(result.filter) === serialize({ evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' }), '16. FLAGSHIP — the active filter is recorded in the document');

        assert(serialize(filteredDetail) === before, '17. FLAGSHIP — the original filteredEvidenceDetail object remains untouched');
    }
    console.log('✓ Section D: FLAGSHIP — OBSERVATIONS + TARGET_ONLY exports exactly O2/O3, with O1/D1/D2 absent, protocolVersion/comparisonState/filter recorded, and the original filteredEvidenceDetail left untouched');

    // ---------------------------------------------------------------
    // Section E — protocolVersion is a fixed constant.
    // ---------------------------------------------------------------
    {
        assert(RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_EXPORT_PROTOCOL_VERSION === 1, '18. the exported protocol-version constant is 1');

        const empty = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(null, null, null);
        const flagship = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(buildFlagshipDetail(), 'ALL', 'PEER_PRESENT');
        assert(empty.protocolVersion === flagship.protocolVersion, '19. protocolVersion never varies with input — an empty document and a rich one carry the identical value');
    }
    console.log('✓ Section E: protocolVersion is a fixed constant, unaffected by filteredEvidenceDetail, filter, or comparisonState');

    // ---------------------------------------------------------------
    // Section F — determinism.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'PEER_PRESENT');
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'PEER_PRESENT');
        assert(serialize(first) === serialize(second), '20. calling describeXxx() twice with byte-identical arguments returns byte-identical output');
    }
    console.log('✓ Section F: describeXxx() is deterministic — byte-identical arguments always produce byte-identical output');

    // ---------------------------------------------------------------
    // Section G — changing observedAt changes the export.
    // ---------------------------------------------------------------
    {
        function observationOf(observedAt) {
            return Object.freeze({
                candidate: candidateOf('C1'),
                decision: Object.freeze({ decided: true, candidate: candidateOf('C1'), decision: 'OBSERVE', decidedAt: '2026-08-31T06:00:00.000Z' }),
                planIdentity: Object.freeze({ planFingerprint: 'abc123' }),
                candidatePresent: true,
                candidateType: 'SNAPSHOT',
                candidateMatchesPlan: true,
                observedAt
            });
        }

        function detailWithObservation(observedAt) {
            const c1 = entryOf('C1', detailOf([], [], []), detailOf([], [], [observationOf(observedAt)]));
            return evidenceDetailOf([c1]);
        }

        const early = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detailWithObservation('2026-08-31T06:00:00.000Z'), 'ALL', 'PEER_PRESENT');
        const late = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detailWithObservation('2026-08-31T07:00:00.000Z'), 'ALL', 'PEER_PRESENT');
        assert(serialize(early) !== serialize(late), '21. changing only observedAt on an otherwise-identical observation changes the exported document');
    }
    console.log('✓ Section G: observedAt is part of an observation\'s own structural identity — changing it changes the export');

    // ---------------------------------------------------------------
    // Section H — NO_PEER vs PEER_EMPTY stay distinct even with
    // byte-identical (empty) candidates.
    // ---------------------------------------------------------------
    {
        const emptyDetail = evidenceDetailOf([]);
        const noPeer = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(emptyDetail, 'ALL', 'NO_PEER');
        const peerEmpty = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(emptyDetail, 'ALL', 'PEER_EMPTY');

        assert(serialize(noPeer.candidates) === serialize(peerEmpty.candidates), '22. NO_PEER and PEER_EMPTY exports carry byte-identical (empty) candidates');
        assert(noPeer.comparisonState !== peerEmpty.comparisonState, '23. NO_PEER and PEER_EMPTY exports still disagree about comparisonState — an empty evidence page never collapses the two facts into one');
        assert(serialize(noPeer) !== serialize(peerEmpty), '24. the two documents as a whole are not byte-identical, because comparisonState differs');
    }
    console.log('✓ Section H: an export can say NO_PEER or say PEER_EMPTY even when its own candidates are byte-identical — 0.8.183\'s own distinction is preserved, never re-derived from the evidence');

    // ---------------------------------------------------------------
    // Section I — reference identity.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, 'ALL', 'PEER_PRESENT');
        assert(result.candidates === detail.candidates, '25. the exported candidates array is the ORIGINAL array, referenced, never copied or rebuilt');
        assert(result.candidates[0] === detail.candidates[0], '26. each exported candidate entry is the ORIGINAL object, referenced');
    }
    console.log('✓ Section I: candidates (and every entry within it) are reference-identical to filteredEvidenceDetail\'s own — never copied, reshaped, deduplicated, sorted, or ranked');

    // ---------------------------------------------------------------
    // Section J — no mutation.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();
        const before = serialize(detail);
        describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(detail, { evidenceKind: 'DECISIONS', replicaRelation: 'SHARED' }, 'PEER_PRESENT');
        assert(serialize(detail) === before, '27. filteredEvidenceDetail is never mutated by exporting it');
    }
    console.log('✓ Section J: exporting never mutates the filteredEvidenceDetail it is handed');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 3, '28. this file imports exactly three modules');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js'"), '29. one import is 0.8.185\'s own filtered evidence detail module');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js'"), '30. another import is 0.8.184\'s own evidence filter module (its enums)');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js'"), '31. another import is 0.8.183\'s own comparison-state module');
        assert(!codeOnly.includes('PublicationObservationArchive'), '32. this file never imports PublicationObservationArchive, or any archive-reading module, directly');
        assert(!codeOnly.includes('CandidateEvidenceAgreementView') && !codeOnly.includes('CandidateEvidenceDetailView'), '33. this file never imports 0.8.176 or 0.8.182 directly');
        assert(!/describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail\s*\(/.test(codeOnly), '34. this file never calls 0.8.185\'s own describeXxx() — only its reconstructXxx(), to compose');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject', 'merge', 'delete', 'dedup', 'apply', 'execute', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'exportedat', 'signature', 'new date(', 'date.now'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `35. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section K: imports exactly 0.8.183/0.8.184/0.8.185, never an archive-reading module or 0.8.176/0.8.182 directly, never re-applies 0.8.185\'s own filter, and carries no ranking/judgment/transmission vocabulary');

    // ---------------------------------------------------------------
    // Section L — reconstructXxx()'s own composition boundary.
    // ---------------------------------------------------------------
    {
        const sourceArchive = PublicationObservationArchive.empty();
        const targetArchive = PublicationObservationArchive.empty();

        const viaReconstruct = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(sourceArchive, targetArchive, 'ALL', false);

        const filteredEvidenceDetail = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(sourceArchive, targetArchive, 'ALL');
        const comparisonState = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(false, targetArchive);
        const viaDescribe = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEvidenceDetail, 'ALL', comparisonState);

        assert(serialize(viaReconstruct) === serialize(viaDescribe), '36. reconstructXxx() over two archives agrees exactly with independently calling 0.8.185\'s own reconstructXxx() and 0.8.183\'s own describeXxx(), then handing both to this file\'s own describeXxx()');
        assert(viaReconstruct.candidateCount === 0 && viaReconstruct.comparisonState === 'NO_PEER', '37. two empty archives with hasPeerArchive=false produce a NO_PEER, zero-candidate document, never a throw');

        const withPeer = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(sourceArchive, targetArchive, 'ALL', true);
        assert(withPeer.comparisonState === 'PEER_EMPTY', '38. an explicitly supplied, genuinely empty peer archive reconstructs to PEER_EMPTY, not NO_PEER');
    }
    console.log('✓ Section L: reconstructXxx() calls 0.8.185\'s own reconstructXxx() and 0.8.183\'s own describeXxx() exactly once each, never touching either archive itself');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.test.js FAILED:', error);
    process.exitCode = 1;
});
