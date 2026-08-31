import {
    buildDecisionEntries,
    buildObservationEntries,
    default as ReconciliationCandidateEvidenceDetailPanel
} from '../ui/components/ReconciliationCandidateEvidenceDetailPanel.js';
import {
    buildLeaderboardRows,
    default as ReconciliationCandidateLeaderboardTable
} from '../ui/components/ReconciliationCandidateLeaderboardTable.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.182 — Reconciliation Candidate Evidence Detail View (UI layer).
//
// Section A: buildDecisionEntries()/buildObservationEntries() — the detail
//            panel's own pure field-mapping helpers, malformed/absent
//            tolerance
// Section B: ReconciliationCandidateEvidenceDetailPanel's own computed
//            properties, malformed/absent detail prop tolerance
// Section C: FLAGSHIP — C1's shared decision + source-only decision, and
//            shared/source-only/target-only observations (each against a
//            distinct plan), carried through the real archive-backed
//            pipeline into the table's own candidate->detail lookup, then
//            into the panel's own rendered entries
// Section D: ReconciliationCandidateLeaderboardTable's own new wiring —
//            evidenceDetail prop, genuinePageRows/detailByCandidateKey
//            computed, candidateKeyForIndex/isExpanded/toggleExpanded/
//            detailFor methods, template carries the Inspect Evidence
//            button and the detail panel, still imports nothing from
//            application/
// Section E: ReconciliationCandidateLeaderboardView's own new wiring —
//            calls 0.8.182's own reconstructXxx() exactly once, over the
//            SAME two archives 0.8.179's own reconstructXxx() already
//            reads for `page`
// Section F: no ranking/judgment vocabulary anywhere in the new UI code;
//            no mutation of either archive through the extended pipeline

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

