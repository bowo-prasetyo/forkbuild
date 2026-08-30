import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.166 — Revalidation Observation History Difference Projection.
//
// Section A: empty vs empty — no difference
// Section B: structurally identical, independently computed observations —
//            no difference, distinct objects, identical content
// Section C: one-sided observations — correct sourceOnly/targetOnly, each
//            the ORIGINAL observation record, never a copy
// Section D: complete structural observation identity, exercised directly
//            over the six-field key (decision, planIdentity,
//            candidatePresent, candidateType, candidateMatchesPlan,
//            observedAt) — a difference in ANY single field alone is
//            always a genuine, uncancelled difference
// Section E: same decision, same plan, different observedAt — the
//            "particularly valuable regression test": must never cancel
// Section F: same decision against two different plans — never cancel
// Section G: same candidate, different decision/plan/timestamp — OBSERVE
//            vs DEFER on the identical candidate is always a genuine
//            difference
// Section H: multiplicity preservation — [O1, O1, O2] vs [O1, O2] reports
//            exactly one O1 as exclusive, never zero or two
// Section I: all three of 0.8.144's own candidate types survive the
//            difference projection with their own fields intact
// Section J: FLAGSHIP — the milestone's own worked replica scenario:
//            C1 exists on both sides yet its histories still differ
// Section K: original-object preservation — sourceOnly/targetOnly are
//            never reconstructed copies
// Section L: malformed/absent input tolerance — never a throw
// Section M: immutability, determinism, and reconstruct()'s thin,
//            deliberately-empty archive boundary until 0.8.167
// Section N: architectural/vocabulary regression — zero imports, no
//            interpretive vocabulary, no dependency on 0.8.164/0.8.165

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
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

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

function baseObservation(overrides = {}) {
    return Object.freeze({
        observed: true,
        decision: Object.freeze({ decided: true, candidate: Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }), decision: 'OBSERVE', decidedAt: T1.toISOString() }),
        planIdentity: Object.freeze({ algorithm: 'SHA-256', planFingerprint: 'a'.repeat(64), candidateCount: 1 }),
        candidatePresent: true,
        candidateType: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT',
        candidateMatchesPlan: true,
        observedAt: OBS_T1.toISOString(),
        ...overrides
    });
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:06:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');

