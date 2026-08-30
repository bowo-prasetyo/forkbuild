import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import {
    PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion,
    PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome,
    PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome,
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory,
    importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.151 — Portable Reconciliation Decision History Exchange.
//
// Section A: exportXxx — shape, ordering, tolerance for malformed/absent
//            input, exact three-field (candidate/decision/decidedAt) entries
// Section B: importXxx — envelope validation (whole-payload
//            INVALID_HISTORY), empty history, no verifier required
// Section C: export -> import round-trips candidate/decision/decidedAt
//            exactly, reconstructing `decided: true`
// Section D: FLAGSHIP — three replicas (Alice/Bob/Carol) from the
//            milestone's own worked example; every replica converges on the
//            union of genuinely distinct decisions; D1/D2/D3 remain
//            distinct per 0.8.149's own identity rule; repeated exchange is
//            idempotent
// Section E: candidate/decision/decidedAt structural validation — each of
//            0.8.144's own three candidate shapes, rejected when malformed
// Section F: malformed entries are skipped individually, never fatal to an
//            otherwise genuine payload
// Section G: determinism, immutability, zero network access, frozen results
// Section H: no verify/authorize/approve/re-evaluate vocabulary anywhere;
//            architecture boundary — exactly one import

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

// The identical shared world `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.test.js`
// (0.8.149) already uses: Claim B genuinely diverges against S2 (index 0),
// Claim C has no corresponding snapshot, Snapshot S4 (index 2) has no
// corresponding claim.
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

function wireDecisionPayload(decisionHistory) {
    return JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(decisionHistory)));
}

