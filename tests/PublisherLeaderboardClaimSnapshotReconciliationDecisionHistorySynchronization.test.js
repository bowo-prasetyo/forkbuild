import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import {
    PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion,
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange,
    PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization,
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.152 — Reconciliation Decision History Synchronization.
//
// Section A: describeXxx is a byte-identical passthrough to 0.8.149's own
//            difference projection
// Section B: reconstructXxx reads both sides through the 0.8.150 archive
//            seam and agrees exactly with describe()
// Section C: exportXxx exports ONLY sourceOnly, in 0.8.151's own unchanged
//            wire shape; already-converged histories export a genuine
//            empty payload
// Section D: applyXxx is a direct, unmodified delegation to 0.8.151's own
//            applier — no verifier argument, identical outcome byte for
//            byte
// Section E: the subtle issue — OBSERVE/DEFER against the same candidate,
//            and the same candidate+disposition at a different decidedAt,
//            remain genuinely distinct records straight through
//            synchronization
// Section F: FLAGSHIP — four replicas (Alice/Bob/Carol/Dave), directional
//            ring synchronization then explicit reverse calls; only
//            missing decisions ever move; genuine local multiplicity
//            survives; repeating a converged synchronization is a byte-
//            identical no-op
// Section G: determinism, immutability, zero network access, no archive
//            ever written to
// Section H: no interpretive/trust vocabulary anywhere in this file's own
//            results; architecture boundary — exactly the two composed
//            modules, nothing else

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
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

function makePolicy(version) {
    return Object.freeze({
        version,
        criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]),
        tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' })
    });
}

function makeEntry(rank, publisherIdentity, achievementCount) {
    return Object.freeze({ rank, publisherIdentity, achievementCount, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
}

function makeLeaderboard(policy, entries) {
    return Object.freeze({ policy, entryCount: entries.length, entries: Object.freeze(entries) });
}

function snapshotOf(fingerprint, leaderboard) {
    return describePublisherLeaderboardSnapshot(fingerprint, leaderboard);
}

function fingerprintOf(snapshot) {
    return describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint;
}

const E2 = '2'.repeat(64);
const E3 = '3'.repeat(64);
const E4 = '4'.repeat(64);
const E_WRONG = '9'.repeat(64);
const BOB_PUBLISHER = new PublisherIdentityRecord({ publisherId: 'Bob' });
const DIANA = new PublisherIdentityRecord({ publisherId: 'Diana' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt = new Date('2026-08-30T00:00:00Z') }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

function recordFor(claim, receivedAt = new Date('2026-08-30T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

// The identical shared world 0.8.149's/0.8.151's own tests already use:
// Claim B genuinely diverges against both S2 (index 0) and S3 (index 1),
// Claim C has no corresponding snapshot, Snapshot S4 (index 2) has no
// corresponding claim — exactly four distinct candidates, reused below as
// D1..D4.
function buildWorld() {
    const bob = makeIdentity('Bob');
    const carl = makeIdentity('Carl');

    const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB_PUBLISHER, 5)]));
    const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB_PUBLISHER, 5)]));
    const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
    const snapshots = [s2, s3, s4];

    const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
    const claimC = signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

    const claimHistory = [recordFor(claimB), recordFor(claimC)];
    const verifier = new LocalAuthorizationVerifier();
    const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

    return { plan, claimB, claimC };
}

function decide(plan, selection, disposition, decidedAt) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, disposition, decidedAt);
}

function historyOf(...decisions) {
    let history = [];
    for (const decision of decisions) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
    }
    return history;
}

function archiveFromDecisionHistory(history) {
    let archive = PublicationObservationArchive.empty();
    for (const decision of history) {
        archive = archive.appendReconciliationDecisionRecord(decision);
    }
    return archive;
}

