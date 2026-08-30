import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.157 — Historical Reconciliation Decision-to-Plan Candidate
// Revalidation Projection.
//
// Section A: input validation — null/malformed decision, null/non-array
//            plan, malformed plan entries; never throws
// Section B: the three candidate types, each correctly revalidated against
//            a genuine plan that does/does not carry them
// Section C: exact identity — C1+S1 and C1+S2 remain distinct; a
//            CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT and a
//            SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM never collide merely
//            because they carry the identical numeric/string field value
// Section D: FLAGSHIP — historical decision vs. a later, caller-supplied
//            plan: the SAME decision reads candidateMatchesPlan true
//            against the plan it was recorded against, and false against a
//            later plan where the candidate no longer appears, while the
//            decision itself never changes
// Section E: decision disposition independence — OBSERVE vs. DEFER never
//            affects candidate matching
// Section F: candidate multiplicity — a plan naming the same candidate
//            more than once is still a single present/absent fact, never a
//            manufactured multiple match
// Section G: immutability — frozen output, no mutation of decision,
//            candidate, or plan
// Section H: determinism
// Section I: architectural regression — no forbidden vocabulary, no
//            rediscovery of 0.8.144's own matching logic, exactly one
//            import, no reconstructXxx() entry point

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

function decide(plan, selection, disposition, decidedAt) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, disposition, decidedAt);
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');

// The identical four-scenario world 0.8.144/0.8.153/0.8.156's own tests
// already use: Claim B genuinely diverges against both S2 (index 0) and S3
// (index 1), Claim C has no corresponding snapshot, Snapshot S4 (index 2)
// has no corresponding claim.
function buildWorld() {
    const bob = makeIdentity('Bob');
    const carl = makeIdentity('Carl');

    const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
    const snapshots = [s2, s3, s4];

    const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
    const claimC = signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

    const claimHistory = [recordFor(claimB), recordFor(claimC)];
    const verifier = new LocalAuthorizationVerifier();
    const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

    return { plan, claimB, claimC };
}

