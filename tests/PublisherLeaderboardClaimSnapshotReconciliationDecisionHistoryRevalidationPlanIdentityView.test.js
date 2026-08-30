import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js';

// 0.8.161 — Reconciliation Decision History Revalidation Plan Identity
// Projection.
//
// Section A: input tolerance — malformed decisionHistory/plan never throw
// Section B: empty history / empty plan
// Section C: single decision + single candidate
// Section D: all three candidate types
// Section E: plan identity is independently preserved (unrelated to decision
//            content/count)
// Section F: same decision against two different plans
// Section G: decision disposition independence
// Section H: duplicate decisions and candidate multiplicity
// Section I: exact candidate identity
// Section J: immutability
// Section K: determinism
// Section L: architectural regression — exactly two imports (0.8.158 +
//            0.8.160), no 0.8.144/0.8.157/archive/plan-reconstruction/
//            decision-generation/verification imports, no interpretation
//            vocabulary, no reconstructXxx()

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function divergentEntry(claimId, snapshotIndex, overrides = {}) {
    return Object.freeze({
        claimId, snapshotIndex,
        divergence: Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false, ...overrides })
    });
}

function planNaming({ divergent = [], claims = [], snapshots = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze([...divergent]),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

const EMPTY_PLAN = planNaming({});

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:06:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — input tolerance.
    // ---------------------------------------------------------------
    {
        const genuine = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);

        for (const historyInput of [null, undefined, 'not a history', 42, {}, [null, undefined, 'garbage', { decided: false }]]) {
            let threw = false;
            let result;
            try { result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(historyInput, EMPTY_PLAN); } catch (error) { threw = true; }
            assert(!threw, `1. malformed decisionHistory (${JSON.stringify(historyInput)}) never throws`);
            assert(result.decisionCount === 0 && result.revalidations.length === 0, `2. malformed decisionHistory (${JSON.stringify(historyInput)}) degrades to decisionCount: 0, revalidations: []`);
        }

        for (const planInput of [null, undefined, 'not a plan', 42, [], true, {}, { divergentCorrespondences: 'not an array' }]) {
            let threw = false;
            let result;
            try { result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([genuine], planInput); } catch (error) { threw = true; }
            assert(!threw, `3. malformed plan (${JSON.stringify(planInput)}) never throws`);
            assert(result.decisionCount === 1, `4. malformed plan (${JSON.stringify(planInput)}) still reports decisionCount: 1`);
            assert(result.revalidations[0].candidatePresent === false, `5. malformed plan (${JSON.stringify(planInput)}) degrades candidatePresent to false`);
            assert(result.planIdentity.candidateCount === 0, `6. malformed plan (${JSON.stringify(planInput)}) degrades planIdentity.candidateCount to 0`);
        }

        // Both malformed together — still never throws.
        let bothThrew = false;
        try { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity('garbage', 'garbage'); } catch (error) { bothThrew = true; }
        assert(!bothThrew, '7. malformed decisionHistory AND plan together never throws');
    }
    console.log('✓ Section A: malformed decisionHistory/plan inputs degrade to explicit, non-throwing outcomes');

    // ---------------------------------------------------------------
    // Section B — empty history / empty plan.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([], EMPTY_PLAN);
        assert(result.decisionCount === 0, '8. an empty history produces decisionCount: 0');
        assert(result.revalidations.length === 0, '9. an empty history produces revalidations: []');
        assert(result.presentCandidateCount === 0 && result.absentCandidateCount === 0, '10. an empty history produces zero present/absent candidate counts');
        assert(result.planIdentity.candidateCount === 0, '11. an empty plan produces planIdentity.candidateCount: 0');

        const expectedEmptyIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(EMPTY_PLAN);
        assert(result.planIdentity.planFingerprint === expectedEmptyIdentity.planFingerprint, '12. planIdentity matches a direct 0.8.160 call over the identical empty plan');
        assert(result.planIdentity.algorithm === 'SHA-256', '13. planIdentity carries its own algorithm field');
    }
    console.log('✓ Section B: an empty history against an empty plan produces zero decision facts alongside a well-formed empty planIdentity');

    // ---------------------------------------------------------------
    // Section C — single decision + single candidate.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1], plan);
        assert(result.decisionCount === 1, '14. a single decision produces decisionCount: 1');
        assert(result.revalidations.length === 1, '15. a single decision produces exactly one revalidations entry');
        assert(result.revalidations[0].candidatePresent === true, '16. the single decision\'s own candidate, drawn from the plan itself, is present');
        assert(result.presentCandidateCount === 1 && result.absentCandidateCount === 0, '17. one present distinct candidate is tallied');
        assert(serialize(result.revalidations[0].decision) === serialize(D1), '18. the decision is echoed unchanged');
        assert(result.planIdentity.candidateCount === 1, '19. planIdentity reports the one candidate the plan itself names');

        const directIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);
        assert(result.planIdentity.planFingerprint === directIdentity.planFingerprint, '20. planIdentity matches a direct 0.8.160 call over the identical plan');
    }
    console.log('✓ Section C: a single decision and a single candidate compose correctly');

    // ---------------------------------------------------------------
    // Section D — all three candidate types.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ divergent: [divergentEntry('B', 0)], claims: ['C'], snapshots: [2] });

        const D_DIVERGENT = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 0 }, 'OBSERVE', T1);
        const D_CLAIM = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C' }, 'DEFER', T2);
        const D_SNAPSHOT = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T3);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D_DIVERGENT, D_CLAIM, D_SNAPSHOT], plan);
        assert(result.decisionCount === 3, '21. three decisions of all three candidate types produce decisionCount: 3');
        assert(result.revalidations[0].candidateType === 'DIVERGENT_CORRESPONDENCE', '22. DIVERGENT_CORRESPONDENCE candidateType is preserved');
        assert(result.revalidations[1].candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '23. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidateType is preserved');
        assert(result.revalidations[2].candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '24. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidateType is preserved');
        assert(result.revalidations.every((entry) => entry.candidatePresent === true), '25. all three candidates, each drawn from the plan itself, are present');
        assert(result.presentCandidateCount === 3 && result.absentCandidateCount === 0, '26. three distinct candidates are all tallied as present');
        assert(result.planIdentity.candidateCount === 3, '27. planIdentity reports all three candidates the plan itself names');
    }
    console.log('✓ Section D: all three candidate types compose correctly, both in revalidations and in planIdentity.candidateCount');

    // ---------------------------------------------------------------
    // Section E — plan identity is independently preserved: it never
    // varies with decision content or count.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1', 'C2'] });
        const directIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);

        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);

        const withNoDecisions = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([], plan);
        const withOneDecision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1], plan);
        const withTwoDecisions = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1, D1, D2], plan);

        assert(withNoDecisions.planIdentity.planFingerprint === directIdentity.planFingerprint, '28. planIdentity with zero decisions matches a direct 0.8.160 call');
        assert(withOneDecision.planIdentity.planFingerprint === directIdentity.planFingerprint, '29. planIdentity with one decision matches the identical direct 0.8.160 call');
        assert(withTwoDecisions.planIdentity.planFingerprint === directIdentity.planFingerprint, '30. planIdentity with three decisions (one duplicated) still matches the identical direct 0.8.160 call');
        assert(
            withNoDecisions.planIdentity.planFingerprint === withOneDecision.planIdentity.planFingerprint
            && withOneDecision.planIdentity.planFingerprint === withTwoDecisions.planIdentity.planFingerprint,
            '31. planFingerprint is identical across wildly different decisionHistory content — it is a fact about plan alone'
        );
        assert(withNoDecisions.decisionCount !== withTwoDecisions.decisionCount, '32. decisionCount, by contrast, varies freely with decisionHistory content');
    }
    console.log('✓ Section E: planIdentity is an independent fact about plan alone, unaffected by decisionHistory content or count');

    // ---------------------------------------------------------------
    // Section F — same decision against two different plans: the flagship.
    // D1(C1)->OBSERVE, D2(C2)->DEFER, D3(C1)->OBSERVE.
    // P1 contains C1 and C2. P2 contains only C1.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const D3 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T3);
        const history = [D1, D2, D3];

        const P1 = planNaming({ claims: ['C1', 'C2'] });
        const P2 = planNaming({ claims: ['C1'] });

        const resultP1 = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(history, P1);
        const resultP2 = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(history, P2);

        assert(resultP1.planIdentity.planFingerprint !== resultP2.planIdentity.planFingerprint, '33. FLAGSHIP — P1 and P2 fingerprint differently');

        assert(resultP1.revalidations[0].candidatePresent === true, '34. FLAGSHIP — D1 present against P1');
        assert(resultP1.revalidations[1].candidatePresent === true, '35. FLAGSHIP — D2 present against P1');
        assert(resultP1.revalidations[2].candidatePresent === true, '36. FLAGSHIP — D3 present against P1');

        assert(resultP2.revalidations[0].candidatePresent === true, '37. FLAGSHIP — D1 present against P2');
        assert(resultP2.revalidations[1].candidatePresent === false, '38. FLAGSHIP — D2 absent against P2');
        assert(resultP2.revalidations[2].candidatePresent === true, '39. FLAGSHIP — D3 present against P2');

        // The decision records themselves remain unchanged across both calls.
        assert(serialize(resultP1.revalidations[0].decision) === serialize(resultP2.revalidations[0].decision), '40. FLAGSHIP — D1 is echoed identically regardless of which plan it was revalidated against');
        assert(serialize(resultP1.revalidations[1].decision) === serialize(resultP2.revalidations[1].decision), '41. FLAGSHIP — D2 is echoed identically despite reading present against P1 and absent against P2');
        assert(serialize(resultP1.revalidations[2].decision) === serialize(resultP2.revalidations[2].decision), '42. FLAGSHIP — D3 is echoed identically regardless of which plan it was revalidated against');

        assert(resultP1.decisionCount === 3 && resultP2.decisionCount === 3, '43. FLAGSHIP — decisionCount is unaffected by which plan was supplied');
        assert(resultP1.presentCandidateCount === 2 && resultP1.absentCandidateCount === 0, '44. FLAGSHIP — against P1, both distinct candidates (C1, C2) are present');
        assert(resultP2.presentCandidateCount === 1 && resultP2.absentCandidateCount === 1, '45. FLAGSHIP — against P2, C1 is present and C2 is absent');

        // Critical independence — planFingerprint != candidateMatchesPlan.
        // The two facts genuinely differ in what they vary with.
        assert(resultP1.planIdentity.planFingerprint !== resultP2.planIdentity.planFingerprint, '46. CRITICAL INDEPENDENCE — planFingerprint differs between P1 and P2');
        assert(resultP1.revalidations[0].candidateMatchesPlan === resultP2.revalidations[0].candidateMatchesPlan, '47. CRITICAL INDEPENDENCE — D1\'s own candidateMatchesPlan is identical (true) on both plans even though planFingerprint differs — the two facts are not the same fact');
    }
    console.log('✓ Section F: FLAGSHIP — the same history against two different plans produces two different plan identities alongside independently varying candidatePresent facts');

    // ---------------------------------------------------------------
    // Section G — decision disposition independence.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const selection = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' };
        const D_OBSERVE = genuineDecisionRecord(selection, 'OBSERVE', T1);
        const D_DEFER = genuineDecisionRecord(selection, 'DEFER', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D_OBSERVE, D_DEFER], plan);
        assert(result.revalidations[0].candidatePresent === result.revalidations[1].candidatePresent, '48. OBSERVE and DEFER against the identical candidate/plan report the identical candidatePresent value');
        assert(result.revalidations[0].candidateMatchesPlan === result.revalidations[1].candidateMatchesPlan, '49. OBSERVE and DEFER report the identical candidateMatchesPlan value');
        assert(result.presentCandidateCount === 1, '50. OBSERVE and DEFER against the same candidate contribute one distinct present candidate, not two');

        // planIdentity is entirely indifferent to disposition — it never
        // even reads decisionHistory.
        const directIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);
        assert(result.planIdentity.planFingerprint === directIdentity.planFingerprint, '51. planIdentity is unaffected by decision disposition');
    }
    console.log('✓ Section G: OBSERVE vs. DEFER never affects candidate matching, candidate-level tallies, or planIdentity');

    // ---------------------------------------------------------------
    // Section H — duplicate decisions and candidate multiplicity.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['dup-claim', 'other-claim'] });
        const decisionC1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'dup-claim' }, 'OBSERVE', T1);
        const decisionC2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'other-claim' }, 'DEFER', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([decisionC1, decisionC1, decisionC2], plan);
        assert(result.decisionCount === 3, '52. [D1, D1, D2] produces decisionCount: 3, never deduplicated to 2');
        assert(result.revalidations.length === 3, '53. [D1, D1, D2] produces exactly three revalidations entries');
        assert(result.presentCandidateCount === 2 && result.absentCandidateCount === 0, '54. only two distinct candidates are tallied — dup-claim once, other-claim once — despite dup-claim being decided upon twice');
        assert(result.planIdentity.candidateCount === 2, '55. planIdentity.candidateCount counts the plan\'s own two candidates, entirely unaffected by decision-level duplication');

        // A plan naming the identical candidate twice, by contrast, is a
        // structurally distinct plan artifact from one naming it once —
        // 0.8.160's own multiplicity rule, held here unchanged.
        const duplicatedPlan = planNaming({ claims: ['dup-claim', 'dup-claim'] });
        const resultDuplicatedPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([decisionC1], duplicatedPlan);
        assert(resultDuplicatedPlan.planIdentity.candidateCount === 2, '56. a plan naming the same claimId twice reports planIdentity.candidateCount: 2, never collapsed to 1');
        assert(resultDuplicatedPlan.decisionCount === 1, '57. decisionCount is unaffected by the plan\'s own candidate duplication');
    }
    console.log('✓ Section H: decision-history duplication and plan-level candidate duplication are independent multiplicities, neither collapsed by the other');

    // ---------------------------------------------------------------
    // Section I — exact candidate identity.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ divergent: [divergentEntry('B', 0), divergentEntry('B', 1)] });
        const D_S1 = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 0 }, 'OBSERVE', T1);
        const D_S2 = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 1 }, 'OBSERVE', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D_S1, D_S2], plan);
        assert(result.presentCandidateCount === 2, '58. C1/S1 and C1/S2 are counted as two distinct present candidates, never collapsed into one');
        assert(result.planIdentity.candidateCount === 2, '59. planIdentity reports the identical two distinct candidates the plan itself names');

        // A CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate must never match
        // a SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM entry sharing the identical
        // value under a different field/type.
        const sharedValue = '7';
        const collisionPlan = planNaming({ snapshots: [Number(sharedValue)] });
        const claimCandidateDecision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: sharedValue }, 'OBSERVE', T1);
        const rCollision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([claimCandidateDecision], collisionPlan);
        assert(rCollision.revalidations[0].candidatePresent === false, '60. a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate never matches a snapshotsWithoutCorrespondence entry sharing the identical numeric/string value');
        assert(rCollision.planIdentity.candidateCount === 1, '61. the collision plan still reports planIdentity.candidateCount: 1 — the candidate it names, regardless of whether any decision matches it');
    }
    console.log('✓ Section I: candidate identity is precise, in both revalidations and planIdentity — distinct snapshotIndex/type values never collide');

    // ---------------------------------------------------------------
    // Section J — immutability.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const history = [D1];
        const historyJsonBefore = serialize(history);
        const planJsonBefore = serialize(plan);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(history, plan);

        assert(serialize(history) === historyJsonBefore, '62. the original decisionHistory is never mutated');
        assert(serialize(plan) === planJsonBefore, '63. the supplied plan is never mutated');
        assert(Object.isFrozen(result), '64. the result is frozen');
        assert(Object.isFrozen(result.planIdentity), '65. planIdentity is frozen');
        assert(Object.isFrozen(result.revalidations), '66. revalidations is frozen');
        assert(Object.isFrozen(result.revalidations[0]), '67. each revalidations entry is frozen');
        assert(result.revalidations[0].decision === D1, '68. the echoed decision is the original decision record itself, by reference, never a reconstructed copy');
    }
    console.log('✓ Section J: neither decisionHistory nor plan is ever mutated, and the result (including planIdentity and every revalidations entry) is frozen');

    // ---------------------------------------------------------------
    // Section K — determinism.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1', 'C2'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1, D2], plan);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1, D2], plan);
        assert(serialize(once) === serialize(twice), '69. repeated calls with the identical decisionHistory/plan produce a byte-identical result');

        // Two independently constructed but structurally equivalent plans
        // (never the same object reference) agree too.
        const rebuiltPlan = planNaming({ claims: ['C1', 'C2'] });
        const rebuilt = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1, D2], rebuiltPlan);
        assert(rebuilt.planIdentity.planFingerprint === once.planIdentity.planFingerprint, '70. two independently constructed plans with equivalent structural content fingerprint identically');
        assert(serialize(rebuilt.revalidations) === serialize(once.revalidations), '71. ...and produce byte-identical revalidations');
    }
    console.log('✓ Section K: repeated calls with equivalent arguments produce byte-identical results');

    // ---------------------------------------------------------------
    // Section L — architectural regression.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([D1], plan);

        const topKeys = Object.keys(result).sort();
        assert(
            serialize(topKeys) === serialize(['planIdentity', 'decisionCount', 'revalidations', 'presentCandidateCount', 'absentCandidateCount'].sort()),
            '72. the result carries exactly the documented, factual top-level fields'
        );

        const planIdentityKeys = Object.keys(result.planIdentity).sort();
        assert(serialize(planIdentityKeys) === serialize(['algorithm', 'planFingerprint', 'candidateCount'].sort()), '73. planIdentity carries exactly 0.8.160\'s own three fields');

        const entryKeys = Object.keys(result.revalidations[0]).sort();
        assert(serialize(entryKeys) === serialize(['decisionIndex', 'decision', 'candidatePresent', 'candidateType', 'candidateMatchesPlan'].sort()), '74. each revalidations entry carries exactly 0.8.158\'s own documented fields');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown', 'valid', 'invalid', 'preferred', 'authoritative', 'current'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term), `75. the result never carries interpretation vocabulary ('${term}') as a top-level field`);
        }

        const fs = await import('node:fs/promises');
        const moduleSource = await fs.readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        // Exactly two imports — 0.8.158's own history-revalidation
        // projection and 0.8.160's own plan-identity projection.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '76. this file imports exactly two modules');
        assert(importLines.some((line) => line.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js')), '77. one import is 0.8.158\'s own decision history revalidation projection');
        assert(importLines.some((line) => line.includes('PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js')), '78. the other import is 0.8.160\'s own plan identity projection');

        const forbiddenInCode = [
            'correct', 'wrong', 'stale', 'resolved', 'preferred', 'authoritative', 'current',
            'archive', 'reconciliationdecision.js', 'reconciliationdecisionhistory.js', 'reconciliationplanview',
            'trust', 'confidence', 'reputation', 'severity', 'winner', 'ranking',
            'repair', 'accept', 'reject', 'merge', 'delete', 'apply', 'execute', 'resolve'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `79. this file's own code never carries "${term}"`);
        }

        // No 0.8.144 candidate selection, no 0.8.157 direct matching — only
        // 0.8.158 (which itself composes 0.8.157) is ever called.
        assert(!codeOnly.includes('decisioncandidaterevalidationview'), '80. this file never imports 0.8.157\'s own single-decision revalidation module directly');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate('), '81. this file never calls 0.8.144\'s own candidate-selection function directly');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationdecisioncandidaterevalidation('), '82. this file never calls 0.8.157\'s own function directly — only through 0.8.158');

        // No decision-generation, decision-history-archive, or
        // plan-reconstruction module of any kind.
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationdecision(') , '83. this file never calls 0.8.145\'s own decision-recording function');
        assert(!codeOnly.includes('decisionhistoryview'), '84. this file never imports 0.8.150\'s own archive-reading decision history seam');
        assert(!codeOnly.includes('reconstructpublisherleaderboard'), '85. this file never mentions reconstructing anything from archive state');

        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.js');
        assert(typeof module.describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity === 'function', '86. describeXxx() is exported');
        assert(module.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity === undefined, '87. no reconstructXxx() is exported — this file never invents a way to reconstruct a plan from current archive state');
    }
    console.log('✓ Section L: architectural regression — exactly two imports (0.8.158 + 0.8.160), no forbidden dependencies or interpretation vocabulary, no reconstructXxx()');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.test.js FAILED:', error);
    process.exitCode = 1;
});
