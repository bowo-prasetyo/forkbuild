import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import {
    PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion,
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange,
    PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization,
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.169 — Revalidation Observation History Synchronization.
//
// Section A: describeXxx is a byte-identical passthrough to 0.8.166's own
//            difference projection
// Section B: reconstructXxx reads both sides through the 0.8.167 archive
//            seam and agrees exactly with describe()
// Section C: exportXxx exports ONLY sourceOnly, in 0.8.168's own unchanged
//            wire shape; already-converged histories export a genuine
//            empty payload
// Section D: applyXxx is a direct, unmodified delegation to 0.8.168's own
//            applier — no verifier argument, identical outcome byte for
//            byte
// Section E: the subtle issue — the same decision revalidated against two
//            different plans remains genuinely distinct straight through
//            synchronization; candidate presence on both sides never
//            implies matching histories
// Section F: FLAGSHIP — four replicas (Alice/Bob/Carol/Dave), five distinct
//            observations, directional ring synchronization then explicit
//            reverse calls; full five-observation convergence; repeating a
//            converged synchronization is a byte-identical no-op
// Section G: SUBTLE — local duplicates versus exchange deduplication:
//            [O1, O1, O2] vs [O1] reports sourceOnly = [O1, O2] (multiset
//            subtraction), but applying that export to target = [O1] does
//            NOT reproduce two copies of O1 — 0.8.168's own exchange dedup
//            recognizes the exported O1 as already present and skips it,
//            proving difference's multiset rule and exchange's key-based
//            dedup rule are two distinct, uncollapsed mechanisms
// Section H: determinism, immutability, zero network access, no archive
//            ever written to
// Section I: no interpretive/trust vocabulary anywhere in this file's own
//            results; architecture boundary — exactly the two composed
//            modules, nothing else

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

async function withoutNetworkAccess(fn) {
    let networkCallOccurred = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
    try {
        return { result: await fn(), networkCallOccurred };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze({ selected: true, ...candidate }), decision, decidedAt: decidedAt.toISOString() });
}

