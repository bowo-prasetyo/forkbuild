import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import {
    appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry,
    findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId,
    findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex,
    findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.146 — Reconciliation Decision History.
//
// Section A: appendXxx() — append-only, never mutates its input, refuses to
//            append anything that is not a genuine `{ decided: true, ... }`
//            0.8.145 result (no-op, never a throw)
// Section B: FLAGSHIP — Claim B genuinely diverges against BOTH S2 and S3;
//            Claim C has no corresponding snapshot; Snapshot S4 has no
//            corresponding claim. D1=OBSERVE(B,S2), D2=DEFER(B,S3),
//            D3=OBSERVE(C), D4=OBSERVE(B,S2) (identical to D1) — the
//            resulting history holds FOUR entries, D1 and D4 both present,
//            never collapsed
// Section C: findXxx() lookups — by claimId, by snapshotIndex, by
//            disposition, each an order-preserving, exact-field lookup
// Section D: architecture — no imports, no forbidden vocabulary, no
//            mutation of claim history/snapshot/plan/archive, determinism,
//            zero network access

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
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
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

const DECIDED_AT_1 = new Date('2026-08-30T05:00:00Z');
const DECIDED_AT_2 = new Date('2026-08-30T05:05:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — appendXxx() tolerance and shape.
    // ---------------------------------------------------------------
    {
        let history = [];
        for (const malformed of [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }]) {
            const after = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, malformed);
            assert(after.length === 0, `1. appending a non-genuine decision (${JSON.stringify(malformed)}) is a no-op`);
            assert(Object.isFrozen(after), '2. the no-op result is still frozen');
        }
        assert(history.length === 0, '3. the original array handed in is never mutated by a no-op append');
    }
    console.log('✓ Section A: appendXxx() never appends anything except a genuine { decided: true, ... } decision record — malformed input is a silent no-op, never a throw');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   Divergent: B <-> S2, B <-> S3
    //   Claims without snapshot: C
    //   Snapshots without claim: S4
    // ---------------------------------------------------------------
    let history, claimB, claimC, D1, D2, D3, D4;
    {
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');

        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
        const snapshots = [s2, s3, s4];

        claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        claimC = signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

        const claimHistory = [recordFor(claimB), recordFor(claimC)];
        const verifier = new LocalAuthorizationVerifier();
        const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

        D1 = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        D2 = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'DEFER', DECIDED_AT_2);
        D3 = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', DECIDED_AT_1);
        D4 = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);

        assert(D1.decided && D2.decided && D3.decided && D4.decided, '4. FLAGSHIP — all four decisions are genuine');
        assert(serialize(D1) === serialize(D4), '5. FLAGSHIP — D1 and D4 are byte-identical decisions (same candidate, same disposition, same decidedAt)');

        history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D2);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D3);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D4);

        assert(history.length === 4, '6. FLAGSHIP — the resulting history holds FOUR entries, including both identical D1 and D4');
        assert(history[0] === D1 && history[1] === D2 && history[2] === D3 && history[3] === D4, '7. FLAGSHIP — entries preserve insertion order exactly');
        assert(serialize(history[0]) === serialize(history[3]), '8. FLAGSHIP — D1 and D4 remain two separate, byte-identical entries, never collapsed into one');

        // Appending another identical decision produces another entry, not
        // a collapse.
        const historyWithFifth = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        assert(historyWithFifth.length === 5, '9. FLAGSHIP — appending yet another decision identical to D1 produces a FIFTH entry, never collapsing back to four');
    }
    console.log('✓ Section B: FLAGSHIP — OBSERVE(B,S2), DEFER(B,S3), OBSERVE(C), and a repeat of OBSERVE(B,S2) produce four history entries, with the two identical decisions preserved side by side rather than deduplicated');

    // ---------------------------------------------------------------
    // Section C — findXxx() lookups.
    // ---------------------------------------------------------------
    {
        const byClaimB = findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, claimB.id);
        assert(byClaimB.length === 3, '10. findByClaimId(B) returns all three entries naming claim B — D1, D2, and D4 — never merged into one');
        assert(byClaimB[0] === D1 && byClaimB[1] === D2 && byClaimB[2] === D4, '11. findByClaimId(B) preserves history order');

        const byClaimC = findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, claimC.id);
        assert(byClaimC.length === 1 && byClaimC[0] === D3, '12. findByClaimId(C) returns exactly D3');

        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, 'did:key:nobody').length === 0, '13. an unknown claimId finds nothing');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, null).length === 0, '14. a malformed claimId finds nothing, never throws');

        const bySnapshot0 = findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, 0);
        assert(bySnapshot0.length === 2 && bySnapshot0[0] === D1 && bySnapshot0[1] === D4, '15. findBySnapshotIndex(0) returns D1 and D4, in order — both name snapshotIndex 0');

        const bySnapshot1 = findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, 1);
        assert(bySnapshot1.length === 1 && bySnapshot1[0] === D2, '16. findBySnapshotIndex(1) returns exactly D2');

        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, 2).length === 0, '17. findBySnapshotIndex(2) finds nothing — no decision was ever recorded naming snapshotIndex 2 in this history');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, 'not a number').length === 0, '18. a malformed snapshotIndex finds nothing, never throws');

        // D3 (CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT) carries no snapshotIndex
        // field at all — it must never spuriously match any snapshotIndex
        // search, including undefined.
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, undefined).length === 0, '19. searching by an undefined snapshotIndex never matches D3\'s missing field');

        const byObserve = findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition(history, 'OBSERVE');
        assert(byObserve.length === 3 && byObserve[0] === D1 && byObserve[1] === D3 && byObserve[2] === D4, '20. findByDisposition(OBSERVE) returns D1, D3, D4 in order');

        const byDefer = findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition(history, 'DEFER');
        assert(byDefer.length === 1 && byDefer[0] === D2, '21. findByDisposition(DEFER) returns exactly D2');

        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition(history, 'ACCEPT').length === 0, '22. findByDisposition(ACCEPT) finds nothing — no entry could ever carry an out-of-vocabulary disposition');
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition(history, null).length === 0, '23. a malformed disposition finds nothing, never throws');

        // D1 (claimId=B, snapshotIndex=0) and the SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM
        // shape must never be conflated — a claimId search never matches an
        // entry whose candidate carries no claimId field, and vice versa.
        assert(findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, undefined).length === 0, '24. searching by an undefined claimId never spuriously matches anything');
    }
    console.log('✓ Section C: findByClaimId/findBySnapshotIndex/findByDisposition are exact, order-preserving lookups that never conflate the three candidate shapes\' differing fields');

    // ---------------------------------------------------------------
    // Section D — architecture: no imports, no forbidden vocabulary, no
    // mutation, determinism, zero network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '25. this file imports nothing at all');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbiddenVocabulary = ['resolved', 'pending', 'stale', 'approved', 'rejected', 'fraud', 'conflict', 'trusted', 'confidence', 'reputation', 'severity', 'authoritative', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'mutate', 'timeline', 'statistics', 'count'];
        const codeOnlyLower = codeOnly.toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!codeOnlyLower.includes(word), `26. this file's own code never carries "${word}"`);
        }

        const historyJsonBefore = serialize(history);
        const d1JsonBefore = serialize(D1);
        appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, claimB.id);
        findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, 0);
        findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition(history, 'OBSERVE');
        assert(serialize(history) === historyJsonBefore, '27. no operation ever mutates the supplied history');
        assert(serialize(D1) === d1JsonBefore, '28. no operation ever mutates a decision record handed in');

        const firstAppend = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D2);
        const secondAppend = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D2);
        assert(serialize(firstAppend) === serialize(secondAppend), '29. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(firstAppend), '30. the returned history is frozen');

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1));
        assert(networkCallOccurred === false, '31. appending a decision performs zero network access');
        assert(result.length === history.length + 1, '32. sanity — the append itself genuinely occurred');
    }
    console.log('✓ Section D: no imports, no forbidden interpreted-state or action vocabulary, no mutation of history or its entries, deterministic, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
