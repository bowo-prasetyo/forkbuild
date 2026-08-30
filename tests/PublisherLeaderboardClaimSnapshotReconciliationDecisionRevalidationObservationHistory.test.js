import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import {
    appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry,
    findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint,
    findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId,
    findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';

// 0.8.163 — Historical Decision Revalidation Observation History.
//
// Section A: appendXxx() — append-only, never mutates its input, refuses to
//            append anything that is not a genuine 0.8.162
//            `{ observed: true, ... }` result (no-op, never a throw)
// Section B: FLAGSHIP — O1 = D1/C1/PlanA/true, O2 = D1/C1/PlanB/false,
//            O3 = D2/C1/PlanA/true, O4 = D1/C1/PlanA/true (byte-identical
//            to O1) — the resulting history holds FOUR entries, O1 and O4
//            both present, never collapsed
// Section C: findXxx() lookups — by planFingerprint, by decisionId, by
//            candidateType, each an order-preserving, exact-field lookup
// Section D: planFingerprint lookup is indifferent to candidate presence,
//            decision disposition, and observedAt
// Section E: decisionId lookup never matches by candidate alone
// Section F: candidateType lookup across all three closed candidate types,
//            never a synthetic fourth category
// Section G: architecture — no imports, no forbidden vocabulary, no
//            mutation, determinism, zero network access

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

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:06:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — appendXxx() tolerance and shape.
    // ---------------------------------------------------------------
    {
        let history = [];
        for (const malformed of [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }]) {
            const after = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, malformed);
            assert(after.length === 0, `1. appending a non-genuine observation (${JSON.stringify(malformed)}) is a no-op`);
            assert(Object.isFrozen(after), '2. the no-op result is still frozen');
        }
        assert(history.length === 0, '3. the original array handed in is never mutated by a no-op append');
    }
    console.log('✓ Section A: appendXxx() never appends anything except a genuine { observed: true, ... } observation record — malformed input is a silent no-op, never a throw');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   D1 = OBSERVE(C1), decided T1        D2 = DEFER(C1), decided T3
    //   PlanA names C1 (+ C2)                PlanB names C2 only (not C1)
    //
    //   O1 = D1 / PlanA / true  / observed OBS_T1
    //   O2 = D1 / PlanB / false / observed OBS_T2
    //   O3 = D2 / PlanA / true  / observed OBS_T3
    //   O4 = D1 / PlanA / true  / observed OBS_T1   (byte-identical to O1)
    // ---------------------------------------------------------------
    let history, D1, D2, planA, planB, O1, O2, O3, O4;
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' };
        D1 = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        D2 = genuineDecisionRecord(candidate, 'DEFER', T3);
        planA = planNaming({ claims: ['C1', 'C2'] });
        planB = planNaming({ claims: ['C2'] });

        O1 = observe(D1, planA, OBS_T1);
        O2 = observe(D1, planB, OBS_T2);
        O3 = observe(D2, planA, OBS_T3);
        O4 = observe(D1, planA, OBS_T1);

        assert(O1.candidateMatchesPlan === true, '4. FLAGSHIP — O1 (D1 against PlanA) reads candidateMatchesPlan: true');
        assert(O2.candidateMatchesPlan === false, '5. FLAGSHIP — O2 (D1 against PlanB) reads candidateMatchesPlan: false');
        assert(O3.candidateMatchesPlan === true, '6. FLAGSHIP — O3 (D2 against PlanA) reads candidateMatchesPlan: true');
        assert(serialize(O1) === serialize(O4), '7. FLAGSHIP — O1 and O4 are byte-identical observations (same decision, same plan, same observedAt)');

        history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O2);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O3);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O4);

        assert(history.length === 4, '8. FLAGSHIP — the resulting history holds FOUR entries, including both identical O1 and O4');
        assert(history[0] === O1 && history[1] === O2 && history[2] === O3 && history[3] === O4, '9. FLAGSHIP — entries preserve insertion order exactly');
        assert(serialize(history[0]) === serialize(history[3]), '10. FLAGSHIP — O1 and O4 remain two separate, byte-identical entries, never collapsed into one');

        const historyWithFifth = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1);
        assert(historyWithFifth.length === 5, '11. FLAGSHIP — appending yet another observation identical to O1 produces a FIFTH entry, never collapsing back to four');
    }
    console.log('✓ Section B: FLAGSHIP — D1 against PlanA, D1 against PlanB, D2 against PlanA, and a repeat of D1 against PlanA produce four history entries, with the two identical observations preserved side by side rather than deduplicated');

    // ---------------------------------------------------------------
    // Section C — findXxx() lookups.
    // ---------------------------------------------------------------
    {
        const byPlanA = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(history, O1.planIdentity.planFingerprint);
        assert(byPlanA.length === 3 && byPlanA[0] === O1 && byPlanA[1] === O3 && byPlanA[2] === O4, '12. findByPlanFingerprint(PlanA) returns O1, O3, O4 in order — never O2');

        const byPlanB = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(history, O2.planIdentity.planFingerprint);
        assert(byPlanB.length === 1 && byPlanB[0] === O2, '13. findByPlanFingerprint(PlanB) returns exactly O2');

        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(history, 'f'.repeat(64)).length === 0, '14. an unknown planFingerprint finds nothing');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(history, null).length === 0, '15. a malformed planFingerprint finds nothing, never throws');

        const byD1 = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(history, D1);
        assert(byD1.length === 3 && byD1[0] === O1 && byD1[1] === O2 && byD1[2] === O4, '16. findByDecisionId(D1) returns O1, O2, O4 in order — never O3');

        const byD2 = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(history, D2);
        assert(byD2.length === 1 && byD2[0] === O3, '17. findByDecisionId(D2) returns exactly O3');

        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(history, { type: 'unrelated' }).length === 0, '18. an unrecognized decisionId finds nothing');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(history, null).length === 0, '19. a malformed decisionId finds nothing, never throws');

        const byType = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(history, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        assert(byType.length === 4 && byType[0] === O1 && byType[1] === O2 && byType[2] === O3 && byType[3] === O4, '20. findByCandidateType(CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT) returns all four entries, in order');

        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(history, 'DIVERGENT_CORRESPONDENCE').length === 0, '21. findByCandidateType(DIVERGENT_CORRESPONDENCE) finds nothing in this history');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(history, 'UNKNOWN').length === 0, '22. an out-of-vocabulary candidateType finds nothing — no synthetic UNKNOWN category is ever matched');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(history, null).length === 0, '23. a malformed candidateType finds nothing, never throws');
    }
    console.log('✓ Section C: findByPlanFingerprint/findByDecisionId/findByCandidateType are exact, order-preserving lookups');

    // ---------------------------------------------------------------
    // Section D — planFingerprint lookup is indifferent to candidate
    // presence, decision disposition, and observedAt.
    // ---------------------------------------------------------------
    {
        // A decision whose own candidate is ABSENT from PlanA, observed
        // against PlanA anyway — a valid observation (0.8.162's own
        // Section F), still findable by planFingerprint.
        const absentCandidateDecision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'nobody' }, 'DEFER', T2);
        const O5 = observe(absentCandidateDecision, planA, OBS_T3);
        assert(O5.candidatePresent === false, '24. setup — O5\'s candidate is genuinely absent from PlanA');

        let localHistory = [];
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, O1);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, O3);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, O5);

        const found = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(localHistory, O1.planIdentity.planFingerprint);
        assert(found.length === 3, '25. findByPlanFingerprint(PlanA) returns O1 (OBSERVE, candidate present), O3 (DEFER-derived D2, candidate present), and O5 (candidate absent) alike');
        assert(found[0] === O1 && found[1] === O3 && found[2] === O5, '26. all three are returned regardless of disposition or candidate presence, in history order');
    }
    console.log('✓ Section D: findByPlanFingerprint matches purely on plan identity, regardless of candidate presence, decision disposition, or observedAt');

    // ---------------------------------------------------------------
    // Section E — decisionId lookup never matches by candidate alone.
    // ---------------------------------------------------------------
    {
        // D1 and D2 (Section B) already share the identical candidate C1
        // but differ in disposition and decidedAt — findByDecisionId(D1)
        // (Section C, assertion 16) already excludes O3 (D2's own
        // observation). This section adds the converse: a decision that
        // shares D1's own decidedAt/disposition but names a DIFFERENT
        // candidate must not appear under findByDecisionId(D1) either.
        const otherCandidateDecision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'OBSERVE', T1);
        const O6 = observe(otherCandidateDecision, planA, OBS_T1);

        let localHistory = [];
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, O1);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, O6);

        const byD1 = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(localHistory, D1);
        assert(byD1.length === 1 && byD1[0] === O1, '27. findByDecisionId(D1) excludes O6, whose decision shares D1\'s own disposition/decidedAt but names a different candidate');

        const byOtherCandidateDecision = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(localHistory, otherCandidateDecision);
        assert(byOtherCandidateDecision.length === 1 && byOtherCandidateDecision[0] === O6, '28. findByDecisionId(otherCandidateDecision) returns exactly O6');
    }
    console.log('✓ Section E: findByDecisionId requires the complete decision identity — candidate + decision + decidedAt — never candidate alone');

    // ---------------------------------------------------------------
    // Section F — candidateType lookup across all three closed types.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ divergent: [divergentEntry('B', 0)], claims: ['C'], snapshots: [2] });
        const dDivergent = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 0 }, 'OBSERVE', T1);
        const dClaim = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C' }, 'DEFER', T2);
        const dSnapshot = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T3);

        let localHistory = [];
        const oDivergent = observe(dDivergent, plan, OBS_T1);
        const oClaim = observe(dClaim, plan, OBS_T2);
        const oSnapshot = observe(dSnapshot, plan, OBS_T3);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, oDivergent);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, oClaim);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, oSnapshot);

        const byDivergent = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(localHistory, 'DIVERGENT_CORRESPONDENCE');
        assert(byDivergent.length === 1 && byDivergent[0] === oDivergent, '29. findByCandidateType(DIVERGENT_CORRESPONDENCE) returns exactly the one matching entry');

        const byClaim = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(localHistory, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        assert(byClaim.length === 1 && byClaim[0] === oClaim, '30. findByCandidateType(CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT) returns exactly the one matching entry');

        const bySnapshot = findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(localHistory, 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM');
        assert(bySnapshot.length === 1 && bySnapshot[0] === oSnapshot, '31. findByCandidateType(SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM) returns exactly the one matching entry');
    }
    console.log('✓ Section F: candidateType lookup distinguishes all three closed candidate types exactly, introducing no synthetic fourth category');

    // ---------------------------------------------------------------
    // Section G — architecture: no imports, no forbidden vocabulary, no
    // mutation, determinism, zero network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '32. this file imports nothing at all');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbiddenVocabulary = ['resolved', 'pending', 'stale', 'approved', 'rejected', 'fraud', 'conflict', 'trusted', 'confidence', 'reputation', 'severity', 'authoritative', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'mutate', 'timeline', 'statistics', 'superseded'];
        const codeOnlyLower = codeOnly.toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!codeOnlyLower.includes(word), `33. this file's own code never carries "${word}"`);
        }

        const historyJsonBefore = serialize(history);
        const o1JsonBefore = serialize(O1);
        appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1);
        findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(history, O1.planIdentity.planFingerprint);
        findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(history, D1);
        findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(history, 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        assert(serialize(history) === historyJsonBefore, '34. no operation ever mutates the supplied history');
        assert(serialize(O1) === o1JsonBefore, '35. no operation ever mutates an observation record handed in');

        const firstAppend = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O2);
        const secondAppend = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O2);
        assert(serialize(firstAppend) === serialize(secondAppend), '36. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(firstAppend), '37. the returned history is frozen');

        const originalFetch = globalThis.fetch;
        let networkCallOccurred = false;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        let result;
        try {
            result = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1);
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(networkCallOccurred === false, '38. appending an observation performs zero network access');
        assert(result.length === history.length + 1, '39. sanity — the append itself genuinely occurred');

        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js');
        assert(typeof module.appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry === 'function', '40. appendXxx() is exported');
        assert(typeof module.findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint === 'function', '41. findXxxByPlanFingerprint() is exported');
        assert(typeof module.findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId === 'function', '42. findXxxByDecisionId() is exported');
        assert(typeof module.findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType === 'function', '43. findXxxByCandidateType() is exported');
        assert(module.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory === undefined, '44. no reconstructXxx() is exported');
    }
    console.log('✓ Section G: no imports, no forbidden interpreted-state or action vocabulary, no mutation of history or its entries, deterministic, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
