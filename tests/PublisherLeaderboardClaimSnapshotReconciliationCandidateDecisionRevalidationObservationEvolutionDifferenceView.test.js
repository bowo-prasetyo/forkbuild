import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifferenceView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.173 — Reconciliation Candidate Observation Evolution Difference
// Projection.
//
// Section A: empty vs empty — no difference
// Section B: converged histories — structurally identical observations on
//            both sides report zero exclusive observations/candidates
// Section C: FLAGSHIP — the milestone's own worked example: C1 exists on
//            both sides, has a shared observation, and simultaneously has
//            exclusive observations on both sides
// Section D: multiplicity — [O1, O1, O2] vs [O1, O2] reports exactly one
//            exclusive O1, grouped under one candidate evolution
// Section E: same candidate, different observation outcome remains two
//            distinct observation events, each attributed to the correct
//            side
// Section F: same candidate, same decision/plan, different observedAt
//            remain distinct observation events
// Section G: different candidate types never collide merely because they
//            share a numeric/string field
// Section H: local duplicates are never normalized or removed
// Section I: no mutation, frozen results, determinism
// Section J: reconstruct()'s archive-reading boundary, calling 0.8.166
//            exactly once
// Section K: malformed input tolerance
// Section L: vocabulary/import boundary — no conflict/resolution
//            vocabulary, imports only 0.8.166/0.8.172

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
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

