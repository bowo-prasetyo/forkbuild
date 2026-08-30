import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import {
    PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion,
    PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome,
    PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome,
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory,
    importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange.js';

// 0.8.168 — Portable Revalidation Observation History Exchange.
//
// Section A: exportXxx — shape, ordering, tolerance for malformed/absent
//            input, exact six-field (decision/planIdentity/candidatePresent/
//            candidateType/candidateMatchesPlan/observedAt) entries
// Section B: importXxx — envelope validation (whole-payload
//            INVALID_HISTORY), empty history, no verifier required
// Section C: export -> import round-trips every field exactly, reconstructing
//            `observed: true`
// Section D: FLAGSHIP — three replicas (Alice/Bob/Carol) from the
//            milestone's own worked example; directional exchange
//            Alice->Bob->Carol->Alice; only genuinely new observations are
//            ever appended, local duplicates survive, distinct plan
//            fingerprints and observedAt values are preserved
// Section E: PARTICULARLY VALUABLE — same decision+plan differing only in
//            candidateMatchesPlan, and same decision+plan differing only in
//            observedAt, must never cancel; complete six-field structural
//            identity governs deduplication
// Section F: decision/planIdentity/candidateType/etc structural validation
//            — each malformed shape is rejected, never re-derived
// Section G: malformed entries are skipped individually, never fatal to an
//            otherwise genuine payload
// Section H: determinism, immutability, zero network access, frozen results
// Section I: no verify/authorize/approve/re-evaluate vocabulary anywhere;
//            architecture boundary — exactly one import

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
    return Object.freeze({
        decided: true,
        candidate: Object.freeze({ selected: true, ...candidate }),
        decision,
        decidedAt: decidedAt.toISOString()
    });
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

function wireObservationPayload(observationHistory) {
    return JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(observationHistory)));
}

// A hand-constructed, fully valid observation ENTRY (the six-field wire
// shape, no `observed` marker) — used to exercise field-by-field identity
// and validation directly, independent of what `observe()` itself could
// produce for any single decision/plan pair (0.8.162's own `observe()` is
// deterministic — it cannot itself produce two entries sharing a decision
// AND a plan but disagreeing on `candidateMatchesPlan`; this file's own
// import/exchange logic must still treat such a pair as genuinely distinct
// if it were ever received, exactly as 0.8.166's own difference projection
// already does).
function baseObservationEntry(overrides = {}) {
    return {
        decision: { decided: true, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: T1.toISOString() },
        planIdentity: { algorithm: 'SHA-256', planFingerprint: 'a'.repeat(64), candidateCount: 1 },
        candidatePresent: true,
        candidateType: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT',
        candidateMatchesPlan: true,
        observedAt: OBS_T1.toISOString(),
        ...overrides
    };
}

