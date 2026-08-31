import {
    describeCandidateLabel,
    buildLeaderboardRows,
    default as ReconciliationCandidateLeaderboardTable
} from '../ui/components/ReconciliationCandidateLeaderboardTable.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.180 — Reconciliation Candidate Leaderboard UI Integration.
//
// Section A: describeCandidateLabel() — the three candidate shapes 0.8.144
//            established, plus malformed/unknown input
// Section B: buildLeaderboardRows() — malformed/absent page tolerance,
//            frozen rows, order preservation, no invented fields
// Section C: FLAGSHIP — the identical asymmetric two-archive, three-
//            candidate scenario tests/
//            PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.test.js
//            already exercises, carried one layer further: real archive ->
//            0.8.176 -> 0.8.177 -> 0.8.178 -> 0.8.179 -> 0.8.180's own
//            buildLeaderboardRows() -> the exact numbers a reader would
//            see on screen, proven equal to the domain fact at every step
// Section D: ReconciliationCandidateLeaderboardTable's own computed
//            properties (rows/isEmpty/rowCount) and a template-source
//            introspection proving the template interpolates
//            buildLeaderboardRows()'s own field names verbatim, with no
//            extra arithmetic, sort, or ranking vocabulary anywhere in the
//            file
// Section E: ReconciliationCandidateLeaderboardView's own wiring —
//            imports exactly what it needs, calls 0.8.179's own
//            reconstructXxx() exactly once, target archive is honestly
//            empty, never a fabricated peer comparison
// Section F: the route is registered in ui/router/index.js
// Section G: no mutation of either archive through the full pipeline;
//            determinism

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

