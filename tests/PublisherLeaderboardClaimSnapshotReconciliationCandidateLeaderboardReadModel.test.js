import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.177 — Reconciliation Candidate Leaderboard Read Model.
//
// Section A: malformed/absent evidenceAgreement — empty, never throws
// Section B: a single, fully-shared candidate — field renaming fidelity
// Section C: FLAGSHIP — four candidates, each exercising one of the four
//            evidence combinations from this milestone's own design:
//              C1 — decision shared+exclusive,  observation shared+exclusive
//              C2 — decision shared only,       observation source-only
//              C3 — decision target-only,       observation shared only
//              C4 — decision source-only,       observation target-only
// Section D: every row's six counts always agree with 0.8.176's own counts,
//            for every candidate, not just the flagship's own four
// Section E: row order preserves 0.8.176's own candidate order, unchanged
// Section F: no evidence-record lists, and no aggregate fields, ever appear
// Section G: no mutation, frozen results, determinism, reference identity
// Section H: reconstruct()'s archive-reading boundary, calling 0.8.176
//            exactly once
// Section I: vocabulary/import boundary — no ranking vocabulary, imports
//            only 0.8.176

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

function evidenceAgreementFor(sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory) {
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
        sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
    );
}

const T1 = new Date('2026-08-31T06:00:00Z');
const T2 = new Date('2026-08-31T06:03:00Z');
const T3 = new Date('2026-08-31T06:07:00Z');
const T4 = new Date('2026-08-31T06:10:00Z');
const T5 = new Date('2026-08-31T06:14:00Z');
const T6 = new Date('2026-08-31T06:18:00Z');
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const OBS_T2 = new Date('2026-08-31T12:05:00Z');
const OBS_T3 = new Date('2026-08-31T12:10:00Z');
const OBS_T4 = new Date('2026-08-31T12:15:00Z');
const OBS_T5 = new Date('2026-08-31T12:20:00Z');
const OBS_T6 = new Date('2026-08-31T12:25:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });
const C3 = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });
const C4 = Object.freeze({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'Claim-4', snapshotIndex: 4 });

function rowFor(readModel, candidate) {
    return readModel.candidates.find((row) => serialize(row.candidate) === serialize(candidate));
}