const T1 = new Date('2026-08-30T05:00:00Z');
const T2 = new Date('2026-08-30T05:05:00Z');
const T3 = new Date('2026-08-30T05:10:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.
    // ---------------------------------------------------------------
    {
        const emptyExport = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory([]);
        assert(emptyExport.protocolVersion === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion, '1. an empty history still carries the protocol version');
        assert(Array.isArray(emptyExport.decisions) && emptyExport.decisions.length === 0, '2. an empty history exports to an empty decisions array');
        assert(Object.isFrozen(emptyExport), '3. the export payload is frozen');

        assert(serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(null)) === serialize(emptyExport), '4. a null history degrades to empty, never a throw');
        assert(serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory('not an array')) === serialize(emptyExport), '5. a malformed history degrades to empty, never a throw');
        assert(serialize(exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory([null, 42, {}, { decided: false, outcome: 'INVALID_SELECTION' }])) === serialize(emptyExport), '6. non-genuine entries are silently excluded');

        const { plan, claimB, claimC } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const d2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const history = historyOf(d1, d2);

        const exported = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(history);
        assert(exported.decisions.length === 2, '7. every genuine decision is exported');
        assert(serialize(exported.decisions[0]) === serialize({ candidate: d1.candidate, decision: d1.decision, decidedAt: d1.decidedAt }), '8. each exported entry carries EXACTLY candidate/decision/decidedAt — never a new shape');
        assert(serialize(exported.decisions[1]) === serialize({ candidate: d2.candidate, decision: d2.decision, decidedAt: d2.decidedAt }), '9. entry order matches history order, oldest first');
        assert(Object.keys(exported.decisions[0]).sort().join(',') === 'candidate,decidedAt,decision', '10. each entry carries exactly candidate/decision/decidedAt — never `decided`, never any interpreted field');
    }
    console.log('✓ Section A: exportXxx carries every genuine decision\'s own candidate/decision/decidedAt unchanged, in order, tolerating malformed/absent input');

    // ---------------------------------------------------------------
    // Section B — importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 42, 'not json at all {{{', [], { protocolVersion: 2, decisions: [] }, { protocolVersion: 1, decisions: 'not an array' }, { protocolVersion: 1, decisions: [], extra: true }, { decisions: [] }]) {
            const result = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(malformed);
            assert(result.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.INVALID_HISTORY, `11. malformed envelope (${JSON.stringify(malformed)}) never throws — yields INVALID_HISTORY`);
            assert(result.decisions === null, '12. INVALID_HISTORY never produces decisions');
        }

        const emptyResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory({ protocolVersion: 1, decisions: [] });
        assert(emptyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED, '13. an empty decisions array is a genuine, well-formed IMPORTED result');
        assert(emptyResult.decisions.length === 0 && emptyResult.importedCount === 0 && emptyResult.rejectedCount === 0, '14. importing nothing imports nothing, cleanly');

        const { plan, claimB } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const stringPayload = JSON.stringify(wireDecisionPayload(historyOf(d1)));
        const stringResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(stringPayload);
        assert(stringResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED, '15. a raw JSON string payload is accepted');
        assert(stringResult.decisions.length === 1, '16. the one genuine entry imports successfully');
        assert(stringResult.decisions[0].decided === true, '17. import reconstructs `decided: true` — never transported over the wire, always reconstructed');
    }
    console.log('✓ Section B: importXxx requires no verifier, validates the whole envelope atomically, and cleanly imports an empty history');

    // ---------------------------------------------------------------
    // Section C — export -> import round-trips exactly.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const d2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const originalHistory = historyOf(d1, d2);

        const wirePayload = wireDecisionPayload(originalHistory);
        const importResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(wirePayload);
        assert(importResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED, '18. a genuine exported history imports cleanly');
        assert(importResult.decisions.length === 2, '19. every decision round-trips');
        assert(serialize(importResult.decisions[0]) === serialize(d1), '20. the first decision is byte-identical to the original record');
        assert(serialize(importResult.decisions[1]) === serialize(d2), '21. the second decision is byte-identical to the original record');
    }
    console.log('✓ Section C: export -> import round-trips every candidate/decision/decidedAt exactly, reconstructing `decided: true`');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: the milestone's own three-replica worked example.
    //
    //   Alice: OBSERVE D1 @ T1, DEFER D2 @ T2, DEFER D2 @ T2 (independently
    //          recorded twice, LOCALLY, before any exchange)
    //   Bob:   DEFER D2 @ T2 (same content as Alice's), OBSERVE D3 @ T3
    //   Carol: OBSERVE D1 @ T1 (same content as Alice's)
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const selectionD1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const selectionD2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const selectionD3 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };

        const aliceD1 = decide(plan, selectionD1, 'OBSERVE', T1);
        const aliceD2a = decide(plan, selectionD2, 'DEFER', T2);
        const aliceD2b = decide(plan, selectionD2, 'DEFER', T2);
        let aliceHistory = historyOf(aliceD1, aliceD2a, aliceD2b);
        assert(aliceHistory.length === 3, '22. FLAGSHIP — Alice\'s own LOCAL history genuinely holds D2 twice, never deduplicated (0.8.146\'s own rule)');

        const bobD2 = decide(plan, selectionD2, 'DEFER', T2);
        const bobD3 = decide(plan, selectionD3, 'OBSERVE', T3);
        let bobHistory = historyOf(bobD2, bobD3);
        assert(serialize(bobD2) === serialize(aliceD2a), '23. FLAGSHIP — Bob\'s own D2 is structurally identical to Alice\'s (same candidate, disposition, decidedAt)');

        const carolD1 = decide(plan, selectionD1, 'OBSERVE', T1);
        let carolHistory = historyOf(carolD1);
        assert(serialize(carolD1) === serialize(aliceD1), '24. FLAGSHIP — Carol\'s own D1 is structurally identical to Alice\'s');

        const alicePayload = wireDecisionPayload(aliceHistory);
        const bobPayload = wireDecisionPayload(bobHistory);
        const carolPayload = wireDecisionPayload(carolHistory);

        // --- Carol receives from Alice, then Bob — exactly the milestone's own diagram. ---
        const carolFromAlice = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(carolHistory, alicePayload);
        assert(carolFromAlice.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED, '25. FLAGSHIP — Carol applies Alice\'s exported history');
        assert(carolFromAlice.newCount === 1, '26. FLAGSHIP — only Alice\'s D2 is genuinely new to Carol (D1 already on file, D2\'s second copy collapses within the SAME payload)');
        assert(carolFromAlice.duplicateCount === 2, '27. FLAGSHIP — D1 (already on file) and D2\'s redundant second copy are both recognized as duplicates');
        carolHistory = carolFromAlice.history;

        const carolFromBob = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(carolHistory, bobPayload);
        assert(carolFromBob.newCount === 1 && carolFromBob.duplicateCount === 1, '28. FLAGSHIP — Bob\'s D3 is new to Carol; Bob\'s D2 is already on file');
        carolHistory = carolFromBob.history;

        assert(carolHistory.length === 3, '29. FLAGSHIP — Carol now holds exactly three decisions: D1, D2, D3 — the union of genuinely distinct records');

        const expectedD1 = decide(plan, selectionD1, 'OBSERVE', T1);
        const expectedD2 = decide(plan, selectionD2, 'DEFER', T2);
        const expectedD3 = decide(plan, selectionD3, 'OBSERVE', T3);
        const expectedUnion = historyOf(expectedD1, expectedD2, expectedD3);

        const carolDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(carolHistory, expectedUnion);
        assert(carolDiff.sameHistory === true, '30. FLAGSHIP — Carol\'s converged history is EXACTLY the union of D1/D2/D3, no more, no less');

        // --- Bob receives from Alice, then Carol. ---
        let bobMerged = bobHistory;
        const bobFromAlice = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(bobMerged, alicePayload);
        assert(bobFromAlice.newCount === 1 && bobFromAlice.duplicateCount === 2, '31. FLAGSHIP — only D1 is new to Bob; both of Alice\'s D2 copies match Bob\'s own D2');
        bobMerged = bobFromAlice.history;
        const bobFromCarol = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(bobMerged, carolPayload);
        assert(bobFromCarol.newCount === 0 && bobFromCarol.duplicateCount === 1, '32. FLAGSHIP — Carol\'s D1 is already on file for Bob (received via Alice)');
        bobMerged = bobFromCarol.history;
        assert(bobMerged.length === 3, '33. FLAGSHIP — Bob also converges on exactly three decisions');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(bobMerged, expectedUnion).sameHistory === true, '34. FLAGSHIP — Bob\'s converged history is likewise EXACTLY the union');

        // --- Alice receives from Bob, then Carol. Alice's own pre-existing
        // LOCAL duplicate of D2 (recorded before any exchange ever
        // happened) is never removed by exchange — exchange only ever
        // ADDS genuinely new records, it never collapses what a replica
        // already, genuinely holds. ---
        let aliceMerged = aliceHistory;
        const aliceFromBob = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(aliceMerged, bobPayload);
        assert(aliceFromBob.newCount === 1 && aliceFromBob.duplicateCount === 1, '35. FLAGSHIP — only D3 is new to Alice; Bob\'s D2 already matches one of Alice\'s own two copies');
        aliceMerged = aliceFromBob.history;
        const aliceFromCarol = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(aliceMerged, carolPayload);
        assert(aliceFromCarol.newCount === 0, '36. FLAGSHIP — Carol\'s D1 already matches Alice\'s own D1');
        aliceMerged = aliceFromCarol.history;
        assert(aliceMerged.length === 4, '37. FLAGSHIP — Alice retains four raw entries: her own genuine local D2 duplicate is never erased by exchange');

        const aliceDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(aliceMerged, expectedUnion);
        assert(aliceDiff.sameHistory === false, '38. FLAGSHIP — Alice\'s own history is NOT byte-for-byte the union — she genuinely holds one extra D2');
        assert(aliceDiff.targetOnlyCount === 0, '39. FLAGSHIP — yet nothing in the union is missing from Alice\'s history — she is a strict superset');
        assert(aliceDiff.sourceOnlyCount === 1 && aliceDiff.sourceOnly[0].decision === 'DEFER', '40. FLAGSHIP — Alice\'s one exclusive record is exactly her own extra, genuine local D2 duplicate');

        // --- Repeating the EXACT SAME exchange is idempotent. ---
        const carolReapplyAlice = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(carolHistory, alicePayload);
        assert(carolReapplyAlice.newCount === 0, '41. FLAGSHIP — re-applying Alice\'s identical export to Carol\'s already-converged history is a genuine no-op');
        assert(carolReapplyAlice.history === carolHistory, '42. FLAGSHIP — a no-op apply returns the EXACT SAME history instance, never merely an equal one');
        const carolReapplyBob = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(carolReapplyAlice.history, bobPayload);
        assert(carolReapplyBob.newCount === 0 && carolReapplyBob.history === carolHistory, '43. FLAGSHIP — re-applying Bob\'s identical export is likewise a genuine no-op');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(carolReapplyBob.history, expectedUnion).sameHistory === true, '44. FLAGSHIP — sameHistory holds for the already-converged, repeated-exchange result');
    }
    console.log('✓ Section D: FLAGSHIP — Alice/Bob/Carol converge on the union of D1/D2/D3, repeated exchange is idempotent (newCount === 0), and a replica\'s own pre-existing local multiplicity is never erased by exchange');

    // ---------------------------------------------------------------
    // Section E — candidate/decision/decidedAt structural validation.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const divergent = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const claimOnly = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T1);
        const snapshotOnly = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T1);

        function entryOf(decision) {
            return { candidate: decision.candidate, decision: decision.decision, decidedAt: decision.decidedAt };
        }

        function importsCleanly(entry) {
            const result = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory({ protocolVersion: 1, decisions: [entry] });
            return result.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED && result.importedCount === 1;
        }

        assert(importsCleanly(entryOf(divergent)), '45. a genuine DIVERGENT_CORRESPONDENCE entry imports cleanly');
        assert(importsCleanly(entryOf(claimOnly)), '46. a genuine CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT entry imports cleanly');
        assert(importsCleanly(entryOf(snapshotOnly)), '47. a genuine SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM entry imports cleanly');

        const malformedCandidates = [
            { ...divergent.candidate, extraField: 'nope' },
            (() => { const { snapshotIndex, ...rest } = divergent.candidate; return rest; })(),
            { ...divergent.candidate, snapshotIndex: 'not a number' },
            { ...divergent.candidate, evidenceFingerprintDiffers: 'not a boolean' },
            { ...divergent.candidate, selected: false },
            { ...divergent.candidate, type: 'MADE_UP_TYPE' },
            { ...claimOnly.candidate, snapshotIndex: 0 },
            { ...claimOnly.candidate, claimId: 42 },
            { ...snapshotOnly.candidate, claimId: 'not expected here' },
            null, 'not an object', 42, []
        ];
        for (const badCandidate of malformedCandidates) {
            const entry = { candidate: badCandidate, decision: 'OBSERVE', decidedAt: T1.toISOString() };
            assert(!importsCleanly(entry), `48. a malformed candidate (${JSON.stringify(badCandidate)}) is rejected, never imported`);
        }

        const badDecisions = ['ACCEPT', 'REJECT', 'RESOLVE', '', null, undefined, 42, 'observe', 'defer'];
        for (const badDecision of badDecisions) {
            const entry = { candidate: divergent.candidate, decision: badDecision, decidedAt: T1.toISOString() };
            assert(!importsCleanly(entry), `49. a decision outside OBSERVE/DEFER (${JSON.stringify(badDecision)}) is rejected`);
        }

        const badDecidedAts = ['not a date', '', null, undefined, 42, {}, []];
        for (const badDecidedAt of badDecidedAts) {
            const entry = { candidate: divergent.candidate, decision: 'OBSERVE', decidedAt: badDecidedAt };
            assert(!importsCleanly(entry), `50. an invalid decidedAt (${JSON.stringify(badDecidedAt)}) is rejected`);
        }

        assert(!importsCleanly({ ...entryOf(divergent), extra: true }), '51. an entry with an extra top-level field is rejected');
        assert(!importsCleanly({ candidate: divergent.candidate, decision: 'OBSERVE' }), '52. an entry missing decidedAt is rejected');
    }
    console.log('✓ Section E: every one of 0.8.144\'s own three candidate shapes, plus decision/decidedAt, is structurally validated on import — never re-derived, only checked');

    // ---------------------------------------------------------------
    // Section F — malformed entries are skipped individually.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const d2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        const genuineEntry1 = { candidate: d1.candidate, decision: d1.decision, decidedAt: d1.decidedAt };
        const genuineEntry2 = { candidate: d2.candidate, decision: d2.decision, decidedAt: d2.decidedAt };
        const badTypeEntry = { candidate: { ...d1.candidate, type: 'NOT_A_TYPE' }, decision: 'OBSERVE', decidedAt: T1.toISOString() };
        const badDecisionEntry = { candidate: d1.candidate, decision: 'ACCEPT', decidedAt: T1.toISOString() };
        const missingFieldEntry = { candidate: d1.candidate, decision: 'OBSERVE' };

        const payload = {
            protocolVersion: 1,
            decisions: [genuineEntry1, badTypeEntry, genuineEntry2, badDecisionEntry, missingFieldEntry]
        };

        const importResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(payload);
        assert(importResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED, '53. a mostly-genuine payload still imports, atomically rejecting only its own malformed entries');
        assert(importResult.importedCount === 2, '54. only the two genuine entries are imported');
        assert(importResult.rejectedCount === 3, '55. the three malformed entries are all rejected');
        assert(importResult.rejections.some((r) => r.index === 1), '56. rejections report the ORIGINAL index into payload.decisions');
        assert(importResult.rejections.some((r) => r.index === 3), '57. the bad-decision entry is reported too');
        assert(importResult.rejections.some((r) => r.index === 4), '58. the missing-field entry is reported too');

        const applyResult = applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange([], payload);
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED, '59. apply likewise succeeds over a mostly-genuine payload');
        assert(applyResult.newCount === 2 && applyResult.rejectedCount === 3, '60. apply carries the same import/rejection counts through unchanged');
        assert(applyResult.history.length === 2, '61. only the two genuine decisions land in the resulting history');
    }
    console.log('✓ Section F: malformed and shape-invalid entries are rejected individually, by index and reason, never discarding the rest of an otherwise genuine payload');

    // ---------------------------------------------------------------
    // Section G — determinism, immutability, zero network access.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const d1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = historyOf(d1);

        const exportedOnce = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(history);
        const exportedTwice = exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(history);
        assert(serialize(exportedOnce) === serialize(exportedTwice), '62. exporting the identical history twice is byte-identical');
        assert(history.length === 1, '63. exporting never mutates the source history');

        const wirePayload = wireDecisionPayload(history);
        const historySnapshotBefore = history.slice();
        const { result: applyResult, networkCallOccurred } = await withoutNetworkAccess(() => applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange([], wirePayload));
        assert(networkCallOccurred === false, '64. applying an exchange performs zero network access');
        assert(serialize(history) === serialize(historySnapshotBefore), '65. applying an exchange never mutates the source history it was exported from');
        assert(applyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED, '66. sanity — the apply itself succeeded');

        assert(Object.isFrozen(applyResult.history), '67. the resulting history is frozen');
        assert(Object.isFrozen(applyResult.rejections), '68. the rejections array is frozen');
        assert(Object.isFrozen(applyResult.history[0]), '69. each resulting decision record is frozen');

        const importOnce = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(wirePayload);
        const importTwice = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(wirePayload);
        assert(serialize(importOnce.decisions) === serialize(importTwice.decisions), '70. importing the identical payload twice is byte-identical');
    }
    console.log('✓ Section G: export/import/apply are deterministic, immutable, and perform zero network access');

    // ---------------------------------------------------------------
    // Section H — no verify/authorize/approve/re-evaluate vocabulary;
    // architecture boundary — exactly one import.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        const forbiddenInCode = [
            'verify', 'verifier', 'verification', 'authorize', 'authorized', 'approve', 'approved',
            're-evaluate', 'reevaluate', 'currentstate', 'resolved', 'superseded', 'effective',
            'preferred', 'trust', 'confidence', 'signature', 'signed'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `71. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '72. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js') && !importLines[0].includes('Difference') && !importLines[0].includes('View'), '73. the one import is 0.8.146\'s own append boundary, never the plan/candidate/decision/difference/archive modules');

        // Sanity — the two exported functions genuinely require no verifier
        // argument at all (unlike every claim-shaped exchange in this
        // codebase).
        const emptyResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory({ protocolVersion: 1, decisions: [] });
        assert(emptyResult.outcome === PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED, '74. import never throws for a missing verifier argument — none is ever required');
    }
    console.log('✓ Section H: this file carries no verify/authorize/approve/re-evaluate vocabulary anywhere, and imports exactly one module — 0.8.146\'s own append boundary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
