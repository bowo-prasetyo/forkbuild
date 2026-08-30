import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifferenceView.js';

// 0.8.159 — Reconciliation Decision History Revalidation Difference
// Projection.
//
// Section A: empty histories — both sides empty/malformed degrade to an
//            explicit, non-throwing, fully-zeroed, converged outcome
// Section B: one-sided histories — only one side carries decisions
// Section C: identical histories + same plan — everything shared, nothing
//            exclusive, sameRevalidation: true
// Section D: shared decisions but absent candidates — THE IMPORTANT TEST
//            CASE: an identical decision on both sides remains SHARED even
//            when both sides independently revalidate it as absent from a
//            later plan
// Section E: same candidate, different decisions — never collapsed to a
//            candidate-level comparison; each side's own distinct decision
//            record lands as exclusive on its own side, each still
//            carrying its own candidatePresent fact
// Section F: same decision, different plan membership — the identical
//            shared decision evaluated against two different explicitly
//            supplied plans produces different candidatePresent values,
//            while remaining shared in both calls
// Section G: multiplicity — local duplicate decisions remain duplicates;
//            multiset partitioning, never a set partition
// Section H: three candidate types — DIVERGENT_CORRESPONDENCE,
//            CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT,
//            SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM structural identity is
//            preserved through the comparison
// Section I: FLAGSHIP — the two-replica scenario from this milestone's own
//            request: a shared decision, a source-only decision present in
//            the plan, a target-only decision absent from the plan
// Section J: immutability
// Section K: determinism
// Section L: malformed-input tolerance
// Section M: architectural regression — exactly two imports (0.8.158,
//            0.8.149), no archive/plan-reconstruction/candidate-selection/
//            decision-generation import, no state-machine vocabulary, no
//            reconstructXxx() entry point

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:06:00Z');
const T4 = new Date('2026-08-30T10:09:00Z');

const C1S1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'C1', snapshotIndex: 0 };
const C2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' };
const C3 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 1 };

const divergence = Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false });

function planNaming({ divergent = [], claims = [], snapshots = [] }) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze(divergent.map((entry) => Object.freeze({ claimId: entry.claimId, snapshotIndex: entry.snapshotIndex, divergence }))),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