function historyOf(...observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-30T06:00:00Z');
const T2 = new Date('2026-08-30T06:03:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');
const OBS_T5 = new Date('2026-08-30T12:20:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference([], []);
        assert(result.sourceObservationCount === 0 && result.targetObservationCount === 0, '1. two empty histories report zero observation counts on each side');
        assert(result.sharedObservationCount === 0, '2. two empty histories report zero shared observations');
        assert(result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '3. two empty histories report zero exclusive observation counts');
        assert(result.sourceOnly.length === 0 && result.targetOnly.length === 0, '4. sourceOnly/targetOnly are empty arrays');
        assert(result.sourceOnlyCandidateEvolutions.length === 0 && result.targetOnlyCandidateEvolutions.length === 0, '5. sourceOnlyCandidateEvolutions/targetOnlyCandidateEvolutions are empty arrays');
        assert(Object.isFrozen(result), '6. an empty result is frozen');
    }
    console.log('✓ Section A: two empty histories produce an empty, converged evolution difference');

    // ---------------------------------------------------------------
    // Section B — converged histories: structurally identical observations
    // on both sides.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });

        const sourceHistory = historyOf(observe(D1, plan, OBS_T1), observe(D2, plan, OBS_T2));
        const targetHistory = historyOf(observe(D1, plan, OBS_T1), observe(D2, plan, OBS_T2));

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);
        assert(result.sourceObservationCount === 2 && result.targetObservationCount === 2, '7. each side\'s own raw observation count is still reported');
        assert(result.sharedObservationCount === 2, '8. both independently computed observations are shared');
        assert(result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '9. no exclusive observations on either side');
        assert(result.sourceOnlyCandidateEvolutions.length === 0 && result.targetOnlyCandidateEvolutions.length === 0, '10. no exclusive candidate evolutions on either side');
    }
    console.log('✓ Section B: converged histories report zero exclusive observations and zero exclusive candidate evolutions');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the milestone's own worked example.
    //
    //   Source: C1→O1, C1→O2, C2→O3
    //   Target: C1→O1, C1→O4, C2→O5
    //
    //   shared     = [O1]
    //   sourceOnly = [O2, O3]
    //   targetOnly = [O4, O5]
    //
    //   sourceOnlyCandidateEvolutions: C1 → [O2], C2 → [O3]
    //   targetOnlyCandidateEvolutions: C1 → [O4], C2 → [O5]
    //
    //   C1 exists on both sides and has a shared observation, while
    //   simultaneously having exclusive observations on both sides — this
    //   is the fact this milestone exists to make observable, never labeled
    //   conflict, disagreement, or resolution.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const planPresent = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const planAbsent = planNaming({ claims: ['Claim-2'] });

        const O1 = observe(D1, planPresent, OBS_T1);
        const O2 = observe(D1, planAbsent, OBS_T2);
        const O3 = observe(D2, planPresent, OBS_T3);
        const O4 = observe(D1, planAbsent, OBS_T4);
        const O5 = observe(D2, planAbsent, OBS_T5);
        assert(O2.candidatePresent === false && O4.candidatePresent === false && serialize(O2) !== serialize(O4), 'test setup — O2 and O4 are genuinely distinct observations of C1 (different observedAt)');

        const sourceHistory = historyOf(O1, O2, O3);
        const targetHistory = historyOf(O1, O4, O5);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);

        assert(result.sourceObservationCount === 3 && result.targetObservationCount === 3, '11. FLAGSHIP — raw observation counts on each side');
        assert(result.sharedObservationCount === 1, '12. FLAGSHIP — exactly one shared observation (O1)');
        assert(result.sourceOnlyObservationCount === 2 && result.targetOnlyObservationCount === 2, '13. FLAGSHIP — exactly two exclusive observations on each side');
        assert(result.sourceOnly.length === 2 && result.sourceOnly[0] === O2 && result.sourceOnly[1] === O3, '14. FLAGSHIP — source-exclusive is exactly [O2, O3], the original records, in source\'s own order');
        assert(result.targetOnly.length === 2 && result.targetOnly[0] === O4 && result.targetOnly[1] === O5, '15. FLAGSHIP — target-exclusive is exactly [O4, O5], the original records, in target\'s own order');

        // The genuinely shared O1 cancels out — it appears in neither
        // exclusive list nor either exclusive candidate evolution.
        assert(!result.sourceOnly.includes(O1) && !result.targetOnly.includes(O1), '16. FLAGSHIP — the shared O1 appears in neither exclusive list');

        // sourceOnlyCandidateEvolutions: two groups, C1 (carrying O2) and C2
        // (carrying O3) — never merged with the shared O1.
        assert(result.sourceOnlyCandidateEvolutions.length === 2, '17. FLAGSHIP — sourceOnlyCandidateEvolutions carries exactly two groups');
        const [sourceC1, sourceC2] = result.sourceOnlyCandidateEvolutions;
        assert(serialize(sourceC1.candidate) === serialize(C1), '18. FLAGSHIP — the first source-exclusive group is C1, matching source\'s own first-appearance order');
        assert(sourceC1.observationCount === 1 && sourceC1.observations[0].observedAt === OBS_T2.toISOString(), '19. FLAGSHIP — C1\'s source-exclusive evolution carries exactly O2, never the shared O1');
        assert(serialize(sourceC2.candidate) === serialize(C2), '20. FLAGSHIP — the second source-exclusive group is C2');
        assert(sourceC2.observationCount === 1 && sourceC2.observations[0].observedAt === OBS_T3.toISOString(), '21. FLAGSHIP — C2\'s source-exclusive evolution carries exactly O3');

        // targetOnlyCandidateEvolutions: two groups, C1 (carrying its own
        // exclusive O4 — never merged with source's own exclusive O2) and
        // C2 (carrying O5).
        assert(result.targetOnlyCandidateEvolutions.length === 2, '22. FLAGSHIP — targetOnlyCandidateEvolutions carries exactly two groups');
        const [targetC1, targetC2] = result.targetOnlyCandidateEvolutions;
        assert(serialize(targetC1.candidate) === serialize(C1), '23. FLAGSHIP — the first target-exclusive group is C1, matching target\'s own first-appearance order');
        assert(targetC1.observationCount === 1 && targetC1.observations[0].observedAt === OBS_T4.toISOString(), '24. FLAGSHIP — C1\'s target-exclusive evolution carries exactly O4');
        assert(serialize(targetC2.candidate) === serialize(C2), '25. FLAGSHIP — the second target-exclusive group is C2');
        assert(targetC2.observationCount === 1 && targetC2.observations[0].observedAt === OBS_T5.toISOString(), '26. FLAGSHIP — C2\'s target-exclusive evolution carries exactly O5');

        // The crucial observation: C1 appears in BOTH sourceOnlyCandidateEvolutions
        // and targetOnlyCandidateEvolutions, each with its own, different,
        // exclusive observation — never merged, never compared, while a
        // THIRD observation of C1 (O1) is shared between the replicas at
        // the very same time.
        assert(sourceC1.observations[0].observedAt !== targetC1.observations[0].observedAt, '27. FLAGSHIP — C1\'s two exclusive evolutions, one per side, carry genuinely different observations, each attributed only to its own side, alongside the shared O1 that belongs to neither exclusive list');
    }
    console.log('✓ Section C: FLAGSHIP — the milestone\'s own worked example proves a candidate (C1) can have a shared observation with the other replica while simultaneously having exclusive observations on both sides');

    // ---------------------------------------------------------------
    // Section D — multiplicity.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);

        // Source: [O1, O1, O2] — O1 recorded twice. Target: [O1, O2].
        const sourceHistory = [O1, O1, O2];
        const targetHistory = [O1, O2];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);
        assert(result.sourceOnlyObservationCount === 1, '28. [O1, O1, O2] vs [O1, O2] reports exactly ONE exclusive O1, never zero or two');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === O1, '29. the one exclusive observation is O1 itself');
        assert(result.targetOnlyObservationCount === 0, '30. target has no exclusive observations — its single O1 and O2 both matched');
        assert(result.sharedObservationCount === 2, '31. exactly two observations matched away (one O1, one O2)');

        assert(result.sourceOnlyCandidateEvolutions.length === 1, '32. the one exclusive O1 produces exactly one candidate evolution group');
        assert(result.sourceOnlyCandidateEvolutions[0].observationCount === 1, '33. that group carries exactly one observation — the multiplicity is not doubled by grouping');
        assert(result.targetOnlyCandidateEvolutions.length === 0, '34. target\'s empty exclusive-observation set produces zero candidate evolution groups');
    }
    console.log('✓ Section D: multiplicity is preserved through the observation-level diff before grouping — [O1, O1, O2] vs [O1, O2] yields exactly one exclusive observation under one candidate group');

    // ---------------------------------------------------------------
    // Section E — same candidate, different observation outcome remain two
    // distinct observation events, each attributed to the correct
    // exclusive side.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planPresent = planNaming({ claims: ['Claim-1'] });
        const planAbsent = planNaming({ claims: [] });
        const sourceObservation = observe(D1, planPresent, OBS_T1);
        const targetObservation = observe(D1, planAbsent, OBS_T1);
        assert(serialize(sourceObservation.decision) === serialize(targetObservation.decision), '35. sanity — both observations concern the identical candidate/decision');
        assert(sourceObservation.candidatePresent !== targetObservation.candidatePresent, '36. sanity — the two observations genuinely disagree on candidatePresent');

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(historyOf(sourceObservation), historyOf(targetObservation));
        assert(result.sharedObservationCount === 0, '37. the same candidate observed differently on each side shares nothing');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === sourceObservation, '38. source\'s present observation is reported as source-only');
        assert(result.targetOnly.length === 1 && result.targetOnly[0] === targetObservation, '39. target\'s absent observation is reported as target-only — candidate identity never masks the difference');
        assert(result.sourceOnlyCandidateEvolutions.length === 1 && result.sourceOnlyCandidateEvolutions[0].observations[0].candidatePresent === true, '40. source\'s exclusive candidate evolution for C1 carries its own present observation, never target\'s absent one');
        assert(result.targetOnlyCandidateEvolutions.length === 1 && result.targetOnlyCandidateEvolutions[0].observations[0].candidatePresent === false, '41. target\'s exclusive candidate evolution for C1 carries its own absent observation, never source\'s present one');
    }
    console.log('✓ Section E: the same candidate observed present on one replica and absent on the other remains two distinct observation events, each correctly attributed to its own exclusive side');

    // ---------------------------------------------------------------
    // Section F — same candidate, same decision/plan, different observedAt.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const early = observe(D1, plan, OBS_T1);
        const late = observe(D1, plan, OBS_T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(historyOf(early), historyOf(late));
        assert(result.sharedObservationCount === 0, '42. same candidate, same decision/plan, different observedAt shares nothing');
        assert(result.sourceOnly[0] === early && result.targetOnly[0] === late, '43. neither cancels the other');
        assert(result.sourceOnlyCandidateEvolutions[0].observations[0].observedAt === OBS_T1.toISOString(), '44. source\'s exclusive evolution carries its own observedAt');
        assert(result.targetOnlyCandidateEvolutions[0].observations[0].observedAt === OBS_T2.toISOString(), '45. target\'s exclusive evolution carries its own observedAt');
    }
    console.log('✓ Section F: the same candidate under the same decision/plan but a different observedAt remains two distinct observation events');

    // ---------------------------------------------------------------
    // Section G — different candidate types never collide merely because
    // they share a numeric/string field.
    // ---------------------------------------------------------------
    {
        const claimOnly = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-9' });
        const snapshotOnly = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 0 });
        const divergent = Object.freeze({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'Claim-9', snapshotIndex: 0 });
        const plan = planNaming({ claims: ['Claim-9'], snapshots: [0], divergent: [['Claim-9', 0]] });

        const oClaimOnly = observe(genuineDecisionRecord(claimOnly, 'OBSERVE', T1), plan, OBS_T1);
        const oSnapshotOnly = observe(genuineDecisionRecord(snapshotOnly, 'OBSERVE', T1), plan, OBS_T1);
        const oDivergent = observe(genuineDecisionRecord(divergent, 'OBSERVE', T1), plan, OBS_T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(
            historyOf(oClaimOnly, oSnapshotOnly, oDivergent),
            []
        );

        assert(result.sourceOnlyObservationCount === 3, '46. all three differently typed observations are reported as exclusive');
        assert(result.sourceOnlyCandidateEvolutions.length === 3, '47. three separate candidate evolution groups are produced, never collapsed by a shared numeric/string field across types');

        const claimGroup = result.sourceOnlyCandidateEvolutions.find((e) => e.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        const snapshotGroup = result.sourceOnlyCandidateEvolutions.find((e) => e.candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM');
        const divergentGroup = result.sourceOnlyCandidateEvolutions.find((e) => e.candidate.type === 'DIVERGENT_CORRESPONDENCE');
        assert(claimGroup && claimGroup.observationCount === 1, '48. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT is its own independent group');
        assert(snapshotGroup && snapshotGroup.observationCount === 1, '49. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM is its own independent group, never merged with the claim-only group despite sharing claimId/snapshotIndex values');
        assert(divergentGroup && divergentGroup.observationCount === 1, '50. DIVERGENT_CORRESPONDENCE (claimId Claim-9, snapshotIndex 0) is its own independent group, never merged with either single-field candidate merely by sharing a claimId/snapshotIndex value');
    }
    console.log('✓ Section G: CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT, SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM, and DIVERGENT_CORRESPONDENCE never collide merely because they happen to share a numeric/string field');

    // ---------------------------------------------------------------
    // Section H — local duplicates are never normalized or removed.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);

        // Source's OWN history already holds O1 twice before any comparison —
        // both copies remain exclusive (target has none at all), and
        // grouping must carry both into C1's own evolution, never
        // deduplicating them.
        const sourceHistory = [O1, O1];
        const targetHistory = [];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);
        assert(result.sourceOnlyObservationCount === 2, '51. both of source\'s own local duplicate observations remain exclusive, never collapsed to one');
        assert(result.sourceOnly.length === 2 && result.sourceOnly[0] === O1 && result.sourceOnly[1] === O1, '52. sourceOnly carries both duplicate entries');
        assert(result.sourceOnlyCandidateEvolutions.length === 1, '53. both duplicates concern the same candidate, so exactly one candidate evolution group is produced');
        assert(result.sourceOnlyCandidateEvolutions[0].observationCount === 2, '54. that one group\'s own observationCount is 2 — the local duplicate is preserved through grouping, never normalized away');
        assert(result.sourceOnlyCandidateEvolutions[0].observations.length === 2, '55. that one group\'s own observations list carries both entries');
    }
    console.log('✓ Section H: pre-existing local duplicates within one side\'s own history are never normalized or removed by this projection');

    // ---------------------------------------------------------------
    // Section I — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const sourceHistory = [O1];
        const targetHistory = [O2];
        const sourceJsonBefore = serialize(sourceHistory);
        const targetJsonBefore = serialize(targetHistory);
        const o1JsonBefore = serialize(O1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);

        assert(serialize(sourceHistory) === sourceJsonBefore, '56. the source history is never mutated');
        assert(serialize(targetHistory) === targetJsonBefore, '57. the target history is never mutated');
        assert(serialize(O1) === o1JsonBefore, '58. the original observation record is never mutated');
        assert(result.sourceOnly[0] === O1, '59. sourceOnly holds the ORIGINAL observation object, never a reconstructed copy');

        assert(Object.isFrozen(result), '60. the result is frozen');
        assert(Object.isFrozen(result.sourceOnly), '61. sourceOnly is frozen');
        assert(Object.isFrozen(result.targetOnly), '62. targetOnly is frozen');
        assert(Object.isFrozen(result.sourceOnlyCandidateEvolutions), '63. sourceOnlyCandidateEvolutions is frozen');
        assert(Object.isFrozen(result.sourceOnlyCandidateEvolutions[0]), '64. each source-only candidate evolution entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);
        assert(serialize(again) === serialize(result), '65. repeated calls on identical inputs are byte-identical');
    }
    console.log('✓ Section I: neither input history nor any original observation record is mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section J — reconstruct()'s archive-reading boundary, calling 0.8.166
    // exactly once.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D1, plan, OBS_T2);
        const O3 = observe(D2, plan, OBS_T3);

        const sourceHistory = historyOf(O1, O2);
        const targetHistory = historyOf(O1, O3);
        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory);

        let sourceArchive = PublicationObservationArchive.empty();
        sourceArchive = sourceArchive.appendRevalidationObservationRecord(O1);
        sourceArchive = sourceArchive.appendRevalidationObservationRecord(O2);
        let targetArchive = PublicationObservationArchive.empty();
        targetArchive = targetArchive.appendRevalidationObservationRecord(O1);
        targetArchive = targetArchive.appendRevalidationObservationRecord(O3);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceArchive, targetArchive);
        assert(serialize(reconstructed) === serialize(described), '66. reconstruct() over archives holding the SAME observations agrees exactly with describe() over the equivalent raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference([], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '67. reconstruct() over two empty archives agrees exactly with describe() over two empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '68. reconstruct() over invalid/missing archives degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section J: reconstruct() reads only each archive\'s own stored observation history, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section K — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference().sourceObservationCount === 0, '69. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(null, undefined).sourceObservationCount === 0, '70. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference('not an array', 42).sourceObservationCount === 0, '71. malformed non-array histories degrade to empty, never throw');

        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, O1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(mixed, []);
        assert(result.sourceObservationCount === 1 && result.sourceOnly[0] === O1, '72. non-genuine entries are silently excluded, leaving only the one genuine observation');
        assert(result.sourceOnlyCandidateEvolutions.length === 1, '73. the sole surviving observation still produces one candidate evolution group');
    }
    console.log('✓ Section K: malformed/absent input degrades to a valid, empty/converged result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(historyOf(O1), []);

        const topKeys = Object.keys(result).sort();
        const expectedKeys = [
            'sourceObservationCount', 'targetObservationCount',
            'sharedObservationCount',
            'sourceOnlyObservationCount', 'targetOnlyObservationCount',
            'sourceOnly', 'targetOnly',
            'sourceOnlyCandidateEvolutions', 'targetOnlyCandidateEvolutions'
        ].sort();
        assert(serialize(topKeys) === serialize(expectedKeys), '74. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.sourceOnlyCandidateEvolutions[0]).sort();
        assert(serialize(groupKeys) === serialize(['candidate', 'observationCount', 'observations'].sort()), '75. a candidate evolution entry carries exactly the documented, factual fields');

        const forbidden = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term), `76. the result never carries interpretive/conflict vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifferenceView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'signature', 'verify'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `77. this file's own code never carries "${term}"`);
        }

        // This milestone must import only 0.8.166 (the observation-level
        // difference) and 0.8.172 (the candidate grouping) — nothing from
        // 0.8.144 through 0.8.165, or 0.8.167 through 0.8.171.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '78. this file imports from exactly two modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js'), '79. one import is 0.8.166\'s own observation history difference module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.js'), '80. the other import is 0.8.172\'s own candidate observation evolution module');
        assert(!codeOnly.includes('observationcandidatecorrespondenceview') && !codeOnly.includes('observationdeduplicationview') && !codeOnly.includes('observationhistorytimelineview') && !codeOnly.includes("./publisherleaderboardclaimsnapshotreconciliationdecisionrevalidationobservationhistory.js") && !codeOnly.includes('reconciliationplanview'), '81. this file never imports 0.8.162-0.8.165 or 0.8.171 directly, and never rediscovers a plan');
    }
    console.log('✓ Section L: the result carries no interpretive or conflict-resolution vocabulary, and the module imports only 0.8.166\'s observation-level difference and 0.8.172\'s candidate grouping, nothing else from the reconciliation family');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifferenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifferenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
