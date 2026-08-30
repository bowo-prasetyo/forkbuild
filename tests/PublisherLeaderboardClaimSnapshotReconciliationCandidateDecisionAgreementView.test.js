import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.156 — Reconciliation Candidate Decision Agreement Projection.
//
// Section A: empty vs empty — a fully converged, empty agreement
// Section B: converged histories — structurally identical decisions on
//            both sides are entirely shared, zero exclusive
// Section C: FLAGSHIP — candidate presence computed independently of
//            decision-level agreement: C1 is a SHARED candidate even though
//            each side also holds its own exclusive decision about it
// Section D: same candidate, different decisions (OBSERVE vs DEFER) — the
//            candidate is shared, but zero decisions about it are shared
// Section E: same candidate, same decision, different decidedAt — likewise
//            shared candidate, zero shared decisions
// Section F: multiplicity in the shared multiset itself — [D1,D1] vs
//            [D1,D1,D1] reports sharedDecisionCount 2, never 3 (min) and
//            never a naive membership check
// Section G: different candidate types never collide merely because they
//            share a numeric/string field
// Section H: no mutation, frozen results, determinism
// Section I: reconstruct()'s archive-reading boundary
// Section J: malformed input tolerance
// Section K: vocabulary/import boundary

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

// The identical four-scenario world 0.8.144/0.8.149/0.8.153/0.8.154/0.8.155's
// own tests already use: Claim B genuinely diverges against both S2 and S3,
// Claim C has no corresponding snapshot, Snapshot S4 (index 2) has no
// corresponding claim.
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

const T1 = new Date('2026-08-30T06:00:00Z');
const T2 = new Date('2026-08-30T06:03:00Z');
const T3 = new Date('2026-08-30T06:07:00Z');
const T4 = new Date('2026-08-30T06:09:00Z');
const T5 = new Date('2026-08-30T06:11:00Z');