const CANDIDATE_C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' });
const CANDIDATE_C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' });

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([], []);
        assert(diff.sameHistory === true, '1. two empty histories report sameHistory');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '2. two empty histories report zero exclusive observations on either side');
        assert(diff.sourceOnly.length === 0 && diff.targetOnly.length === 0, '3. two empty histories report empty sourceOnly/targetOnly arrays');
        assert(diff.sourceCount === 0 && diff.targetCount === 0, '4. two empty histories report zero counts on each side');
    }
    console.log('✓ Section A: two empty histories report no difference at all');

    // ---------------------------------------------------------------
    // Section B — structurally identical, independently computed
    // observations.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const one = observe(D1, planA, OBS_T1);
        const two = observe(D1, planA, OBS_T1);
        assert(one !== two, '5. sanity — two independently computed observation records are distinct objects');
        assert(serialize(one) === serialize(two), '6. sanity — but their serialized content is identical');

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([one], [two]);
        assert(diff.sameHistory === true, '7. two structurally identical, independently computed observations report no difference');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '8. sourceOnly/targetOnly counts are both zero');
        assert(diff.sourceCount === 1 && diff.targetCount === 1, '9. each side\'s own count is still reported correctly even when there is no difference');
    }
    console.log('✓ Section B: structurally identical, independently computed observations report no difference');

    // ---------------------------------------------------------------
    // Section C — one-sided observations.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'OBSERVE', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });

        const sourceOnlyObservation = observe(D2, planA, OBS_T2);
        const sharedForSource = observe(D1, planA, OBS_T1);
        const sharedForTarget = observe(D1, planA, OBS_T1);

        const sourceHistory = [sourceOnlyObservation, sharedForSource];
        const targetHistory = [sharedForTarget];

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sameHistory === false, '10. one-sided observations report sameHistory === false');
        assert(diff.sourceOnlyCount === 1 && diff.targetOnlyCount === 0, '11. exactly one source-only observation, none on the target side');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === sourceOnlyObservation, '12. sourceOnly holds exactly the exclusive record, as the ORIGINAL observation object');
        assert(diff.targetOnly.length === 0, '13. targetOnly is empty — the shared observation cancels out on both sides');
    }
    console.log('✓ Section C: one-sided observations are reported as exactly the correct source-only/target-only original records');

    // ---------------------------------------------------------------
    // Section D — complete structural observation identity, exercised
    // directly over the six-field key. A difference in ANY single field
    // alone is always a genuine, uncancelled difference; an exact copy
    // always cancels.
    // ---------------------------------------------------------------
    {
        const control = baseObservation();
        const exactCopy = baseObservation();
        assert(control !== exactCopy && serialize(control) === serialize(exactCopy), '14. sanity — control and its exact copy are distinct objects with identical content');
        const controlDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([control], [exactCopy]);
        assert(controlDiff.sameHistory === true, '15. an exact structural copy cancels out — the control case');

        const variants = [
            ['decision', Object.freeze({ decided: true, candidate: Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'DIFFERENT' }), decision: 'OBSERVE', decidedAt: T1.toISOString() })],
            ['planIdentity', Object.freeze({ algorithm: 'SHA-256', planFingerprint: 'b'.repeat(64), candidateCount: 1 })],
            ['candidatePresent', false],
            ['candidateType', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM'],
            ['candidateMatchesPlan', false],
            ['observedAt', OBS_T2.toISOString()]
        ];
        for (const [field, value] of variants) {
            const variant = baseObservation({ [field]: value });
            const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([control], [variant]);
            assert(diff.sameHistory === false, `16. varying only "${field}" alone produces a genuine, uncancelled difference`);
            assert(diff.sourceOnly[0] === control && diff.targetOnly[0] === variant, `17. varying only "${field}" — neither side's record cancels the other`);
        }
    }
    console.log('✓ Section D: complete structural observation identity — a difference in any one of the six fields alone is always a genuine difference, and an exact structural copy always cancels');

    // ---------------------------------------------------------------
    // Section E — same decision, same plan, different observedAt. THE
    // PARTICULARLY VALUABLE REGRESSION TEST: two observations with
    // identical candidate, decision, plan identity, and revalidation facts
    // but different observedAt must never cancel each other.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });

        const earlyObservation = observe(D1, planA, OBS_T1);
        const lateObservation = observe(D1, planA, OBS_T2);
        assert(earlyObservation.decision === lateObservation.decision || serialize(earlyObservation.decision) === serialize(lateObservation.decision), '18. sanity — both observations concern the identical decision');
        assert(serialize(earlyObservation.planIdentity) === serialize(lateObservation.planIdentity), '19. sanity — both observations concern the identical plan');
        assert(earlyObservation.observedAt !== lateObservation.observedAt, '20. sanity — the two observations genuinely differ only in observedAt');

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([earlyObservation], [lateObservation]);
        assert(diff.sameHistory === false, '21. REGRESSION — same decision, same plan, different observedAt is a genuine, never-cancelled difference');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === earlyObservation, '22. REGRESSION — the early observation is reported as source-only');
        assert(diff.targetOnly.length === 1 && diff.targetOnly[0] === lateObservation, '23. REGRESSION — the late observation is reported as target-only, never treated as "the same observation, made twice"');
    }
    console.log('✓ Section E: PARTICULARLY VALUABLE TEST — same decision and plan, differing only in observedAt, must never cancel each other');

    // ---------------------------------------------------------------
    // Section F — same decision against two different plans.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const planB = planNaming({ claims: ['C2'] });

        const againstPlanA = observe(D1, planA, OBS_T1);
        const againstPlanB = observe(D1, planB, OBS_T1);
        assert(serialize(againstPlanA.planIdentity) !== serialize(againstPlanB.planIdentity), '24. sanity — the two plans genuinely fingerprint differently');

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([againstPlanA], [againstPlanB]);
        assert(diff.sameHistory === false, '25. same decision, different plans, is a genuine difference');
        assert(diff.sourceOnly[0] === againstPlanA && diff.targetOnly[0] === againstPlanB, '26. neither observation cancels the other');
    }
    console.log('✓ Section F: the same decision revalidated against two different plans is always a genuine, uncancelled difference');

    // ---------------------------------------------------------------
    // Section G — same candidate, different decision/plan/timestamp:
    // OBSERVE vs DEFER on the identical candidate.
    // ---------------------------------------------------------------
    {
        const planA = planNaming({ claims: ['C1'] });
        const observeDecision = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const deferDecision = genuineDecisionRecord(CANDIDATE_C1, 'DEFER', T1);

        const observeObservation = observe(observeDecision, planA, OBS_T1);
        const deferObservation = observe(deferDecision, planA, OBS_T1);
        assert(serialize(observeDecision.candidate) === serialize(deferDecision.candidate), '27. sanity — both decisions genuinely concern the identical candidate');

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([observeObservation], [deferObservation]);
        assert(diff.sameHistory === false, '28. the identical candidate observed via OBSERVE on one side and DEFER on the other is a genuine difference, never treated as already reconciled');
        assert(diff.sourceOnly[0] === observeObservation && diff.targetOnly[0] === deferObservation, '29. candidate identity never masks the disagreement');
    }
    console.log('✓ Section G: the same candidate carried by OBSERVE on one side and DEFER on the other reports both records as exclusive');

    // ---------------------------------------------------------------
    // Section H — multiplicity preservation.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });

        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const sourceHistory = [O1, O1, O2];
        const targetHistory = [O1, O2];

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sourceOnlyCount === 1, '30. [O1, O1, O2] vs [O1, O2] reports exactly ONE exclusive O1, never zero or two');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === O1, '31. the one exclusive observation is O1 itself');
        assert(diff.targetOnlyCount === 0, '32. the target side has no exclusive observations — its single O1 and its O2 both matched');
        assert(diff.sameHistory === false, '33. multiplicity difference alone is still a genuine difference');
    }
    console.log('✓ Section H: [O1, O1, O2] versus [O1, O2] reports exactly one exclusive observation — only one occurrence of O1 is cancelled, multiplicity is never collapsed to a set');

    // ---------------------------------------------------------------
    // Section I — all three of 0.8.144's own candidate types survive the
    // difference projection with their own fields intact.
    // ---------------------------------------------------------------
    {
        const planA = planNaming({ claims: ['C1'], snapshots: [7], divergent: [['CB', 0]] });

        const divergentDecision = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'CB', snapshotIndex: 0 }, 'OBSERVE', T1);
        const claimOnlyDecision = genuineDecisionRecord(CANDIDATE_C1, 'DEFER', T2);
        const snapshotOnlyDecision = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 7 }, 'OBSERVE', T3);

        const divergentObservation = observe(divergentDecision, planA, OBS_T1);
        const claimOnlyObservation = observe(claimOnlyDecision, planA, OBS_T2);
        const snapshotOnlyObservation = observe(snapshotOnlyDecision, planA, OBS_T3);

        const sourceHistory = [divergentObservation, claimOnlyObservation, snapshotOnlyObservation];
        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, []);

        assert(diff.sourceOnly.length === 3, '34. all three candidate-type observations are reported as source-only');
        assert(diff.sourceOnly[0] === divergentObservation && diff.sourceOnly[0].candidateType === 'DIVERGENT_CORRESPONDENCE', '35. the DIVERGENT_CORRESPONDENCE observation is preserved with its own candidateType');
        assert(diff.sourceOnly[1] === claimOnlyObservation && diff.sourceOnly[1].candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '36. the CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT observation is preserved with its own candidateType');
        assert(diff.sourceOnly[2] === snapshotOnlyObservation && diff.sourceOnly[2].candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '37. the SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM observation is preserved with its own candidateType');

        // Identical set on both sides cancels completely, regardless of
        // candidate type diversity.
        const divergentObservationAgain = observe(divergentDecision, planA, OBS_T1);
        const claimOnlyObservationAgain = observe(claimOnlyDecision, planA, OBS_T2);
        const snapshotOnlyObservationAgain = observe(snapshotOnlyDecision, planA, OBS_T3);
        const mirroredDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(
            sourceHistory,
            [divergentObservationAgain, claimOnlyObservationAgain, snapshotOnlyObservationAgain]
        );
        assert(mirroredDiff.sameHistory === true, '38. all three candidate types, mirrored identically on both sides, report no difference');
    }
    console.log('✓ Section I: all three of 0.8.144\'s own candidate types survive the difference projection with their own fields intact');

    // ---------------------------------------------------------------
    // Section J — FLAGSHIP: the milestone's own worked replica scenario.
    //
    //   Source: O1 = C1/OBSERVE/PlanA/T1, O2 = C1/DEFER/PlanA/T2,
    //           O3 = C2/OBSERVE/PlanB/T3
    //   Target: O1 = C1/OBSERVE/PlanA/T1, O4 = C1/OBSERVE/PlanB/T4,
    //           O5 = C2/OBSERVE/PlanB/T3   (O5 byte-identical to O3)
    //
    //   Expected: shared O1 and O3(=O5); sourceOnly = [O2]; targetOnly = [O4]
    //   C1 exists on BOTH sides — its histories still differ.
    // ---------------------------------------------------------------
    {
        const planA = planNaming({ claims: ['C1'] });
        const planB = planNaming({ claims: ['C2'] });

        const decisionObserveC1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const decisionDeferC1 = genuineDecisionRecord(CANDIDATE_C1, 'DEFER', T2);
        const decisionObserveC2 = genuineDecisionRecord(CANDIDATE_C2, 'OBSERVE', T3);

        const O1 = observe(decisionObserveC1, planA, OBS_T1);
        const O2 = observe(decisionDeferC1, planA, OBS_T2);
        const O3 = observe(decisionObserveC2, planB, OBS_T3);

        const O1_target = observe(decisionObserveC1, planA, OBS_T1);
        const O4 = observe(decisionObserveC1, planB, OBS_T4);
        const O5 = observe(decisionObserveC2, planB, OBS_T3);

        assert(serialize(O1) === serialize(O1_target), '39. FLAGSHIP setup — O1 is byte-identical on both replicas');
        assert(serialize(O3) === serialize(O5), '40. FLAGSHIP setup — O3 and O5 are byte-identical');
        assert(O4.candidatePresent === false, '41. FLAGSHIP setup — C1 genuinely does not occur in Plan B, so O4 reads candidatePresent: false');

        const sourceHistory = [O1, O2, O3];
        const targetHistory = [O1_target, O4, O5];

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sourceCount === 3 && diff.targetCount === 3, '42. FLAGSHIP — each side\'s own raw count is reported correctly');
        assert(diff.sameHistory === false, '43. FLAGSHIP — the two replicas\' observation histories genuinely differ');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === O2, '44. FLAGSHIP — sourceOnly is exactly [O2]');
        assert(diff.targetOnly.length === 1 && diff.targetOnly[0] === O4, '45. FLAGSHIP — targetOnly is exactly [O4]');
        assert(!diff.sourceOnly.includes(O1) && !diff.targetOnly.includes(O1_target), '46. FLAGSHIP — the shared O1 appears in neither exclusive list');
        assert(!diff.sourceOnly.includes(O3) && !diff.targetOnly.includes(O5), '47. FLAGSHIP — the shared O3/O5 appears in neither exclusive list');

        // The interesting property: C1 exists on both sides (O1/O1_target,
        // O2, and O4 all name C1), yet its histories still differ. The
        // projection reports records, never a verdict about C1.
        const candidateOfExclusive = [diff.sourceOnly[0].decision.candidate.claimId, diff.targetOnly[0].decision.candidate.claimId];
        assert(candidateOfExclusive[0] === 'C1' && candidateOfExclusive[1] === 'C1', '48. FLAGSHIP — the exclusive records on BOTH sides name the identical candidate C1, proving candidate presence on both sides does not imply matching histories');
        assert(!('conflicting' in diff) && !('inconsistent' in diff), '49. FLAGSHIP — the result never labels this as conflicting, only reports the exclusive records');
    }
    console.log('✓ Section J: FLAGSHIP — C1 exists on both replicas yet their observation histories still genuinely differ; sourceOnly/targetOnly report exactly the documented exclusive records');

    // ---------------------------------------------------------------
    // Section K — original-object preservation.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([O1], [O2]);
        assert(diff.sourceOnly[0] === O1, '50. sourceOnly holds the exact original observation object, never a reconstructed copy');
        assert(diff.targetOnly[0] === O2, '51. targetOnly holds the exact original observation object, never a reconstructed copy');
        assert(Object.is(diff.sourceOnly[0].decision, O1.decision), '52. the embedded decision field is the identical, unreconstructed object reference');
        assert(Object.is(diff.sourceOnly[0].planIdentity, O1.planIdentity), '53. the embedded planIdentity field is the identical, unreconstructed object reference');
    }
    console.log('✓ Section K: sourceOnly/targetOnly always hold the exact original observation record objects, never reconstructed copies');

    // ---------------------------------------------------------------
    // Section L — malformed/absent input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference().sameHistory === true, '54. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(null, undefined).sameHistory === true, '55. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference('not an array', 42).sameHistory === true, '56. malformed non-array histories degrade to empty, never throw');

        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);

        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, O1];
        const diffMixed = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(mixed, []);
        assert(diffMixed.sourceCount === 1 && diffMixed.sourceOnly[0] === O1, '57. non-genuine entries are silently excluded from comparison, leaving only the one genuine observation');

        const bothMixed = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(mixed, mixed);
        assert(bothMixed.sourceCount === 1 && bothMixed.targetCount === 1 && bothMixed.sameHistory === true, '58. identical garbage-laden arrays on both sides still resolve to the one genuine observation cancelling out');
    }
    console.log('✓ Section L: malformed, absent, and garbage-laden input is tolerated everywhere, never a throw');

    // ---------------------------------------------------------------
    // Section M — immutability, determinism, and reconstruct()'s thin,
    // deliberately-empty archive boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const sourceHistory = [O1];
        const targetHistory = [O2];
        const sourceSnapshotBefore = sourceHistory.slice();
        const targetSnapshotBefore = targetHistory.slice();
        const o1JsonBefore = serialize(O1);

        const diffOnce = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
        const diffTwice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
        assert(serialize(sourceHistory) === serialize(sourceSnapshotBefore), '59. the source history is never mutated');
        assert(serialize(targetHistory) === serialize(targetSnapshotBefore), '60. the target history is never mutated');
        assert(serialize(O1) === o1JsonBefore, '61. an observation record inside the history is never mutated');
        assert(serialize(diffOnce) === serialize(diffTwice), '62. repeated calls on identical inputs are byte-identical');

        assert(Object.isFrozen(diffOnce), '63. the difference result is frozen');
        assert(Object.isFrozen(diffOnce.sourceOnly), '64. sourceOnly is frozen');
        assert(Object.isFrozen(diffOnce.targetOnly), '65. targetOnly is frozen');

        // reconstruct() — thin, deliberately-empty archive boundary until
        // 0.8.167. Every archive shape, genuine or malformed, produces the
        // identical empty-vs-empty result.
        const emptyDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([], []);
        const reconstructedFromEmptyArchives = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(reconstructedFromEmptyArchives) === serialize(emptyDiff), '66. reconstruct() over two genuine, empty archives returns the empty-vs-empty result');

        const populatedArchive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(D1);
        const reconstructedFromPopulated = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(populatedArchive, populatedArchive);
        assert(serialize(reconstructedFromPopulated) === serialize(emptyDiff), '67. reconstruct() over archives holding unrelated collections still returns the empty-vs-empty result — no observation-history collection exists yet');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDiff), '68. reconstruct() over invalid/missing archives also returns the empty-vs-empty result, never a throw');

        const reconstructedTwice = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(populatedArchive, PublicationObservationArchive.empty());
        assert(serialize(reconstructedTwice) === serialize(emptyDiff), '69. reconstruct() is deterministic regardless of which archive is genuine or malformed');
    }
    console.log('✓ Section M: neither input history nor any record it holds is ever mutated, repeated calls are byte-identical, results are frozen, and reconstruct() remains a thin, deliberately-empty archive boundary until 0.8.167');

    // ---------------------------------------------------------------
    // Section N — architectural/vocabulary regression.
    // ---------------------------------------------------------------
    {
        const emptyDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([], []);
        const keys = Object.keys(emptyDiff).sort();
        assert(serialize(keys) === serialize(['sourceCount', 'targetCount', 'sourceOnlyCount', 'targetOnlyCount', 'sourceOnly', 'targetOnly', 'sameHistory'].sort()), '70. the result carries exactly the documented, factual fields');

        const forbidden = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `71. the result never carries interpretive/trust vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '72. this file imports nothing at all — no dependency on 0.8.162/0.8.163/0.8.164/0.8.165 or any decision/plan/archive module');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        // "valid"/"invalid" are deliberately excluded: this file's own name
        // and every function inside it carry "Revalidation," which itself
        // contains the substring "valid" — the identical exclusion
        // 0.8.163's/0.8.164's own architecture tests already apply.
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'latest', 'current', 'correct', 'stale', 'timeline', 'statistics'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `73. this file's own code never carries "${term}"`);
        }

        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js');
        assert(typeof module.describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference === 'function', '74. describeXxx() is exported');
        assert(typeof module.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference === 'function', '75. reconstructXxx() is exported');

        const originalFetch = globalThis.fetch;
        let networkCallOccurred = false;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        try {
            describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([], []);
            reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(networkCallOccurred === false, '76. this projection performs zero network access');
    }
    console.log('✓ Section N: zero imports, no interpretive/state-machine vocabulary anywhere in code or result shape, and both entry points are exported correctly');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.test.js FAILED:', error);
    process.exitCode = 1;
});