const EMPTY_PLAN = planNaming({});
const FULL_PLAN = planNaming({ divergent: [{ claimId: 'C1', snapshotIndex: 0 }], claims: ['C2'], snapshots: [1] });

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty histories.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([], [], FULL_PLAN);
        assert(result.sourceDecisionCount === 0, '1. two empty histories produce sourceDecisionCount: 0');
        assert(result.targetDecisionCount === 0, '2. two empty histories produce targetDecisionCount: 0');
        assert(result.sharedDecisionCount === 0, '3. two empty histories produce sharedDecisionCount: 0');
        assert(result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '4. two empty histories produce zero exclusive decisions on either side');
        assert(Array.isArray(result.sharedRevalidations) && result.sharedRevalidations.length === 0, '5. two empty histories produce sharedRevalidations: []');
        assert(Array.isArray(result.sourceOnly) && result.sourceOnly.length === 0, '6. two empty histories produce sourceOnly: []');
        assert(Array.isArray(result.targetOnly) && result.targetOnly.length === 0, '7. two empty histories produce targetOnly: []');
        assert(result.sourcePresentCandidateCount === 0 && result.sourceAbsentCandidateCount === 0, '8. two empty histories produce zero present/absent source candidates');
        assert(result.targetPresentCandidateCount === 0 && result.targetAbsentCandidateCount === 0, '9. two empty histories produce zero present/absent target candidates');
        assert(result.sameRevalidation === true, '10. two empty histories are trivially the same revalidation');

        const nullBoth = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(null, undefined, FULL_PLAN);
        assert(nullBoth.sourceDecisionCount === 0 && nullBoth.targetDecisionCount === 0, '11. null/undefined histories degrade identically to empty, never throw');
        assert(nullBoth.sameRevalidation === true, '12. null/undefined histories are trivially the same revalidation');
    }
    console.log('✓ Section A: two empty/absent histories degrade to an explicit, fully-zeroed, converged outcome');

    // ---------------------------------------------------------------
    // Section B — one-sided histories.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1, D2], [], FULL_PLAN);
        assert(result.sourceDecisionCount === 2 && result.targetDecisionCount === 0, '13. only the source side carries decisions');
        assert(result.sharedDecisionCount === 0, '14. nothing is shared when the target side is empty');
        assert(result.sourceOnlyDecisionCount === 2 && result.targetOnlyDecisionCount === 0, '15. both source decisions are exclusive to the source');
        assert(result.sourceOnly.length === 2 && result.targetOnly.length === 0, '16. sourceOnly carries both entries, targetOnly is empty');
        assert(result.sourceOnly[0].decision === D1 && result.sourceOnly[1].decision === D2, '17. sourceOnly preserves the source\'s own original order');
        assert(result.sourcePresentCandidateCount === 2 && result.sourceAbsentCandidateCount === 0, '18. both source candidates, drawn from the plan itself, are present');
        assert(result.targetPresentCandidateCount === 0 && result.targetAbsentCandidateCount === 0, '19. the empty target side tallies zero candidates of either kind');
        assert(result.sameRevalidation === false, '20. a one-sided history is never the same revalidation');

        const reversed = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([], [D1, D2], FULL_PLAN);
        assert(reversed.targetOnlyDecisionCount === 2 && reversed.sourceOnlyDecisionCount === 0, '21. reversing source/target reverses which side is exclusive');
        assert(reversed.sharedDecisionCount === 0, '22. reversing source/target still shares nothing');
    }
    console.log('✓ Section B: a one-sided history reports every decision as exclusive to the carrying side, none shared');

    // ---------------------------------------------------------------
    // Section C — identical histories + same plan.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const D3 = genuineDecisionRecord(C3, 'OBSERVE', T3);
        const history = [D1, D2, D3];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(history, [D1, D2, D3], FULL_PLAN);
        assert(result.sourceDecisionCount === 3 && result.targetDecisionCount === 3, '23. identical histories carry identical decision counts');
        assert(result.sharedDecisionCount === 3, '24. every decision is shared between identical histories');
        assert(result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '25. nothing is exclusive to either side');
        assert(result.sourceOnly.length === 0 && result.targetOnly.length === 0, '26. sourceOnly/targetOnly are both empty');
        assert(result.sharedRevalidations.length === 3, '27. all three entries appear in sharedRevalidations');
        assert(result.sharedRevalidations.every((entry) => entry.candidatePresent === true), '28. every shared candidate, drawn from the plan itself, is present');
        assert(result.sourcePresentCandidateCount === 3 && result.targetPresentCandidateCount === 3, '29. both sides tally three present candidates');
        assert(result.sameRevalidation === true, '30. identical histories against the identical plan are the same revalidation');
    }
    console.log('✓ Section C: identical histories against the identical plan report everything shared, nothing exclusive');

    // ---------------------------------------------------------------
    // Section D — THE IMPORTANT TEST CASE: shared decisions but absent
    // candidates. An identical decision on both replicas remains SHARED
    // even when both sides independently revalidate it as absent from a
    // later plan that no longer contains its candidate.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [D1], EMPTY_PLAN);
        assert(result.sharedDecisionCount === 1, '31. D1 remains shared even though its candidate is absent from the supplied plan');
        assert(result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '32. D1 is never demoted to source-only/target-only merely because its candidate is absent');
        assert(result.sharedRevalidations.length === 1, '33. sharedRevalidations carries exactly the one shared entry');
        assert(result.sharedRevalidations[0].candidatePresent === false, '34. the shared entry independently reads candidatePresent: false');
        assert(result.sharedRevalidations[0].candidateMatchesPlan === false, '35. the shared entry independently reads candidateMatchesPlan: false');
        assert(result.sourcePresentCandidateCount === 0 && result.sourceAbsentCandidateCount === 1, '36. the source side tallies its one distinct candidate as absent');
        assert(result.targetPresentCandidateCount === 0 && result.targetAbsentCandidateCount === 1, '37. the target side independently tallies its one distinct candidate as absent');
        assert(result.sameRevalidation === true, '38. two identical single-decision histories are still the same revalidation, regardless of plan membership');
        assert(serialize(result.sharedRevalidations[0].decision) === serialize(D1), '39. the shared decision is echoed completely unchanged, still OBSERVE, still against its own original candidate');
    }
    console.log('✓ Section D: an identical decision on both replicas remains SHARED even when both independently revalidate it as absent — absence from the plan is never reinterpreted as disagreement');

    // ---------------------------------------------------------------
    // Section E — same candidate, different decisions. Never collapsed to
    // a candidate-level comparison: Alice's OBSERVE(C1/S1) and Bob's
    // DEFER(C1/S1) are structurally distinct decision records, so each
    // lands as exclusive on its own side, even though both share an
    // identical candidate relationship (both present in the same plan).
    // ---------------------------------------------------------------
    {
        const aliceD = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const bobD = genuineDecisionRecord(C1S1, 'DEFER', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([aliceD], [bobD], FULL_PLAN);
        assert(result.sharedDecisionCount === 0, '40. OBSERVE(C1/S1) and DEFER(C1/S1) are never treated as the same decision merely because they name the same candidate');
        assert(result.sourceOnlyDecisionCount === 1 && result.targetOnlyDecisionCount === 1, '41. each replica\'s own distinct decision record is exclusive to its own side');
        assert(result.sourceOnly[0].decision === aliceD && result.targetOnly[0].decision === bobD, '42. sourceOnly/targetOnly each carry the originating side\'s own record');
        assert(result.sourceOnly[0].candidatePresent === true && result.targetOnly[0].candidatePresent === true, '43. both exclusive entries independently read candidatePresent: true — the candidate relationship is identical even though the decision records are not');
        assert(result.sourceOnly[0].candidateType === result.targetOnly[0].candidateType, '44. both exclusive entries share the identical candidateType, since they name the identical candidate');
        assert(result.sourcePresentCandidateCount === 1 && result.targetPresentCandidateCount === 1, '45. each side independently tallies one present distinct candidate');
        assert(result.sameRevalidation === false, '46. differing decision records about the identical candidate are never the same revalidation');
    }
    console.log('✓ Section E: the same candidate under two different decisions is preserved as two exclusive decision records, never collapsed to a candidate-level agreement');

    // ---------------------------------------------------------------
    // Section F — same decision, different plan membership. The identical
    // shared decision evaluated against two different explicitly supplied
    // plans produces different candidatePresent values, while the decision
    // itself remains shared in both calls.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);

        const againstFullPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [D1], FULL_PLAN);
        const againstEmptyPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [D1], EMPTY_PLAN);

        assert(againstFullPlan.sharedDecisionCount === 1 && againstEmptyPlan.sharedDecisionCount === 1, '47. D1 remains shared under both plans');
        assert(againstFullPlan.sharedRevalidations[0].candidatePresent === true, '48. against the plan naming its own candidate, D1 reads candidatePresent: true');
        assert(againstEmptyPlan.sharedRevalidations[0].candidatePresent === false, '49. against a plan that no longer names its candidate, the identical D1 reads candidatePresent: false');
        assert(
            serialize(againstFullPlan.sharedRevalidations[0].decision) === serialize(againstEmptyPlan.sharedRevalidations[0].decision),
            '50. the underlying decision record is identical across both calls — only candidatePresent differs, driven solely by which plan was supplied'
        );
        assert(againstFullPlan.sameRevalidation === true && againstEmptyPlan.sameRevalidation === true, '51. sameRevalidation is unaffected by plan membership — it reflects decision-history equality alone');
    }
    console.log('✓ Section F: the identical shared decision reads differently against two different explicitly supplied plans, while remaining shared in both calls');

    // ---------------------------------------------------------------
    // Section G — multiplicity: local duplicate decisions remain
    // duplicates; multiset partitioning, never a set partition.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);

        // [D1, D1] on source vs. [D1] on target: one shared, one
        // source-only — never zero (a naive "is D1 present?" check) and
        // never two (a comparison that never consumes a match).
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1, D1], [D1], FULL_PLAN);
        assert(result.sourceDecisionCount === 2 && result.targetDecisionCount === 1, '52. [D1, D1] vs. [D1] preserves each side\'s own decision count, never deduplicated');
        assert(result.sharedDecisionCount === 1, '53. exactly one D1 is shared — the second D1 has no counterpart left once the first is matched');
        assert(result.sourceOnlyDecisionCount === 1 && result.targetOnlyDecisionCount === 0, '54. the second, unmatched D1 is exclusive to the source');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0].decision === D1, '55. the one source-only entry still carries a genuine revalidation of D1');
        assert(result.sourcePresentCandidateCount === 1, '56. despite two decisions naming it, the source still tallies only one distinct candidate');

        // Local duplicates on the SAME side, absent from the other side
        // entirely, are each independently exclusive.
        const bothOnly = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1, D1], [], FULL_PLAN);
        assert(bothOnly.sourceOnlyDecisionCount === 2, '57. [D1, D1] vs. [] reports both D1 occurrences as exclusive, never deduplicated to one');
        assert(bothOnly.sourceOnly.length === 2, '58. sourceOnly itself carries both entries');
    }
    console.log('✓ Section G: local duplicate decisions are preserved exactly through multiset partitioning, never collapsed into a set');

    // ---------------------------------------------------------------
    // Section H — three candidate types: structural identity is preserved
    // through the comparison.
    // ---------------------------------------------------------------
    {
        const divergentDecision = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const claimDecision = genuineDecisionRecord(C2, 'DEFER', T2);
        const snapshotDecision = genuineDecisionRecord(C3, 'OBSERVE', T3);
        const history = [divergentDecision, claimDecision, snapshotDecision];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(history, history, FULL_PLAN);
        assert(result.sharedDecisionCount === 3, '59. all three candidate types are shared when both histories are identical');
        const types = result.sharedRevalidations.map((entry) => entry.candidateType).sort();
        assert(
            serialize(types) === serialize(['CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', 'DIVERGENT_CORRESPONDENCE', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM'].sort()),
            '60. all three of 0.8.144\'s own candidate types appear, structurally distinct, never collapsed'
        );
        assert(result.sharedRevalidations.every((entry) => entry.candidatePresent === true), '61. every candidate type, drawn from the plan itself, is present');

        // A DIVERGENT_CORRESPONDENCE naming the same claimId as a
        // CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate is still a
        // distinct candidate, never conflated by claimId alone.
        const divergentSameClaimId = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'C2', snapshotIndex: 0 }, 'OBSERVE', T4);
        const mixedResult = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([claimDecision, divergentSameClaimId], [], EMPTY_PLAN);
        assert(mixedResult.sourceAbsentCandidateCount === 2, '62. a DIVERGENT_CORRESPONDENCE and a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT sharing a claimId are tallied as two distinct candidates, never one');
    }
    console.log('✓ Section H: DIVERGENT_CORRESPONDENCE, CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT, and SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM retain full structural identity through the comparison');

    // ---------------------------------------------------------------
    // Section I — FLAGSHIP: the two-replica scenario from this milestone's
    // own request.
    //   Alice:  D1(C1/S1, OBSERVE)     D2(C2, DEFER)
    //   Bob:    D1(C1/S1, OBSERVE)     D3(C3, OBSERVE)
    //   Plan:   C1/S1, C2
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const D3 = genuineDecisionRecord(C3, 'OBSERVE', T3);
        const plan = planNaming({ divergent: [{ claimId: 'C1', snapshotIndex: 0 }], claims: ['C2'] });

        const alice = [D1, D2];
        const bob = [D1, D3];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(alice, bob, plan);

        assert(result.sourceDecisionCount === 2 && result.targetDecisionCount === 2, '63. FLAGSHIP — each replica carries its own two decisions');
        assert(result.sharedDecisionCount === 1, '64. FLAGSHIP — D1 is the one shared decision');
        assert(result.sharedRevalidations[0].decision === D1, '65. FLAGSHIP — the shared entry is D1 itself');
        assert(result.sharedRevalidations[0].candidatePresent === true, '66. FLAGSHIP — D1\'s own candidate (C1/S1) is present in the plan');

        assert(result.sourceOnlyDecisionCount === 1, '67. FLAGSHIP — D2 is exclusive to Alice (the source)');
        assert(result.sourceOnly[0].decision === D2, '68. FLAGSHIP — the source-only entry is D2');
        assert(result.sourceOnly[0].candidatePresent === true, '69. FLAGSHIP — D2 is source-only AND present in the plan');

        assert(result.targetOnlyDecisionCount === 1, '70. FLAGSHIP — D3 is exclusive to Bob (the target)');
        assert(result.targetOnly[0].decision === D3, '71. FLAGSHIP — the target-only entry is D3');
        assert(result.targetOnly[0].candidatePresent === false, '72. FLAGSHIP — D3 is target-only AND absent from the plan');

        assert(result.sourcePresentCandidateCount === 2 && result.sourceAbsentCandidateCount === 0, '73. FLAGSHIP — Alice\'s own two distinct candidates (C1/S1, C2) are both present');
        assert(result.targetPresentCandidateCount === 1 && result.targetAbsentCandidateCount === 1, '74. FLAGSHIP — Bob\'s own two distinct candidates: C1/S1 present, C3 absent');
        assert(result.sameRevalidation === false, '75. FLAGSHIP — Alice and Bob do not hold the same revalidation, since each carries its own exclusive decision');

        // Historical difference and plan membership remain separately
        // observable on every entry.
        assert(result.sourceOnly[0].candidatePresent === true && result.targetOnly[0].candidatePresent === false, '76. FLAGSHIP — exclusivity (which side) and plan membership (present/absent) are independent axes, visible side by side on each entry');
    }
    console.log('✓ Section I: FLAGSHIP — the two-replica scenario demonstrates historical difference and plan membership as separately observable facts');

    // ---------------------------------------------------------------
    // Section J — immutability.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const sourceHistory = [D1];
        const targetHistory = [D1, D2];
        const sourceJsonBefore = serialize(sourceHistory);
        const targetJsonBefore = serialize(targetHistory);
        const planJsonBefore = serialize(FULL_PLAN);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(sourceHistory, targetHistory, FULL_PLAN);

        assert(serialize(sourceHistory) === sourceJsonBefore, '77. the original sourceHistory is never mutated');
        assert(serialize(targetHistory) === targetJsonBefore, '78. the original targetHistory is never mutated');
        assert(serialize(FULL_PLAN) === planJsonBefore, '79. the supplied plan is never mutated');
        assert(Object.isFrozen(result), '80. the result is frozen');
        assert(Object.isFrozen(result.sharedRevalidations), '81. sharedRevalidations is frozen');
        assert(Object.isFrozen(result.sourceOnly), '82. sourceOnly is frozen');
        assert(Object.isFrozen(result.targetOnly), '83. targetOnly is frozen');
        assert(Object.isFrozen(result.targetOnly[0]), '84. each targetOnly entry is frozen');
        assert(result.targetOnly[0].decision === D2, '85. the echoed decision is the original decision record itself, by reference, never a reconstructed copy');
    }
    console.log('✓ Section J: neither history nor plan is ever mutated, and the result (and every array/entry within it) is frozen');

    // ---------------------------------------------------------------
    // Section K — determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const D3 = genuineDecisionRecord(C3, 'OBSERVE', T3);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1, D2], [D1, D3], FULL_PLAN);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1, D2], [D1, D3], FULL_PLAN);
        assert(serialize(once) === serialize(twice), '86. repeated calls with equivalent arguments produce a byte-identical result');
    }
    console.log('✓ Section K: repeated calls with equivalent arguments produce byte-identical results');

    // ---------------------------------------------------------------
    // Section L — malformed-input tolerance.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);

        const notAnArray = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference('not a history', 42, FULL_PLAN);
        assert(notAnArray.sourceDecisionCount === 0 && notAnArray.targetDecisionCount === 0, '87. non-array histories degrade to zero counts, never throw');

        const malformedEntries = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(
            [null, { decided: false }, D1],
            [undefined, 'not a decision'],
            FULL_PLAN
        );
        assert(malformedEntries.sourceDecisionCount === 1, '88. malformed entries mixed into an otherwise genuine history are silently excluded');
        assert(malformedEntries.targetDecisionCount === 0, '89. an array of entirely malformed entries degrades to decisionCount: 0');
        assert(malformedEntries.sourceOnlyDecisionCount === 1, '90. the one surviving genuine source decision is reported as exclusive');

        const nullPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [D1], null);
        assert(nullPlan.sourceDecisionCount === 1 && nullPlan.targetDecisionCount === 1, '91. a null plan never throws, and decision-level counts are unaffected');
        assert(nullPlan.sharedDecisionCount === 1, '92. a null plan still reports D1 as shared — plan validity never affects decision identity');
        assert(nullPlan.sharedRevalidations[0].candidatePresent === false, '93. a null plan degrades every candidatePresent to false');

        const malformedPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [], { claimsWithoutCorrespondence: 'not an array' });
        assert(malformedPlan.sourceOnly[0].candidatePresent === false, '94. a malformed plan degrades to candidatePresent: false, never throws');

        const allNull = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(null, null, undefined);
        assert(allNull.sameRevalidation === true, '95. every argument null/undefined degrades to a fully-zeroed, converged, non-throwing outcome');
    }
    console.log('✓ Section L: malformed/absent histories and plans degrade to explicit, non-throwing outcomes');

    // ---------------------------------------------------------------
    // Section M — architectural regression.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1S1, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [D1], FULL_PLAN);

        const topKeys = Object.keys(result).sort();
        assert(
            serialize(topKeys) === serialize([
                'sourceDecisionCount', 'targetDecisionCount',
                'sharedDecisionCount', 'sourceOnlyDecisionCount', 'targetOnlyDecisionCount',
                'sharedRevalidations', 'sourceOnly', 'targetOnly',
                'sourcePresentCandidateCount', 'sourceAbsentCandidateCount',
                'targetPresentCandidateCount', 'targetAbsentCandidateCount',
                'sameRevalidation'
            ].sort()),
            '96. the result carries exactly the documented, factual top-level fields'
        );

        const entryKeys = Object.keys(result.sharedRevalidations[0]).sort();
        assert(
            serialize(entryKeys) === serialize(['decisionIndex', 'decision', 'candidatePresent', 'candidateType', 'candidateMatchesPlan'].sort()),
            '97. each sharedRevalidations entry carries exactly 0.8.158\'s own documented fields, unchanged'
        );

        const forbidden = ['conflict', 'preferred', 'authoritative', 'stale', 'obsolete', 'superseded', 'resolved', 'correct', 'incorrect', 'agreement', 'disagreement'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term), `98. the result never carries interpretive vocabulary ('${term}')`);
        }

        const fs = await import('node:fs/promises');
        const moduleSource = await fs.readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifferenceView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = [
            'conflict', 'preferred', 'authoritative', 'stale', 'obsolete', 'superseded', 'resolved', 'correct', 'incorrect',
            'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute',
            'trust', 'confidence', 'reputation', 'severity', 'ranking'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `99. this file's own code never carries "${term}"`);
        }

        // Exactly two imports — 0.8.158's own decision-history revalidation
        // projection and 0.8.149's own decision-history difference
        // projection, nothing else.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '100. this file imports exactly two modules');
        assert(
            importLines.some((line) => line.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js')),
            '101. one import is 0.8.158\'s own decision-history revalidation projection'
        );
        assert(
            importLines.some((line) => line.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js')),
            '102. the other import is 0.8.149\'s own decision-history difference projection'
        );
        assert(!codeOnly.includes('archive'), '103. this file never mentions an archive of any kind');
        assert(!codeOnly.includes('planview'), '104. this file never imports the plan-reconstruction module');
        assert(!codeOnly.includes('decisionhistoryview'), '105. this file never imports 0.8.150\'s own archive-reading decision history seam');
        assert(!codeOnly.includes('reconciliationdecision.js') && !codeOnly.includes('reconciliationdecisionhistory.js'), '106. this file never imports the decision-generation or decision-history-append modules');
        assert(!codeOnly.includes('candidaterevalidationview'), '107. this file never imports 0.8.157 directly — only through 0.8.158');
        assert(!codeOnly.includes('candidatedecisionevolution') && !codeOnly.includes('candidatedecisionagreement'), '108. this file never imports the candidate-evolution or candidate-decision-agreement projections');

        // Never calls 0.8.145 to create a new decision, and never calls
        // 0.8.144 to make a new candidate selection directly.
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationdecision(') , '109. this file never calls 0.8.145\'s own decision-recording function to create a new decision');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate('), '110. this file never calls 0.8.144\'s own candidate-selection function directly');

        // No reconstructXxx() entry point at all — deliberately, per this
        // file's own header, mirroring 0.8.157's/0.8.158's own choice.
        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifferenceView.js');
        assert(typeof module.describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference === 'function', '111. describeXxx() is exported');
        assert(module.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference === undefined, '112. no reconstructXxx() is exported — this file never invents a way to reconstruct a plan from current archive state');

        // sourceOnly/targetOnly entries are the originating side's own
        // 0.8.158 revalidation entries, never bare decision records.
        const mixed = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference([D1], [], FULL_PLAN);
        assert('candidatePresent' in mixed.sourceOnly[0] && 'candidateMatchesPlan' in mixed.sourceOnly[0], '113. sourceOnly entries carry revalidation facts, not merely the bare decision');
    }
    console.log('✓ Section M: the result and the module\'s own source carry no interpretive vocabulary, the module imports exactly 0.8.158 and 0.8.149, and it exposes no reconstructXxx() entry point');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifferenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifferenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