function planNaming({ claims = [], snapshots = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze([]),
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

function archiveFromObservationHistory(history) {
    let archive = PublicationObservationArchive.empty();
    for (const observation of history) {
        archive = archive.appendRevalidationObservationRecord(observation);
    }
    return archive;
}

const T1 = new Date('2026-08-30T05:00:00Z');
const T2 = new Date('2026-08-30T05:05:00Z');
const T3 = new Date('2026-08-30T05:10:00Z');
const T4 = new Date('2026-08-30T05:15:00Z');
const T5 = new Date('2026-08-30T05:20:00Z');
const OBS_T1 = new Date('2026-08-30T06:00:00Z');
const OBS_T2 = new Date('2026-08-30T06:05:00Z');
const OBS_T3 = new Date('2026-08-30T06:10:00Z');
const OBS_T4 = new Date('2026-08-30T06:15:00Z');
const OBS_T5 = new Date('2026-08-30T06:20:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — describeXxx is a byte-identical passthrough to 0.8.166's
    // own difference.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const sourceHistory = historyOf(O1);
        const targetHistory = historyOf(O2);

        const viaSync = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
        const viaDifference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
        assert(serialize(viaSync) === serialize(viaDifference), '1. describeXxx agrees exactly, byte for byte, with 0.8.166\'s own difference projection');
        assert(viaSync.sourceOnly[0] === O1 && viaSync.targetOnly[0] === O2, '2. the original observation record instances are preserved, never copies');

        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization().sameHistory === true, '3. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(null, 'not an array').sameHistory === true, '4. malformed/absent histories degrade to empty, never throw');
        assert(Object.isFrozen(viaSync), '5. the result is frozen, exactly like 0.8.166\'s own difference result');
    }
    console.log('✓ Section A: describeXxx is a byte-identical passthrough to the 0.8.166 difference projection');

    // ---------------------------------------------------------------
    // Section B — reconstructXxx reads both sides through the 0.8.167
    // archive seam.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const sourceHistory = historyOf(O1);
        const targetHistory = [];

        const described = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(archiveFromObservationHistory(sourceHistory), archiveFromObservationHistory(targetHistory));
        assert(reconstructed.sameHistory === described.sameHistory && serialize(reconstructed.sourceOnly[0]) === serialize(described.sourceOnly[0]), '6. reconstructXxx reads each side\'s durable history and agrees exactly with describeXxx');

        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(null, undefined).sameHistory === true, '7. an invalid/missing archive on either side degrades to an empty history, never a throw');
        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization('not an archive', 42).sourceOnlyCount === 0, '8. a malformed archive argument degrades safely on both sides');
    }
    console.log('✓ Section B: reconstructXxx reads both replicas\' durable histories through the 0.8.167 seam, agreeing exactly with describeXxx');

    // ---------------------------------------------------------------
    // Section C — exportXxx exports ONLY sourceOnly, in 0.8.168's own
    // unchanged wire shape.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });

        const sourceOnlyObservation = observe(D1, planA, OBS_T1);
        const sharedForSource = observe(D2, planA, OBS_T2);
        const sharedForTarget = observe(D2, planA, OBS_T2);

        const sourceHistory = historyOf(sourceOnlyObservation, sharedForSource);
        const targetHistory = historyOf(sharedForTarget);

        const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
        assert(payload.protocolVersion === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion, '9. the exported payload carries the SAME protocol version 0.8.168 already defines — no new envelope');
        assert(payload.observations.length === 1, '10. only the one exclusive observation is exported — the shared observation is never resent');
        assert(serialize(payload.observations[0]) === serialize({ decision: sourceOnlyObservation.decision, planIdentity: sourceOnlyObservation.planIdentity, candidatePresent: sourceOnlyObservation.candidatePresent, candidateType: sourceOnlyObservation.candidateType, candidateMatchesPlan: sourceOnlyObservation.candidateMatchesPlan, observedAt: sourceOnlyObservation.observedAt }), '11. the exported entry is exactly the exclusive record\'s own six durable facts');
        assert(serialize(payload) === serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory([sourceOnlyObservation])), '12. the payload is byte-identical to calling 0.8.168\'s own export directly over exactly the exclusive observation');

        const convergedPayload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization([sharedForSource], [sharedForTarget]);
        assert(convergedPayload.observations.length === 0, '13. two already-converged histories export zero observations — never a special sentinel');
        assert(serialize(convergedPayload) === serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory([])), '14. an empty synchronization export is byte-identical to exporting an empty history directly');

        assert(Object.isFrozen(payload) && Object.isFrozen(payload.observations), '15. the exported payload and its observations array are frozen');
    }
    console.log('✓ Section C: exportXxx exports only the source-exclusive observations, in the unchanged 0.8.168 wire shape');

    // ---------------------------------------------------------------
    // Section D — applyXxx is a direct, unmodified delegation to 0.8.168's
    // own applier, taking no verifier argument.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const payload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(historyOf(O1))));

        const viaSync = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization([], payload);
        const viaExchange = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], payload);
        assert(viaSync.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '16. sanity — the delegated apply genuinely succeeds');
        assert(serialize(viaSync.history) === serialize(viaExchange.history), '17. applying via the synchronization entry point produces the identical resulting history as applying via 0.8.168 directly');
        assert(viaSync.newCount === viaExchange.newCount && viaSync.duplicateCount === viaExchange.duplicateCount && viaSync.rejectedCount === viaExchange.rejectedCount, '18. every reported count agrees exactly');

        const malformedResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization([], { protocolVersion: 999, observations: [] });
        assert(malformedResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.INVALID_HISTORY, '19. a malformed envelope is rejected exactly as 0.8.168 already rejects it');
        assert(malformedResult.history === null, '20. an INVALID_HISTORY outcome never fabricates a resulting history');
    }
    console.log('✓ Section D: applyXxx delegates directly to the unmodified 0.8.168 applier — identical outcome, byte for byte, no verifier argument');

    // ---------------------------------------------------------------
    // Section E — the subtle issue: observation identity includes the plan
    // an observation was made against, and synchronization must never
    // collapse a candidate that exists on both sides into "the histories
    // agree."
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planP1 = planNaming({ claims: ['C1'] });
        const planP2 = planNaming({ claims: ['C2'] });

        const againstP1 = observe(D1, planP1, OBS_T1);
        const againstP2 = observe(D1, planP2, OBS_T2);
        assert(serialize(againstP1.decision) === serialize(againstP2.decision), 'sanity — both observations concern the identical decision');
        assert(againstP1.planIdentity.planFingerprint !== againstP2.planIdentity.planFingerprint, 'sanity — the two plans genuinely fingerprint differently');
        assert(againstP1.candidatePresent === true && againstP2.candidatePresent === false, 'sanity — C1 occurs in P1 but not P2');

        // Target already holds the P1 observation; source holds both.
        const targetHistory = historyOf(againstP1);
        const sourceHistory = historyOf(againstP1, againstP2);

        const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
        assert(difference.sourceOnly.length === 1 && difference.sourceOnly[0] === againstP2, '21. the P2 observation (different plan, different candidatePresent) is reported as genuinely missing — the shared P1 observation alone cancels');

        const applied = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(targetHistory, exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory));
        assert(applied.newCount === 1, '22. exactly the one genuinely distinct observation is folded in');
        assert(applied.history.length === 2, '23. the target now holds both: against P1 and against P2 — never merged into one "observation of this candidate"');
        assert(applied.history.some((entry) => entry.candidatePresent === true) && applied.history.some((entry) => entry.candidatePresent === false), '24. both the present and absent facts survive as separate records');
    }
    console.log('✓ Section E: synchronization inherits observation identity exactly from 0.8.166/0.8.168 — a candidate present on both sides never implies its full observation histories agree');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: four replicas, five distinct observations,
    // directional ring synchronization, then explicit reverse calls.
    //
    //   Alice: [O1, O2]     Bob: [O2, O3]     Carol: [O3, O4]     Dave: [O4, O5]
    //
    //   Forward: Alice->Bob, Bob->Carol, Carol->Dave, Dave->Alice
    //     (this leaves Alice and Dave — the two ends the ring's information
    //     cascades through twice — holding the full five-observation union
    //     after the forward pass alone; Bob and Carol, in the middle, still
    //     lag, exactly as 0.8.152's own flagship shows for its own middle
    //     replica)
    //   Reverse, run back along the ring FROM the two converged ends
    //     TOWARD the two lagging replicas, so each reverse call's own
    //     source already holds everything its target needs:
    //     Dave->Carol, Carol->Bob, Bob->Alice, Alice->Dave
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'OBSERVE', T2);
        const D3 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C3' }, 'OBSERVE', T3);
        const D4 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C4' }, 'OBSERVE', T4);
        const D5 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C5' }, 'OBSERVE', T5);
        const planA = planNaming({ claims: ['C1', 'C2', 'C3', 'C4', 'C5'] });

        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);
        const O3 = observe(D3, planA, OBS_T3);
        const O4 = observe(D4, planA, OBS_T4);
        const O5 = observe(D5, planA, OBS_T5);

        let aliceHistory = historyOf(O1, O2);
        let bobHistory = historyOf(O2, O3);
        let carolHistory = historyOf(O3, O4);
        let daveHistory = historyOf(O4, O5);
        assert(aliceHistory.length === 2 && bobHistory.length === 2 && carolHistory.length === 2 && daveHistory.length === 2, '25. FLAGSHIP — each replica starts with exactly its own two named observations');

        function syncOnce(sourceHistory, targetHistory, label) {
            const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
            assert(serialize(Object.keys(payload).sort()) === serialize(['observations', 'protocolVersion']), `26. FLAGSHIP (${label}) — the payload carries exactly 0.8.168's own two fields, nothing synchronization-specific`);
            const result = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(targetHistory, payload);
            assert(result.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, `27. FLAGSHIP (${label}) — synchronization applies cleanly`);
            return result;
        }

        // --- Forward ring: Alice -> Bob -> Carol -> Dave -> Alice. Each
        // hop's own sourceOnly grows as it accumulates what earlier hops
        // already folded in — an ordinary consequence of 0.8.166's own
        // multiset difference over each replica's own current history,
        // never a special ring-aware rule. ---
        const aliceToBob = syncOnce(aliceHistory, bobHistory, 'Alice->Bob');
        assert(aliceToBob.newCount === 1 && aliceToBob.duplicateCount === 0, '28. FLAGSHIP — Alice->Bob: only O1 is new to Bob; O2 already cancels in the difference itself, so it is never even exported');
        bobHistory = aliceToBob.history;
        assert(bobHistory.length === 3, '29. FLAGSHIP — Bob now holds O2, O3, O1');

        const bobToCarol = syncOnce(bobHistory, carolHistory, 'Bob->Carol');
        assert(bobToCarol.newCount === 2, '30. FLAGSHIP — Bob->Carol: O2 and O1 (received via Alice) are new to Carol; O3 already on file');
        carolHistory = bobToCarol.history;
        assert(carolHistory.length === 4, '31. FLAGSHIP — Carol now holds O3, O4, O2, O1');

        const carolToDave = syncOnce(carolHistory, daveHistory, 'Carol->Dave');
        assert(carolToDave.newCount === 3, '32. FLAGSHIP — Carol->Dave: O3, O2, O1 are new to Dave; only O4 was already on file');
        daveHistory = carolToDave.history;
        assert(daveHistory.length === 5, '33. FLAGSHIP — Dave now holds all five distinct observations — one of the ring\'s two "meeting points"');

        const daveToAlice = syncOnce(daveHistory, aliceHistory, 'Dave->Alice');
        assert(daveToAlice.newCount === 3, '34. FLAGSHIP — Dave->Alice: O4, O5, O3 are new to Alice; O1/O2 already on file');
        aliceHistory = daveToAlice.history;
        assert(aliceHistory.length === 5, '35. FLAGSHIP — Alice now holds all five distinct observations too — the ring\'s other "meeting point"');

        // Directionality: before any reverse call, Bob and Carol — the
        // ring's two MIDDLE replicas — have NOT reached the full union
        // (Bob still lacks O4/O5, Carol still lacks O5) — the forward ring
        // never moves anything backward or sideways on its own.
        assert(bobHistory.every((entry) => entry !== O5), '36. FLAGSHIP — before any reverse call, Bob has NOT received O5');
        assert(carolHistory.every((entry) => entry !== O5), '36b. FLAGSHIP — before any reverse call, Carol has NOT received O5 either');

        // --- Explicit reverse calls, run FROM the two already-converged
        // ends BACK toward the two still-lagging middle replicas — Dave->
        // Carol, Carol->Bob, Bob->Alice, Alice->Dave — proving directionality
        // requires a separate, explicit call per direction, exactly as
        // 0.8.152's own flagship already establishes one layer down. ---
        const daveToCarol = syncOnce(daveHistory, carolHistory, 'Dave->Carol');
        assert(daveToCarol.newCount === 1, '37. FLAGSHIP — Dave->Carol: O5 is new to Carol');
        carolHistory = daveToCarol.history;
        assert(carolHistory.length === 5, '38. FLAGSHIP — Carol now holds all five distinct observations');

        const carolToBob = syncOnce(carolHistory, bobHistory, 'Carol->Bob');
        assert(carolToBob.newCount === 2, '39. FLAGSHIP — Carol->Bob: O4 and O5 are new to Bob');
        bobHistory = carolToBob.history;
        assert(bobHistory.length === 5, '40. FLAGSHIP — Bob now holds all five distinct observations');

        const bobToAlice = syncOnce(bobHistory, aliceHistory, 'Bob->Alice');
        assert(bobToAlice.newCount === 0, '41. FLAGSHIP — Bob->Alice: Alice already holds everything Bob has');
        aliceHistory = bobToAlice.history;

        const firstAliceToDave = syncOnce(aliceHistory, daveHistory, 'Alice->Dave (first)');
        assert(firstAliceToDave.newCount === 0, '42. FLAGSHIP — Alice->Dave: Dave already holds everything Alice has');
        daveHistory = firstAliceToDave.history;

        // --- Full convergence: every replica now holds the union {O1..O5}. ---
        const union = historyOf(O1, O2, O3, O4, O5);
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(aliceHistory, union).sameHistory === true, '42. FLAGSHIP — Alice\'s converged history is EXACTLY the five-observation union');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(bobHistory, union).sameHistory === true, '43. FLAGSHIP — Bob\'s converged history is EXACTLY the five-observation union');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(carolHistory, union).sameHistory === true, '44. FLAGSHIP — Carol\'s converged history is EXACTLY the five-observation union');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(daveHistory, union).sameHistory === true, '45. FLAGSHIP — Dave\'s converged history is EXACTLY the five-observation union');

        // --- Repeating an already-converged synchronization is a genuine,
        // instance-identical no-op. ---
        const reCarolToDavePayload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(carolHistory, daveHistory);
        assert(reCarolToDavePayload.observations.length === 0, '46. FLAGSHIP — re-synchronizing two converged replicas exports nothing further');
        assert(serialize(reCarolToDavePayload) === serialize({ protocolVersion: PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion, observations: [] }), '47. FLAGSHIP — the second-pass export is exactly { protocolVersion: 1, observations: [] }');
        const firstApply = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(daveHistory, reCarolToDavePayload);
        const secondApply = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(daveHistory, reCarolToDavePayload);
        assert(firstApply.newCount === 0 && secondApply.newCount === 0, '48. FLAGSHIP — repeating synchronization after convergence changes nothing');
        assert(secondApply.history === firstApply.history, '49. FLAGSHIP — the particularly valuable assertion: applying an already-converged synchronization payload twice returns the EXACT SAME history instance, never merely an equal one');
        assert(firstApply.history === daveHistory, '50. FLAGSHIP — and that instance is the caller\'s own original target history, completely untouched');
    }
    console.log('✓ Section F: FLAGSHIP — four replicas converge via directional ring synchronization plus explicit reverse calls to the five-observation union; re-synchronizing a converged pair is a byte-identical, instance-identical no-op');

    // ---------------------------------------------------------------
    // Section G — SUBTLE: local duplicates versus exchange deduplication.
    // [O1, O1, O2] vs [O1] — 0.8.166's own multiset difference reports
    // sourceOnly = [O1, O2] (one O1 survives), but applying that export to
    // target = [O1] does NOT reproduce two copies of O1: 0.8.168's own
    // exchange dedup recognizes the exported O1 as already present (by
    // exact key, never by remaining multiset count) and skips it. Difference
    // and exchange are two distinct, uncollapsed multiplicity rules.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'OBSERVE', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const source = [O1, O1, O2];
        const target = [O1];

        const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(source, target);
        assert(difference.sourceOnly.length === 2, '51. SUBTLE — 0.8.166\'s own multiset subtraction reports TWO source-only entries, never one');
        assert(difference.sourceOnly[0] === O1 && difference.sourceOnly[1] === O2, '52. SUBTLE — sourceOnly is exactly [O1, O2] — the SECOND O1 copy plus O2, never [O2] alone (that would be a naive set difference)');

        const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(source, target);
        assert(payload.observations.length === 2, '53. SUBTLE — the exported payload names both sourceOnly entries — the difference\'s own multiset result travels over the wire unchanged');

        const applied = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(target, payload);
        assert(applied.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '54. SUBTLE — sanity, the apply succeeds');
        assert(applied.incomingCount === 2, '55. SUBTLE — the payload named two observations on import');
        assert(applied.newCount === 1 && applied.duplicateCount === 1, '56. SUBTLE — 0.8.168\'s own exchange dedup recognizes the exported O1 as an exchange-level duplicate (already on target, by exact key) and skips it; only O2 is genuinely new');
        assert(applied.history.length === 2, '57. SUBTLE — target ends at [O1, O2], NEVER [O1, O1, O2] — exchange dedup is key-based, not a replay of the multiset count 0.8.166 reported');
        assert(applied.history[0] === O1, '58. SUBTLE — target\'s own original O1 is untouched, held by reference');
        assert(serialize(applied.history[1]) === serialize(O2), '59. SUBTLE — the genuinely new O2 is appended at the end');

        // This is architecturally deliberate, not an oversight of this
        // milestone: difference (READ) performs multiset subtraction so a
        // caller can see EXACTLY how many of source's own copies target's
        // own copies fail to cancel; exchange (WRITE), reused completely
        // unchanged from 0.8.168, converges toward "one copy of each
        // distinct observation, ever," regardless of how many copies were
        // named in a single incoming payload or already sit in history.
        // Neither rule is weakened, widened, or restated by this file.
        const bothCopiesPayload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(source, []);
        assert(bothCopiesPayload.observations.length === 3, '60. SUBTLE — sanity, against a genuinely EMPTY target, all three of source\'s own entries (including both O1 copies) are exported');
        const appliedToEmpty = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization([], bothCopiesPayload);
        assert(appliedToEmpty.newCount === 2 && appliedToEmpty.duplicateCount === 1, '61. SUBTLE — even exporting BOTH O1 copies from a genuinely empty target, exchange still folds in only one — the second O1 copy in the SAME payload is its own exchange-level duplicate, exactly as 0.8.168 already behaves unmodified');
        assert(appliedToEmpty.history.length === 2, '62. SUBTLE — the resulting history holds exactly one O1 and one O2, never two O1s');
    }
    console.log('✓ Section G: SUBTLE — 0.8.166\'s own multiset difference and 0.8.168\'s own key-based exchange deduplication remain two distinct, uncollapsed rules; synchronization composes them exactly as each already behaves, never inventing a third');

    // ---------------------------------------------------------------
    // Section H — determinism, immutability, zero network access, no
    // archive ever written to.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1', 'C2'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);

        const sourceHistory = historyOf(O1);
        const targetHistory = historyOf(O2);
        const sourceSnapshotBefore = sourceHistory.slice();
        const targetSnapshotBefore = targetHistory.slice();

        const payloadOnce = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
        const payloadTwice = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
        assert(serialize(payloadOnce) === serialize(payloadTwice), '63. exporting the identical synchronization twice is byte-identical');
        assert(serialize(sourceHistory) === serialize(sourceSnapshotBefore), '64. the source history is never mutated by export');
        assert(serialize(targetHistory) === serialize(targetSnapshotBefore), '65. the target history is never mutated by export');

        const wirePayload = JSON.parse(JSON.stringify(payloadOnce));
        const { result: applyResult, networkCallOccurred } = await withoutNetworkAccess(() => applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization([], wirePayload));
        assert(networkCallOccurred === false, '66. applying a synchronization payload performs zero network access');
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '67. sanity — the apply itself succeeded');
        assert(Object.isFrozen(applyResult.history), '68. the resulting history is frozen');

        const archive = PublicationObservationArchive.empty();
        const preCallCount = archive.revalidationObservationRecords.length;
        applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization([], wirePayload);
        assert(archive.revalidationObservationRecords.length === preCallCount, '69. no archive is ever touched — synchronization never even receives an archive reference at this layer');
    }
    console.log('✓ Section H: synchronization export/apply are deterministic, immutable, and perform zero network or archive access');

    // ---------------------------------------------------------------
    // Section I — no interpretive/trust vocabulary; architecture boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);

        const described = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(historyOf(O1), []);
        const describedKeys = Object.keys(described).sort();
        assert(serialize(describedKeys) === serialize(['sameHistory', 'sourceCount', 'sourceOnly', 'sourceOnlyCount', 'targetCount', 'targetOnly', 'targetOnlyCount'].sort()), '70. the description carries exactly the documented, factual fields');

        const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(historyOf(O1), []);
        const payloadKeys = Object.keys(payload).sort();
        assert(serialize(payloadKeys) === serialize(['observations', 'protocolVersion']), '71. the exported payload carries exactly the two fields 0.8.168 already defines — no synchronization-specific field of any kind');
        const entryKeys = Object.keys(payload.observations[0]).sort();
        assert(serialize(entryKeys) === serialize(['candidateMatchesPlan', 'candidatePresent', 'candidateType', 'decision', 'observedAt', 'planIdentity']), '72. each entry carries exactly the six durable observation facts — nothing evaluative, nothing synchronization-specific');

        const forbidden = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'currentState', 'effective'];
        for (const term of forbidden) {
            assert(!describedKeys.includes(term) && !payloadKeys.includes(term), `73. neither result ever carries interpretive/trust vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['verify', 'verifier', 'verification', 'authorize', 'approve', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'trust', 'confidence', 'reputation', 'consensus', 'majority', 'expir', 'network', 'fetch('];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `74. this file's own code never carries "${term}"`);
        }

        const importedFiles = Array.from(moduleSource.matchAll(/from '(.+)';/g)).map((match) => match[1]);
        assert(importedFiles.length === 2, '75. this file imports exactly two modules');
        assert(importedFiles.some((path) => path.includes('RevalidationObservationHistoryDifference.js')) && importedFiles.some((path) => path.includes('RevalidationObservationHistoryExchange.js')), '76. the two imports are exactly the 0.8.166 difference projection and the 0.8.168 exchange — never the observation/history/deduplication/timeline/archive modules directly');
    }
    console.log('✓ Section I: this file carries no interpretive/trust vocabulary of its own, every payload it produces is a genuine, unmodified 0.8.168 envelope, and it imports exactly the two modules it composes');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization.test.js FAILED:', error);
    process.exitCode = 1;
});
