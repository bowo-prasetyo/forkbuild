import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidate } from '../application/PublisherLeaderboardClaimSnapshotReconciliation.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.144 — Explicit Claim/Snapshot Reconciliation Decision Boundary.
//
// Section A: malformed input tolerance — no plan, no selection, unknown
//            type, incomplete selection, all read INVALID_SELECTION, never
//            throw
// Section B: FLAGSHIP — Claim B genuinely diverges against BOTH S2 and S3;
//            Claim C has no corresponding snapshot; Snapshot S4 has no
//            corresponding claim. Every explicit selection named in the
//            milestone's own seven flagship cases is exercised, including
//            the rule that a claim whose only problem is a tampered
//            signature is never a reconciliation candidate under either
//            type.
// Section C: architecture — no imports, no action/policy vocabulary, no
//            mutation, determinism, zero network access

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

const E1 = '1'.repeat(64);
const E2 = '2'.repeat(64);
const E3 = '3'.repeat(64);
const E4 = '4'.repeat(64);
const E_WRONG = '9'.repeat(64);
const ALICE = new PublisherIdentityRecord({ publisherId: 'Alice' });
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const CARL = new PublisherIdentityRecord({ publisherId: 'Carl' });
const DIANA = new PublisherIdentityRecord({ publisherId: 'Diana' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt = new Date('2026-08-30T00:00:00Z') }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

function tamper(claim) {
    const genuineJson = claim.toJSON();
    const tamperedJson = { ...genuineJson, signature: { ...genuineJson.signature, signature: genuineJson.signature.signature.split('').reverse().join('') } };
    return PublisherLeaderboardSnapshotClaim.fromJSON(tamperedJson);
}

function recordFor(claim, receivedAt = new Date('2026-08-30T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — tolerance and shape.
    // ---------------------------------------------------------------
    {
        for (const malformedPlan of [null, 42, 'not a plan']) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(malformedPlan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'x', snapshotIndex: 0 });
            assert(result.selected === false && result.outcome === 'INVALID_SELECTION', `1. a malformed plan (${JSON.stringify(malformedPlan)}) reads INVALID_SELECTION, never throws`);
        }

        const emptyPlan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(undefined, undefined, new LocalAuthorizationVerifier());

        for (const malformedSelection of [null, undefined, 42, 'not a selection']) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(emptyPlan, malformedSelection);
            assert(result.selected === false && result.outcome === 'INVALID_SELECTION', `2. selecting nothing (${JSON.stringify(malformedSelection)}) reads INVALID_SELECTION, never throws`);
        }

        const unknownType = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(emptyPlan, { type: 'SOMETHING_MADE_UP', claimId: 'x' });
        assert(unknownType.selected === false && unknownType.outcome === 'INVALID_SELECTION', '3. an unrecognized selection.type reads INVALID_SELECTION');

        const missingType = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(emptyPlan, { claimId: 'x' });
        assert(missingType.selected === false && missingType.outcome === 'INVALID_SELECTION', '4. a selection with no type at all reads INVALID_SELECTION');

        const incompleteDivergent = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(emptyPlan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'x' });
        assert(incompleteDivergent.selected === false && incompleteDivergent.outcome === 'INVALID_SELECTION', '5. DIVERGENT_CORRESPONDENCE naming a claimId but no snapshotIndex reads INVALID_SELECTION — never a guessed snapshot');

        assert(Object.isFrozen(unknownType), '6. an INVALID_SELECTION result is frozen');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotReconciliationCandidate() tolerates malformed plan/selection and never throws');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   Divergent: B <-> S2, B <-> S3 (B corresponds to and diverges
    //              against BOTH supplied snapshots)
    //   Claims without snapshot: C
    //   Snapshots without claim: S4
    // ---------------------------------------------------------------
    {
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');

        // S2 and S3 are constructed identically (same evidenceFingerprint,
        // same leaderboard), so they share the identical `snapshotFingerprint`
        // a claim can assert — the exact "two distinct snapshots can share
        // an identical snapshotFingerprint" case 0.8.139's own header already
        // names, giving Claim B two genuine corresponding supplied snapshots.
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
        const snapshots = [s2, s3, s4];

        // Claim B asserts a wrong evidenceFingerprint against S2's/S3's own
        // shared snapshotFingerprint — a genuine divergence against BOTH.
        const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        // Claim C names a snapshotFingerprint matching nothing supplied.
        const claimC = signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

        const recordB = recordFor(claimB);
        const recordC = recordFor(claimC);
        const claimHistory = [recordB, recordC];

        const verifier = new LocalAuthorizationVerifier();
        const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

        assert(plan.divergentCorrespondenceCount === 2, '7. FLAGSHIP setup — Claim B genuinely diverges against both S2 and S3');
        assert(plan.divergentCorrespondences.every((entry) => entry.claimId === claimB.id), '8. FLAGSHIP setup — both divergent entries belong to Claim B');
        assert(plan.claimsWithoutCorrespondenceCount === 1 && plan.claimsWithoutCorrespondence[0].claimId === claimC.id, '9. FLAGSHIP setup — Claim C has no corresponding snapshot');
        assert(plan.snapshotsWithoutCorrespondenceCount === 1 && plan.snapshotsWithoutCorrespondence[0].snapshotIndex === 2, '10. FLAGSHIP setup — S4 (index 2) has no corresponding claim');

        // 1. Explicitly select B <-> S2 -> candidate returned.
        const selectBS2 = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 });
        assert(selectBS2.selected === true && selectBS2.type === 'DIVERGENT_CORRESPONDENCE' && selectBS2.claimId === claimB.id && selectBS2.snapshotIndex === 0, '11. FLAGSHIP — explicitly selecting B <-> S2 returns a genuine candidate at snapshotIndex 0');
        assert(typeof selectBS2.evidenceFingerprintDiffers === 'boolean' && typeof selectBS2.policyVersionDiffers === 'boolean' && typeof selectBS2.snapshotFingerprintDiffers === 'boolean', '12. FLAGSHIP — the B<->S2 candidate carries all three *Differs facts');

        // 2. Explicitly select B <-> S3 -> a DIFFERENT candidate returned.
        const selectBS3 = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 });
        assert(selectBS3.selected === true && selectBS3.snapshotIndex === 1, '13. FLAGSHIP — explicitly selecting B <-> S3 returns a genuine, DIFFERENT candidate at snapshotIndex 1');
        assert(serialize(selectBS2) !== serialize(selectBS3), '14. FLAGSHIP — the two explicit selections produce two distinct candidates, never the same one silently reused');

        // 3. Select B <-> S4 -> INVALID_SELECTION (B never corresponds to S4).
        const selectBS4 = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 2 });
        assert(selectBS4.selected === false && selectBS4.outcome === 'INVALID_SELECTION', '15. FLAGSHIP — selecting B <-> S4 (a relationship that does not exist) reads INVALID_SELECTION');

        // 4. Select C -> unmatched-claim candidate.
        const selectC = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id });
        assert(selectC.selected === true && selectC.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT' && selectC.claimId === claimC.id, '16. FLAGSHIP — explicitly selecting Claim C returns a genuine unmatched-claim candidate');
        assert(!('snapshotIndex' in selectC) && !('evidenceFingerprintDiffers' in selectC), '17. FLAGSHIP — the unmatched-claim candidate never invents snapshotIndex or *Differs fields');

        // 5. Select S4 -> unmatched-snapshot candidate.
        const selectS4 = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 });
        assert(selectS4.selected === true && selectS4.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM' && selectS4.snapshotIndex === 2, '18. FLAGSHIP — explicitly selecting S4 returns a genuine unmatched-snapshot candidate');
        assert(!('claimId' in selectS4), '19. FLAGSHIP — the unmatched-snapshot candidate never invents a claimId field');

        // 6. Select nothing -> INVALID_SELECTION.
        const selectNothing = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, undefined);
        assert(selectNothing.selected === false && selectNothing.outcome === 'INVALID_SELECTION', '20. FLAGSHIP — selecting nothing reads INVALID_SELECTION');

        // 7. Attempt to select merely because a claim/signature is invalid
        //    -> not a reconciliation candidate. A tampered signature on a
        //    fully-corresponding, fully-agreeing claim excludes it from
        //    BOTH plan lists (0.8.143's own rule) — this file inherits that
        //    exclusion for free, with no signature-aware code of its own.
        const dave = makeIdentity('Dave');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claimTampered = tamper(signedClaim(dave, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) }));
        const recordTampered = recordFor(claimTampered);
        const planWithTampered = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordTampered], [s1], verifier);
        assert(planWithTampered.divergentCorrespondenceCount === 0 && planWithTampered.claimsWithoutCorrespondenceCount === 0, '21. sanity — a tampered-signature claim that otherwise fully agrees appears in neither plan list');

        const selectTamperedAsDivergent = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(planWithTampered, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimTampered.id, snapshotIndex: 0 });
        assert(selectTamperedAsDivergent.selected === false && selectTamperedAsDivergent.outcome === 'INVALID_SELECTION', '22. FLAGSHIP — a claim whose only problem is a tampered signature is never a DIVERGENT_CORRESPONDENCE candidate');

        const selectTamperedAsUnmatchedClaim = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(planWithTampered, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimTampered.id });
        assert(selectTamperedAsUnmatchedClaim.selected === false && selectTamperedAsUnmatchedClaim.outcome === 'INVALID_SELECTION', '23. FLAGSHIP — the same claim is also never a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate — cryptographic invalidity is never, by itself, a reconciliation relationship');
    }
    console.log('✓ Section B: FLAGSHIP — B<->S2 and B<->S3 selected as two distinct candidates, B<->S4 and Claim C and Snapshot S4 exercised, selecting nothing rejected, a tampered-signature-only claim is never a reconciliation candidate under either type');

    // ---------------------------------------------------------------
    // Section C — architecture, no mutation, determinism, vocabulary,
    // network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliation.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '24. this file has zero imports — a pure lookup over an already-supplied plan');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbiddenVocabulary = ['fraud', 'invalidclaim', 'conflict', 'regression', 'improved', 'regressed', 'trend', 'trusted', 'confidence', 'reputation', 'severity', 'score', 'rank', 'quality', 'remediation', 'authoritative', 'best', 'closest', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'resolve', 'apply', 'winner'];
        const codeOnlyLower = codeOnly.toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!codeOnlyLower.includes(word), `25. this file's own code never carries "${word}"`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claimAlice = signedClaim(alice, { evidenceFingerprint: E_WRONG, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const recordAlice = recordFor(claimAlice);
        const verifier = new LocalAuthorizationVerifier();
        const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordAlice], [s1], verifier);

        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimAlice.id, snapshotIndex: 0 };
        const planJsonBefore = serialize(plan);
        const selectionJsonBefore = serialize(selection);
        describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection);
        assert(serialize(plan) === planJsonBefore, '26. the supplied plan is never mutated');
        assert(serialize(selection) === selectionJsonBefore, '27. the supplied selection is never mutated');

        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection);
        assert(serialize(first) === serialize(second), '28. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first), '29. the result is frozen');

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection));
        assert(networkCallOccurred === false, '30. evaluating a selection performs zero network access');
        assert(result.selected === true, '31. sanity — the result itself is genuine');
    }
    console.log('✓ Section C: zero imports, no forbidden vocabulary (including no action/policy vocabulary), no mutation, deterministic, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliation tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliation.test.js FAILED:', error);
    process.exitCode = 1;
});
