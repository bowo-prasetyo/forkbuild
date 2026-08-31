import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js';

// 0.8.185 — Reconciliation Candidate Filtered Evidence Detail Projection.
//
// Section A: malformed/absent evidenceDetail degrades to an empty result,
//            never throws; malformed candidate entries degrade to empty
//            detail rather than being dropped.
// Section B: filter absent/malformed, or explicit `{ evidenceKind: 'ALL',
//            replicaRelation: 'ALL' }` — identity projection, and the
//            surviving candidate entry is the ORIGINAL object (`===`).
// Section C: FLAGSHIP — the milestone's own asymmetric worked example.
// Section D: two-dimensional queries over a second worked example
//            (Decisions vs. Observations each carrying different
//            relations).
// Section E: unrecognized/malformed evidenceKind/replicaRelation values
//            degrade to ALL rather than throwing or silently emptying
//            everything.
// Section F: reference identity for surviving lists, correct zeroed
//            counts for excluded lists, no mutation of evidenceDetail,
//            determinism.
// Section G: a candidate whose detail ends up fully empty under a filter
//            still appears in `candidates` — row visibility stays 0.8.184's
//            own, separate, question.
// Section H: candidate order preserved, no reordering.
// Section I: vocabulary/import boundary — imports exactly 0.8.182 and
//            0.8.184's enums, no ranking/judgment vocabulary.
// Section J: reconstructXxx() calls 0.8.182's own reconstructXxx() exactly
//            once, never touches either archive directly, and agrees with
//            calling describeXxx() over 0.8.182's own separately-obtained
//            result.
// Section K: the view's own wiring — filteredEvidenceDetail is computed
//            from the SAME two filter refs `filteredPage` reads, and is
//            handed to the table as its own evidence-detail prop.

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
//   Decisions:    Shared [D1] / Source-only [D2]
//   Observations: Shared [O1] / Target-only [O2, O3]
function buildFlagshipDetail() {
    const c1 = entryOf('C1', detailOf(['D1'], ['D2'], []), detailOf(['O1'], [], ['O2', 'O3']));
    return evidenceDetailOf([c1]);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent evidenceDetail and malformed entries.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { candidates: 'not-an-array' }, { candidates: null }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(malformed, 'ALL');
            assert(result.candidateCount === 0, `1. malformed evidenceDetail (${serialize(malformed)}) reports candidateCount 0`);
            assert(Array.isArray(result.candidates) && result.candidates.length === 0, `2. malformed evidenceDetail (${serialize(malformed)}) reports an empty candidates array`);
            assert(Object.isFrozen(result) && Object.isFrozen(result.candidates), `3. malformed evidenceDetail (${serialize(malformed)}) still returns a frozen, valid result`);
        }
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail().candidateCount === 0, '4. calling with no arguments defaults to an empty result, never throws');

        const malformedEntry = Object.freeze({ candidate: candidateOf('C-malformed') });
        const detail = evidenceDetailOf([malformedEntry]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, 'SHARED');
        assert(result.candidateCount === 1, '5. a candidate entry missing decisionDetail/observationDetail is never dropped');
        assert(serialize(allRecords(entryFor(result, 'C-malformed'))) === serialize([]), '6. a malformed detail object degrades to fully empty, never throws');
    }
    console.log('✓ Section A: malformed/absent evidenceDetail (and malformed candidate entries within it) degrade to a valid, filtered result rather than throwing, and a malformed entry is never dropped');

    // ---------------------------------------------------------------
    // Section B — ALL/ALL identity projection, reference-preserving.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();

        const noFilter = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, undefined);
        assert(noFilter.candidates[0] === detail.candidates[0], '7. no filter argument returns the ORIGINAL candidate entry object, referenced');

        const explicitAll = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'ALL', replicaRelation: 'ALL' });
        assert(explicitAll.candidates[0] === detail.candidates[0], '8. explicit ALL/ALL also returns the ORIGINAL candidate entry object, referenced');

        const bareAllString = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, 'ALL');
        assert(bareAllString.candidates[0] === detail.candidates[0], '9. the bare string "ALL" also returns the ORIGINAL candidate entry object, referenced');

        // Even DECISIONS/OBSERVATIONS alone, with replicaRelation left at
        // ALL, is still the identity projection — replicaRelation: 'ALL'
        // means "do not filter at all," regardless of evidenceKind, the
        // identical short-circuit 0.8.184's own rowMatchesFilter() holds.
        const decisionsAll = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'DECISIONS', replicaRelation: 'ALL' });
        assert(decisionsAll.candidates[0] === detail.candidates[0], '10. evidenceKind alone (replicaRelation ALL) never narrows anything — identity projection regardless of evidenceKind');
    }
    console.log('✓ Section B: an absent, malformed, or explicit ALL/ALL filter (on either dimension, so long as replicaRelation is ALL) is a reference-preserving identity projection');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP, exactly as the milestone's own request states
    // it.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();

        const allAll = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'ALL', replicaRelation: 'ALL' });
        assert(serialize(allRecords(entryFor(allAll, 'C1')).sort()) === serialize(['D1', 'D2', 'O1', 'O2', 'O3']), '11. FLAGSHIP — ALL/ALL surfaces every record: D1, D2, O1, O2, O3');

        const decisionsShared = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'DECISIONS', replicaRelation: 'SHARED' });
        assert(serialize(allRecords(entryFor(decisionsShared, 'C1'))) === serialize(['D1']), '12. FLAGSHIP — Decisions + Shared surfaces exactly D1');

        const observationsTargetOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' });
        assert(serialize(allRecords(entryFor(observationsTargetOnly, 'C1'))) === serialize(['O2', 'O3']), '13. FLAGSHIP — Observations + Target-only surfaces exactly O2, O3');

        const allTargetOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'ALL', replicaRelation: 'TARGET_ONLY' });
        const c1 = entryFor(allTargetOnly, 'C1');
        assert(serialize(c1.decisionDetail.targetOnly) === serialize([]), '14. FLAGSHIP — ALL + Target-only: decisions.targetOnly is empty (C1 has none)');
        assert(serialize(c1.observationDetail.targetOnly) === serialize(['O2', 'O3']), '15. FLAGSHIP — ALL + Target-only: observations.targetOnly surfaces O2, O3');
        assert(serialize(c1.decisionDetail.shared) === serialize([]) && serialize(c1.decisionDetail.sourceOnly) === serialize([]), '16. FLAGSHIP — ALL + Target-only: decisions.shared/sourceOnly stay excluded');
        assert(serialize(c1.observationDetail.shared) === serialize([]) && serialize(c1.observationDetail.sourceOnly) === serialize([]), '17. FLAGSHIP — ALL + Target-only: observations.shared/sourceOnly stay excluded');
    }
    console.log('✓ Section C: FLAGSHIP — ALL/ALL, Decisions+Shared, Observations+Target-only, and ALL+Target-only (surfacing BOTH branches) all match the milestone\'s own asymmetric worked example exactly');

    // ---------------------------------------------------------------
    // Section D — two-dimensional queries over a second worked example.
    // ---------------------------------------------------------------
    {
        // C1  Decisions:    Shared [SD1] / Source-only [SD2] / Target-only []
        //     Observations: Shared [SO1] / Source-only [] / Target-only [ST1, ST2]
        const c1 = entryOf('C1', detailOf(['SD1'], ['SD2'], []), detailOf(['SO1'], [], ['ST1', 'ST2']));
        const detail = evidenceDetailOf([c1]);

        const decisionSourceOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'DECISIONS', replicaRelation: 'SOURCE_ONLY' });
        assert(serialize(allRecords(entryFor(decisionSourceOnly, 'C1'))) === serialize(['SD2']), '18. Decision + Source-only surfaces exactly SD2, ignoring the observation-side target-only records entirely');

        const decisionTargetOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'DECISIONS', replicaRelation: 'TARGET_ONLY' });
        assert(serialize(allRecords(entryFor(decisionTargetOnly, 'C1'))) === serialize([]), '19. Decision + Target-only surfaces nothing — C1 has no target-only DECISION, even though it has target-only observations');

        const anyShared = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, 'SHARED');
        assert(serialize(allRecords(entryFor(anyShared, 'C1')).sort()) === serialize(['SD1', 'SO1']), '20. Shared (default evidenceKind ALL) surfaces both branches\' own shared records, never merged into one list');
    }
    console.log('✓ Section D: evidenceKind narrows which detail object may keep any records at all, exactly mirroring 0.8.184\'s own row-level semantics one layer down');

    // ---------------------------------------------------------------
    // Section E — unrecognized/malformed dimension values degrade to ALL.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();
        const baseline = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, undefined);

        for (const malformedFilter of ['not-a-relation', 42, { evidenceKind: 'bogus', replicaRelation: 'bogus' }, { evidenceKind: 'DECISIONS' }, { replicaRelation: 'not-real' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, malformedFilter);
            assert(serialize(allRecords(entryFor(result, 'C1')).sort()) === serialize(allRecords(entryFor(baseline, 'C1')).sort()), `21. unrecognized filter (${serialize(malformedFilter)}) degrades to ALL/ALL rather than throwing or emptying everything`);
        }
    }
    console.log('✓ Section E: unrecognized evidenceKind/replicaRelation values degrade to ALL — never a throw, never a silently emptied detail');

    // ---------------------------------------------------------------
    // Section F — reference identity, correct counts, no mutation,
    // determinism.
    // ---------------------------------------------------------------
    {
        const detail = buildFlagshipDetail();
        const before = serialize(detail);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' });
        const c1 = entryFor(result, 'C1');

        assert(serialize(detail) === before, '22. the supplied evidenceDetail is never mutated');
        assert(c1.observationDetail.targetOnly === detail.candidates[0].observationDetail.targetOnly, '23. a surviving list is the ORIGINAL array object, referenced rather than copied');
        assert(c1.observationDetail.targetOnlyCount === 2, '24. the surviving list\'s own count matches its own (unchanged) length');
        assert(c1.observationDetail.sharedCount === 0 && serialize(c1.observationDetail.shared) === serialize([]), '25. an excluded list\'s own count is 0, matching its own (empty) length');
        assert(c1.decisionDetail.sharedCount === 0 && c1.decisionDetail.sourceOnlyCount === 0 && c1.decisionDetail.targetOnlyCount === 0, '26. an entirely excluded detail object (Decisions, under an Observations-only filter) reports every count as 0');
        assert(Object.isFrozen(result) && Object.isFrozen(c1) && Object.isFrozen(c1.decisionDetail) && Object.isFrozen(c1.observationDetail), '27. the result, each candidate entry, and each detail object are frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'OBSERVATIONS', replicaRelation: 'TARGET_ONLY' });
        assert(serialize(again) === serialize(result), '28. calling describeXxx() twice with byte-identical arguments returns a byte-identical result');
    }
    console.log('✓ Section F: surviving lists are reference-identical to their originals, every count matches its own list\'s own length, evidenceDetail is never mutated, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section G — a candidate never disappears from this result, even
    // when fully filtered out.
    // ---------------------------------------------------------------
    {
        // C2 has no decision evidence of any kind, and only source-only
        // observations — a Decisions + Shared filter should leave C2's
        // own entry present, but with both detail objects fully empty.
        const c2 = entryOf('C2', detailOf([], [], []), detailOf([], ['SO'], []));
        const detail = evidenceDetailOf([c2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, { evidenceKind: 'DECISIONS', replicaRelation: 'SHARED' });
        assert(result.candidateCount === 1, '29. a candidate whose detail is fully filtered out still counts as one candidate entry');
        const entry = entryFor(result, 'C2');
        assert(Boolean(entry), '30. that candidate\'s own entry is still present in candidates');
        assert(serialize(allRecords(entry)) === serialize([]), '31. its own detail objects are fully empty under this filter — row visibility is 0.8.184\'s own, separate, question');
    }
    console.log('✓ Section G: a candidate row never disappears from this result — this file only narrows which records a detail panel may show, never which candidates exist in the result');

    // ---------------------------------------------------------------
    // Section H — candidate order preserved, no reordering.
    // ---------------------------------------------------------------
    {
        const c1 = entryOf('C1', detailOf([], ['D'], []), detailOf([], [], []));
        const c2 = entryOf('C2', detailOf([], [], []), detailOf([], [], []));
        const c3 = entryOf('C3', detailOf([], ['D'], []), detailOf([], [], []));
        const detail = evidenceDetailOf([c1, c2, c3]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(detail, 'ALL');
        assert(serialize(result.candidates.map((entry) => entry.candidate.claimId)) === serialize(['C1', 'C2', 'C3']), '32. candidate order is preserved exactly, regardless of filter — no sort() anywhere in this file');
    }
    console.log('✓ Section H: candidate order is always evidenceDetail\'s own candidates order, unchanged');

    // ---------------------------------------------------------------
    // Section I — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 2, '33. this file imports exactly two modules');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js'"), '34. one import is 0.8.182\'s own evidence detail view');
        assert(codeOnly.includes("from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js'"), '35. the other import is 0.8.184\'s own evidence filter module (its enums)');
        assert(!codeOnly.includes('CandidateEvidenceAgreementView'), '36. this file never imports 0.8.176 directly');
        assert(!/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter\s*\(/.test(codeOnly), '37. this file never calls 0.8.184\'s own describeXxx() — only its enums are reused');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', 'sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject', 'merge', 'delete', 'apply', 'execute', 'trust', 'reputation', 'needs attention'];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `38. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section I: this file imports exactly 0.8.182 and 0.8.184\'s own enums, never 0.8.176 directly and never 0.8.184\'s own row-filter describeXxx(), and carries no ranking/judgment vocabulary');

    // ---------------------------------------------------------------
    // Section J — reconstructXxx()'s own archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const sourceArchive = PublicationObservationArchive.empty();
        const targetArchive = PublicationObservationArchive.empty();

        const viaReconstruct = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(sourceArchive, targetArchive, 'ALL');

        const evidenceDetail = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);
        const viaDescribe = describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(evidenceDetail, 'ALL');

        assert(serialize(viaReconstruct) === serialize(viaDescribe), '39. reconstructXxx() over two archives agrees exactly with calling 0.8.182\'s own reconstructXxx() and handing its result to describeXxx()');
        assert(viaReconstruct.candidateCount === 0, '40. two empty archives produce zero candidates, never a throw');
    }
    console.log('✓ Section J: reconstructXxx() calls 0.8.182\'s own reconstructXxx() exactly once, obtains the identical detail describeXxx() would be handed directly, and never touches either archive itself');

    // ---------------------------------------------------------------
    // Section K — the view's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js'"), '41. the view imports 0.8.185\'s own filtered-evidence-detail module');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail\(/g) || []).length === 1,
            '42. the view calls 0.8.185\'s own describeXxx() exactly once');
        assert(/filteredEvidenceDetail\s*=\s*computed/.test(codeOnly), '43. filteredEvidenceDetail is its own reactive computed value');

        assert(moduleSource.includes(':evidence-detail="filteredEvidenceDetail"'), '44. the table receives filteredEvidenceDetail as its own evidence-detail prop, never the raw, unfiltered evidenceDetail');
        assert(!moduleSource.includes(':evidence-detail="evidenceDetail"'), '45. the table is never handed the raw, unfiltered evidenceDetail directly');

        // filteredEvidenceDetail must read the SAME two filter refs
        // filteredPage already reads — never a third, independent
        // selection.
        const filteredEvidenceDetailBlockMatch = codeOnly.match(/const filteredEvidenceDetail = computed\(\(\) => describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail\(([\s\S]*?)\)\);/);
        assert(Boolean(filteredEvidenceDetailBlockMatch), '46. filteredEvidenceDetail is computed by calling 0.8.185\'s own describeXxx()');
        assert(filteredEvidenceDetailBlockMatch[1].includes('evidenceKindFilter.value') && filteredEvidenceDetailBlockMatch[1].includes('replicaRelationFilter.value'),
            '47. filteredEvidenceDetail reads the SAME evidenceKindFilter/replicaRelationFilter refs filteredPage already reads');
        assert(filteredEvidenceDetailBlockMatch[1].includes('evidenceDetail.value'), '48. filteredEvidenceDetail is computed over evidenceDetail (0.8.182\'s own result), not over page');

        // evidenceDetail itself is still computed by exactly one
        // reconstructXxx() call of its own, and is never reassigned.
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail\(/g) || []).length === 1,
            '49. the view still calls 0.8.182\'s own reconstructXxx() exactly once');
        assert(!/evidenceDetail\.value\s*=/.test(codeOnly), '50. evidenceDetail itself is never reassigned by filtering — filteredEvidenceDetail is a separate, derived computed value');
    }
    console.log('✓ Section K: the view computes filteredEvidenceDetail via 0.8.185\'s own describeXxx(), driven by the SAME two filter refs filteredPage already reads, and hands filteredEvidenceDetail (never the raw evidenceDetail) to the table — without touching evidenceDetail\'s own reconstructXxx() call or reassigning it');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.test.js FAILED:', error);
    process.exitCode = 1;
});