// The FLAGSHIP scenario — byte-identical to 0.8.179's own — carried one
// layer further, into this milestone's own rendering:
//
//   C1  decisions: shared + source-only        observations: shared + target-only
//   C2  decisions: shared (only)                observations: source-only (only)
//   C3  decisions: target-only (only)            observations: shared (only)
function buildFlagshipArchives() {
    const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
    const D1a = genuineDecisionRecord(C1, 'DEFER', T2);
    const D2 = genuineDecisionRecord(C2, 'OBSERVE', T3);
    const D3 = genuineDecisionRecord(C3, 'OBSERVE', T4);

    const sourceDecisionHistory = appendDecisions([D1, D1a, D2]);
    const targetDecisionHistory = appendDecisions([D1, D2, D3]);

    const plan = planNaming({ claims: ['Claim-1', 'Claim-2'], snapshots: [3] });

    const OA1 = observe(D1, plan, OBS_T1);
    const OA2 = observe(D1, plan, OBS_T2);
    const O2 = observe(D2, plan, OBS_T3);
    const O3 = observe(D3, plan, OBS_T4);

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

    return { sourceArchive, targetArchive, sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — describeCandidateLabel().
    // ---------------------------------------------------------------
    {
        assert(describeCandidateLabel({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' }) === 'Claim Claim-1 (no corresponding Snapshot)',
            '1. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT decodes to a readable label naming its claimId');
        assert(describeCandidateLabel({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 }) === 'Snapshot #3 (no corresponding Claim)',
            '2. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM decodes to a readable label naming its snapshotIndex');
        assert(describeCandidateLabel({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'Claim-9', snapshotIndex: 7 }) === 'Claim Claim-9 ↔ Snapshot #7',
            '3. DIVERGENT_CORRESPONDENCE decodes to a readable label naming both sides');
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { type: 'SOMETHING_ELSE' }]) {
            assert(describeCandidateLabel(malformed) === 'Unknown candidate', `4. malformed/unrecognized candidate (${serialize(malformed)}) degrades to a label, never throws`);
        }
    }
    console.log('✓ Section A: describeCandidateLabel() decodes all three known candidate shapes, and degrades malformed/unrecognized input rather than throwing');

    // ---------------------------------------------------------------
    // Section B — buildLeaderboardRows().
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { rows: 'not-an-array' }, { rows: null }]) {
            const rows = buildLeaderboardRows(malformed);
            assert(Array.isArray(rows) && rows.length === 0, `5. malformed page (${serialize(malformed)}) degrades to an empty rows array, never throws`);
        }

        const page = Object.freeze({
            isEmpty: false,
            rowCount: 2,
            rows: Object.freeze([
                Object.freeze({ candidate: C1, decisionEvidence: { sharedCount: 3, sourceOnlyCount: 1, targetOnlyCount: 0 }, observationEvidence: { sharedCount: 0, sourceOnlyCount: 0, targetOnlyCount: 2 } }),
                Object.freeze({ candidate: C3, decisionEvidence: { sharedCount: 0, sourceOnlyCount: 0, targetOnlyCount: 1 }, observationEvidence: { sharedCount: 1, sourceOnlyCount: 0, targetOnlyCount: 0 } })
            ])
        });
        const rows = buildLeaderboardRows(page);
        assert(rows.length === 2, '6. every genuine row produces exactly one display row');
        assert(rows[0].candidateLabel === 'Claim Claim-1 (no corresponding Snapshot)', '7. row order preserved — C1 first');
        assert(rows[1].candidateLabel === 'Snapshot #3 (no corresponding Claim)', '8. row order preserved — C3 second');
        assert(rows[0].decisionShared === 3 && rows[0].decisionSourceOnly === 1 && rows[0].decisionTargetOnly === 0, '9. decision counts copied straight across, unchanged');
        assert(rows[0].observationShared === 0 && rows[0].observationSourceOnly === 0 && rows[0].observationTargetOnly === 2, '10. observation counts copied straight across, unchanged');
        assert(Object.isFrozen(rows[0]), '11. each display row is frozen');
        assert(Object.keys(rows[0]).sort().join(',') === 'candidateLabel,decisionShared,decisionSourceOnly,decisionTargetOnly,observationShared,observationSourceOnly,observationTargetOnly',
            '12. a display row carries exactly its seven documented fields — no invented field');

        // Non-finite/missing individual counts degrade to 0, mirroring
        // 0.8.178's own safeCount() one layer down.
        const malformedRow = Object.freeze({
            isEmpty: false, rowCount: 1,
            rows: [{ candidate: C2, decisionEvidence: { sharedCount: NaN, sourceOnlyCount: undefined, targetOnlyCount: 'x' }, observationEvidence: {} }]
        });
        const degraded = buildLeaderboardRows(malformedRow);
        assert(degraded[0].decisionShared === 0 && degraded[0].decisionSourceOnly === 0 && degraded[0].decisionTargetOnly === 0, '13. non-finite/missing decision counts degrade to 0, never NaN/undefined');
        assert(degraded[0].observationShared === 0 && degraded[0].observationSourceOnly === 0 && degraded[0].observationTargetOnly === 0, '14. a missing observationEvidence object degrades every column to 0');
    }
    console.log('✓ Section B: buildLeaderboardRows() degrades malformed/absent input to an empty array, preserves row order, copies counts unchanged, and never invents a field');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: domain fact -> 0.8.176 -> ... -> 0.8.179 ->
    // 0.8.180's own buildLeaderboardRows() -> the numbers a reader sees.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive, sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory } = buildFlagshipArchives();
        const beforeSource = serialize(sourceArchive.toJSON());
        const beforeTarget = serialize(targetArchive.toJSON());

        // The independently-computed ground truth, exactly as 0.8.179's
        // own flagship test establishes it.
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );
        assert(evidenceAgreement.candidateCount === 3, '15. FLAGSHIP — 0.8.176 itself finds exactly three candidates');

        // The full archive-backed chain, through 0.8.179.
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);
        assert(page.rowCount === 3 && page.isEmpty === false, '16. FLAGSHIP — 0.8.179\'s own page carries exactly three rows');

        // 0.8.180's own rendering — what a reader would actually see.
        const rows = buildLeaderboardRows(page);
        assert(rows.length === 3, '17. FLAGSHIP — the rendered table carries exactly three rows');

        // Row order survives the entire chain, from 0.8.176's own
        // candidate order through to the rendered rows.
        const expectedOrder = evidenceAgreement.candidates.map((entry) => serialize(entry.candidate));
        const actualOrder = page.rows.map((row) => serialize(row.candidate));
        assert(serialize(expectedOrder) === serialize(actualOrder), '18. FLAGSHIP — page row order is 0.8.176\'s own candidate order, unchanged');

        function rowFor(candidate) {
            const index = page.rows.findIndex((row) => serialize(row.candidate) === serialize(candidate));
            assert(index !== -1, `FLAGSHIP setup — candidate ${serialize(candidate)} must appear in the page`);
            return rows[index];
        }

        const r1 = rowFor(C1);
        assert(r1.candidateLabel === 'Claim Claim-1 (no corresponding Snapshot)', '19. FLAGSHIP — C1 renders its own readable label');
        assert(r1.decisionShared === 1 && r1.decisionSourceOnly === 1 && r1.decisionTargetOnly === 0, '20. FLAGSHIP — C1 decision counts on screen: shared + source-only, no target-only');
        assert(r1.observationShared === 1 && r1.observationSourceOnly === 0 && r1.observationTargetOnly === 1, '21. FLAGSHIP — C1 observation counts on screen: shared + target-only, no source-only');

        const r2 = rowFor(C2);
        assert(r2.candidateLabel === 'Claim Claim-2 (no corresponding Snapshot)', '22. FLAGSHIP — C2 renders its own readable label');
        assert(r2.decisionShared === 1 && r2.decisionSourceOnly === 0 && r2.decisionTargetOnly === 0, '23. FLAGSHIP — C2 decision counts on screen: shared only');
        assert(r2.observationShared === 0 && r2.observationSourceOnly === 1 && r2.observationTargetOnly === 0, '24. FLAGSHIP — C2 observation counts on screen: source-only only');

        const r3 = rowFor(C3);
        assert(r3.candidateLabel === 'Snapshot #3 (no corresponding Claim)', '25. FLAGSHIP — C3 renders its own readable label');
        assert(r3.decisionShared === 0 && r3.decisionSourceOnly === 0 && r3.decisionTargetOnly === 1, '26. FLAGSHIP — C3 decision counts on screen: target-only only');
        assert(r3.observationShared === 1 && r3.observationSourceOnly === 0 && r3.observationTargetOnly === 0, '27. FLAGSHIP — C3 observation counts on screen: shared only');

        // Every number on screen equals 0.8.176's own domain fact for the
        // same candidate, same dimension — exhaustively, not just the
        // three named checks above.
        for (const entry of evidenceAgreement.candidates) {
            const displayRow = rowFor(entry.candidate);
            assert(displayRow.decisionShared === entry.decisionAgreement.sharedDecisionCount, '28. on-screen decisionShared matches the domain fact exactly');
            assert(displayRow.decisionSourceOnly === entry.decisionAgreement.sourceOnlyDecisionCount, '29. on-screen decisionSourceOnly matches the domain fact exactly');
            assert(displayRow.decisionTargetOnly === entry.decisionAgreement.targetOnlyDecisionCount, '30. on-screen decisionTargetOnly matches the domain fact exactly');
            assert(displayRow.observationShared === entry.observationAgreement.sharedObservationCount, '31. on-screen observationShared matches the domain fact exactly');
            assert(displayRow.observationSourceOnly === entry.observationAgreement.sourceOnlyObservationCount, '32. on-screen observationSourceOnly matches the domain fact exactly');
            assert(displayRow.observationTargetOnly === entry.observationAgreement.targetOnlyObservationCount, '33. on-screen observationTargetOnly matches the domain fact exactly');
        }

        // No evidence lost merely for existing on only one branch.
        assert(r1.decisionSourceOnly === 1, '34. FLAGSHIP — C1\'s source-only decision is still visible on screen');
        assert(r1.observationTargetOnly === 1, '35. FLAGSHIP — C1\'s target-only observation is still visible on screen');
        assert(r2.observationSourceOnly === 1, '36. FLAGSHIP — C2\'s source-only observation is still visible on screen');
        assert(r3.decisionTargetOnly === 1, '37. FLAGSHIP — C3\'s target-only decision is still visible on screen');

        // No ranking vocabulary anywhere in what would actually render.
        const forbidden = ['conflict', 'conflicting', 'stale', 'resolved', 'correct', 'incorrect', 'winner', 'rank', 'score', 'confidence', 'status', 'preferred', 'valid'];
        const allVisibleText = serialize(rows).toLowerCase();
        for (const term of forbidden) {
            assert(!allVisibleText.includes(term), `38. FLAGSHIP — the rendered rows never carry judgment/ranking vocabulary ('${term}')`);
        }

        assert(serialize(sourceArchive.toJSON()) === beforeSource, '39. FLAGSHIP — sourceArchive is never mutated by rendering');
        assert(serialize(targetArchive.toJSON()) === beforeTarget, '40. FLAGSHIP — targetArchive is never mutated by rendering');
    }
    console.log('✓ Section C: FLAGSHIP — domain fact through 0.8.176 -> 0.8.177 -> 0.8.178 -> 0.8.179 -> 0.8.180\'s own rendering, every on-screen number and row order proven to match the domain fact exactly, no evidence lost, no ranking vocabulary, neither archive mutated');

    // ---------------------------------------------------------------
    // Section D — ReconciliationCandidateLeaderboardTable's own wiring.
    // ---------------------------------------------------------------
    {
        assert(ReconciliationCandidateLeaderboardTable.name === 'ReconciliationCandidateLeaderboardTable', '41. the component declares its own name');
        assert(ReconciliationCandidateLeaderboardTable.props.page.default === null, '42. the page prop defaults to null rather than being required — a caller with nothing yet still renders the empty state');

        const emptyRows = ReconciliationCandidateLeaderboardTable.computed.rows.call({ page: null });
        assert(Array.isArray(emptyRows) && emptyRows.length === 0, '43. computed rows() delegates to buildLeaderboardRows(), degrading a null page to []');
        assert(ReconciliationCandidateLeaderboardTable.computed.isEmpty.call({ page: null }) === true, '44. computed isEmpty() is true for a null page');
        assert(ReconciliationCandidateLeaderboardTable.computed.isEmpty.call({ page: { isEmpty: false } }) === false, '45. computed isEmpty() mirrors page.isEmpty for a genuine page');
        assert(ReconciliationCandidateLeaderboardTable.computed.rowCount.call({ page: null }) === 0, '46. computed rowCount() defaults to 0 for a null page');
        assert(ReconciliationCandidateLeaderboardTable.computed.rowCount.call({ page: { rowCount: 5 } }) === 5, '47. computed rowCount() reads page.rowCount straight through, unchanged');

        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/components/ReconciliationCandidateLeaderboardTable.js', import.meta.url), 'utf8'
        );
        const template = moduleSource.slice(moduleSource.indexOf('template: `'));
        for (const field of ['row.candidateLabel', 'row.decisionShared', 'row.decisionSourceOnly', 'row.decisionTargetOnly', 'row.observationShared', 'row.observationSourceOnly', 'row.observationTargetOnly']) {
            assert(template.includes(`{{ ${field} }}`), `48. the template interpolates buildLeaderboardRows()'s own field "${field}" verbatim`);
        }
        assert(!/\{\{[^}]*[+\-*/][^}]*\}\}/.test(template), '49. no interpolation in the template performs arithmetic on a row\'s own fields');
        assert(!template.includes('.sort('), '50. the template performs no sort() of its own');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['rank', 'score', 'winner', 'confidence', '.sort(', 'inconsistent', 'authoritative', 'resolved', 'conflicting'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `51. the component's own code never carries "${term}"`);
        }
        assert(!moduleSource.includes("from '../../application/"), '52. the component imports NOTHING from application/ — a pure projection renderer over its own page prop, never an archive');
    }
    console.log('✓ Section D: ReconciliationCandidateLeaderboardTable computes its rows/isEmpty/rowCount purely from the page prop, its template interpolates buildLeaderboardRows()\'s own fields verbatim with no arithmetic/sort, and it imports nothing from application/');

    // ---------------------------------------------------------------
    // Section E — ReconciliationCandidateLeaderboardView's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\(/g) || []).length === 1,
            '53. the view calls 0.8.179\'s own reconstructXxx() exactly once');
        assert(codeOnly.includes("PublicationObservationArchive.empty()"), '54. targetArchive is built from PublicationObservationArchive.empty() — an honest absence, never a fabricated stand-in');
        assert(!codeOnly.toLowerCase().includes('reconciliationcandidateevidenceagreement') && !codeOnly.toLowerCase().includes('leaderboardreadmodel') && !codeOnly.toLowerCase().includes('leaderboardview.js'),
            '55. the view never imports 0.8.176/0.8.177/0.8.178 directly — 0.8.179 is the only projection seam it touches');

        const importedModules = [...moduleSource.matchAll(/^import\s[\s\S]*?from '([^']+)';/gm)].map((match) => match[1]);
        assert(importedModules.some((m) => m.endsWith('PublicationObservationArchive.js')), '56. imports PublicationObservationArchive.js (to build the honestly-empty targetArchive)');
        assert(importedModules.some((m) => m.endsWith('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js')), '57. imports 0.8.179\'s own page module');
        assert(importedModules.some((m) => m.endsWith('ReconciliationCandidateLeaderboardTable.js')), '58. imports 0.8.180\'s own presentational table component');
        assert(importedModules.every((m) => m === 'vue' || m.endsWith('.js')), '59. every import resolves to a real module specifier');
    }
    console.log('✓ Section E: ReconciliationCandidateLeaderboardView calls 0.8.179\'s own reconstructXxx() exactly once, builds an honestly-empty targetArchive, and imports no projection beneath 0.8.179');

    // ---------------------------------------------------------------
    // Section F — the route is registered.
    // ---------------------------------------------------------------
    {
        const routerSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/router/index.js', import.meta.url), 'utf8'
        );
        assert(routerSource.includes("path: '/reconciliation-leaderboard'"), '60. the leaderboard route is registered in the app router');
        assert(routerSource.includes('ReconciliationCandidateLeaderboardView'), '61. the registered route points at ReconciliationCandidateLeaderboardView');
    }
    console.log('✓ Section F: the Reconciliation Candidate Leaderboard route is registered in ui/router/index.js');

    // ---------------------------------------------------------------
    // Section G — determinism, no mutation, across the whole pipeline.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive } = buildFlagshipArchives();
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);
        const before = serialize(page);

        const rowsA = buildLeaderboardRows(page);
        const rowsB = buildLeaderboardRows(page);
        assert(serialize(rowsA) === serialize(rowsB), '62. calling buildLeaderboardRows() twice with a byte-identical page returns a byte-identical result');
        assert(serialize(page) === before, '63. buildLeaderboardRows() never mutates the page it is handed');
        assert(Object.isFrozen(rowsA[0]), '64. every produced display row is frozen');
    }
    console.log('✓ Section G: buildLeaderboardRows() is deterministic and never mutates the page it renders');

    console.log('\nAll ReconciliationCandidateLeaderboardUI tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardUI.test.js FAILED:', error);
    process.exitCode = 1;
});
