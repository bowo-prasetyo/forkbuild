import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreementView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.170 — Revalidation Observation Agreement Projection.
//
// Section A: empty vs empty — a fully converged, empty agreement
// Section B: converged histories — structurally identical observations on
//            both sides are entirely shared, zero exclusive, one shared plan
// Section C: FLAGSHIP — the milestone's own worked scenario: a plan can be
//            SHARED even though the histories contain different
//            observations about it (observation-level disagreement does not
//            imply plan-level disagreement)
// Section D: same observation implies same plan — the forced direction
// Section E: SECOND CRITICAL TEST — two observations differing only in
//            candidateMatchesPlan remain distinct observations, even though
//            decision/planIdentity/candidate/observedAt are all identical
// Section F: two observations differing only in observedAt remain distinct
// Section G: multiplicity in the shared multiset itself
// Section H: no mutation, frozen results, determinism
// Section I: reconstruct()'s archive-reading boundary
// Section J: malformed input tolerance
// Section K: vocabulary/import boundary

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

// Builds a raw observation record directly, under this test's own exact
// control of every field — used only where the flagship scenario requires
// two observations sharing an identical planIdentity while genuinely
// disagreeing on candidatePresent/candidateMatchesPlan, a combination
// observe() itself cannot be coaxed into producing from a single plan.
function observationOf(decisionRecord, planIdentity, candidatePresent, candidateType, candidateMatchesPlan, observedAt) {
    return Object.freeze({
        observed: true,
        decision: decisionRecord,
        planIdentity,
        candidatePresent,
        candidateType,
        candidateMatchesPlan,
        observedAt: observedAt.toISOString()
    });
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
const T4 = new Date('2026-08-30T10:09:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');

const CANDIDATE_C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' });
const CANDIDATE_C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' });

function planAgreementFor(result, planIdentity) {
    return result.planAgreements.find((entry) => serialize(entry.planIdentity) === serialize(planIdentity));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([], []);
        assert(result.sameHistory === true, '1. two empty histories report sameHistory');
        assert(result.sourceObservationCount === 0 && result.targetObservationCount === 0, '2. zero raw observation counts on each side');
        assert(result.sharedObservationCount === 0 && result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '3. zero shared/exclusive observation counts');
        assert(result.sharedObservations.length === 0 && result.sourceOnly.length === 0 && result.targetOnly.length === 0, '4. sharedObservations/sourceOnly/targetOnly are empty arrays');
        assert(result.distinctPlanCount === 0 && result.sharedPlanCount === 0 && result.sourceOnlyPlanCount === 0 && result.targetOnlyPlanCount === 0, '5. zero plan-level counts');
        assert(result.planAgreements.length === 0, '6. planAgreements is an empty array');
        assert(Object.isFrozen(result), '7. an empty result is frozen');
    }
    console.log('✓ Section A: two empty histories produce a fully converged, empty agreement');

    // ---------------------------------------------------------------
    // Section B — converged histories.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const sourceHistory = [O1, O2];
        const targetHistory = [observe(D1, planA, OBS_T1), observe(D2, planA, OBS_T2)];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory);
        assert(result.sameHistory === true, '8. structurally identical histories converge');
        assert(result.sourceObservationCount === 2 && result.targetObservationCount === 2, '9. raw observation counts are still reported');
        assert(result.sharedObservationCount === 2, '10. both observations are shared');
        assert(result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '11. no exclusive observations on either side');
        assert(result.distinctPlanCount === 1 && result.sharedPlanCount === 1, '12. the single plan (both observations name the identical plan identity) is shared, none exclusive');
        assert(result.sourceOnlyPlanCount === 0 && result.targetOnlyPlanCount === 0, '13. no exclusive plans');
        assert(result.planAgreements.length === 1, '14. one plan agreement group');
        assert(result.planAgreements[0].sharedObservationCount === 2 && result.planAgreements[0].sourceOnlyObservationCount === 0 && result.planAgreements[0].targetOnlyObservationCount === 0, '15. the plan agreement group carries both shared observations and zero exclusive ones');
    }
    console.log('✓ Section B: converged histories report every observation and plan as shared, zero exclusive');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the milestone's own worked scenario.
    //
    //   Alice (source): O1 = D1+P1+present+T1, O2 = D2+P1+absent+T2
    //   Bob   (target): O1 = D1+P1+present+T1, O3 = D2+P1+present+T3,
    //                    O4 = D3+P2+absent+T4
    //
    //   Expected: shared observations = [O1]; sourceOnly = [O2];
    //   targetOnly = [O3, O4]; shared plans = [P1]; sourceOnly plans = [];
    //   targetOnly plans = [P2]. P1 is shared even though the histories
    //   contain different observations about P1. Built directly (not
    //   through observe()) so every field, including planIdentity and
    //   candidatePresent, is under this test's own exact control.
    // ---------------------------------------------------------------
    {
        const P1 = Object.freeze({ algorithm: 'SHA-256', planFingerprint: '1'.repeat(64), candidateCount: 1 });
        const P2 = Object.freeze({ algorithm: 'SHA-256', planFingerprint: '2'.repeat(64), candidateCount: 1 });

        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'OBSERVE', T2);
        const D3 = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 0 }, 'OBSERVE', T3);

        const O1 = observationOf(D1, P1, true, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', true, OBS_T1);
        const O2 = observationOf(D2, P1, false, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', false, OBS_T2);
        const O1_target = observationOf(D1, P1, true, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', true, OBS_T1);
        assert(serialize(O1) === serialize(O1_target), '16. FLAGSHIP setup — O1 is byte-identical on both replicas');

        // O3 concerns the SAME decision AND the SAME plan identity as O2,
        // yet reports the candidate present rather than absent, at a
        // different observedAt — deliberately a DIFFERENT observation from
        // O2 despite sharing the identical planIdentity.
        const O3 = observationOf(D2, P1, true, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', true, OBS_T3);
        assert(serialize(O3.planIdentity) === serialize(O2.planIdentity), '17. FLAGSHIP setup — O2 and O3 concern the IDENTICAL plan identity P1');
        assert(serialize(O3) !== serialize(O2), '18. FLAGSHIP setup — yet O2 and O3 are genuinely different observations (candidatePresent/candidateMatchesPlan/observedAt all differ)');

        const O4 = observationOf(D3, P2, false, 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', false, OBS_T4);

        const sourceHistory = [O1, O2];
        const targetHistory = [O1_target, O3, O4];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory);

        assert(result.sameHistory === false, '20. FLAGSHIP — Alice and Bob genuinely differ');
        assert(result.sourceObservationCount === 2 && result.targetObservationCount === 3, '21. FLAGSHIP — raw observation counts on each side');
        assert(result.sharedObservationCount === 1, '22. FLAGSHIP — exactly one shared observation, O1');
        assert(result.sharedObservations.length === 1 && result.sharedObservations[0] === O1, '23. FLAGSHIP — sharedObservations carries the ORIGINAL source record for O1');
        assert(result.sourceOnlyObservationCount === 1 && result.sourceOnly[0] === O2, '24. FLAGSHIP — sourceOnly is exactly [O2]');
        assert(result.targetOnlyObservationCount === 2 && result.targetOnly[0] === O3 && result.targetOnly[1] === O4, '25. FLAGSHIP — targetOnly is exactly [O3, O4], in Bob\'s own order');

        // Plan-level: Plan A (O1/O2's own planIdentity) is represented on
        // BOTH replicas (Alice via O1/O2, Bob via O1_target), so it is a
        // SHARED PLAN, even though the underlying observations about it
        // (O2 vs nothing matching, and no O3-plan-A match) genuinely differ.
        const planAIdentity = O1.planIdentity;
        const planBIdentity = O4.planIdentity;
        assert(result.distinctPlanCount === 2, '26. FLAGSHIP — two distinct plan identities in total (Plan A and Plan B)');
        assert(result.sharedPlanCount === 1, '27. FLAGSHIP — exactly one SHARED plan, Plan A — represented on both replicas');
        assert(result.sourceOnlyPlanCount === 0, '28. FLAGSHIP — no source-only plan — every plan Alice names is also named by Bob');
        assert(result.targetOnlyPlanCount === 1, '29. FLAGSHIP — exactly one target-only plan, Plan B');

        const planAAgreement = planAgreementFor(result, planAIdentity);
        assert(planAAgreement !== undefined, '30. FLAGSHIP — Plan A appears in planAgreements exactly once');
        assert(planAAgreement.sharedObservationCount === 1, '31. FLAGSHIP — Plan A carries exactly one shared observation (O1)');
        assert(planAAgreement.sourceOnlyObservationCount === 1, '32. FLAGSHIP — Plan A ALSO carries one Alice-exclusive observation (O2) despite being a shared plan');
        assert(planAAgreement.targetOnlyObservationCount === 1, '33. FLAGSHIP — Plan A ALSO carries one Bob-exclusive observation (O3) despite being a shared plan');

        const planBAgreement = planAgreementFor(result, planBIdentity);
        assert(planBAgreement.sharedObservationCount === 0 && planBAgreement.sourceOnlyObservationCount === 0 && planBAgreement.targetOnlyObservationCount === 1, '34. FLAGSHIP — Plan B (target-only plan) carries exactly one target-only observation, zero shared, zero source-only');

        assert(result.planAgreements.length === 2, '35. FLAGSHIP — exactly two plan agreement groups total');
        assert(!('conflicting' in result) && !('inconsistent' in result), '36. FLAGSHIP — the result never labels this as conflicting, only reports the shared/exclusive records and plans');
    }
    console.log('✓ Section C: FLAGSHIP — a plan can be SHARED even though the histories contain genuinely different observations about it; observation-level agreement and plan-level agreement are computed independently');

    // ---------------------------------------------------------------
    // Section D — same observation implies same plan (the forced
    // direction, since planIdentity is one of the six observation-identity
    // fields).
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O1_again = observe(D1, planA, OBS_T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([O1], [O1_again]);
        assert(result.sharedObservationCount === 1, '37. the two independently computed but byte-identical observations are shared');
        assert(result.sharedPlanCount === 1 && result.sourceOnlyPlanCount === 0 && result.targetOnlyPlanCount === 0, '38. the shared observation\'s own plan is necessarily a shared plan too');
    }
    console.log('✓ Section D: a shared observation always implies its own plan identity is a shared plan');

    // ---------------------------------------------------------------
    // Section E — SECOND CRITICAL TEST: two observations differing only in
    // candidateMatchesPlan remain distinct observations.
    // ---------------------------------------------------------------
    {
        const control = baseObservation();
        const variant = baseObservation({ candidateMatchesPlan: false });
        assert(serialize(control.decision) === serialize(variant.decision), '39. sanity — decision is identical');
        assert(serialize(control.planIdentity) === serialize(variant.planIdentity), '40. sanity — planIdentity is identical');
        assert(control.candidateType === variant.candidateType && control.candidatePresent === variant.candidatePresent, '41. sanity — candidate facts are identical');
        assert(control.observedAt === variant.observedAt, '42. sanity — observedAt is identical');

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([control], [variant]);
        assert(result.sameHistory === false, '43. CRITICAL — differing ONLY in candidateMatchesPlan is a genuine, uncancelled difference');
        assert(result.sharedObservationCount === 0, '44. CRITICAL — zero shared observations; they remain distinct despite five of six fields matching');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === control, '45. CRITICAL — control is reported as source-only');
        assert(result.targetOnly.length === 1 && result.targetOnly[0] === variant, '46. CRITICAL — variant is reported as target-only');
        // Yet the plan itself is still a shared plan, since both name the
        // identical planIdentity.
        assert(result.sharedPlanCount === 1 && result.sourceOnlyPlanCount === 0 && result.targetOnlyPlanCount === 0, '47. CRITICAL — the plan they both concern is still a SHARED plan, even though the observations about it are not shared');
    }
    console.log('✓ Section E: SECOND CRITICAL TEST — two observations differing only in candidateMatchesPlan remain genuinely distinct observations, protecting the six-field identity boundary');

    // ---------------------------------------------------------------
    // Section F — two observations differing only in observedAt remain
    // distinct.
    // ---------------------------------------------------------------
    {
        const control = baseObservation();
        const variant = baseObservation({ observedAt: OBS_T2.toISOString() });

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([control], [variant]);
        assert(result.sameHistory === false, '48. CRITICAL — differing ONLY in observedAt is a genuine, uncancelled difference');
        assert(result.sharedObservationCount === 0, '49. CRITICAL — zero shared observations');
        assert(result.sourceOnly[0] === control && result.targetOnly[0] === variant, '50. CRITICAL — neither side\'s record cancels the other');
        assert(result.sharedPlanCount === 1, '51. CRITICAL — the plan they both concern is still a SHARED plan');
    }
    console.log('✓ Section F: two observations differing only in observedAt also remain genuinely distinct observations');

    // ---------------------------------------------------------------
    // Section G — multiplicity in the shared multiset itself.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);

        // Alice: [O1, O1]. Bob: [O1, O1, O1]. Two of Bob's three O1 copies
        // match Alice's two — sharedObservationCount is 2 (the matched
        // multiset), never 3 (a naive membership check) and never 1 (a set,
        // not multiset, intersection).
        const sourceHistory = [O1, O1];
        const targetHistory = [O1, O1, O1];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory);
        assert(result.sourceObservationCount === 2 && result.targetObservationCount === 3, '52. raw counts reflect each side\'s own local duplicates');
        assert(result.sharedObservationCount === 2, '53. exactly two shared observations — the matched multiset, never 1 (set intersection) or 3 (naive membership)');
        assert(result.sourceOnlyObservationCount === 0, '54. Alice has no exclusive observations — both of her O1 copies matched');
        assert(result.targetOnlyObservationCount === 1, '55. Bob\'s third, unmatched O1 copy is target-only');
        assert(result.sharedObservations.length === 2 && result.sharedObservations[0] === O1 && result.sharedObservations[1] === O1, '56. sharedObservations carries both matched copies, from Alice\'s own history');
        assert(result.sharedPlanCount === 1, '57. the shared plan is still counted exactly once regardless of observation multiplicity');
    }
    console.log('✓ Section G: multiplicity in the shared multiset itself is preserved — [O1,O1] vs [O1,O1,O1] reports exactly two shared observations, never a set-style collapse to one');

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);
        const sourceHistory = [O1, O2];
        const targetHistory = [O1];
        const sourceJsonBefore = serialize(sourceHistory);
        const targetJsonBefore = serialize(targetHistory);
        const o1JsonBefore = serialize(O1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory);

        assert(serialize(sourceHistory) === sourceJsonBefore, '58. the source history is never mutated');
        assert(serialize(targetHistory) === targetJsonBefore, '59. the target history is never mutated');
        assert(serialize(O1) === o1JsonBefore, '60. the original observation record is never mutated');
        assert(result.sharedObservations[0] === O1, '61. sharedObservations holds the ORIGINAL observation object, never a reconstructed copy');

        assert(Object.isFrozen(result), '62. the result is frozen');
        assert(Object.isFrozen(result.sharedObservations), '63. sharedObservations is frozen');
        assert(Object.isFrozen(result.sourceOnly), '64. sourceOnly is frozen');
        assert(Object.isFrozen(result.targetOnly), '65. targetOnly is frozen');
        assert(Object.isFrozen(result.planAgreements), '66. planAgreements is frozen');
        assert(Object.isFrozen(result.planAgreements[0]), '67. each plan agreement entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory);
        assert(serialize(again) === serialize(result), '68. repeated calls on identical inputs are byte-identical');
    }
    console.log('✓ Section H: neither input history nor any original observation record is mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section I — reconstruct()'s archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(CANDIDATE_C2, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);
        const O3 = observe(D2, planA, OBS_T3);

        const aliceHistory = [O1, O2];
        const bobHistory = [O1, O3];
        const described = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(aliceHistory, bobHistory);

        let aliceArchive = PublicationObservationArchive.empty();
        aliceArchive = aliceArchive.appendRevalidationObservationRecord(O1);
        aliceArchive = aliceArchive.appendRevalidationObservationRecord(O2);
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendRevalidationObservationRecord(O1);
        bobArchive = bobArchive.appendRevalidationObservationRecord(O3);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(aliceArchive, bobArchive);
        assert(serialize(reconstructed) === serialize(described), '69. reconstruct() over archives holding the SAME observations agrees exactly with describe() over the equivalent raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '70. reconstruct() over two empty archives agrees exactly with describe() over two empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '71. reconstruct() over invalid/missing archives degrades to the empty-history result, never a throw');

        // An archive holding OTHER, unrelated collections but no
        // revalidation observation records still reconstructs to the
        // empty-vs-empty result — the two collections are independent.
        const unrelatedArchive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(D1);
        const reconstructedFromUnrelated = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(unrelatedArchive, unrelatedArchive);
        assert(serialize(reconstructedFromUnrelated) === serialize(emptyDescribed), '72. reconstruct() over archives holding only unrelated collections still returns the empty-vs-empty result');
    }
    console.log('✓ Section I: reconstruct() reads only each archive\'s own stored observation history, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section J — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement().sameHistory === true, '73. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(null, undefined).sameHistory === true, '74. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement('not an array', 42).sameHistory === true, '75. malformed non-array histories degrade to empty, never throw');

        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, O1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(mixed, [O1]);
        assert(result.sourceObservationCount === 1, '76. non-genuine entries are silently excluded, leaving only the one genuine observation on the source side');
        assert(result.sharedObservationCount === 1 && result.sharedObservations[0] === O1, '77. the sole surviving genuine observation matches correctly against a clean target');
    }
    console.log('✓ Section J: malformed/absent input degrades to a valid, empty/converged result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([O1], [O1]);

        const topKeys = Object.keys(result).sort();
        const expectedKeys = [
            'sourceObservationCount', 'targetObservationCount',
            'sharedObservationCount', 'sourceOnlyObservationCount', 'targetOnlyObservationCount',
            'sharedObservations', 'sourceOnly', 'targetOnly',
            'distinctPlanCount', 'sharedPlanCount',
            'sourceOnlyPlanCount', 'targetOnlyPlanCount',
            'planAgreements', 'sameHistory'
        ].sort();
        assert(serialize(topKeys) === serialize(expectedKeys), '78. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.planAgreements[0]).sort();
        assert(serialize(groupKeys) === serialize(['planIdentity', 'sharedObservationCount', 'sourceOnlyObservationCount', 'targetOnlyObservationCount'].sort()), '79. a plan agreement entry carries exactly the documented, factual fields');

        const forbidden = ['conflict', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect', 'latest', 'current', 'final', 'stale'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term), `80. the result never carries interpretive/conflict vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreementView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        // "valid"/"invalid" are deliberately excluded: this file's own name
        // and every function inside it carry "Revalidation," which itself
        // contains the substring "valid" — the identical exclusion
        // 0.8.163's/0.8.164's/0.8.166's own architecture tests already apply.
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'signature', 'verify', 'timeline', 'statistics', 'stale', 'correct'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `81. this file's own code never carries "${term}"`);
        }

        // This milestone must import only 0.8.166 (observation-level
        // difference) and 0.8.167's own archive-reading seam — nothing else
        // from the revalidation-observation family.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '82. this file imports from exactly two modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js'), '83. one import is 0.8.166\'s own observation history difference module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js'), '84. one import is 0.8.167\'s own archive-reading seam');
        assert(!codeOnly.includes('revalidationobservation.js') && !codeOnly.includes('revalidationobservationhistory.js') && !codeOnly.includes('deduplicationview') && !codeOnly.includes('timelineview') && !codeOnly.includes('exchange.js') && !codeOnly.includes('synchronization.js'), '85. this file never imports 0.8.162/0.8.163/0.8.164/0.8.165/0.8.168/0.8.169 directly');

        // No export/import/apply wrappers — exactly two exported functions.
        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreementView.js');
        const exportedNames = Object.keys(module).sort();
        assert(serialize(exportedNames) === serialize([
            'describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement',
            'reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement'
        ].sort()), '86. this module exports exactly describeXxx() and reconstructXxx() — no export/import/apply wrappers');

        const originalFetch = globalThis.fetch;
        let networkCallOccurred = false;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        try {
            describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement([], []);
            reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(networkCallOccurred === false, '87. this projection performs zero network access');
    }
    console.log('✓ Section K: the result carries no interpretive/conflict vocabulary, the module imports only 0.8.166\'s difference and 0.8.167\'s archive-reading seam, and exports exactly describeXxx()/reconstructXxx()');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreementView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreementView.test.js FAILED:', error);
    process.exitCode = 1;
});
