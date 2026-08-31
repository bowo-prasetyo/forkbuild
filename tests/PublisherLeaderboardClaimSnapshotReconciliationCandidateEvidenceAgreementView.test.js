import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.176 — Reconciliation Candidate Evidence Agreement Projection.
//
// Section A: four empty histories — zero counts, empty candidates, converged
// Section B: converged histories on both branches — everything shared
// Section C: FLAGSHIP — the milestone's own worked example: C1 shared at
//            both grains; C2 shared decisions but source-only observations;
//            C3 target-only decisions but shared-with-zero-overlap
//            observations
// Section D: sameDecisionHistory/sameObservationHistory are independent —
//            identical decisions, divergent observations
// Section E: the reverse — divergent decisions, identical observations
// Section F: a candidate present in decision agreement only, and one
//            present in observation agreement only
// Section G: per-candidate lists always agree with their own counts, and
//            candidates sum back to the global totals
// Section H: no mutation, frozen results, determinism
// Section I: reconstruct()'s archive-reading boundary, calling 0.8.156 and
//            0.8.174 exactly once each
// Section J: malformed input tolerance
// Section K: vocabulary/import boundary — no judgment vocabulary, imports
//            only 0.8.156 and 0.8.174

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
const T5 = new Date('2026-08-31T06:14:00Z');
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const OBS_T2 = new Date('2026-08-31T12:05:00Z');
const OBS_T3 = new Date('2026-08-31T12:10:00Z');
const OBS_T4 = new Date('2026-08-31T12:15:00Z');
const OBS_T5 = new Date('2026-08-31T12:20:00Z');
const OBS_T6 = new Date('2026-08-31T12:25:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });
const C3 = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });

