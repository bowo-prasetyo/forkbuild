import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.179 — Archive-Backed Reconciliation Candidate Leaderboard Page.
//
// Section A: malformed/absent readModel via describeXxx() — empty page,
//            never throws (0.8.178's own tolerance, inherited)
// Section B: describeXxx() delegates to 0.8.178's own describeXxx() —
//            byte-identical result for the same readModel
// Section C: FLAGSHIP — two real archives, three candidates, each
//            exercising asymmetric decision/observation evidence; the full
//            9-point checklist this milestone was designed against
// Section D: reconstructXxx() over two empty archives, and over
//            null/undefined archives, degrades to the empty page
// Section E: no mutation of either supplied archive
// Section F: no mutation of a supplied readModel, frozen results,
//            determinism
// Section G: vocabulary/import boundary — imports exactly 0.8.177 and
//            0.8.178, and nothing beneath them

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

function appendDecisions(decisions) {
    let history = [];
    for (const decision of decisions) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
    }
    return history;
}

function planNaming({ claims = [], snapshots = [], divergent = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze(divergent.map(([claimId, snapshotIndex]) => Object.freeze({
            claimId,
            snapshotIndex,
            divergence: Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false })
        }))),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

function appendObservations(observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-31T06:00:00Z');
const T2 = new Date('2026-08-31T06:03:00Z');
const T3 = new Date('2026-08-31T06:07:00Z');
const T4 = new Date('2026-08-31T06:10:00Z');
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const OBS_T2 = new Date('2026-08-31T12:05:00Z');
const OBS_T3 = new Date('2026-08-31T12:10:00Z');
const OBS_T4 = new Date('2026-08-31T12:15:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });
const C3 = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });

function rowFor(page, candidate) {
    return page.rows.find((row) => serialize(row.candidate) === serialize(candidate));
}