function planNaming({ claims = [], snapshots = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze([]),
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
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const OBS_T2 = new Date('2026-08-31T12:05:00Z');
const OBS_T3 = new Date('2026-08-31T12:10:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });

// The milestone's own flagship scenario:
//   C1  shared decision D1, source-only decision D2
//   C1  shared observation O1 (Plan P1), source-only observation O2
//       (Plan P2), target-only observation O3 (Plan P3)
function buildFlagshipArchives() {
    const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
    const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
    const sourceDecisionHistory = appendDecisions([D1, D2]);
    const targetDecisionHistory = appendDecisions([D1]);

    const P1 = planNaming({ claims: ['Claim-1'] });
    const P2 = planNaming({ claims: ['Claim-1', 'Claim-2'] });
    const P3 = planNaming({ claims: ['Claim-1'], snapshots: [9] });
    const O1 = observe(D1, P1, OBS_T1);
    const O2 = observe(D1, P2, OBS_T2);
    const O3 = observe(D1, P3, OBS_T3);

    const sourceObservationHistory = appendObservations([O1, O2]);
    const targetObservationHistory = appendObservations([O1, O3]);

    const sourceArchive = new PublicationObservationArchive({
        reconciliationDecisionRecords: sourceDecisionHistory,
        revalidationObservationRecords: sourceObservationHistory
    });
    const targetArchive = new PublicationObservationArchive({
        reconciliationDecisionRecords: targetDecisionHistory,
        revalidationObservationRecords: targetObservationHistory
    });

    return { sourceArchive, targetArchive };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — buildDecisionEntries()/buildObservationEntries().
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-array', 42, {}]) {
            assert(buildDecisionEntries(malformed).length === 0, `1. malformed decision records (${serialize(malformed)}) degrade to an empty entries array`);
            assert(buildObservationEntries(malformed).length === 0, `2. malformed observation records (${serialize(malformed)}) degrade to an empty entries array`);
        }

        const decisionEntries = buildDecisionEntries([
            { decided: true, candidate: C1, decision: 'OBSERVE', decidedAt: '2026-08-31T06:00:00.000Z' }
        ]);
        assert(decisionEntries.length === 1 && decisionEntries[0].disposition === 'OBSERVE' && decisionEntries[0].decidedAt === '2026-08-31T06:00:00.000Z', '3. a genuine decision record maps to its own disposition/decidedAt');

        const observationEntries = buildObservationEntries([
            {
                candidate: C1,
                decision: { decided: true, candidate: C1, decision: 'DEFER', decidedAt: '2026-08-31T06:03:00.000Z' },
                planIdentity: { algorithm: 'SHA-256', planFingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567', candidateCount: 1 },
                candidatePresent: true,
                candidateType: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT',
                candidateMatchesPlan: false,
                observedAt: '2026-08-31T12:00:00.000Z'
            }
        ]);
        assert(observationEntries.length === 1, '4. a genuine observation record maps to exactly one entry');
        assert(observationEntries[0].disposition === 'DEFER', '5. disposition is read off the embedded decision record\'s own disposition, not the observation\'s own top level');
        assert(observationEntries[0].observedAt === '2026-08-31T12:00:00.000Z', '6. observedAt is forwarded unchanged');
        assert(observationEntries[0].planFingerprint === 'abcdef012345…', '7. planFingerprint is shortened for display, from its own genuine value');
        assert(observationEntries[0].candidatePresent === 'yes', '8. candidatePresent renders as a plain "yes"/"no", never a verdict');
        assert(observationEntries[0].candidateMatchesPlan === 'no', '9. candidateMatchesPlan renders as a plain "yes"/"no", never "stale"/"invalid"/"needs attention"');

        const malformedObservation = buildObservationEntries([{ candidate: C1 }]);
        assert(malformedObservation.length === 1 && malformedObservation[0].disposition === 'UNKNOWN' && malformedObservation[0].planFingerprint === 'unknown plan', '10. an observation record missing decision/planIdentity degrades those two fields gracefully rather than throwing');
    }
    console.log('✓ Section A: buildDecisionEntries()/buildObservationEntries() map genuine records to display entries and degrade malformed/absent input to an empty list rather than throwing');

    // ---------------------------------------------------------------
    // Section B — ReconciliationCandidateEvidenceDetailPanel's own
    // computed properties.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}]) {
            const ctx = { detail: malformed };
            assert(ReconciliationCandidateEvidenceDetailPanel.computed.decisionDetail.call(ctx) === null, `11. malformed detail (${serialize(malformed)}) degrades decisionDetail to null`);
            assert(ReconciliationCandidateEvidenceDetailPanel.computed.observationDetail.call(ctx) === null, `12. malformed detail (${serialize(malformed)}) degrades observationDetail to null`);
        }

        const genuineDetail = {
            decisionDetail: {
                sharedCount: 1, sourceOnlyCount: 1, targetOnlyCount: 0,
                shared: [{ decided: true, candidate: C1, decision: 'OBSERVE', decidedAt: '2026-08-31T06:00:00.000Z' }],
                sourceOnly: [{ decided: true, candidate: C1, decision: 'DEFER', decidedAt: '2026-08-31T06:03:00.000Z' }],
                targetOnly: []
            },
            observationDetail: {
                sharedCount: 0, sourceOnlyCount: 0, targetOnlyCount: 0,
                shared: [], sourceOnly: [], targetOnly: []
            }
        };
        const ctx = { detail: genuineDetail };
        assert(ReconciliationCandidateEvidenceDetailPanel.computed.decisionDetail.call(ctx) === genuineDetail.decisionDetail, '13. a genuine detail prop\'s own decisionDetail is exposed unchanged');
        const decisionShared = ReconciliationCandidateEvidenceDetailPanel.computed.decisionShared.call({
            decisionDetail: genuineDetail.decisionDetail
        });
        assert(decisionShared.length === 1 && decisionShared[0].disposition === 'OBSERVE', '14. decisionShared computed maps decisionDetail.shared through buildDecisionEntries()');
    }
    console.log('✓ Section B: ReconciliationCandidateEvidenceDetailPanel\'s own computed properties degrade a malformed/absent detail prop to null/empty rather than throwing, and expose a genuine detail\'s own fields');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: real archives -> 0.8.176 -> 0.8.182 evidence
    // detail -> the table's own candidate->detail lookup -> the panel's
    // own rendered entries.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive } = buildFlagshipArchives();

        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);
        const evidenceDetail = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);

        assert(page.rowCount === 1, '15. FLAGSHIP — the table shows exactly one row for C1');
        assert(evidenceDetail.candidateCount === 1, '16. FLAGSHIP — the detail result carries exactly one candidate entry');

        // The table's own candidate->detail matching, exercised exactly as
        // the component itself would exercise it.
        const tableCtx = { page, evidenceDetail, expandedKeys: {} };
        const genuinePageRows = ReconciliationCandidateLeaderboardTable.computed.genuinePageRows.call(tableCtx);
        const detailByCandidateKey = ReconciliationCandidateLeaderboardTable.computed.detailByCandidateKey.call(tableCtx);
        tableCtx.genuinePageRows = genuinePageRows;
        tableCtx.detailByCandidateKey = detailByCandidateKey;

        const candidateKey = ReconciliationCandidateLeaderboardTable.methods.candidateKeyForIndex.call(tableCtx, 0);
        const detailEntry = ReconciliationCandidateLeaderboardTable.methods.detailFor.call(tableCtx, candidateKey);
        assert(detailEntry !== null, '17. FLAGSHIP — the table finds C1\'s own detail entry by candidate identity');

        // Table's own display counts (0.8.180's own path) and the detail
        // entry's own counts (0.8.182's own path) — same domain result.
        const rows = buildLeaderboardRows(page);
        assert(rows[0].decisionShared === detailEntry.decisionDetail.sharedCount, '18. FLAGSHIP — table decisionShared count matches detail\'s own sharedCount, from the identical 0.8.176 result');
        assert(rows[0].decisionSourceOnly === detailEntry.decisionDetail.sourceOnlyCount, '19. FLAGSHIP — table decisionSourceOnly count matches detail\'s own sourceOnlyCount');
        assert(rows[0].observationShared === detailEntry.observationDetail.sharedCount, '20. FLAGSHIP — table observationShared count matches detail\'s own sharedCount');
        assert(rows[0].observationSourceOnly === detailEntry.observationDetail.sourceOnlyCount, '21. FLAGSHIP — table observationSourceOnly count matches detail\'s own sourceOnlyCount');
        assert(rows[0].observationTargetOnly === detailEntry.observationDetail.targetOnlyCount, '22. FLAGSHIP — table observationTargetOnly count matches detail\'s own targetOnlyCount');

        // The panel's own rendered entries — what a reader would actually
        // see once the row is expanded.
        const panelCtx = { detail: detailEntry };
        const decisionSharedEntries = ReconciliationCandidateEvidenceDetailPanel.computed.decisionShared.call({ decisionDetail: ReconciliationCandidateEvidenceDetailPanel.computed.decisionDetail.call(panelCtx) });
        const decisionSourceOnlyEntries = ReconciliationCandidateEvidenceDetailPanel.computed.decisionSourceOnly.call({ decisionDetail: ReconciliationCandidateEvidenceDetailPanel.computed.decisionDetail.call(panelCtx) });
        const observationSharedEntries = ReconciliationCandidateEvidenceDetailPanel.computed.observationShared.call({ observationDetail: ReconciliationCandidateEvidenceDetailPanel.computed.observationDetail.call(panelCtx) });
        const observationSourceOnlyEntries = ReconciliationCandidateEvidenceDetailPanel.computed.observationSourceOnly.call({ observationDetail: ReconciliationCandidateEvidenceDetailPanel.computed.observationDetail.call(panelCtx) });
        const observationTargetOnlyEntries = ReconciliationCandidateEvidenceDetailPanel.computed.observationTargetOnly.call({ observationDetail: ReconciliationCandidateEvidenceDetailPanel.computed.observationDetail.call(panelCtx) });

        assert(decisionSharedEntries.length === 1 && decisionSharedEntries[0].disposition === 'OBSERVE', '23. FLAGSHIP — the panel\'s own decisionShared entry is D1 (OBSERVE)');
        assert(decisionSourceOnlyEntries.length === 1 && decisionSourceOnlyEntries[0].disposition === 'DEFER', '24. FLAGSHIP — the panel\'s own decisionSourceOnly entry is D2 (DEFER)');
        assert(observationSharedEntries.length === 1, '25. FLAGSHIP — the panel\'s own observationShared entry is O1');
        assert(observationSourceOnlyEntries.length === 1, '26. FLAGSHIP — the panel\'s own observationSourceOnly entry is O2');
        assert(observationTargetOnlyEntries.length === 1, '27. FLAGSHIP — the panel\'s own observationTargetOnly entry is O3');

        // Three distinct plans render three distinct (shortened)
        // fingerprints — planFingerprint survives all the way to the panel.
        const fingerprints = new Set([
            observationSharedEntries[0].planFingerprint,
            observationSourceOnlyEntries[0].planFingerprint,
            observationTargetOnlyEntries[0].planFingerprint
        ]);
        assert(fingerprints.size === 3, '28. FLAGSHIP — the three observations\' own planFingerprint values remain genuinely distinct all the way to the rendered panel');

        // isExpanded()/toggleExpanded() — the row's own local UI state.
        assert(ReconciliationCandidateLeaderboardTable.methods.isExpanded.call(tableCtx, candidateKey) === false, '29. a row starts collapsed');
        ReconciliationCandidateLeaderboardTable.methods.toggleExpanded.call(tableCtx, candidateKey);
        assert(ReconciliationCandidateLeaderboardTable.methods.isExpanded.call(tableCtx, candidateKey) === true, '30. toggleExpanded() opens the row');
        ReconciliationCandidateLeaderboardTable.methods.toggleExpanded.call(tableCtx, candidateKey);
        assert(ReconciliationCandidateLeaderboardTable.methods.isExpanded.call(tableCtx, candidateKey) === false, '31. toggling again closes the row');
    }
    console.log('✓ Section C: FLAGSHIP — C1\'s shared/source-only decisions and shared/source-only/target-only observations (each against a distinct plan) reach the table\'s own candidate->detail lookup and the panel\'s own rendered entries, counts matching the identical domain result, expand/collapse toggling correctly');

    // ---------------------------------------------------------------
    // Section D — ReconciliationCandidateLeaderboardTable's own new
    // wiring.
    // ---------------------------------------------------------------
    {
        assert(ReconciliationCandidateLeaderboardTable.props.evidenceDetail.default === null, '32. the evidenceDetail prop defaults to null');
        assert(ReconciliationCandidateLeaderboardTable.components.ReconciliationCandidateEvidenceDetailPanel !== undefined, '33. the table registers the detail panel as a child component');

        const emptyDetail = ReconciliationCandidateLeaderboardTable.computed.detailByCandidateKey.call({ evidenceDetail: null });
        assert(emptyDetail instanceof Map && emptyDetail.size === 0, '34. a null evidenceDetail degrades detailByCandidateKey to an empty Map');
        const emptyPageRows = ReconciliationCandidateLeaderboardTable.computed.genuinePageRows.call({ page: null });
        assert(Array.isArray(emptyPageRows) && emptyPageRows.length === 0, '35. a null page degrades genuinePageRows to an empty array');
        const missingDetail = ReconciliationCandidateLeaderboardTable.methods.detailFor.call({ detailByCandidateKey: new Map() }, 'SOME_KEY');
        assert(missingDetail === null, '36. detailFor() returns null, never throws, for a candidate key with no matching detail entry');

        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/components/ReconciliationCandidateLeaderboardTable.js', import.meta.url), 'utf8'
        );
        assert(moduleSource.includes("Inspect Evidence"), '37. the template carries the Inspect Evidence button copy');
        assert(moduleSource.includes('<ReconciliationCandidateEvidenceDetailPanel'), '38. the template renders the detail panel component');
        assert(!moduleSource.includes("from '../../application/"), '39. the table still imports NOTHING from application/ after 0.8.182 — evidenceDetail arrives only as a prop');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['rank', 'score', 'winner', 'confidence', '.sort(', 'inconsistent', 'authoritative', 'resolved', 'conflicting', 'stale', 'invalid', 'needs attention'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `40. the table's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section D: ReconciliationCandidateLeaderboardTable\'s own new evidenceDetail prop/computed/methods degrade malformed input rather than throwing, the template carries the Inspect Evidence button and the detail panel, and the component still imports nothing from application/');

    // ---------------------------------------------------------------
    // Section E — ReconciliationCandidateLeaderboardView's own new
    // wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail\(/g) || []).length === 1,
            '41. the view calls 0.8.182\'s own reconstructXxx() exactly once');
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\(/g) || []).length === 1,
            '42. the view still calls 0.8.179\'s own reconstructXxx() exactly once, unchanged');

        // Both calls read the identical archive pair — never a third
        // archive of any kind.
        const evidenceDetailCallLine = codeOnly.split('\n').find((line) => line.includes('reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail('));
        const pageCallLine = codeOnly.split('\n').find((line) => line.includes('reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage('));
        assert(evidenceDetailCallLine.includes('sourceArchive') && evidenceDetailCallLine.includes('targetArchive.value'), '43. 0.8.182\'s own reconstructXxx() is called over sourceArchive/targetArchive.value');
        assert(pageCallLine.includes('sourceArchive') && pageCallLine.includes('targetArchive.value'), '44. 0.8.179\'s own reconstructXxx() is called over the identical sourceArchive/targetArchive.value');

        assert(moduleSource.includes(':evidence-detail="evidenceDetail"'), '45. the view hands evidenceDetail down to the table as a prop');

        const importedModules = [...moduleSource.matchAll(/^import\s[\s\S]*?from '([^']+)';/gm)].map((match) => match[1]);
        assert(importedModules.some((m) => m.endsWith('PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js')), '46. imports 0.8.182\'s own evidence detail module');
        assert(!importedModules.some((m) => m.toLowerCase().includes('evidenceagreementview') || m.toLowerCase().includes('leaderboardreadmodel') || m.toLowerCase().includes('leaderboardview.js')),
            '47. the view never imports 0.8.176/0.8.177/0.8.178 directly — 0.8.179 and 0.8.182 remain the only two projection seams it touches');
    }
    console.log('✓ Section E: ReconciliationCandidateLeaderboardView calls 0.8.182\'s own reconstructXxx() exactly once, over the identical archive pair 0.8.179\'s own reconstructXxx() already reads, and hands the result to the table as a prop');

    // ---------------------------------------------------------------
    // Section F — no ranking/judgment vocabulary; no mutation.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive } = buildFlagshipArchives();
        const beforeSource = serialize(sourceArchive.toJSON());
        const beforeTarget = serialize(targetArchive.toJSON());

        const evidenceDetail = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);
        const again = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);

        assert(serialize(sourceArchive.toJSON()) === beforeSource, '48. sourceArchive is never mutated by the extended UI pipeline');
        assert(serialize(targetArchive.toJSON()) === beforeTarget, '49. targetArchive is never mutated by the extended UI pipeline');
        assert(serialize(evidenceDetail) === serialize(again), '50. reconstructing evidenceDetail twice over byte-identical archives is deterministic');

        const forbidden = ['conflict', 'conflicting', 'stale', 'resolved', 'correct', 'incorrect', 'winner', 'rank', 'score', 'confidence', 'status', 'preferred', 'valid', 'needs attention'];
        const allVisibleText = serialize(evidenceDetail).toLowerCase();
        for (const term of forbidden) {
            assert(!allVisibleText.includes(term), `51. the evidence detail result never carries judgment/ranking vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section F: no judgment/ranking vocabulary anywhere in the evidence detail result, and neither archive is ever mutated by the extended pipeline');

    console.log('\nAll ReconciliationCandidateEvidenceDetailUI tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateEvidenceDetailUI.test.js FAILED:', error);
    process.exitCode = 1;
});