// A later plan where Claim B is only ever compared against S2 (index 0) —
// its own correspondence against S3 (0.8.143's own snapshot index 1 in
// `buildWorld()`) simply no longer exists in this plan, exactly as a
// snapshot sequence a caller supplies later might drop a snapshot entirely.
function buildLaterPlanWithoutSecondSnapshot(claimB) {
    const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const snapshots = [s2];
    const claimHistory = [recordFor(claimB)];
    const verifier = new LocalAuthorizationVerifier();
    return describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — input validation.
    // ---------------------------------------------------------------
    {
        const { plan } = buildWorld();

        const nullDecision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(null, plan);
        assert(nullDecision.decision === null, '1. a null decision record produces decision: null');
        assert(nullDecision.candidatePresent === false, '2. a null decision record reports candidatePresent: false');
        assert(nullDecision.candidateType === null, '3. a null decision record reports candidateType: null');
        assert(nullDecision.candidateMatchesPlan === false, '4. a null decision record reports candidateMatchesPlan: false');

        const undefinedDecision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(undefined, plan);
        assert(undefinedDecision.decision === null, '5. an undefined decision record degrades identically to null, never throws');

        const notAnObject = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation('not a decision', plan);
        assert(notAnObject.decision === null, '6. a non-object decision record degrades to decision: null, never throws');

        const notDecided = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation({ decided: false, outcome: 'INVALID_SELECTION' }, plan);
        assert(notDecided.decision === null, '7. a { decided: false } outcome is never treated as a genuine decision record');

        const missingCandidate = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation({ decided: true, decision: 'OBSERVE', decidedAt: T1.toISOString() }, plan);
        assert(missingCandidate.decision === null, '8. a decision record with no candidate degrades to decision: null');

        const badDisposition = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation({ decided: true, candidate: { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'x', snapshotIndex: 0 }, decision: 'ACCEPT', decidedAt: T1.toISOString() }, plan);
        assert(badDisposition.decision === null, '9. an unrecognized disposition ("ACCEPT") is never treated as a genuine decision record');

        const missingDecidedAt = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation({ decided: true, candidate: { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'x', snapshotIndex: 0 }, decision: 'OBSERVE' }, plan);
        assert(missingDecidedAt.decision === null, '10. a decision record with no decidedAt degrades to decision: null');

        const genuine = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'anything' }, 'OBSERVE', T1);

        const nullPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(genuine, null);
        assert(nullPlan.candidatePresent === false && nullPlan.candidateMatchesPlan === false, '11. a null plan reads candidatePresent/candidateMatchesPlan: false, never throws');
        assert(serialize(nullPlan.decision) === serialize(genuine), '12. a null plan still echoes the genuine decision record unchanged');

        const undefinedPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(genuine, undefined);
        assert(undefinedPlan.candidatePresent === false, '13. an undefined plan degrades identically to null, never throws');

        const nonObjectPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(genuine, 'not a plan');
        assert(nonObjectPlan.candidatePresent === false, '14. a non-object plan degrades to candidatePresent: false, never throws');

        const nonArrayListsPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(genuine, { claimsWithoutCorrespondence: 'not an array', divergentCorrespondences: 42, snapshotsWithoutCorrespondence: null });
        assert(nonArrayListsPlan.candidatePresent === false, '15. a plan whose relevant list is not a genuine array degrades to candidatePresent: false, never throws');

        const malformedEntries = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(genuine, { claimsWithoutCorrespondence: [{}, { claimId: 'someone else' }, { claimId: 42 }, { unexpectedField: true }] });
        assert(malformedEntries.candidatePresent === false, '16. a plan whose list entries are malformed or non-matching degrades to candidatePresent: false, never throws');
    }
    console.log('✓ Section A: malformed/absent decision records and plans degrade to explicit, non-throwing outcomes');

    // ---------------------------------------------------------------
    // Section B — the three candidate types, each correctly revalidated.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();

        const D_DIVERGENT = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const rDivergent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_DIVERGENT, plan);
        assert(rDivergent.candidateType === 'DIVERGENT_CORRESPONDENCE', '17. DIVERGENT_CORRESPONDENCE candidateType is preserved');
        assert(rDivergent.candidatePresent === true && rDivergent.candidateMatchesPlan === true, '18. a genuine DIVERGENT_CORRESPONDENCE candidate is present in the plan it was drawn from');

        const D_CLAIM = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T1);
        const rClaim = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_CLAIM, plan);
        assert(rClaim.candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '19. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidateType is preserved');
        assert(rClaim.candidatePresent === true && rClaim.candidateMatchesPlan === true, '20. a genuine CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate is present in the plan it was drawn from');

        const D_SNAPSHOT = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T1);
        const rSnapshot = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_SNAPSHOT, plan);
        assert(rSnapshot.candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '21. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidateType is preserved');
        assert(rSnapshot.candidatePresent === true && rSnapshot.candidateMatchesPlan === true, '22. a genuine SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate is present in the plan it was drawn from');

        const emptyPlan = Object.freeze({ divergentCorrespondences: [], claimsWithoutCorrespondence: [], snapshotsWithoutCorrespondence: [] });
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_DIVERGENT, emptyPlan).candidatePresent === false, '23. an empty plan reports every candidate type as absent');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_CLAIM, emptyPlan).candidatePresent === false, '24. an empty plan reports CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT as absent');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_SNAPSHOT, emptyPlan).candidatePresent === false, '25. an empty plan reports SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM as absent');
    }
    console.log('✓ Section B: all three candidate types are correctly revalidated as present against their own plan, and absent against an empty plan');

    // ---------------------------------------------------------------
    // Section C — exact identity: C1+S1 vs. C1+S2 remain distinct; a
    // claim-shaped candidate and a snapshot-shaped candidate never collide
    // merely because they share a numeric/string field value.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();

        const D_S1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D_S2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'OBSERVE', T1);

        const rS1 = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_S1, plan);
        const rS2 = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_S2, plan);
        assert(rS1.candidatePresent === true && rS2.candidatePresent === true, '26. the same claimId against two different snapshotIndex values are BOTH present in the full plan');

        // A plan that has since dropped the second snapshot: C1+S1 (index 0)
        // still exists; C1+S2 (index 1) no longer does. Distinct identities
        // must be revalidated independently.
        const laterPlan = buildLaterPlanWithoutSecondSnapshot(claimB);
        const rS1Later = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_S1, laterPlan);
        const rS2Later = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_S2, laterPlan);
        assert(rS1Later.candidatePresent === true, '27. C1+S1 remains present in a later plan that still carries snapshot index 0');
        assert(rS2Later.candidatePresent === false, '28. C1+S2 is absent from a later plan that no longer carries snapshot index 1 — dropping one identity never affects the other');

        // A CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate and a
        // SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate must never collide
        // merely because they carry the identical value under different
        // field names/types.
        const sharedValue = '7';
        const collisionPlan = Object.freeze({
            divergentCorrespondences: [],
            claimsWithoutCorrespondence: [],
            snapshotsWithoutCorrespondence: [Object.freeze({ snapshotIndex: Number(sharedValue) })]
        });
        const claimCandidateDecision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: sharedValue }, 'OBSERVE', T1);
        const rCollision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(claimCandidateDecision, collisionPlan);
        assert(rCollision.candidatePresent === false, '29. a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate never matches a snapshotsWithoutCorrespondence entry sharing the identical numeric/string value');

        const snapshotCandidateDecision = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: Number(sharedValue) }, 'OBSERVE', T1);
        const reverseCollisionPlan = Object.freeze({
            divergentCorrespondences: [],
            claimsWithoutCorrespondence: [Object.freeze({ claimId: sharedValue })],
            snapshotsWithoutCorrespondence: []
        });
        const rReverseCollision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(snapshotCandidateDecision, reverseCollisionPlan);
        assert(rReverseCollision.candidatePresent === false, '30. a SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate never matches a claimsWithoutCorrespondence entry sharing the identical numeric/string value');
    }
    console.log('✓ Section C: distinct candidate identities (C1+S1 vs. C1+S2) are revalidated independently, and claim-shaped/snapshot-shaped candidates never collide on a shared field value');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: historical decision vs. a later, caller-
    // supplied plan.
    // ---------------------------------------------------------------
    {
        const { plan: P1, claimB, claimC } = buildWorld();
        const c1s2 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 };
        const D1 = decide(P1, c1s2, 'OBSERVE', T1);
        assert(D1.decided === true, '31. sanity — D1 is a genuine decision record against P1');

        const revalidatedAgainstP1 = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D1, P1);
        assert(revalidatedAgainstP1.candidatePresent === true, '32. FLAGSHIP — D1 revalidated against P1 (the plan it was recorded against) reports candidatePresent: true');
        assert(revalidatedAgainstP1.candidateMatchesPlan === true, '33. FLAGSHIP — D1 revalidated against P1 reports candidateMatchesPlan: true');
        assert(serialize(revalidatedAgainstP1.decision) === serialize(D1), '34. FLAGSHIP — the decision is echoed unchanged: candidate, decision ("OBSERVE"), decidedAt all preserved');

        const P2 = buildLaterPlanWithoutSecondSnapshot(claimB);
        const revalidatedAgainstP2 = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D1, P2);
        assert(revalidatedAgainstP2.candidatePresent === false, '35. FLAGSHIP — the SAME D1 revalidated against a later plan P2 (which no longer carries snapshotIndex 1) reports candidatePresent: false');
        assert(revalidatedAgainstP2.candidateMatchesPlan === false, '36. FLAGSHIP — candidateMatchesPlan: false against P2');
        assert(serialize(revalidatedAgainstP2.decision) === serialize(D1), '37. FLAGSHIP — the historical decision itself remains completely unchanged: still OBSERVE, still the same decidedAt, still the same candidate — this file never rewrites history');
        assert(revalidatedAgainstP2.decision.decision === 'OBSERVE', '38. FLAGSHIP — the recorded disposition is still exactly "OBSERVE", never altered, superseded, or removed because the candidate is absent from P2');

        // Neither call implies anything was wrong, resolved, or should
        // change — both results simply carry different candidatePresent
        // facts about two different plans, side by side.
        assert(revalidatedAgainstP1.candidatePresent !== revalidatedAgainstP2.candidatePresent, '39. FLAGSHIP — the identical historical decision produces two different, independently-computed candidatePresent facts depending solely on which plan is supplied');
    }
    console.log('✓ Section D: FLAGSHIP — the identical historical decision reads candidateMatchesPlan true against the plan it was recorded against and false against a later plan lacking the candidate, while the decision record itself never changes');

    // ---------------------------------------------------------------
    // Section E — decision disposition independence.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D_OBSERVE = decide(plan, selection, 'OBSERVE', T1);
        const D_DEFER = decide(plan, selection, 'DEFER', T2);

        const rObserve = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_OBSERVE, plan);
        const rDefer = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_DEFER, plan);
        assert(rObserve.candidatePresent === rDefer.candidatePresent, '40. OBSERVE and DEFER against the identical candidate/plan report the identical candidatePresent value');
        assert(rObserve.candidateMatchesPlan === rDefer.candidateMatchesPlan, '41. OBSERVE and DEFER against the identical candidate/plan report the identical candidateMatchesPlan value');
        assert(rObserve.candidateType === rDefer.candidateType, '42. OBSERVE and DEFER against the identical candidate report the identical candidateType');

        const laterPlan = Object.freeze({ divergentCorrespondences: [], claimsWithoutCorrespondence: [], snapshotsWithoutCorrespondence: [] });
        const rObserveAbsent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_OBSERVE, laterPlan);
        const rDeferAbsent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D_DEFER, laterPlan);
        assert(rObserveAbsent.candidatePresent === false && rDeferAbsent.candidatePresent === false, '43. both OBSERVE and DEFER read candidatePresent: false identically once the candidate is absent from the supplied plan');
    }
    console.log('✓ Section E: OBSERVE vs. DEFER never affects candidate matching — matching depends only on the candidate and the supplied plan');

    // ---------------------------------------------------------------
    // Section F — candidate multiplicity: a plan naming the same candidate
    // more than once is still a single present/absent fact.
    // ---------------------------------------------------------------
    {
        const decision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'dup-claim' }, 'OBSERVE', T1);
        const duplicatedPlan = Object.freeze({
            divergentCorrespondences: [],
            claimsWithoutCorrespondence: [
                Object.freeze({ claimId: 'dup-claim' }),
                Object.freeze({ claimId: 'dup-claim' }),
                Object.freeze({ claimId: 'dup-claim' })
            ],
            snapshotsWithoutCorrespondence: []
        });
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(decision, duplicatedPlan);
        assert(result.candidatePresent === true, '44. a candidate occurring multiple times in the plan still reads candidatePresent: true');
        assert(result.candidateMatchesPlan === true, '45. a candidate occurring multiple times in the plan still reads candidateMatchesPlan: true');
        assert(typeof result.candidatePresent === 'boolean' && typeof result.candidateMatchesPlan === 'boolean', '46. multiplicity in the plan never produces a count, list, or anything other than a single boolean fact');
        assert(Object.keys(result).length === 4, '47. plan-side multiplicity never adds extra fields to the result — it stays exactly { decision, candidatePresent, candidateType, candidateMatchesPlan }');
    }
    console.log('✓ Section F: a candidate named multiple times within the supplied plan is still a single present/absent fact, never a manufactured multiple match');

    // ---------------------------------------------------------------
    // Section G — immutability.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const decisionJsonBefore = serialize(D1);
        const planJsonBefore = serialize(plan);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D1, plan);

        assert(serialize(D1) === decisionJsonBefore, '48. the original decision record is never mutated');
        assert(serialize(plan) === planJsonBefore, '49. the supplied plan is never mutated');
        assert(Object.isFrozen(result), '50. the result is frozen');
        assert(result.decision === D1, '51. the echoed decision is the original decision record itself, by reference, never a reconstructed copy');
    }
    console.log('✓ Section G: neither the decision record nor the plan is ever mutated, and the result is frozen');

    // ---------------------------------------------------------------
    // Section H — determinism.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D1, plan);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D1, plan);
        assert(serialize(once) === serialize(twice), '52. repeated calls with the identical decision/plan produce a byte-identical result');
    }
    console.log('✓ Section H: repeated calls with equivalent arguments produce byte-identical results');

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(D1, plan);

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['decision', 'candidatePresent', 'candidateType', 'candidateMatchesPlan'].sort()), '53. the result carries exactly the documented, factual top-level fields');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown', 'valid', 'invalid'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term), `54. the result never carries state-machine vocabulary ('${term}')`);
        }

        const fs = await import('node:fs/promises');
        const moduleSource = await fs.readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity', 'ranking'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `55. this file's own code never carries "${term}"`);
        }

        // Exactly one import — 0.8.144's own candidate-selection boundary,
        // reused whole. No plan-projection, decision-history, archive, or
        // verification module is ever imported.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '56. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliation.js') && !importLines[0].includes('PlanView') && !importLines[0].includes('Decision.js') && !importLines[0].includes('History'), '57. the one import is 0.8.144\'s own candidate-selection boundary, never a plan/history/archive module');
        assert(!codeOnly.includes('archive'), '58. this file never mentions an archive of any kind — it never reads current archive state to manufacture a plan');

        // No reconstructXxx() entry point at all — deliberately, per this
        // file's own header.
        const revalidationModule = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js');
        assert(typeof revalidationModule.describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation === 'function', '59. describeXxx() is exported');
        assert(revalidationModule.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation === undefined, '60. no reconstructXxx() is exported — this file never invents a way to reconstruct a plan from current archive state');

        // Never calls 0.8.145 to create a new decision.
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationdecision('), '61. this file never calls 0.8.145\'s own decision-recording function to create a new decision');
    }
    console.log('✓ Section I: the result and the module\'s own source carry no state-machine or interpretive vocabulary, the module imports exactly 0.8.144\'s own candidate-selection boundary, and it exposes no reconstructXxx() entry point');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.test.js FAILED:', error);
    process.exitCode = 1;
});