const T1 = new Date('2026-08-30T05:00:00Z');
const T2 = new Date('2026-08-30T05:05:00Z');
const T3 = new Date('2026-08-30T05:10:00Z');
const T4 = new Date('2026-08-30T05:15:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — describeXxx is a byte-identical passthrough to 0.8.149's
    // own difference.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const d2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        const sourceHistory = historyOf(d1);
        const targetHistory = historyOf(d2);

        const viaSync = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
        const viaDifference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
        assert(serialize(viaSync) === serialize(viaDifference), '1. describeXxx agrees exactly, byte for byte, with 0.8.149\'s own difference projection');
        assert(viaSync.sourceOnly[0] === d1 && viaSync.targetOnly[0] === d2, '2. the original decision record instances are preserved, never copies');

        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization().sameHistory === true, '3. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(null, 'not an array').sameHistory === true, '4. malformed/absent histories degrade to empty, never throw');
        assert(Object.isFrozen(viaSync), '5. the result is frozen, exactly like 0.8.149\'s own difference result');
    }
    console.log('✓ Section A: describeXxx is a byte-identical passthrough to the 0.8.149 difference projection');

    // ---------------------------------------------------------------
    // Section B — reconstructXxx reads both sides through the 0.8.150
    // archive seam.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const sourceHistory = historyOf(d1);
        const targetHistory = [];

        const described = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(archiveFromDecisionHistory(sourceHistory), archiveFromDecisionHistory(targetHistory));
        assert(reconstructed.sameHistory === described.sameHistory && reconstructed.sourceOnly[0] === described.sourceOnly[0], '6. reconstructXxx reads each side\'s durable history and agrees exactly with describeXxx, preserving the original record instance');

        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(null, undefined).sameHistory === true, '7. an invalid/missing archive on either side degrades to an empty history, never a throw');
        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization('not an archive', 42).sourceOnlyCount === 0, '8. a malformed archive argument degrades safely on both sides');
    }
    console.log('✓ Section B: reconstructXxx reads both replicas\' durable histories through the 0.8.150 seam, agreeing exactly with describeXxx');

    // ---------------------------------------------------------------
    // Section C — exportXxx exports ONLY sourceOnly, in 0.8.151's own
    // unchanged wire shape.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const sourceOnlyDecision = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T1);
        const sharedSelection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const sharedForSource = decide(plan, sharedSelection, 'DEFER', T2);
        const sharedForTarget = decide(plan, sharedSelection, 'DEFER', T2);

        const sourceHistory = historyOf(sourceOnlyDecision, sharedForSource);
        const targetHistory = historyOf(sharedForTarget);

        const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
        assert(payload.protocolVersion === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion, '9. the exported payload carries the SAME protocol version 0.8.151 already defines — no new envelope');
        assert(payload.decisions.length === 1, '10. only the one exclusive decision is exported — the shared decision is never resent');
        assert(serialize(payload.decisions[0]) === serialize({ candidate: sourceOnlyDecision.candidate, decision: sourceOnlyDecision.decision, decidedAt: sourceOnlyDecision.decidedAt }), '11. the exported entry is exactly the exclusive record\'s own candidate/decision/decidedAt');
        assert(serialize(payload) === serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory([sourceOnlyDecision])), '12. the payload is byte-identical to calling 0.8.151\'s own export directly over exactly the exclusive decision');

        const convergedPayload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization([sharedForSource], [sharedForTarget]);
        assert(convergedPayload.decisions.length === 0, '13. two already-converged histories export zero decisions — never a special sentinel');
        assert(serialize(convergedPayload) === serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory([])), '14. an empty synchronization export is byte-identical to exporting an empty history directly');

        assert(Object.isFrozen(payload) && Object.isFrozen(payload.decisions), '15. the exported payload and its decisions array are frozen');
    }
    console.log('✓ Section C: exportXxx exports only the source-exclusive decisions, in the unchanged 0.8.151 wire shape');

    // ---------------------------------------------------------------
    // Section D — applyXxx is a direct, unmodified delegation to 0.8.151's
    // own applier, taking no verifier argument.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const payload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(historyOf(d1))));

        const viaSync = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization([], payload);
        const viaExchange = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange([], payload);
        assert(viaSync.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED, '16. sanity — the delegated apply genuinely succeeds');
        assert(serialize(viaSync.history) === serialize(viaExchange.history), '17. applying via the synchronization entry point produces the identical resulting history as applying via 0.8.151 directly');
        assert(viaSync.newCount === viaExchange.newCount && viaSync.duplicateCount === viaExchange.duplicateCount && viaSync.rejectedCount === viaExchange.rejectedCount, '18. every reported count agrees exactly');

        const malformedResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization([], { protocolVersion: 999, decisions: [] });
        assert(malformedResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.INVALID_HISTORY, '19. a malformed envelope is rejected exactly as 0.8.151 already rejects it');
        assert(malformedResult.history === null, '20. an INVALID_HISTORY outcome never fabricates a resulting history');
    }
    console.log('✓ Section D: applyXxx delegates directly to the unmodified 0.8.151 applier — identical outcome, byte for byte, no verifier argument');

    // ---------------------------------------------------------------
    // Section E — the subtle issue: decision identity includes both
    // disposition and decidedAt, and synchronization must never collapse
    // either distinction.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const candidate = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const observeAtT1 = decide(plan, candidate, 'OBSERVE', T1);
        const observeAtT2 = decide(plan, candidate, 'OBSERVE', T2);
        const deferAtT1 = decide(plan, candidate, 'DEFER', T1);

        assert(serialize(observeAtT1.candidate) === serialize(observeAtT2.candidate) && serialize(observeAtT1.candidate) === serialize(deferAtT1.candidate), '21. sanity — all three concern the identical candidate');

        // Target already holds OBSERVE@T1; source holds all three.
        const targetHistory = historyOf(observeAtT1);
        const sourceHistory = historyOf(observeAtT1, observeAtT2, deferAtT1);

        const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
        assert(difference.sourceOnly.length === 2 && difference.sourceOnly.includes(observeAtT2) && difference.sourceOnly.includes(deferAtT1), '22. OBSERVE@T2 (different decidedAt) and DEFER@T1 (different disposition) are both reported as genuinely missing — OBSERVE@T1 alone cancels');

        const applied = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(targetHistory, exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory));
        assert(applied.newCount === 2, '23. exactly the two genuinely distinct decisions are folded in');
        assert(applied.history.length === 3, '24. the target now holds all three: OBSERVE@T1, OBSERVE@T2, DEFER@T1 — never merged into one "decision about this candidate"');
        assert(applied.history.filter((entry) => entry.decision === 'OBSERVE').length === 2, '25. both OBSERVE entries (different decidedAt) survive as separate records');
        assert(applied.history.some((entry) => entry.decision === 'DEFER'), '26. the DEFER entry survives alongside the OBSERVE entries for the same candidate');
    }
    console.log('✓ Section E: synchronization inherits decision identity exactly from 0.8.149/0.8.151 — differing disposition or decidedAt alone is always a distinct decision, never restated or weakened here');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: four replicas, directional ring
    // synchronization, then explicit reverse calls.
    //
    //   Alice: [D1, D2, D2]   (D2 recorded twice, LOCALLY, genuinely)
    //   Bob:   [D2, D3]
    //   Carol: [D1, D3, D4]
    //   Dave:  [D4]
    //
    //   Alice -> Bob, Bob -> Carol, Carol -> Dave, Dave -> Alice
    //   then the explicit reverse calls: Bob -> Alice, Carol -> Bob,
    //   Dave -> Carol, Alice -> Dave
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const selectionD1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const selectionD2 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 };
        const selectionD3 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const selectionD4 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };

        const D1 = decide(plan, selectionD1, 'OBSERVE', T1);
        const D2 = decide(plan, selectionD2, 'OBSERVE', T2);
        const D3 = decide(plan, selectionD3, 'OBSERVE', T3);
        const D4 = decide(plan, selectionD4, 'OBSERVE', T4);

        let aliceHistory = historyOf(D1, D2, D2);
        let bobHistory = historyOf(D2, D3);
        let carolHistory = historyOf(D1, D3, D4);
        let daveHistory = historyOf(D4);
        assert(aliceHistory.length === 3, '27. FLAGSHIP — Alice\'s own local history genuinely holds D2 twice, never deduplicated');

        function syncOnce(sourceHistory, targetHistory, label) {
            const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
            assert(serialize(Object.keys(payload).sort()) === serialize(['decisions', 'protocolVersion']), `28. FLAGSHIP (${label}) — the payload carries exactly 0.8.151's own two fields, nothing synchronization-specific`);
            const result = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(targetHistory, payload);
            assert(result.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED, `29. FLAGSHIP (${label}) — synchronization applies cleanly`);
            return result;
        }

        // --- Forward ring: Alice -> Bob -> Carol -> Dave -> Alice. ---
        const aliceToBob = syncOnce(aliceHistory, bobHistory, 'Alice->Bob');
        assert(aliceToBob.newCount === 1 && aliceToBob.duplicateCount === 1, '30. FLAGSHIP — Alice->Bob: only D1 is new to Bob; one of Alice\'s two D2 copies matches Bob\'s own D2, the other is exported but recognized as a duplicate on arrival');
        bobHistory = aliceToBob.history;
        assert(bobHistory.length === 3, '31. FLAGSHIP — Bob now holds D2, D3, D1');

        const bobToCarol = syncOnce(bobHistory, carolHistory, 'Bob->Carol');
        assert(bobToCarol.newCount === 1, '32. FLAGSHIP — Bob->Carol: only D2 is new to Carol; D1 and D3 already on file');
        carolHistory = bobToCarol.history;
        assert(carolHistory.length === 4, '33. FLAGSHIP — Carol now holds D1, D3, D4, D2');

        const carolToDave = syncOnce(carolHistory, daveHistory, 'Carol->Dave');
        assert(carolToDave.newCount === 3, '34. FLAGSHIP — Carol->Dave: D1, D3, D2 are all new to Dave; only D4 was already on file');
        daveHistory = carolToDave.history;
        assert(daveHistory.length === 4, '35. FLAGSHIP — Dave now holds D4, D1, D3, D2');

        const daveToAlice = syncOnce(daveHistory, aliceHistory, 'Dave->Alice');
        assert(daveToAlice.newCount === 2, '36. FLAGSHIP — Dave->Alice: D4 and D3 are new to Alice; D1 already on file, and D2 (present on Dave via the ring) is never resent because the difference already cancels it against ONE of Alice\'s own two copies');
        aliceHistory = daveToAlice.history;
        assert(aliceHistory.length === 5, '37. FLAGSHIP — Alice now holds D1, D2, D2, D4, D3 — her own genuine local D2 duplicate is untouched');

        // Directionality: the forward ring never moved anything backward on
        // its own — at this point Bob has never received D4 (only Carol and
        // Dave have it), proving Carol->Dave never implicitly reached back
        // to Bob.
        assert(!bobHistory.includes(D4) && bobHistory.filter((entry) => entry === D4).length === 0, '38. FLAGSHIP — before any reverse call, Bob has NOT received D4 — the forward ring never moves anything backward or sideways on its own');

        // --- Explicit reverse calls: Bob->Alice, Carol->Bob, Dave->Carol,
        // Alice->Dave — proving directionality requires a separate,
        // explicit call per direction. ---
        const bobToAlice = syncOnce(bobHistory, aliceHistory, 'Bob->Alice');
        assert(bobToAlice.newCount === 0, '39. FLAGSHIP — Bob->Alice: Alice already holds everything Bob has (Bob is now a subset of Alice\'s converged history)');
        aliceHistory = bobToAlice.history;

        const carolToBob = syncOnce(carolHistory, bobHistory, 'Carol->Bob');
        assert(carolToBob.newCount === 1, '40. FLAGSHIP — Carol->Bob: D4 is new to Bob');
        bobHistory = carolToBob.history;
        assert(bobHistory.length === 4, '41. FLAGSHIP — Bob now holds D2, D3, D1, D4');

        const daveToCarol = syncOnce(daveHistory, carolHistory, 'Dave->Carol');
        assert(daveToCarol.newCount === 0, '42. FLAGSHIP — Dave->Carol: Carol already holds everything Dave has');
        carolHistory = daveToCarol.history;

        const firstAliceToDave = syncOnce(aliceHistory, daveHistory, 'Alice->Dave (first)');
        assert(firstAliceToDave.newCount === 0 && firstAliceToDave.duplicateCount === 1, '43. FLAGSHIP — Alice->Dave: Dave already holds D1/D2/D3/D4; Alice\'s exported extra D2 copy is recognized as a duplicate, never a second append');
        daveHistory = firstAliceToDave.history;

        // --- Full convergence: every replica now holds the union {D1, D2,
        // D3, D4}; Alice alone retains her own extra, genuine local D2. ---
        const union = historyOf(D1, D2, D3, D4);
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(bobHistory, union).sameHistory === true, '44. FLAGSHIP — Bob\'s converged history is EXACTLY the four-decision union');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(carolHistory, union).sameHistory === true, '45. FLAGSHIP — Carol\'s converged history is EXACTLY the four-decision union');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(daveHistory, union).sameHistory === true, '46. FLAGSHIP — Dave\'s converged history is EXACTLY the four-decision union');

        const aliceVsUnion = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(aliceHistory, union);
        assert(aliceVsUnion.sameHistory === false && aliceVsUnion.targetOnlyCount === 0, '47. FLAGSHIP — Alice is a strict superset of the union: nothing in the union is missing from her history');
        assert(aliceVsUnion.sourceOnlyCount === 1 && aliceVsUnion.sourceOnly[0].decision === 'OBSERVE' && serialize(aliceVsUnion.sourceOnly[0].candidate) === serialize(D2.candidate), '48. FLAGSHIP — Alice\'s one exclusive record is exactly her own extra, genuine local D2 duplicate — never collapsed by any synchronization call');

        // --- Repeating an already-converged synchronization is a genuine,
        // instance-identical no-op. ---
        const reCarolToDavePayload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(carolHistory, daveHistory);
        assert(reCarolToDavePayload.decisions.length === 0, '49. FLAGSHIP — re-synchronizing two converged replicas exports nothing further');
        const firstApply = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(daveHistory, reCarolToDavePayload);
        const secondApply = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(daveHistory, reCarolToDavePayload);
        assert(firstApply.newCount === 0 && secondApply.newCount === 0, '50. FLAGSHIP — repeating synchronization after convergence changes nothing');
        assert(secondApply.history === firstApply.history, '51. FLAGSHIP — the particularly valuable assertion: applying an already-converged synchronization payload twice returns the EXACT SAME history instance, never merely an equal one');
        assert(firstApply.history === daveHistory, '52. FLAGSHIP — and that instance is the caller\'s own original target history, completely untouched');
    }
    console.log('✓ Section F: FLAGSHIP — four replicas converge via directional ring synchronization plus explicit reverse calls; only missing decisions ever move, Alice\'s genuine local multiplicity survives every call, and re-synchronizing a converged pair is a byte-identical, instance-identical no-op');

    // ---------------------------------------------------------------
    // Section G — determinism, immutability, zero network access, no
    // archive ever written to.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const d2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'DEFER', T2);

        const sourceHistory = historyOf(d1);
        const targetHistory = historyOf(d2);
        const sourceSnapshotBefore = sourceHistory.slice();
        const targetSnapshotBefore = targetHistory.slice();

        const payloadOnce = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
        const payloadTwice = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
        assert(serialize(payloadOnce) === serialize(payloadTwice), '53. exporting the identical synchronization twice is byte-identical');
        assert(serialize(sourceHistory) === serialize(sourceSnapshotBefore), '54. the source history is never mutated by export');
        assert(serialize(targetHistory) === serialize(targetSnapshotBefore), '55. the target history is never mutated by export');

        const wirePayload = JSON.parse(JSON.stringify(payloadOnce));
        const { result: applyResult, networkCallOccurred } = await withoutNetworkAccess(() => applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization([], wirePayload));
        assert(networkCallOccurred === false, '56. applying a synchronization payload performs zero network access');
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED, '57. sanity — the apply itself succeeded');
        assert(Object.isFrozen(applyResult.history), '58. the resulting history is frozen');

        const archive = PublicationObservationArchive.empty();
        const preCallCount = archive.reconciliationDecisionRecords.length;
        applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization([], wirePayload);
        assert(archive.reconciliationDecisionRecords.length === preCallCount, '59. no archive is ever touched — synchronization never even receives an archive reference at this layer');
    }
    console.log('✓ Section G: synchronization export/apply are deterministic, immutable, and perform zero network or archive access');

    // ---------------------------------------------------------------
    // Section H — no interpretive/trust vocabulary; architecture boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);

        const described = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(historyOf(d1), []);
        const describedKeys = Object.keys(described).sort();
        assert(serialize(describedKeys) === serialize(['sameHistory', 'sourceCount', 'sourceOnly', 'sourceOnlyCount', 'targetCount', 'targetOnly', 'targetOnlyCount'].sort()), '60. the description carries exactly the documented, factual fields');

        const payload = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(historyOf(d1), []);
        const payloadKeys = Object.keys(payload).sort();
        assert(serialize(payloadKeys) === serialize(['decisions', 'protocolVersion']), '61. the exported payload carries exactly the two fields 0.8.151 already defines — no synchronization-specific field of any kind');
        const entryKeys = Object.keys(payload.decisions[0]).sort();
        assert(serialize(entryKeys) === serialize(['candidate', 'decidedAt', 'decision']), '62. each entry carries exactly candidate/decision/decidedAt — nothing evaluative, nothing synchronization-specific');

        const forbidden = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'currentState', 'effective'];
        for (const term of forbidden) {
            assert(!describedKeys.includes(term) && !payloadKeys.includes(term), `63. neither result ever carries interpretive/trust vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['verify', 'verifier', 'verification', 'authorize', 'approve', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'trust', 'confidence', 'reputation', 'consensus', 'majority', 'expir', 'network', 'fetch('];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `64. this file's own code never carries "${term}"`);
        }

        const importedFiles = Array.from(moduleSource.matchAll(/from '(.+)';/g)).map((match) => match[1]);
        assert(importedFiles.length === 2, '65. this file imports exactly two modules');
        assert(importedFiles.some((path) => path.includes('DecisionHistoryDifference.js')) && importedFiles.some((path) => path.includes('DecisionHistoryExchange.js')), '66. the two imports are exactly the 0.8.149 difference projection and the 0.8.151 exchange — never the plan/candidate/decision/archive modules directly');
    }
    console.log('✓ Section H: this file carries no interpretive/trust vocabulary of its own, every payload it produces is a genuine, unmodified 0.8.151 envelope, and it imports exactly the two modules it composes');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization.test.js FAILED:', error);
    process.exitCode = 1;
});