// Builds the flagship's own four-candidate evidence agreement:
//   C1 — decision shared+exclusive,  observation shared+exclusive
//   C2 — decision shared only,       observation source-only
//   C3 — decision target-only,       observation shared only
//   C4 — decision source-only,       observation target-only
function buildFlagshipEvidenceAgreement() {
    const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);   // C1 — shared decision
    const D1a = genuineDecisionRecord(C1, 'DEFER', T2);    // C1 — source-only decision
    const D1b = genuineDecisionRecord(C1, 'DEFER', T3);    // C1 — target-only decision
    const D2 = genuineDecisionRecord(C2, 'OBSERVE', T4);   // C2 — shared decision (identical on both sides)
    const D3 = genuineDecisionRecord(C3, 'OBSERVE', T5);   // C3 — target-only decision
    const D4 = genuineDecisionRecord(C4, 'OBSERVE', T6);   // C4 — source-only decision

    const sourceDecisionHistory = appendDecisions([D1, D1a, D2, D4]);
    const targetDecisionHistory = appendDecisions([D1, D1b, D2, D3]);

    const plan = planNaming({ claims: ['Claim-1', 'Claim-2'], snapshots: [3], divergent: [['Claim-4', 4]] });

    const OA1 = observe(D1, plan, OBS_T1);   // C1 — shared observation
    const OA2 = observe(D1a, plan, OBS_T2);  // C1 — source-only observation
    const OA3 = observe(D1b, plan, OBS_T3);  // C1 — target-only observation
    const O2 = observe(D2, plan, OBS_T4);    // C2 — source-only observation (target has none)
    const O3 = observe(D3, plan, OBS_T5);    // C3 — shared observation (identical on both sides)
    const O4 = observe(D4, plan, OBS_T6);    // C4 — target-only observation (source has none)

    const sourceObservationHistory = appendObservations([OA1, OA2, O2, O3]);
    const targetObservationHistory = appendObservations([OA1, OA3, O3, O4]);

    return evidenceAgreementFor(sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent evidenceAgreement.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { candidates: 'not-an-array' }, { candidates: null }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(malformed);
            assert(result.candidateCount === 0, `1. malformed input (${serialize(malformed)}) reports candidateCount 0`);
            assert(Array.isArray(result.candidates) && result.candidates.length === 0, `2. malformed input (${serialize(malformed)}) reports an empty candidates array`);
            assert(Object.isFrozen(result) && Object.isFrozen(result.candidates), `3. malformed input (${serialize(malformed)}) still returns a frozen, valid result`);
        }
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel().candidateCount === 0, '4. calling with no argument defaults to an empty result, never throws');
    }
    console.log('✓ Section A: malformed/absent input degrades to a valid, empty read model rather than throwing');

    // ---------------------------------------------------------------
    // Section B — a single, fully-shared candidate: field renaming fidelity.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);

        const evidenceAgreement = evidenceAgreementFor(decisionHistory, decisionHistory, observationHistory, observationHistory);
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        assert(readModel.candidateCount === 1, '5. exactly one candidate row');
        const [row] = readModel.candidates;
        assert(serialize(row.candidate) === serialize(C1), '6. the row names C1');
        assert(row.decisionEvidence.sharedCount === 1 && row.decisionEvidence.sourceOnlyCount === 0 && row.decisionEvidence.targetOnlyCount === 0, '7. decisionEvidence is 0.8.156\'s own counts, renamed');
        assert(row.observationEvidence.sharedCount === 1 && row.observationEvidence.sourceOnlyCount === 0 && row.observationEvidence.targetOnlyCount === 0, '8. observationEvidence is 0.8.174\'s own counts, renamed');
    }
    console.log('✓ Section B: a single fully-shared candidate\'s six counts are 0.8.176\'s own counts, renamed onto decisionEvidence/observationEvidence verbatim');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const evidenceAgreement = buildFlagshipEvidenceAgreement();
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        assert(readModel.candidateCount === 4, '9. FLAGSHIP — exactly four candidate rows');

        const c1 = rowFor(readModel, C1);
        assert(c1 !== undefined, '10. FLAGSHIP — C1 appears exactly once');
        assert(c1.decisionEvidence.sharedCount === 1 && c1.decisionEvidence.sourceOnlyCount === 1 && c1.decisionEvidence.targetOnlyCount === 1, '11. FLAGSHIP — C1 decisionEvidence: shared + exclusive on both sides');
        assert(c1.observationEvidence.sharedCount === 1 && c1.observationEvidence.sourceOnlyCount === 1 && c1.observationEvidence.targetOnlyCount === 1, '12. FLAGSHIP — C1 observationEvidence: shared + exclusive on both sides');

        const c2 = rowFor(readModel, C2);
        assert(c2 !== undefined, '13. FLAGSHIP — C2 appears exactly once');
        assert(c2.decisionEvidence.sharedCount === 1 && c2.decisionEvidence.sourceOnlyCount === 0 && c2.decisionEvidence.targetOnlyCount === 0, '14. FLAGSHIP — C2 decisionEvidence: shared only');
        assert(c2.observationEvidence.sharedCount === 0 && c2.observationEvidence.sourceOnlyCount === 1 && c2.observationEvidence.targetOnlyCount === 0, '15. FLAGSHIP — C2 observationEvidence: source-only');

        const c3 = rowFor(readModel, C3);
        assert(c3 !== undefined, '16. FLAGSHIP — C3 appears exactly once');
        assert(c3.decisionEvidence.sharedCount === 0 && c3.decisionEvidence.sourceOnlyCount === 0 && c3.decisionEvidence.targetOnlyCount === 1, '17. FLAGSHIP — C3 decisionEvidence: target-only');
        assert(c3.observationEvidence.sharedCount === 1 && c3.observationEvidence.sourceOnlyCount === 0 && c3.observationEvidence.targetOnlyCount === 0, '18. FLAGSHIP — C3 observationEvidence: shared only');

        const c4 = rowFor(readModel, C4);
        assert(c4 !== undefined, '19. FLAGSHIP — C4 appears exactly once');
        assert(c4.decisionEvidence.sharedCount === 0 && c4.decisionEvidence.sourceOnlyCount === 1 && c4.decisionEvidence.targetOnlyCount === 0, '20. FLAGSHIP — C4 decisionEvidence: source-only');
        assert(c4.observationEvidence.sharedCount === 0 && c4.observationEvidence.sourceOnlyCount === 0 && c4.observationEvidence.targetOnlyCount === 1, '21. FLAGSHIP — C4 observationEvidence: target-only');

        // No candidate is ever called conflicting, stale, resolved, correct,
        // incorrect, winning, or ranked.
        const forbidden = ['conflict', 'conflicting', 'stale', 'resolved', 'correct', 'incorrect', 'winner', 'rank', 'score', 'confidence', 'status', 'preferred', 'valid'];
        const allText = serialize(readModel).toLowerCase();
        for (const term of forbidden) {
            assert(!allText.includes(term), `22. FLAGSHIP — the result never carries judgment/ranking vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section C: FLAGSHIP — all four evidence combinations (shared+exclusive, shared-only+source-only, target-only+shared-only, source-only+target-only) are faithfully represented, without interpretation');

    // ---------------------------------------------------------------
    // Section D — every row's six counts always agree with 0.8.176's own
    // counts, for every candidate.
    // ---------------------------------------------------------------
    {
        const evidenceAgreement = buildFlagshipEvidenceAgreement();
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        assert(readModel.candidateCount === evidenceAgreement.candidateCount, '23. row count matches 0.8.176\'s own candidateCount');
        for (const entry of evidenceAgreement.candidates) {
            const row = rowFor(readModel, entry.candidate);
            assert(row !== undefined, '24. every 0.8.176 candidate has a corresponding row');
            assert(row.decisionEvidence.sharedCount === entry.decisionAgreement.sharedDecisionCount, '25. sharedCount matches sharedDecisionCount');
            assert(row.decisionEvidence.sourceOnlyCount === entry.decisionAgreement.sourceOnlyDecisionCount, '26. sourceOnlyCount matches sourceOnlyDecisionCount');
            assert(row.decisionEvidence.targetOnlyCount === entry.decisionAgreement.targetOnlyDecisionCount, '27. targetOnlyCount matches targetOnlyDecisionCount');
            assert(row.observationEvidence.sharedCount === entry.observationAgreement.sharedObservationCount, '28. sharedCount matches sharedObservationCount');
            assert(row.observationEvidence.sourceOnlyCount === entry.observationAgreement.sourceOnlyObservationCount, '29. sourceOnlyCount matches sourceOnlyObservationCount');
            assert(row.observationEvidence.targetOnlyCount === entry.observationAgreement.targetOnlyObservationCount, '30. targetOnlyCount matches targetOnlyObservationCount');
        }
    }
    console.log('✓ Section D: every row\'s six counts agree exactly with 0.8.176\'s own counts for the same candidate — no arithmetic of its own');

    // ---------------------------------------------------------------
    // Section E — row order preserves 0.8.176's own candidate order.
    // ---------------------------------------------------------------
    {
        const evidenceAgreement = buildFlagshipEvidenceAgreement();
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        const expectedOrder = evidenceAgreement.candidates.map((entry) => serialize(entry.candidate));
        const actualOrder = readModel.candidates.map((row) => serialize(row.candidate));
        assert(serialize(expectedOrder) === serialize(actualOrder), '31. row order is 0.8.176\'s own candidate order, unchanged — never re-sorted by type, count, or outcome');
    }
    console.log('✓ Section E: row order is 0.8.176\'s own candidate order, verbatim');

    // ---------------------------------------------------------------
    // Section F — no evidence-record lists, and no aggregate fields, ever
    // appear.
    // ---------------------------------------------------------------
    {
        const evidenceAgreement = buildFlagshipEvidenceAgreement();
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        const topKeys = Object.keys(readModel).sort();
        assert(serialize(topKeys) === serialize(['candidateCount', 'candidates'].sort()), '32. the top level carries exactly candidateCount and candidates — no aggregate counts, no sameDecisionHistory/sameObservationHistory');

        for (const row of readModel.candidates) {
            const rowKeys = Object.keys(row).sort();
            assert(serialize(rowKeys) === serialize(['candidate', 'decisionEvidence', 'observationEvidence'].sort()), '33. each row carries exactly candidate, decisionEvidence, observationEvidence');

            const decisionKeys = Object.keys(row.decisionEvidence).sort();
            assert(serialize(decisionKeys) === serialize(['sharedCount', 'sourceOnlyCount', 'targetOnlyCount'].sort()), '34. decisionEvidence carries exactly the three documented counts — no evidence lists');

            const observationKeys = Object.keys(row.observationEvidence).sort();
            assert(serialize(observationKeys) === serialize(['sharedCount', 'sourceOnlyCount', 'targetOnlyCount'].sort()), '35. observationEvidence carries exactly the three documented counts — no evidence lists');
        }
    }
    console.log('✓ Section F: the read model carries exactly the documented, minimal fields — no evidence-record lists and no forwarded top-level aggregates');

    // ---------------------------------------------------------------
    // Section G — no mutation, frozen results, determinism, reference
    // identity.
    // ---------------------------------------------------------------
    {
        const evidenceAgreement = buildFlagshipEvidenceAgreement();
        const before = serialize(evidenceAgreement);

        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        assert(serialize(evidenceAgreement) === before, '36. the supplied evidenceAgreement is never mutated');
        assert(Object.isFrozen(readModel), '37. the result is frozen');
        assert(Object.isFrozen(readModel.candidates), '38. the candidates array is frozen');
        assert(Object.isFrozen(readModel.candidates[0]), '39. a row is frozen');
        assert(Object.isFrozen(readModel.candidates[0].decisionEvidence), '40. a row\'s own decisionEvidence is frozen');
        assert(Object.isFrozen(readModel.candidates[0].observationEvidence), '41. a row\'s own observationEvidence is frozen');
        assert(readModel.candidates[0].candidate === evidenceAgreement.candidates[0].candidate, '42. a row\'s own candidate is the ORIGINAL object, referenced rather than copied');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);
        assert(serialize(again) === serialize(readModel), '43. calling describeXxx() twice with a byte-identical argument returns a byte-identical result');
    }
    console.log('✓ Section G: no mutation of the supplied evidence agreement, every returned object/array is frozen, candidate identity is preserved by reference, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section H — reconstruct()'s archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const sourceDecisionHistory = appendDecisions([D1]);
        const targetDecisionHistory = appendDecisions([D1, D2]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const sourceObservationHistory = appendObservations([O1]);
        const targetObservationHistory = appendObservations([O1]);

        const evidenceAgreement = evidenceAgreementFor(sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory);
        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);

        const sourceArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: sourceDecisionHistory,
            revalidationObservationRecords: sourceObservationHistory
        });
        const targetArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: targetDecisionHistory,
            revalidationObservationRecords: targetObservationHistory
        });

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(sourceArchive, targetArchive);
        assert(serialize(reconstructed) === serialize(described), '44. reconstruct() over archives holding the SAME histories agrees exactly with describe() over the equivalent evidence agreement');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreementFor([], [], [], []));
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '45. reconstruct() over two empty archives agrees exactly with describe() over an empty evidence agreement');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '46. reconstruct() over invalid/missing archives degrades to the empty result, never a throw');
    }
    console.log('✓ Section H: reconstruct() reads both archives via 0.8.176\'s own seam exactly once, agreeing exactly with describe() over the equivalent evidence agreement');

    // ---------------------------------------------------------------
    // Section I — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'valid', 'preferred', 'status', 'confidence', 'sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject', 'merge', 'delete', 'apply', 'execute', 'trust', 'reputation'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `47. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '48. this file imports from exactly one module');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js'), '49. that one import is 0.8.176\'s own candidate evidence agreement projection');
        assert(!codeOnly.includes('decisionagreementview') && !codeOnly.includes('evolutionagreementview') && !codeOnly.includes('correspondenceview') && !codeOnly.includes('evidencesummaryview') && !codeOnly.includes('publicationobservationarchive.js'), '50. this file never imports either agreement view 0.8.176 already composes, either correspondence module, 0.8.175 itself, or the archive module directly');
    }
    console.log('✓ Section I: this file\'s own code carries no ranking/judgment vocabulary, and imports only 0.8.176\'s own candidate evidence agreement projection');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.test.js FAILED:', error);
    process.exitCode = 1;
});
