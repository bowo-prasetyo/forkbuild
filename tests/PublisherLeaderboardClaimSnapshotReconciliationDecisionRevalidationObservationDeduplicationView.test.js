import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js';

// 0.8.164 — Revalidation Observation History Deduplication Projection.
//
// Section A: malformed/empty input tolerance — never a throw
// Section B: FLAGSHIP — O1 = D1/PlanA/true/T1, O2 = D1/PlanA/true/T1
//            (identical repeat of O1), O3 = D1/PlanB/false/T2,
//            O4 = D2/PlanA/true/T3, O5 = D1/PlanA/true/T1 (identical repeat
//            of O1 again) — observationCount 5, distinctObservationCount 3,
//            duplicateObservationCount 2, observations = [O1, O3, O4]
// Section C: the invariant observationCount = distinctObservationCount +
//            duplicateObservationCount holds generally
// Section D: same decision + plan, different observedAt, remain distinct
// Section E: the underlying history is never mutated, shrunk, or reordered
//            by this projection
// Section F: first-appearance ordering is preserved, never re-sorted by
//            any field
// Section G: architecture — no imports, no forbidden vocabulary, no
//            mutation, determinism, zero network access

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function planNaming({ claims = [], snapshots = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze([]),
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
    // Section A — malformed/empty input tolerance.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 42, 'not a history', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(malformed);
            assert(result.observationCount === 0, `1. malformed input (${JSON.stringify(malformed)}) reads observationCount: 0`);
            assert(result.distinctObservationCount === 0, '2. malformed input reads distinctObservationCount: 0');
            assert(result.duplicateObservationCount === 0, '3. malformed input reads duplicateObservationCount: 0');
            assert(Array.isArray(result.observations) && result.observations.length === 0, '4. malformed input reads observations: []');
            assert(Object.isFrozen(result), '5. the result is frozen even for malformed input');
        }

        const empty = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication([]);
        assert(empty.observationCount === 0 && empty.distinctObservationCount === 0 && empty.duplicateObservationCount === 0, '6. an empty history projects to all-zero counts');

        let historyWithGarbage = [];
        for (const malformed of [null, undefined, 42, {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }]) {
            historyWithGarbage = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(historyWithGarbage, malformed);
        }
        assert(historyWithGarbage.length === 0, '7. setup — appendXxx() never actually let any of this garbage into the history');
        const garbageResult = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication([{ observed: false }, { not: 'an observation' }, null]);
        assert(garbageResult.observationCount === 0 && garbageResult.observations.length === 0, '8. non-genuine entries handed directly (bypassing appendXxx) are silently skipped, never counted or included');
    }
    console.log('✓ Section A: malformed and empty input tolerated — every result is frozen, never a throw, non-genuine entries silently skipped');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   D1 = OBSERVE(C1), decided T1        D2 = DEFER(C1), decided T3
    //   PlanA names C1 (+ C2)                PlanB names C2 only (not C1)
    //
    //   O1 = D1 / PlanA / true  / observed OBS_T1
    //   O2 = D1 / PlanA / true  / observed OBS_T1   (byte-identical to O1)
    //   O3 = D1 / PlanB / false / observed OBS_T2
    //   O4 = D2 / PlanA / true  / observed OBS_T3
    //   O5 = D1 / PlanA / true  / observed OBS_T1   (byte-identical to O1)
    // ---------------------------------------------------------------
    let history, O1, O3, O4;
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' };
        const D1 = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(candidate, 'DEFER', T3);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const planB = planNaming({ claims: ['C2'] });

        O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D1, planA, OBS_T1);
        O3 = observe(D1, planB, OBS_T2);
        O4 = observe(D2, planA, OBS_T3);
        const O5 = observe(D1, planA, OBS_T1);

        assert(serialize(O1) === serialize(O2) && serialize(O2) === serialize(O5), '9. FLAGSHIP setup — O1, O2, and O5 are byte-identical observations');

        history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O2);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O3);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O4);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O5);
        assert(history.length === 5, '10. FLAGSHIP setup — the history holds all five entries, undeduplicated');

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);

        assert(result.observationCount === 5, '11. FLAGSHIP — observationCount is 5');
        assert(result.distinctObservationCount === 3, '12. FLAGSHIP — distinctObservationCount is 3 (O1, O3, O4)');
        assert(result.duplicateObservationCount === 2, '13. FLAGSHIP — duplicateObservationCount is 2 (the two extra repeats of O1)');
        assert(result.observations.length === 3, '14. FLAGSHIP — observations holds exactly three entries');
        assert(result.observations[0] === O1 && result.observations[1] === O3 && result.observations[2] === O4, '15. FLAGSHIP — observations = [O1, O3, O4], first occurrence of each, in first-appearance order');
        assert(Object.isFrozen(result) && Object.isFrozen(result.observations), '16. FLAGSHIP — the result and its observations array are both frozen');

        assert(history.length === 5, '17. FLAGSHIP — the underlying history still holds all five entries after the projection ran');
    }
    console.log('✓ Section B: FLAGSHIP — five recorded observations, two of them exact repeats of a third, project to observationCount 5 / distinctObservationCount 3 / duplicateObservationCount 2 / observations = [O1, O3, O4]');

    // ---------------------------------------------------------------
    // Section C — the invariant holds generally, across several sizes.
    // ---------------------------------------------------------------
    {
        for (const size of [0, 1, 5]) {
            const slice = history.slice(0, size);
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(slice);
            assert(result.observationCount === result.distinctObservationCount + result.duplicateObservationCount, `18. invariant holds for a history of length ${size}`);
        }
    }
    console.log('✓ Section C: observationCount = distinctObservationCount + duplicateObservationCount holds at every history length exercised');

    // ---------------------------------------------------------------
    // Section D — same decision + plan, different observedAt, remain
    // distinct (never collapsed by decision/plan identity alone).
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 7 };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T2);
        const plan = planNaming({ snapshots: [7] });

        const first = observe(decision, plan, OBS_T1);
        const second = observe(decision, plan, OBS_T2);
        assert(first.observedAt !== second.observedAt, '19. setup — the two observations genuinely differ only in observedAt');

        let localHistory = [];
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, first);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, second);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(localHistory);
        assert(result.observationCount === 2 && result.distinctObservationCount === 2 && result.duplicateObservationCount === 0, '20. two observations differing only in observedAt remain two distinct observations, never collapsed by decision+plan identity alone');
        assert(result.observations[0] === first && result.observations[1] === second, '21. both remain present, in order');
    }
    console.log('✓ Section D: identical decision and plan, differing only in observedAt, are never collapsed into one observation');

    // ---------------------------------------------------------------
    // Section E — the underlying history is never mutated, shrunk, or
    // reordered by this projection.
    // ---------------------------------------------------------------
    {
        const historyJsonBefore = serialize(history);
        describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        assert(serialize(history) === historyJsonBefore, '22. calling the projection twice never mutates the supplied history');
        assert(history.length === 5, '23. the supplied history still holds all five original entries after repeated projection calls');
    }
    console.log('✓ Section E: the underlying history is a read-only input — never mutated, shrunk, or reordered by this projection');

    // ---------------------------------------------------------------
    // Section F — first-appearance ordering is preserved, never re-sorted.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Z' };
        const decisionLater = genuineDecisionRecord(candidate, 'OBSERVE', T3);
        const plan = planNaming({ claims: ['Z'] });

        // Deliberately observe the LATER-observedAt one first, so a
        // sort-by-observedAt would reorder this — first-appearance
        // ordering must not.
        const laterObserved = observe(decisionLater, plan, OBS_T3);
        const earlierObserved = observe(decisionLater, plan, OBS_T1);

        let localHistory = [];
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, laterObserved);
        localHistory = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(localHistory, earlierObserved);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(localHistory);
        assert(result.observations[0] === laterObserved && result.observations[1] === earlierObserved, '24. observations preserve first-appearance order from the history, never re-sorted by observedAt');
    }
    console.log('✓ Section F: observations are first-appearance ordered, never re-sorted by observedAt or any other field');

    // ---------------------------------------------------------------
    // Section G — architecture: exactly one import (the 0.8.167 archive
    // reconstruction seam), no forbidden vocabulary, no mutation,
    // determinism, zero network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        // 0.8.167 — this file now imports exactly ONE module: the archive
        // reconstruction seam (application/
        // PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js),
        // used only by reconstructXxx() below. It still imports nothing from
        // 0.8.162/0.8.163 themselves, or any decision/plan module.
        assert(importLines.length === 1, '25. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js'), '25b. the one import is the 0.8.167 archive reconstruction seam, never 0.8.162/0.8.163 themselves');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        // "valid"/"invalid" are deliberately excluded from this list: this
        // file's own name and every function inside it carry
        // "Revalidation," which itself contains the substring "valid" —
        // exactly the same reason 0.8.163's own architecture test already
        // excludes it.
        const forbiddenVocabulary = ['latest', 'current', 'correct', 'stale', 'resolved', 'superseded', 'preferred', 'timeline', 'statistics'];
        const codeOnlyLower = codeOnly.toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!codeOnlyLower.includes(word), `26. this file's own code never carries "${word}"`);
        }

        const historyJsonBefore = serialize(history);
        const o1JsonBefore = serialize(O1);
        assert(o1JsonBefore === serialize(O1), '27. sanity — O1 unchanged before mutation probe');
        describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        assert(serialize(history) === historyJsonBefore, '28. no operation mutates the supplied history');
        assert(serialize(O1) === o1JsonBefore, '29. no operation mutates an observation record inside the history');

        const firstCall = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        const secondCall = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        assert(serialize(firstCall) === serialize(secondCall), '30. repeated calls with an equivalent history are byte-identical');

        const originalFetch = globalThis.fetch;
        let networkCallOccurred = false;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        try {
            describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(networkCallOccurred === false, '31. this projection performs zero network access');

        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js');
        assert(typeof module.describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication === 'function', '32. describeXxx() is exported');
        // 0.8.167 — reconstructXxx() now exists, reading the archive's own
        // durable revalidationObservationRecords collection.
        assert(typeof module.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication === 'function', '33. reconstructXxx() is now exported (0.8.167)');
    }
    console.log('✓ Section G: exactly one import (the 0.8.167 archive reconstruction seam), no forbidden interpreted-state vocabulary, no mutation of the history or its entries, deterministic, zero network access');

    // ---------------------------------------------------------------
    // Section H — 0.8.167: reconstructXxx() reads the archive's own
    // durable revalidationObservationRecords collection and agrees exactly
    // with the pure in-memory computation over the identical history.
    // ---------------------------------------------------------------
    {
        const { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication } = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js');
        const { PublicationObservationArchive } = await import('../application/PublicationObservationArchive.js');

        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(PublicationObservationArchive.empty());
        assert(emptyReconstructed.observationCount === 0 && emptyReconstructed.distinctObservationCount === 0 && emptyReconstructed.observations.length === 0, '34. reconstruct() over a genuine, empty archive returns the all-zero result');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(null);
        assert(serialize(invalidReconstructed) === serialize(emptyReconstructed), '35. reconstruct() over an invalid/missing archive also returns the all-zero result, never a throw');

        const hCandidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'H1' };
        const hDecision = genuineDecisionRecord(hCandidate, 'OBSERVE', T1);
        const hPlan = planNaming({ claims: ['H1'] });
        const hO1 = observe(hDecision, hPlan, OBS_T1);
        const hO2 = observe(hDecision, hPlan, OBS_T1); // byte-identical to hO1 — a genuine duplicate
        const hO3 = observe(hDecision, hPlan, OBS_T3); // same decision/plan, different observedAt — distinct

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(hO1);
        archive = archive.appendRevalidationObservationRecord(hO2);
        archive = archive.appendRevalidationObservationRecord(hO3);

        const pure = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication([hO1, hO2, hO3]);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(archive);
        assert(serialize(pure) === serialize(reconstructed), '36. reconstruct(archive) agrees byte-for-byte with describe() over the identical raw history');
        assert(reconstructed.observationCount === 3 && reconstructed.distinctObservationCount === 2, '37. the reconstructed projection reflects the archive\'s own preserved multiplicity');

        // An archive holding OTHER collections (e.g. reconciliation decision
        // records) but no revalidation observation records still
        // reconstructs to the all-zero result — the two collections are
        // independent.
        const decision = Object.freeze({ decided: true, candidate: Object.freeze({ selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'UNRELATED' }), decision: 'OBSERVE', decidedAt: new Date('2026-08-30T00:00:00Z').toISOString() });
        const unrelatedArchive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(decision);
        const unrelatedReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(unrelatedArchive);
        assert(serialize(unrelatedReconstructed) === serialize(emptyReconstructed), '38. an archive holding only unrelated collections still reconstructs to the all-zero result');
    }
    console.log('✓ Section H: reconstructXxx() reads the archive\'s own durable revalidationObservationRecords collection and agrees exactly with the pure in-memory computation');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.test.js FAILED:', error);
    process.exitCode = 1;
});
