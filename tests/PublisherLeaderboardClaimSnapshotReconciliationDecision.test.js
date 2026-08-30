import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.145 — Explicit Reconciliation Decision Record.
//
// Section A: malformed input tolerance — invalid selection, invalid
//            decision vocabulary, missing/invalid decidedAt, all read
//            explicit outcomes, never throw
// Section B: FLAGSHIP — Claim B genuinely diverges against BOTH S2 and S3;
//            Claim C has no corresponding snapshot; Snapshot S4 has no
//            corresponding claim. Deciding on B<->S2 and B<->S3 produces
//            two distinct records; deciding on a tampered-signature-only
//            claim is never possible under either type.
// Section C: architecture — exactly one import, no forbidden vocabulary,
//            no mutation, determinism, zero network access

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

const DECIDED_AT = new Date('2026-08-30T05:00:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — tolerance and shape.
    // ---------------------------------------------------------------
    {
        const emptyPlan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(undefined, undefined, new LocalAuthorizationVerifier());

        for (const malformedSelection of [null, undefined, 42, 'not a selection', { type: 'SOMETHING_MADE_UP' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecision(emptyPlan, malformedSelection, 'DEFER', DECIDED_AT);
            assert(result.decided === false && result.outcome === 'INVALID_SELECTION', `1. an invalid selection (${JSON.stringify(malformedSelection)}) reads INVALID_SELECTION and produces no decision record`);
        }

        for (const malformedPlan of [null, 42, 'not a plan']) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecision(malformedPlan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'x', snapshotIndex: 0 }, 'DEFER', DECIDED_AT);
            assert(result.decided === false && result.outcome === 'INVALID_SELECTION', `2. a malformed plan (${JSON.stringify(malformedPlan)}) reads INVALID_SELECTION, never throws`);
        }

        assert(Object.isFrozen(describePublisherLeaderboardClaimSnapshotReconciliationDecision(emptyPlan, null, 'DEFER', DECIDED_AT)), '3. an INVALID_SELECTION result is frozen');
    }
    console.log('✓ Section A (part 1): an invalid selection always reads INVALID_SELECTION before any decision vocabulary or decidedAt is even considered');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   Divergent: B <-> S2, B <-> S3 (B corresponds to and diverges
    //              against BOTH supplied snapshots)
    //   Claims without snapshot: C
    //   Snapshots without claim: S4
    // ---------------------------------------------------------------
    let plan, claimB, claimC, verifier;
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
        verifier = new LocalAuthorizationVerifier();
        plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

        // 1. Explicitly decide DEFER on B <-> S2.
        const decideBS2Defer = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', DECIDED_AT);
        assert(decideBS2Defer.decided === true && decideBS2Defer.decision === 'DEFER', '4. FLAGSHIP — deciding DEFER on B<->S2 produces a genuine decision record');
        assert(decideBS2Defer.candidate.type === 'DIVERGENT_CORRESPONDENCE' && decideBS2Defer.candidate.claimId === claimB.id && decideBS2Defer.candidate.snapshotIndex === 0, '5. FLAGSHIP — the record embeds 0.8.144\'s own candidate for B<->S2 by value');
        assert(decideBS2Defer.decidedAt === DECIDED_AT.toISOString(), '6. FLAGSHIP — decidedAt is serialized to the exact ISO string of the supplied Date');
        assert(Object.isFrozen(decideBS2Defer), '7. FLAGSHIP — the decision record is frozen');

        // 2. Explicitly decide OBSERVE on B <-> S3 -> a DIFFERENT record.
        const decideBS3Observe = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'OBSERVE', DECIDED_AT);
        assert(decideBS3Observe.decided === true && decideBS3Observe.decision === 'OBSERVE' && decideBS3Observe.candidate.snapshotIndex === 1, '8. FLAGSHIP — deciding OBSERVE on B<->S3 produces a genuine, DIFFERENT record naming snapshotIndex 1');
        assert(serialize(decideBS2Defer) !== serialize(decideBS3Observe), '9. FLAGSHIP — the two decisions on B<->S2 and B<->S3 are two distinct records, never one shared record');

        // 3. Selecting B <-> S4 (a relationship that does not exist) -> no
        //    decision record, regardless of a valid decision/decidedAt.
        const decideBS4 = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 2 }, 'DEFER', DECIDED_AT);
        assert(decideBS4.decided === false && decideBS4.outcome === 'INVALID_SELECTION', '10. FLAGSHIP — deciding on a non-existent B<->S4 relationship reads INVALID_SELECTION, never a record');

        // 4. Decide DEFER on unmatched Claim C.
        const decideC = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', DECIDED_AT);
        assert(decideC.decided === true && decideC.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT' && decideC.candidate.claimId === claimC.id, '11. FLAGSHIP — deciding DEFER on unmatched Claim C produces a genuine record');

        // 5. Decide OBSERVE on unmatched Snapshot S4.
        const decideS4 = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', DECIDED_AT);
        assert(decideS4.decided === true && decideS4.candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM' && decideS4.candidate.snapshotIndex === 2, '12. FLAGSHIP — deciding OBSERVE on unmatched Snapshot S4 produces a genuine record');

        // 6. An unrecognized decision vocabulary word, including ACCEPT/REJECT,
        //    reads INVALID_DECISION even against a genuinely valid selection.
        for (const badDecision of ['ACCEPT', 'REJECT', 'RESOLVE', 'observe', 'defer', '', null, undefined, 42]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, badDecision, DECIDED_AT);
            assert(result.decided === false && result.outcome === 'INVALID_DECISION', `13. an unrecognized decision vocabulary word (${JSON.stringify(badDecision)}) reads INVALID_DECISION against an otherwise valid selection`);
        }

        // 7. A missing or invalid decidedAt reads INVALID_DECIDED_AT even
        //    against a genuinely valid selection and decision.
        for (const badDecidedAt of [null, undefined, 'not a date', new Date('not a date'), NaN]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', badDecidedAt);
            assert(result.decided === false && result.outcome === 'INVALID_DECIDED_AT', `14. an invalid decidedAt (${String(badDecidedAt)}) reads INVALID_DECIDED_AT against an otherwise valid selection/decision`);
        }

        // 8. A tampered-signature-only claim is never a decision candidate
        //    under either type — 0.8.143's/0.8.144's own exclusion, inherited
        //    here for free.
        const dave = makeIdentity('Dave');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claimTampered = tamper(signedClaim(dave, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) }));
        const planWithTampered = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordFor(claimTampered)], [s1], verifier);

        const decideTamperedAsDivergent = describePublisherLeaderboardClaimSnapshotReconciliationDecision(planWithTampered, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimTampered.id, snapshotIndex: 0 }, 'DEFER', DECIDED_AT);
        assert(decideTamperedAsDivergent.decided === false && decideTamperedAsDivergent.outcome === 'INVALID_SELECTION', '15. FLAGSHIP — a claim whose only problem is a tampered signature can never receive a decision record as DIVERGENT_CORRESPONDENCE');

        const decideTamperedAsUnmatched = describePublisherLeaderboardClaimSnapshotReconciliationDecision(planWithTampered, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimTampered.id }, 'DEFER', DECIDED_AT);
        assert(decideTamperedAsUnmatched.decided === false && decideTamperedAsUnmatched.outcome === 'INVALID_SELECTION', '16. FLAGSHIP — the same claim can also never receive a decision record as CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');

        // 9. Creating a decision for B<->S2 must not alter the plan, claim
        //    history, snapshot, or archive — nor does it disturb B<->S3 as a
        //    completely separate candidate.
        const planJsonBefore = serialize(plan);
        describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', DECIDED_AT);
        assert(serialize(plan) === planJsonBefore, '17. FLAGSHIP — recording a decision for B<->S2 never alters the plan it was read from');

        const decideBS3Again = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'OBSERVE', DECIDED_AT);
        assert(serialize(decideBS3Again) === serialize(decideBS3Observe), '18. FLAGSHIP — B<->S3 remains a completely separate, independently reproducible candidate regardless of what was decided about B<->S2');
    }
    console.log('✓ Section B: FLAGSHIP — DEFER on B<->S2 and OBSERVE on B<->S3 produce two distinct decision records, unmatched Claim C and Snapshot S4 are decidable, a non-existent B<->S4 relationship and a tampered-signature-only claim never receive a decision record, ACCEPT/REJECT and other unrecognized vocabulary read INVALID_DECISION, a missing/invalid decidedAt reads INVALID_DECIDED_AT, and no decision ever mutates the plan');

    // ---------------------------------------------------------------
    // Section C — architecture, no mutation, determinism, vocabulary,
    // network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1 && importLines[0].includes("'./PublisherLeaderboardClaimSnapshotReconciliation.js'"), '19. this file imports exactly one thing — 0.8.144\'s own selection boundary, nothing else');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbiddenVocabulary = ['fraud', 'invalidclaim', 'conflict', 'regression', 'improved', 'regressed', 'trend', 'trusted', 'confidence', 'reputation', 'severity', 'score', 'rank', 'quality', 'remediation', 'authoritative', 'best', 'closest', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'resolve', 'apply', 'winner', 'execute', 'mutate'];
        const codeOnlyLower = codeOnly.toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!codeOnlyLower.includes(word), `20. this file's own code never carries "${word}"`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claimAlice = signedClaim(alice, { evidenceFingerprint: E_WRONG, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const localVerifier = new LocalAuthorizationVerifier();
        const localPlan = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordFor(claimAlice)], [s1], localVerifier);

        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimAlice.id, snapshotIndex: 0 };
        const planJsonBefore = serialize(localPlan);
        const selectionJsonBefore = serialize(selection);
        describePublisherLeaderboardClaimSnapshotReconciliationDecision(localPlan, selection, 'DEFER', DECIDED_AT);
        assert(serialize(localPlan) === planJsonBefore, '21. the supplied plan is never mutated');
        assert(serialize(selection) === selectionJsonBefore, '22. the supplied selection is never mutated');

        const first = describePublisherLeaderboardClaimSnapshotReconciliationDecision(localPlan, selection, 'DEFER', DECIDED_AT);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationDecision(localPlan, selection, 'DEFER', DECIDED_AT);
        assert(serialize(first) === serialize(second), '23. repeated calls with identical input (including an identical Date instant) are byte-identical');
        assert(Object.isFrozen(first), '24. the result is frozen');

        // A string-form decidedAt equivalent to the same instant produces the
        // identical serialized decidedAt as the Date instance.
        const fromIsoString = describePublisherLeaderboardClaimSnapshotReconciliationDecision(localPlan, selection, 'DEFER', DECIDED_AT.toISOString());
        assert(fromIsoString.decidedAt === first.decidedAt, '25. an ISO-string decidedAt equivalent to a Date instance produces the identical serialized decidedAt');

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotReconciliationDecision(localPlan, selection, 'DEFER', DECIDED_AT));
        assert(networkCallOccurred === false, '26. recording a decision performs zero network access');
        assert(result.decided === true, '27. sanity — the result itself is genuine');
    }
    console.log('✓ Section C: exactly one import (0.8.144\'s own selection boundary), no forbidden action/policy vocabulary, no mutation, deterministic given an explicit decidedAt, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecision tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecision.test.js FAILED:', error);
    process.exitCode = 1;
});
