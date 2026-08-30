import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js';

// 0.8.162 — Historical Decision Revalidation Observation Record.
//
// Section A: invalid decisionRecord -> INVALID_OBSERVATION, never a throw
// Section B: invalid plan -> INVALID_OBSERVATION, never a throw
// Section C: a plan that IS a genuine object, but internally malformed,
//            is NOT rejected — it degrades exactly like 0.8.161/0.8.160
// Section D: invalid observedAt -> INVALID_OBSERVATION, never a throw
// Section E: a successful observation, candidate present
// Section F: a successful observation, candidate absent
// Section G: all three candidate types
// Section H: the flagship — the same decision against two different plans
// Section I: decision disposition independence
// Section J: immutability
// Section K: determinism
// Section L: architectural regression — exactly one import (0.8.161), no
//            forbidden dependencies or interpretation vocabulary, no
//            reconstructXxx(), no archive integration

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
const OBSERVED_AT = new Date('2026-08-30T12:00:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — invalid decisionRecord.
    // ---------------------------------------------------------------
    {
        for (const decisionInput of [null, undefined, 'not a decision', 42, {}, { decided: false }, { decided: true, candidate: null, decision: 'OBSERVE', decidedAt: T1.toISOString() }, { decided: true, candidate: { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'ACCEPT', decidedAt: T1.toISOString() }, { decided: true, candidate: { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: 42 }]) {
            let threw = false;
            let result;
            try { result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionInput, EMPTY_PLAN, OBSERVED_AT); } catch (error) { threw = true; }
            assert(!threw, `1. malformed decisionRecord (${JSON.stringify(decisionInput)}) never throws`);
            assert(serialize(result) === serialize({ observed: false, outcome: 'INVALID_OBSERVATION' }), `2. malformed decisionRecord (${JSON.stringify(decisionInput)}) produces { observed: false, outcome: 'INVALID_OBSERVATION' }`);
        }
    }
    console.log('✓ Section A: a decisionRecord that is not a genuine 0.8.145 record produces an explicit, non-throwing INVALID_OBSERVATION outcome');

    // ---------------------------------------------------------------
    // Section B — invalid plan (not even a genuine object).
    // ---------------------------------------------------------------
    {
        const genuine = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        for (const planInput of [null, undefined, 'not a plan', 42, true, [], [1, 2]]) {
            let threw = false;
            let result;
            try { result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(genuine, planInput, OBSERVED_AT); } catch (error) { threw = true; }
            assert(!threw, `3. malformed plan (${JSON.stringify(planInput)}) never throws`);
            assert(serialize(result) === serialize({ observed: false, outcome: 'INVALID_OBSERVATION' }), `4. malformed plan (${JSON.stringify(planInput)}) produces { observed: false, outcome: 'INVALID_OBSERVATION' }`);
        }
    }
    console.log('✓ Section B: a plan that is not even a genuine object produces an explicit, non-throwing INVALID_OBSERVATION outcome');

    // ---------------------------------------------------------------
    // Section C — a plan that IS a genuine object but internally
    // malformed is NOT rejected as INVALID_OBSERVATION; it degrades
    // exactly like 0.8.161/0.8.160 already do.
    // ---------------------------------------------------------------
    {
        const genuine = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        for (const planInput of [{}, { divergentCorrespondences: 'not an array' }, { claimsWithoutCorrespondence: null }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(genuine, planInput, OBSERVED_AT);
            assert(result.observed === true, `5. an internally malformed but genuinely object-shaped plan (${JSON.stringify(planInput)}) is still observed: true`);
            assert(result.candidatePresent === false, `6. an internally malformed plan (${JSON.stringify(planInput)}) degrades candidatePresent to false`);
            assert(result.planIdentity.candidateCount === 0, `7. an internally malformed plan (${JSON.stringify(planInput)}) degrades planIdentity.candidateCount to 0`);
        }
    }
    console.log('✓ Section C: a genuinely object-shaped plan with malformed internal lists is a valid, empty plan observation — never INVALID_OBSERVATION');

    // ---------------------------------------------------------------
    // Section D — invalid observedAt.
    // ---------------------------------------------------------------
    {
        const genuine = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        for (const observedAtInput of [null, undefined, 'not a date', {}, NaN]) {
            let threw = false;
            let result;
            try { result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(genuine, EMPTY_PLAN, observedAtInput); } catch (error) { threw = true; }
            assert(!threw, `8. malformed observedAt (${JSON.stringify(observedAtInput)}) never throws`);
            assert(serialize(result) === serialize({ observed: false, outcome: 'INVALID_OBSERVATION' }), `9. malformed observedAt (${JSON.stringify(observedAtInput)}) produces { observed: false, outcome: 'INVALID_OBSERVATION' }`);
        }

        // A numeric epoch millisecond value, and an ISO string, are both
        // valid Date-constructible inputs — mirroring 0.8.145's own
        // decidedAt tolerance.
        const fromEpoch = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(genuine, EMPTY_PLAN, OBSERVED_AT.getTime());
        const fromIsoString = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(genuine, EMPTY_PLAN, OBSERVED_AT.toISOString());
        assert(fromEpoch.observed === true && fromEpoch.observedAt === OBSERVED_AT.toISOString(), '10. a numeric epoch observedAt is accepted and serialized as ISO 8601');
        assert(fromIsoString.observed === true && fromIsoString.observedAt === OBSERVED_AT.toISOString(), '11. an ISO string observedAt is accepted and serialized as ISO 8601');
    }
    console.log('✓ Section D: an absent or malformed observedAt produces an explicit, non-throwing INVALID_OBSERVATION outcome; any Date-constructible value is accepted');

    // ---------------------------------------------------------------
    // Section E — a successful observation, candidate present.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, plan, OBSERVED_AT);
        assert(result.observed === true, '12. a genuine decision and plan produce observed: true');
        assert(serialize(result.decision) === serialize(D1), '13. the decision is echoed unchanged');
        assert(result.candidatePresent === true, '14. the candidate, drawn from the plan itself, is present');
        assert(result.candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '15. candidateType is preserved');
        assert(result.candidateMatchesPlan === true, '16. candidateMatchesPlan agrees with candidatePresent');
        assert(result.observedAt === OBSERVED_AT.toISOString(), '17. observedAt is serialized as ISO 8601');

        const directIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);
        assert(result.planIdentity.planFingerprint === directIdentity.planFingerprint, '18. planIdentity matches a direct 0.8.160 call over the identical plan');
        assert(result.planIdentity.candidateCount === 1, '19. planIdentity reports the one candidate the plan itself names');
    }
    console.log('✓ Section E: a successful observation reports observed: true alongside an unchanged decision, correct candidate facts, and a matching planIdentity');

    // ---------------------------------------------------------------
    // Section F — a successful observation, candidate absent.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['someone-else'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'DEFER', T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, plan, OBSERVED_AT);
        assert(result.observed === true, '20. an absent candidate is still observed: true — absence is a fact, not an invalid input');
        assert(result.candidatePresent === false, '21. the candidate, absent from the plan, reads candidatePresent: false');
        assert(result.candidateMatchesPlan === false, '22. candidateMatchesPlan agrees with candidatePresent');
        assert(serialize(result.decision) === serialize(D1), '23. the decision is echoed unchanged, still DEFER, regardless of absence');
    }
    console.log('✓ Section F: an absent candidate is a successful observation stating one plain fact, never a verdict, never an invalid outcome');

    // ---------------------------------------------------------------
    // Section G — all three candidate types.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ divergent: [divergentEntry('B', 0)], claims: ['C'], snapshots: [2] });

        const D_DIVERGENT = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 0 }, 'OBSERVE', T1);
        const D_CLAIM = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C' }, 'DEFER', T2);
        const D_SNAPSHOT = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T3);

        const rDivergent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D_DIVERGENT, plan, OBSERVED_AT);
        const rClaim = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D_CLAIM, plan, OBSERVED_AT);
        const rSnapshot = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D_SNAPSHOT, plan, OBSERVED_AT);

        assert(rDivergent.candidateType === 'DIVERGENT_CORRESPONDENCE' && rDivergent.candidatePresent === true, '24. DIVERGENT_CORRESPONDENCE observed correctly');
        assert(rClaim.candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT' && rClaim.candidatePresent === true, '25. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT observed correctly');
        assert(rSnapshot.candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM' && rSnapshot.candidatePresent === true, '26. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM observed correctly');

        assert(rDivergent.planIdentity.planFingerprint === rClaim.planIdentity.planFingerprint && rClaim.planIdentity.planFingerprint === rSnapshot.planIdentity.planFingerprint, '27. all three observations against the identical plan share the identical planFingerprint');
    }
    console.log('✓ Section G: all three candidate types are observed correctly, each against a shared planIdentity');

    // ---------------------------------------------------------------
    // Section H — the flagship: the same decision against two
    // different plans.
    // D1 + Plan A -> candidateMatchesPlan: true
    // D1 + Plan B -> candidateMatchesPlan: false
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const planB = planNaming({ claims: ['C2'] });

        const observationA = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, planA, T2);
        const observationB = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, planB, T3);

        assert(observationA.candidateMatchesPlan === true, '28. FLAGSHIP — D1 against Plan A reads candidateMatchesPlan: true');
        assert(observationB.candidateMatchesPlan === false, '29. FLAGSHIP — D1 against Plan B reads candidateMatchesPlan: false');
        assert(observationA.planIdentity.planFingerprint !== observationB.planIdentity.planFingerprint, '30. FLAGSHIP — the two observations carry two permanently distinguishable planFingerprint values');
        assert(serialize(observationA.decision) === serialize(observationB.decision), '31. FLAGSHIP — the same historical decision is echoed identically in both observations');
        assert(observationA.observedAt !== observationB.observedAt, '32. FLAGSHIP — the two observations carry their own, independently supplied observedAt values');
        assert(observationA.observed === true && observationB.observed === true, '33. FLAGSHIP — neither observation is a verdict about the other; both are simply observed: true');
    }
    console.log('✓ Section H: FLAGSHIP — the same historical decision, observed against two different plans, produces two permanently distinguishable records, neither one a verdict about the other');

    // ---------------------------------------------------------------
    // Section I — decision disposition independence.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const selection = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' };
        const D_OBSERVE = genuineDecisionRecord(selection, 'OBSERVE', T1);
        const D_DEFER = genuineDecisionRecord(selection, 'DEFER', T2);

        const rObserve = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D_OBSERVE, plan, OBSERVED_AT);
        const rDefer = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D_DEFER, plan, OBSERVED_AT);

        assert(rObserve.candidatePresent === rDefer.candidatePresent, '34. OBSERVE and DEFER against the identical candidate/plan report the identical candidatePresent value');
        assert(rObserve.candidateMatchesPlan === rDefer.candidateMatchesPlan, '35. OBSERVE and DEFER report the identical candidateMatchesPlan value');
        assert(rObserve.planIdentity.planFingerprint === rDefer.planIdentity.planFingerprint, '36. disposition never affects planIdentity');
    }
    console.log('✓ Section I: OBSERVE vs. DEFER never affects candidate matching or planIdentity');

    // ---------------------------------------------------------------
    // Section J — immutability.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const decisionJsonBefore = serialize(D1);
        const planJsonBefore = serialize(plan);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, plan, OBSERVED_AT);

        assert(serialize(D1) === decisionJsonBefore, '37. the original decisionRecord is never mutated');
        assert(serialize(plan) === planJsonBefore, '38. the supplied plan is never mutated');
        assert(Object.isFrozen(result), '39. the result is frozen');
        assert(Object.isFrozen(result.planIdentity), '40. planIdentity is frozen');
        assert(result.decision === D1, '41. the echoed decision is the original decision record itself, by reference, never a reconstructed copy');

        const invalidResult = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(null, plan, OBSERVED_AT);
        assert(Object.isFrozen(invalidResult), '42. an INVALID_OBSERVATION result is frozen too');
    }
    console.log('✓ Section J: neither decisionRecord nor plan is ever mutated, and every result (valid or invalid) is frozen');

    // ---------------------------------------------------------------
    // Section K — determinism.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1', 'C2'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, plan, OBSERVED_AT);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, plan, OBSERVED_AT);
        assert(serialize(once) === serialize(twice), '43. repeated calls with the identical arguments produce a byte-identical result');

        const rebuiltPlan = planNaming({ claims: ['C1', 'C2'] });
        const rebuilt = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, rebuiltPlan, OBSERVED_AT);
        assert(serialize(rebuilt) === serialize(once), '44. two independently constructed but structurally equivalent plans produce a byte-identical observation');
    }
    console.log('✓ Section K: repeated calls with equivalent arguments produce byte-identical results');

    // ---------------------------------------------------------------
    // Section L — architectural regression.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['C1'] });
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(D1, plan, OBSERVED_AT);

        const topKeys = Object.keys(result).sort();
        assert(
            serialize(topKeys) === serialize(['observed', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'].sort()),
            '45. a successful result carries exactly the documented, factual top-level fields'
        );

        const invalidResult = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(null, plan, OBSERVED_AT);
        assert(serialize(Object.keys(invalidResult).sort()) === serialize(['observed', 'outcome'].sort()), '46. an invalid result carries exactly observed/outcome');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown', 'valid', 'preferred', 'authoritative', 'current'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term), `47. the result never carries interpretation vocabulary ('${term}') as a top-level field`);
        }

        const fs = await import('node:fs/promises');
        const moduleSource = await fs.readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '48. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.js'), '49. the one import is 0.8.161\'s own combined revalidation-plus-plan-identity projection');

        const forbiddenInCode = [
            'correct', 'wrong', 'stale', 'resolved', 'preferred', 'authoritative', 'current',
            'archive', 'publicationobservationarchive',
            'trust', 'confidence', 'reputation', 'severity', 'winner', 'ranking',
            'repair', 'accept', 'reject', 'merge', 'delete', 'apply', 'execute', 'resolve'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `50. this file's own code never carries "${term}"`);
        }

        // Only 0.8.161 is ever called directly — no direct 0.8.144/0.8.157/
        // 0.8.158/0.8.160 calls.
        assert(!codeOnly.includes("from './publisherleaderboardclaimsnapshotreconciliationdecisioncandidaterevalidationview.js'"), '51. this file never imports 0.8.157\'s own single-decision revalidation module directly');
        assert(!codeOnly.includes("from './publisherleaderboardclaimsnapshotreconciliationdecisionhistoryrevalidationview.js'"), '52. this file never imports 0.8.158\'s own history revalidation module directly');
        assert(!codeOnly.includes("from './publisherleaderboardclaimsnapshotreconciliationplanidentity.js'"), '53. this file never imports 0.8.160\'s own plan identity module directly');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate('), '54. this file never calls 0.8.144\'s own candidate-selection function directly');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationdecision('), '55. this file never calls 0.8.145\'s own decision-recording function');
        assert(!codeOnly.includes('reconstructpublisherleaderboard'), '56. this file never mentions reconstructing anything from archive state');

        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js');
        assert(typeof module.describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation === 'function', '57. describeXxx() is exported');
        assert(module.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation === undefined, '58. no reconstructXxx() is exported');
    }
    console.log('✓ Section L: architectural regression — exactly one import (0.8.161), no forbidden dependencies or interpretation vocabulary, no reconstructXxx(), no archive integration');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.test.js FAILED:', error);
    process.exitCode = 1;
});
