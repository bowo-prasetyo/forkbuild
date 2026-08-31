import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.172 — Reconciliation Candidate Observation Evolution Projection.
//
// Section A: empty history — zero counts, empty candidateEvolutions
// Section B: a single observation — one candidate evolution, correctly shaped
// Section C: candidate deduplication — many observations, one candidate
// Section D: observation multiplicity — an identical observation recorded
//            twice remains twice within the same candidate's own sequence
// Section E: chronological ordering within a candidate, observationIndex
//            tie-break for equal observedAt
// Section F: candidateEvolutions itself retains first-appearance order,
//            never re-sorted by observedAt
// Section G: multiple candidate types remain closed, entries embed their
//            own fields unchanged
// Section H: FLAGSHIP — the milestone's own worked example
// Section I: malformed input tolerance
// Section J: no mutation, frozen results, determinism
// Section K: reconstruct()'s archive-reading boundary, calling 0.8.171
//            exactly once
// Section L: vocabulary/import boundary — no rediscovery of 0.8.144 or
//            0.8.157, no interpretive vocabulary, imports only 0.8.171

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

function appendAll(observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:07:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution([]);
        assert(result.observationCount === 0, '1. empty history reports observationCount 0');
        assert(result.distinctCandidateCount === 0, '2. empty history reports distinctCandidateCount 0');
        assert(result.candidateEvolutions.length === 0, '3. empty history reports an empty candidateEvolutions array');
        assert(Object.isFrozen(result), '4. an empty result is frozen');
        assert(Object.isFrozen(result.candidateEvolutions), '5. an empty candidateEvolutions array is frozen');
    }
    console.log('✓ Section A: an empty history produces an empty evolution result');

    // ---------------------------------------------------------------
    // Section B — a single observation.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const history = appendAll([O1]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);
        assert(result.observationCount === 1, '6. one observation reports observationCount 1');
        assert(result.distinctCandidateCount === 1, '7. one observation reports distinctCandidateCount 1');
        const [evolution] = result.candidateEvolutions;
        assert(serialize(evolution.candidate) === serialize(C1), '8. candidate shape preserved unchanged, by value');
        assert(evolution.observationCount === 1, '9. the candidate\'s own observationCount is 1');
        assert(evolution.observations.length === 1, '10. the candidate\'s own observations list carries one entry');
        assert(serialize(evolution.observations[0].decision) === serialize(D1), '11. the sole observation entry carries the whole decision record unchanged');
        assert(serialize(evolution.observations[0].planIdentity) === serialize(O1.planIdentity), '12. the sole observation entry carries planIdentity unchanged');
        assert(evolution.observations[0].candidatePresent === O1.candidatePresent, '13. the sole observation entry carries candidatePresent unchanged');
        assert(evolution.observations[0].candidateType === O1.candidateType, '14. the sole observation entry carries candidateType unchanged');
        assert(evolution.observations[0].candidateMatchesPlan === O1.candidateMatchesPlan, '15. the sole observation entry carries candidateMatchesPlan unchanged');
        assert(evolution.observations[0].observedAt === OBS_T1.toISOString(), '16. the sole observation entry carries observedAt');
        assert(serialize(Object.keys(evolution.observations[0]).sort()) === serialize(['decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'].sort()), '17. an observation entry carries exactly its documented fields, no candidate repeated on it');
    }
    console.log('✓ Section B: a single observation produces one correctly shaped candidate evolution');

    // ---------------------------------------------------------------
    // Section C — candidate deduplication: many observations, one candidate.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planPresent = planNaming({ claims: ['Claim-1'] });
        const planAbsent = planNaming({ claims: [] });

        const O1 = observe(D1, planPresent, OBS_T1);
        const O2 = observe(D1, planAbsent, OBS_T2);
        const O3 = observe(D1, planPresent, OBS_T3);
        const history = appendAll([O1, O2, O3]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);
        assert(result.observationCount === 3, '18. three observations against one candidate report observationCount 3');
        assert(result.distinctCandidateCount === 1, '19. three observations against one candidate report distinctCandidateCount 1');
        assert(result.candidateEvolutions.length === 1, '20. exactly one candidate evolution is produced');
        assert(result.candidateEvolutions[0].observationCount === 3, '21. that one candidate\'s own observationCount is 3');
        assert(result.candidateEvolutions[0].observations.length === 3, '22. that one candidate\'s own observations list carries three entries');
    }
    console.log('✓ Section C: many observations against one candidate produce one candidate evolution carrying all of them');

    // ---------------------------------------------------------------
    // Section D — observation multiplicity: an identical observation
    // recorded twice remains twice.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D1, plan, OBS_T1);
        assert(serialize(O1) === serialize(O2), '23. sanity — O1 and O2 are byte-identical observation records');
        const history = appendAll([O1, O2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);
        assert(result.observationCount === 2, '24. two byte-identical observations still report observationCount 2');
        assert(result.distinctCandidateCount === 1, '25. two byte-identical observations against one candidate report distinctCandidateCount 1');
        assert(result.candidateEvolutions[0].observationCount === 2, '26. the candidate\'s own observationCount reflects both recorded observations, never deduplicated');
        assert(result.candidateEvolutions[0].observations.length === 2, '27. the candidate\'s own observations list carries both entries, never collapsed to one');
    }
    console.log('✓ Section D: an identical observation recorded twice against the same candidate remains two entries in that candidate\'s own sequence');

    // ---------------------------------------------------------------
    // Section E — chronological ordering within a candidate, with
    // observationIndex/history-position as the tie-break for equal
    // observedAt.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planPresent = planNaming({ claims: ['Claim-1'] });
        const planAbsent = planNaming({ claims: [] });

        const O_LATE = observe(D1, planAbsent, OBS_T3);
        const O_EARLY = observe(D1, planPresent, OBS_T1);
        const O_MID_A = observe(D1, planPresent, OBS_T2);
        const O_MID_B = observe(D1, planAbsent, OBS_T2);

        // Appended out of chronological order; O_MID_A and O_MID_B share the
        // identical observedAt (OBS_T2), so history position must decide
        // their relative order within the sorted sequence.
        const history = appendAll([O_LATE, O_MID_B, O_EARLY, O_MID_A]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);

        const [evolution] = result.candidateEvolutions;
        assert(evolution.observations.length === 4, '28. all four observations are present in the sorted sequence');
        assert(evolution.observations[0].observedAt === OBS_T1.toISOString(), '29. the earliest observedAt sorts first');
        assert(evolution.observations[1].observedAt === OBS_T2.toISOString() && evolution.observations[1].candidatePresent === false, '30. of the two OBS_T2 observations, O_MID_B (appended earlier, at history position 1) sorts before O_MID_A (position 3)');
        assert(evolution.observations[2].observedAt === OBS_T2.toISOString() && evolution.observations[2].candidatePresent === true, '31. O_MID_A follows O_MID_B, tie-broken by history position, not by outcome');
        assert(evolution.observations[3].observedAt === OBS_T3.toISOString(), '32. the latest observedAt sorts last');
    }
    console.log('✓ Section E: observations within one candidate are ordered by observedAt ascending, with original history position as the tie-break for equal observedAt');

    // ---------------------------------------------------------------
    // Section F — candidateEvolutions itself retains first-appearance
    // order, never re-sorted by observedAt.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });

        // C2's own observation is made EARLIER (OBS_T1) than C1's own
        // observation (OBS_T3), but C1 appears FIRST in the supplied
        // history.
        const O_C1 = observe(D1, plan, OBS_T3);
        const O_C2 = observe(D2, plan, OBS_T1);
        const history = appendAll([O_C1, O_C2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);
        assert(result.candidateEvolutions.length === 2, '33. two candidate evolutions are produced');
        assert(serialize(result.candidateEvolutions[0].candidate) === serialize(C1), '34. candidateEvolutions retains first-appearance order (C1 first) despite C2 being observed earlier');
        assert(serialize(result.candidateEvolutions[1].candidate) === serialize(C2), '35. C2 appears second, matching history\'s own first-appearance order, never re-sorted by observedAt');
    }
    console.log('✓ Section F: candidateEvolutions retains first-appearance order, never re-sorted by observedAt across candidates');

    // ---------------------------------------------------------------
    // Section G — all three candidate shapes remain closed; entries embed
    // their fields unchanged.
    // ---------------------------------------------------------------
    {
        const divergentCandidate = Object.freeze({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'Claim-D', snapshotIndex: 0 });
        const claimOnlyCandidate = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-E' });
        const snapshotOnlyCandidate = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });

        const D_DIVERGENT = genuineDecisionRecord(divergentCandidate, 'OBSERVE', T1);
        const D_CLAIM = genuineDecisionRecord(claimOnlyCandidate, 'DEFER', T2);
        const D_SNAPSHOT = genuineDecisionRecord(snapshotOnlyCandidate, 'OBSERVE', T3);
        const plan = planNaming({ divergent: [['Claim-D', 0]], claims: ['Claim-E'], snapshots: [3] });

        const O_DIVERGENT = observe(D_DIVERGENT, plan, OBS_T1);
        const O_CLAIM = observe(D_CLAIM, plan, OBS_T2);
        const O_SNAPSHOT = observe(D_SNAPSHOT, plan, OBS_T3);

        const history = appendAll([O_DIVERGENT, O_CLAIM, O_SNAPSHOT]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);

        assert(result.distinctCandidateCount === 3, '36. three structurally distinct candidates are counted as three');
        assert(result.candidateEvolutions.length === 3, '37. candidateEvolutions carries exactly three groups');

        const divergentGroup = result.candidateEvolutions.find((e) => e.candidate.type === 'DIVERGENT_CORRESPONDENCE');
        assert(divergentGroup && serialize(divergentGroup.candidate) === serialize(divergentCandidate), '38. divergent-correspondence candidate embedded whole, unchanged');
        const claimOnlyGroup = result.candidateEvolutions.find((e) => e.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        assert(claimOnlyGroup && !('snapshotIndex' in claimOnlyGroup.candidate), '39. claim-without-snapshot candidate carries no snapshotIndex field, exactly as 0.8.144 produced it');
        const snapshotOnlyGroup = result.candidateEvolutions.find((e) => e.candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM');
        assert(snapshotOnlyGroup && !('claimId' in snapshotOnlyGroup.candidate), '40. snapshot-without-claim candidate carries no claimId field, exactly as 0.8.144 produced it');
        assert(divergentGroup.observations[0].candidateType === 'DIVERGENT_CORRESPONDENCE', '41. an observation entry\'s own candidateType mirrors its candidate\'s own type');
    }
    console.log('✓ Section G: all three candidate shapes remain closed and each entry embeds its own fields whole, unchanged');

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: the milestone's own worked example.
    //   O1 = C1 + present + match    + OBS_T1
    //   O2 = C1 + absent  + no-match + OBS_T2
    //   O3 = C2 + present + match    + OBS_T3
    //   O4 = C1 + present + match    + OBS_T1   (exact duplicate of O1)
    //   O5 = C1 + present + match    + OBS_T4
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const planPresent = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const planAbsent = planNaming({ claims: ['Claim-2'] });

        const O1 = observe(D1, planPresent, OBS_T1);
        const O2 = observe(D1, planAbsent, OBS_T2);
        const O3 = observe(D2, planPresent, OBS_T3);
        const O4 = observe(D1, planPresent, OBS_T1);
        const O5 = observe(D1, planPresent, OBS_T4);
        assert(serialize(O1) === serialize(O4), '42. sanity — O1 and O4 are byte-identical observation records');
        assert(O1.candidatePresent === true && O2.candidatePresent === false, 'test setup — O1 present, O2 absent');

        const history = appendAll([O1, O2, O3, O4, O5]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);

        assert(result.observationCount === 5, '43. FLAGSHIP — five history entries produce observationCount 5');
        assert(result.distinctCandidateCount === 2, '44. FLAGSHIP — only two distinct candidates (C1, C2) exist across the five observations');
        assert(result.candidateEvolutions.length === 2, '45. FLAGSHIP — candidateEvolutions carries exactly two groups');

        const [evolutionC1, evolutionC2] = result.candidateEvolutions;
        assert(serialize(evolutionC1.candidate) === serialize(C1), '46. FLAGSHIP — the first evolution group is C1, matching history\'s own first-appearance order');
        assert(evolutionC1.observationCount === 4, '47. FLAGSHIP — C1 accumulated four observations (O1, O2, O4, O5)');
        assert(evolutionC1.observations.length === 4, '48. FLAGSHIP — C1\'s own observations list carries four entries');
        assert(evolutionC1.observations[0].candidatePresent === true && evolutionC1.observations[0].observedAt === OBS_T1.toISOString(), '49. FLAGSHIP — C1\'s first chronological observation is present @ OBS_T1 (O1, ahead of the identical O4 by history position)');
        assert(evolutionC1.observations[1].candidatePresent === true && evolutionC1.observations[1].observedAt === OBS_T1.toISOString(), '50. FLAGSHIP — C1\'s second chronological observation is the duplicate present @ OBS_T1 (O4), tie-broken after O1 by history position');
        assert(evolutionC1.observations[2].candidatePresent === false && evolutionC1.observations[2].observedAt === OBS_T2.toISOString(), '51. FLAGSHIP — C1\'s third chronological observation is absent @ OBS_T2 (O2)');
        assert(evolutionC1.observations[3].candidatePresent === true && evolutionC1.observations[3].observedAt === OBS_T4.toISOString(), '52. FLAGSHIP — C1\'s fourth chronological observation is present @ OBS_T4 (O5)');

        assert(serialize(evolutionC2.candidate) === serialize(C2), '53. FLAGSHIP — the second evolution group is C2');
        assert(evolutionC2.observationCount === 1, '54. FLAGSHIP — C2 accumulated exactly one observation (O3)');
        assert(evolutionC2.observations[0].candidatePresent === true && evolutionC2.observations[0].observedAt === OBS_T3.toISOString(), '55. FLAGSHIP — C2\'s sole observation is present @ OBS_T3');
    }
    console.log('✓ Section H: FLAGSHIP — the milestone\'s own worked example demonstrates observation multiplicity, candidate deduplication, chronological ordering, repeated identical observations, differing outcomes for one candidate, and first-appearance candidate ordering, all at once');

    // ---------------------------------------------------------------
    // Section I — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution().observationCount === 0, '56. calling with no arguments defaults to an empty result, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(null).observationCount === 0, '57. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(undefined).observationCount === 0, '58. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution('not an array').observationCount === 0, '59. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(42).observationCount === 0, '60. a non-array, non-object history degrades to empty, never throws');

        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, O1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(mixed);
        assert(result.observationCount === 1, '61. non-genuine entries are silently excluded, leaving only the one genuine observation');
        assert(result.distinctCandidateCount === 1, '62. the sole surviving observation produces one candidate evolution');
    }
    console.log('✓ Section I: malformed/absent input degrades to a valid, empty result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section J — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const planAbsent = planNaming({ claims: [] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D1, planAbsent, OBS_T2);
        const history = appendAll([O1, O2]);
        const historyJsonBefore = serialize(history);
        const observationJsonBefore = serialize(O1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);

        assert(serialize(history) === historyJsonBefore, '63. the input history is never mutated');
        assert(serialize(O1) === observationJsonBefore, '64. the original observation record is never mutated');
        assert(Object.isFrozen(result), '65. the result is frozen');
        assert(Object.isFrozen(result.candidateEvolutions), '66. candidateEvolutions is frozen');
        assert(Object.isFrozen(result.candidateEvolutions[0]), '67. each candidate evolution entry is itself frozen');
        assert(Object.isFrozen(result.candidateEvolutions[0].observations), '68. each candidate evolution\'s own observations array is frozen');
        assert(Object.isFrozen(result.candidateEvolutions[0].observations[0]), '69. each observation entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);
        assert(serialize(again) === serialize(result), '70. repeated calls on an identical history are byte-identical');
    }
    console.log('✓ Section J: the input history and original observation records are never mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section K — reconstruct()'s archive-reading boundary, calling
    // 0.8.171 exactly once.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const history = appendAll([O1, O2]);

        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(O1);
        archive = archive.appendRevalidationObservationRecord(O2);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(archive);
        assert(serialize(reconstructed) === serialize(described), '71. reconstruct() over an archive holding the SAME observations agrees exactly with describe() over the raw history');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution([]);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '72. reconstruct() over an empty archive agrees exactly with describe() over an empty history');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyDescribed), '73. reconstruct() over an invalid/missing archive degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section K: reconstruct() reads only the archive\'s own stored observation history, agreeing exactly with describe() over the equivalent raw history');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary: no rediscovery of 0.8.144 or
    // 0.8.157, no interpretive vocabulary, imports only 0.8.171.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(appendAll([O1]));

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['observationCount', 'distinctCandidateCount', 'candidateEvolutions'].sort()), '74. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.candidateEvolutions[0]).sort();
        assert(serialize(groupKeys) === serialize(['candidate', 'observationCount', 'observations'].sort()), '75. a candidate evolution entry carries exactly the documented, factual fields');

        const observationKeys = Object.keys(result.candidateEvolutions[0].observations[0]).sort();
        assert(serialize(observationKeys) === serialize(['decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'].sort()), '76. an observation entry carries exactly its documented fields — candidate identity is never repeated on it, and observationIndex is never surfaced');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown', 'changed', 'reversed', 'final', 'current', 'latest', 'preferred', 'conflicting', 'corrected', 'converged', 'drifted'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term) && !observationKeys.includes(term), `77. the result never carries state-machine vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity', 'changed', 'reversed', 'final', 'current', 'latest', 'preferred', 'conflicting', 'corrected', 'converged', 'drifted'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `78. this file's own code never carries "${term}"`);
        }

        // This milestone must not re-derive candidate identity via 0.8.144
        // or 0.8.157, and must not read observation records via 0.8.163's
        // own history-storage module — this file imports exactly ONE
        // module: 0.8.171's own correspondence projection, used by both
        // describeXxx() and reconstructXxx().
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importLines.length === 1, '79. this file imports from exactly one module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js'), '80. the one import is 0.8.171\'s own correspondence projection, never 0.8.144\'s own candidate-selection boundary, 0.8.157\'s own revalidation module, or any plan/discovery/history-storage module');
        assert(!codeOnly.includes('reconciliationplanview') && !codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate(') && !codeOnly.includes('candidaterevalidationview') && !codeOnly.includes('observationhistory.js') && !codeOnly.includes('observationhistoryview'), '81. this file never calls 0.8.144\'s own candidate-selection function, 0.8.157\'s own revalidation function, and never imports 0.8.163\'s own observation-history storage module or 0.8.167\'s own reconstruction seam directly');
    }
    console.log('✓ Section L: the result carries no state-machine or interpretive vocabulary, and the module imports only 0.8.171\'s own correspondence projection, never rediscovering candidate identity itself');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.test.js FAILED:', error);
    process.exitCode = 1;
});