const T1 = new Date('2026-08-30T05:00:00Z');
const T2 = new Date('2026-08-30T05:05:00Z');
const OBS_T1 = new Date('2026-08-30T06:00:00Z');
const OBS_T2 = new Date('2026-08-30T06:05:00Z');
const OBS_T3 = new Date('2026-08-30T06:10:00Z');
const OBS_T4 = new Date('2026-08-30T06:15:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.
    // ---------------------------------------------------------------
    {
        const emptyExport = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory([]);
        assert(emptyExport.protocolVersion === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion, '1. an empty history still carries the protocol version');
        assert(Array.isArray(emptyExport.observations) && emptyExport.observations.length === 0, '2. an empty history exports to an empty observations array');
        assert(Object.isFrozen(emptyExport), '3. the export payload is frozen');

        assert(serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(null)) === serialize(emptyExport), '4. a null history degrades to empty, never a throw');
        assert(serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory('not an array')) === serialize(emptyExport), '5. a malformed history degrades to empty, never a throw');
        assert(serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory([null, 42, {}, { observed: false, outcome: 'INVALID_OBSERVATION' }])) === serialize(emptyExport), '6. non-genuine entries are silently excluded');

        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);
        const history = historyOf(O1, O2);

        const exported = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(history);
        assert(exported.observations.length === 2, '7. every genuine observation is exported');
        assert(serialize(exported.observations[0]) === serialize({ decision: O1.decision, planIdentity: O1.planIdentity, candidatePresent: O1.candidatePresent, candidateType: O1.candidateType, candidateMatchesPlan: O1.candidateMatchesPlan, observedAt: O1.observedAt }), '8. each exported entry carries EXACTLY the six durable observation facts — never a new shape');
        assert(serialize(exported.observations[1]) === serialize({ decision: O2.decision, planIdentity: O2.planIdentity, candidatePresent: O2.candidatePresent, candidateType: O2.candidateType, candidateMatchesPlan: O2.candidateMatchesPlan, observedAt: O2.observedAt }), '9. entry order matches history order, oldest first');
        assert(Object.keys(exported.observations[0]).sort().join(',') === 'candidateMatchesPlan,candidatePresent,candidateType,decision,observedAt,planIdentity', '10. each entry carries exactly the six fields — never `observed`, never any interpreted field');
    }
    console.log('✓ Section A: exportXxx carries every genuine observation\'s own six durable facts unchanged, in order, tolerating malformed/absent input');

    // ---------------------------------------------------------------
    // Section B — importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 42, 'not json at all {{{', [], { protocolVersion: 2, observations: [] }, { protocolVersion: 1, observations: 'not an array' }, { protocolVersion: 1, observations: [], extra: true }, { observations: [] }]) {
            const result = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(malformed);
            assert(result.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.INVALID_HISTORY, `11. malformed envelope (${JSON.stringify(malformed)}) never throws — yields INVALID_HISTORY`);
            assert(result.observations === null, '12. INVALID_HISTORY never produces observations');
        }

        const emptyResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory({ protocolVersion: 1, observations: [] });
        assert(emptyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED, '13. an empty observations array is a genuine, well-formed IMPORTED result');
        assert(emptyResult.observations.length === 0 && emptyResult.importedCount === 0 && emptyResult.rejectedCount === 0, '14. importing nothing imports nothing, cleanly');

        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const stringPayload = JSON.stringify(wireObservationPayload(historyOf(O1)));
        const stringResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(stringPayload);
        assert(stringResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED, '15. a raw JSON string payload is accepted');
        assert(stringResult.observations.length === 1, '16. the one genuine entry imports successfully');
        assert(stringResult.observations[0].observed === true, '17. import reconstructs `observed: true` — never transported over the wire, always reconstructed');
    }
    console.log('✓ Section B: importXxx requires no verifier, validates the whole envelope atomically, and cleanly imports an empty history');

    // ---------------------------------------------------------------
    // Section C — export -> import round-trips exactly.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D2, planA, OBS_T2);
        const originalHistory = historyOf(O1, O2);

        const wirePayload = wireObservationPayload(originalHistory);
        const importResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(wirePayload);
        assert(importResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED, '18. a genuine exported history imports cleanly');
        assert(importResult.observations.length === 2, '19. every observation round-trips');
        assert(serialize(importResult.observations[0]) === serialize(O1), '20. the first observation is byte-identical to the original record');
        assert(serialize(importResult.observations[1]) === serialize(O2), '21. the second observation is byte-identical to the original record');
    }
    console.log('✓ Section C: export -> import round-trips every field exactly, reconstructing `observed: true`');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: the milestone's own three-replica worked
    // example.
    //
    //   Candidate C1 = CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT(C1), D1 = OBSERVE @ T1
    //   Candidate C2 = CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT(C2), D2 = DEFER   @ T2
    //   Plan P1 names C1 only; Plan P2 names C2 only
    //
    //   O1 = D1 / P1 / true  / OBS_T1     (candidate C1, plan P1 — present)
    //   O2 = D1 / P2 / false / OBS_T2     (SAME candidate C1 as O1, but a
    //                                      DIFFERENT plan — genuinely distinct)
    //   O3 = D2 / P2 / true  / OBS_T3     (candidate C2, plan P2 — present)
    //   O4 = D2 / P1 / false / OBS_T4     (SAME candidate C2 as O3, but a
    //                                      DIFFERENT plan — genuinely distinct)
    //
    //   Alice: O1, O2      Bob: O2, O3      Carol: O3, O4
    //
    //   Directional exchange: Alice -> Bob -> Carol -> Alice.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C2' }, 'DEFER', T2);
        const planP1 = planNaming({ claims: ['C1'] });
        const planP2 = planNaming({ claims: ['C2'] });

        const O1 = observe(D1, planP1, OBS_T1);
        const O2 = observe(D1, planP2, OBS_T2);
        const O3 = observe(D2, planP2, OBS_T3);
        const O4 = observe(D2, planP1, OBS_T4);

        // Sanity — O1/O2 share a decision but genuinely differ (different
        // plan, different candidateMatchesPlan, different observedAt); the
        // same holds for O3/O4.
        assert(O1.decision === O2.decision || serialize(O1.decision) === serialize(O2.decision), 'sanity — O1 and O2 share the identical decision');
        assert(O1.planIdentity.planFingerprint !== O2.planIdentity.planFingerprint, 'sanity — O1 and O2 were revalidated against genuinely different plans');
        assert(O1.candidateMatchesPlan === true && O2.candidateMatchesPlan === false, 'sanity — O1 and O2 disagree on candidateMatchesPlan, as their differing plans require');
        assert(serialize(O3.decision) === serialize(D2) && serialize(O4.decision) === serialize(D2), 'sanity — O3 and O4 share the identical decision');
        assert(O3.planIdentity.planFingerprint !== O4.planIdentity.planFingerprint, 'sanity — O3 and O4 were revalidated against genuinely different plans');

        let aliceHistory = historyOf(O1, O2);
        let bobHistory = historyOf(O2, O3);
        let carolHistory = historyOf(O3, O4);
        assert(aliceHistory.length === 2 && bobHistory.length === 2 && carolHistory.length === 2, '22. FLAGSHIP — each replica starts with exactly its own two named observations');

        // --- Alice -> Bob. Bob already holds O2; only O1 is genuinely new. ---
        const alicePayload = wireObservationPayload(aliceHistory);
        const bobFromAlice = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(bobHistory, alicePayload);
        assert(bobFromAlice.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '23. FLAGSHIP — Bob applies Alice\'s exported history');
        assert(bobFromAlice.incomingCount === 2, '24. FLAGSHIP — Alice\'s export names both her own observations');
        assert(bobFromAlice.newCount === 1 && bobFromAlice.duplicateCount === 1, '25. FLAGSHIP — only O1 is genuinely new to Bob; O2 is already on file and is skipped, never duplicated');
        bobHistory = bobFromAlice.history;
        assert(bobHistory.length === 3, '26. FLAGSHIP — Bob now holds exactly three observations: O2, O3 (his own), plus O1 (newly received)');
        // Bob's own pre-existing entries are held by REFERENCE (never
        // rebuilt); the newly received one is a freshly reconstructed but
        // byte-identical record, appended at the end, in payload order.
        assert(bobHistory[0] === O2 && bobHistory[1] === O3, '27. FLAGSHIP — Bob\'s own pre-existing observations retain their original order and object identity');
        assert(serialize(bobHistory[2]) === serialize(O1), '27b. FLAGSHIP — the newly received observation is appended at the end, byte-identical to the original');

        // --- Bob -> Carol. Carol already holds O3; O1 and O2 are genuinely
        // new (Bob's own history now names all three: O2, O3, O1). ---
        const bobPayload = wireObservationPayload(bobHistory);
        const carolFromBob = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(carolHistory, bobPayload);
        assert(carolFromBob.incomingCount === 3, '28. FLAGSHIP — Bob\'s export now names all three observations he currently holds');
        assert(carolFromBob.newCount === 2 && carolFromBob.duplicateCount === 1, '29. FLAGSHIP — O2 and O1 are genuinely new to Carol; O3 is already on file and is skipped');
        carolHistory = carolFromBob.history;
        assert(carolHistory.length === 4, '30. FLAGSHIP — Carol now holds all four distinct observations: O3, O4 (her own), plus O2, O1 (newly received)');

        // --- Carol -> Alice. Alice already holds O1 and O2; O3 and O4 are
        // genuinely new. ---
        const carolPayload = wireObservationPayload(carolHistory);
        const aliceFromCarol = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(aliceHistory, carolPayload);
        assert(aliceFromCarol.incomingCount === 4, '31. FLAGSHIP — Carol\'s export now names all four observations she currently holds');
        assert(aliceFromCarol.newCount === 2 && aliceFromCarol.duplicateCount === 2, '32. FLAGSHIP — O3 and O4 are genuinely new to Alice; her own O1 and O2 are already on file and are skipped');
        aliceHistory = aliceFromCarol.history;
        assert(aliceHistory.length === 4, '33. FLAGSHIP — Alice now holds all four distinct observations: O1, O2 (her own), plus O3, O4 (newly received)');

        // Every replica that has received the full set now agrees, byte for
        // byte, on the SAME set of four distinct observations — the
        // portable representation of a converged history round-trips
        // exactly, regardless of which order each replica received it in.
        const union = historyOf(O1, O2, O3, O4);
        const aliceDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(aliceHistory, union);
        assert(aliceDiff.sameHistory === true, '34. FLAGSHIP — Alice\'s converged history is EXACTLY the union of O1-O4, no more, no less');
        const carolDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(carolHistory, union);
        assert(carolDiff.sameHistory === true, '35. FLAGSHIP — Carol\'s converged history is likewise EXACTLY the union');

        // Every distinct plan fingerprint and observedAt value survived the
        // full export/import/apply round trip unchanged.
        const alicePlanFingerprints = new Set(aliceHistory.map((o) => o.planIdentity.planFingerprint));
        assert(alicePlanFingerprints.size === 2, '36. FLAGSHIP — Alice\'s converged history still names exactly two distinct plan fingerprints (P1 and P2)');
        const aliceObservedAts = new Set(aliceHistory.map((o) => o.observedAt));
        assert(aliceObservedAts.size === 4, '37. FLAGSHIP — Alice\'s converged history still names four distinct observedAt values');

        // --- Repeating the EXACT SAME exchange is idempotent, and each
        // portable payload round-trips byte-for-byte across a JSON
        // string boundary. ---
        const aliceReapplyCarol = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(aliceHistory, carolPayload);
        assert(aliceReapplyCarol.newCount === 0, '38. FLAGSHIP — re-applying Carol\'s identical export to Alice\'s already-converged history is a genuine no-op');
        assert(aliceReapplyCarol.history === aliceHistory, '39. FLAGSHIP — a no-op apply returns the EXACT SAME history instance, never merely an equal one');

        const rewired = JSON.parse(JSON.stringify(carolPayload));
        assert(serialize(rewired) === serialize(carolPayload), '40. FLAGSHIP — the portable payload round-trips byte-for-byte across a JSON string boundary');

        // --- No network access occurs anywhere in this whole exchange. ---
        const { networkCallOccurred } = await withoutNetworkAccess(async () => {
            applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], alicePayload);
            applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], bobPayload);
            applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], carolPayload);
        });
        assert(networkCallOccurred === false, '41. FLAGSHIP — the full three-replica exchange performs zero network access');
    }
    console.log('✓ Section D: FLAGSHIP — Alice/Bob/Carol converge via directional exchange (Alice->Bob->Carol->Alice); only genuinely new observations are ever appended, local duplicates are skipped, distinct plan fingerprints and observedAt values survive, and the converged history round-trips byte-for-byte');

    // ---------------------------------------------------------------
    // Section E — PARTICULARLY VALUABLE: same decision+plan differing only
    // in candidateMatchesPlan, and same decision+plan differing only in
    // observedAt, must never cancel. Complete six-field structural identity
    // governs deduplication — never a narrower key.
    // ---------------------------------------------------------------
    {
        const entryA = baseObservationEntry();
        const entryB = baseObservationEntry({ candidateMatchesPlan: false });
        assert(serialize(entryA) !== serialize(entryB), 'sanity — entryA and entryB differ only in candidateMatchesPlan');

        const payload = { protocolVersion: 1, observations: [entryA, entryB] };
        const applyResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], payload);
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '42. a payload holding two observations differing only in candidateMatchesPlan applies cleanly');
        assert(applyResult.newCount === 2 && applyResult.duplicateCount === 0, '43. neither observation is treated as a duplicate of the other — candidateMatchesPlan alone makes them genuinely distinct');
        assert(applyResult.history.length === 2, '44. both observations are retained, never collapsed into one');

        const entryC = baseObservationEntry();
        const entryD = baseObservationEntry({ observedAt: OBS_T2.toISOString() });
        assert(serialize(entryC) !== serialize(entryD), 'sanity — entryC and entryD differ only in observedAt');

        const timePayload = { protocolVersion: 1, observations: [entryC, entryD] };
        const timeApplyResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], timePayload);
        assert(timeApplyResult.newCount === 2 && timeApplyResult.duplicateCount === 0, '45. two otherwise-identical observations differing only in observedAt are never collapsed');

        // An EXACT structural copy — every one of the six fields identical
        // — IS correctly recognized as a duplicate.
        const exactCopyPayload = { protocolVersion: 1, observations: [baseObservationEntry(), baseObservationEntry()] };
        const exactCopyResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], exactCopyPayload);
        assert(exactCopyResult.newCount === 1 && exactCopyResult.duplicateCount === 1, '46. an exact structural copy, arriving within the SAME payload, is recognized as one new observation plus one duplicate — never two new entries');

        // Only decision alone, or only planIdentity alone, or only
        // candidateType alone, differing is likewise never cancelled.
        const decisionVariant = baseObservationEntry({ decision: { decided: true, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'DIFFERENT' }, decision: 'OBSERVE', decidedAt: T1.toISOString() } });
        const planVariant = baseObservationEntry({ planIdentity: { algorithm: 'SHA-256', planFingerprint: 'b'.repeat(64), candidateCount: 1 } });
        const typeVariant = baseObservationEntry({ candidateType: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM' });
        const presentVariant = baseObservationEntry({ candidatePresent: false });
        for (const [label, variant] of [['decision', decisionVariant], ['planIdentity', planVariant], ['candidateType', typeVariant], ['candidatePresent', presentVariant]]) {
            const varyingPayload = { protocolVersion: 1, observations: [baseObservationEntry(), variant] };
            const varyingResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], varyingPayload);
            assert(varyingResult.newCount === 2 && varyingResult.duplicateCount === 0, `47. two observations differing only in ${label} are never cancelled/collapsed`);
        }
    }
    console.log('✓ Section E: complete six-field structural identity governs deduplication — a difference in ANY single field (including candidateMatchesPlan or observedAt alone) is always a genuine, uncancelled difference; only an exact structural copy is ever recognized as a duplicate');

    // ---------------------------------------------------------------
    // Section F — decision/planIdentity/candidateType/etc structural
    // validation.
    // ---------------------------------------------------------------
    {
        function importsCleanly(entry) {
            const result = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory({ protocolVersion: 1, observations: [entry] });
            return result.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED && result.importedCount === 1;
        }

        assert(importsCleanly(baseObservationEntry()), '48. a genuine, well-formed entry imports cleanly');

        const divergentEntry = baseObservationEntry({
            decision: { decided: true, candidate: { selected: true, type: 'DIVERGENT_CORRESPONDENCE', claimId: 'C1', snapshotIndex: 0, evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false }, decision: 'OBSERVE', decidedAt: T1.toISOString() },
            candidateType: 'DIVERGENT_CORRESPONDENCE'
        });
        assert(importsCleanly(divergentEntry), '49. a genuine DIVERGENT_CORRESPONDENCE decision imports cleanly');

        const snapshotOnlyEntry = baseObservationEntry({
            decision: { decided: true, candidate: { selected: true, type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, decision: 'DEFER', decidedAt: T1.toISOString() },
            candidateType: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM'
        });
        assert(importsCleanly(snapshotOnlyEntry), '50. a genuine SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM decision imports cleanly');

        // Malformed decision shapes.
        const badDecisions = [
            { decided: false, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: T1.toISOString() },
            { decided: true, candidate: { selected: false, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: T1.toISOString() },
            { decided: true, candidate: { selected: true, type: 'MADE_UP_TYPE', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: T1.toISOString() },
            { decided: true, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'ACCEPT', decidedAt: T1.toISOString() },
            { decided: true, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: 'not a date' },
            { decided: true, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: T1.toISOString(), extra: true },
            null, 'not an object', 42, []
        ];
        for (const badDecision of badDecisions) {
            assert(!importsCleanly(baseObservationEntry({ decision: badDecision })), `51. a malformed decision (${JSON.stringify(badDecision)}) is rejected, never imported`);
        }

        // Malformed planIdentity shapes.
        const badPlanIdentities = [
            { algorithm: 'MD5', planFingerprint: 'a'.repeat(64), candidateCount: 1 },
            { algorithm: 'SHA-256', planFingerprint: 'a'.repeat(63), candidateCount: 1 },
            { algorithm: 'SHA-256', planFingerprint: 'A'.repeat(64), candidateCount: 1 },
            { algorithm: 'SHA-256', planFingerprint: 'a'.repeat(64), candidateCount: -1 },
            { algorithm: 'SHA-256', planFingerprint: 'a'.repeat(64), candidateCount: 1.5 },
            { algorithm: 'SHA-256', planFingerprint: 'a'.repeat(64), candidateCount: 1, extra: true },
            { algorithm: 'SHA-256', planFingerprint: 'a'.repeat(64) },
            null, 'not an object', 42, []
        ];
        for (const badPlanIdentity of badPlanIdentities) {
            assert(!importsCleanly(baseObservationEntry({ planIdentity: badPlanIdentity })), `52. a malformed planIdentity (${JSON.stringify(badPlanIdentity)}) is rejected, never imported`);
        }

        // Malformed candidateType / boolean fields / observedAt.
        assert(!importsCleanly(baseObservationEntry({ candidateType: 'MADE_UP_TYPE' })), '53. an unrecognized candidateType is rejected');
        assert(!importsCleanly(baseObservationEntry({ candidatePresent: 'yes' })), '54. a non-boolean candidatePresent is rejected');
        assert(!importsCleanly(baseObservationEntry({ candidateMatchesPlan: 'no' })), '55. a non-boolean candidateMatchesPlan is rejected');

        const badObservedAts = ['not a date', '', null, undefined, 42, {}, []];
        for (const badObservedAt of badObservedAts) {
            assert(!importsCleanly(baseObservationEntry({ observedAt: badObservedAt })), `56. an invalid observedAt (${JSON.stringify(badObservedAt)}) is rejected`);
        }

        assert(!importsCleanly({ ...baseObservationEntry(), extra: true }), '57. an entry with an extra top-level field is rejected');
        const { observedAt, ...missingObservedAt } = baseObservationEntry();
        assert(!importsCleanly(missingObservedAt), '58. an entry missing observedAt is rejected');
    }
    console.log('✓ Section F: every one of 0.8.144\'s own three candidate shapes, plus decision/planIdentity/candidateType/booleans/observedAt, is structurally validated on import — never re-derived, only checked');

    // ---------------------------------------------------------------
    // Section G — malformed entries are skipped individually.
    // ---------------------------------------------------------------
    {
        const genuineEntry1 = baseObservationEntry();
        const genuineEntry2 = baseObservationEntry({ observedAt: OBS_T2.toISOString() });
        const badTypeEntry = baseObservationEntry({ candidateType: 'NOT_A_TYPE' });
        const badDecisionEntry = baseObservationEntry({ decision: { decided: true, candidate: { selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'ACCEPT', decidedAt: T1.toISOString() } });
        const { observedAt: _drop, ...missingFieldEntry } = baseObservationEntry();

        const payload = {
            protocolVersion: 1,
            observations: [genuineEntry1, badTypeEntry, genuineEntry2, badDecisionEntry, missingFieldEntry]
        };

        const importResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(payload);
        assert(importResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED, '59. a mostly-genuine payload still imports, atomically rejecting only its own malformed entries');
        assert(importResult.importedCount === 2, '60. only the two genuine entries are imported');
        assert(importResult.rejectedCount === 3, '61. the three malformed entries are all rejected');
        assert(importResult.rejections.some((r) => r.index === 1), '62. rejections report the ORIGINAL index into payload.observations');
        assert(importResult.rejections.some((r) => r.index === 3), '63. the bad-decision entry is reported too');
        assert(importResult.rejections.some((r) => r.index === 4), '64. the missing-field entry is reported too');

        const applyResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], payload);
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '65. apply likewise succeeds over a mostly-genuine payload');
        assert(applyResult.newCount === 2 && applyResult.rejectedCount === 3, '66. apply carries the same import/rejection counts through unchanged');
        assert(applyResult.history.length === 2, '67. only the two genuine observations land in the resulting history');
    }
    console.log('✓ Section G: malformed and shape-invalid entries are rejected individually, by index and reason, never discarding the rest of an otherwise genuine payload');

    // ---------------------------------------------------------------
    // Section H — determinism, immutability, zero network access.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['C1'] });
        const O1 = observe(D1, planA, OBS_T1);
        const history = historyOf(O1);

        const exportedOnce = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(history);
        const exportedTwice = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(history);
        assert(serialize(exportedOnce) === serialize(exportedTwice), '68. exporting the identical history twice is byte-identical');
        assert(history.length === 1, '69. exporting never mutates the source history');

        const wirePayload = wireObservationPayload(history);
        const historySnapshotBefore = history.slice();
        const { result: applyResult, networkCallOccurred } = await withoutNetworkAccess(() => applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange([], wirePayload));
        assert(networkCallOccurred === false, '70. applying an exchange performs zero network access');
        assert(serialize(history) === serialize(historySnapshotBefore), '71. applying an exchange never mutates the source history it was exported from');
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED, '72. sanity — the apply itself succeeded');

        assert(Object.isFrozen(applyResult.history), '73. the resulting history is frozen');
        assert(Object.isFrozen(applyResult.rejections), '74. the rejections array is frozen');
        assert(Object.isFrozen(applyResult.history[0]), '75. each resulting observation record is frozen');

        const importOnce = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(wirePayload);
        const importTwice = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(wirePayload);
        assert(serialize(importOnce.observations) === serialize(importTwice.observations), '76. importing the identical payload twice is byte-identical');
    }
    console.log('✓ Section H: export/import/apply are deterministic, immutable, and perform zero network access');

    // ---------------------------------------------------------------
    // Section I — no verify/authorize/approve/re-evaluate vocabulary;
    // architecture boundary — exactly one import.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        const forbiddenInCode = [
            'verify', 'verifier', 'verification', 'authorize', 'authorized', 'approve', 'approved',
            're-evaluate', 'reevaluate', 'currentstate', 'resolved', 'superseded', 'effective',
            'stale', 'preferred', 'trust', 'confidence', 'signature', 'signed'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `77. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '78. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js') && !importLines[0].includes('Difference') && !importLines[0].includes('View') && !importLines[0].includes('Deduplication') && !importLines[0].includes('Timeline'), '79. the one import is 0.8.163\'s own append boundary, never the observation/deduplication/timeline/difference/archive-reconstruction modules');

        // Sanity — the two exported functions genuinely require no verifier
        // argument at all (unlike every claim-shaped exchange in this
        // codebase).
        const emptyResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory({ protocolVersion: 1, observations: [] });
        assert(emptyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED, '80. import never throws for a missing verifier argument — none is ever required');
    }
    console.log('✓ Section I: this file carries no verify/authorize/approve/re-evaluate vocabulary anywhere, and imports exactly one module — 0.8.163\'s own append boundary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