function candidateEntryFor(result, candidate) {
    return result.candidates.find((entry) => serialize(entry.candidate) === serialize(candidate));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — four empty histories.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement([], [], [], []);
        assert(result.candidateCount === 0, '1. four empty histories report candidateCount 0');
        assert(result.sourceDecisionCount === 0 && result.targetDecisionCount === 0, '2. zero decision counts on each side');
        assert(result.sourceObservationCount === 0 && result.targetObservationCount === 0, '3. zero observation counts on each side');
        assert(result.sharedDecisionCount === 0 && result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '4. zero decision agreement counts');
        assert(result.sharedObservationCount === 0 && result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '5. zero observation agreement counts');
        assert(result.candidates.length === 0, '6. an empty candidates array');
        assert(result.sameDecisionHistory === true && result.sameObservationHistory === true, '7. both flags read true when everything is empty');
        assert(Object.isFrozen(result), '8. the result is frozen');
        assert(Object.isFrozen(result.candidates), '9. the candidates array is frozen');
    }
    console.log('✓ Section A: four empty histories produce an empty, fully converged evidence agreement');

    // ---------------------------------------------------------------
    // Section B — converged histories on both branches.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(decisionHistory, decisionHistory, observationHistory, observationHistory);
        assert(result.sameDecisionHistory === true && result.sameObservationHistory === true, '10. identical histories on both branches converge on both flags');
        assert(result.sharedDecisionCount === 1 && result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '11. the one decision is fully shared');
        assert(result.sharedObservationCount === 1 && result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '12. the one observation is fully shared');
        assert(result.candidateCount === 1, '13. exactly one candidate');
        const [entry] = result.candidates;
        assert(serialize(entry.candidate) === serialize(C1), '14. the candidate is C1');
        assert(entry.decisionAgreement.sharedDecisionCount === 1 && entry.decisionAgreement.sourceOnlyDecisionCount === 0 && entry.decisionAgreement.targetOnlyDecisionCount === 0, '15. C1\'s own decisionAgreement is fully shared');
        assert(entry.decisionAgreement.sharedDecisions.length === 1 && entry.decisionAgreement.sourceOnly.length === 0 && entry.decisionAgreement.targetOnly.length === 0, '16. C1\'s own decisionAgreement lists agree with its counts');
        assert(entry.observationAgreement.sharedObservationCount === 1 && entry.observationAgreement.sourceOnlyObservationCount === 0 && entry.observationAgreement.targetOnlyObservationCount === 0, '17. C1\'s own observationAgreement is fully shared');
        assert(entry.observationAgreement.sharedObservations.length === 1 && entry.observationAgreement.sourceOnly.length === 0 && entry.observationAgreement.targetOnly.length === 0, '18. C1\'s own observationAgreement lists agree with its counts');
    }
    console.log('✓ Section B: identical decision and observation histories on both replicas report every candidate as fully shared at both grains');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP.
    //
    //   Alice (source)             Bob (target)
    //   C1 decisions:    D1, D2    D1, D3
    //   C1 observations: O1, O2    O1, O3
    //
    //   C2 decisions:    D4        D4
    //   C2 observations: O4        (none)
    //
    //   C3 decisions:    (none)    D5
    //   C3 observations: O5        O6   (same candidate, different observedAt)
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const D3 = genuineDecisionRecord(C1, 'DEFER', T3);
        const D4 = genuineDecisionRecord(C2, 'OBSERVE', T4);
        const D5 = genuineDecisionRecord(C3, 'OBSERVE', T5);

        const sourceDecisionHistory = appendDecisions([D1, D2, D4]);
        const targetDecisionHistory = appendDecisions([D1, D3, D4, D5]);

        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'], snapshots: [3] });
        const O1 = observe(D1, plan, OBS_T1); // C1 — shared
        const O2 = observe(D2, plan, OBS_T2); // C1 — Alice-only
        const O3 = observe(D3, plan, OBS_T3); // C1 — Bob-only
        const O4 = observe(D4, plan, OBS_T4); // C2 — Alice-only (Bob has none)
        const O5 = observe(D5, plan, OBS_T5); // C3 — Alice-only
        const O6 = observe(D5, plan, OBS_T6); // C3 — Bob-only (same candidate as O5, different observedAt)
        assert(serialize(O5) !== serialize(O6), 'test setup — O5 and O6 are genuinely distinct observations of C3');

        const sourceObservationHistory = appendObservations([O1, O2, O4, O5]);
        const targetObservationHistory = appendObservations([O1, O3, O6]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory,
            sourceObservationHistory, targetObservationHistory
        );

        assert(result.sameDecisionHistory === false && result.sameObservationHistory === false, '19. FLAGSHIP — both replicas genuinely differ on both branches');
        assert(result.sourceDecisionCount === 3 && result.targetDecisionCount === 4, '20. FLAGSHIP — raw decision counts');
        assert(result.sourceObservationCount === 4 && result.targetObservationCount === 3, '21. FLAGSHIP — raw observation counts');
        assert(result.sharedDecisionCount === 2 && result.sourceOnlyDecisionCount === 1 && result.targetOnlyDecisionCount === 2, '22. FLAGSHIP — D1 and D4 shared; D2 source-only; D3 and D5 target-only');
        assert(result.sharedObservationCount === 1 && result.sourceOnlyObservationCount === 3 && result.targetOnlyObservationCount === 2, '23. FLAGSHIP — only O1 shared; O2/O4/O5 source-only; O3/O6 target-only');
        assert(result.candidateCount === 3, '24. FLAGSHIP — exactly three candidates named across either branch');

        // C1 — shared at both grains, exclusive evidence on each side too.
        const c1 = candidateEntryFor(result, C1);
        assert(c1 !== undefined, '25. FLAGSHIP — C1 appears exactly once');
        assert(c1.decisionAgreement.sharedDecisionCount === 1 && c1.decisionAgreement.sourceOnlyDecisionCount === 1 && c1.decisionAgreement.targetOnlyDecisionCount === 1, '26. FLAGSHIP — C1 decisionAgreement: shared D1, Alice-only D2, Bob-only D3');
        assert(c1.decisionAgreement.sharedDecisions[0] === D1 && c1.decisionAgreement.sourceOnly[0] === D2 && c1.decisionAgreement.targetOnly[0] === D3, '27. FLAGSHIP — C1 decisionAgreement lists carry the exact original records');
        assert(c1.observationAgreement.sharedObservationCount === 1 && c1.observationAgreement.sourceOnlyObservationCount === 1 && c1.observationAgreement.targetOnlyObservationCount === 1, '28. FLAGSHIP — C1 observationAgreement: shared O1, Alice-only O2, Bob-only O3');
        assert(c1.observationAgreement.sharedObservations[0] === O1 && c1.observationAgreement.sourceOnly[0] === O2 && c1.observationAgreement.targetOnly[0] === O3, '29. FLAGSHIP — C1 observationAgreement lists carry the exact original records');

        // C2 — THE CRITICAL ASSERTION: shared decision evidence, but
        // entirely one-sided (source-only) observation evidence.
        const c2 = candidateEntryFor(result, C2);
        assert(c2 !== undefined, '30. FLAGSHIP — C2 appears exactly once');
        assert(c2.decisionAgreement.sharedDecisionCount === 1 && c2.decisionAgreement.sourceOnlyDecisionCount === 0 && c2.decisionAgreement.targetOnlyDecisionCount === 0, '31. FLAGSHIP — C2 decisionAgreement is fully shared (D4 on both replicas)');
        assert(c2.observationAgreement.sharedObservationCount === 0 && c2.observationAgreement.sourceOnlyObservationCount === 1 && c2.observationAgreement.targetOnlyObservationCount === 0, '32. FLAGSHIP — C2 observationAgreement is entirely Alice-only — Bob recorded no observation of C2 at all, despite sharing its decision');
        assert(c2.observationAgreement.sourceOnly[0] === O4, '33. FLAGSHIP — C2\'s own Alice-only observation is O4');

        // C3 — THE MIRROR ASSERTION: target-only decision evidence, but a
        // SHARED candidate at the observation level with ZERO shared
        // observations.
        const c3 = candidateEntryFor(result, C3);
        assert(c3 !== undefined, '34. FLAGSHIP — C3 appears exactly once');
        assert(c3.decisionAgreement.sharedDecisionCount === 0 && c3.decisionAgreement.sourceOnlyDecisionCount === 0 && c3.decisionAgreement.targetOnlyDecisionCount === 1, '35. FLAGSHIP — C3 decisionAgreement is entirely Bob-only — Alice never decided about C3 at all');
        assert(c3.observationAgreement.sharedObservationCount === 0 && c3.observationAgreement.sourceOnlyObservationCount === 1 && c3.observationAgreement.targetOnlyObservationCount === 1, '36. FLAGSHIP — C3 observationAgreement: both replicas hold an observation of C3 (a shared CANDIDATE), yet the two observations themselves never match — zero shared observations');
        assert(c3.observationAgreement.sourceOnly[0] === O5 && c3.observationAgreement.targetOnly[0] === O6, '37. FLAGSHIP — C3\'s own exclusive observations are O5 (Alice) and O6 (Bob)');

        // No candidate is ever called conflicting, stale, resolved,
        // correct, or incorrect.
        const forbidden = ['conflict', 'conflicting', 'stale', 'resolved', 'correct', 'incorrect', 'winner', 'authoritative'];
        const allText = serialize(result).toLowerCase();
        for (const term of forbidden) {
            assert(!allText.includes(term), `38. FLAGSHIP — the result never carries judgment vocabulary ('${term}')`);
        }

        assert(serialize(result.candidates.map((entry) => entry.candidate)) === serialize([C1, C2, C3]), '39. FLAGSHIP — candidates ordered C1, C2, C3, following 0.8.156\'s own decision-agreement candidate order');
    }
    console.log('✓ Section C: FLAGSHIP — C1 is shared at both grains with exclusive evidence on each side; C2 has shared decision evidence but entirely one-sided observation evidence; C3 has target-only decision evidence but is a shared observation-candidate with zero shared observations — decision agreement and observation agreement are never the same fact');

    // ---------------------------------------------------------------
    // Section D — sameDecisionHistory/sameObservationHistory independence:
    // identical decisions, divergent observations.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const sourceObservationHistory = appendObservations([observe(D1, plan, OBS_T1)]);
        const targetObservationHistory = appendObservations([observe(D1, plan, OBS_T2)]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            decisionHistory, decisionHistory, sourceObservationHistory, targetObservationHistory
        );
        assert(result.sameDecisionHistory === true, '40. decision histories are byte-identical');
        assert(result.sameObservationHistory === false, '41. observation histories genuinely differ despite identical decision histories');
    }
    console.log('✓ Section D: identical decision histories alongside divergent observation histories keep the two flags independent');

    // ---------------------------------------------------------------
    // Section E — the reverse: divergent decisions, identical observations.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const sourceDecisionHistory = appendDecisions([D1]);
        const targetDecisionHistory = appendDecisions([D1, D2]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const observationHistory = appendObservations([observe(D1, plan, OBS_T1)]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, observationHistory, observationHistory
        );
        assert(result.sameDecisionHistory === false, '42. decision histories genuinely differ');
        assert(result.sameObservationHistory === true, '43. observation histories are byte-identical despite divergent decision histories');
    }
    console.log('✓ Section E: divergent decision histories alongside identical observation histories likewise keep the two flags independent');

    // ---------------------------------------------------------------
    // Section F — a candidate present in one agreement view only.
    // ---------------------------------------------------------------
    {
        // C1 has decision evidence only (no observation ever recorded);
        // C2 has observation evidence only (its decision was never
        // appended to either decision history).
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);

        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O2 = observe(D2, plan, OBS_T1);
        const observationHistory = appendObservations([O2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            decisionHistory, decisionHistory, observationHistory, observationHistory
        );
        assert(result.candidateCount === 2, '44. both C1 (decision-only) and C2 (observation-only) appear');

        const c1 = candidateEntryFor(result, C1);
        assert(c1.decisionAgreement.sharedDecisionCount === 1, '45. C1 carries its shared decision');
        assert(c1.observationAgreement.sharedObservationCount === 0 && c1.observationAgreement.sourceOnlyObservationCount === 0 && c1.observationAgreement.targetOnlyObservationCount === 0, '46. C1 reports zero for every observationAgreement count — never null or missing');
        assert(c1.observationAgreement.sharedObservations.length === 0 && c1.observationAgreement.sourceOnly.length === 0 && c1.observationAgreement.targetOnly.length === 0, '47. C1\'s own observationAgreement lists are empty, never fabricated');

        const c2 = candidateEntryFor(result, C2);
        assert(c2.observationAgreement.sharedObservationCount === 1, '48. C2 carries its shared observation');
        assert(c2.decisionAgreement.sharedDecisionCount === 0 && c2.decisionAgreement.sourceOnlyDecisionCount === 0 && c2.decisionAgreement.targetOnlyDecisionCount === 0, '49. C2 reports zero for every decisionAgreement count — its own decision was never recorded into either decision history');
        assert(c2.decisionAgreement.sharedDecisions.length === 0 && c2.decisionAgreement.sourceOnly.length === 0 && c2.decisionAgreement.targetOnly.length === 0, '50. C2\'s own decisionAgreement lists are empty, never fabricated from its observation\'s own embedded decision');
    }
    console.log('✓ Section F: a candidate named by only one agreement view reports zero/empty on the other view\'s own fields — never null, missing, or fabricated');

    // ---------------------------------------------------------------
    // Section G — per-candidate lists agree with their own counts, and
    // candidates sum back to the global totals.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const sourceDecisionHistory = appendDecisions([D1, D2]);
        const targetDecisionHistory = appendDecisions([D1]);

        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const sourceObservationHistory = appendObservations([O1, O2]);
        const targetObservationHistory = appendObservations([O1]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );

        let sharedDecisionSum = 0, sourceOnlyDecisionSum = 0, targetOnlyDecisionSum = 0;
        let sharedObservationSum = 0, sourceOnlyObservationSum = 0, targetOnlyObservationSum = 0;
        for (const entry of result.candidates) {
            assert(entry.decisionAgreement.sharedDecisions.length === entry.decisionAgreement.sharedDecisionCount, '51. each candidate\'s own sharedDecisions.length matches its own sharedDecisionCount');
            assert(entry.decisionAgreement.sourceOnly.length === entry.decisionAgreement.sourceOnlyDecisionCount, '52. each candidate\'s own sourceOnly.length matches its own sourceOnlyDecisionCount');
            assert(entry.decisionAgreement.targetOnly.length === entry.decisionAgreement.targetOnlyDecisionCount, '53. each candidate\'s own targetOnly.length matches its own targetOnlyDecisionCount');
            assert(entry.observationAgreement.sharedObservations.length === entry.observationAgreement.sharedObservationCount, '54. each candidate\'s own sharedObservations.length matches its own sharedObservationCount');
            assert(entry.observationAgreement.sourceOnly.length === entry.observationAgreement.sourceOnlyObservationCount, '55. each candidate\'s own sourceOnly.length matches its own sourceOnlyObservationCount');
            assert(entry.observationAgreement.targetOnly.length === entry.observationAgreement.targetOnlyObservationCount, '56. each candidate\'s own targetOnly.length matches its own targetOnlyObservationCount');

            sharedDecisionSum += entry.decisionAgreement.sharedDecisionCount;
            sourceOnlyDecisionSum += entry.decisionAgreement.sourceOnlyDecisionCount;
            targetOnlyDecisionSum += entry.decisionAgreement.targetOnlyDecisionCount;
            sharedObservationSum += entry.observationAgreement.sharedObservationCount;
            sourceOnlyObservationSum += entry.observationAgreement.sourceOnlyObservationCount;
            targetOnlyObservationSum += entry.observationAgreement.targetOnlyObservationCount;
        }
        assert(sharedDecisionSum === result.sharedDecisionCount, '57. per-candidate sharedDecisionCount sums to the global sharedDecisionCount');
        assert(sourceOnlyDecisionSum === result.sourceOnlyDecisionCount, '58. per-candidate sourceOnlyDecisionCount sums to the global sourceOnlyDecisionCount');
        assert(targetOnlyDecisionSum === result.targetOnlyDecisionCount, '59. per-candidate targetOnlyDecisionCount sums to the global targetOnlyDecisionCount');
        assert(sharedObservationSum === result.sharedObservationCount, '60. per-candidate sharedObservationCount sums to the global sharedObservationCount');
        assert(sourceOnlyObservationSum === result.sourceOnlyObservationCount, '61. per-candidate sourceOnlyObservationCount sums to the global sourceOnlyObservationCount');
        assert(targetOnlyObservationSum === result.targetOnlyObservationCount, '62. per-candidate targetOnlyObservationCount sums to the global targetOnlyObservationCount');
    }
    console.log('✓ Section G: every per-candidate list always agrees with its own count, and every per-candidate count sums back to the global total — no evidence is duplicated or dropped while regrouping');

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const sourceDecisionHistory = appendDecisions([D1]);
        const targetDecisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const sourceObservationHistory = appendObservations([O1]);
        const targetObservationHistory = appendObservations([O1]);

        const beforeSourceDecision = serialize(sourceDecisionHistory);
        const beforeTargetDecision = serialize(targetDecisionHistory);
        const beforeSourceObservation = serialize(sourceObservationHistory);
        const beforeTargetObservation = serialize(targetObservationHistory);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );

        assert(serialize(sourceDecisionHistory) === beforeSourceDecision, '63. sourceDecisionHistory is never mutated');
        assert(serialize(targetDecisionHistory) === beforeTargetDecision, '64. targetDecisionHistory is never mutated');
        assert(serialize(sourceObservationHistory) === beforeSourceObservation, '65. sourceObservationHistory is never mutated');
        assert(serialize(targetObservationHistory) === beforeTargetObservation, '66. targetObservationHistory is never mutated');

        assert(Object.isFrozen(result), '67. the result is frozen');
        assert(Object.isFrozen(result.candidates), '68. candidates array is frozen');
        assert(Object.isFrozen(result.candidates[0]), '69. a candidate entry is frozen');
        assert(Object.isFrozen(result.candidates[0].decisionAgreement), '70. a candidate\'s own decisionAgreement is frozen');
        assert(Object.isFrozen(result.candidates[0].decisionAgreement.sharedDecisions), '71. a candidate\'s own sharedDecisions array is frozen');
        assert(Object.isFrozen(result.candidates[0].observationAgreement), '72. a candidate\'s own observationAgreement is frozen');
        assert(Object.isFrozen(result.candidates[0].observationAgreement.sharedObservations), '73. a candidate\'s own sharedObservations array is frozen');
        assert(result.candidates[0].decisionAgreement.sharedDecisions[0] === D1, '74. sharedDecisions holds the ORIGINAL decision record, never a reconstructed copy');
        assert(result.candidates[0].observationAgreement.sharedObservations[0] === O1, '75. sharedObservations holds the ORIGINAL observation record, never a reconstructed copy');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );
        assert(serialize(again) === serialize(result), '76. calling describeXxx() twice with byte-identical arguments returns a byte-identical result');
    }
    console.log('✓ Section H: no mutation of any supplied history, every returned object/array is frozen, original records are preserved by reference, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section I — reconstruct()'s archive-reading boundary.
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

        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );

        const sourceArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: sourceDecisionHistory,
            revalidationObservationRecords: sourceObservationHistory
        });
        const targetArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: targetDecisionHistory,
            revalidationObservationRecords: targetObservationHistory
        });

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(sourceArchive, targetArchive);
        assert(serialize(reconstructed) === serialize(described), '77. reconstruct() over archives holding the SAME histories agrees exactly with describe() over the equivalent raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement([], [], [], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '78. reconstruct() over two empty archives agrees exactly with describe() over four empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '79. reconstruct() over invalid/missing archives degrades to the empty-histories result, never a throw');
    }
    console.log('✓ Section I: reconstruct() reads each archive\'s own stored histories via 0.8.156\'s and 0.8.174\'s own seams, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section J — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        const allMalformed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(null, undefined, 'not-an-array', 42);
        assert(allMalformed.candidateCount === 0 && allMalformed.sameDecisionHistory === true && allMalformed.sameObservationHistory === true, '80. four malformed arguments degrade to the empty, converged result');

        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement().candidateCount === 0, '81. calling with no arguments defaults to four empty histories, never throws');

        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);
        const partiallyMalformed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(decisionHistory, decisionHistory, observationHistory, { not: 'an-array' });
        assert(partiallyMalformed.sourceObservationCount === 1 && partiallyMalformed.targetObservationCount === 0, '82. a malformed observation history degrades only that side to empty, leaving the genuine decision evidence and the other observation side intact');
    }
    console.log('✓ Section J: malformed/absent input degrades to a valid, empty/converged result rather than throwing');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(decisionHistory, decisionHistory, observationHistory, observationHistory);

        const topKeys = Object.keys(result).sort();
        const expectedTopKeys = [
            'candidateCount',
            'sourceDecisionCount', 'targetDecisionCount',
            'sourceObservationCount', 'targetObservationCount',
            'sharedDecisionCount', 'sourceOnlyDecisionCount', 'targetOnlyDecisionCount',
            'sharedObservationCount', 'sourceOnlyObservationCount', 'targetOnlyObservationCount',
            'candidates',
            'sameDecisionHistory', 'sameObservationHistory'
        ].sort();
        assert(serialize(topKeys) === serialize(expectedTopKeys), '83. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(result.candidates[0]).sort();
        assert(serialize(entryKeys) === serialize(['candidate', 'decisionAgreement', 'observationAgreement'].sort()), '84. a candidate entry carries exactly the documented fields');

        const decisionAgreementKeys = Object.keys(result.candidates[0].decisionAgreement).sort();
        assert(serialize(decisionAgreementKeys) === serialize(['sharedDecisionCount', 'sourceOnlyDecisionCount', 'targetOnlyDecisionCount', 'sharedDecisions', 'sourceOnly', 'targetOnly'].sort()), '85. decisionAgreement carries exactly the documented fields');

        const observationAgreementKeys = Object.keys(result.candidates[0].observationAgreement).sort();
        assert(serialize(observationAgreementKeys) === serialize(['sharedObservationCount', 'sourceOnlyObservationCount', 'targetOnlyObservationCount', 'sharedObservations', 'sourceOnly', 'targetOnly'].sort()), '86. observationAgreement carries exactly the documented fields');

        const forbidden = ['conflict', 'conflicting', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect', 'latest', 'current', 'final', 'stale'];
        const allKeys = [...topKeys, ...entryKeys, ...decisionAgreementKeys, ...observationAgreementKeys];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `87. the result never carries judgment vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'signature', 'verify'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `88. this file's own code never carries "${term}"`);
        }

        // This milestone must import exactly 0.8.156's and 0.8.174's own
        // agreement projections — never any raw history/difference module,
        // either archive-reading seam directly, either correspondence
        // module, either evolution module, either exclusive-only difference
        // module, or 0.8.175 itself.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '89. this file imports from exactly two modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView.js'), '90. one import is 0.8.156\'s own candidate decision agreement projection');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView.js'), '91. the other import is 0.8.174\'s own candidate observation evolution agreement projection');
        assert(!codeOnly.includes('historydifference') && !codeOnly.includes('historyview') && !codeOnly.includes('candidatecorrespondenceview') && !codeOnly.includes('evolutionview') && !codeOnly.includes('evolutiondifferenceview') && !codeOnly.includes('evidencesummaryview'), '92. this file never imports either raw history/difference module, either archive-reading seam directly, either correspondence module, either evolution module, either exclusive-only difference module, or 0.8.175 itself');
    }
    console.log('✓ Section K: the result carries no judgment vocabulary, and the module imports only 0.8.156\'s and 0.8.174\'s own agreement projections, composing two already-proven comparisons rather than building a third');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.test.js FAILED:', error);
    process.exitCode = 1;
});
