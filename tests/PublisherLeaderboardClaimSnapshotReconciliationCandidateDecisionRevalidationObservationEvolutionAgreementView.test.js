import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.174 — Reconciliation Candidate Observation Evolution Agreement
// Projection.
//
// Section A: empty vs empty — a fully converged, empty agreement
// Section B: converged histories — structurally identical observations on
//            both sides are entirely shared, zero exclusive
// Section C: FLAGSHIP — candidate presence computed independently of
//            observation-level agreement: C1 is a SHARED candidate carrying
//            a shared observation AND one exclusive observation per side,
//            simultaneously; C2 is a SHARED candidate with zero exclusive
//            observations; C3 is target-only at both grains
// Section D: same candidate, different observation outcome — the candidate
//            is shared, but zero observations about it are shared
// Section E: same candidate, same decision/plan, different observedAt —
//            likewise shared candidate, zero shared observations
// Section F: multiplicity in the shared multiset itself — [O1,O1] vs
//            [O1,O1,O1] reports sharedObservationCount 2, never 3 (min) and
//            never a naive membership check
// Section G: different candidate types never collide merely because they
//            share a numeric/string field
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
const T3 = new Date('2026-08-30T06:07:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');
const OBS_T5 = new Date('2026-08-30T12:20:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });
const C3 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-3' });

function candidateAgreementFor(result, candidate) {
    return result.candidateAgreements.find((entry) => serialize(entry.candidate) === serialize(candidate));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement([], []);
        assert(result.sameHistory === true, '1. two empty histories report sameHistory');
        assert(result.sourceObservationCount === 0 && result.targetObservationCount === 0, '2. zero raw observation counts on each side');
        assert(result.sharedObservationCount === 0 && result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '3. zero shared/exclusive observation counts');
        assert(result.sharedObservations.length === 0 && result.sourceOnly.length === 0 && result.targetOnly.length === 0, '4. sharedObservations/sourceOnly/targetOnly are empty arrays');
        assert(result.distinctCandidateCount === 0 && result.sharedCandidateCount === 0 && result.sourceOnlyCandidateCount === 0 && result.targetOnlyCandidateCount === 0, '5. zero candidate-level counts');
        assert(result.candidateAgreements.length === 0, '6. candidateAgreements is an empty array');
        assert(Object.isFrozen(result), '7. an empty result is frozen');
    }
    console.log('✓ Section A: two empty histories produce a fully converged, empty agreement');

    // ---------------------------------------------------------------
    // Section B — converged histories: structurally identical observations
    // on both sides are entirely shared.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });

        const sourceHistory = historyOf(observe(D1, plan, OBS_T1), observe(D2, plan, OBS_T2));
        const targetHistory = historyOf(observe(D1, plan, OBS_T1), observe(D2, plan, OBS_T2));

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory, targetHistory);
        assert(result.sameHistory === true, '8. structurally identical histories converge');
        assert(result.sourceObservationCount === 2 && result.targetObservationCount === 2, '9. raw observation counts are still reported');
        assert(result.sharedObservationCount === 2, '10. both observations are shared');
        assert(result.sourceOnlyObservationCount === 0 && result.targetOnlyObservationCount === 0, '11. no exclusive observations on either side');
        assert(result.distinctCandidateCount === 2 && result.sharedCandidateCount === 2, '12. both candidates are shared, none exclusive');
        assert(result.sourceOnlyCandidateCount === 0 && result.targetOnlyCandidateCount === 0, '13. no exclusive candidates');
        assert(result.candidateAgreements.length === 2, '14. two candidate agreement groups');
        for (const entry of result.candidateAgreements) {
            assert(entry.sharedObservationCount === 1 && entry.sourceOnlyObservationCount === 0 && entry.targetOnlyObservationCount === 0, '15. each candidate agreement group carries exactly one shared observation and zero exclusive observations');
        }
    }
    console.log('✓ Section B: converged histories report every observation and candidate as shared, zero exclusive');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: candidate presence is computed independently of
    // observation-level agreement.
    //
    //   Alice (source): C1→O1, C1→O2, C2→O3
    //   Bob   (target): C1→O1, C1→O4, C2→O3, C3→O5
    //
    //   Shared observations:   O1, O3
    //   Alice-exclusive:       O2
    //   Bob-exclusive:         O4, O5
    //
    //   C1 is a SHARED CANDIDATE carrying a shared observation (O1) AND one
    //   exclusive observation per side (O2 source-only, O4 target-only),
    //   simultaneously. C2 is ALSO a shared candidate, but every one of its
    //   observations (O3) is shared — zero exclusive. C3 is target-only at
    //   both the candidate level and the observation level.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const D3 = genuineDecisionRecord(C3, 'DEFER', T3);
        const planPresent = planNaming({ claims: ['Claim-1', 'Claim-2', 'Claim-3'] });
        const planAbsent = planNaming({ claims: ['Claim-2'] });

        const O1 = observe(D1, planPresent, OBS_T1);
        const O2 = observe(D1, planAbsent, OBS_T2);
        const O3 = observe(D2, planPresent, OBS_T3);
        const O4 = observe(D1, planAbsent, OBS_T4);
        const O5 = observe(D3, planPresent, OBS_T5);
        assert(O2.candidatePresent === false && O4.candidatePresent === false && serialize(O2) !== serialize(O4), 'test setup — O2 and O4 are genuinely distinct observations of C1 (different observedAt)');

        const aliceHistory = historyOf(O1, O2, O3);
        const bobHistory = historyOf(O1, O4, O3, O5);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(aliceHistory, bobHistory);

        assert(result.sameHistory === false, '16. FLAGSHIP — Alice and Bob genuinely differ');
        assert(result.sourceObservationCount === 3 && result.targetObservationCount === 4, '17. FLAGSHIP — raw observation counts on each side');

        // Observation-level agreement.
        assert(result.sharedObservationCount === 2, '18. FLAGSHIP — exactly two shared observations, O1 and O3');
        assert(result.sharedObservations.length === 2 && result.sharedObservations[0] === O1 && result.sharedObservations[1] === O3, '19. FLAGSHIP — sharedObservations carries the ORIGINAL source records for O1 and O3, in source\'s own order');
        assert(result.sourceOnlyObservationCount === 1 && result.sourceOnly[0] === O2, '20. FLAGSHIP — Alice-exclusive observation is O2');
        assert(result.targetOnlyObservationCount === 2 && result.targetOnly[0] === O4 && result.targetOnly[1] === O5, '21. FLAGSHIP — Bob-exclusive observations are O4 and O5, in Bob\'s own order');
        assert(result.sharedObservationCount + result.sourceOnlyObservationCount === result.sourceObservationCount, '22. FLAGSHIP — shared + source-only accounts for every one of Alice\'s own observations');
        assert(result.sharedObservationCount + result.targetOnlyObservationCount === result.targetObservationCount, '23. FLAGSHIP — shared + target-only accounts for every one of Bob\'s own observations');

        // Candidate-level presence — the flagship point.
        assert(result.distinctCandidateCount === 3, '24. FLAGSHIP — three distinct candidates in total (C1, C2, C3)');
        assert(result.sharedCandidateCount === 2, '25. FLAGSHIP — exactly two SHARED candidates, C1 and C2 — both present on both replicas');
        assert(result.sourceOnlyCandidateCount === 0, '26. FLAGSHIP — no source-only candidates — every candidate Alice names is also named by Bob');
        assert(result.targetOnlyCandidateCount === 1, '27. FLAGSHIP — exactly one target-only candidate, C3');

        // C1's own agreement group: a SHARED candidate that ALSO carries one
        // exclusive observation on each side — never described as
        // conflicting, never merged, never collapsed into "source-only" or
        // "target-only."
        const c1Agreement = candidateAgreementFor(result, C1);
        assert(c1Agreement !== undefined, '28. FLAGSHIP — C1 appears in candidateAgreements exactly once');
        assert(c1Agreement.sharedObservationCount === 1, '29. FLAGSHIP — C1 carries exactly one shared observation (O1)');
        assert(c1Agreement.sourceOnlyObservationCount === 1, '30. FLAGSHIP — C1 ALSO carries one Alice-exclusive observation (O2) despite being a shared candidate');
        assert(c1Agreement.targetOnlyObservationCount === 1, '31. FLAGSHIP — C1 ALSO carries one Bob-exclusive observation (O4) despite being a shared candidate');

        // C2's own agreement group: a SHARED candidate with ZERO exclusive
        // observations — every one of its observations is shared.
        const c2Agreement = candidateAgreementFor(result, C2);
        assert(c2Agreement.sharedObservationCount === 1 && c2Agreement.sourceOnlyObservationCount === 0 && c2Agreement.targetOnlyObservationCount === 0, '32. FLAGSHIP — C2 (shared candidate) carries exactly one shared observation, zero source-only, zero target-only');

        // C3's own agreement group: a target-only candidate, exclusive at
        // both grains.
        const c3Agreement = candidateAgreementFor(result, C3);
        assert(c3Agreement.sharedObservationCount === 0 && c3Agreement.sourceOnlyObservationCount === 0 && c3Agreement.targetOnlyObservationCount === 1, '33. FLAGSHIP — C3 (target-only candidate) carries exactly one target-only observation, zero shared, zero source-only');

        assert(result.candidateAgreements.length === 3, '34. FLAGSHIP — exactly three candidate agreement groups total');
        assert(serialize(result.candidateAgreements[0].candidate) === serialize(C1), '35. FLAGSHIP — C1 appears first, matching Alice\'s own first-appearance order');
    }
    console.log('✓ Section C: FLAGSHIP — a candidate (C1) can be a SHARED candidate, present on both replicas, while each replica also holds its own exclusive observation about it, and a second shared candidate (C2) can carry ZERO exclusive observations; candidate presence and observation-level agreement are computed independently');

    // ---------------------------------------------------------------
    // Section D — same candidate, different observation outcome: the
    // candidate is shared, but zero observations about it are shared.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planPresent = planNaming({ claims: ['Claim-1'] });
        const planAbsent = planNaming({ claims: [] });
        const aliceObservation = observe(D1, planPresent, OBS_T1);
        const bobObservation = observe(D1, planAbsent, OBS_T1);
        assert(aliceObservation.candidatePresent !== bobObservation.candidatePresent, 'test setup — the two observations genuinely disagree on candidatePresent');

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(historyOf(aliceObservation), historyOf(bobObservation));
        assert(result.sameHistory === false, '36. differing observation outcomes for the same candidate is a genuine difference');
        assert(result.sharedObservationCount === 0, '37. zero shared observations — present and absent are distinct observation events even for the identical candidate');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === aliceObservation, '38. Alice\'s present observation is source-only');
        assert(result.targetOnly.length === 1 && result.targetOnly[0] === bobObservation, '39. Bob\'s absent observation is target-only');
        assert(result.sharedCandidateCount === 1 && result.sourceOnlyCandidateCount === 0 && result.targetOnlyCandidateCount === 0, '40. the candidate itself is still SHARED — both replicas hold an observation naming it, outcome notwithstanding');
        const c1Agreement = candidateAgreementFor(result, C1);
        assert(c1Agreement.sharedObservationCount === 0 && c1Agreement.sourceOnlyObservationCount === 1 && c1Agreement.targetOnlyObservationCount === 1, '41. C1\'s own agreement group shows zero shared observations despite being a shared candidate');
    }
    console.log('✓ Section D: the same candidate observed present on one replica and absent on the other is a SHARED CANDIDATE with ZERO shared observations');

    // ---------------------------------------------------------------
    // Section E — same candidate, same decision/plan, different observedAt.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const early = observe(D1, plan, OBS_T1);
        const late = observe(D1, plan, OBS_T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(historyOf(early), historyOf(late));
        assert(result.sharedObservationCount === 0, '42. same candidate, same decision/plan, different observedAt shares zero observations');
        assert(result.sourceOnly[0] === early && result.targetOnly[0] === late, '43. neither observation cancels the other');
        assert(result.sharedCandidateCount === 1, '44. the candidate is still shared');
    }
    console.log('✓ Section E: the same candidate under the same decision/plan but a different observedAt is a shared candidate with zero shared observations');

    // ---------------------------------------------------------------
    // Section F — multiplicity in the shared multiset itself.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);

        // Alice: [O1, O1]. Bob: [O1, O1, O1]. Two of Bob's three O1 copies
        // match Alice's two — sharedObservationCount is 2 (the matched
        // multiset), never 3 (a naive "does O1 exist on both?" membership
        // check) and never 1 (a set, not multiset, intersection).
        const aliceHistory = [O1, O1];
        const bobHistory = [O1, O1, O1];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(aliceHistory, bobHistory);
        assert(result.sourceObservationCount === 2 && result.targetObservationCount === 3, '45. raw counts reflect each side\'s own local duplicates');
        assert(result.sharedObservationCount === 2, '46. exactly two shared observations — the matched multiset, never 1 (set intersection) or 3 (naive membership)');
        assert(result.sourceOnlyObservationCount === 0, '47. Alice has no exclusive observations — both of her O1 copies matched');
        assert(result.targetOnlyObservationCount === 1, '48. Bob\'s third, unmatched O1 copy is target-only');
        assert(result.sharedObservations.length === 2 && result.sharedObservations[0] === O1 && result.sharedObservations[1] === O1, '49. sharedObservations carries both matched copies, from Alice\'s own history');
        const c1Agreement = candidateAgreementFor(result, C1);
        assert(c1Agreement.sharedObservationCount === 2 && c1Agreement.targetOnlyObservationCount === 1, '50. C1\'s own agreement group preserves the multiplicity exactly');
    }
    console.log('✓ Section F: multiplicity in the shared multiset itself is preserved — [O1,O1] vs [O1,O1,O1] reports exactly two shared observations, never a set-style collapse to one');

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

        const sourceHistory = historyOf(oClaimOnly, oSnapshotOnly, oDivergent);
        const targetHistory = historyOf(oClaimOnly, oSnapshotOnly, oDivergent);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory, targetHistory);

        assert(result.sharedObservationCount === 3, '51. all three differently typed observations are shared, never collapsed by a shared numeric/string field across types');
        assert(result.sharedCandidateCount === 3, '52. all three are distinct shared candidates');
        assert(result.candidateAgreements.length === 3, '53. three separate candidate agreement groups');
        for (const observation of [oClaimOnly, oSnapshotOnly, oDivergent]) {
            const agreement = candidateAgreementFor(result, observation.decision.candidate);
            assert(agreement && agreement.sharedObservationCount === 1, `54. candidate type ${observation.decision.candidate.type} is its own independent group carrying exactly one shared observation`);
        }
    }
    console.log('✓ Section G: CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT, SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM, and DIVERGENT_CORRESPONDENCE never collide merely because they happen to share a numeric/string field');

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const sourceHistory = [O1, O2];
        const targetHistory = [O1];
        const sourceJsonBefore = serialize(sourceHistory);
        const targetJsonBefore = serialize(targetHistory);
        const o1JsonBefore = serialize(O1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory, targetHistory);

        assert(serialize(sourceHistory) === sourceJsonBefore, '55. the source history is never mutated');
        assert(serialize(targetHistory) === targetJsonBefore, '56. the target history is never mutated');
        assert(serialize(O1) === o1JsonBefore, '57. the original observation record is never mutated');
        assert(result.sharedObservations[0] === O1, '58. sharedObservations holds the ORIGINAL observation object, never a reconstructed copy');

        assert(Object.isFrozen(result), '59. the result is frozen');
        assert(Object.isFrozen(result.sharedObservations), '60. sharedObservations is frozen');
        assert(Object.isFrozen(result.sourceOnly), '61. sourceOnly is frozen');
        assert(Object.isFrozen(result.targetOnly), '62. targetOnly is frozen');
        assert(Object.isFrozen(result.candidateAgreements), '63. candidateAgreements is frozen');
        assert(Object.isFrozen(result.candidateAgreements[0]), '64. each candidate agreement entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory, targetHistory);
        assert(serialize(again) === serialize(result), '65. repeated calls on identical inputs are byte-identical');
    }
    console.log('✓ Section H: neither input history nor any original observation record is mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section I — reconstruct()'s archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D1, plan, OBS_T2);
        const O3 = observe(D2, plan, OBS_T3);

        const aliceHistory = historyOf(O1, O2);
        const bobHistory = historyOf(O1, O3);
        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(aliceHistory, bobHistory);

        let aliceArchive = PublicationObservationArchive.empty();
        aliceArchive = aliceArchive.appendRevalidationObservationRecord(O1);
        aliceArchive = aliceArchive.appendRevalidationObservationRecord(O2);
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendRevalidationObservationRecord(O1);
        bobArchive = bobArchive.appendRevalidationObservationRecord(O3);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(aliceArchive, bobArchive);
        assert(serialize(reconstructed) === serialize(described), '66. reconstruct() over archives holding the SAME observations agrees exactly with describe() over the equivalent raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement([], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '67. reconstruct() over two empty archives agrees exactly with describe() over two empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '68. reconstruct() over invalid/missing archives degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section I: reconstruct() reads only each archive\'s own stored observation history, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section J — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement().sameHistory === true, '69. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(null, undefined).sameHistory === true, '70. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement('not an array', 42).sameHistory === true, '71. malformed non-array histories degrade to empty, never throw');

        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, O1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(mixed, [O1]);
        assert(result.sourceObservationCount === 1, '72. non-genuine entries are silently excluded, leaving only the one genuine observation on the source side');
        assert(result.sharedObservationCount === 1 && result.sharedObservations[0] === O1, '73. the sole surviving genuine observation matches correctly against a clean target');
    }
    console.log('✓ Section J: malformed/absent input degrades to a valid, empty/converged result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(historyOf(O1), historyOf(O1));

        const topKeys = Object.keys(result).sort();
        const expectedKeys = [
            'sourceObservationCount', 'targetObservationCount',
            'sharedObservationCount', 'sourceOnlyObservationCount', 'targetOnlyObservationCount',
            'sharedObservations', 'sourceOnly', 'targetOnly',
            'distinctCandidateCount', 'sharedCandidateCount',
            'sourceOnlyCandidateCount', 'targetOnlyCandidateCount',
            'candidateAgreements', 'sameHistory'
        ].sort();
        assert(serialize(topKeys) === serialize(expectedKeys), '74. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.candidateAgreements[0]).sort();
        assert(serialize(groupKeys) === serialize(['candidate', 'sharedObservationCount', 'sourceOnlyObservationCount', 'targetOnlyObservationCount'].sort()), '75. a candidate agreement entry carries exactly the documented, factual fields');

        const forbidden = ['conflict', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect', 'latest', 'current', 'final'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term), `76. the result never carries interpretive/conflict vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'signature', 'verify'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `77. this file's own code never carries "${term}"`);
        }

        // This milestone must import only 0.8.166 (observation-level
        // difference), 0.8.167's own archive-reading seam, and 0.8.172 (the
        // candidate grouping) — nothing from 0.8.144, 0.8.157, 0.8.162
        // through 0.8.165, 0.8.171, or 0.8.173.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 3, '78. this file imports from exactly three modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js'), '79. one import is 0.8.166\'s own observation history difference module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.js'), '80. one import is 0.8.172\'s own candidate observation evolution module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js'), '81. one import is 0.8.167\'s own archive-reading seam');
        assert(!codeOnly.includes('observationcandidatecorrespondenceview') && !codeOnly.includes('observationdeduplicationview') && !codeOnly.includes('observationhistorytimelineview') && !codeOnly.includes('evolutiondifferenceview') && !codeOnly.includes('reconciliationplanview') && !codeOnly.includes('candidaterevalidationview'), '82. this file never imports 0.8.157/0.8.162-0.8.165/0.8.171/0.8.173 directly');
    }
    console.log('✓ Section K: the result carries no interpretive or conflict-resolution vocabulary, and the module imports only 0.8.166\'s observation-level difference, 0.8.167\'s archive-reading seam, and 0.8.172\'s candidate grouping, nothing else from the reconciliation family');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView.test.js FAILED:', error);
    process.exitCode = 1;
});