// The FLAGSHIP scenario, exactly as this milestone was designed against:
//
//   C1  decisions:    shared + source-only        observations: shared + target-only
//   C2  decisions:    shared (only)                observations: source-only (only)
//   C3  decisions:    target-only (only)            observations: shared (only)
//
// Every candidate's own decision evidence and observation evidence are
// deliberately asymmetric to each other — proving `decisionEvidence` and
// `observationEvidence` are never merged, averaged, or allowed to leak
// into one another anywhere in the chain.
function buildFlagshipArchives() {
    const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);   // C1 — shared decision
    const D1a = genuineDecisionRecord(C1, 'DEFER', T2);    // C1 — source-only decision
    const D2 = genuineDecisionRecord(C2, 'OBSERVE', T3);   // C2 — shared decision (identical on both sides)
    const D3 = genuineDecisionRecord(C3, 'OBSERVE', T4);   // C3 — target-only decision

    const sourceDecisionHistory = appendDecisions([D1, D1a, D2]);
    const targetDecisionHistory = appendDecisions([D1, D2, D3]);

    const plan = planNaming({ claims: ['Claim-1', 'Claim-2'], snapshots: [3] });

    const OA1 = observe(D1, plan, OBS_T1);   // C1 — shared observation (built off the shared decision)
    const OA2 = observe(D1, plan, OBS_T2);   // C1 — target-only observation (same decision, different observedAt)
    const O2 = observe(D2, plan, OBS_T3);    // C2 — source-only observation
    const O3 = observe(D3, plan, OBS_T4);    // C3 — shared observation, even though D3 is a target-only decision

    const sourceObservationHistory = appendObservations([OA1, O2, O3]);
    const targetObservationHistory = appendObservations([OA1, OA2, O3]);

    const sourceArchive = new PublicationObservationArchive({
        reconciliationDecisionRecords: sourceDecisionHistory,
        revalidationObservationRecords: sourceObservationHistory
    });
    const targetArchive = new PublicationObservationArchive({
        reconciliationDecisionRecords: targetDecisionHistory,
        revalidationObservationRecords: targetObservationHistory
    });

    return {
        sourceArchive, targetArchive,
        sourceDecisionHistory, targetDecisionHistory,
        sourceObservationHistory, targetObservationHistory
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent readModel via describeXxx().
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { candidates: 'not-an-array' }, { candidates: null }]) {
            const page = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(malformed);
            assert(page.isEmpty === true, `1. malformed input (${serialize(malformed)}) reports isEmpty true`);
            assert(page.rowCount === 0, `2. malformed input (${serialize(malformed)}) reports rowCount 0`);
            assert(Array.isArray(page.rows) && page.rows.length === 0, `3. malformed input (${serialize(malformed)}) reports an empty rows array`);
            assert(Object.isFrozen(page) && Object.isFrozen(page.rows), `4. malformed input (${serialize(malformed)}) still returns a frozen, valid page`);
        }
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage().isEmpty === true, '5. calling with no argument defaults to an empty page, never throws');
    }
    console.log('✓ Section A: malformed/absent input degrades to a valid, empty page rather than throwing');

    // ---------------------------------------------------------------
    // Section B — describeXxx() delegates to 0.8.178's own describeXxx().
    // ---------------------------------------------------------------
    {
        const { sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory } = buildFlagshipArchives();
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        const page = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel);
        const directPage = (await import('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView.js'))
            .describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);
        assert(serialize(page) === serialize(directPage), '6. describeXxx() returns exactly 0.8.178\'s own result, unchanged');
    }
    console.log('✓ Section B: describeXxx() is a pure, one-call delegation to 0.8.178\'s own describeXxx()');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the full chain, over two real archives.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive, sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory } = buildFlagshipArchives();
        const beforeSource = serialize(sourceArchive.toJSON ? sourceArchive.toJSON() : sourceArchive);
        const beforeTarget = serialize(targetArchive.toJSON ? targetArchive.toJSON() : targetArchive);

        // 1. Both archives are read.
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);

        // 2. 0.8.176 produces the evidence agreement — computed independently
        //    here, directly from the same histories, as the chain's own
        //    ground truth.
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );
        assert(evidenceAgreement.candidateCount === 3, '7. FLAGSHIP — 0.8.176 itself finds exactly three candidates');

        // 3. 0.8.177 preserves the candidate evidence counts.
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);
        assert(readModel.candidateCount === 3, '8. FLAGSHIP — 0.8.177 preserves all three candidates');

        // 4. 0.8.178 produces the page rows.
        const expectedPage = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel);
        assert(serialize(page) === serialize(expectedPage), '9. FLAGSHIP — the archive-backed page agrees exactly with describe() over the equivalent read model, chained through 0.8.176 -> 0.8.177 -> 0.8.178');

        assert(page.isEmpty === false && page.rowCount === 3, '10. FLAGSHIP — exactly three rows, not empty');

        // 5. Candidate ordering survives the entire chain.
        const expectedOrder = evidenceAgreement.candidates.map((entry) => serialize(entry.candidate));
        const actualOrder = page.rows.map((row) => serialize(row.candidate));
        assert(serialize(expectedOrder) === serialize(actualOrder), '11. FLAGSHIP — row order is 0.8.176\'s own candidate order, unchanged end to end');

        // 6. Every displayed count equals the corresponding domain fact.
        const c1 = rowFor(page, C1);
        assert(c1 !== undefined, '12. FLAGSHIP — C1 appears exactly once');
        assert(c1.decisionEvidence.sharedCount === 1 && c1.decisionEvidence.sourceOnlyCount === 1 && c1.decisionEvidence.targetOnlyCount === 0, '13. FLAGSHIP — C1 decisions: shared + source-only, no target-only');
        assert(c1.observationEvidence.sharedCount === 1 && c1.observationEvidence.sourceOnlyCount === 0 && c1.observationEvidence.targetOnlyCount === 1, '14. FLAGSHIP — C1 observations: shared + target-only, no source-only');

        const c2 = rowFor(page, C2);
        assert(c2 !== undefined, '15. FLAGSHIP — C2 appears exactly once');
        assert(c2.decisionEvidence.sharedCount === 1 && c2.decisionEvidence.sourceOnlyCount === 0 && c2.decisionEvidence.targetOnlyCount === 0, '16. FLAGSHIP — C2 decisions: shared only');
        assert(c2.observationEvidence.sharedCount === 0 && c2.observationEvidence.sourceOnlyCount === 1 && c2.observationEvidence.targetOnlyCount === 0, '17. FLAGSHIP — C2 observations: source-only only');

        const c3 = rowFor(page, C3);
        assert(c3 !== undefined, '18. FLAGSHIP — C3 appears exactly once');
        assert(c3.decisionEvidence.sharedCount === 0 && c3.decisionEvidence.sourceOnlyCount === 0 && c3.decisionEvidence.targetOnlyCount === 1, '19. FLAGSHIP — C3 decisions: target-only only');
        assert(c3.observationEvidence.sharedCount === 1 && c3.observationEvidence.sourceOnlyCount === 0 && c3.observationEvidence.targetOnlyCount === 0, '20. FLAGSHIP — C3 observations: shared only');

        // Every displayed count equals 0.8.176's own count for the same
        // candidate, same dimension — not just the three flagship figures
        // above, checked exhaustively.
        for (const entry of evidenceAgreement.candidates) {
            const row = rowFor(page, entry.candidate);
            assert(row !== undefined, '21. every 0.8.176 candidate has a corresponding page row');
            assert(row.decisionEvidence.sharedCount === entry.decisionAgreement.sharedDecisionCount, '22. sharedCount matches sharedDecisionCount exactly');
            assert(row.decisionEvidence.sourceOnlyCount === entry.decisionAgreement.sourceOnlyDecisionCount, '23. sourceOnlyCount matches sourceOnlyDecisionCount exactly');
            assert(row.decisionEvidence.targetOnlyCount === entry.decisionAgreement.targetOnlyDecisionCount, '24. targetOnlyCount matches targetOnlyDecisionCount exactly');
            assert(row.observationEvidence.sharedCount === entry.observationAgreement.sharedObservationCount, '25. sharedCount matches sharedObservationCount exactly');
            assert(row.observationEvidence.sourceOnlyCount === entry.observationAgreement.sourceOnlyObservationCount, '26. sourceOnlyCount matches sourceOnlyObservationCount exactly');
            assert(row.observationEvidence.targetOnlyCount === entry.observationAgreement.targetOnlyObservationCount, '27. targetOnlyCount matches targetOnlyObservationCount exactly');
        }

        // 7. No ranking occurs.
        const forbidden = ['conflict', 'conflicting', 'stale', 'resolved', 'correct', 'incorrect', 'winner', 'rank', 'score', 'confidence', 'status', 'preferred', 'valid'];
        const allText = serialize(page).toLowerCase();
        for (const term of forbidden) {
            assert(!allText.includes(term), `28. FLAGSHIP — the page never carries judgment/ranking vocabulary ('${term}')`);
        }

        // 8. No evidence is lost because it exists only on one branch. C1's
        //    source-only decision and target-only observation, C2's
        //    source-only observation, and C3's target-only decision are all
        //    single-branch facts (no counterpart on the other side) and
        //    every one of them is still visible above (assertions 13-20) —
        //    none dropped merely for being exclusive to one archive.
        assert(c1.decisionEvidence.sourceOnlyCount === 1, '29. FLAGSHIP — C1\'s source-only decision survives the chain');
        assert(c1.observationEvidence.targetOnlyCount === 1, '30. FLAGSHIP — C1\'s target-only observation survives the chain');
        assert(c2.observationEvidence.sourceOnlyCount === 1, '31. FLAGSHIP — C2\'s source-only observation survives the chain');
        assert(c3.decisionEvidence.targetOnlyCount === 1, '32. FLAGSHIP — C3\'s target-only decision survives the chain');

        // 9. Neither archive is mutated.
        assert(serialize(sourceArchive.toJSON ? sourceArchive.toJSON() : sourceArchive) === beforeSource, '33. FLAGSHIP — sourceArchive is never mutated');
        assert(serialize(targetArchive.toJSON ? targetArchive.toJSON() : targetArchive) === beforeTarget, '34. FLAGSHIP — targetArchive is never mutated');
    }
    console.log('✓ Section C: FLAGSHIP — both archives read, chained through 0.8.176 -> 0.8.177 -> 0.8.178, candidate order and every count preserved exactly, no evidence lost to either exclusive branch, no ranking, neither archive mutated');

    // ---------------------------------------------------------------
    // Section D — reconstructXxx() over empty/invalid archives.
    // ---------------------------------------------------------------
    {
        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(
            describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(
                describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement([], [], [], [])
            )
        );

        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(
            PublicationObservationArchive.empty(), PublicationObservationArchive.empty()
        );
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '35. reconstruct() over two empty archives agrees exactly with the empty page');
        assert(emptyReconstructed.isEmpty === true && emptyReconstructed.rowCount === 0, '36. two empty archives produce an empty page');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '37. reconstruct() over invalid/missing archives degrades to the empty page, never a throw');
    }
    console.log('✓ Section D: reconstruct() over empty or invalid archives degrades to the empty page, never throws');

    // ---------------------------------------------------------------
    // Section E — no mutation of either supplied archive (isolated check,
    // independent of Section C's own end-to-end scenario).
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive } = buildFlagshipArchives();
        const sourceBefore = serialize(sourceArchive.reconciliationDecisionRecords) + serialize(sourceArchive.revalidationObservationRecords);
        const targetBefore = serialize(targetArchive.reconciliationDecisionRecords) + serialize(targetArchive.revalidationObservationRecords);

        reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);
        reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);

        assert(serialize(sourceArchive.reconciliationDecisionRecords) + serialize(sourceArchive.revalidationObservationRecords) === sourceBefore, '38. sourceArchive\'s own collections are byte-identical after two reconstructions');
        assert(serialize(targetArchive.reconciliationDecisionRecords) + serialize(targetArchive.revalidationObservationRecords) === targetBefore, '39. targetArchive\'s own collections are byte-identical after two reconstructions');
        assert(Object.isFrozen(sourceArchive) && Object.isFrozen(targetArchive), '40. both archives remain frozen instances throughout');
    }
    console.log('✓ Section E: reconstruct() never mutates either supplied archive, called once or repeatedly');

    // ---------------------------------------------------------------
    // Section F — no mutation of a supplied readModel, frozen results,
    // determinism.
    // ---------------------------------------------------------------
    {
        const { sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory } = buildFlagshipArchives();
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);
        const before = serialize(readModel);

        const page = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel);

        assert(serialize(readModel) === before, '41. the supplied readModel is never mutated');
        assert(Object.isFrozen(page), '42. the page is frozen');
        assert(Object.isFrozen(page.rows), '43. the rows array is frozen');
        assert(Object.isFrozen(page.rows[0]), '44. a row is frozen');
        assert(page.rows[0].candidate === readModel.candidates[0].candidate, '45. a row\'s own candidate is the ORIGINAL object, referenced rather than copied');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel);
        assert(serialize(again) === serialize(page), '46. calling describeXxx() twice with a byte-identical argument returns a byte-identical result');
    }
    console.log('✓ Section F: no mutation of the supplied read model, every returned object/array is frozen, candidate identity is preserved by reference, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section G — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'valid', 'preferred', 'status', 'confidence', 'sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject', 'merge', 'delete', 'apply', 'execute', 'trust', 'reputation'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `47. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 2, '48. this file imports from exactly two modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.js'), '49. one import is 0.8.177\'s own leaderboard read model');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView.js'), '50. the other import is 0.8.178\'s own leaderboard page view');

        const forbiddenModuleNames = [
            'evidenceagreementview', 'decisionagreementview', 'evolutionagreementview',
            'correspondenceview', 'evolutionview', 'evolutiondifferenceview',
            'evidencesummaryview', 'publicationobservationarchive.js',
            'candidateselection', 'revalidation', 'observationhistory.js',
            'observationdifference', 'exchange.js', 'synchronization.js'
        ];
        for (const term of forbiddenModuleNames) {
            assert(!codeOnly.includes(term), `51. this file never imports a module beneath 0.8.177/0.8.178 ("${term}")`);
        }
    }
    console.log('✓ Section G: this file\'s own code carries no ranking/judgment vocabulary, and imports exactly 0.8.177 and 0.8.178 — no path back into reconciliation logic beneath them');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.test.js FAILED:', error);
    process.exitCode = 1;
});