function candidateAgreementFor(result, candidate) {
    return result.candidateAgreements.find((entry) => serialize(entry.candidate) === serialize(candidate));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement([], []);
        assert(result.sameHistory === true, '1. two empty histories report sameHistory');
        assert(result.sourceDecisionCount === 0 && result.targetDecisionCount === 0, '2. zero raw decision counts on each side');
        assert(result.sharedDecisionCount === 0 && result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '3. zero shared/exclusive decision counts');
        assert(result.sharedDecisions.length === 0 && result.sourceOnly.length === 0 && result.targetOnly.length === 0, '4. sharedDecisions/sourceOnly/targetOnly are empty arrays');
        assert(result.distinctCandidateCount === 0 && result.sharedCandidateCount === 0 && result.sourceOnlyCandidateCount === 0 && result.targetOnlyCandidateCount === 0, '5. zero candidate-level counts');
        assert(result.candidateAgreements.length === 0, '6. candidateAgreements is an empty array');
        assert(Object.isFrozen(result), '7. an empty result is frozen');
    }
    console.log('✓ Section A: two empty histories produce a fully converged, empty agreement');

    // ---------------------------------------------------------------
    // Section B — converged histories: structurally identical decisions on
    // both sides are entirely shared.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };

        const sourceHistory = historyOf(decide(plan, c1, 'OBSERVE', T1), decide(plan, c2, 'DEFER', T2));
        const targetHistory = historyOf(decide(plan, c1, 'OBSERVE', T1), decide(plan, c2, 'DEFER', T2));

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory, targetHistory);
        assert(result.sameHistory === true, '8. structurally identical histories converge');
        assert(result.sourceDecisionCount === 2 && result.targetDecisionCount === 2, '9. raw decision counts are still reported');
        assert(result.sharedDecisionCount === 2, '10. both decisions are shared');
        assert(result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '11. no exclusive decisions on either side');
        assert(result.distinctCandidateCount === 2 && result.sharedCandidateCount === 2, '12. both candidates are shared, none exclusive');
        assert(result.sourceOnlyCandidateCount === 0 && result.targetOnlyCandidateCount === 0, '13. no exclusive candidates');
        assert(result.candidateAgreements.length === 2, '14. two candidate agreement groups');
        for (const entry of result.candidateAgreements) {
            assert(entry.sharedDecisionCount === 1 && entry.sourceOnlyDecisionCount === 0 && entry.targetOnlyDecisionCount === 0, '15. each candidate agreement group carries exactly one shared decision and zero exclusive decisions');
        }
    }
    console.log('✓ Section B: converged histories report every decision and candidate as shared, zero exclusive');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: candidate presence is computed independently of
    // decision-level agreement.
    //
    //   Alice (source): C1/OBSERVE/T1, C1/DEFER/T2, C2/OBSERVE/T3
    //   Bob   (target): C1/OBSERVE/T1, C1/DEFER/T4, C3/DEFER/T5
    //
    //   Shared decision:   C1/OBSERVE/T1
    //   Alice-exclusive:   C1/DEFER/T2, C2/OBSERVE/T3
    //   Bob-exclusive:     C1/DEFER/T4, C3/DEFER/T5
    //
    //   C1 is a SHARED CANDIDATE (present on both replicas) even though it
    //   ALSO carries one exclusive decision per side — this is the fact this
    //   milestone exists to make observable. C2 is source-only, C3 is
    //   target-only, at BOTH the candidate level and the decision level.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const c3 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };

        const c1ObserveT1 = decide(plan, c1, 'OBSERVE', T1);
        const c1DeferT2 = decide(plan, c1, 'DEFER', T2);
        const c2ObserveT3 = decide(plan, c2, 'OBSERVE', T3);
        const c1DeferT4 = decide(plan, c1, 'DEFER', T4);
        const c3DeferT5 = decide(plan, c3, 'DEFER', T5);

        const aliceHistory = historyOf(c1ObserveT1, c1DeferT2, c2ObserveT3);
        const bobHistory = historyOf(c1ObserveT1, c1DeferT4, c3DeferT5);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(aliceHistory, bobHistory);

        assert(result.sameHistory === false, '16. FLAGSHIP — Alice and Bob genuinely differ');
        assert(result.sourceDecisionCount === 3 && result.targetDecisionCount === 3, '17. FLAGSHIP — raw decision counts on each side');

        // Decision-level agreement.
        assert(result.sharedDecisionCount === 1, '18. FLAGSHIP — exactly one shared decision, C1/OBSERVE/T1');
        assert(result.sharedDecisions.length === 1 && result.sharedDecisions[0] === c1ObserveT1, '19. FLAGSHIP — sharedDecisions carries the ORIGINAL source record for C1/OBSERVE/T1');
        assert(result.sourceOnlyDecisionCount === 2 && result.sourceOnly[0] === c1DeferT2 && result.sourceOnly[1] === c2ObserveT3, '20. FLAGSHIP — Alice-exclusive decisions are C1/DEFER/T2 and C2/OBSERVE/T3, in Alice\'s own order');
        assert(result.targetOnlyDecisionCount === 2 && result.targetOnly[0] === c1DeferT4 && result.targetOnly[1] === c3DeferT5, '21. FLAGSHIP — Bob-exclusive decisions are C1/DEFER/T4 and C3/DEFER/T5, in Bob\'s own order');
        assert(result.sharedDecisionCount + result.sourceOnlyDecisionCount === result.sourceDecisionCount, '22. FLAGSHIP — shared + source-only accounts for every one of Alice\'s own decisions');
        assert(result.sharedDecisionCount + result.targetOnlyDecisionCount === result.targetDecisionCount, '23. FLAGSHIP — shared + target-only accounts for every one of Bob\'s own decisions');

        // Candidate-level presence — the flagship point.
        assert(result.distinctCandidateCount === 3, '24. FLAGSHIP — three distinct candidates in total (C1, C2, C3)');
        assert(result.sharedCandidateCount === 1, '25. FLAGSHIP — exactly one SHARED candidate, C1 — present on both replicas');
        assert(result.sourceOnlyCandidateCount === 1, '26. FLAGSHIP — exactly one source-only candidate, C2');
        assert(result.targetOnlyCandidateCount === 1, '27. FLAGSHIP — exactly one target-only candidate, C3');

        // C1's own agreement group: a SHARED candidate that ALSO carries one
        // exclusive decision on each side — never described as conflicting,
        // never merged, never collapsed into "source-only" or "target-only."
        const c1Agreement = candidateAgreementFor(result, c1ObserveT1.candidate);
        assert(c1Agreement !== undefined, '28. FLAGSHIP — C1 appears in candidateAgreements exactly once');
        assert(c1Agreement.sharedDecisionCount === 1, '29. FLAGSHIP — C1 carries exactly one shared decision (OBSERVE @ T1)');
        assert(c1Agreement.sourceOnlyDecisionCount === 1, '30. FLAGSHIP — C1 ALSO carries one Alice-exclusive decision (DEFER @ T2) despite being a shared candidate');
        assert(c1Agreement.targetOnlyDecisionCount === 1, '31. FLAGSHIP — C1 ALSO carries one Bob-exclusive decision (DEFER @ T4) despite being a shared candidate');

        const c2Agreement = candidateAgreementFor(result, c2ObserveT3.candidate);
        assert(c2Agreement.sharedDecisionCount === 0 && c2Agreement.sourceOnlyDecisionCount === 1 && c2Agreement.targetOnlyDecisionCount === 0, '32. FLAGSHIP — C2 (source-only candidate) carries exactly one source-only decision, zero shared, zero target-only');

        const c3Agreement = candidateAgreementFor(result, c3DeferT5.candidate);
        assert(c3Agreement.sharedDecisionCount === 0 && c3Agreement.sourceOnlyDecisionCount === 0 && c3Agreement.targetOnlyDecisionCount === 1, '33. FLAGSHIP — C3 (target-only candidate) carries exactly one target-only decision, zero shared, zero source-only');

        assert(result.candidateAgreements.length === 3, '34. FLAGSHIP — exactly three candidate agreement groups total');
        assert(result.candidateAgreements[0].candidate.type === 'DIVERGENT_CORRESPONDENCE', '35. FLAGSHIP — C1 appears first, matching Alice\'s own first-appearance order');
    }
    console.log('✓ Section C: FLAGSHIP — a candidate (C1) can be a SHARED candidate, present on both replicas, while each replica also holds its own exclusive decision about it; candidate presence and decision-level agreement are computed independently');

    // ---------------------------------------------------------------
    // Section D — same candidate, different decisions: the candidate is
    // shared, but zero decisions about it are shared.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const aliceDecision = decide(plan, c1, 'OBSERVE', T1);
        const bobDecision = decide(plan, c1, 'DEFER', T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(historyOf(aliceDecision), historyOf(bobDecision));
        assert(result.sameHistory === false, '36. differing dispositions for the same candidate is a genuine difference');
        assert(result.sharedDecisionCount === 0, '37. zero shared decisions — OBSERVE and DEFER are distinct decision events even for the identical candidate');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === aliceDecision, '38. Alice\'s OBSERVE is source-only');
        assert(result.targetOnly.length === 1 && result.targetOnly[0] === bobDecision, '39. Bob\'s DEFER is target-only');
        assert(result.sharedCandidateCount === 1 && result.sourceOnlyCandidateCount === 0 && result.targetOnlyCandidateCount === 0, '40. the candidate itself is still SHARED — both replicas hold a decision naming it, disposition notwithstanding');
        const c1Agreement = candidateAgreementFor(result, aliceDecision.candidate);
        assert(c1Agreement.sharedDecisionCount === 0 && c1Agreement.sourceOnlyDecisionCount === 1 && c1Agreement.targetOnlyDecisionCount === 1, '41. C1\'s own agreement group shows zero shared decisions despite being a shared candidate');
    }
    console.log('✓ Section D: the same candidate decided OBSERVE on one replica and DEFER on the other is a SHARED CANDIDATE with ZERO shared decisions');

    // ---------------------------------------------------------------
    // Section E — same candidate, same decision, different decidedAt.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const early = decide(plan, c1, 'OBSERVE', T1);
        const late = decide(plan, c1, 'OBSERVE', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(historyOf(early), historyOf(late));
        assert(result.sharedDecisionCount === 0, '42. same candidate, same disposition, different decidedAt shares zero decisions');
        assert(result.sourceOnly[0] === early && result.targetOnly[0] === late, '43. neither decision cancels the other');
        assert(result.sharedCandidateCount === 1, '44. the candidate is still shared');
    }
    console.log('✓ Section E: the same candidate under the same disposition but a different decidedAt is a shared candidate with zero shared decisions');

    // ---------------------------------------------------------------
    // Section F — multiplicity in the shared multiset itself.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, c1, 'OBSERVE', T1);

        // Alice: [D1, D1]. Bob: [D1, D1, D1]. Two of Bob's three D1 copies
        // match Alice's two — sharedDecisionCount is 2 (the matched
        // multiset), never 3 (a naive "does D1 exist on both?" membership
        // check) and never 1 (a set, not multiset, intersection).
        const aliceHistory = [D1, D1];
        const bobHistory = [D1, D1, D1];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(aliceHistory, bobHistory);
        assert(result.sourceDecisionCount === 2 && result.targetDecisionCount === 3, '45. raw counts reflect each side\'s own local duplicates');
        assert(result.sharedDecisionCount === 2, '46. exactly two shared decisions — the matched multiset, never 1 (set intersection) or 3 (naive membership)');
        assert(result.sourceOnlyDecisionCount === 0, '47. Alice has no exclusive decisions — both of her D1 copies matched');
        assert(result.targetOnlyDecisionCount === 1, '48. Bob\'s third, unmatched D1 copy is target-only');
        assert(result.sharedDecisions.length === 2 && result.sharedDecisions[0] === D1 && result.sharedDecisions[1] === D1, '49. sharedDecisions carries both matched copies, from Alice\'s own history');
        const c1Agreement = candidateAgreementFor(result, D1.candidate);
        assert(c1Agreement.sharedDecisionCount === 2 && c1Agreement.targetOnlyDecisionCount === 1, '50. C1\'s own agreement group preserves the multiplicity exactly');
    }
    console.log('✓ Section F: multiplicity in the shared multiset itself is preserved — [D1,D1] vs [D1,D1,D1] reports exactly two shared decisions, never a set-style collapse to one');

    // ---------------------------------------------------------------
    // Section G — different candidate types never collide merely because
    // they share a numeric/string field.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const claimOnly = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const snapshotOnly = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };
        const divergent = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };

        const dClaimOnly = decide(plan, claimOnly, 'OBSERVE', T1);
        const dSnapshotOnly = decide(plan, snapshotOnly, 'OBSERVE', T1);
        const dDivergent = decide(plan, divergent, 'OBSERVE', T1);

        const sourceHistory = historyOf(dClaimOnly, dSnapshotOnly, dDivergent);
        const targetHistory = historyOf(dClaimOnly, dSnapshotOnly, dDivergent);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory, targetHistory);

        assert(result.sharedDecisionCount === 3, '51. all three differently typed decisions are shared, never collapsed by a shared numeric/string field across types');
        assert(result.sharedCandidateCount === 3, '52. all three are distinct shared candidates');
        assert(result.candidateAgreements.length === 3, '53. three separate candidate agreement groups');
        for (const decision of [dClaimOnly, dSnapshotOnly, dDivergent]) {
            const agreement = candidateAgreementFor(result, decision.candidate);
            assert(agreement && agreement.sharedDecisionCount === 1, `54. candidate type ${decision.candidate.type} is its own independent group carrying exactly one shared decision`);
        }
    }
    console.log('✓ Section G: CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT, SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM, and DIVERGENT_CORRESPONDENCE never collide merely because they happen to share a numeric/string field');

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const sourceHistory = [D1, D2];
        const targetHistory = [D1];
        const sourceJsonBefore = serialize(sourceHistory);
        const targetJsonBefore = serialize(targetHistory);
        const d1JsonBefore = serialize(D1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory, targetHistory);

        assert(serialize(sourceHistory) === sourceJsonBefore, '55. the source history is never mutated');
        assert(serialize(targetHistory) === targetJsonBefore, '56. the target history is never mutated');
        assert(serialize(D1) === d1JsonBefore, '57. the original decision record is never mutated');
        assert(result.sharedDecisions[0] === D1, '58. sharedDecisions holds the ORIGINAL decision object, never a reconstructed copy');

        assert(Object.isFrozen(result), '59. the result is frozen');
        assert(Object.isFrozen(result.sharedDecisions), '60. sharedDecisions is frozen');
        assert(Object.isFrozen(result.sourceOnly), '61. sourceOnly is frozen');
        assert(Object.isFrozen(result.targetOnly), '62. targetOnly is frozen');
        assert(Object.isFrozen(result.candidateAgreements), '63. candidateAgreements is frozen');
        assert(Object.isFrozen(result.candidateAgreements[0]), '64. each candidate agreement entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory, targetHistory);
        assert(serialize(again) === serialize(result), '65. repeated calls on identical inputs are byte-identical');
    }
    console.log('✓ Section H: neither input history nor any original decision record is mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section I — reconstruct()'s archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c1, 'DEFER', T2);
        const D3 = decide(plan, c2, 'OBSERVE', T3);

        const aliceHistory = historyOf(D1, D2);
        const bobHistory = historyOf(D1, D3);
        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(aliceHistory, bobHistory);

        let aliceArchive = PublicationObservationArchive.empty();
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D1);
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D2);
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendReconciliationDecisionRecord(D1);
        bobArchive = bobArchive.appendReconciliationDecisionRecord(D3);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(aliceArchive, bobArchive);
        assert(serialize(reconstructed) === serialize(described), '66. reconstruct() over archives holding the SAME decisions agrees exactly with describe() over the equivalent raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement([], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '67. reconstruct() over two empty archives agrees exactly with describe() over two empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '68. reconstruct() over invalid/missing archives degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section I: reconstruct() reads only each archive\'s own stored decision history, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section J — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement().sameHistory === true, '69. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(null, undefined).sameHistory === true, '70. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement('not an array', 42).sameHistory === true, '71. malformed non-array histories degrade to empty, never throw');

        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, D1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(mixed, [D1]);
        assert(result.sourceDecisionCount === 1, '72. non-genuine entries are silently excluded, leaving only the one genuine decision on the source side');
        assert(result.sharedDecisionCount === 1 && result.sharedDecisions[0] === D1, '73. the sole surviving genuine decision matches correctly against a clean target');
    }
    console.log('✓ Section J: malformed/absent input degrades to a valid, empty/converged result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(historyOf(D1), historyOf(D1));

        const topKeys = Object.keys(result).sort();
        const expectedKeys = [
            'sourceDecisionCount', 'targetDecisionCount',
            'sharedDecisionCount', 'sourceOnlyDecisionCount', 'targetOnlyDecisionCount',
            'sharedDecisions', 'sourceOnly', 'targetOnly',
            'distinctCandidateCount', 'sharedCandidateCount',
            'sourceOnlyCandidateCount', 'targetOnlyCandidateCount',
            'candidateAgreements', 'sameHistory'
        ].sort();
        assert(serialize(topKeys) === serialize(expectedKeys), '74. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.candidateAgreements[0]).sort();
        assert(serialize(groupKeys) === serialize(['candidate', 'sharedDecisionCount', 'sourceOnlyDecisionCount', 'targetOnlyDecisionCount'].sort()), '75. a candidate agreement entry carries exactly the documented, factual fields');

        const forbidden = ['conflict', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect', 'latest', 'current', 'final'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term), `76. the result never carries interpretive/conflict vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'signature', 'verify'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `77. this file's own code never carries "${term}"`);
        }

        // This milestone must import only 0.8.149 (decision-level
        // difference), 0.8.150's own archive-reading seam, and 0.8.154 (the
        // candidate grouping) — nothing from 0.8.144/0.8.145/0.8.146/0.8.151
        // through 0.8.153, 0.8.155.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 3, '78. this file imports from exactly three modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js'), '79. one import is 0.8.149\'s own decision history difference module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js'), '80. one import is 0.8.154\'s own candidate decision evolution module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js'), '81. one import is 0.8.150\'s own archive-reading seam');
        assert(!codeOnly.includes('decisioncandidatecorrespondenceview') && !codeOnly.includes('reconciliationplanview') && !codeOnly.includes('reconciliationdecision.js') && !codeOnly.includes('decisionhistory.js') && !codeOnly.includes('decisionhistoryexchange') && !codeOnly.includes('decisionhistorysynchronization') && !codeOnly.includes('evolutiondifferenceview'), '82. this file never imports 0.8.144/0.8.145/0.8.146/0.8.151/0.8.152/0.8.153/0.8.155 directly');
    }
    console.log('✓ Section K: the result carries no interpretive or conflict-resolution vocabulary, and the module imports only 0.8.149\'s decision-level difference, 0.8.150\'s archive-reading seam, and 0.8.154\'s candidate grouping, nothing else from the reconciliation family');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView.test.js FAILED:', error);
    process.exitCode = 1;
});
